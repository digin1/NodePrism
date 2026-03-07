import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

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

// GET /api/servers/tags - Get all unique tags
router.get('/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const servers = await prisma.server.findMany({
      select: { tags: true },
    });
    const tagSet = new Set<string>();
    for (const s of servers) {
      for (const t of s.tags) tagSet.add(t);
    }
    const tags = Array.from(tagSet).sort();
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
});

// PUT /api/servers/tags/bulk - Bulk add/remove tags
router.put('/tags/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      serverIds: z.array(z.string().uuid()).min(1),
      addTags: z.array(z.string().min(1)).default([]),
      removeTags: z.array(z.string().min(1)).default([]),
    });
    const data = schema.parse(req.body);

    const servers = await prisma.server.findMany({
      where: { id: { in: data.serverIds } },
      select: { id: true, tags: true },
    });

    const updates = servers.map(server => {
      let tags = [...server.tags];
      // Add new tags (deduplicate)
      for (const tag of data.addTags) {
        if (!tags.includes(tag)) tags.push(tag);
      }
      // Remove tags
      tags = tags.filter(t => !data.removeTags.includes(t));

      return prisma.server.update({
        where: { id: server.id },
        data: { tags },
      });
    });

    await Promise.all(updates);

    logger.info(`Bulk tag update: ${data.serverIds.length} servers, +${data.addTags.length} -${data.removeTags.length} tags`);
    audit(req, { action: 'server.update', entityType: 'server', entityId: data.serverIds.join(','), details: { addTags: data.addTags, removeTags: data.removeTags, serverCount: data.serverIds.length } });

    res.json({ success: true, message: `Updated tags on ${servers.length} servers` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// GET /api/servers - List all servers
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, environment, search, tag } = req.query;

    const servers = await prisma.server.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(environment && { environment: environment as any }),
        ...(tag && { tags: { has: tag as string } }),
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
    audit(req, { action: 'server.create', entityType: 'server', entityId: server.id, details: { hostname: server.hostname, ipAddress: server.ipAddress } });

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
    audit(req, { action: 'server.update', entityType: 'server', entityId: server.id, details: data as Record<string, unknown> });

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
    audit(req, { action: 'server.delete', entityType: 'server', entityId: id });

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
