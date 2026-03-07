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
  | 'settings.update' | 'settings.logo_upload' | 'settings.logo_delete' | 'settings.export' | 'settings.import'
  // Auth
  | 'auth.login' | 'auth.register' | 'auth.logout';

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
