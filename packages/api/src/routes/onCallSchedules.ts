import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/on-call-schedules/current
 * Get who is currently on call across all schedules
 * NOTE: Must be defined BEFORE /:id to avoid "current" being parsed as an id
 */
router.get('/current', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();

    const activeRotations = await prisma.onCallRotation.findMany({
      where: {
        startTime: { lte: now },
        endTime: { gte: now },
      },
      include: {
        schedule: true,
      },
    });

    // Enrich with user info
    const userIds = [...new Set(activeRotations.map((r) => r.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = activeRotations.map((r) => ({
      ...r,
      user: userMap.get(r.userId) || null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/on-call-schedules
 * List all schedules with rotation count
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedules = await prisma.onCallSchedule.findMany({
      include: {
        _count: { select: { rotations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: schedules, count: schedules.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/on-call-schedules
 * Create a new schedule
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, timezone } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const schedule = await prisma.onCallSchedule.create({
      data: {
        name: name.trim(),
        ...(timezone && { timezone }),
      },
      include: {
        _count: { select: { rotations: true } },
      },
    });

    audit(req, {
      action: 'on_call_schedule.create',
      entityType: 'on_call_schedule',
      entityId: schedule.id,
      details: { name: schedule.name, timezone: schedule.timezone },
    });

    logger.info(`On-call schedule created: ${schedule.name}`);
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/on-call-schedules/:id
 * Get a single schedule with its rotations
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await prisma.onCallSchedule.findUnique({
      where: { id: req.params.id },
      include: {
        rotations: {
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    // Enrich rotations with user info
    const userIds = [...new Set(schedule.rotations.map((r) => r.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enrichedRotations = schedule.rotations.map((r) => ({
      ...r,
      user: userMap.get(r.userId) || null,
    }));

    res.json({
      success: true,
      data: { ...schedule, rotations: enrichedRotations },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/on-call-schedules/:id
 * Update a schedule
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.onCallSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const { name, timezone } = req.body;

    const schedule = await prisma.onCallSchedule.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(timezone !== undefined && { timezone }),
      },
      include: {
        _count: { select: { rotations: true } },
      },
    });

    audit(req, {
      action: 'on_call_schedule.update',
      entityType: 'on_call_schedule',
      entityId: schedule.id,
    });

    res.json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/on-call-schedules/:id
 * Delete a schedule (cascade deletes rotations)
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.onCallSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    await prisma.onCallSchedule.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'on_call_schedule.delete',
      entityType: 'on_call_schedule',
      entityId: req.params.id,
      details: { name: existing.name },
    });

    logger.info(`On-call schedule deleted: ${req.params.id}`);
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/on-call-schedules/:id/rotations
 * Add a rotation to a schedule
 */
router.post('/:id/rotations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await prisma.onCallSchedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const { userId, startTime, endTime } = req.body;

    if (!userId || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'Missing required fields: userId, startTime, endTime' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end <= start) {
      return res.status(400).json({ success: false, error: 'endTime must be after startTime' });
    }

    const rotation = await prisma.onCallRotation.create({
      data: {
        scheduleId: req.params.id,
        userId,
        startTime: start,
        endTime: end,
      },
    });

    // Enrich with user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    audit(req, {
      action: 'on_call_schedule.update',
      entityType: 'on_call_rotation',
      entityId: rotation.id,
      details: { scheduleId: req.params.id, userId, startTime, endTime },
    });

    logger.info(`On-call rotation added to schedule ${schedule.name}`);
    res.status(201).json({ success: true, data: { ...rotation, user } });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/on-call-schedules/rotations/:rotationId
 * Remove a rotation
 */
router.delete('/rotations/:rotationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.onCallRotation.findUnique({ where: { id: req.params.rotationId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Rotation not found' });
    }

    await prisma.onCallRotation.delete({ where: { id: req.params.rotationId } });

    audit(req, {
      action: 'on_call_schedule.delete',
      entityType: 'on_call_rotation',
      entityId: req.params.rotationId,
    });

    logger.info(`On-call rotation deleted: ${req.params.rotationId}`);
    res.json({ success: true, message: 'Rotation deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as onCallScheduleRoutes };
