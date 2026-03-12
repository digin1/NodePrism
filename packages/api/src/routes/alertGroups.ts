import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/alert-groups
 * List all alert groups with alert count
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groups = await prisma.alertGroup.findMany({
      orderBy: { lastSeenAt: 'desc' },
      include: {
        _count: { select: { alerts: true } },
      },
    });

    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/alert-groups/:id
 * Get a single alert group with its member alerts
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const group = await prisma.alertGroup.findUnique({
      where: { id: req.params.id },
      include: {
        alerts: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            message: true,
            severity: true,
            status: true,
            startsAt: true,
            endsAt: true,
            labels: true,
            fingerprint: true,
            createdAt: true,
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ success: false, error: 'Alert group not found' });
    }

    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/alert-groups/:id/resolve
 * Resolve an alert group
 */
router.put('/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertGroup.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Alert group not found' });
    }

    if (existing.status === 'resolved') {
      return res.status(400).json({ success: false, error: 'Alert group is already resolved' });
    }

    const group = await prisma.alertGroup.update({
      where: { id: req.params.id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
      },
      include: {
        _count: { select: { alerts: true } },
      },
    });

    audit(req, {
      action: 'alert_group.resolve',
      entityType: 'alert_group',
      entityId: group.id,
      details: { name: group.name },
    });

    logger.info('Alert group resolved', { id: group.id, name: group.name });
    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
});

export { router as alertGroupRoutes };
