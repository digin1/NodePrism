import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { rabbitmq } from '../services/rabbitmq';

const router: ExpressRouter = Router();

// Validation schemas
const createServerSchema = z.object({
  hostname: z.string().min(1),
  ipAddress: z.string().ip(),
  sshPort: z.number().int().min(1).max(65535).default(22),
  sshUsername: z.string().min(1).optional(),
  environment: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']).default('PRODUCTION'),
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
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
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
        sshPort: data.sshPort,
        sshUsername: data.sshUsername,
        environment: data.environment,
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

// POST /api/servers/:id/deploy - Deploy agents to server
router.post('/:id/deploy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { agentTypes } = req.body;

    const server = await prisma.server.findUnique({
      where: { id },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Create deployment records
    const deployments = await Promise.all(
      (agentTypes || ['NODE_EXPORTER']).map((agentType: string) =>
        prisma.deployment.create({
          data: {
            serverId: id,
            agentType: agentType as any,
            status: 'PENDING',
          },
        })
      )
    );

    // Update server status
    await prisma.server.update({
      where: { id },
      data: { status: 'DEPLOYING' },
    });

    // Queue deployment jobs to RabbitMQ
    for (const deployment of deployments) {
      try {
        await rabbitmq.publishDeploymentJob({
          id: randomUUID(),
          serverId: server.id,
          hostname: server.hostname,
          ipAddress: server.ipAddress,
          sshPort: server.sshPort,
          sshUsername: server.sshUsername || 'root',
          agentType: deployment.agentType,
          deploymentId: deployment.id,
        });
      } catch (error) {
        logger.error(`Failed to queue deployment job for ${deployment.agentType}`, { error });
        // Mark deployment as failed if we can't queue it
        await prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: 'FAILED', error: 'Failed to queue deployment job' },
        });
      }
    }

    logger.info(`Deployment initiated for server ${server.hostname}`, { deployments });

    const io = req.app.get('io');
    if (io) {
      io.emit('deployment:started', { serverId: id, deployments });
    }

    res.json({
      success: true,
      data: deployments,
      message: 'Deployment initiated',
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
