import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

// GET /api/post-mortems - List all post-mortems with incident title
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const postMortems = await prisma.postMortem.findMany({
      include: {
        incident: { select: { id: true, title: true, severity: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: postMortems });
  } catch (error) {
    next(error);
  }
});

// GET /api/post-mortems/:incidentId - Get post-mortem by incident ID
router.get('/:incidentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const postMortem = await prisma.postMortem.findUnique({
      where: { incidentId: req.params.incidentId },
      include: { incident: true },
    });

    if (!postMortem) {
      return res.status(404).json({ success: false, error: 'Post-mortem not found' });
    }

    res.json({ success: true, data: postMortem });
  } catch (error) {
    next(error);
  }
});

// POST /api/post-mortems - Create a post-mortem
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { incidentId, summary, rootCause, impact, timeline, actionItems, createdBy } = req.body;

    if (!incidentId || !summary || !rootCause || !impact || !timeline) {
      return res.status(400).json({
        success: false,
        error: 'incidentId, summary, rootCause, impact, and timeline are required',
      });
    }

    // Verify incident exists
    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    const postMortem = await prisma.postMortem.create({
      data: {
        incidentId,
        summary,
        rootCause,
        impact,
        timeline,
        actionItems: actionItems || [],
        ...(createdBy && { createdBy }),
      },
      include: { incident: true },
    });

    audit(req, {
      action: 'post_mortem.create',
      entityType: 'post_mortem',
      entityId: postMortem.id,
      details: { incidentId },
    });

    logger.info('Post-mortem created', { id: postMortem.id, incidentId });
    res.status(201).json({ success: true, data: postMortem });
  } catch (error) {
    next(error);
  }
});

// PUT /api/post-mortems/:id - Update a post-mortem
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.postMortem.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post-mortem not found' });
    }

    const { summary, rootCause, impact, timeline, actionItems } = req.body;

    const postMortem = await prisma.postMortem.update({
      where: { id: req.params.id },
      data: {
        ...(summary !== undefined && { summary }),
        ...(rootCause !== undefined && { rootCause }),
        ...(impact !== undefined && { impact }),
        ...(timeline !== undefined && { timeline }),
        ...(actionItems !== undefined && { actionItems }),
      },
      include: { incident: true },
    });

    audit(req, {
      action: 'post_mortem.update',
      entityType: 'post_mortem',
      entityId: postMortem.id,
    });

    res.json({ success: true, data: postMortem });
  } catch (error) {
    next(error);
  }
});

// POST /api/post-mortems/:id/publish - Publish a post-mortem
router.post('/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.postMortem.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post-mortem not found' });
    }

    const postMortem = await prisma.postMortem.update({
      where: { id: req.params.id },
      data: { publishedAt: new Date() },
      include: { incident: true },
    });

    audit(req, {
      action: 'post_mortem.publish',
      entityType: 'post_mortem',
      entityId: postMortem.id,
    });

    logger.info('Post-mortem published', { id: postMortem.id });
    res.json({ success: true, data: postMortem });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/post-mortems/:id - Delete a post-mortem
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.postMortem.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post-mortem not found' });
    }

    await prisma.postMortem.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'post_mortem.delete',
      entityType: 'post_mortem',
      entityId: req.params.id,
    });

    logger.info('Post-mortem deleted', { id: req.params.id });
    res.json({ success: true, message: 'Post-mortem deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as postMortemRoutes };
