/**
 * Integration flow test: Agent Registration
 *
 * Tests the data flow: agent registers -> server auto-created -> Prometheus target
 * generated -> heartbeat updates status. All functions are pure inline mirrors of
 * the real service logic (routes/agents.ts, services/targetGenerator.ts).
 */

// ---------------------------------------------------------------------------
// Pure functions mirroring real service logic
// ---------------------------------------------------------------------------

/** Mirrors the server auto-creation logic in routes/agents.ts POST /register */
function createServerFromRegistration(registration: {
  hostname: string;
  ipAddress: string;
  metadata?: Record<string, any>;
}): {
  hostname: string;
  ipAddress: string;
  status: string;
  environment: string;
  tags: string[];
  metadata: Record<string, any>;
} {
  const osInfo = registration.metadata?.os || null;
  const hardwareInfo = registration.metadata?.hardware || null;

  return {
    hostname: registration.hostname,
    ipAddress: registration.ipAddress,
    status: 'ONLINE',
    environment: 'PRODUCTION',
    tags: ['auto-registered'],
    metadata: {
      autoRegistered: true,
      registeredAt: new Date().toISOString(),
      ...(osInfo && { os: osInfo }),
      ...(hardwareInfo && { hardware: hardwareInfo }),
      ...(registration.metadata?.uptime !== undefined && {
        lastBootUptime: registration.metadata.uptime,
      }),
    },
  };
}

/** Mirrors metadata-merge on re-registration in routes/agents.ts */
function mergeServerMetadata(
  existingMeta: Record<string, unknown>,
  newMeta?: Record<string, any>,
): Record<string, unknown> {
  const osInfo = newMeta?.os || null;
  const hardwareInfo = newMeta?.hardware || null;
  return {
    ...existingMeta,
    ...(osInfo && { os: osInfo }),
    ...(hardwareInfo && { hardware: hardwareInfo }),
    ...(newMeta?.uptime !== undefined && { lastBootUptime: newMeta.uptime }),
    lastRegisteredAt: new Date().toISOString(),
  };
}

/** Maps agent type enum to Prometheus job name (services/targetGenerator.ts) */
function agentTypeToJobName(agentType: string): string | null {
  const map: Record<string, string> = {
    NODE_EXPORTER: 'node-exporter',
    APP_AGENT: 'app-agent',
    MYSQL_EXPORTER: 'mysql-exporter',
    POSTGRES_EXPORTER: 'postgres-exporter',
    MONGODB_EXPORTER: 'mongodb-exporter',
    NGINX_EXPORTER: 'nginx-exporter',
    APACHE_EXPORTER: 'apache-exporter',
  };
  return map[agentType] || null;
}

/** Generates Prometheus target JSON (services/targetGenerator.ts) */
interface PrometheusTarget {
  targets: string[];
  labels: Record<string, string>;
}

function generateTargets(
  servers: Array<{
    id: string;
    hostname: string;
    ipAddress: string;
    environment: string;
    region?: string;
    agents: Array<{ type: string; port: number; status: string }>;
  }>,
): Record<string, PrometheusTarget[]> {
  const targetsByType: Record<string, PrometheusTarget[]> = {
    'node-exporter': [],
    'app-agent': [],
    'mysql-exporter': [],
    'postgres-exporter': [],
    'mongodb-exporter': [],
    'nginx-exporter': [],
    'apache-exporter': [],
  };

  for (const server of servers) {
    const baseLabels: Record<string, string> = {
      server_id: server.id,
      hostname: server.hostname,
      environment: server.environment.toLowerCase(),
      ...(server.region && { region: server.region }),
    };

    for (const agent of server.agents) {
      if (agent.status !== 'RUNNING') continue;

      const jobName = agentTypeToJobName(agent.type);
      if (!jobName || !(jobName in targetsByType)) continue;

      targetsByType[jobName].push({
        targets: [`${server.ipAddress}:${agent.port}`],
        labels: { ...baseLabels, agent_type: agent.type.toLowerCase() },
      });
    }
  }

  return targetsByType;
}

