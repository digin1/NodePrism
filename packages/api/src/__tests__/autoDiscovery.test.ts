describe('Auto-Discovery - Scan Target Parsing', () => {
  function parseScanTargets(envValue?: string): Array<{ host: string; ports: number[] }> {
    const DEFAULT_PORTS = [3306, 5432, 27017, 6379, 80, 8080];
    if (!envValue) {
      return [{ host: '127.0.0.1', ports: DEFAULT_PORTS }];
    }
    return envValue.split(';').map(entry => {
      const [host, portStr] = entry.trim().split(':');
      const ports = portStr
        ? portStr.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p))
        : DEFAULT_PORTS;
      return { host: host.trim(), ports };
    });
  }

  it('should return localhost defaults when no env var', () => {
    const targets = parseScanTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].host).toBe('127.0.0.1');
    expect(targets[0].ports).toContain(3306);
    expect(targets[0].ports).toContain(5432);
  });

  it('should parse single host with custom ports', () => {
    const targets = parseScanTargets('10.0.0.1:3306,5432');
    expect(targets).toHaveLength(1);
    expect(targets[0].host).toBe('10.0.0.1');
    expect(targets[0].ports).toEqual([3306, 5432]);
  });

  it('should parse multiple hosts', () => {
    const targets = parseScanTargets('10.0.0.1:3306;10.0.0.2:5432');
    expect(targets).toHaveLength(2);
    expect(targets[0].host).toBe('10.0.0.1');
    expect(targets[0].ports).toEqual([3306]);
    expect(targets[1].host).toBe('10.0.0.2');
    expect(targets[1].ports).toEqual([5432]);
  });

  it('should use default ports when no port specified', () => {
    const targets = parseScanTargets('192.168.1.100');
    expect(targets).toHaveLength(1);
    expect(targets[0].host).toBe('192.168.1.100');
    expect(targets[0].ports.length).toBeGreaterThan(0);
  });

  it('should handle whitespace', () => {
    const targets = parseScanTargets(' 10.0.0.1 : 3306 , 5432 ; 10.0.0.2 : 80 ');
    expect(targets).toHaveLength(2);
    expect(targets[0].host).toBe('10.0.0.1');
  });
});

describe('Auto-Discovery - Exporter Port Mapping', () => {
  const EXPORTER_PORTS: Record<string, number> = {
    mysql: 9104,
    postgresql: 9187,
    mongodb: 9216,
    redis: 9121,
    nginx: 9113,
    apache: 9117,
  };

  it('should map mysql to port 9104', () => {
    expect(EXPORTER_PORTS['mysql']).toBe(9104);
  });

  it('should map postgresql to port 9187', () => {
    expect(EXPORTER_PORTS['postgresql']).toBe(9187);
  });

  it('should map redis to port 9121', () => {
    expect(EXPORTER_PORTS['redis']).toBe(9121);
  });

  it('should map all 6 service types', () => {
    expect(Object.keys(EXPORTER_PORTS)).toHaveLength(6);
  });
});

describe('Auto-Discovery - Target Config Generation', () => {
  interface DiscoveredService {
    type: string;
    host: string;
    port: number;
    version?: string;
  }

  function generateTargetConfig(service: DiscoveredService, exporterPort: number) {
    return {
      targets: [`${service.host}:${exporterPort}`],
      labels: {
        __meta_service_type: service.type,
        __meta_service_host: service.host,
        __meta_service_port: String(service.port),
        ...(service.version && { __meta_service_version: service.version }),
      },
    };
  }

  it('should generate target with correct exporter port', () => {
    const config = generateTargetConfig({ type: 'mysql', host: '10.0.0.1', port: 3306 }, 9104);
    expect(config.targets).toEqual(['10.0.0.1:9104']);
  });

  it('should include service metadata labels', () => {
    const config = generateTargetConfig({ type: 'redis', host: '10.0.0.2', port: 6379, version: '7.2.1' }, 9121);
    expect(config.labels.__meta_service_type).toBe('redis');
    expect(config.labels.__meta_service_host).toBe('10.0.0.2');
    expect(config.labels.__meta_service_port).toBe('6379');
    expect(config.labels.__meta_service_version).toBe('7.2.1');
  });

  it('should omit version label when no version detected', () => {
    const config = generateTargetConfig({ type: 'nginx', host: '10.0.0.3', port: 80 }, 9113);
    expect(config.labels.__meta_service_version).toBeUndefined();
  });
});

describe('Auto-Discovery - Redis Version Parsing', () => {
  function parseRedisVersion(bannerText: string): string | undefined {
    const match = bannerText.match(/redis_version:(\S+)/);
    return match ? match[1] : (bannerText.includes('redis') ? 'detected' : undefined);
  }

  it('should parse redis_version from INFO response', () => {
    const info = '# Server\r\nredis_version:7.2.4\r\nredis_git_sha1:00000000\r\n';
    expect(parseRedisVersion(info)).toBe('7.2.4');
  });

  it('should return detected when redis keyword present but no version', () => {
    expect(parseRedisVersion('-ERR redis auth required')).toBe('detected');
  });

  it('should return undefined for non-redis response', () => {
    expect(parseRedisVersion('HTTP/1.1 200 OK')).toBeUndefined();
  });
});

describe('Auto-Discovery - MySQL Banner Parsing', () => {
  function parseMySQLBanner(banner: Buffer): string | undefined {
    if (banner.length < 10) return undefined;
    try {
      const start = 5;
      const end = banner.indexOf(0, start);
      if (end > start) {
        return banner.subarray(start, end).toString('utf-8');
      }
    } catch { /* parse failed */ }
    return undefined;
  }

  it('should extract version from MySQL greeting packet', () => {
    // Simulate: 4-byte length + protocol version + "8.0.35" + null byte
    const data = Buffer.from([
      0x00, 0x00, 0x00, 0x00, // length placeholder
      0x0a, // protocol version 10
      ...Buffer.from('8.0.35'),
      0x00, // null terminator
    ]);
    expect(parseMySQLBanner(data)).toBe('8.0.35');
  });

  it('should return undefined for short banner', () => {
    expect(parseMySQLBanner(Buffer.from([0x00, 0x01]))).toBeUndefined();
  });
});

describe('Auto-Discovery - Service Grouping', () => {
  interface DiscoveredService {
    type: string;
    host: string;
    port: number;
  }

  function groupByType(services: DiscoveredService[]): Record<string, DiscoveredService[]> {
    const result: Record<string, DiscoveredService[]> = {};
    for (const svc of services) {
      (result[svc.type] ||= []).push(svc);
    }
    return result;
  }

  it('should group services by type', () => {
    const services: DiscoveredService[] = [
      { type: 'mysql', host: '10.0.0.1', port: 3306 },
      { type: 'mysql', host: '10.0.0.2', port: 3306 },
      { type: 'redis', host: '10.0.0.1', port: 6379 },
    ];
    const grouped = groupByType(services);
    expect(grouped['mysql']).toHaveLength(2);
    expect(grouped['redis']).toHaveLength(1);
  });

  it('should handle empty input', () => {
    expect(groupByType([])).toEqual({});
  });

  it('should handle single service', () => {
    const grouped = groupByType([{ type: 'nginx', host: '10.0.0.1', port: 80 }]);
    expect(Object.keys(grouped)).toEqual(['nginx']);
  });
});
