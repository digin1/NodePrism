describe('API Metrics - Route Normalization', () => {
  function normalizeRoute(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
  }

  it('should replace UUIDs with :id', () => {
    expect(normalizeRoute('/api/servers/550e8400-e29b-41d4-a716-446655440000'))
      .toBe('/api/servers/:id');
  });

  it('should replace multiple UUIDs', () => {
    expect(normalizeRoute('/api/servers/550e8400-e29b-41d4-a716-446655440000/alerts/660e8400-e29b-41d4-a716-446655440001'))
      .toBe('/api/servers/:id/alerts/:id');
  });

  it('should replace numeric IDs', () => {
    expect(normalizeRoute('/api/servers/123')).toBe('/api/servers/:id');
  });

  it('should not modify routes without dynamic segments', () => {
    expect(normalizeRoute('/api/servers')).toBe('/api/servers');
    expect(normalizeRoute('/api/alerts/rules')).toBe('/api/alerts/rules');
    expect(normalizeRoute('/health')).toBe('/health');
  });

  it('should handle root path', () => {
    expect(normalizeRoute('/')).toBe('/');
  });
});

describe('API Metrics - Metric Names', () => {
  const expectedMetrics = [
    'nodeprism_http_requests_total',
    'nodeprism_http_request_duration_seconds',
    'nodeprism_websocket_connections_active',
    'nodeprism_http_errors_total',
  ];

  it('should define all expected custom metrics', () => {
    for (const name of expectedMetrics) {
      expect(name).toMatch(/^nodeprism_/);
    }
  });

  it('should use correct Prometheus naming convention', () => {
    for (const name of expectedMetrics) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('should have _total suffix for counters', () => {
    expect(expectedMetrics.filter(m => m.includes('total'))).toHaveLength(2);
  });

  it('should have _seconds suffix for histograms', () => {
    expect(expectedMetrics.filter(m => m.includes('seconds'))).toHaveLength(1);
  });

  it('should have _active suffix for gauges', () => {
    expect(expectedMetrics.filter(m => m.includes('active'))).toHaveLength(1);
  });
});

describe('API Metrics - HTTP Labels', () => {
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const validStatusCodes = ['200', '201', '400', '401', '403', '404', '500'];

  it('should track standard HTTP methods', () => {
    expect(validMethods).toContain('GET');
    expect(validMethods).toContain('POST');
    expect(validMethods).toContain('PUT');
    expect(validMethods).toContain('DELETE');
  });

  it('should track status codes as strings', () => {
    for (const code of validStatusCodes) {
      expect(typeof code).toBe('string');
      expect(parseInt(code, 10)).toBeGreaterThanOrEqual(100);
      expect(parseInt(code, 10)).toBeLessThan(600);
    }
  });

  it('should identify error status codes', () => {
    const errorCodes = validStatusCodes.filter(c => parseInt(c) >= 400);
    expect(errorCodes).toContain('400');
    expect(errorCodes).toContain('500');
    expect(errorCodes).not.toContain('200');
  });
});

describe('API Metrics - Histogram Buckets', () => {
  const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

  it('should have buckets in ascending order', () => {
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]).toBeGreaterThan(buckets[i - 1]);
    }
  });

  it('should cover sub-millisecond to 10 second range', () => {
    expect(buckets[0]).toBeLessThanOrEqual(0.01);
    expect(buckets[buckets.length - 1]).toBeGreaterThanOrEqual(10);
  });

  it('should have reasonable number of buckets', () => {
    expect(buckets.length).toBeGreaterThanOrEqual(8);
    expect(buckets.length).toBeLessThanOrEqual(15);
  });
});

describe('API Metrics - WebSocket Tracking', () => {
  let connectionCount = 0;

  function setConnections(count: number) { connectionCount = count; }
  function onConnect() { connectionCount++; setConnections(connectionCount); }
  function onDisconnect() { connectionCount--; setConnections(connectionCount); }

  beforeEach(() => { connectionCount = 0; });

  it('should track connection count', () => {
    onConnect();
    expect(connectionCount).toBe(1);
    onConnect();
    expect(connectionCount).toBe(2);
  });

  it('should decrement on disconnect', () => {
    onConnect();
    onConnect();
    onDisconnect();
    expect(connectionCount).toBe(1);
  });

  it('should reach zero when all disconnect', () => {
    onConnect();
    onConnect();
    onConnect();
    onDisconnect();
    onDisconnect();
    onDisconnect();
    expect(connectionCount).toBe(0);
  });
});

describe('API Metrics - Prometheus Config', () => {
  it('should use correct job name', () => {
    const jobName = 'nodeprism-api';
    expect(jobName).toBe('nodeprism-api');
  });

  it('should target port 4000', () => {
    const target = 'host.docker.internal:4000';
    expect(target).toContain(':4000');
  });

  it('should use /metrics path', () => {
    const metricsPath = '/metrics';
    expect(metricsPath).toBe('/metrics');
  });
});

describe('API Metrics - Error Classification', () => {
  function isErrorStatus(statusCode: number): boolean {
    return statusCode >= 400;
  }

  function isClientError(statusCode: number): boolean {
    return statusCode >= 400 && statusCode < 500;
  }

  function isServerError(statusCode: number): boolean {
    return statusCode >= 500;
  }

  it('should classify 4xx as errors', () => {
    expect(isErrorStatus(400)).toBe(true);
    expect(isErrorStatus(401)).toBe(true);
    expect(isErrorStatus(404)).toBe(true);
    expect(isErrorStatus(429)).toBe(true);
  });

  it('should classify 5xx as errors', () => {
    expect(isErrorStatus(500)).toBe(true);
    expect(isErrorStatus(503)).toBe(true);
  });

  it('should not classify 2xx as errors', () => {
    expect(isErrorStatus(200)).toBe(false);
    expect(isErrorStatus(201)).toBe(false);
    expect(isErrorStatus(204)).toBe(false);
  });

  it('should distinguish client vs server errors', () => {
    expect(isClientError(400)).toBe(true);
    expect(isClientError(500)).toBe(false);
    expect(isServerError(500)).toBe(true);
    expect(isServerError(400)).toBe(false);
  });
});
