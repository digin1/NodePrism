describe('Condition Evaluation (safe parser)', () => {
  function evaluateCondition(expression: string, value: number): boolean {
    const match = expression.match(/^\s*\$value\s*(>=|<=|!=|>|<|==)\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return false;
    const operator = match[1];
    const threshold = parseFloat(match[2]);
    switch (operator) {
      case '>':  return value > threshold;
      case '<':  return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default:   return false;
    }
  }

  it('should evaluate > correctly', () => {
    expect(evaluateCondition('$value > 80', 90)).toBe(true);
    expect(evaluateCondition('$value > 80', 80)).toBe(false);
    expect(evaluateCondition('$value > 80', 70)).toBe(false);
  });

  it('should evaluate < correctly', () => {
    expect(evaluateCondition('$value < 20', 10)).toBe(true);
    expect(evaluateCondition('$value < 20', 20)).toBe(false);
  });

  it('should evaluate >= correctly', () => {
    expect(evaluateCondition('$value >= 80', 80)).toBe(true);
    expect(evaluateCondition('$value >= 80', 79)).toBe(false);
  });

  it('should evaluate <= correctly', () => {
    expect(evaluateCondition('$value <= 20', 20)).toBe(true);
    expect(evaluateCondition('$value <= 20', 21)).toBe(false);
  });

  it('should evaluate == correctly', () => {
    expect(evaluateCondition('$value == 50', 50)).toBe(true);
    expect(evaluateCondition('$value == 50', 51)).toBe(false);
  });

  it('should evaluate != correctly', () => {
    expect(evaluateCondition('$value != 0', 1)).toBe(true);
    expect(evaluateCondition('$value != 0', 0)).toBe(false);
  });

  it('should handle decimal thresholds', () => {
    expect(evaluateCondition('$value > 99.5', 99.6)).toBe(true);
    expect(evaluateCondition('$value > 99.5', 99.4)).toBe(false);
  });

  it('should handle negative thresholds', () => {
    expect(evaluateCondition('$value > -10', 0)).toBe(true);
    expect(evaluateCondition('$value < -10', -20)).toBe(true);
  });

  it('should handle whitespace variations', () => {
    expect(evaluateCondition('  $value  >  80  ', 90)).toBe(true);
    expect(evaluateCondition('$value>80', 90)).toBe(true);
  });

  it('should reject malicious expressions', () => {
    expect(evaluateCondition('process.exit(1)', 0)).toBe(false);
    expect(evaluateCondition('require("fs").unlinkSync("/")', 0)).toBe(false);
    expect(evaluateCondition('$value > 80 && true', 90)).toBe(false);
    expect(evaluateCondition('eval("1+1")', 0)).toBe(false);
  });

  it('should reject unsupported syntax', () => {
    expect(evaluateCondition('', 0)).toBe(false);
    expect(evaluateCondition('80 > $value', 70)).toBe(false);
    expect(evaluateCondition('$value > $threshold', 90)).toBe(false);
  });
});

describe('Hysteresis Evaluation', () => {
  interface AlertCondition {
    condition: string;
    hysteresis?: { trigger: number; clear: number };
  }

  function evaluateCondition(expression: string, value: number): boolean {
    const match = expression.match(/^\s*\$value\s*(>=|<=|!=|>|<|==)\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return false;
    const operator = match[1];
    const threshold = parseFloat(match[2]);
    switch (operator) {
      case '>':  return value > threshold;
      case '<':  return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default:   return false;
    }
  }

  function evaluateHysteresis(
    condition: AlertCondition,
    currentValue: number,
    previousState: 'clear' | 'warning' | 'critical'
  ): boolean {
    const result = evaluateCondition(condition.condition, currentValue);
    if (!condition.hysteresis) return result;
    const { trigger, clear } = condition.hysteresis;
    if (previousState === 'clear') {
      return result && currentValue >= trigger;
    } else {
      return result && currentValue >= clear;
    }
  }

  it('should fire without hysteresis when condition met', () => {
    expect(evaluateHysteresis({ condition: '$value > 80' }, 90, 'clear')).toBe(true);
  });

  it('should not fire without hysteresis when condition not met', () => {
    expect(evaluateHysteresis({ condition: '$value > 80' }, 70, 'clear')).toBe(false);
  });

  it('should require trigger threshold from clear state', () => {
    const cond: AlertCondition = {
      condition: '$value > 70',
      hysteresis: { trigger: 90, clear: 75 },
    };
    // Value 85 meets condition ($value > 70) but not trigger (90)
    expect(evaluateHysteresis(cond, 85, 'clear')).toBe(false);
    // Value 95 meets both
    expect(evaluateHysteresis(cond, 95, 'clear')).toBe(true);
  });

  it('should use clear threshold from firing state', () => {
    const cond: AlertCondition = {
      condition: '$value > 70',
      hysteresis: { trigger: 90, clear: 75 },
    };
    // Value 80 is above clear (75), stays firing
    expect(evaluateHysteresis(cond, 80, 'warning')).toBe(true);
    // Value 72 is below clear (75), resolves
    expect(evaluateHysteresis(cond, 72, 'warning')).toBe(false);
  });
});

describe('Server ID Injection into PromQL', () => {
  function injectServerId(query: string, serverId: string): string {
    if (query.includes('{')) {
      return query.replace('{', `{server_id="${serverId}", `);
    }
    return query.replace(/^(\w+)/, `$1{server_id="${serverId}"}`);
  }

  it('should inject into query without labels', () => {
    expect(injectServerId('node_load1', 'srv-1')).toBe('node_load1{server_id="srv-1"}');
  });

  it('should inject into query with existing labels', () => {
    expect(injectServerId('node_cpu_seconds_total{mode="idle"}', 'srv-1'))
      .toBe('node_cpu_seconds_total{server_id="srv-1", mode="idle"}');
  });

  it('should inject into complex query', () => {
    const q = '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)';
    const result = injectServerId(q, 'srv-2');
    expect(result).toContain('server_id="srv-2"');
    expect(result).toContain('mode="idle"');
  });

  it('should handle query with no metric name prefix', () => {
    // Query that starts with a function
    const q = 'rate(http_requests_total{job="api"}[5m])';
    const result = injectServerId(q, 'srv-3');
    expect(result).toContain('server_id="srv-3"');
  });
});

describe('Previous State Determination', () => {
  function determinePreviousState(
    severity: string | null
  ): 'clear' | 'warning' | 'critical' {
    if (!severity) return 'clear';
    if (severity === 'CRITICAL') return 'critical';
    if (severity === 'WARNING') return 'warning';
    return 'clear';
  }

  it('should return clear when no alert exists', () => {
    expect(determinePreviousState(null)).toBe('clear');
  });

  it('should return critical for CRITICAL severity', () => {
    expect(determinePreviousState('CRITICAL')).toBe('critical');
  });

  it('should return warning for WARNING severity', () => {
    expect(determinePreviousState('WARNING')).toBe('warning');
  });

  it('should return clear for unknown severity', () => {
    expect(determinePreviousState('INFO')).toBe('clear');
  });
});

describe('Alert Fingerprint Generation', () => {
  function generateFingerprint(templateId: string, serverId: string): string {
    return `template-${templateId}-${serverId}`;
  }

  it('should generate unique fingerprints for different servers', () => {
    const fp1 = generateFingerprint('tpl-1', 'srv-a');
    const fp2 = generateFingerprint('tpl-1', 'srv-b');
    expect(fp1).not.toBe(fp2);
  });

  it('should generate unique fingerprints for different templates', () => {
    const fp1 = generateFingerprint('tpl-1', 'srv-a');
    const fp2 = generateFingerprint('tpl-2', 'srv-a');
    expect(fp1).not.toBe(fp2);
  });

  it('should be deterministic', () => {
    const fp1 = generateFingerprint('tpl-1', 'srv-a');
    const fp2 = generateFingerprint('tpl-1', 'srv-a');
    expect(fp1).toBe(fp2);
  });

  it('should include template prefix', () => {
    const fp = generateFingerprint('abc', 'xyz');
    expect(fp).toBe('template-abc-xyz');
  });
});

describe('Alert Message Formatting', () => {
  function formatAlertMessage(
    templateName: string,
    severity: string,
    value: number,
    units?: string
  ): string {
    return `${templateName}: ${severity.toLowerCase()} (value: ${value.toFixed(2)}${units ? ' ' + units : ''})`;
  }

  it('should format with units', () => {
    expect(formatAlertMessage('CPU Usage', 'WARNING', 85.123, '%'))
      .toBe('CPU Usage: warning (value: 85.12 %)');
  });

  it('should format without units', () => {
    expect(formatAlertMessage('Load Average', 'CRITICAL', 12.5))
      .toBe('Load Average: critical (value: 12.50)');
  });

  it('should handle zero values', () => {
    expect(formatAlertMessage('Disk Free', 'WARNING', 0, 'GB'))
      .toBe('Disk Free: warning (value: 0.00 GB)');
  });
});
