import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

// Validation schemas
const createServerSchema = z.object({
  hostname: z.string().min(1),
  ipAddress: z.string().ip(),
  environment: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']).default('PRODUCTION'),
  groupId: z.string().uuid().nullable().optional(),
  region: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateServerSchema = createServerSchema.partial();

// GET /api/servers - List all servers
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, environment, search } = req.query;

    const servers = await prisma.server.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(environment && { environment: environment as any }),
        ...(search && {
          OR: [
            { hostname: { contains: search as string, mode: 'insensitive' } },
            { ipAddress: { contains: search as string } },
          ],
        }),
      },
      include: {
        agents: true,
        group: { select: { id: true, name: true } },
        _count: {
          select: { alerts: { where: { status: 'FIRING' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: servers,
      count: servers.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/servers/:id - Get single server
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const server = await prisma.server.findUnique({
      where: { id },
      include: {
        agents: true,
        alerts: {
          where: { status: 'FIRING' },
          orderBy: { startsAt: 'desc' },
        },
      },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    res.json({
      success: true,
      data: server,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/servers - Create new server
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createServerSchema.parse(req.body);

    // Check for duplicate IP
    const existing = await prisma.server.findFirst({
      where: { ipAddress: data.ipAddress },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A server with this IP address already exists',
      });
    }

    const server = await prisma.server.create({
      data: {
        hostname: data.hostname,
        ipAddress: data.ipAddress,
        environment: data.environment,
        groupId: data.groupId ?? null,
        region: data.region,
        tags: data.tags,
        metadata: data.metadata,
        status: 'OFFLINE',
      },
    });

    logger.info(`Server created: ${server.hostname} (${server.ipAddress})`);

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('server:created', server);
    }

    res.status(201).json({
      success: true,
      data: server,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// PUT /api/servers/:id - Update server
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = updateServerSchema.parse(req.body);

    const server = await prisma.server.update({
      where: { id },
      data,
    });

    logger.info(`Server updated: ${server.hostname}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('server:updated', server);
    }

    res.json({
      success: true,
      data: server,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// DELETE /api/servers/:id - Delete server
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await prisma.server.delete({
      where: { id },
    });

    logger.info(`Server deleted: ${id}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('server:deleted', { id });
    }

    res.json({
      success: true,
      message: 'Server deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/servers/stats/overview - Get server statistics
router.get('/stats/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [total, online, offline, warning, critical] = await Promise.all([
      prisma.server.count(),
      prisma.server.count({ where: { status: 'ONLINE' } }),
      prisma.server.count({ where: { status: 'OFFLINE' } }),
      prisma.server.count({ where: { status: 'WARNING' } }),
      prisma.server.count({ where: { status: 'CRITICAL' } }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        online,
        offline,
        warning,
        critical,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as serverRoutes };
