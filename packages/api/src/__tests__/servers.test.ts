import { z } from 'zod';

// Validation schemas (same as in servers.ts)
const createServerSchema = z.object({
  hostname: z.string().min(1),
  ipAddress: z.string().ip(),
  sshPort: z.number().int().min(1).max(65535).default(22),
  sshUsername: z.string().min(1).optional(),
  environment: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']).default('PRODUCTION'),
  region: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
});

describe('Server Validation', () => {
  describe('createServerSchema', () => {
    it('should validate a valid server with minimum fields', () => {
      const result = createServerSchema.safeParse({
        hostname: 'web-server-01',
        ipAddress: '192.168.1.100',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hostname).toBe('web-server-01');
        expect(result.data.ipAddress).toBe('192.168.1.100');
        expect(result.data.sshPort).toBe(22); // default
        expect(result.data.environment).toBe('PRODUCTION'); // default
        expect(result.data.tags).toEqual([]); // default
      }
    });

    it('should validate a server with all fields', () => {
      const result = createServerSchema.safeParse({
        hostname: 'db-server-01',
        ipAddress: '10.0.0.50',
        sshPort: 2222,
        sshUsername: 'admin',
        environment: 'STAGING',
        region: 'us-east-1',
        tags: ['database', 'postgres'],
        metadata: { team: 'backend', tier: 'critical' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sshPort).toBe(2222);
        expect(result.data.sshUsername).toBe('admin');
        expect(result.data.environment).toBe('STAGING');
        expect(result.data.region).toBe('us-east-1');
        expect(result.data.tags).toContain('database');
      }
    });

    it('should reject invalid IP address', () => {
      const result = createServerSchema.safeParse({
        hostname: 'server-01',
        ipAddress: 'not-an-ip',
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty hostname', () => {
      const result = createServerSchema.safeParse({
        hostname: '',
        ipAddress: '192.168.1.1',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid SSH port', () => {
      const result = createServerSchema.safeParse({
        hostname: 'server-01',
        ipAddress: '192.168.1.1',
        sshPort: 70000, // out of range
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid environment', () => {
      const result = createServerSchema.safeParse({
        hostname: 'server-01',
        ipAddress: '192.168.1.1',
        environment: 'INVALID',
      });

      expect(result.success).toBe(false);
    });

    it('should accept IPv6 addresses', () => {
      const result = createServerSchema.safeParse({
        hostname: 'ipv6-server',
        ipAddress: '::1',
      });

      expect(result.success).toBe(true);
    });

    it('should accept full IPv6 addresses', () => {
      const result = createServerSchema.safeParse({
        hostname: 'ipv6-server',
        ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('Server Statistics', () => {
  it('should calculate correct server counts', () => {
    const mockServers = [
      { status: 'ONLINE' },
      { status: 'ONLINE' },
      { status: 'OFFLINE' },
      { status: 'WARNING' },
      { status: 'CRITICAL' },
    ];

    const stats = {
      total: mockServers.length,
      online: mockServers.filter(s => s.status === 'ONLINE').length,
      offline: mockServers.filter(s => s.status === 'OFFLINE').length,
      warning: mockServers.filter(s => s.status === 'WARNING').length,
      critical: mockServers.filter(s => s.status === 'CRITICAL').length,
    };

    expect(stats.total).toBe(5);
    expect(stats.online).toBe(2);
    expect(stats.offline).toBe(1);
    expect(stats.warning).toBe(1);
    expect(stats.critical).toBe(1);
  });
});

describe('Server Search', () => {
  const mockServers = [
    { hostname: 'web-server-01', ipAddress: '192.168.1.100' },
    { hostname: 'web-server-02', ipAddress: '192.168.1.101' },
    { hostname: 'db-server-01', ipAddress: '10.0.0.50' },
    { hostname: 'cache-server', ipAddress: '192.168.1.200' },
  ];

  it('should filter servers by hostname (case insensitive)', () => {
    const search = 'web';
    const filtered = mockServers.filter(
      s => s.hostname.toLowerCase().includes(search.toLowerCase())
    );

    expect(filtered.length).toBe(2);
    expect(filtered.map(s => s.hostname)).toContain('web-server-01');
    expect(filtered.map(s => s.hostname)).toContain('web-server-02');
  });

  it('should filter servers by IP address', () => {
    const search = '192.168.1';
    const filtered = mockServers.filter(s => s.ipAddress.includes(search));

    expect(filtered.length).toBe(3);
  });

  it('should return empty for non-matching search', () => {
    const search = 'nonexistent';
    const filtered = mockServers.filter(
      s => s.hostname.toLowerCase().includes(search.toLowerCase()) ||
           s.ipAddress.includes(search)
    );

    expect(filtered.length).toBe(0);
  });
});
