import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/slos
 * List all SLOs
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slos = await prisma.slo.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with uptime monitor names
    const monitorIds = slos
      .map((s) => s.uptimeMonitorId)
      .filter((id): id is string => id !== null);

    const monitors = monitorIds.length > 0
      ? await prisma.uptimeMonitor.findMany({
          where: { id: { in: monitorIds } },
          select: { id: true, name: true, target: true, type: true },
        })
      : [];
    const monitorMap = new Map(monitors.map((m) => [m.id, m]));

    const enriched = slos.map((slo) => ({
      ...slo,
      uptimeMonitor: slo.uptimeMonitorId ? monitorMap.get(slo.uptimeMonitorId) || null : null,
    }));

    res.json({ success: true, data: enriched, count: enriched.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/slos
 * Create a new SLO
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, targetPercent, windowDays, uptimeMonitorId, metricQuery, enabled } = req.body;

    if (!name || targetPercent == null || windowDays == null) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, targetPercent, windowDays' });
    }

    // If uptimeMonitorId provided, verify it exists
    if (uptimeMonitorId) {
      const monitor = await prisma.uptimeMonitor.findUnique({ where: { id: uptimeMonitorId } });
      if (!monitor) {
        return res.status(404).json({ success: false, error: 'Uptime monitor not found' });
      }
    }

    const slo = await prisma.slo.create({
      data: {
        name,
        ...(description !== undefined && { description }),
        targetPercent,
        windowDays,
        ...(uptimeMonitorId !== undefined && { uptimeMonitorId }),
        ...(metricQuery !== undefined && { metricQuery }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'slo.create',
      entityType: 'slo',
      entityId: slo.id,
      details: { name, targetPercent, windowDays },
    });

    logger.info('SLO created', { id: slo.id, name });
    res.status(201).json({ success: true, data: slo });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/slos/:id
 * Get a single SLO with computed budget
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slo = await prisma.slo.findUnique({
      where: { id: req.params.id },
    });

    if (!slo) {
      return res.status(404).json({ success: false, error: 'SLO not found' });
    }

    // Enrich with monitor info
    let uptimeMonitor = null;
    if (slo.uptimeMonitorId) {
      uptimeMonitor = await prisma.uptimeMonitor.findUnique({
        where: { id: slo.uptimeMonitorId },
        select: { id: true, name: true, target: true, type: true },
      });
    }

    res.json({ success: true, data: { ...slo, uptimeMonitor } });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/slos/:id
 * Update an SLO
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.slo.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SLO not found' });
    }

    const { name, description, targetPercent, windowDays, uptimeMonitorId, metricQuery, enabled } = req.body;

    // If changing monitor, verify it exists
    if (uptimeMonitorId) {
      const monitor = await prisma.uptimeMonitor.findUnique({ where: { id: uptimeMonitorId } });
      if (!monitor) {
        return res.status(404).json({ success: false, error: 'Uptime monitor not found' });
      }
    }

    const slo = await prisma.slo.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(targetPercent !== undefined && { targetPercent }),
        ...(windowDays !== undefined && { windowDays }),
        ...(uptimeMonitorId !== undefined && { uptimeMonitorId }),
        ...(metricQuery !== undefined && { metricQuery }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'slo.update',
      entityType: 'slo',
      entityId: slo.id,
    });

    res.json({ success: true, data: slo });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/slos/:id
 * Delete an SLO
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.slo.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SLO not found' });
    }

    await prisma.slo.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'slo.delete',
      entityType: 'slo',
      entityId: req.params.id,
      details: { name: existing.name },
    });

    logger.info('SLO deleted', { id: req.params.id });
    res.json({ success: true, message: 'SLO deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/slos/:id/budget
 * Calculate error budget for an SLO
 */
router.get('/:id/budget', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slo = await prisma.slo.findUnique({
      where: { id: req.params.id },
    });

    if (!slo) {
      return res.status(404).json({ success: false, error: 'SLO not found' });
    }

    const totalWindowMinutes = slo.windowDays * 24 * 60;
    const errorBudgetMinutes = (1 - slo.targetPercent / 100) * totalWindowMinutes;

    let consumedMinutes = 0;

    if (slo.uptimeMonitorId) {
      const windowStart = new Date(Date.now() - slo.windowDays * 24 * 60 * 60 * 1000);

      // Count downtime checks in window
      const downChecks = await prisma.uptimeCheck.findMany({
        where: {
          monitorId: slo.uptimeMonitorId,
          checkedAt: { gte: windowStart },
          status: { notIn: ['UP', 'DEGRADED'] },
        },
        select: { checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      });

      // Get the monitor interval to determine downtime per check
      const monitor = await prisma.uptimeMonitor.findUnique({
        where: { id: slo.uptimeMonitorId },
        select: { interval: true },
      });

      const intervalMinutes = (monitor?.interval || 60) / 60;
      consumedMinutes = downChecks.length * intervalMinutes;
    }

    const remainingMinutes = Math.max(0, errorBudgetMinutes - consumedMinutes);

    // Burn rate: consumed / expected consumed at this point in the window
    const windowStart = new Date(Date.now() - slo.windowDays * 24 * 60 * 60 * 1000);
    const elapsedMs = Date.now() - windowStart.getTime();
    const totalWindowMs = slo.windowDays * 24 * 60 * 60 * 1000;
    const elapsedFraction = Math.min(elapsedMs / totalWindowMs, 1);
    const expectedConsumed = errorBudgetMinutes * elapsedFraction;
    const burnRate = expectedConsumed > 0 ? consumedMinutes / expectedConsumed : 0;

    res.json({
      success: true,
      data: {
        sloId: slo.id,
        name: slo.name,
        targetPercent: slo.targetPercent,
        windowDays: slo.windowDays,
        totalWindowMinutes,
        errorBudgetMinutes: Math.round(errorBudgetMinutes * 100) / 100,
        consumedMinutes: Math.round(consumedMinutes * 100) / 100,
        remainingMinutes: Math.round(remainingMinutes * 100) / 100,
        remainingPercent: errorBudgetMinutes > 0
          ? Math.round((remainingMinutes / errorBudgetMinutes) * 10000) / 100
          : 100,
        burnRate: Math.round(burnRate * 100) / 100,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as sloRoutes };
