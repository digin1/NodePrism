describe('Load: Metric Collection - PromQL Query Generation', () => {
  // Mirrors NODE_METRIC_QUERIES from services/metricCollector.ts
  const NODE_METRIC_QUERIES: Record<string, (serverId: string) => string> = {
    cpu: (serverId) => `100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle", server_id="${serverId}"}[5m])) * 100)`,
    memory: (serverId) => `(1 - (node_memory_MemAvailable_bytes{server_id="${serverId}"} / node_memory_MemTotal_bytes{server_id="${serverId}"})) * 100`,
    disk: (serverId) => `(1 - (node_filesystem_avail_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"} / node_filesystem_size_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"})) * 100`,
    load1: (serverId) => `node_load1{server_id="${serverId}"}`,
    load5: (serverId) => `node_load5{server_id="${serverId}"}`,
    load15: (serverId) => `node_load15{server_id="${serverId}"}`,
    networkIn: (serverId) => `sum(irate(node_network_receive_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*"}[5m]))`,
    networkOut: (serverId) => `sum(irate(node_network_transmit_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*"}[5m]))`,
  };

  it('should generate valid PromQL for each metric type', () => {
    const serverId = 'test-server-1';
    for (const [name, queryFn] of Object.entries(NODE_METRIC_QUERIES)) {
      const query = queryFn(serverId);
      expect(query).toContain(serverId);
      expect(query.length).toBeGreaterThan(0);
    }
  });

  it('should embed the correct server_id label in every query', () => {
    const serverId = '550e8400-e29b-41d4-a716-446655440000';
    for (const queryFn of Object.values(NODE_METRIC_QUERIES)) {
      const query = queryFn(serverId);
      expect(query).toContain(`server_id="${serverId}"`);
    }
  });

  it('should generate unique queries for different server IDs', () => {
    const q1 = NODE_METRIC_QUERIES.cpu('server-a');
    const q2 = NODE_METRIC_QUERIES.cpu('server-b');
    expect(q1).not.toBe(q2);
  });

  it('should generate queries for all 8 node exporter metrics', () => {
    expect(Object.keys(NODE_METRIC_QUERIES)).toHaveLength(8);
    expect(Object.keys(NODE_METRIC_QUERIES)).toEqual(
      expect.arrayContaining(['cpu', 'memory', 'disk', 'load1', 'load5', 'load15', 'networkIn', 'networkOut'])
    );
  });

  it('should handle generating queries for 500 servers without error', () => {
    const queries: string[] = [];
    for (let i = 0; i < 500; i++) {
      for (const queryFn of Object.values(NODE_METRIC_QUERIES)) {
        queries.push(queryFn(`server-${i}`));
      }
    }
    expect(queries).toHaveLength(500 * 8);
    // Verify all queries are unique
    const unique = new Set(queries);
    expect(unique.size).toBe(4000);
  });
});

describe('Load: Metric Collection - MySQL Query Generation', () => {
  const MYSQL_METRIC_QUERIES: Record<string, (serverId: string) => string> = {
    mysqlConnections: (serverId) => `mysql_global_status_threads_connected{server_id="${serverId}"}`,
    mysqlMaxConnections: (serverId) => `mysql_global_variables_max_connections{server_id="${serverId}"}`,
    mysqlQueriesPerSec: (serverId) => `rate(mysql_global_status_queries{server_id="${serverId}"}[1m])`,
    mysqlSlowQueries: (serverId) => `mysql_global_status_slow_queries{server_id="${serverId}"}`,
    mysqlUptime: (serverId) => `mysql_global_status_uptime{server_id="${serverId}"}`,
    mysqlBufferPoolSize: (serverId) => `mysql_global_variables_innodb_buffer_pool_size{server_id="${serverId}"}`,
    mysqlBufferPoolUsed: (serverId) => `mysql_global_status_innodb_buffer_pool_bytes_data{server_id="${serverId}"}`,
  };

  it('should generate 7 MySQL metric queries', () => {
    expect(Object.keys(MYSQL_METRIC_QUERIES)).toHaveLength(7);
  });

  it('should embed server_id in all MySQL queries', () => {
    const serverId = 'mysql-server-1';
    for (const queryFn of Object.values(MYSQL_METRIC_QUERIES)) {
      expect(queryFn(serverId)).toContain(`server_id="${serverId}"`);
    }
  });
});

describe('Load: Metric Collection - Cache Behavior', () => {
  const CACHE_TTL_MS = 120_000; // 2 minutes, same as metricCollector.ts

  // Simulates the metric cache from metricCollector.ts
  const cache = new Map<string, { value: number; timestamp: number }>();

  function setCached(key: string, value: number, timestamp: number): void {
    cache.set(key, { value, timestamp });
  }

  function getCached(key: string, now: number): number | null {
    const entry = cache.get(key);
    if (entry && now - entry.timestamp < CACHE_TTL_MS) {
      return entry.value;
    }
    return null;
  }

  beforeEach(() => { cache.clear(); });

  it('should return cached value within TTL', () => {
    const now = Date.now();
    setCached('cpu-query', 45.5, now);
    expect(getCached('cpu-query', now + 60_000)).toBe(45.5); // 1 min later
  });

  it('should return null for expired cache entries', () => {
    const now = Date.now();
    setCached('cpu-query', 45.5, now);
    expect(getCached('cpu-query', now + 121_000)).toBeNull(); // Past 2-min TTL
  });

  it('should return null for unknown keys', () => {
    expect(getCached('nonexistent', Date.now())).toBeNull();
  });

  it('should update cached value on re-set', () => {
    const now = Date.now();
    setCached('cpu-query', 45.5, now);
    setCached('cpu-query', 78.3, now + 30_000);
    expect(getCached('cpu-query', now + 60_000)).toBe(78.3);
  });

  it('should handle 1000 cached entries without issue', () => {
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      setCached(`metric-${i}`, Math.random() * 100, now);
    }
    expect(cache.size).toBe(1000);
    // All should be retrievable within TTL
    for (let i = 0; i < 1000; i++) {
      expect(getCached(`metric-${i}`, now + 1000)).not.toBeNull();
    }
  });
});

