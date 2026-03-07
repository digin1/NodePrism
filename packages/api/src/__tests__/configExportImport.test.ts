describe('Config Export Structure', () => {
  interface ExportData {
    version: number;
    exportedAt: string;
    alertRules: { name: string; query: string; severity: string; enabled: boolean }[];
    alertTemplates: { name: string; query: string; enabled: boolean }[];
    dashboards: { name: string; config: Record<string, unknown>; isDefault: boolean }[];
    notificationChannels: { name: string; type: string; config: Record<string, unknown>; enabled: boolean }[];
    settings: { systemName: string; primaryColor: string; timezone: string; dateFormat: string };
  }

  const sampleExport: ExportData = {
    version: 1,
    exportedAt: '2026-03-07T00:00:00.000Z',
    alertRules: [
      { name: 'High CPU', query: 'cpu > 90', severity: 'CRITICAL', enabled: true },
      { name: 'Disk Full', query: 'disk > 95', severity: 'WARNING', enabled: true },
    ],
    alertTemplates: [
      { name: 'CPU Template', query: 'node_cpu_seconds_total', enabled: true },
    ],
    dashboards: [
      { name: 'Overview', config: { panels: [] }, isDefault: true },
    ],
    notificationChannels: [
      { name: 'Slack Ops', type: 'SLACK', config: { webhookUrl: 'https://hooks.slack.com/test' }, enabled: true },
    ],
    settings: {
      systemName: 'NodePrism',
      primaryColor: '#3B82F6',
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
    },
  };

  it('should have version field', () => {
    expect(sampleExport.version).toBe(1);
  });

  it('should have exportedAt timestamp', () => {
    expect(new Date(sampleExport.exportedAt).getTime()).not.toBeNaN();
  });

  it('should include alert rules with required fields', () => {
    for (const rule of sampleExport.alertRules) {
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('query');
      expect(rule).toHaveProperty('severity');
      expect(rule).toHaveProperty('enabled');
    }
  });

  it('should include alert templates', () => {
    expect(sampleExport.alertTemplates).toHaveLength(1);
    expect(sampleExport.alertTemplates[0].name).toBe('CPU Template');
  });

  it('should include dashboards', () => {
    expect(sampleExport.dashboards).toHaveLength(1);
    expect(sampleExport.dashboards[0].config).toHaveProperty('panels');
  });

  it('should include notification channels without sensitive IDs', () => {
    for (const ch of sampleExport.notificationChannels) {
      expect(ch).not.toHaveProperty('id');
      expect(ch).toHaveProperty('name');
      expect(ch).toHaveProperty('type');
      expect(ch).toHaveProperty('config');
    }
  });

  it('should include settings without server-specific data', () => {
    expect(sampleExport.settings).not.toHaveProperty('managerHostname');
    expect(sampleExport.settings).not.toHaveProperty('managerIp');
    expect(sampleExport.settings).toHaveProperty('systemName');
  });
});

describe('Config Import Validation', () => {
  function validateImportData(data: any): string[] {
    const errors: string[] = [];
    if (!data) errors.push('No data provided');
    if (!data?.version) errors.push('Missing version field');
    if (data?.version && data.version !== 1) errors.push('Unsupported version');
    return errors;
  }

  it('should reject null data', () => {
    expect(validateImportData(null)).toContain('No data provided');
  });

  it('should reject data without version', () => {
    expect(validateImportData({ alertRules: [] })).toContain('Missing version field');
  });

  it('should reject unsupported version', () => {
    expect(validateImportData({ version: 99 })).toContain('Unsupported version');
  });

  it('should accept valid data', () => {
    expect(validateImportData({ version: 1 })).toEqual([]);
  });
});

