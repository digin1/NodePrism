describe('Alert Template Configuration', () => {
  interface AlertCondition {
    condition: string;
    hysteresis?: { trigger: number; clear: number };
  }

  interface AlertTemplateConfig {
    id: string;
    name: string;
    query: string;
    calc?: string;
    units?: string;
    warn: AlertCondition;
    crit: AlertCondition;
    every: string;
    for: string;
  }

  function convertToConfig(template: any): AlertTemplateConfig {
    return {
      id: template.id,
      name: template.name,
      query: template.query,
      calc: template.calc,
      units: template.units,
      warn: template.warnCondition as AlertCondition,
      crit: template.critCondition as AlertCondition,
      every: template.every,
      for: template.for,
    };
  }

  it('should convert DB template to config', () => {
    const dbTemplate = {
      id: 'tpl-1',
      name: 'CPU Usage',
      query: 'node_cpu_usage',
      calc: null,
      units: '%',
      warnCondition: { condition: '$value > 80' },
      critCondition: { condition: '$value > 95' },
      every: '1m',
      for: '5m',
    };

    const config = convertToConfig(dbTemplate);
    expect(config.id).toBe('tpl-1');
    expect(config.name).toBe('CPU Usage');
    expect(config.warn.condition).toBe('$value > 80');
    expect(config.crit.condition).toBe('$value > 95');
    expect(config.units).toBe('%');
  });

  it('should handle template without units or calc', () => {
    const config = convertToConfig({
      id: 'tpl-2',
      name: 'Load',
      query: 'node_load1',
      calc: undefined,
      units: undefined,
      warnCondition: { condition: '$value > 4' },
      critCondition: { condition: '$value > 8' },
      every: '30s',
      for: '0s',
    });
    expect(config.units).toBeUndefined();
    expect(config.calc).toBeUndefined();
  });

  it('should preserve hysteresis configuration', () => {
    const config = convertToConfig({
      id: 'tpl-3',
      name: 'Memory',
      query: 'memory_usage',
      warnCondition: {
        condition: '$value > 80',
        hysteresis: { trigger: 85, clear: 75 },
      },
      critCondition: {
        condition: '$value > 95',
        hysteresis: { trigger: 97, clear: 90 },
      },
      every: '1m',
      for: '5m',
    });
    expect(config.warn.hysteresis?.trigger).toBe(85);
    expect(config.warn.hysteresis?.clear).toBe(75);
    expect(config.crit.hysteresis?.trigger).toBe(97);
    expect(config.crit.hysteresis?.clear).toBe(90);
  });
});

describe('Template Label Matching', () => {
  function matchesLabels(
    matchLabels: Record<string, string> | null,
    labels: Record<string, string>
  ): boolean {
    if (!matchLabels) return true;
    for (const [key, value] of Object.entries(matchLabels)) {
      if (labels[key] !== value) return false;
    }
    return true;
  }

  function matchesHostLabels(
    matchHostLabels: Record<string, string> | null,
    server: { environment?: string; region?: string; tags: string[] }
  ): boolean {
    if (!matchHostLabels) return true;
    for (const [key, value] of Object.entries(matchHostLabels)) {
      if (key === 'environment' && server.environment !== value) return false;
      if (key === 'region' && server.region !== value) return false;
      if (key === 'tag' && !server.tags.includes(value)) return false;
    }
    return true;
  }

  it('should match when no labels specified', () => {
    expect(matchesLabels(null, { job: 'node' })).toBe(true);
  });

  it('should match when all labels match', () => {
    expect(matchesLabels({ job: 'node' }, { job: 'node', instance: 'x' })).toBe(true);
  });

  it('should not match when label value differs', () => {
    expect(matchesLabels({ job: 'mysql' }, { job: 'node' })).toBe(false);
  });

  it('should not match when label is missing', () => {
    expect(matchesLabels({ job: 'node' }, {})).toBe(false);
  });

  it('should match host labels by environment', () => {
    expect(matchesHostLabels(
      { environment: 'production' },
      { environment: 'production', tags: [] }
    )).toBe(true);
  });

  it('should not match wrong environment', () => {
    expect(matchesHostLabels(
      { environment: 'production' },
      { environment: 'staging', tags: [] }
    )).toBe(false);
  });

  it('should match host labels by tag', () => {
    expect(matchesHostLabels(
      { tag: 'web' },
      { tags: ['web', 'frontend'] }
    )).toBe(true);
  });

  it('should not match missing tag', () => {
    expect(matchesHostLabels(
      { tag: 'database' },
      { tags: ['web'] }
    )).toBe(false);
  });

  it('should match when no host labels specified', () => {
    expect(matchesHostLabels(null, { tags: [] })).toBe(true);
  });
});

