/**
 * Integration flow test: Container Reporting Flow
 *
 * Tests the data flow: agent reports containers -> upsert logic -> missing
 * containers marked stopped -> BigInt serialization. All functions are pure
 * inline mirrors of the real service logic (routes/containers.ts).
 */

// ---------------------------------------------------------------------------
// Pure functions mirroring real service logic
// ---------------------------------------------------------------------------

interface ContainerRecord {
  serverId: string;
  containerId: string;
  name: string;
  type: string;
  status: string;
  ipAddress: string | null;
  hostname: string | null;
  networkRxBytes: bigint;
  networkTxBytes: bigint;
  metadata?: Record<string, any>;
  lastSeen: Date;
}

/**
 * Determines the upsert match key for a container.
 * Mirrors routes/containers.ts compound unique key [serverId, containerId].
 */
function containerUpsertKey(
  serverId: string,
  containerId: string,
): string {
  return `${serverId}::${containerId}`;
}

/**
 * Simulates the container upsert logic from routes/containers.ts.
 * Returns the updated store after processing a report.
 */
function processContainerReport(
  existingContainers: Map<string, ContainerRecord>,
  report: {
    serverId: string;
    containers: Array<{
      containerId: string;
      name: string;
      type: string;
      status: string;
      ipAddress?: string | null;
      hostname?: string | null;
      networkRxBytes?: number;
      networkTxBytes?: number;
      metadata?: Record<string, any>;
    }>;
  },
): Map<string, ContainerRecord> {
  const now = new Date();
  const reportedIds: string[] = [];
  const updated = new Map(existingContainers);

  for (const c of report.containers) {
    const key = containerUpsertKey(report.serverId, c.containerId);
    reportedIds.push(c.containerId);

    updated.set(key, {
      serverId: report.serverId,
      containerId: c.containerId,
      name: c.name,
      type: c.type,
      status: c.status,
      ipAddress: c.ipAddress ?? null,
      hostname: c.hostname ?? null,
      networkRxBytes: BigInt(c.networkRxBytes ?? 0),
      networkTxBytes: BigInt(c.networkTxBytes ?? 0),
      metadata: c.metadata,
      lastSeen: now,
    });
  }

  // Mark containers NOT in report as stopped (if they belong to this server)
  if (reportedIds.length > 0) {
    for (const [key, container] of updated) {
      if (
        container.serverId === report.serverId &&
        !reportedIds.includes(container.containerId) &&
        container.status !== 'stopped'
      ) {
        updated.set(key, { ...container, status: 'stopped' });
      }
    }
  }

  return updated;
}

/**
 * Serializes BigInt fields to strings for JSON response.
 * Mirrors routes/containers.ts serialization logic.
 */
function serializeContainers(
  containers: Array<{
    networkRxBytes: bigint;
    networkTxBytes: bigint;
    [key: string]: unknown;
  }>,
): Array<Record<string, unknown>> {
  return containers.map((c) => ({
    ...c,
    networkRxBytes: c.networkRxBytes.toString(),
    networkTxBytes: c.networkTxBytes.toString(),
  }));
}

/**
 * Validates container type against allowed values.
 * Mirrors routes/containers.ts containerSchema type enum.
 */
function isValidContainerType(type: string): boolean {
  const validTypes = ['openvz', 'kvm', 'virtuozzo', 'docker', 'lxc'];
  return validTypes.includes(type);
}

/**
 * Accumulates network bytes from successive reports.
 * The agent sends total cumulative bytes each time.
 * The difference represents traffic since the last report.
 */