describe('Load: Metric Collection - Collection Interval Calculation', () => {
  function parseIntervalSeconds(envValue: string | undefined, defaultSeconds: number): number {
    return parseInt(envValue || String(defaultSeconds), 10);
  }

  function intervalToMs(seconds: number): number {
    return seconds * 1000;
  }

  it('should default to 30 seconds', () => {
    expect(parseIntervalSeconds(undefined, 30)).toBe(30);
  });

  it('should convert to milliseconds correctly', () => {
    expect(intervalToMs(30)).toBe(30000);
    expect(intervalToMs(60)).toBe(60000);
  });

  it('should accept custom interval from env', () => {
    expect(parseIntervalSeconds('15', 30)).toBe(15);
    expect(parseIntervalSeconds('120', 30)).toBe(120);
  });
});

describe('Load: Metric Collection - Retention Calculation', () => {
  function retentionToMs(days: number): number {
    return days * 24 * 60 * 60 * 1000;
  }

  function getRetentionDate(retentionDays: number): Date {
    return new Date(Date.now() - retentionToMs(retentionDays));
  }

  it('should default retention to 7 days', () => {
    const defaultDays = 7;
    expect(retentionToMs(defaultDays)).toBe(604800000);
  });

  it('should calculate correct ms for various retention periods', () => {
    expect(retentionToMs(1)).toBe(86400000);
    expect(retentionToMs(14)).toBe(1209600000);
    expect(retentionToMs(30)).toBe(2592000000);
  });

  it('should produce a date in the past for retention cutoff', () => {
    const cutoff = getRetentionDate(7);
    expect(cutoff.getTime()).toBeLessThan(Date.now());
    // Should be approximately 7 days ago (within 1 second tolerance)
    const diff = Date.now() - cutoff.getTime();
    expect(diff).toBeCloseTo(retentionToMs(7), -3);
  });
});

describe('Load: Metric Collection - Null/Missing Metric Handling', () => {
  function filterNullMetrics(metrics: Record<string, number | null>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  it('should filter out null metric values', () => {
    const metrics = { cpu: 45.0, memory: null, disk: 30.0, load1: null };
    const filtered = filterNullMetrics(metrics);
    expect(Object.keys(filtered)).toHaveLength(2);
    expect(filtered).toHaveProperty('cpu', 45.0);
    expect(filtered).toHaveProperty('disk', 30.0);
    expect(filtered).not.toHaveProperty('memory');
    expect(filtered).not.toHaveProperty('load1');
  });

  it('should return empty object when all metrics are null', () => {
    const metrics = { cpu: null, memory: null, disk: null };
    expect(Object.keys(filterNullMetrics(metrics))).toHaveLength(0);
  });

  it('should keep all metrics when none are null', () => {
    const metrics = { cpu: 45.0, memory: 60.0, disk: 30.0 };
    expect(Object.keys(filterNullMetrics(metrics))).toHaveLength(3);
  });

  it('should handle large metric sets with mixed null values', () => {
    const metrics: Record<string, number | null> = {};
    for (let i = 0; i < 200; i++) {
      metrics[`metric_${i}`] = i % 3 === 0 ? null : i * 1.5;
    }
    const filtered = filterNullMetrics(metrics);
    const expectedNonNull = 200 - Math.floor(200 / 3) - 1; // indices 0,3,6,...,198 are null
    expect(Object.keys(filtered)).toHaveLength(expectedNonNull);
  });
});

describe('Load: Metric Collection - Batch Query Construction', () => {
  function buildBatchQueries(
    serverIds: string[],
    metricQueries: Record<string, (id: string) => string>
  ): { serverId: string; metric: string; query: string }[] {
    const batch: { serverId: string; metric: string; query: string }[] = [];
    for (const serverId of serverIds) {
      for (const [metric, queryFn] of Object.entries(metricQueries)) {
        batch.push({ serverId, metric, query: queryFn(serverId) });
      }
    }
    return batch;
  }

  const simpleQueries: Record<string, (id: string) => string> = {
    cpu: (id) => `cpu_query{server_id="${id}"}`,
    memory: (id) => `memory_query{server_id="${id}"}`,
    disk: (id) => `disk_query{server_id="${id}"}`,
  };

  it('should produce N * M queries for N servers and M metrics', () => {
    const servers = ['s1', 's2', 's3'];
    const batch = buildBatchQueries(servers, simpleQueries);
    expect(batch).toHaveLength(9); // 3 servers * 3 metrics
  });

  it('should handle 100 servers with 8 metrics (800 queries)', () => {
    const servers = Array.from({ length: 100 }, (_, i) => `server-${i}`);
    const eightMetrics: Record<string, (id: string) => string> = {};
    for (let i = 0; i < 8; i++) {
      eightMetrics[`metric${i}`] = (id) => `query_${i}{server_id="${id}"}`;
    }
    const batch = buildBatchQueries(servers, eightMetrics);
    expect(batch).toHaveLength(800);
  });

  it('should produce empty batch for no servers', () => {
    const batch = buildBatchQueries([], simpleQueries);
    expect(batch).toHaveLength(0);
  });

  it('should include correct serverId in each query entry', () => {
    const batch = buildBatchQueries(['test-1'], simpleQueries);
    for (const entry of batch) {
      expect(entry.serverId).toBe('test-1');
      expect(entry.query).toContain('test-1');
    }
  });
});
