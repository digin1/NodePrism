import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/sla-policies
 * List all SLA policies with uptime monitor name
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await prisma.slaPolicy.findMany({
      include: {
        uptimeMonitor: { select: { id: true, name: true, target: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: policies });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sla-policies/:id
 * Get a single SLA policy with monitor info
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await prisma.slaPolicy.findUnique({
      where: { id: req.params.id },
      include: {
        uptimeMonitor: { select: { id: true, name: true, target: true, type: true } },
      },
    });

    if (!policy) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    res.json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sla-policies/:id/compliance
 * Calculate SLA compliance for a policy
 */
router.get('/:id/compliance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await prisma.slaPolicy.findUnique({
      where: { id: req.params.id },
    });

    if (!policy) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    const windowStart = new Date(Date.now() - policy.windowDays * 24 * 60 * 60 * 1000);

    const checks = await prisma.uptimeCheck.findMany({
      where: {
        monitorId: policy.uptimeMonitorId,
        checkedAt: { gte: windowStart },
      },
      select: { status: true },
    });

    const totalChecks = checks.length;
    const upChecks = checks.filter(c => c.status === 'UP').length;
    const downChecks = totalChecks - upChecks;
    const actualPercent = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 0;

    res.json({
      success: true,
      data: {
        targetPercent: policy.targetPercent,
        actualPercent: Math.round(actualPercent * 10000) / 10000,
        compliant: actualPercent >= policy.targetPercent,
        totalChecks,
        upChecks,
        downChecks,
        windowDays: policy.windowDays,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sla-policies
 * Create a new SLA policy
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, uptimeMonitorId, targetPercent, windowDays, enabled } = req.body;

    if (!name || !uptimeMonitorId || targetPercent == null || windowDays == null) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, uptimeMonitorId, targetPercent, windowDays' });
    }

    // Verify monitor exists
    const monitor = await prisma.uptimeMonitor.findUnique({ where: { id: uptimeMonitorId } });
    if (!monitor) {
      return res.status(404).json({ success: false, error: 'Uptime monitor not found' });
    }

    const policy = await prisma.slaPolicy.create({
      data: {
        name,
        uptimeMonitorId,
        targetPercent,
        windowDays,
        ...(enabled !== undefined && { enabled }),
      },
      include: {
        uptimeMonitor: { select: { id: true, name: true, target: true, type: true } },
      },
    });

    audit(req, {
      action: 'sla_policy.create',
      entityType: 'sla_policy',
      entityId: policy.id,
      details: { name, uptimeMonitorId, targetPercent, windowDays },
    });

    logger.info('SLA policy created', { id: policy.id, name });
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/sla-policies/:id
 * Update an SLA policy
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.slaPolicy.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    const { name, uptimeMonitorId, targetPercent, windowDays, enabled } = req.body;

    // If changing monitor, verify it exists
    if (uptimeMonitorId) {
      const monitor = await prisma.uptimeMonitor.findUnique({ where: { id: uptimeMonitorId } });
      if (!monitor) {
        return res.status(404).json({ success: false, error: 'Uptime monitor not found' });
      }
    }

    const policy = await prisma.slaPolicy.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(uptimeMonitorId !== undefined && { uptimeMonitorId }),
        ...(targetPercent !== undefined && { targetPercent }),
        ...(windowDays !== undefined && { windowDays }),
        ...(enabled !== undefined && { enabled }),
      },
      include: {
        uptimeMonitor: { select: { id: true, name: true, target: true, type: true } },
      },
    });

    audit(req, {
      action: 'sla_policy.update',
      entityType: 'sla_policy',
      entityId: policy.id,
    });

    res.json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/sla-policies/:id
 * Delete an SLA policy
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.slaPolicy.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    await prisma.slaPolicy.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'sla_policy.delete',
      entityType: 'sla_policy',
      entityId: req.params.id,
    });

    logger.info('SLA policy deleted', { id: req.params.id });
    res.json({ success: true, message: 'SLA policy deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as slaPolicyRoutes };