function calculateNetworkDelta(
  previousRxBytes: bigint,
  previousTxBytes: bigint,
  currentRxBytes: bigint,
  currentTxBytes: bigint,
): { rxDelta: bigint; txDelta: bigint } {
  // Counters can reset (container restart), so clamp at 0
  const rxDelta = currentRxBytes >= previousRxBytes
    ? currentRxBytes - previousRxBytes
    : currentRxBytes; // counter reset
  const txDelta = currentTxBytes >= previousTxBytes
    ? currentTxBytes - previousTxBytes
    : currentTxBytes; // counter reset
  return { rxDelta, txDelta };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Container Flow - Upsert Matching', () => {
  it('should produce same key for same serverId + containerId', () => {
    const k1 = containerUpsertKey('srv-1', 'ct-100');
    const k2 = containerUpsertKey('srv-1', 'ct-100');
    expect(k1).toBe(k2);
  });

  it('should produce different keys for different serverIds', () => {
    const k1 = containerUpsertKey('srv-1', 'ct-100');
    const k2 = containerUpsertKey('srv-2', 'ct-100');
    expect(k1).not.toBe(k2);
  });

  it('should produce different keys for different containerIds', () => {
    const k1 = containerUpsertKey('srv-1', 'ct-100');
    const k2 = containerUpsertKey('srv-1', 'ct-200');
    expect(k1).not.toBe(k2);
  });
});

describe('Container Flow - Container Report Processing', () => {
  it('should insert new containers from a report', () => {
    const store = new Map<string, ContainerRecord>();
    const result = processContainerReport(store, {
      serverId: 'srv-1',
      containers: [
        { containerId: 'ct-1', name: 'web', type: 'kvm', status: 'running' },
        { containerId: 'ct-2', name: 'db', type: 'docker', status: 'running' },
      ],
    });
    expect(result.size).toBe(2);
    expect(result.get('srv-1::ct-1')!.name).toBe('web');
    expect(result.get('srv-1::ct-2')!.name).toBe('db');
  });

  it('should update existing container data on re-report', () => {
    const store = new Map<string, ContainerRecord>();
    // First report
    const after1 = processContainerReport(store, {
      serverId: 'srv-1',
      containers: [
        { containerId: 'ct-1', name: 'web', type: 'kvm', status: 'running' },
      ],
    });

    // Second report with updated name and status
    const after2 = processContainerReport(after1, {
      serverId: 'srv-1',
      containers: [
        {
          containerId: 'ct-1',
          name: 'web-updated',
          type: 'kvm',
          status: 'paused',
        },
      ],
    });
    expect(after2.size).toBe(1);
    expect(after2.get('srv-1::ct-1')!.name).toBe('web-updated');
    expect(after2.get('srv-1::ct-1')!.status).toBe('paused');
  });

  it('should mark disappeared containers as stopped', () => {
    const store = new Map<string, ContainerRecord>();
    // Report with two containers
    const after1 = processContainerReport(store, {
      serverId: 'srv-1',
      containers: [
        { containerId: 'ct-1', name: 'web', type: 'kvm', status: 'running' },
        { containerId: 'ct-2', name: 'db', type: 'docker', status: 'running' },
      ],
    });
    expect(after1.get('srv-1::ct-2')!.status).toBe('running');

    // Report with only ct-1 (ct-2 disappeared)
    const after2 = processContainerReport(after1, {
      serverId: 'srv-1',
      containers: [
        { containerId: 'ct-1', name: 'web', type: 'kvm', status: 'running' },
      ],
    });
    expect(after2.get('srv-1::ct-1')!.status).toBe('running');
    expect(after2.get('srv-1::ct-2')!.status).toBe('stopped');
  });

  it('should not mark containers on other servers as stopped', () => {
    const store = new Map<string, ContainerRecord>();
    // Server 1 report
    const after1 = processContainerReport(store, {
      serverId: 'srv-1',
      containers: [
        { containerId: 'ct-1', name: 'web', type: 'kvm', status: 'running' },
      ],
    });

    // Server 2 report
    const after2 = processContainerReport(after1, {
      serverId: 'srv-2',
      containers: [
        { containerId: 'ct-2', name: 'db', type: 'docker', status: 'running' },
      ],
    });

    // Server 1's container should still be running
    expect(after2.get('srv-1::ct-1')!.status).toBe('running');
    expect(after2.get('srv-2::ct-2')!.status).toBe('running');
  });

  it('should default networkBytes to 0 when not provided', () => {
    const store = new Map<string, ContainerRecord>();
    const result = processContainerReport(store, {
      serverId: 'srv-1',
      containers: [
        { containerId: 'ct-1', name: 'web', type: 'kvm', status: 'running' },
      ],
    });
    expect(result.get('srv-1::ct-1')!.networkRxBytes).toBe(BigInt(0));
    expect(result.get('srv-1::ct-1')!.networkTxBytes).toBe(BigInt(0));
  });
});

