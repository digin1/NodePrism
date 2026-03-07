describe('Event Types', () => {
  const EVENT_TYPES = [
    'SERVER_ONLINE', 'SERVER_OFFLINE', 'SERVER_WARNING', 'SERVER_CRITICAL', 'SERVER_RECOVERED',
    'AGENT_INSTALLED', 'AGENT_STARTED', 'AGENT_STOPPED', 'AGENT_FAILED', 'AGENT_UPDATED',
    'ALERT_TRIGGERED', 'ALERT_RESOLVED', 'ALERT_ACKNOWLEDGED',
    'THRESHOLD_WARNING', 'THRESHOLD_CRITICAL', 'THRESHOLD_CLEARED',
    'ANOMALY_DETECTED', 'ANOMALY_RESOLVED',
    'SYSTEM_STARTUP', 'SYSTEM_SHUTDOWN',
    'HEARTBEAT_MISSED', 'CONNECTION_LOST', 'CONNECTION_RESTORED',
  ];

  const SEVERITY_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'CRITICAL'];

  it('should have all expected event types', () => {
    expect(EVENT_TYPES.length).toBe(23);
    expect(EVENT_TYPES).toContain('SERVER_ONLINE');
    expect(EVENT_TYPES).toContain('ANOMALY_DETECTED');
    expect(EVENT_TYPES).toContain('SYSTEM_STARTUP');
  });

  it('should have 4 severity levels', () => {
    expect(SEVERITY_LEVELS.length).toBe(4);
  });
});

describe('Status Change Event Logic', () => {
  function getStatusChangeSeverity(oldStatus: string, newStatus: string): string {
    if (newStatus === 'ONLINE' && oldStatus !== 'ONLINE') return 'INFO';
    if (newStatus === 'OFFLINE') return 'WARNING';
    if (newStatus === 'WARNING') return 'WARNING';
    if (newStatus === 'CRITICAL') return 'CRITICAL';
    return 'INFO';
  }

  function getStatusChangeType(newStatus: string): string {
    switch (newStatus) {
      case 'ONLINE': return 'SERVER_ONLINE';
      case 'OFFLINE': return 'SERVER_OFFLINE';
      case 'WARNING': return 'SERVER_WARNING';
      case 'CRITICAL': return 'SERVER_CRITICAL';
      default: return 'SERVER_ONLINE';
    }
  }

  it('should map ONLINE transitions to INFO severity', () => {
    expect(getStatusChangeSeverity('OFFLINE', 'ONLINE')).toBe('INFO');
    expect(getStatusChangeSeverity('CRITICAL', 'ONLINE')).toBe('INFO');
  });

  it('should map CRITICAL to CRITICAL severity', () => {
    expect(getStatusChangeSeverity('ONLINE', 'CRITICAL')).toBe('CRITICAL');
  });

  it('should map WARNING to WARNING severity', () => {
    expect(getStatusChangeSeverity('ONLINE', 'WARNING')).toBe('WARNING');
  });

  it('should map OFFLINE to WARNING severity', () => {
    expect(getStatusChangeSeverity('ONLINE', 'OFFLINE')).toBe('WARNING');
  });

  it('should return correct event types', () => {
    expect(getStatusChangeType('ONLINE')).toBe('SERVER_ONLINE');
    expect(getStatusChangeType('OFFLINE')).toBe('SERVER_OFFLINE');
    expect(getStatusChangeType('WARNING')).toBe('SERVER_WARNING');
    expect(getStatusChangeType('CRITICAL')).toBe('SERVER_CRITICAL');
  });
});

describe('Heartbeat Missed Detection', () => {
  function isHeartbeatStale(lastHealthCheck: Date | null, thresholdMs: number): boolean {
    if (!lastHealthCheck) return true;
    return Date.now() - lastHealthCheck.getTime() > thresholdMs;
  }

  it('should detect stale heartbeat', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    expect(isHeartbeatStale(tenMinutesAgo, 5 * 60 * 1000)).toBe(true);
  });

  it('should not flag recent heartbeat', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    expect(isHeartbeatStale(oneMinuteAgo, 5 * 60 * 1000)).toBe(false);
  });

  it('should flag null lastHealthCheck as stale', () => {
    expect(isHeartbeatStale(null, 5 * 60 * 1000)).toBe(true);
  });

  it('should handle threshold edge case', () => {
    const exactly5MinAgo = new Date(Date.now() - 5 * 60 * 1000 - 1);
    expect(isHeartbeatStale(exactly5MinAgo, 5 * 60 * 1000)).toBe(true);
  });
});
