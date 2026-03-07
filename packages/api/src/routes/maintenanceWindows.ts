import { Router, Request, Response, NextFunction } from 'express';
import type { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/maintenance-windows
 * List maintenance windows (optionally filter by server or active status)
 */
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, active } = req.query;
    const where: any = {};

    if (serverId) {
      where.serverId = serverId as string;
    }

    if (active === 'true') {
      const now = new Date();
      where.startTime = { lte: now };
      where.endTime = { gte: now };
    }

    const windows = await prisma.maintenanceWindow.findMany({
      where,
      include: { server: { select: { id: true, hostname: true, ipAddress: true } } },
      orderBy: { startTime: 'desc' },
    });

    res.json({ success: true, data: windows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/maintenance-windows/:id
 * Get a single maintenance window
 */
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const window = await prisma.maintenanceWindow.findUnique({
      where: { id: req.params.id },
      include: { server: { select: { id: true, hostname: true, ipAddress: true } } },
    });

    if (!window) {
      return res.status(404).json({ success: false, error: 'Maintenance window not found' });
    }

    res.json({ success: true, data: window });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/maintenance-windows
 * Create a new maintenance window
 */
router.post('/', requireAuth, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      serverId: z.string().uuid(),
      reason: z.string().min(1).max(500),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
    }).refine(data => new Date(data.endTime) > new Date(data.startTime), {
      message: 'End time must be after start time',
    });

    const data = schema.parse(req.body);

    // Verify server exists
    const server = await prisma.server.findUnique({ where: { id: data.serverId } });
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const window = await prisma.maintenanceWindow.create({
      data: {
        serverId: data.serverId,
        reason: data.reason,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        createdBy: req.user?.userId,
      },
      include: { server: { select: { id: true, hostname: true, ipAddress: true } } },
    });

    audit(req, {
      action: 'maintenance_window.create',
      entityType: 'maintenance_window',
      entityId: window.id,
      details: { serverId: data.serverId, reason: data.reason },
    });

    logger.info('Maintenance window created', { id: window.id, serverId: data.serverId });
    res.status(201).json({ success: true, data: window });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/maintenance-windows/:id
 * Update a maintenance window
 */
router.put('/:id', requireAuth, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.maintenanceWindow.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Maintenance window not found' });
    }

    const schema = z.object({
      reason: z.string().min(1).max(500).optional(),
      startTime: z.string().datetime().optional(),
      endTime: z.string().datetime().optional(),
    });

    const data = schema.parse(req.body);

    const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
    const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;

    if (endTime <= startTime) {
      return res.status(400).json({ success: false, error: 'End time must be after start time' });
    }

    const window = await prisma.maintenanceWindow.update({
      where: { id: req.params.id },
      data: {
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.startTime && { startTime }),
        ...(data.endTime && { endTime }),
      },
      include: { server: { select: { id: true, hostname: true, ipAddress: true } } },
    });

    audit(req, {
      action: 'maintenance_window.update',
      entityType: 'maintenance_window',
      entityId: window.id,
    });

    res.json({ success: true, data: window });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/maintenance-windows/:id
 * Delete a maintenance window
 */
router.delete('/:id', requireAuth, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.maintenanceWindow.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Maintenance window not found' });
    }

    await prisma.maintenanceWindow.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'maintenance_window.delete',
      entityType: 'maintenance_window',
      entityId: req.params.id,
    });

    logger.info('Maintenance window deleted', { id: req.params.id });
    res.json({ success: true, message: 'Maintenance window deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/maintenance-windows/server/:serverId/active
 * Check if a server is currently in maintenance
 */
router.get('/server/:serverId/active', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const activeWindow = await prisma.maintenanceWindow.findFirst({
      where: {
        serverId: req.params.serverId,
        startTime: { lte: now },
        endTime: { gte: now },
      },
      orderBy: { endTime: 'desc' },
    });

    res.json({
      success: true,
      data: {
        inMaintenance: !!activeWindow,
        window: activeWindow,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as maintenanceWindowRoutes };
