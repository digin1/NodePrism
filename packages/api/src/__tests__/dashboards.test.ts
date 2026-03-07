describe('Dashboard Panel Validation', () => {
  const VALID_TYPES = ['line', 'area', 'bar', 'gauge', 'stat', 'table'];

  interface DashboardPanel {
    id: string;
    title: string;
    type: string;
    query: string;
    span: number;
    height: number;
  }

  function validatePanel(panel: Partial<DashboardPanel>): string[] {
    const errors: string[] = [];
    if (!panel.title || panel.title.trim().length === 0) errors.push('title is required');
    if (!panel.type || !VALID_TYPES.includes(panel.type)) errors.push('invalid panel type');
    if (!panel.query || panel.query.trim().length === 0) errors.push('query is required');
    if (panel.span !== undefined && (panel.span < 1 || panel.span > 12)) errors.push('span must be 1-12');
    if (panel.height !== undefined && (panel.height < 100 || panel.height > 800)) errors.push('height must be 100-800');
    return errors;
  }

  it('should validate a valid panel', () => {
    expect(validatePanel({
      id: 'p1',
      title: 'CPU',
      type: 'line',
      query: 'node_cpu',
      span: 6,
      height: 300,
    })).toEqual([]);
  });

  it('should catch missing title', () => {
    expect(validatePanel({ type: 'line', query: 'q', span: 6, height: 300 }))
      .toContain('title is required');
  });

  it('should catch invalid type', () => {
    expect(validatePanel({ title: 'T', type: 'pie', query: 'q', span: 6, height: 300 }))
      .toContain('invalid panel type');
  });

  it('should catch missing query', () => {
    expect(validatePanel({ title: 'T', type: 'line', span: 6, height: 300 }))
      .toContain('query is required');
  });

  it('should catch span out of range', () => {
    expect(validatePanel({ title: 'T', type: 'line', query: 'q', span: 0, height: 300 }))
      .toContain('span must be 1-12');
    expect(validatePanel({ title: 'T', type: 'line', query: 'q', span: 13, height: 300 }))
      .toContain('span must be 1-12');
  });

  it('should catch height out of range', () => {
    expect(validatePanel({ title: 'T', type: 'line', query: 'q', span: 6, height: 50 }))
      .toContain('height must be 100-800');
  });

  it('should accept all valid panel types', () => {
    for (const type of VALID_TYPES) {
      expect(validatePanel({ title: 'T', type, query: 'q', span: 6, height: 300 })).toEqual([]);
    }
  });
});

describe('Dashboard Config Structure', () => {
  interface DashboardConfig {
    panels: Array<{ id: string; title: string; type: string; query: string; span: number; height: number }>;
    refreshInterval?: number;
    timeRange?: string;
  }

  function validateConfig(config: DashboardConfig): string[] {
    const errors: string[] = [];
    if (!config.panels || config.panels.length === 0) errors.push('at least one panel required');
    if (config.refreshInterval !== undefined && config.refreshInterval < 5) errors.push('refresh interval too short');
    const validRanges = ['15m', '30m', '1h', '6h', '12h', '24h', '7d'];
    if (config.timeRange && !validRanges.includes(config.timeRange)) errors.push('invalid time range');

    // Check for duplicate panel IDs
    const ids = config.panels.map(p => p.id);
    if (new Set(ids).size !== ids.length) errors.push('duplicate panel IDs');

    // Check total span doesn't exceed reasonable limits
    const totalSpan = config.panels.reduce((sum, p) => sum + p.span, 0);
    if (totalSpan > 120) errors.push('too many panels');

    return errors;
  }

  it('should validate a valid config', () => {
    expect(validateConfig({
      panels: [{ id: 'p1', title: 'CPU', type: 'line', query: 'q', span: 6, height: 300 }],
      refreshInterval: 30,
      timeRange: '1h',
    })).toEqual([]);
  });

  it('should require at least one panel', () => {
    expect(validateConfig({ panels: [] })).toContain('at least one panel required');
  });

  it('should catch too-short refresh interval', () => {
    expect(validateConfig({
      panels: [{ id: 'p1', title: 'T', type: 'line', query: 'q', span: 6, height: 300 }],
      refreshInterval: 1,
    })).toContain('refresh interval too short');
  });

  it('should catch invalid time range', () => {
    expect(validateConfig({
      panels: [{ id: 'p1', title: 'T', type: 'line', query: 'q', span: 6, height: 300 }],
      timeRange: '2h',
    })).toContain('invalid time range');
  });

  it('should catch duplicate panel IDs', () => {
    expect(validateConfig({
      panels: [
        { id: 'p1', title: 'A', type: 'line', query: 'q', span: 6, height: 300 },
        { id: 'p1', title: 'B', type: 'line', query: 'q', span: 6, height: 300 },
      ],
    })).toContain('duplicate panel IDs');
  });
});

describe('Dashboard Grid Layout', () => {
  function calculateRows(spans: number[]): number {
    let currentRow = 0;
    let currentCol = 0;
    for (const span of spans) {
      if (currentCol + span > 12) {
        currentRow++;
        currentCol = 0;
      }
      currentCol += span;
    }
    return currentRow + 1;
  }

  it('should fit two 6-span panels in one row', () => {
    expect(calculateRows([6, 6])).toBe(1);
  });

  it('should wrap to new row when exceeding 12 cols', () => {
    expect(calculateRows([6, 6, 6])).toBe(2);
  });

  it('should handle mixed spans', () => {
    // [4, 4, 4] = 1 row, [6, 6] = 1 row, [12] = 1 row
    expect(calculateRows([4, 4, 4])).toBe(1);
    expect(calculateRows([4, 4, 6])).toBe(2); // 4+4+6=14 > 12
  });

  it('should handle full-width panels', () => {
    expect(calculateRows([12, 12, 12])).toBe(3);
  });

  it('should handle single panel', () => {
    expect(calculateRows([6])).toBe(1);
  });
});
