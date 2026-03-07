import { z } from 'zod';

// Validation schemas (mirroring routes/agents.ts)
const registerAgentSchema = z.object({
  hostname: z.string().min(1),
  ipAddress: z.string().ip(),
  agentType: z.enum([
    'NODE_EXPORTER',
    'APP_AGENT',
    'MYSQL_EXPORTER',
    'POSTGRES_EXPORTER',
    'MONGODB_EXPORTER',
    'NGINX_EXPORTER',
    'APACHE_EXPORTER',
    'PROMTAIL',
  ]),
  port: z.number().int().min(1).max(65535),
  version: z.string().default('1.0.0'),
  metadata: z.record(z.string(), z.any()).optional(),
});

const heartbeatSchema = z.object({
  agentId: z.string().uuid(),
  status: z.enum(['running', 'stopped', 'failed']).default('running'),
  metrics: z.object({
    uptime: z.number().optional(),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
  }).optional(),
});

describe('Agent Registration Validation', () => {
  it('should accept valid node_exporter registration', () => {
    const result = registerAgentSchema.safeParse({
      hostname: 'web-server-01',
      ipAddress: '192.168.1.100',
      agentType: 'NODE_EXPORTER',
      port: 9100,
      version: '1.7.0',
    });
    expect(result.success).toBe(true);
  });

  it('should accept registration with OS metadata', () => {
    const result = registerAgentSchema.safeParse({
      hostname: 'web-server-01',
      ipAddress: '10.0.0.5',
      agentType: 'NODE_EXPORTER',
      port: 9100,
      metadata: {
        os: {
          name: 'Ubuntu',
          version: '22.04',
          kernel: '5.15.0-91-generic',
          arch: 'x86_64',
        },
        hardware: {
          cpuModel: 'Intel Xeon E5-2680',
          cpuCores: 8,
          totalMemoryKB: 16384000,
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0.0'); // default
    }
  });

  it('should accept all valid agent types', () => {
    const types = [
      'NODE_EXPORTER', 'APP_AGENT', 'MYSQL_EXPORTER',
      'POSTGRES_EXPORTER', 'MONGODB_EXPORTER', 'NGINX_EXPORTER',
      'APACHE_EXPORTER', 'PROMTAIL',
    ];
    for (const type of types) {
      const result = registerAgentSchema.safeParse({
        hostname: 'server',
        ipAddress: '10.0.0.1',
        agentType: type,
        port: 9100,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject unknown agent type', () => {
    const result = registerAgentSchema.safeParse({
      hostname: 'server',
      ipAddress: '10.0.0.1',
      agentType: 'UNKNOWN_AGENT',
      port: 9100,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid IP address', () => {
    const result = registerAgentSchema.safeParse({
      hostname: 'server',
      ipAddress: 'not-an-ip',
      agentType: 'NODE_EXPORTER',
      port: 9100,
    });
    expect(result.success).toBe(false);
  });

  it('should reject port out of range', () => {
    const high = registerAgentSchema.safeParse({
      hostname: 'server',
      ipAddress: '10.0.0.1',
      agentType: 'NODE_EXPORTER',
      port: 70000,
    });
    expect(high.success).toBe(false);

    const zero = registerAgentSchema.safeParse({
      hostname: 'server',
      ipAddress: '10.0.0.1',
      agentType: 'NODE_EXPORTER',
      port: 0,
    });
    expect(zero.success).toBe(false);
  });

  it('should reject empty hostname', () => {
    const result = registerAgentSchema.safeParse({
      hostname: '',
      ipAddress: '10.0.0.1',
      agentType: 'NODE_EXPORTER',
      port: 9100,
    });
    expect(result.success).toBe(false);
  });

  it('should accept IPv6 addresses', () => {
    const result = registerAgentSchema.safeParse({
      hostname: 'ipv6-server',
      ipAddress: '::1',
      agentType: 'NODE_EXPORTER',
      port: 9100,
    });
    expect(result.success).toBe(true);
  });
});

describe('Agent Heartbeat Validation', () => {
  it('should accept valid heartbeat', () => {
    const result = heartbeatSchema.safeParse({
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'running',
      metrics: {
        uptime: 86400,
        memoryUsage: 45.2,
        cpuUsage: 12.5,
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept heartbeat without metrics', () => {
    const result = heartbeatSchema.safeParse({
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'running',
    });
    expect(result.success).toBe(true);
  });

  it('should default status to running', () => {
    const result = heartbeatSchema.safeParse({
      agentId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('running');
    }
  });

  it('should reject non-UUID agentId', () => {
    const result = heartbeatSchema.safeParse({
      agentId: 'not-a-uuid',
      status: 'running',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid status', () => {
    const result = heartbeatSchema.safeParse({
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});

describe('Server Status Logic', () => {
  // Mirrors the heartbeat handler's server status calculation
  function calculateServerStatus(agents: { status: string }[]): string {
    const hasRunning = agents.some(a => a.status === 'RUNNING');
    const hasFailed = agents.some(a => a.status === 'FAILED');

    if (hasRunning && !hasFailed) return 'ONLINE';
    if (hasRunning && hasFailed) return 'WARNING';
    if (hasFailed) return 'CRITICAL';
    return 'OFFLINE';
  }

  it('should be ONLINE when all agents running', () => {
    expect(calculateServerStatus([
      { status: 'RUNNING' },
      { status: 'RUNNING' },
    ])).toBe('ONLINE');
  });

  it('should be WARNING when mixed running and failed', () => {
    expect(calculateServerStatus([
      { status: 'RUNNING' },
      { status: 'FAILED' },
    ])).toBe('WARNING');
  });

  it('should be CRITICAL when only failed agents', () => {
    expect(calculateServerStatus([
      { status: 'FAILED' },
      { status: 'FAILED' },
    ])).toBe('CRITICAL');
  });

  it('should be OFFLINE when no running or failed agents', () => {
    expect(calculateServerStatus([
      { status: 'STOPPED' },
      { status: 'STOPPED' },
    ])).toBe('OFFLINE');
  });

  it('should be OFFLINE for empty agent list', () => {
    expect(calculateServerStatus([])).toBe('OFFLINE');
  });
});