describe('Template CRUD Validation', () => {
  interface CreateTemplateInput {
    name: string;
    query: string;
    warnCondition: { condition: string };
    critCondition: { condition: string };
    every?: string;
    for?: string;
  }

  function validateCreateInput(input: CreateTemplateInput): string[] {
    const errors: string[] = [];
    if (!input.name || input.name.trim().length === 0) errors.push('name is required');
    if (!input.query || input.query.trim().length === 0) errors.push('query is required');
    if (!input.warnCondition?.condition) errors.push('warn condition is required');
    if (!input.critCondition?.condition) errors.push('crit condition is required');

    // Validate condition format
    const condPattern = /^\s*\$value\s*(>=|<=|!=|>|<|==)\s*(-?\d+(?:\.\d+)?)\s*$/;
    if (input.warnCondition?.condition && !condPattern.test(input.warnCondition.condition)) {
      errors.push('warn condition has invalid format');
    }
    if (input.critCondition?.condition && !condPattern.test(input.critCondition.condition)) {
      errors.push('crit condition has invalid format');
    }

    return errors;
  }

  it('should validate valid input', () => {
    expect(validateCreateInput({
      name: 'CPU',
      query: 'node_cpu',
      warnCondition: { condition: '$value > 80' },
      critCondition: { condition: '$value > 95' },
    })).toEqual([]);
  });

  it('should catch empty name', () => {
    const errors = validateCreateInput({
      name: '',
      query: 'node_cpu',
      warnCondition: { condition: '$value > 80' },
      critCondition: { condition: '$value > 95' },
    });
    expect(errors).toContain('name is required');
  });

  it('should catch empty query', () => {
    const errors = validateCreateInput({
      name: 'CPU',
      query: '',
      warnCondition: { condition: '$value > 80' },
      critCondition: { condition: '$value > 95' },
    });
    expect(errors).toContain('query is required');
  });

  it('should catch invalid condition format', () => {
    const errors = validateCreateInput({
      name: 'CPU',
      query: 'node_cpu',
      warnCondition: { condition: 'invalid' },
      critCondition: { condition: '$value > 95' },
    });
    expect(errors).toContain('warn condition has invalid format');
  });

  it('should accept conditions with decimal thresholds', () => {
    expect(validateCreateInput({
      name: 'Load',
      query: 'node_load1',
      warnCondition: { condition: '$value > 2.5' },
      critCondition: { condition: '$value > 5.0' },
    })).toEqual([]);
  });
});

describe('Template Evaluation Priority', () => {
  it('should check critical before warning', () => {
    function evaluate(value: number): 'critical' | 'warning' | 'clear' {
      // Critical first (higher priority)
      if (value > 95) return 'critical';
      if (value > 80) return 'warning';
      return 'clear';
    }

    expect(evaluate(97)).toBe('critical');
    expect(evaluate(85)).toBe('warning');
    expect(evaluate(50)).toBe('clear');
  });

  it('should not fire warning when critical is active', () => {
    function evaluate(value: number): string {
      if (value > 95) return 'CRITICAL';
      if (value > 80) return 'WARNING';
      return 'OK';
    }

    // Value of 97 should only fire critical, not both
    expect(evaluate(97)).toBe('CRITICAL');
  });
});
