/**
 * Integration flow test: Alert Flow
 *
 * Tests the data flow: Prometheus alert fires -> AlertManager webhook payload
 * parsed -> alert upserted -> EventLog entry -> severity mapping.
 * All functions are pure inline mirrors of the real service logic
 * (routes/alerts.ts, services/eventLogger.ts).
 */

// ---------------------------------------------------------------------------
// Pure functions mirroring real service logic
// ---------------------------------------------------------------------------

/** Parses and normalizes an AlertManager webhook payload (routes/alerts.ts webhook) */
function parseAlertManagerPayload(payload: {
  status: string;
  alerts: Array<{
    status: string;
    labels: Record<string, string>;
    annotations?: Record<string, string>;
    startsAt: string;
    endsAt?: string;
    fingerprint: string;
  }>;
}): Array<{
  fingerprint: string;
  status: string;
  severity: string;
  message: string;
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt: Date;
  endsAt: Date | null;
}> {
  return (payload.alerts || []).map((alert) => ({
    fingerprint: alert.fingerprint,
    status: alert.status === 'firing' ? 'FIRING' : 'RESOLVED',
    severity: (alert.labels?.severity?.toUpperCase() || 'WARNING'),
    message:
      alert.annotations?.summary ||
      alert.annotations?.description ||
      'Alert triggered',
    labels: alert.labels,
    annotations: alert.annotations,
    startsAt: new Date(alert.startsAt),
    endsAt: alert.endsAt ? new Date(alert.endsAt) : null,
  }));
}

/** Maps severity string to canonical severity (routes/alerts.ts) */
function mapSeverity(raw: string | undefined): string {
  const val = (raw || 'warning').toUpperCase();
  const valid = ['CRITICAL', 'WARNING', 'INFO', 'DEBUG'];
  return valid.includes(val) ? val : 'WARNING';
}

/** Determines allowed alert status transitions (routes/alerts.ts) */
function isValidTransition(from: string, to: string): boolean {
  const transitions: Record<string, string[]> = {
    FIRING: ['ACKNOWLEDGED', 'SILENCED', 'RESOLVED'],
    ACKNOWLEDGED: ['SILENCED', 'RESOLVED', 'FIRING'],
    SILENCED: ['RESOLVED', 'FIRING'],
    RESOLVED: ['FIRING'],
  };
  return (transitions[from] || []).includes(to);
}

/** Deduplication key for alert upsert (routes/alerts.ts webhook - uses fingerprint) */
function alertDeduplicationKey(alert: {
  labels: Record<string, string>;
  fingerprint: string;
}): string {
  return alert.fingerprint;
}

/**
 * An alternative dedup logic based on alertname + server (conceptual).
 * If two alerts share the same alertname and same server, they are the same alert.
 */
function alertDeduplicationByNameAndServer(
  alertname: string,
  serverId: string,
): string {
  return `${alertname}::${serverId}`;
}

/** Extracts server identification from alert labels (routes/alerts.ts webhook) */
function extractServerIdFromLabels(labels: Record<string, string>): {
  serverId: string | null;
  ip: string | null;
  hostname: string | null;
} {
  const serverId = labels.server_id || null;
  const instance = labels.instance || null;
  const hostname = labels.hostname || null;
  const ip = instance ? instance.split(':')[0] : null;
  return { serverId, ip, hostname };
}

/** Builds EventLog entry for an alert event (services/eventLogger.ts) */
function buildAlertEventLog(
  alertName: string,
  status: 'triggered' | 'resolved' | 'acknowledged',
  severity: 'WARNING' | 'CRITICAL',
): {
  type: string;
  severity: string;
  title: string;
  message: string;
} {
  const typeMap: Record<string, string> = {
    triggered: 'ALERT_TRIGGERED',
    resolved: 'ALERT_RESOLVED',
    acknowledged: 'ALERT_ACKNOWLEDGED',
  };
  return {
    type: typeMap[status],
    severity: status === 'resolved' ? 'INFO' : severity,
    title: `Alert ${status}: ${alertName}`,
    message: `Alert "${alertName}" has been ${status}`,
  };
}

