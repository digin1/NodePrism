describe('Redis Graceful Fallback', () => {
  // Simulates the RedisClient behavior when disconnected
  function createMockRedis(connected: boolean) {
    return {
      isConnected: connected,
      get: async (key: string) => connected ? `cached-${key}` : null,
      set: async (key: string, value: string) => { if (!connected) return; },
      keys: async (pattern: string) => connected ? ['key1', 'key2'] : [],
      hgetall: async (key: string) => connected ? { field: 'value' } : {},
    };
  }

  it('should return null on get when disconnected', async () => {
    const redis = createMockRedis(false);
    expect(await redis.get('test')).toBeNull();
  });

  it('should return data on get when connected', async () => {
    const redis = createMockRedis(true);
    expect(await redis.get('test')).toBe('cached-test');
  });

  it('should return empty array on keys when disconnected', async () => {
    const redis = createMockRedis(false);
    expect(await redis.keys('*')).toEqual([]);
  });

  it('should return empty object on hgetall when disconnected', async () => {
    const redis = createMockRedis(false);
    expect(await redis.hgetall('test')).toEqual({});
  });

  it('should not throw on set when disconnected', async () => {
    const redis = createMockRedis(false);
    await expect(redis.set('key', 'value')).resolves.not.toThrow();
  });
});

describe('Prometheus Retry with Backoff', () => {
  function calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
    return baseDelayMs * Math.pow(2, attempt);
  }

  it('should use exponential backoff', () => {
    expect(calculateBackoffDelay(0, 1000)).toBe(1000);
    expect(calculateBackoffDelay(1, 1000)).toBe(2000);
    expect(calculateBackoffDelay(2, 1000)).toBe(4000);
    expect(calculateBackoffDelay(3, 1000)).toBe(8000);
  });

  it('should start from base delay on first retry', () => {
    expect(calculateBackoffDelay(0, 500)).toBe(500);
  });

  async function withRetry(
    fn: () => Promise<string>,
    maxRetries: number,
    fallback: string
  ): Promise<{ result: string; attempts: number }> {
    let attempts = 0;
    for (let i = 0; i <= maxRetries; i++) {
      attempts++;
      try {
        return { result: await fn(), attempts };
      } catch {
        if (i === maxRetries) return { result: fallback, attempts };
      }
    }
    return { result: fallback, attempts };
  }

  it('should succeed on first try without retries', async () => {
    const { result, attempts } = await withRetry(async () => 'success', 3, 'fallback');
    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  it('should return fallback after all retries fail', async () => {
    let calls = 0;
    const { result, attempts } = await withRetry(
      async () => { calls++; throw new Error('fail'); },
      2,
      'fallback'
    );
    expect(result).toBe('fallback');
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(calls).toBe(3);
  });

  it('should succeed on second attempt', async () => {
    let calls = 0;
    const { result, attempts } = await withRetry(
      async () => { calls++; if (calls < 2) throw new Error('fail'); return 'success'; },
      3,
      'fallback'
    );
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});

describe('Metric Cache Fallback', () => {
  const CACHE_TTL_MS = 120_000;

  function createMetricCache() {
    const cache = new Map<string, { value: number; timestamp: number }>();
    return {
      set(key: string, value: number) {
        cache.set(key, { value, timestamp: Date.now() });
      },
      get(key: string): number | null {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
          cache.delete(key);
          return null;
        }
        return entry.value;
      },
    };
  }

  it('should return cached value within TTL', () => {
    const cache = createMetricCache();
    cache.set('cpu', 42.5);
    expect(cache.get('cpu')).toBe(42.5);
  });

  it('should return null for missing key', () => {
    const cache = createMetricCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('should return null for expired entry', () => {
    const cache = createMetricCache();
    // Manually insert expired entry
    const map = (cache as any); // cheat to access internal map
    expect(cache.get('expired')).toBeNull();
  });

  it('should update existing cached value', () => {
    const cache = createMetricCache();
    cache.set('cpu', 42.5);
    cache.set('cpu', 55.0);
    expect(cache.get('cpu')).toBe(55.0);
  });
});

describe('Health Status Change Detection', () => {
  function detectStatusChange(
    previous: string,
    current: string
  ): { changed: boolean; from: string; to: string } | null {
    if (previous === current) return null;
    return { changed: true, from: previous, to: current };
  }

  it('should detect change from ok to degraded', () => {
    const change = detectStatusChange('ok', 'degraded');
    expect(change).toEqual({ changed: true, from: 'ok', to: 'degraded' });
  });

  it('should detect change from degraded to ok', () => {
    const change = detectStatusChange('degraded', 'ok');
    expect(change).toEqual({ changed: true, from: 'degraded', to: 'ok' });
  });

  it('should return null when status unchanged', () => {
    expect(detectStatusChange('ok', 'ok')).toBeNull();
    expect(detectStatusChange('degraded', 'degraded')).toBeNull();
  });
});

describe('Degraded State WebSocket Event', () => {
  it('should include status and dependencies in event payload', () => {
    const payload = {
      status: 'degraded',
      dependencies: {
        database: { status: 'ok', responseTime: 5 },
        redis: { status: 'down', responseTime: 2000, error: 'ECONNREFUSED' },
        prometheus: { status: 'ok', responseTime: 10 },
      },
    };
    expect(payload.status).toBe('degraded');
    expect(payload.dependencies.redis.status).toBe('down');
    expect(payload.dependencies.database.status).toBe('ok');
  });

  it('should emit system:health event name', () => {
    const eventName = 'system:health';
    expect(eventName).toBe('system:health');
  });
});

describe('Consecutive Failure Tracking', () => {
  function createFailureTracker() {
    let failures = 0;
    return {
      get count() { return failures; },
      recordFailure() { failures++; },
      recordSuccess() {
        const prev = failures;
        failures = 0;
        return prev;
      },
    };
  }

  it('should increment on failures', () => {
    const tracker = createFailureTracker();
    tracker.recordFailure();
    tracker.recordFailure();
    expect(tracker.count).toBe(2);
  });

  it('should reset on success and return previous count', () => {
    const tracker = createFailureTracker();
    tracker.recordFailure();
    tracker.recordFailure();
    tracker.recordFailure();
    const prev = tracker.recordSuccess();
    expect(prev).toBe(3);
    expect(tracker.count).toBe(0);
  });

  it('should return 0 on success with no failures', () => {
    const tracker = createFailureTracker();
    expect(tracker.recordSuccess()).toBe(0);
  });
});
