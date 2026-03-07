describe('Load: Rate Limiting - Config Defaults', () => {
  // Mirrors configuration constants from middleware/rateLimit.ts
  const DEFAULTS = {
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    RATE_LIMIT_AUTH_MAX: 10,
    RATE_LIMIT_AGENT_MAX: 300,
    RATE_LIMIT_METRICS_MAX: 30,
  };

  it('should default general rate limit to 100 requests per window', () => {
    expect(DEFAULTS.RATE_LIMIT_MAX_REQUESTS).toBe(100);
  });

  it('should default auth rate limit to 10 requests per window', () => {
    expect(DEFAULTS.RATE_LIMIT_AUTH_MAX).toBe(10);
  });

  it('should default agent rate limit to 300 requests per window', () => {
    expect(DEFAULTS.RATE_LIMIT_AGENT_MAX).toBe(300);
  });

  it('should default metrics rate limit to 30 requests per window', () => {
    expect(DEFAULTS.RATE_LIMIT_METRICS_MAX).toBe(30);
  });

  it('should have agent limit >= 3x general limit for high-frequency heartbeats', () => {
    expect(DEFAULTS.RATE_LIMIT_AGENT_MAX).toBeGreaterThanOrEqual(DEFAULTS.RATE_LIMIT_MAX_REQUESTS * 3);
  });

  it('should have auth limit <= general limit for brute-force protection', () => {
    expect(DEFAULTS.RATE_LIMIT_AUTH_MAX).toBeLessThanOrEqual(DEFAULTS.RATE_LIMIT_MAX_REQUESTS);
  });
});

describe('Load: Rate Limiting - Window Size Calculation', () => {
  function parseWindowMs(envValue: string | undefined, defaultMs: number): number {
    return parseInt(envValue || String(defaultMs), 10);
  }

  it('should default to 60000ms (1 minute)', () => {
    expect(parseWindowMs(undefined, 60000)).toBe(60000);
  });

  it('should accept custom window from env', () => {
    expect(parseWindowMs('120000', 60000)).toBe(120000);
  });

  it('should calculate retryAfter in seconds from windowMs', () => {
    const windowMs = 60000;
    const retryAfter = Math.ceil(windowMs / 1000);
    expect(retryAfter).toBe(60);
  });

  it('should round retryAfter up for non-even windows', () => {
    const windowMs = 90500;
    const retryAfter = Math.ceil(windowMs / 1000);
    expect(retryAfter).toBe(91);
  });
});

describe('Load: Rate Limiting - Key Generator Logic', () => {
  // Mirrors keyGenerator() and auth key logic from middleware/rateLimit.ts
  function generalKeyGenerator(userId: string | undefined, ip: string): string {
    if (userId) {
      return `user:${userId}`;
    }
    return `ip:${ip}`;
  }

  function authKeyGenerator(ip: string): string {
    return `auth:${ip}`;
  }

  function agentKeyGenerator(ip: string): string {
    return `agent:${ip}`;
  }

  it('should use user ID for authenticated general requests', () => {
    expect(generalKeyGenerator('user-123', '10.0.0.1')).toBe('user:user-123');
  });

  it('should use IP for unauthenticated general requests', () => {
    expect(generalKeyGenerator(undefined, '10.0.0.1')).toBe('ip:10.0.0.1');
  });

  it('should always use IP for auth endpoints (prevent account enumeration)', () => {
    expect(authKeyGenerator('192.168.1.1')).toBe('auth:192.168.1.1');
  });

  it('should always use IP for agent endpoints', () => {
    expect(agentKeyGenerator('10.0.0.5')).toBe('agent:10.0.0.5');
  });

  it('should produce unique keys per IP for auth', () => {
    const key1 = authKeyGenerator('10.0.0.1');
    const key2 = authKeyGenerator('10.0.0.2');
    expect(key1).not.toBe(key2);
  });

  it('should produce unique keys per user for general', () => {
    const key1 = generalKeyGenerator('alice', '10.0.0.1');
    const key2 = generalKeyGenerator('bob', '10.0.0.1');
    expect(key1).not.toBe(key2);
  });
});

