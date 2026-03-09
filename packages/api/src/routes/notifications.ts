import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { sendTestNotification } from '../services/notificationSender';
import { generateAndSendReport } from '../services/dailyReport';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

// Validation schemas
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

// GET /api/notifications/channels - List all notification channels
router.get('/channels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channels = await prisma.notificationChannel.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { logs: true } },
      },
    });

    // Mask sensitive config fields
    const masked = channels.map(ch => ({
      ...ch,
      config: maskSensitiveFields(ch.config as Record<string, unknown>),
    }));

    res.json({ success: true, data: masked });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/channels/:id - Get single channel
router.get('/channels/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { logs: true } },
      },
    });

    if (!channel) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }

    res.json({
      success: true,
      data: {
        ...channel,
        config: maskSensitiveFields(channel.config as Record<string, unknown>),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/channels - Create notification channel
router.post('/channels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createChannelSchema.parse(req.body);

    const channel = await prisma.notificationChannel.create({
      data: {
        name: data.name,
        type: data.type as any,
        config: data.config,
        enabled: data.enabled,
      },
    });

    logger.info(`Notification channel created: ${channel.name} (${channel.type})`);
    audit(req, { action: 'notification_channel.create', entityType: 'notification_channel', entityId: channel.id, details: { name: channel.name, type: channel.type } });

    res.status(201).json({ success: true, data: channel });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// PUT /api/notifications/channels/:id - Update channel
router.put('/channels/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateChannelSchema.parse(req.body);

    const existing = await prisma.notificationChannel.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }

    const channel = await prisma.notificationChannel.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type as any }),
        ...(data.config !== undefined && { config: data.config }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
      },
    });

    logger.info(`Notification channel updated: ${channel.name}`);
    audit(req, { action: 'notification_channel.update', entityType: 'notification_channel', entityId: channel.id, details: { name: channel.name } });

    res.json({ success: true, data: channel });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// DELETE /api/notifications/channels/:id - Delete channel
router.delete('/channels/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.notificationChannel.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }

    await prisma.notificationChannel.delete({
      where: { id: req.params.id },
    });

    logger.info(`Notification channel deleted: ${existing.name}`);
    audit(req, { action: 'notification_channel.delete', entityType: 'notification_channel', entityId: req.params.id, details: { name: existing.name } });

    res.json({ success: true, message: 'Channel deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/channels/:id/test - Send test notification
router.post('/channels/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await sendTestNotification(req.params.id);

    if (result.success) {
      res.json({ success: true, message: 'Test notification sent successfully' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/logs - Get notification delivery logs
router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, status, limit = '50' } = req.query;

    const logs = await prisma.notificationLog.findMany({
      where: {
        ...(channelId && { channelId: channelId as string }),
        ...(status && { status: status as string }),
      },
      include: {
        channel: { select: { name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string) || 50, 200),
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────

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

// POST /api/notifications/daily-report - Trigger daily report manually
router.post('/daily-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Run async, respond immediately
    generateAndSendReport().catch(err =>
      logger.error('Manual daily report failed', { error: err.message })
    );

    res.json({ success: true, message: 'Daily report generation started' });
  } catch (error) {
    next(error);
  }
});

export { router as notificationRoutes };
