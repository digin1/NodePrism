import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { agentLimiter } from '../middleware/rateLimit';

const router: ExpressRouter = Router();

// Validation schemas
const containerSchema = z.object({
  containerId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['openvz', 'kvm', 'virtuozzo', 'docker', 'lxc']),
  status: z.string().default('unknown'),
  ipAddress: z.string().nullable().optional(),
  hostname: z.string().nullable().optional(),
  networkRxBytes: z.number().int().min(0).default(0),
  networkTxBytes: z.number().int().min(0).default(0),
  metadata: z.record(z.string(), z.any()).optional(),
});

const reportContainersSchema = z.object({
  serverId: z.string().uuid(),
  containers: z.array(containerSchema),
});

// POST /api/agents/containers - Agent reports container data (public, rate-limited)
router.post('/', agentLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = reportContainersSchema.parse(req.body);

    // Verify server exists
    const server = await prisma.server.findUnique({
      where: { id: data.serverId },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const now = new Date();
    const reportedIds: string[] = [];

    // Upsert each container
    for (const c of data.containers) {
      await prisma.virtualContainer.upsert({
        where: {
          serverId_containerId: {
            serverId: data.serverId,
            containerId: c.containerId,
          },
        },
        update: {
          name: c.name,
          type: c.type,
          status: c.status,
          ipAddress: c.ipAddress ?? null,
          hostname: c.hostname ?? null,
          networkRxBytes: BigInt(c.networkRxBytes),
          networkTxBytes: BigInt(c.networkTxBytes),
          metadata: c.metadata ?? undefined,
          lastSeen: now,
        },
        create: {
          serverId: data.serverId,
          containerId: c.containerId,
          name: c.name,
          type: c.type,
          status: c.status,
          ipAddress: c.ipAddress ?? null,
          hostname: c.hostname ?? null,
          networkRxBytes: BigInt(c.networkRxBytes),
          networkTxBytes: BigInt(c.networkTxBytes),
          metadata: c.metadata ?? undefined,
          lastSeen: now,
        },
      });
      reportedIds.push(c.containerId);
    }

    // Mark containers not in this report as stopped (they disappeared)
    if (reportedIds.length > 0) {
      await prisma.virtualContainer.updateMany({
        where: {
          serverId: data.serverId,
          containerId: { notIn: reportedIds },
          status: { not: 'stopped' },
        },
        data: { status: 'stopped' },
      });
    }

    logger.info(`Container report: ${data.containers.length} containers on ${server.hostname}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('containers:updated', { serverId: data.serverId, count: data.containers.length });
    }

    res.json({
      success: true,
      data: { updated: data.containers.length },
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

// GET /api/containers/server/:serverId - Get containers for a server
router.get('/server/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    const containers = await prisma.virtualContainer.findMany({
      where: { serverId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    // Serialize BigInt to string for JSON response
    const serialized = containers.map(c => ({
      ...c,
      networkRxBytes: c.networkRxBytes.toString(),
      networkTxBytes: c.networkTxBytes.toString(),
    }));

    res.json({
      success: true,
      data: serialized,
      count: serialized.length,
    });
  } catch (error) {
    next(error);
  }
});

export { router as containerRoutes };
