import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/infra-changes
 * List changes with filters (serverId, changeType, start, end)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, changeType, start, end } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const where: any = {};

    if (serverId) {
      where.serverId = serverId as string;
    }
    if (changeType) {
      where.changeType = changeType as string;
    }
    if (start || end) {
      where.detectedAt = {};
      if (start) where.detectedAt.gte = new Date(start as string);
      if (end) where.detectedAt.lte = new Date(end as string);
    }

    const [changes, total] = await Promise.all([
      prisma.infraChange.findMany({
        where,
        include: {
          server: { select: { id: true, hostname: true, ipAddress: true } },
        },
        orderBy: { detectedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.infraChange.count({ where }),
    ]);

    res.json({ success: true, data: changes, count: total });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/infra-changes
 * Create change (webhook ingestion)
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, changeType, source, title, details, detectedAt } = req.body;

    if (!changeType || !source || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: changeType, source, title',
      });
    }

    // If serverId is provided, verify it exists
    if (serverId) {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
    }

    const change = await prisma.infraChange.create({
      data: {
        serverId: serverId || null,
        changeType,
        source,
        title,
        details: details || null,
        detectedAt: detectedAt ? new Date(detectedAt) : new Date(),
      },
      include: {
        server: { select: { id: true, hostname: true, ipAddress: true } },
      },
    });

    audit(req, {
      action: 'infra_change.create',
      entityType: 'infra_change',
      entityId: change.id,
      details: { changeType, source, title },
    });

    logger.info('Infrastructure change recorded', { id: change.id, changeType, title });
    res.status(201).json({ success: true, data: change });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/infra-changes/:id
 * Delete a change
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.infraChange.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Infrastructure change not found' });
    }

    await prisma.infraChange.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'infra_change.delete',
      entityType: 'infra_change',
      entityId: req.params.id,
    });

    logger.info('Infrastructure change deleted', { id: req.params.id });
    res.json({ success: true, message: 'Infrastructure change deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as infraChangeRoutes };
