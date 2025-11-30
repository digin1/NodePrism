import { z } from 'zod';

export const AlertSeveritySchema = z.enum(['critical', 'warning', 'info', 'debug']);

export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertStatusSchema = z.enum(['firing', 'resolved', 'silenced']);

export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const AlertRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  query: z.string().min(1), // PromQL query
  duration: z.string().default('5m'), // e.g., "5m", "1h"
  severity: AlertSeveritySchema,
  labels: z.record(z.string(), z.string()).optional(),
  annotations: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const AlertSchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string().uuid(),
  status: AlertStatusSchema,
  severity: AlertSeveritySchema,
  message: z.string(),
  labels: z.record(z.string(), z.string()),
  annotations: z.record(z.string(), z.string()).optional(),
  startsAt: z.date(),
  endsAt: z.date().optional(),
  fingerprint: z.string(),
});

export type Alert = z.infer<typeof AlertSchema>;

export const NotificationChannelTypeSchema = z.enum([
  'email',
  'slack',
  'discord',
  'webhook',
  'pagerduty',
]);

export type NotificationChannelType = z.infer<typeof NotificationChannelTypeSchema>;

export const NotificationChannelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: NotificationChannelTypeSchema,
  config: z.record(z.string(), z.any()),
  enabled: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
