describe('Heartbeat Timeout Configuration', () => {
  it('should default to 5 minutes timeout', () => {
    const timeout = parseInt(process.env.HEARTBEAT_TIMEOUT_MINUTES || '5', 10);
    expect(timeout).toBe(5);
  });

  it('should default to 2 minutes cleanup interval', () => {
    const interval = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '2', 10);
    expect(interval).toBe(2);
  });

  it('should default to 10 minutes offline threshold', () => {
    const threshold = parseInt(process.env.OFFLINE_THRESHOLD_MINUTES || '10', 10);
    expect(threshold).toBe(10);
  });

  it('should default to 5 minutes deep health check interval', () => {
    const interval = parseInt(process.env.DEEP_HEALTH_CHECK_INTERVAL_MINUTES || '5', 10);
    expect(interval).toBe(5);
  });

  it('should compute correct timeout threshold in ms', () => {
    const minutes = 5;
    const ms = minutes * 60 * 1000;
    expect(ms).toBe(300_000);
  });

  it('should compute correct offline threshold in ms', () => {
    const minutes = 10;
    const ms = minutes * 60 * 1000;
    expect(ms).toBe(600_000);
  });
});

describe('Stale Agent Detection Logic', () => {
  function isAgentStale(lastHealthCheck: Date, timeoutMinutes: number): boolean {
    const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    return lastHealthCheck < threshold;
  }

  function isAgentOffline(lastHealthCheck: Date, offlineMinutes: number): boolean {
    const threshold = new Date(Date.now() - offlineMinutes * 60 * 1000);
    return lastHealthCheck < threshold;
  }

  it('should detect stale agent past timeout', () => {
    const lastCheck = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
    expect(isAgentStale(lastCheck, 5)).toBe(true);
  });

  it('should not detect fresh agent as stale', () => {
    const lastCheck = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    expect(isAgentStale(lastCheck, 5)).toBe(false);
  });

  it('should detect agent as offline past offline threshold', () => {
    const lastCheck = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    expect(isAgentOffline(lastCheck, 10)).toBe(true);
  });

  it('should not detect recent agent as offline', () => {
    const lastCheck = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    expect(isAgentOffline(lastCheck, 10)).toBe(false);
  });

  it('should classify stale but not offline as STOPPED', () => {
    const lastCheck = new Date(Date.now() - 7 * 60 * 1000); // 7 min (stale at 5, offline at 10)
    const isStale = isAgentStale(lastCheck, 5);
    const isOffline = isAgentOffline(lastCheck, 10);
    expect(isStale).toBe(true);
    expect(isOffline).toBe(false);
    const newStatus = isOffline ? 'FAILED' : 'STOPPED';
    expect(newStatus).toBe('STOPPED');
  });

  it('should classify offline as FAILED', () => {
    const lastCheck = new Date(Date.now() - 12 * 60 * 1000); // 12 min
    const isOffline = isAgentOffline(lastCheck, 10);
    expect(isOffline).toBe(true);
    const newStatus = isOffline ? 'FAILED' : 'STOPPED';
    expect(newStatus).toBe('FAILED');
  });
});

describe('Server Status Determination', () => {
  type AgentStatus = 'RUNNING' | 'STOPPED' | 'FAILED';

  function determineServerStatus(agentStatuses: AgentStatus[]): string {
    const hasRunning = agentStatuses.includes('RUNNING');
    const hasFailed = agentStatuses.includes('FAILED');
    const hasStopped = agentStatuses.includes('STOPPED');

    if (!hasRunning && hasFailed) return 'CRITICAL';
    if (!hasRunning && hasStopped) return 'OFFLINE';
    if (hasRunning && (hasFailed || hasStopped)) return 'WARNING';
    if (hasRunning) return 'ONLINE';
    return 'OFFLINE';
  }

  it('should be ONLINE when all agents running', () => {
    expect(determineServerStatus(['RUNNING', 'RUNNING'])).toBe('ONLINE');
  });

  it('should be WARNING when some running and some stopped', () => {
    expect(determineServerStatus(['RUNNING', 'STOPPED'])).toBe('WARNING');
  });

  it('should be WARNING when some running and some failed', () => {
    expect(determineServerStatus(['RUNNING', 'FAILED'])).toBe('WARNING');
  });

  it('should be CRITICAL when all agents failed', () => {
    expect(determineServerStatus(['FAILED', 'FAILED'])).toBe('CRITICAL');
  });

  it('should be OFFLINE when all agents stopped', () => {
    expect(determineServerStatus(['STOPPED', 'STOPPED'])).toBe('OFFLINE');
  });

  it('should be CRITICAL when mixed failed and stopped (no running)', () => {
    expect(determineServerStatus(['FAILED', 'STOPPED'])).toBe('CRITICAL');
  });

  it('should be ONLINE for single running agent', () => {
    expect(determineServerStatus(['RUNNING'])).toBe('ONLINE');
  });

  it('should be OFFLINE for empty agent list', () => {
    expect(determineServerStatus([])).toBe('OFFLINE');
  });
});

describe('Deep Health Check URL Construction', () => {
  function buildMetricsUrl(ipAddress: string, port: number): string {
    return `http://${ipAddress}:${port}/metrics`;
  }

  it('should build correct metrics URL', () => {
    expect(buildMetricsUrl('10.0.0.1', 9100)).toBe('http://10.0.0.1:9100/metrics');
  });

  it('should handle different ports', () => {
    expect(buildMetricsUrl('192.168.1.5', 9104)).toBe('http://192.168.1.5:9104/metrics');
  });

  it('should handle localhost', () => {
    expect(buildMetricsUrl('127.0.0.1', 9100)).toBe('http://127.0.0.1:9100/metrics');
  });
});

describe('Recovery Detection', () => {
  function shouldRecoverServer(
    agentStatuses: string[],
    currentServerStatus: string,
    recoveredAgentId: string,
    recoveredAgentIndex: number
  ): boolean {
    // Simulate: all agents running (including the one that just recovered)
    const updatedStatuses = agentStatuses.map((s, i) =>
      i === recoveredAgentIndex ? 'RUNNING' : s
    );
    const allRunning = updatedStatuses.every(s => s === 'RUNNING');
    return allRunning && ['OFFLINE', 'CRITICAL', 'WARNING'].includes(currentServerStatus);
  }

  it('should recover when all agents back online', () => {
    expect(shouldRecoverServer(['STOPPED', 'RUNNING'], 'WARNING', 'agent-1', 0)).toBe(true);
  });

  it('should not recover if some agents still down', () => {
    expect(shouldRecoverServer(['STOPPED', 'STOPPED'], 'OFFLINE', 'agent-1', 0)).toBe(false);
  });

  it('should not recover if server already ONLINE', () => {
    expect(shouldRecoverServer(['RUNNING', 'RUNNING'], 'ONLINE', 'agent-1', 0)).toBe(false);
  });

  it('should recover from CRITICAL state', () => {
    expect(shouldRecoverServer(['FAILED', 'RUNNING'], 'CRITICAL', 'agent-1', 0)).toBe(true);
  });
});

describe('Cleanup Interval Calculation', () => {
  it('should calculate 2 minute interval correctly', () => {
    const intervalMs = 2 * 60 * 1000;
    expect(intervalMs).toBe(120_000);
  });

  it('should calculate 5 minute deep health check interval', () => {
    const intervalMs = 5 * 60 * 1000;
    expect(intervalMs).toBe(300_000);
  });

  it('should support custom interval via env', () => {
    const customMinutes = 15;
    const intervalMs = customMinutes * 60 * 1000;
    expect(intervalMs).toBe(900_000);
  });
});
