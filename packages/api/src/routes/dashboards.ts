import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

// Validation schemas
const panelSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['line', 'area', 'bar', 'gauge', 'stat', 'table']),
  query: z.string(),
  span: z.number().min(1).max(12).default(6), // grid columns (out of 12)
  height: z.number().min(100).max(800).default(300),
  options: z.record(z.unknown()).optional(),
});

const dashboardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  config: z.object({
    panels: z.array(panelSchema),
    refreshInterval: z.number().optional(), // seconds
    timeRange: z.string().optional(), // e.g. "1h", "24h", "7d"
  }),
  isDefault: z.boolean().optional(),
});

// GET /api/dashboards - List all dashboards
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboards = await prisma.dashboard.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: dashboards, count: dashboards.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboards/:id - Get single dashboard
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: req.params.id },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }

    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
});

// POST /api/dashboards - Create dashboard
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = dashboardSchema.parse(req.body);

    const dashboard = await prisma.dashboard.create({
      data: {
        name: data.name,
        description: data.description,
        config: data.config as any,
        isDefault: data.isDefault || false,
      },
    });

    logger.info(`Dashboard created: ${dashboard.name}`);
    audit(req, { action: 'settings.update', entityType: 'dashboard', entityId: dashboard.id, details: { name: dashboard.name } });

    res.status(201).json({ success: true, data: dashboard });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// PUT /api/dashboards/:id - Update dashboard
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = dashboardSchema.partial().parse(req.body);

    const dashboard = await prisma.dashboard.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.config !== undefined && { config: data.config as any }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });

    logger.info(`Dashboard updated: ${dashboard.name}`);
    audit(req, { action: 'settings.update', entityType: 'dashboard', entityId: dashboard.id, details: { name: dashboard.name } });

    res.json({ success: true, data: dashboard });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// DELETE /api/dashboards/:id - Delete dashboard
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await prisma.dashboard.delete({
      where: { id: req.params.id },
    });

    logger.info(`Dashboard deleted: ${dashboard.name}`);
    audit(req, { action: 'settings.update', entityType: 'dashboard', entityId: dashboard.id, details: { name: dashboard.name } });

    res.json({ success: true, message: 'Dashboard deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as dashboardRoutes };