/** Maps heartbeat status string -> DB enum (routes/agents.ts heartbeat handler) */
function mapHeartbeatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    running: 'RUNNING',
    stopped: 'STOPPED',
    failed: 'FAILED',
  };
  return statusMap[status] || 'STOPPED';
}

/** Derives server status from its agents (routes/agents.ts heartbeat handler) */
function calculateServerStatus(agents: { status: string }[]): string {
  const hasRunning = agents.some((a) => a.status === 'RUNNING');
  const hasFailed = agents.some((a) => a.status === 'FAILED');

  if (hasRunning && !hasFailed) return 'ONLINE';
  if (hasRunning && hasFailed) return 'WARNING';
  if (hasFailed) return 'CRITICAL';
  return 'OFFLINE';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent Registration Flow - Server Creation', () => {
  it('should create a server with ONLINE status from registration data', () => {
    const server = createServerFromRegistration({
      hostname: 'web-01',
      ipAddress: '10.0.0.5',
    });
    expect(server.status).toBe('ONLINE');
    expect(server.environment).toBe('PRODUCTION');
    expect(server.hostname).toBe('web-01');
    expect(server.ipAddress).toBe('10.0.0.5');
  });

  it('should tag auto-registered servers', () => {
    const server = createServerFromRegistration({
      hostname: 'db-01',
      ipAddress: '10.0.0.6',
    });
    expect(server.tags).toEqual(['auto-registered']);
    expect(server.metadata.autoRegistered).toBe(true);
  });

  it('should include OS metadata when provided', () => {
    const server = createServerFromRegistration({
      hostname: 'web-01',
      ipAddress: '10.0.0.5',
      metadata: {
        os: { name: 'Ubuntu', version: '22.04', kernel: '5.15.0', arch: 'x86_64' },
      },
    });
    expect(server.metadata.os).toEqual({
      name: 'Ubuntu',
      version: '22.04',
      kernel: '5.15.0',
      arch: 'x86_64',
    });
  });

  it('should include hardware metadata when provided', () => {
    const server = createServerFromRegistration({
      hostname: 'web-01',
      ipAddress: '10.0.0.5',
      metadata: {
        hardware: { cpuModel: 'Xeon E5', cpuCores: 8, totalMemoryKB: 16384000 },
      },
    });
    expect(server.metadata.hardware.cpuCores).toBe(8);
  });

  it('should include uptime as lastBootUptime when provided', () => {
    const server = createServerFromRegistration({
      hostname: 'web-01',
      ipAddress: '10.0.0.5',
      metadata: { uptime: 86400 },
    });
    expect(server.metadata.lastBootUptime).toBe(86400);
  });

  it('should merge metadata on re-registration without losing existing keys', () => {
    const existing = { autoRegistered: true, customKey: 'preserved' };
    const merged = mergeServerMetadata(existing, {
      os: { name: 'Ubuntu' },
    });
    expect(merged.customKey).toBe('preserved');
    expect(merged.autoRegistered).toBe(true);
    expect((merged.os as any).name).toBe('Ubuntu');
    expect(merged.lastRegisteredAt).toBeDefined();
  });
});

describe('Agent Registration Flow - Agent Type to Prometheus Job Mapping', () => {
  it('should map NODE_EXPORTER to node-exporter', () => {
    expect(agentTypeToJobName('NODE_EXPORTER')).toBe('node-exporter');
  });

  it('should map all known types correctly', () => {
    const expected: Record<string, string> = {
      NODE_EXPORTER: 'node-exporter',
      APP_AGENT: 'app-agent',
      MYSQL_EXPORTER: 'mysql-exporter',
      POSTGRES_EXPORTER: 'postgres-exporter',
      MONGODB_EXPORTER: 'mongodb-exporter',
      NGINX_EXPORTER: 'nginx-exporter',
      APACHE_EXPORTER: 'apache-exporter',
    };
    for (const [type, job] of Object.entries(expected)) {
      expect(agentTypeToJobName(type)).toBe(job);
    }
  });

  it('should return null for unknown agent type', () => {
    expect(agentTypeToJobName('UNKNOWN_AGENT')).toBeNull();
  });
});

