import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

// Validation schemas
const createAlertRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  query: z.string().min(1), // PromQL query
  duration: z.string().default('5m'),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO', 'DEBUG']),
  labels: z.record(z.string(), z.string()).optional(),
  annotations: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
});

// GET /api/alerts - Get active alerts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, severity, serverId } = req.query;

    const alerts = await prisma.alert.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(severity && { severity: severity as any }),
        ...(serverId && { serverId: serverId as string }),
      },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
        rule: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/rules - Get all alert rules
router.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await prisma.alertRule.findMany({
      include: {
        _count: {
          select: { alerts: { where: { status: 'FIRING' } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/rules - Create alert rule
router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createAlertRuleSchema.parse(req.body);

    const rule = await prisma.alertRule.create({
      data,
    });

    logger.info(`Alert rule created: ${rule.name}`);

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// PUT /api/alerts/rules/:id - Update alert rule
router.put('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = createAlertRuleSchema.partial().parse(req.body);

    const rule = await prisma.alertRule.update({
      where: { id },
      data,
    });

    logger.info(`Alert rule updated: ${rule.name}`);

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/alerts/rules/:id - Delete alert rule
router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await prisma.alertRule.delete({
      where: { id },
    });

    logger.info(`Alert rule deleted: ${id}`);

    res.json({
      success: true,
      message: 'Alert rule deleted',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/:id/acknowledge - Acknowledge an alert
router.post('/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { acknowledgedBy } = req.body;

    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
    });

    logger.info(`Alert acknowledged: ${id}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('alert:acknowledged', alert);
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/webhook - Receive alerts from AlertManager
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { alerts } = req.body;

    logger.info('Received AlertManager webhook', { alertCount: alerts?.length });

    // Process each alert from AlertManager
    for (const alert of alerts || []) {
      const fingerprint = alert.fingerprint;
      const status = alert.status === 'firing' ? 'FIRING' : 'RESOLVED';

      // Upsert the alert
      await prisma.alert.upsert({
        where: { fingerprint },
        create: {
          fingerprint,
          status,
          severity: (alert.labels?.severity?.toUpperCase() || 'WARNING') as any,
          message: alert.annotations?.summary || alert.annotations?.description || 'Alert triggered',
          labels: alert.labels,
          annotations: alert.annotations,
          startsAt: new Date(alert.startsAt),
          endsAt: alert.endsAt ? new Date(alert.endsAt) : null,
        },
        update: {
          status,
          endsAt: alert.endsAt ? new Date(alert.endsAt) : null,
        },
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('alerts:updated', { count: alerts?.length });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/stats - Get alert statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [firing, resolved, critical, warning] = await Promise.all([
      prisma.alert.count({ where: { status: 'FIRING' } }),
      prisma.alert.count({ where: { status: 'RESOLVED' } }),
      prisma.alert.count({ where: { status: 'FIRING', severity: 'CRITICAL' } }),
      prisma.alert.count({ where: { status: 'FIRING', severity: 'WARNING' } }),
    ]);

    res.json({
      success: true,
      data: {
        firing,
        resolved,
        critical,
        warning,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as alertRoutes };
