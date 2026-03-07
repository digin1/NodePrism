import { z } from 'zod';

// Validation schemas (mirroring routes/alerts.ts)
const createAlertRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  query: z.string().min(1),
  duration: z.string().default('5m'),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

const createAlertTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  matchLabels: z.record(z.string()).optional(),
  matchHostLabels: z.record(z.string()).optional(),
  query: z.string().min(1),
  calc: z.string().optional(),
  units: z.string().optional(),
  warnCondition: z.string().min(1),
  critCondition: z.string().min(1),
  every: z.string().default('1m'),
  for: z.string().default('5m'),
  actions: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
});

const webhookAlertSchema = z.object({
  status: z.enum(['firing', 'resolved']),
  alerts: z.array(z.object({
    status: z.enum(['firing', 'resolved']),
    labels: z.record(z.string()),
    annotations: z.record(z.string()).optional(),
    startsAt: z.string(),
    endsAt: z.string().optional(),
    fingerprint: z.string(),
  })),
});

describe('Alert Rule Validation', () => {
  it('should accept valid alert rule', () => {
    const result = createAlertRuleSchema.safeParse({
      name: 'High CPU Usage',
      description: 'Fires when CPU exceeds 80%',
      query: '100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80',
      duration: '2m',
      severity: 'WARNING',
    });
    expect(result.success).toBe(true);
  });

  it('should apply defaults for duration and enabled', () => {
    const result = createAlertRuleSchema.safeParse({
      name: 'Test Rule',
      query: 'up == 0',
      severity: 'CRITICAL',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBe('5m');
      expect(result.data.enabled).toBe(true);
    }
  });

  it('should reject empty name', () => {
    const result = createAlertRuleSchema.safeParse({
      name: '',
      query: 'up == 0',
      severity: 'CRITICAL',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty query', () => {
    const result = createAlertRuleSchema.safeParse({
      name: 'Test',
      query: '',
      severity: 'WARNING',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid severity', () => {
    const result = createAlertRuleSchema.safeParse({
      name: 'Test',
      query: 'up == 0',
      severity: 'URGENT',
    });
    expect(result.success).toBe(false);
  });

  it('should accept labels and annotations', () => {
    const result = createAlertRuleSchema.safeParse({
      name: 'Instance Down',
      query: 'up == 0',
      severity: 'CRITICAL',
      labels: { team: 'infra', priority: 'P1' },
      annotations: { summary: 'Instance {{ $labels.instance }} is down' },
    });
    expect(result.success).toBe(true);
  });
});

describe('Alert Template Validation', () => {
  it('should accept valid template', () => {
    const result = createAlertTemplateSchema.safeParse({
      name: 'CPU Alert Template',
      query: '100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
      warnCondition: '> 80',
      critCondition: '> 95',
      units: '%',
    });
    expect(result.success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = createAlertTemplateSchema.safeParse({
      name: 'Template',
      query: 'some_metric',
      warnCondition: '> 100',
      critCondition: '> 200',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.every).toBe('1m');
      expect(result.data.for).toBe('5m');
      expect(result.data.enabled).toBe(true);
    }
  });

  it('should reject missing conditions', () => {
    const noWarn = createAlertTemplateSchema.safeParse({
      name: 'Template',
      query: 'metric',
      critCondition: '> 200',
    });
    expect(noWarn.success).toBe(false);

    const noCrit = createAlertTemplateSchema.safeParse({
      name: 'Template',
      query: 'metric',
      warnCondition: '> 100',
    });
    expect(noCrit.success).toBe(false);
  });

  it('should accept match labels for server targeting', () => {
    const result = createAlertTemplateSchema.safeParse({
      name: 'DB CPU Alert',
      query: 'cpu_usage',
      warnCondition: '> 70',
      critCondition: '> 90',
      matchLabels: { job: 'node-exporter' },
      matchHostLabels: { environment: 'production' },
    });
    expect(result.success).toBe(true);
  });
});

describe('AlertManager Webhook Validation', () => {
  it('should accept valid firing webhook', () => {
    const result = webhookAlertSchema.safeParse({
      status: 'firing',
      alerts: [{
        status: 'firing',
        labels: {
          alertname: 'HighCPU',
          instance: '192.168.1.100:9100',
          severity: 'warning',
        },
        annotations: { summary: 'CPU is high' },
        startsAt: '2026-03-07T10:00:00Z',
        fingerprint: 'abc123',
      }],
    });
    expect(result.success).toBe(true);
  });

  it('should accept resolved webhook', () => {
    const result = webhookAlertSchema.safeParse({
      status: 'resolved',
      alerts: [{
        status: 'resolved',
        labels: { alertname: 'HighCPU', instance: '192.168.1.100:9100' },
        startsAt: '2026-03-07T10:00:00Z',
        endsAt: '2026-03-07T10:05:00Z',
        fingerprint: 'abc123',
      }],
    });
    expect(result.success).toBe(true);
  });

  it('should accept multiple alerts in single webhook', () => {
    const result = webhookAlertSchema.safeParse({
      status: 'firing',
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'HighCPU', instance: '10.0.0.1:9100' },
          startsAt: '2026-03-07T10:00:00Z',
          fingerprint: 'abc123',
        },
        {
          status: 'firing',
          labels: { alertname: 'HighMemory', instance: '10.0.0.1:9100' },
          startsAt: '2026-03-07T10:01:00Z',
          fingerprint: 'def456',
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alerts.length).toBe(2);
    }
  });

  it('should reject invalid status', () => {
    const result = webhookAlertSchema.safeParse({
      status: 'pending',
      alerts: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('Alert Status Calculation', () => {
  function calculateAlertStats(alerts: { status: string; severity: string }[]) {
    return {
      firing: alerts.filter(a => a.status === 'FIRING').length,
      critical: alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'FIRING').length,
      warning: alerts.filter(a => a.severity === 'WARNING' && a.status === 'FIRING').length,
      resolved: alerts.filter(a => a.status === 'RESOLVED').length,
      silenced: alerts.filter(a => a.status === 'SILENCED').length,
      acknowledged: alerts.filter(a => a.status === 'ACKNOWLEDGED').length,
    };
  }

  it('should calculate stats correctly', () => {
    const alerts = [
      { status: 'FIRING', severity: 'CRITICAL' },
      { status: 'FIRING', severity: 'WARNING' },
      { status: 'FIRING', severity: 'WARNING' },
      { status: 'RESOLVED', severity: 'CRITICAL' },
      { status: 'SILENCED', severity: 'WARNING' },
      { status: 'ACKNOWLEDGED', severity: 'CRITICAL' },
    ];
    const stats = calculateAlertStats(alerts);
    expect(stats.firing).toBe(3);
    expect(stats.critical).toBe(1);
    expect(stats.warning).toBe(2);
    expect(stats.resolved).toBe(1);
    expect(stats.silenced).toBe(1);
    expect(stats.acknowledged).toBe(1);
  });

  it('should handle empty alerts', () => {
    const stats = calculateAlertStats([]);
    expect(stats.firing).toBe(0);
    expect(stats.critical).toBe(0);
  });
});
