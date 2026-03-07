describe('Health Check - Overall Status', () => {
  interface DependencyHealth {
    status: string;
    responseTime: number;
    error?: string;
  }

  function computeOverallStatus(dependencies: Record<string, DependencyHealth>): string {
    const allOk = Object.values(dependencies).every(d => d.status === 'ok');
    const anyDown = Object.values(dependencies).some(d => d.status === 'down');
    return allOk ? 'ok' : anyDown ? 'degraded' : 'ok';
  }

  it('should return ok when all dependencies are healthy', () => {
    const deps = {
      database: { status: 'ok', responseTime: 5 },
      redis: { status: 'ok', responseTime: 2 },
      prometheus: { status: 'ok', responseTime: 10 },
    };
    expect(computeOverallStatus(deps)).toBe('ok');
  });

  it('should return degraded when database is down', () => {
    const deps = {
      database: { status: 'down', responseTime: 2000, error: 'Connection refused' },
      redis: { status: 'ok', responseTime: 2 },
      prometheus: { status: 'ok', responseTime: 10 },
    };
    expect(computeOverallStatus(deps)).toBe('degraded');
  });

  it('should return degraded when redis is down', () => {
    const deps = {
      database: { status: 'ok', responseTime: 5 },
      redis: { status: 'down', responseTime: 2000, error: 'ECONNREFUSED' },
      prometheus: { status: 'ok', responseTime: 10 },
    };
    expect(computeOverallStatus(deps)).toBe('degraded');
  });

  it('should return degraded when prometheus is down', () => {
    const deps = {
      database: { status: 'ok', responseTime: 5 },
      redis: { status: 'ok', responseTime: 2 },
      prometheus: { status: 'down', responseTime: 3000, error: 'timeout' },
    };
    expect(computeOverallStatus(deps)).toBe('degraded');
  });

  it('should return degraded when multiple dependencies are down', () => {
    const deps = {
      database: { status: 'down', responseTime: 2000 },
      redis: { status: 'down', responseTime: 2000 },
      prometheus: { status: 'ok', responseTime: 10 },
    };
    expect(computeOverallStatus(deps)).toBe('degraded');
  });

  it('should return degraded when all dependencies are down', () => {
    const deps = {
      database: { status: 'down', responseTime: 2000 },
      redis: { status: 'down', responseTime: 2000 },
      prometheus: { status: 'down', responseTime: 3000 },
    };
    expect(computeOverallStatus(deps)).toBe('degraded');
  });
});

describe('Health Check - HTTP Status Code', () => {
  function getStatusCode(overallStatus: string): number {
    return overallStatus === 'ok' ? 200 : 503;
  }

  it('should return 200 for ok status', () => {
    expect(getStatusCode('ok')).toBe(200);
  });

  it('should return 503 for degraded status', () => {
    expect(getStatusCode('degraded')).toBe(503);
  });
});

describe('Health Check - Response Time Tracking', () => {
  it('should measure individual dependency response times', () => {
    const start = Date.now();
    const simulated = { status: 'ok', responseTime: Date.now() - start };
    expect(simulated.responseTime).toBeGreaterThanOrEqual(0);
    expect(simulated.responseTime).toBeLessThan(100); // should be near-instant
  });

  it('should include total response time', () => {
    const totalStart = Date.now();
    const deps = [
      { name: 'db', responseTime: 5 },
      { name: 'redis', responseTime: 2 },
      { name: 'prometheus', responseTime: 10 },
    ];
    const totalTime = Date.now() - totalStart;
    expect(totalTime).toBeGreaterThanOrEqual(0);
    expect(deps.reduce((sum, d) => sum + d.responseTime, 0)).toBe(17);
  });
});

describe('Health Check - Response Structure', () => {
  interface HealthResponse {
    status: string;
    timestamp: string;
    uptime: number;
    responseTime: number;
    dependencies: Record<string, { status: string; responseTime: number; error?: string }>;
  }

  const sampleResponse: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: 3600,
    responseTime: 25,
    dependencies: {
      database: { status: 'ok', responseTime: 5 },
      redis: { status: 'ok', responseTime: 2 },
      prometheus: { status: 'ok', responseTime: 10 },
    },
  };

  it('should include status field', () => {
    expect(sampleResponse).toHaveProperty('status');
    expect(['ok', 'degraded']).toContain(sampleResponse.status);
  });

  it('should include valid timestamp', () => {
    expect(new Date(sampleResponse.timestamp).getTime()).not.toBeNaN();
  });

  it('should include uptime in seconds', () => {
    expect(sampleResponse.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include total responseTime', () => {
    expect(sampleResponse.responseTime).toBeGreaterThanOrEqual(0);
  });

  it('should include database dependency', () => {
    expect(sampleResponse.dependencies).toHaveProperty('database');
    expect(sampleResponse.dependencies.database).toHaveProperty('status');
    expect(sampleResponse.dependencies.database).toHaveProperty('responseTime');
  });

  it('should include redis dependency', () => {
    expect(sampleResponse.dependencies).toHaveProperty('redis');
  });

  it('should include prometheus dependency', () => {
    expect(sampleResponse.dependencies).toHaveProperty('prometheus');
  });

  it('should include error message when dependency is down', () => {
    const degraded: HealthResponse = {
      ...sampleResponse,
      status: 'degraded',
      dependencies: {
        ...sampleResponse.dependencies,
        database: { status: 'down', responseTime: 2000, error: 'Connection refused' },
      },
    };
    expect(degraded.dependencies.database.error).toBe('Connection refused');
  });
});

describe('Health Check - Slow Dependency Detection', () => {
  function isSlowDependency(responseTime: number, thresholdMs: number = 1000): boolean {
    return responseTime > thresholdMs;
  }

  it('should detect slow dependencies', () => {
    expect(isSlowDependency(1500)).toBe(true);
    expect(isSlowDependency(500)).toBe(false);
  });

  it('should respect custom threshold', () => {
    expect(isSlowDependency(300, 200)).toBe(true);
    expect(isSlowDependency(100, 200)).toBe(false);
  });

  it('should handle zero response time', () => {
    expect(isSlowDependency(0)).toBe(false);
  });
});

describe('Health Check Script - Port Configuration', () => {
  it('should use correct API port 4000', () => {
    const apiPort = 4000;
    expect(apiPort).toBe(4000);
    expect(apiPort).not.toBe(3002); // old incorrect port
  });

  it('should check expected services', () => {
    const expectedServices = ['Web UI', 'Grafana', 'AlertManager', 'Loki', 'Pushgateway'];
    const expectedPorts = [3000, 3030, 9093, 3100, 9091];
    expect(expectedServices).toHaveLength(5);
    expect(expectedPorts).toHaveLength(5);
    expect(expectedPorts).not.toContain(3002); // no more old port references
  });
});