describe('Container Flow - BigInt Serialization', () => {
  it('should convert BigInt to string', () => {
    const containers = [
      { id: '1', name: 'vm1', networkRxBytes: BigInt(1024000), networkTxBytes: BigInt(512000) },
    ];
    const serialized = serializeContainers(containers);
    expect(serialized[0].networkRxBytes).toBe('1024000');
    expect(serialized[0].networkTxBytes).toBe('512000');
    expect(typeof serialized[0].networkRxBytes).toBe('string');
  });

  it('should handle zero values', () => {
    const containers = [
      { networkRxBytes: BigInt(0), networkTxBytes: BigInt(0) },
    ];
    const serialized = serializeContainers(containers);
    expect(serialized[0].networkRxBytes).toBe('0');
    expect(serialized[0].networkTxBytes).toBe('0');
  });

  it('should handle very large values without precision loss', () => {
    const containers = [
      {
        networkRxBytes: BigInt('18446744073709551615'),
        networkTxBytes: BigInt('9999999999999999999'),
      },
    ];
    const serialized = serializeContainers(containers);
    expect(serialized[0].networkRxBytes).toBe('18446744073709551615');
    expect(serialized[0].networkTxBytes).toBe('9999999999999999999');
  });

  it('should preserve other fields unchanged', () => {
    const containers = [
      { id: 'abc', name: 'vm1', networkRxBytes: BigInt(100), networkTxBytes: BigInt(200) },
    ];
    const serialized = serializeContainers(containers);
    expect(serialized[0].id).toBe('abc');
    expect(serialized[0].name).toBe('vm1');
  });
});

describe('Container Flow - Type Validation', () => {
  it('should accept all valid container types', () => {
    const types = ['openvz', 'kvm', 'docker', 'lxc', 'virtuozzo'];
    for (const t of types) {
      expect(isValidContainerType(t)).toBe(true);
    }
  });

  it('should reject invalid container types', () => {
    expect(isValidContainerType('vmware')).toBe(false);
    expect(isValidContainerType('hyper-v')).toBe(false);
    expect(isValidContainerType('')).toBe(false);
    expect(isValidContainerType('KVM')).toBe(false); // case sensitive
  });
});

describe('Container Flow - Network Byte Accumulation', () => {
  it('should calculate delta for increasing counters', () => {
    const delta = calculateNetworkDelta(
      BigInt(1000),
      BigInt(500),
      BigInt(2000),
      BigInt(1500),
    );
    expect(delta.rxDelta).toBe(BigInt(1000));
    expect(delta.txDelta).toBe(BigInt(1000));
  });

  it('should handle counter reset (container restart)', () => {
    const delta = calculateNetworkDelta(
      BigInt(5000),
      BigInt(3000),
      BigInt(100), // reset to small value
      BigInt(50),
    );
    expect(delta.rxDelta).toBe(BigInt(100));
    expect(delta.txDelta).toBe(BigInt(50));
  });

  it('should handle zero delta (no traffic)', () => {
    const delta = calculateNetworkDelta(
      BigInt(1000),
      BigInt(500),
      BigInt(1000),
      BigInt(500),
    );
    expect(delta.rxDelta).toBe(BigInt(0));
    expect(delta.txDelta).toBe(BigInt(0));
  });

  it('should handle first report (previous = 0)', () => {
    const delta = calculateNetworkDelta(
      BigInt(0),
      BigInt(0),
      BigInt(1024),
      BigInt(512),
    );
    expect(delta.rxDelta).toBe(BigInt(1024));
    expect(delta.txDelta).toBe(BigInt(512));
  });
});
