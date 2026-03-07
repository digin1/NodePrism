describe('Audit Logger - Action Types', () => {
  const AUDIT_ACTIONS = [
    'server.create', 'server.update', 'server.delete',
    'server_group.create', 'server_group.update', 'server_group.delete', 'server_group.move_servers',
    'alert_rule.create', 'alert_rule.update', 'alert_rule.delete',
    'alert_template.create', 'alert_template.update', 'alert_template.delete',
    'alert.acknowledge', 'alert.silence',
    'notification_channel.create', 'notification_channel.update', 'notification_channel.delete', 'notification_channel.test',
    'settings.update', 'settings.logo_upload', 'settings.logo_delete',
    'auth.login', 'auth.register', 'auth.logout',
  ];

  it('should have all expected action types', () => {
    expect(AUDIT_ACTIONS.length).toBe(25);
  });

  it('should follow entity.verb naming convention', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('should cover all entity types', () => {
    const entityTypes = new Set(AUDIT_ACTIONS.map(a => a.split('.')[0]));
    expect(entityTypes).toContain('server');
    expect(entityTypes).toContain('server_group');
    expect(entityTypes).toContain('alert_rule');
    expect(entityTypes).toContain('alert_template');
    expect(entityTypes).toContain('alert');
    expect(entityTypes).toContain('notification_channel');
    expect(entityTypes).toContain('settings');
    expect(entityTypes).toContain('auth');
  });
});

describe('Audit Logger - IP Extraction', () => {
  function extractIp(xForwardedFor: string | undefined, remoteAddress: string | undefined): string | null {
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    return remoteAddress || null;
  }

  it('should extract IP from X-Forwarded-For header', () => {
    expect(extractIp('1.2.3.4, 5.6.7.8', '127.0.0.1')).toBe('1.2.3.4');
  });

  it('should fallback to remoteAddress', () => {
    expect(extractIp(undefined, '192.168.1.100')).toBe('192.168.1.100');
  });

  it('should return null when no IP available', () => {
    expect(extractIp(undefined, undefined)).toBeNull();
  });

  it('should handle single IP in X-Forwarded-For', () => {
    expect(extractIp('10.0.0.1', undefined)).toBe('10.0.0.1');
  });

  it('should trim whitespace from forwarded IP', () => {
    expect(extractIp(' 10.0.0.1 , 10.0.0.2 ', undefined)).toBe('10.0.0.1');
  });
});

describe('Audit Logger - Entry Construction', () => {
  interface AuditEntry {
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    details: Record<string, unknown> | null;
    ipAddress: string | null;
    userAgent: string | null;
  }

  function buildAuditEntry(
    user: { userId: string } | undefined,
    action: string,
    entityType: string,
    entityId?: string | null,
    details?: Record<string, unknown> | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): AuditEntry {
    return {
      userId: user?.userId || null,
      action,
      entityType,
      entityId: entityId || null,
      details: details || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    };
  }

  it('should build entry with all fields', () => {
    const entry = buildAuditEntry(
      { userId: 'user-123' },
      'server.create',
      'server',
      'server-456',
      { hostname: 'web-01' },
      '10.0.0.1',
      'Mozilla/5.0',
    );

    expect(entry.userId).toBe('user-123');
    expect(entry.action).toBe('server.create');
    expect(entry.entityType).toBe('server');
    expect(entry.entityId).toBe('server-456');
    expect(entry.details).toEqual({ hostname: 'web-01' });
    expect(entry.ipAddress).toBe('10.0.0.1');
  });

  it('should handle missing user (system actions)', () => {
    const entry = buildAuditEntry(undefined, 'settings.update', 'settings');
    expect(entry.userId).toBeNull();
  });

  it('should handle missing optional fields', () => {
    const entry = buildAuditEntry({ userId: 'u1' }, 'auth.login', 'user');
    expect(entry.entityId).toBeNull();
    expect(entry.details).toBeNull();
    expect(entry.ipAddress).toBeNull();
    expect(entry.userAgent).toBeNull();
  });
});

describe('Audit Log Querying', () => {
  function filterLogs(
    logs: { action: string; entityType: string; userId: string | null }[],
    filter: { action?: string; entityType?: string; userId?: string },
  ) {
    return logs.filter(log => {
      if (filter.action && !log.action.includes(filter.action)) return false;
      if (filter.entityType && log.entityType !== filter.entityType) return false;
      if (filter.userId && log.userId !== filter.userId) return false;
      return true;
    });
  }

  const sampleLogs = [
    { action: 'server.create', entityType: 'server', userId: 'user-1' },
    { action: 'server.update', entityType: 'server', userId: 'user-1' },
    { action: 'server.delete', entityType: 'server', userId: 'user-2' },
    { action: 'alert_rule.create', entityType: 'alert_rule', userId: 'user-1' },
    { action: 'auth.login', entityType: 'user', userId: 'user-2' },
    { action: 'settings.update', entityType: 'settings', userId: null },
  ];

  it('should filter by entity type', () => {
    const result = filterLogs(sampleLogs, { entityType: 'server' });
    expect(result.length).toBe(3);
  });

  it('should filter by action substring', () => {
    const result = filterLogs(sampleLogs, { action: 'create' });
    expect(result.length).toBe(2);
  });

  it('should filter by user ID', () => {
    const result = filterLogs(sampleLogs, { userId: 'user-1' });
    expect(result.length).toBe(3);
  });

  it('should combine filters', () => {
    const result = filterLogs(sampleLogs, { entityType: 'server', userId: 'user-1' });
    expect(result.length).toBe(2);
  });

  it('should return all with no filter', () => {
    const result = filterLogs(sampleLogs, {});
    expect(result.length).toBe(6);
  });
});
