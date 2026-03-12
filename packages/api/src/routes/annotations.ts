import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/annotations
 * List annotations, optionally filtered by time range and tags
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end, tags } = req.query;

    const where: Record<string, unknown> = {};

    if (start || end) {
      where.startTime = {};
      if (start) (where.startTime as Record<string, unknown>).gte = new Date(start as string);
      if (end) (where.startTime as Record<string, unknown>).lte = new Date(end as string);
    }

    if (tags) {
      const tagList = (tags as string).split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        where.tags = { hasSome: tagList };
      }
    }

    const annotations = await prisma.annotation.findMany({
      where,
      orderBy: { startTime: 'desc' },
    });

    res.json({ success: true, data: annotations });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/annotations
 * Create a new annotation
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, message, tags, startTime, endTime, color, createdBy } = req.body;

    if (!title || !startTime) {
      return res.status(400).json({ success: false, error: 'Missing required fields: title, startTime' });
    }

    const annotation = await prisma.annotation.create({
      data: {
        title,
        ...(message !== undefined && { message }),
        ...(tags !== undefined && { tags }),
        startTime: new Date(startTime),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(color !== undefined && { color }),
        ...(createdBy !== undefined && { createdBy }),
      },
    });

    audit(req, {
      action: 'annotation.create',
      entityType: 'annotation',
      entityId: annotation.id,
      details: { title },
    });

    logger.info('Annotation created', { id: annotation.id, title });
    res.status(201).json({ success: true, data: annotation });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/annotations/:id
 * Update an annotation
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.annotation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Annotation not found' });
    }

    const { title, message, tags, startTime, endTime, color, createdBy } = req.body;

    const annotation = await prisma.annotation.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(message !== undefined && { message }),
        ...(tags !== undefined && { tags }),
        ...(startTime !== undefined && { startTime: new Date(startTime) }),
        ...(endTime !== undefined && { endTime: endTime ? new Date(endTime) : null }),
        ...(color !== undefined && { color }),
        ...(createdBy !== undefined && { createdBy }),
      },
    });

    audit(req, {
      action: 'annotation.update',
      entityType: 'annotation',
      entityId: annotation.id,
    });

    res.json({ success: true, data: annotation });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/annotations/:id
 * Delete an annotation
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.annotation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Annotation not found' });
    }

    await prisma.annotation.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'annotation.delete',
      entityType: 'annotation',
      entityId: req.params.id,
    });

    logger.info('Annotation deleted', { id: req.params.id });
    res.json({ success: true, message: 'Annotation deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as annotationRoutes };