describe('Agent Registration Flow - Prometheus Target Generation', () => {
  it('should produce valid Prometheus file_sd_config JSON structure', () => {
    const targets = generateTargets([
      {
        id: 'srv-1',
        hostname: 'web-01',
        ipAddress: '10.0.0.5',
        environment: 'PRODUCTION',
        agents: [{ type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' }],
      },
    ]);
    const nodeTargets = targets['node-exporter'];
    expect(nodeTargets.length).toBe(1);
    expect(nodeTargets[0].targets).toEqual(['10.0.0.5:9100']);
    expect(nodeTargets[0].labels.server_id).toBe('srv-1');
    expect(nodeTargets[0].labels.hostname).toBe('web-01');
    expect(nodeTargets[0].labels.environment).toBe('production');

    // Verify it serializes to valid JSON
    const json = JSON.stringify(nodeTargets, null, 2);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].targets).toBeDefined();
    expect(parsed[0].labels).toBeDefined();
  });

  it('should only include RUNNING agents', () => {
    const targets = generateTargets([
      {
        id: 'srv-1',
        hostname: 'web-01',
        ipAddress: '10.0.0.5',
        environment: 'PRODUCTION',
        agents: [
          { type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' },
          { type: 'APP_AGENT', port: 9101, status: 'STOPPED' },
          { type: 'MYSQL_EXPORTER', port: 9104, status: 'FAILED' },
        ],
      },
    ]);
    expect(targets['node-exporter'].length).toBe(1);
    expect(targets['app-agent'].length).toBe(0);
    expect(targets['mysql-exporter'].length).toBe(0);
  });

  it('should include region label only when provided', () => {
    const withRegion = generateTargets([
      {
        id: 'srv-1',
        hostname: 'w1',
        ipAddress: '10.0.0.1',
        environment: 'PRODUCTION',
        region: 'us-east-1',
        agents: [{ type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' }],
      },
    ]);
    expect(withRegion['node-exporter'][0].labels.region).toBe('us-east-1');

    const withoutRegion = generateTargets([
      {
        id: 'srv-2',
        hostname: 'w2',
        ipAddress: '10.0.0.2',
        environment: 'STAGING',
        agents: [{ type: 'NODE_EXPORTER', port: 9100, status: 'RUNNING' }],
      },
    ]);
    expect(withoutRegion['node-exporter'][0].labels.region).toBeUndefined();
  });
});

describe('Agent Registration Flow - Heartbeat Status Mapping', () => {
  it('should map running -> RUNNING', () => {
    expect(mapHeartbeatStatus('running')).toBe('RUNNING');
  });

  it('should map stopped -> STOPPED', () => {
    expect(mapHeartbeatStatus('stopped')).toBe('STOPPED');
  });

  it('should map failed -> FAILED', () => {
    expect(mapHeartbeatStatus('failed')).toBe('FAILED');
  });

  it('should default unknown status to STOPPED', () => {
    expect(mapHeartbeatStatus('unknown')).toBe('STOPPED');
  });
});

describe('Agent Registration Flow - Server Status From Multiple Agents', () => {
  it('should be ONLINE when all agents running', () => {
    expect(calculateServerStatus([{ status: 'RUNNING' }, { status: 'RUNNING' }])).toBe('ONLINE');
  });

  it('should be WARNING when mixed running and failed', () => {
    expect(calculateServerStatus([{ status: 'RUNNING' }, { status: 'FAILED' }])).toBe('WARNING');
  });

  it('should be CRITICAL when only failed agents', () => {
    expect(calculateServerStatus([{ status: 'FAILED' }, { status: 'FAILED' }])).toBe('CRITICAL');
  });

  it('should be OFFLINE when all stopped', () => {
    expect(calculateServerStatus([{ status: 'STOPPED' }, { status: 'STOPPED' }])).toBe('OFFLINE');
  });

  it('should be OFFLINE for empty agent list', () => {
    expect(calculateServerStatus([])).toBe('OFFLINE');
  });

  it('should be ONLINE if running exists with stopped (no failed)', () => {
    expect(calculateServerStatus([{ status: 'RUNNING' }, { status: 'STOPPED' }])).toBe('ONLINE');
  });
});
