import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import type { EventType, EventSeverity } from '@prisma/client';
import type { Server as SocketIOServer } from 'socket.io';

let socketIO: SocketIOServer | null = null;

/**
 * Set the Socket.IO instance for real-time event updates
 */
export function setEventLoggerSocket(io: SocketIOServer): void {
  socketIO = io;
}

/**
 * Log a monitoring event
 */
export async function logEvent({
  serverId,
  type,
  severity = 'INFO',
  title,
  message,
  metadata,
  source,
}: {
  serverId?: string;
  type: EventType;
  severity?: EventSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  source?: string;
}): Promise<void> {
  try {
    const event = await prisma.eventLog.create({
      data: {
        serverId,
        type,
        severity,
        title,
        message,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        source,
      },
      include: {
        server: {
          select: {
            hostname: true,
            ipAddress: true,
          },
        },
      },
    });

    // Log to console for debugging
    logger.info(`[EVENT] ${type}: ${title}`, { serverId, severity, source });

    // Emit to connected clients via Socket.IO
    if (socketIO) {
      socketIO.emit('event:new', {
        id: event.id,
        serverId: event.serverId,
        serverHostname: event.server?.hostname,
        type: event.type,
        severity: event.severity,
        title: event.title,
        message: event.message,
        metadata: event.metadata,
        source: event.source,
        createdAt: event.createdAt.toISOString(),
      });
    }
  } catch (error) {
    logger.error('Failed to log event', { error, type, title });
  }
}

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Log server status change
 */
export async function logServerStatusChange(
  serverId: string,
  oldStatus: string,
  newStatus: string,
  hostname: string,
  source: string = 'heartbeat'
): Promise<void> {
  // Check if this is a recovery (from OFFLINE/CRITICAL to ONLINE)
  const isRecovery = (oldStatus === 'OFFLINE' || oldStatus === 'CRITICAL') && newStatus === 'ONLINE';

  const typeMap: Record<string, EventType> = {
    ONLINE: 'SERVER_ONLINE',
    OFFLINE: 'SERVER_OFFLINE',
    WARNING: 'SERVER_WARNING',
    CRITICAL: 'SERVER_CRITICAL',
  };

  const severityMap: Record<string, EventSeverity> = {
    ONLINE: 'INFO',
    OFFLINE: 'CRITICAL',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL',
  };

  // Use SERVER_RECOVERED event type for recovery scenarios
  const eventType = isRecovery ? 'SERVER_RECOVERED' : (typeMap[newStatus] || 'SERVER_OFFLINE');
  const title = isRecovery ? 'Server recovered' : `Server ${newStatus.toLowerCase()}`;
  const message = isRecovery
    ? `Server ${hostname} has recovered and is now online (was ${oldStatus})`
    : `Server ${hostname} changed status from ${oldStatus} to ${newStatus}`;

  await logEvent({
    serverId,
    type: eventType as EventType,
    severity: severityMap[newStatus] || 'INFO',
    title,
    message,
    metadata: { oldStatus, newStatus, hostname, isRecovery },
    source,
  });
}

/**
 * Log agent status change
 */
export async function logAgentStatusChange(
  serverId: string,
  agentType: string,
  oldStatus: string,
  newStatus: string,
  hostname: string
): Promise<void> {
  const typeMap: Record<string, EventType> = {
    RUNNING: 'AGENT_STARTED',
    STOPPED: 'AGENT_STOPPED',
    FAILED: 'AGENT_FAILED',
    INSTALLING: 'AGENT_INSTALLED',
    UPDATING: 'AGENT_UPDATED',
  };

  const severityMap: Record<string, EventSeverity> = {
    RUNNING: 'INFO',
    STOPPED: 'WARNING',
    FAILED: 'CRITICAL',
    INSTALLING: 'INFO',
    UPDATING: 'INFO',
  };

  await logEvent({
    serverId,
    type: typeMap[newStatus] || 'AGENT_STOPPED',
    severity: severityMap[newStatus] || 'INFO',
    title: `${agentType} ${newStatus.toLowerCase()}`,
    message: `Agent ${agentType} on ${hostname} changed from ${oldStatus} to ${newStatus}`,
    metadata: { agentType, oldStatus, newStatus, hostname },
    source: 'agent-monitor',
  });
}

/**
 * Log deployment event
 */
export async function logDeployment(
  serverId: string,
  agentType: string,
  status: 'started' | 'completed' | 'failed',
  hostname: string,
  error?: string
): Promise<void> {
  const typeMap: Record<string, EventType> = {
    started: 'DEPLOYMENT_STARTED',
    completed: 'DEPLOYMENT_COMPLETED',
    failed: 'DEPLOYMENT_FAILED',
  };

  const severityMap: Record<string, EventSeverity> = {
    started: 'INFO',
    completed: 'INFO',
    failed: 'CRITICAL',
  };

  await logEvent({
    serverId,
    type: typeMap[status],
    severity: severityMap[status],
    title: `Deployment ${status}`,
    message: error
      ? `Deployment of ${agentType} on ${hostname} failed: ${error}`
      : `Deployment of ${agentType} on ${hostname} ${status}`,
    metadata: { agentType, hostname, error },
    source: 'deployment-worker',
  });
}