/** Calculates alert statistics (routes/alerts.ts /stats) */
function calculateAlertStats(alerts: { status: string; severity: string }[]) {
  return {
    firing: alerts.filter((a) => a.status === 'FIRING').length,
    critical: alerts.filter(
      (a) => a.severity === 'CRITICAL' && a.status === 'FIRING',
    ).length,
    warning: alerts.filter(
      (a) => a.severity === 'WARNING' && a.status === 'FIRING',
    ).length,
    resolved: alerts.filter((a) => a.status === 'RESOLVED').length,
    silenced: alerts.filter((a) => a.status === 'SILENCED').length,
    acknowledged: alerts.filter((a) => a.status === 'ACKNOWLEDGED').length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Alert Flow - AlertManager Webhook Parsing', () => {
  it('should parse a single firing alert', () => {
    const result = parseAlertManagerPayload({
      status: 'firing',
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'HighCPU', instance: '10.0.0.1:9100', severity: 'warning' },
          annotations: { summary: 'CPU is high' },
          startsAt: '2026-03-07T10:00:00Z',
          fingerprint: 'abc123',
        },
      ],
    });
    expect(result.length).toBe(1);
    expect(result[0].status).toBe('FIRING');
    expect(result[0].severity).toBe('WARNING');
    expect(result[0].message).toBe('CPU is high');
    expect(result[0].fingerprint).toBe('abc123');
  });

  it('should parse a resolved alert', () => {
    const result = parseAlertManagerPayload({
      status: 'resolved',
      alerts: [
        {
          status: 'resolved',
          labels: { alertname: 'HighCPU', instance: '10.0.0.1:9100' },
          startsAt: '2026-03-07T10:00:00Z',
          endsAt: '2026-03-07T10:05:00Z',
          fingerprint: 'abc123',
        },
      ],
    });
    expect(result[0].status).toBe('RESOLVED');
    expect(result[0].endsAt).toBeInstanceOf(Date);
  });

  it('should handle multiple alerts in a single webhook', () => {
    const result = parseAlertManagerPayload({
      status: 'firing',
      alerts: [
        { status: 'firing', labels: { alertname: 'A' }, startsAt: '2026-03-07T10:00:00Z', fingerprint: 'f1' },
        { status: 'firing', labels: { alertname: 'B' }, startsAt: '2026-03-07T10:01:00Z', fingerprint: 'f2' },
        { status: 'resolved', labels: { alertname: 'C' }, startsAt: '2026-03-07T09:00:00Z', endsAt: '2026-03-07T10:00:00Z', fingerprint: 'f3' },
      ],
    });
    expect(result.length).toBe(3);
    expect(result.filter((a) => a.status === 'FIRING').length).toBe(2);
    expect(result.filter((a) => a.status === 'RESOLVED').length).toBe(1);
  });

  it('should default message to "Alert triggered" when no annotations', () => {
    const result = parseAlertManagerPayload({
      status: 'firing',
      alerts: [
        { status: 'firing', labels: { alertname: 'Test' }, startsAt: '2026-03-07T10:00:00Z', fingerprint: 'x' },
      ],
    });
    expect(result[0].message).toBe('Alert triggered');
  });

  it('should use description as fallback when summary is absent', () => {
    const result = parseAlertManagerPayload({
      status: 'firing',
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'Test' },
          annotations: { description: 'Disk running low' },
          startsAt: '2026-03-07T10:00:00Z',
          fingerprint: 'y',
        },
      ],
    });
    expect(result[0].message).toBe('Disk running low');
  });
});

describe('Alert Flow - Severity Mapping', () => {
  it('should map critical to CRITICAL', () => {
    expect(mapSeverity('critical')).toBe('CRITICAL');
  });

  it('should map warning to WARNING', () => {
    expect(mapSeverity('warning')).toBe('WARNING');
  });

  it('should map info to INFO', () => {
    expect(mapSeverity('info')).toBe('INFO');
  });

  it('should default to WARNING for undefined', () => {
    expect(mapSeverity(undefined)).toBe('WARNING');
  });

  it('should default to WARNING for unknown values', () => {
    expect(mapSeverity('urgent')).toBe('WARNING');
  });
});

describe('Alert Flow - Status Transitions', () => {
  it('should allow FIRING -> ACKNOWLEDGED', () => {
    expect(isValidTransition('FIRING', 'ACKNOWLEDGED')).toBe(true);
  });

  it('should allow FIRING -> SILENCED', () => {
    expect(isValidTransition('FIRING', 'SILENCED')).toBe(true);
  });

  it('should allow FIRING -> RESOLVED', () => {
    expect(isValidTransition('FIRING', 'RESOLVED')).toBe(true);
  });

  it('should allow ACKNOWLEDGED -> RESOLVED', () => {
    expect(isValidTransition('ACKNOWLEDGED', 'RESOLVED')).toBe(true);
  });

  it('should allow SILENCED -> RESOLVED', () => {
    expect(isValidTransition('SILENCED', 'RESOLVED')).toBe(true);
  });

  it('should allow RESOLVED -> FIRING (re-fire)', () => {
    expect(isValidTransition('RESOLVED', 'FIRING')).toBe(true);
  });

  it('should disallow RESOLVED -> ACKNOWLEDGED', () => {
    expect(isValidTransition('RESOLVED', 'ACKNOWLEDGED')).toBe(false);
  });
});

