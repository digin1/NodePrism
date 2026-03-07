import { z } from 'zod';

// Validation schemas (mirroring routes/notifications.ts)
const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK', 'TELEGRAM', 'PAGERDUTY']),
  config: z.record(z.any()),
  enabled: z.boolean().default(true),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK', 'TELEGRAM', 'PAGERDUTY']).optional(),
  config: z.record(z.any()).optional(),
  enabled: z.boolean().optional(),
});

describe('Notification Channel Validation', () => {
  describe('createChannelSchema', () => {
    it('should accept valid Slack channel', () => {
      const result = createChannelSchema.safeParse({
        name: 'Team Slack',
        type: 'SLACK',
        config: {
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
          channel: '#monitoring',
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(true); // default
      }
    });

    it('should accept valid Email channel', () => {
      const result = createChannelSchema.safeParse({
        name: 'Admin Email',
        type: 'EMAIL',
        config: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          username: 'alerts@example.com',
          password: 'app-password',
          from: 'nodeprism@example.com',
          to: ['admin@example.com', 'ops@example.com'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid Discord channel', () => {
      const result = createChannelSchema.safeParse({
        name: 'Discord Alerts',
        type: 'DISCORD',
        config: {
          webhookUrl: 'https://discord.com/api/webhooks/123/abc',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid Webhook channel', () => {
      const result = createChannelSchema.safeParse({
        name: 'Custom Webhook',
        type: 'WEBHOOK',
        config: {
          url: 'https://example.com/webhook',
          method: 'POST',
          secret: 'my-shared-secret',
          headers: { 'X-Custom': 'value' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid Telegram channel', () => {
      const result = createChannelSchema.safeParse({
        name: 'Telegram Bot',
        type: 'TELEGRAM',
        config: {
          botToken: '123456:ABC-DEF',
          chatId: '-1001234567890',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid PagerDuty channel', () => {
      const result = createChannelSchema.safeParse({
        name: 'PagerDuty',
        type: 'PAGERDUTY',
        config: {
          routingKey: 'abc123def456',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = createChannelSchema.safeParse({
        name: '',
        type: 'SLACK',
        config: {},
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 chars', () => {
      const result = createChannelSchema.safeParse({
        name: 'x'.repeat(101),
        type: 'SLACK',
        config: {},
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid type', () => {
      const result = createChannelSchema.safeParse({
        name: 'Test',
        type: 'SMS',
        config: {},
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid types', () => {
      const types = ['EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK', 'TELEGRAM', 'PAGERDUTY'];
      for (const type of types) {
        const result = createChannelSchema.safeParse({
          name: `Test ${type}`,
          type,
          config: {},
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept disabled channel', () => {
      const result = createChannelSchema.safeParse({
        name: 'Disabled Channel',
        type: 'SLACK',
        config: { webhookUrl: 'https://hooks.slack.com/test' },
        enabled: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(false);
      }
    });
  });

  describe('updateChannelSchema', () => {
    it('should accept partial update (name only)', () => {
      const result = updateChannelSchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('should accept partial update (enabled toggle)', () => {
      const result = updateChannelSchema.safeParse({ enabled: false });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = updateChannelSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept config update', () => {
      const result = updateChannelSchema.safeParse({
        config: { webhookUrl: 'https://new-url.com' },
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Sensitive Field Masking', () => {
  const SENSITIVE_KEYS = ['password', 'secret', 'token', 'botToken', 'routingKey', 'apiKey'];

  function maskSensitiveFields(config: Record<string, unknown>): Record<string, unknown> {
    const masked = { ...config };
    for (const key of SENSITIVE_KEYS) {
      if (key in masked && typeof masked[key] === 'string') {
        const val = masked[key] as string;
        masked[key] = val.length > 4 ? val.substring(0, 4) + '****' : '****';
      }
    }
    return masked;
  }

  it('should mask password fields', () => {
    const config = { host: 'smtp.gmail.com', password: 'mysecretpassword' };
    const masked = maskSensitiveFields(config);
    expect(masked.host).toBe('smtp.gmail.com'); // not masked
    expect(masked.password).toBe('myse****');
  });

  it('should mask bot tokens', () => {
    const config = { botToken: '123456:ABC-DEF', chatId: '-100123' };
    const masked = maskSensitiveFields(config);
    expect(masked.botToken).toBe('1234****');
    expect(masked.chatId).toBe('-100123'); // not sensitive
  });

  it('should mask short secrets completely', () => {
    const config = { secret: 'abc' };
    const masked = maskSensitiveFields(config);
    expect(masked.secret).toBe('****');
  });

  it('should not mask non-sensitive fields', () => {
    const config = { url: 'https://example.com', channel: '#alerts', username: 'bot' };
    const masked = maskSensitiveFields(config);
    expect(masked).toEqual(config);
  });

  it('should handle empty config', () => {
    const masked = maskSensitiveFields({});
    expect(masked).toEqual({});
  });
});

describe('Alert Payload Formatting', () => {
  function formatAlertText(alert: {
    status: string;
    severity: string;
    message: string;
    serverHostname?: string;
    serverIp?: string;
    labels?: Record<string, string>;
    startsAt: Date;
    endsAt?: Date | null;
  }): string {
    const server = alert.serverHostname || alert.serverIp || alert.labels?.instance || 'Unknown';
    const emoji = alert.severity === 'CRITICAL' ? '🔴' : alert.severity === 'WARNING' ? '🟡' : '🔵';
    const status = alert.status === 'RESOLVED' ? '✅ RESOLVED' : `${emoji} ${alert.severity}`;
    return `[${status}] ${alert.message}\nServer: ${server}\nStarted: ${alert.startsAt.toISOString()}${alert.endsAt ? `\nEnded: ${alert.endsAt.toISOString()}` : ''}`;
  }

  it('should format firing alert', () => {
    const text = formatAlertText({
      status: 'FIRING',
      severity: 'CRITICAL',
      message: 'High CPU Usage',
      serverHostname: 'web-01',
      startsAt: new Date('2026-03-07T10:00:00Z'),
    });
    expect(text).toContain('🔴 CRITICAL');
    expect(text).toContain('High CPU Usage');
    expect(text).toContain('web-01');
    expect(text).not.toContain('Ended');
  });

  it('should format resolved alert', () => {
    const text = formatAlertText({
      status: 'RESOLVED',
      severity: 'WARNING',
      message: 'Disk Space Low',
      serverIp: '10.0.0.5',
      startsAt: new Date('2026-03-07T10:00:00Z'),
      endsAt: new Date('2026-03-07T10:05:00Z'),
    });
    expect(text).toContain('✅ RESOLVED');
    expect(text).toContain('10.0.0.5');
    expect(text).toContain('Ended');
  });

  it('should fallback to instance label for server', () => {
    const text = formatAlertText({
      status: 'FIRING',
      severity: 'WARNING',
      message: 'Test',
      labels: { instance: '192.168.1.100:9100' },
      startsAt: new Date('2026-03-07T10:00:00Z'),
    });
    expect(text).toContain('192.168.1.100:9100');
  });

  it('should show Unknown when no server info', () => {
    const text = formatAlertText({
      status: 'FIRING',
      severity: 'INFO',
      message: 'Test',
      startsAt: new Date('2026-03-07T10:00:00Z'),
    });
    expect(text).toContain('Unknown');
  });
});