describe('Conflict Resolution - Skip Mode', () => {
  interface NamedEntity { name: string; [key: string]: unknown }

  function importWithSkip(existing: NamedEntity[], incoming: NamedEntity[]): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;
    const existingNames = new Set(existing.map(e => e.name));
    for (const item of incoming) {
      if (existingNames.has(item.name)) {
        skipped++;
      } else {
        imported++;
      }
    }
    return { imported, skipped };
  }

  it('should skip items that already exist', () => {
    const existing = [{ name: 'Rule A' }, { name: 'Rule B' }];
    const incoming = [{ name: 'Rule A' }, { name: 'Rule C' }];
    const result = importWithSkip(existing, incoming);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('should import all when no conflicts', () => {
    const existing = [{ name: 'Rule A' }];
    const incoming = [{ name: 'Rule B' }, { name: 'Rule C' }];
    const result = importWithSkip(existing, incoming);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('should skip all when all exist', () => {
    const existing = [{ name: 'A' }, { name: 'B' }];
    const incoming = [{ name: 'A' }, { name: 'B' }];
    const result = importWithSkip(existing, incoming);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('should handle empty incoming', () => {
    const result = importWithSkip([{ name: 'A' }], []);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

describe('Conflict Resolution - Overwrite Mode', () => {
  interface NamedEntity { name: string; [key: string]: unknown }

  function importWithOverwrite(existing: NamedEntity[], incoming: NamedEntity[]): { created: number; updated: number } {
    let created = 0;
    let updated = 0;
    const existingNames = new Set(existing.map(e => e.name));
    for (const item of incoming) {
      if (existingNames.has(item.name)) {
        updated++;
      } else {
        created++;
      }
    }
    return { created, updated };
  }

  it('should update existing items', () => {
    const existing = [{ name: 'Rule A', severity: 'WARNING' }];
    const incoming = [{ name: 'Rule A', severity: 'CRITICAL' }];
    const result = importWithOverwrite(existing, incoming);
    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
  });

  it('should create new items', () => {
    const existing = [{ name: 'Rule A' }];
    const incoming = [{ name: 'Rule B' }];
    const result = importWithOverwrite(existing, incoming);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('should handle mixed create and update', () => {
    const existing = [{ name: 'A' }, { name: 'B' }];
    const incoming = [{ name: 'A' }, { name: 'C' }, { name: 'D' }];
    const result = importWithOverwrite(existing, incoming);
    expect(result.updated).toBe(1);
    expect(result.created).toBe(2);
  });
});

describe('Import Results Summary', () => {
  interface ImportResults {
    alertRules: number;
    alertTemplates: number;
    dashboards: number;
    notificationChannels: number;
    settings: boolean;
    skipped: number;
  }

  function summarize(results: ImportResults): string {
    const parts: string[] = [];
    if (results.alertRules) parts.push(`${results.alertRules} alert rules`);
    if (results.alertTemplates) parts.push(`${results.alertTemplates} templates`);
    if (results.dashboards) parts.push(`${results.dashboards} dashboards`);
    if (results.notificationChannels) parts.push(`${results.notificationChannels} channels`);
    if (results.settings) parts.push('settings');
    if (results.skipped) parts.push(`${results.skipped} skipped`);
    return parts.length ? parts.join(', ') : 'no changes';
  }

  it('should show all imported counts', () => {
    const result = summarize({
      alertRules: 3, alertTemplates: 2, dashboards: 1,
      notificationChannels: 1, settings: true, skipped: 0,
    });
    expect(result).toContain('3 alert rules');
    expect(result).toContain('2 templates');
    expect(result).toContain('1 dashboards');
    expect(result).toContain('1 channels');
    expect(result).toContain('settings');
    expect(result).not.toContain('skipped');
  });

  it('should show skipped count', () => {
    const result = summarize({
      alertRules: 1, alertTemplates: 0, dashboards: 0,
      notificationChannels: 0, settings: false, skipped: 5,
    });
    expect(result).toContain('1 alert rules');
    expect(result).toContain('5 skipped');
  });

  it('should show no changes when everything is zero', () => {
    const result = summarize({
      alertRules: 0, alertTemplates: 0, dashboards: 0,
      notificationChannels: 0, settings: false, skipped: 0,
    });
    expect(result).toBe('no changes');
  });
});

describe('Export Data Sanitization', () => {
  it('should strip IDs from exported entities', () => {
    const dbRule = { id: 'uuid-123', name: 'High CPU', query: 'cpu > 90', severity: 'CRITICAL', enabled: true };
    const { id, ...exported } = dbRule;
    expect(exported).not.toHaveProperty('id');
    expect(exported).toHaveProperty('name');
    expect(exported).toHaveProperty('query');
  });

  it('should strip server-specific fields from settings', () => {
    const dbSettings = {
      id: 'default',
      systemName: 'NodePrism',
      primaryColor: '#3B82F6',
      managerHostname: 'server-1',
      managerIp: '10.0.0.1',
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      logoUrl: null,
      logoPath: null,
    };
    const exported = {
      systemName: dbSettings.systemName,
      primaryColor: dbSettings.primaryColor,
      timezone: dbSettings.timezone,
      dateFormat: dbSettings.dateFormat,
    };
    expect(exported).not.toHaveProperty('id');
    expect(exported).not.toHaveProperty('managerHostname');
    expect(exported).not.toHaveProperty('managerIp');
    expect(exported).not.toHaveProperty('logoUrl');
  });

  it('should preserve notification channel config structure', () => {
    const channel = {
      id: 'uuid-456',
      name: 'Slack Ops',
      type: 'SLACK',
      config: { webhookUrl: 'https://hooks.slack.com/test' },
      enabled: true,
    };
    const { id, ...exported } = channel;
    expect(exported.config).toEqual({ webhookUrl: 'https://hooks.slack.com/test' });
  });
});

describe('Import Entity Matching', () => {
  it('should match entities by name (case-sensitive)', () => {
    const existing = [{ name: 'CPU Alert' }, { name: 'Disk Alert' }];
    const incoming = { name: 'CPU Alert' };
    const match = existing.find(e => e.name === incoming.name);
    expect(match).toBeDefined();
    expect(match!.name).toBe('CPU Alert');
  });

  it('should not match different case', () => {
    const existing = [{ name: 'CPU Alert' }];
    const incoming = { name: 'cpu alert' };
    const match = existing.find(e => e.name === incoming.name);
    expect(match).toBeUndefined();
  });

  it('should handle empty existing list', () => {
    const existing: { name: string }[] = [];
    const match = existing.find(e => e.name === 'Something');
    expect(match).toBeUndefined();
  });
});

describe('File Format Validation', () => {
  function isValidExportFile(content: string): { valid: boolean; error?: string } {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) return { valid: false, error: 'Not a JSON object' };
      if (!parsed.version) return { valid: false, error: 'Missing version' };
      if (parsed.version !== 1) return { valid: false, error: 'Unsupported version' };
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid JSON' };
    }
  }

  it('should reject invalid JSON', () => {
    const result = isValidExportFile('not json');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });

  it('should reject non-object JSON', () => {
    const result = isValidExportFile('"just a string"');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Not a JSON object');
  });

  it('should reject missing version', () => {
    const result = isValidExportFile('{"alertRules": []}');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing version');
  });

  it('should reject unsupported version', () => {
    const result = isValidExportFile('{"version": 2}');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Unsupported version');
  });

  it('should accept valid export', () => {
    const result = isValidExportFile('{"version": 1, "alertRules": []}');
    expect(result.valid).toBe(true);
  });
});