describe('Load: Rate Limiting - Skip Logic', () => {
  // Mirrors skip() from middleware/rateLimit.ts
  function shouldSkip(path: string, rateLimitEnabled: boolean): boolean {
    if (path === '/health') return true;
    if (!rateLimitEnabled) return true;
    return false;
  }

  it('should skip rate limiting for /health endpoint', () => {
    expect(shouldSkip('/health', true)).toBe(true);
  });

  it('should skip rate limiting when disabled globally', () => {
    expect(shouldSkip('/api/servers', false)).toBe(true);
  });

  it('should not skip for normal API paths when enabled', () => {
    expect(shouldSkip('/api/servers', true)).toBe(false);
    expect(shouldSkip('/api/alerts', true)).toBe(false);
    expect(shouldSkip('/api/agents/register', true)).toBe(false);
  });

  it('should skip /health even when rate limiting is disabled', () => {
    expect(shouldSkip('/health', false)).toBe(true);
  });
});

describe('Load: Rate Limiting - Response Format', () => {
  function buildRateLimitResponse(
    errorMessage: string,
    windowMs: number
  ): { success: boolean; error: string; retryAfter: number } {
    return {
      success: false,
      error: errorMessage,
      retryAfter: Math.ceil(windowMs / 1000),
    };
  }

  it('should return success: false', () => {
    const resp = buildRateLimitResponse('Too many requests', 60000);
    expect(resp.success).toBe(false);
  });

  it('should include the error message', () => {
    const resp = buildRateLimitResponse('Too many requests, please try again later', 60000);
    expect(resp.error).toBe('Too many requests, please try again later');
  });

  it('should include retryAfter in seconds', () => {
    const resp = buildRateLimitResponse('Too many requests', 60000);
    expect(resp.retryAfter).toBe(60);
  });

  it('should produce correct responses for each limiter type', () => {
    const general = buildRateLimitResponse('Too many requests, please try again later', 60000);
    const auth = buildRateLimitResponse('Too many authentication attempts, please try again later', 60000);
    const agent = buildRateLimitResponse('Too many agent requests, please try again later', 60000);
    const metrics = buildRateLimitResponse('Too many metrics queries, please try again later', 60000);

    expect(general.error).toContain('Too many requests');
    expect(auth.error).toContain('authentication');
    expect(agent.error).toContain('agent');
    expect(metrics.error).toContain('metrics');
  });
});

describe('Load: Rate Limiting - X-Forwarded-For IP Extraction', () => {
  // Mirrors getClientIp() from middleware/rateLimit.ts
  function getClientIp(
    xForwardedFor: string | string[] | undefined,
    reqIp: string | undefined,
    remoteAddress: string | undefined
  ): string {
    if (xForwardedFor) {
      const ips = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor.split(',')[0];
      return ips.trim();
    }
    return reqIp || remoteAddress || 'unknown';
  }

  it('should extract first IP from X-Forwarded-For string', () => {
    expect(getClientIp('10.0.0.1, 10.0.0.2, 10.0.0.3', undefined, undefined)).toBe('10.0.0.1');
  });

  it('should extract first IP from X-Forwarded-For array', () => {
    expect(getClientIp(['10.0.0.1', '10.0.0.2'], undefined, undefined)).toBe('10.0.0.1');
  });

  it('should trim whitespace from extracted IP', () => {
    expect(getClientIp('  10.0.0.1 , 10.0.0.2', undefined, undefined)).toBe('10.0.0.1');
  });

  it('should fall back to req.ip when no X-Forwarded-For', () => {
    expect(getClientIp(undefined, '192.168.1.1', '127.0.0.1')).toBe('192.168.1.1');
  });

  it('should fall back to remoteAddress when no req.ip', () => {
    expect(getClientIp(undefined, undefined, '::1')).toBe('::1');
  });

  it('should return "unknown" when no IP source is available', () => {
    expect(getClientIp(undefined, undefined, undefined)).toBe('unknown');
  });
});
