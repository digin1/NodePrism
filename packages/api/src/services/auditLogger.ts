import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export type AuditAction =
  // Server
  | 'server.create' | 'server.update' | 'server.delete'
  // Server Groups
  | 'server_group.create' | 'server_group.update' | 'server_group.delete' | 'server_group.move_servers'
  // Alert Rules
  | 'alert_rule.create' | 'alert_rule.update' | 'alert_rule.delete'
  // Alert Templates
  | 'alert_template.create' | 'alert_template.update' | 'alert_template.delete'
  // Alert Actions
  | 'alert.acknowledge' | 'alert.silence'
  // Notification Channels
  | 'notification_channel.create' | 'notification_channel.update' | 'notification_channel.delete' | 'notification_channel.test'
  // Settings
  // Maintenance Windows
  | 'maintenance_window.create' | 'maintenance_window.update' | 'maintenance_window.delete'
  // Settings
  | 'settings.update' | 'settings.logo_upload' | 'settings.logo_delete' | 'settings.export' | 'settings.import'
  // Auth
  | 'auth.login' | 'auth.register' | 'auth.logout'
  // Escalation Policies
  | 'escalation_policy.create' | 'escalation_policy.update' | 'escalation_policy.delete'
  // API Tokens
  | 'api_token.create' | 'api_token.revoke' | 'api_token.delete'
  // Post-Mortems
  | 'post_mortem.create' | 'post_mortem.update' | 'post_mortem.delete' | 'post_mortem.publish'
  // Alert Routing Rules
  | 'alert_routing_rule.create' | 'alert_routing_rule.update' | 'alert_routing_rule.delete'
  // Alert Inhibition Rules
  | 'alert_inhibition_rule.create' | 'alert_inhibition_rule.update' | 'alert_inhibition_rule.delete'
  // SLA Policies
  | 'sla_policy.create' | 'sla_policy.update' | 'sla_policy.delete'
  // Annotations
  | 'annotation.create' | 'annotation.update' | 'annotation.delete'
  // Composite Monitors
  | 'composite_monitor.create' | 'composite_monitor.update' | 'composite_monitor.delete'
  // Alert Groups
  | 'alert_group.resolve'
  // Status Pages
  | 'status_page.create' | 'status_page.update' | 'status_page.delete'
  // On-Call Schedules
  | 'on_call_schedule.create' | 'on_call_schedule.update' | 'on_call_schedule.delete'
  // SLOs
  | 'slo.create' | 'slo.update' | 'slo.delete'
  // SNMP Devices
  | 'snmp_device.create' | 'snmp_device.update' | 'snmp_device.delete'
  // Retention Policies
  | 'retention_policy.create' | 'retention_policy.update' | 'retention_policy.delete'
  // Service Dependencies
  | 'service_dependency.create' | 'service_dependency.delete'
  // Infrastructure Changes
  | 'infra_change.create' | 'infra_change.delete'
  // Kubernetes Clusters
  | 'kubernetes_cluster.create' | 'kubernetes_cluster.update' | 'kubernetes_cluster.delete'
  // Synthetic Checks
  | 'synthetic_check.create' | 'synthetic_check.update' | 'synthetic_check.delete';

interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Log an audit event. Call after a successful mutation.
 * Non-blocking — errors are logged but never thrown.
 */
export function audit(req: Request, entry: AuditEntry): void {
  const userId = req.user?.userId || null;
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || null;
  const userAgent = req.headers['user-agent'] || null;

  prisma.auditLog.create({
    data: {
      userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId || null,
      details: (entry.details as Prisma.InputJsonValue) || undefined,
      ipAddress,
      userAgent,
    },
  }).catch(err => {
    logger.error('Failed to write audit log', { error: err.message, action: entry.action });
  });
}
