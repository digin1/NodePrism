import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/retention-policies
 * List all retention policies
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await prisma.retentionPolicy.findMany({
      orderBy: { metricType: 'asc' },
    });

    res.json({ success: true, data: policies });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/retention-policies
 * Create a retention policy (or upsert by metricType)
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { metricType, retentionDays, enabled } = req.body;

    if (!metricType || retentionDays == null) {
      return res.status(400).json({ success: false, error: 'Missing required fields: metricType, retentionDays' });
    }

    if (typeof retentionDays !== 'number' || retentionDays < 1) {
      return res.status(400).json({ success: false, error: 'retentionDays must be a positive number' });
    }

    const policy = await prisma.retentionPolicy.upsert({
      where: { metricType },
      create: {
        metricType,
        retentionDays,
        enabled: enabled ?? true,
      },
      update: {
        retentionDays,
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'retention_policy.create',
      entityType: 'retention_policy',
      entityId: policy.id,
      details: { metricType, retentionDays },
    });

    logger.info('Retention policy upserted', { metricType, retentionDays });
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/retention-policies/:id
 * Update a retention policy
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.retentionPolicy.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Retention policy not found' });
    }

    const { retentionDays, enabled } = req.body;

    const policy = await prisma.retentionPolicy.update({
      where: { id: req.params.id },
      data: {
        ...(retentionDays !== undefined && { retentionDays }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'retention_policy.update',
      entityType: 'retention_policy',
      entityId: policy.id,
    });

    res.json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/retention-policies/:id
 * Delete a retention policy
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.retentionPolicy.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Retention policy not found' });
    }

    await prisma.retentionPolicy.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'retention_policy.delete',
      entityType: 'retention_policy',
      entityId: req.params.id,
    });

    logger.info('Retention policy deleted', { id: req.params.id });
    res.json({ success: true, message: 'Retention policy deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as retentionPolicyRoutes };
