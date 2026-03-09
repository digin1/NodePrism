import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { logger } from '../utils/logger';
import { getRecentEvents, cleanupOldEvents } from '../services/eventLogger';
import type { EventType, EventSeverity } from '@prisma/client';

const router: ExpressRouter = Router();

// GET /api/events - Get monitoring events
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      limit = '100',
      offset = '0',
      serverId,
      type,
      severity,
      startTime,
      endTime,
    } = req.query;

    const options = {
      limit: Math.min(Math.max(1, parseInt(limit as string, 10) || 100), 500),
      offset: parseInt(offset as string, 10) || 0,
      serverId: serverId as string | undefined,
      type: type as EventType | undefined,
      severity: severity as EventSeverity | undefined,
      startTime: startTime ? new Date(startTime as string) : undefined,
      endTime: endTime ? new Date(endTime as string) : undefined,
    };

    const { events, total } = await getRecentEvents(options);

    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        limit: options.limit,
        offset: options.offset,
        hasMore: options.offset + events.length < total,
      },
    });
  } catch (error) {
    logger.error('Error fetching events:', error);
    next(error);
  }
});

// GET /api/events/types - Get available event types
router.get('/types', (_req: Request, res: Response) => {
  const eventTypes = {
    availability: [
      'SERVER_ONLINE',
      'SERVER_OFFLINE',
      'SERVER_WARNING',
      'SERVER_CRITICAL',
    ],
    agent: [
      'AGENT_INSTALLED',
      'AGENT_STARTED',
      'AGENT_STOPPED',
      'AGENT_FAILED',
      'AGENT_UPDATED',
    ],
    alert: [
      'ALERT_TRIGGERED',
      'ALERT_RESOLVED',
      'ALERT_ACKNOWLEDGED',
    ],
    threshold: [
      'THRESHOLD_WARNING',
      'THRESHOLD_CRITICAL',
      'THRESHOLD_CLEARED',
    ],
    anomaly: [
      'ANOMALY_DETECTED',
      'ANOMALY_RESOLVED',
    ],
    system: [
      'SYSTEM_STARTUP',
      'SYSTEM_SHUTDOWN',
      'HEARTBEAT_MISSED',
      'CONNECTION_LOST',
      'CONNECTION_RESTORED',
    ],
  };

  res.json({
    success: true,
    data: eventTypes,
  });
});

// GET /api/events/severities - Get available severity levels
router.get('/severities', (_req: Request, res: Response) => {
  const severities = ['DEBUG', 'INFO', 'WARNING', 'CRITICAL'];

  res.json({
    success: true,
    data: severities,
  });
});

// GET /api/events/stats - Get event statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period = '24h' } = req.query;

    const periodMs: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };

    const startTime = new Date(Date.now() - (periodMs[period as string] || periodMs['24h']));

    const { prisma } = await import('../lib/prisma');

    // Get counts by severity
    const bySeverity = await prisma.eventLog.groupBy({
      by: ['severity'],
      where: {
        createdAt: { gte: startTime },
      },
      _count: true,
    });

    // Get counts by type
    const byType = await prisma.eventLog.groupBy({
      by: ['type'],
      where: {
        createdAt: { gte: startTime },
      },
      _count: true,
    });

    // Get total count
    const total = await prisma.eventLog.count({
      where: {
        createdAt: { gte: startTime },
      },
    });

    res.json({
      success: true,
      data: {
        period,
        total,
        bySeverity: Object.fromEntries(
          bySeverity.map(s => [s.severity, s._count])
        ),
        byType: Object.fromEntries(
          byType.map(t => [t.type, t._count])
        ),
      },
    });
  } catch (error) {
    logger.error('Error fetching event stats:', error);
    next(error);
  }
});

// POST /api/events/cleanup - Manually trigger event cleanup (admin only)
router.post('/cleanup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { retentionDays = 30 } = req.body;
    const deleted = await cleanupOldEvents(retentionDays);

    res.json({
      success: true,
      data: {
        deletedCount: deleted,
        retentionDays,
      },
    });
  } catch (error) {
    logger.error('Error cleaning up events:', error);
    next(error);
  }
});

export { router as eventRoutes };
