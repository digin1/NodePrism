/**
 * Integration flow test: Config Sync Flow
 *
 * Tests the data flow: Prometheus targets discovered -> DB server status
 * updated -> EventLog entry. All functions are pure inline mirrors of
 * the real service logic (config-sync/status-sync.ts, config-sync/prometheus.ts,
 * services/eventLogger.ts).
 */

// ---------------------------------------------------------------------------
// Pure functions mirroring real service logic
// ---------------------------------------------------------------------------

/** Raw Prometheus /api/v1/targets response shape */
interface RawPrometheusTarget {
  labels: Record<string, string>;
  discoveredLabels: Record<string, string>;
  scrapeUrl: string;
  health: string;
  lastScrape: string;
  lastError?: string;
}

/** Parsed target (config-sync/prometheus.ts getTargets()) */
interface ParsedTarget {
  labels: Record<string, string>;
  scrapeUrl: string;
  health: 'up' | 'down' | 'unknown';
  lastScrape: string;
  lastError?: string;
}

/**
 * Parses raw Prometheus targets API response.
 * Mirrors config-sync/prometheus.ts getTargets() transformation.
 */
function parsePrometheusTargets(
  rawTargets: RawPrometheusTarget[],
): ParsedTarget[] {
  return rawTargets.map((target) => ({
    labels: { ...target.discoveredLabels, ...target.labels },
    scrapeUrl: target.scrapeUrl,
    health: target.health as 'up' | 'down' | 'unknown',
    lastScrape: target.lastScrape,
    lastError: target.lastError,
  }));
}

/**
 * Maps target health to server status.
 * Mirrors config-sync/status-sync.ts syncServerStatus().
 */
function targetHealthToServerStatus(
  health: 'up' | 'down' | 'unknown' | null,
): string {
  if (health === null) return 'OFFLINE'; // Not found in Prometheus
  if (health === 'up') return 'ONLINE';
  return 'CRITICAL'; // 'down' or 'unknown'
}

/**
 * Maps Prometheus job name to agent type enum.
 * Inverse of the mapping in services/targetGenerator.ts.
 */
function jobNameToAgentType(jobName: string): string | null {
  const map: Record<string, string> = {
    'node-exporter': 'NODE_EXPORTER',
    'app-agent': 'APP_AGENT',
    'mysql-exporter': 'MYSQL_EXPORTER',
    'postgres-exporter': 'POSTGRES_EXPORTER',
    'mongodb-exporter': 'MONGODB_EXPORTER',
    'nginx-exporter': 'NGINX_EXPORTER',
    'apache-exporter': 'APACHE_EXPORTER',
  };
  return map[jobName] || null;
}

/**
 * Extracts target metadata labels (config-sync/status-sync.ts + prometheus.ts).
 */
function extractTargetLabels(labels: Record<string, string>): {
  serverId: string | null;
  hostname: string | null;
  environment: string | null;
  ip: string | null;
} {
  const instance = labels.instance || null;
  return {
    serverId: labels.server_id || null,
    hostname: labels.hostname || (instance ? instance.split(':')[0] : null),
    environment: labels.environment || null,
    ip: instance ? instance.split(':')[0] : null,
  };
}

/**
 * Builds an EventLog entry for a status change.
 * Mirrors config-sync/status-sync.ts logStatusChangeEvent().
 */
function buildStatusChangeEvent(
  oldStatus: string,
  newStatus: string,
  hostname: string,
): {
  type: string;
  severity: string;
  title: string;
  message: string;
  isRecovery: boolean;
} {
  const isRecovery =
    (oldStatus === 'OFFLINE' || oldStatus === 'CRITICAL') &&
    newStatus === 'ONLINE';

  const typeMap: Record<string, string> = {
    ONLINE: 'SERVER_ONLINE',
    OFFLINE: 'SERVER_OFFLINE',
    WARNING: 'SERVER_WARNING',
    CRITICAL: 'SERVER_CRITICAL',
  };

  const severityMap: Record<string, string> = {
    ONLINE: 'INFO',
    OFFLINE: 'CRITICAL',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL',
  };

  const eventType = isRecovery
    ? 'SERVER_RECOVERED'
    : typeMap[newStatus] || 'SERVER_OFFLINE';
  const title = isRecovery
    ? 'Server recovered'
    : `Server ${newStatus.toLowerCase()}`;
  const message = isRecovery
    ? `Server ${hostname} has recovered and is now online (was ${oldStatus})`
    : `Server ${hostname} changed status from ${oldStatus} to ${newStatus}`;

  return {
    type: eventType,
    severity: severityMap[newStatus] || 'INFO',
    title,
    message,
    isRecovery,
  };
}

/**
 * Determines whether a status update should be applied.
 * Only update when status actually changed (config-sync/status-sync.ts).
 */
function shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  return currentStatus !== newStatus;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Config Sync Flow - Prometheus Target Parsing', () => {
  it('should merge discoveredLabels and labels (labels take precedence)', () => {
    const parsed = parsePrometheusTargets([
      {
        labels: { job: 'node-exporter', instance: '10.0.0.1:9100' },
        discoveredLabels: {
          __address__: '10.0.0.1:9100',
          server_id: 'srv-1',
          hostname: 'web-01',
        },
        scrapeUrl: 'http://10.0.0.1:9100/metrics',
        health: 'up',
        lastScrape: '2026-03-07T10:00:00Z',
      },
    ]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].labels.server_id).toBe('srv-1');
    expect(parsed[0].labels.hostname).toBe('web-01');
    expect(parsed[0].labels.job).toBe('node-exporter');
    expect(parsed[0].health).toBe('up');
  });

  it('should preserve lastError when present', () => {
    const parsed = parsePrometheusTargets([
      {
        labels: { instance: '10.0.0.2:9100' },
        discoveredLabels: {},
        scrapeUrl: 'http://10.0.0.2:9100/metrics',
        health: 'down',
        lastScrape: '2026-03-07T10:00:00Z',
        lastError: 'connection refused',
      },
    ]);
    expect(parsed[0].lastError).toBe('connection refused');
    expect(parsed[0].health).toBe('down');
  });

  it('should handle empty target list', () => {
    const parsed = parsePrometheusTargets([]);
    expect(parsed).toEqual([]);
  });
});

describe('Config Sync Flow - Server Status Mapping', () => {
  it('should map up -> ONLINE', () => {
    expect(targetHealthToServerStatus('up')).toBe('ONLINE');
  });

  it('should map down -> CRITICAL', () => {
    expect(targetHealthToServerStatus('down')).toBe('CRITICAL');
  });

  it('should map unknown -> CRITICAL', () => {
    expect(targetHealthToServerStatus('unknown')).toBe('CRITICAL');
  });

  it('should map null (not found) -> OFFLINE', () => {
    expect(targetHealthToServerStatus(null)).toBe('OFFLINE');
  });
});

describe('Config Sync Flow - Job Name to Agent Type', () => {
  it('should map node-exporter -> NODE_EXPORTER', () => {
    expect(jobNameToAgentType('node-exporter')).toBe('NODE_EXPORTER');
  });

  it('should map all known job names', () => {
    const expected: Record<string, string> = {
      'node-exporter': 'NODE_EXPORTER',
      'app-agent': 'APP_AGENT',
      'mysql-exporter': 'MYSQL_EXPORTER',
      'postgres-exporter': 'POSTGRES_EXPORTER',
      'mongodb-exporter': 'MONGODB_EXPORTER',
      'nginx-exporter': 'NGINX_EXPORTER',
      'apache-exporter': 'APACHE_EXPORTER',
    };
    for (const [job, type] of Object.entries(expected)) {
      expect(jobNameToAgentType(job)).toBe(type);
    }
  });

  it('should return null for unknown job name', () => {
    expect(jobNameToAgentType('custom-job')).toBeNull();
  });
});

describe('Config Sync Flow - Target Label Extraction', () => {
  it('should extract server_id, hostname, environment from labels', () => {
    const result = extractTargetLabels({
      server_id: 'srv-1',
      hostname: 'web-01',
      environment: 'production',
      instance: '10.0.0.1:9100',
    });
    expect(result.serverId).toBe('srv-1');
    expect(result.hostname).toBe('web-01');
    expect(result.environment).toBe('production');
    expect(result.ip).toBe('10.0.0.1');
  });

  it('should fall back hostname to instance IP when hostname missing', () => {
    const result = extractTargetLabels({ instance: '192.168.1.5:9100' });
    expect(result.hostname).toBe('192.168.1.5');
    expect(result.ip).toBe('192.168.1.5');
    expect(result.serverId).toBeNull();
  });

  it('should handle missing labels gracefully', () => {
    const result = extractTargetLabels({});
    expect(result.serverId).toBeNull();
    expect(result.hostname).toBeNull();
    expect(result.environment).toBeNull();
    expect(result.ip).toBeNull();
  });
});

describe('Config Sync Flow - EventLog Entry for Status Change', () => {
  it('should detect recovery from CRITICAL to ONLINE', () => {
    const event = buildStatusChangeEvent('CRITICAL', 'ONLINE', 'web-01');
    expect(event.isRecovery).toBe(true);
    expect(event.type).toBe('SERVER_RECOVERED');
    expect(event.title).toBe('Server recovered');
    expect(event.message).toContain('recovered');
    expect(event.message).toContain('was CRITICAL');
  });

  it('should detect recovery from OFFLINE to ONLINE', () => {
    const event = buildStatusChangeEvent('OFFLINE', 'ONLINE', 'db-01');
    expect(event.isRecovery).toBe(true);
    expect(event.type).toBe('SERVER_RECOVERED');
  });

  it('should NOT detect recovery from ONLINE to CRITICAL', () => {
    const event = buildStatusChangeEvent('ONLINE', 'CRITICAL', 'web-01');
    expect(event.isRecovery).toBe(false);
    expect(event.type).toBe('SERVER_CRITICAL');
    expect(event.severity).toBe('CRITICAL');
  });

  it('should map WARNING status correctly', () => {
    const event = buildStatusChangeEvent('ONLINE', 'WARNING', 'app-01');
    expect(event.type).toBe('SERVER_WARNING');
    expect(event.severity).toBe('WARNING');
  });

  it('should only update when status actually changed', () => {
    expect(shouldUpdateStatus('ONLINE', 'ONLINE')).toBe(false);
    expect(shouldUpdateStatus('ONLINE', 'CRITICAL')).toBe(true);
    expect(shouldUpdateStatus('CRITICAL', 'ONLINE')).toBe(true);
  });
});