describe('Alert Flow - Deduplication', () => {
  it('should produce the same key for the same fingerprint', () => {
    const k1 = alertDeduplicationKey({ labels: { alertname: 'A' }, fingerprint: 'fp1' });
    const k2 = alertDeduplicationKey({ labels: { alertname: 'B' }, fingerprint: 'fp1' });
    expect(k1).toBe(k2);
  });

  it('should produce different keys for different fingerprints', () => {
    const k1 = alertDeduplicationKey({ labels: { alertname: 'A' }, fingerprint: 'fp1' });
    const k2 = alertDeduplicationKey({ labels: { alertname: 'A' }, fingerprint: 'fp2' });
    expect(k1).not.toBe(k2);
  });

  it('should deduplicate by alertname + server combination', () => {
    const k1 = alertDeduplicationByNameAndServer('HighCPU', 'srv-1');
    const k2 = alertDeduplicationByNameAndServer('HighCPU', 'srv-1');
    const k3 = alertDeduplicationByNameAndServer('HighCPU', 'srv-2');
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});

describe('Alert Flow - Server Identification from Labels', () => {
  it('should extract server_id when present in labels', () => {
    const result = extractServerIdFromLabels({ server_id: 'srv-1', instance: '10.0.0.1:9100' });
    expect(result.serverId).toBe('srv-1');
  });

  it('should extract IP from instance label', () => {
    const result = extractServerIdFromLabels({ instance: '192.168.1.100:9100' });
    expect(result.ip).toBe('192.168.1.100');
    expect(result.serverId).toBeNull();
  });

  it('should extract hostname when present', () => {
    const result = extractServerIdFromLabels({ hostname: 'web-01' });
    expect(result.hostname).toBe('web-01');
    expect(result.ip).toBeNull();
  });

  it('should return all nulls when labels are empty', () => {
    const result = extractServerIdFromLabels({});
    expect(result.serverId).toBeNull();
    expect(result.ip).toBeNull();
    expect(result.hostname).toBeNull();
  });
});

describe('Alert Flow - EventLog Entry Construction', () => {
  it('should build triggered event with original severity', () => {
    const event = buildAlertEventLog('HighCPU', 'triggered', 'CRITICAL');
    expect(event.type).toBe('ALERT_TRIGGERED');
    expect(event.severity).toBe('CRITICAL');
    expect(event.title).toBe('Alert triggered: HighCPU');
  });

  it('should build resolved event with INFO severity', () => {
    const event = buildAlertEventLog('HighCPU', 'resolved', 'CRITICAL');
    expect(event.type).toBe('ALERT_RESOLVED');
    expect(event.severity).toBe('INFO');
  });

  it('should build acknowledged event', () => {
    const event = buildAlertEventLog('DiskFull', 'acknowledged', 'WARNING');
    expect(event.type).toBe('ALERT_ACKNOWLEDGED');
    expect(event.severity).toBe('WARNING');
  });
});

describe('Alert Flow - Alert Statistics', () => {
  it('should calculate stats correctly for mixed alert set', () => {
    const alerts = [
      { status: 'FIRING', severity: 'CRITICAL' },
      { status: 'FIRING', severity: 'WARNING' },
      { status: 'FIRING', severity: 'WARNING' },
      { status: 'RESOLVED', severity: 'CRITICAL' },
      { status: 'SILENCED', severity: 'WARNING' },
      { status: 'ACKNOWLEDGED', severity: 'CRITICAL' },
    ];
    const stats = calculateAlertStats(alerts);
    expect(stats.firing).toBe(3);
    expect(stats.critical).toBe(1);
    expect(stats.warning).toBe(2);
    expect(stats.resolved).toBe(1);
    expect(stats.silenced).toBe(1);
    expect(stats.acknowledged).toBe(1);
  });

  it('should handle empty alerts', () => {
    const stats = calculateAlertStats([]);
    expect(stats.firing).toBe(0);
    expect(stats.critical).toBe(0);
    expect(stats.warning).toBe(0);
  });
});
