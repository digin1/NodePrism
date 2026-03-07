import { z } from 'zod';

// Validation schema (mirroring routes/containers.ts)
const containerReportSchema = z.object({
  serverId: z.string().uuid(),
  containers: z.array(z.object({
    containerId: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['kvm', 'openvz', 'virtuozzo', 'docker', 'lxc']),
    status: z.string().min(1),
    ipAddress: z.string().optional().nullable(),
    hostname: z.string().optional().nullable(),
    networkRxBytes: z.number().int().min(0).default(0),
    networkTxBytes: z.number().int().min(0).default(0),
    metadata: z.record(z.any()).optional(),
  })),
});

describe('Container Report Validation', () => {
  it('should accept valid KVM container report', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [
        {
          containerId: 'kvm-vm1',
          name: 'web-server',
          type: 'kvm',
          status: 'running',
          ipAddress: '192.168.122.10',
          hostname: 'web-server.local',
          networkRxBytes: 1024000,
          networkTxBytes: 512000,
          metadata: { memory: '4096', vcpus: '2' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid OpenVZ container report', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [
        {
          containerId: '101',
          name: 'vps-101',
          type: 'openvz',
          status: 'running',
          ipAddress: '10.0.0.101',
          hostname: 'vps101.example.com',
          networkRxBytes: 5000000,
          networkTxBytes: 2000000,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept multiple containers of different types', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [
        { containerId: 'kvm-1', name: 'vm1', type: 'kvm', status: 'running' },
        { containerId: 'kvm-2', name: 'vm2', type: 'kvm', status: 'shut off' },
        { containerId: '101', name: 'ct101', type: 'openvz', status: 'running' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.containers.length).toBe(3);
    }
  });

  it('should accept empty container list', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid container type', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [
        { containerId: '1', name: 'test', type: 'vmware', status: 'running' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-UUID serverId', () => {
    const result = containerReportSchema.safeParse({
      serverId: 'not-a-uuid',
      containers: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative network bytes', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [
        { containerId: '1', name: 'test', type: 'kvm', status: 'running', networkRxBytes: -100 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('should default networkBytes to 0', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [
        { containerId: '1', name: 'test', type: 'kvm', status: 'running' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.containers[0].networkRxBytes).toBe(0);
      expect(result.data.containers[0].networkTxBytes).toBe(0);
    }
  });

  it('should accept null IP and hostname', () => {
    const result = containerReportSchema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      containers: [
        { containerId: '1', name: 'test', type: 'docker', status: 'running', ipAddress: null, hostname: null },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('BigInt Serialization', () => {
  // Mirrors the serialization logic in containers.ts route
  function serializeContainers(containers: { networkRxBytes: bigint; networkTxBytes: bigint; [key: string]: unknown }[]) {
    return containers.map(c => ({
      ...c,
      networkRxBytes: c.networkRxBytes.toString(),
      networkTxBytes: c.networkTxBytes.toString(),
    }));
  }

  it('should serialize BigInt to string', () => {
    const containers = [
      { id: '1', name: 'vm1', networkRxBytes: BigInt(1024000), networkTxBytes: BigInt(512000) },
      { id: '2', name: 'vm2', networkRxBytes: BigInt(0), networkTxBytes: BigInt(0) },
    ];
    const serialized = serializeContainers(containers);

    expect(serialized[0].networkRxBytes).toBe('1024000');
    expect(serialized[0].networkTxBytes).toBe('512000');
    expect(serialized[1].networkRxBytes).toBe('0');
    expect(typeof serialized[0].networkRxBytes).toBe('string');
  });

  it('should handle large values', () => {
    const containers = [
      { networkRxBytes: BigInt('9999999999999999'), networkTxBytes: BigInt('8888888888888888') },
    ];
    const serialized = serializeContainers(containers);
    expect(serialized[0].networkRxBytes).toBe('9999999999999999');
  });
});
