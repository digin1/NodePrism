import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router: ExpressRouter = Router();

// All audit routes require ADMIN role
router.use(requireAuth, requireRole('ADMIN'));

// GET /api/audit - List audit log entries
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      action,
      entityType,
      entityId,
      userId,
      limit = '50',
      offset = '0',
    } = req.query;

    const where: Record<string, unknown> = {};
    if (action) where.action = { contains: action as string };
    if (entityType) where.entityType = entityType as string;
    if (entityId) where.entityId = entityId as string;
    if (userId) where.userId = userId as string;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string) || 50, 200),
        skip: parseInt(offset as string) || 0,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ success: true, data: logs, total });
  } catch (error) {
    next(error);
  }
});

// GET /api/audit/entity/:type/:id - Get audit trail for a specific entity
router.get('/entity/:type/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: req.params.type,
        entityId: req.params.id,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// GET /api/audit/stats - Audit log statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [total, last24h, byAction] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 20,
      }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        last24h,
        byAction: byAction.map(a => ({ action: a.action, count: a._count })),
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as auditRoutes };