/**
 * Log threshold alert
 */
export async function logThresholdAlert(
  serverId: string,
  metric: string,
  value: number,
  threshold: number,
  severity: 'warning' | 'critical' | 'cleared',
  hostname: string
): Promise<void> {
  const typeMap: Record<string, EventType> = {
    warning: 'THRESHOLD_WARNING',
    critical: 'THRESHOLD_CRITICAL',
    cleared: 'THRESHOLD_CLEARED',
  };

  const severityMap: Record<string, EventSeverity> = {
    warning: 'WARNING',
    critical: 'CRITICAL',
    cleared: 'INFO',
  };

  await logEvent({
    serverId,
    type: typeMap[severity],
    severity: severityMap[severity],
    title: severity === 'cleared'
      ? `${metric} returned to normal`
      : `${metric} ${severity}`,
    message: severity === 'cleared'
      ? `${metric} on ${hostname} is now at ${value.toFixed(1)}% (was above ${threshold}%)`
      : `${metric} on ${hostname} is at ${value.toFixed(1)}% (threshold: ${threshold}%)`,
    metadata: { metric, value, threshold, hostname },
    source: 'metric-collector',
  });
}

/**
 * Log heartbeat missed
 */
export async function logHeartbeatMissed(
  serverId: string,
  hostname: string,
  lastSeen: Date | null
): Promise<void> {
  await logEvent({
    serverId,
    type: 'HEARTBEAT_MISSED',
    severity: 'WARNING',
    title: 'Heartbeat missed',
    message: `No heartbeat received from ${hostname} since ${lastSeen?.toISOString() || 'unknown'}`,
    metadata: { hostname, lastSeen: lastSeen?.toISOString() },
    source: 'heartbeat-cleanup',
  });
}

/**
 * Log system startup
 */
export async function logSystemStartup(): Promise<void> {
  await logEvent({
    type: 'SYSTEM_STARTUP',
    severity: 'INFO',
    title: 'System started',
    message: 'NodePrism monitoring system has started',
    source: 'system',
  });
}

/**
 * Log alert triggered/resolved
 */
export async function logAlertEvent(
  serverId: string | null,
  alertName: string,
  status: 'triggered' | 'resolved' | 'acknowledged',
  severity: 'WARNING' | 'CRITICAL',
  details?: Record<string, unknown>
): Promise<void> {
  const typeMap: Record<string, EventType> = {
    triggered: 'ALERT_TRIGGERED',
    resolved: 'ALERT_RESOLVED',
    acknowledged: 'ALERT_ACKNOWLEDGED',
  };

  await logEvent({
    serverId: serverId || undefined,
    type: typeMap[status],
    severity: status === 'resolved' ? 'INFO' : severity,
    title: `Alert ${status}: ${alertName}`,
    message: `Alert "${alertName}" has been ${status}`,
    metadata: details,
    source: 'alertmanager',
  });
}

/**
 * Get recent events
 */
export async function getRecentEvents(options: {
  limit?: number;
  offset?: number;
  serverId?: string;
  type?: EventType;
  severity?: EventSeverity;
  startTime?: Date;
  endTime?: Date;
} = {}): Promise<{
  events: Array<{
    id: string;
    serverId: string | null;
    serverHostname?: string;
    type: EventType;
    severity: EventSeverity;
    title: string;
    message: string;
    metadata: unknown;
    source: string | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const { limit = 100, offset = 0, serverId, type, severity, startTime, endTime } = options;

  const where: Record<string, unknown> = {};

  if (serverId) where.serverId = serverId;
  if (type) where.type = type;
  if (severity) where.severity = severity;
  if (startTime || endTime) {
    where.createdAt = {
      ...(startTime && { gte: startTime }),
      ...(endTime && { lte: endTime }),
    };
  }

  const [events, total] = await Promise.all([
    prisma.eventLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        server: {
          select: {
            hostname: true,
          },
        },
      },
    }),
    prisma.eventLog.count({ where }),
  ]);

  return {
    events: events.map(e => ({
      id: e.id,
      serverId: e.serverId,
      serverHostname: e.server?.hostname,
      type: e.type,
      severity: e.severity,
      title: e.title,
      message: e.message,
      metadata: e.metadata,
      source: e.source,
      createdAt: e.createdAt,
    })),
    total,
  };
}

/**
 * Clean up old events (retention policy)
 */
export async function cleanupOldEvents(retentionDays: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await prisma.eventLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });

  if (result.count > 0) {
    logger.info(`Cleaned up ${result.count} old event logs`);
  }

  return result.count;
}
