import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/service-dependencies/map
 * Returns full graph data: nodes (servers + monitors with current status) and edges
 * NOTE: Must be defined BEFORE /:id to avoid "map" being parsed as an id
 */
router.get('/map', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [servers, monitors, dependencies] = await Promise.all([
      prisma.server.findMany({
        select: { id: true, hostname: true, ipAddress: true, status: true },
        orderBy: { hostname: 'asc' },
      }),
      prisma.uptimeMonitor.findMany({
        select: { id: true, name: true, type: true, target: true, enabled: true },
        orderBy: { name: 'asc' },
      }),
      prisma.serviceDependency.findMany({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const nodes = [
      ...servers.map((s) => ({
        id: s.id,
        type: 'SERVER' as const,
        name: s.hostname,
        detail: s.ipAddress,
        status: s.status,
      })),
      ...monitors.map((m) => ({
        id: m.id,
        type: 'MONITOR' as const,
        name: m.name,
        detail: `${m.type}: ${m.target}`,
        status: m.enabled ? 'ACTIVE' : 'DISABLED',
      })),
    ];

    const edges = dependencies.map((d) => ({
      id: d.id,
      sourceId: d.sourceId,
      sourceType: d.sourceType,
      targetId: d.targetId,
      targetType: d.targetType,
      label: d.label,
    }));

    res.json({ success: true, data: { nodes, edges } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/service-dependencies
 * List all dependencies
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dependencies = await prisma.serviceDependency.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: dependencies, count: dependencies.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/service-dependencies
 * Create a dependency
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sourceId, sourceType, targetId, targetType, label } = req.body;

    if (!sourceId || !sourceType || !targetId || !targetType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sourceId, sourceType, targetId, targetType',
      });
    }

    if (!['SERVER', 'MONITOR'].includes(sourceType) || !['SERVER', 'MONITOR'].includes(targetType)) {
      return res.status(400).json({
        success: false,
        error: 'sourceType and targetType must be SERVER or MONITOR',
      });
    }

    if (sourceId === targetId && sourceType === targetType) {
      return res.status(400).json({
        success: false,
        error: 'A node cannot depend on itself',
      });
    }

    const dependency = await prisma.serviceDependency.create({
      data: {
        sourceId,
        sourceType,
        targetId,
        targetType,
        label: label || null,
      },
    });

    audit(req, {
      action: 'service_dependency.create',
      entityType: 'service_dependency',
      entityId: dependency.id,
      details: { sourceId, sourceType, targetId, targetType },
    });

    logger.info('Service dependency created', { id: dependency.id });
    res.status(201).json({ success: true, data: dependency });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/service-dependencies/:id
 * Delete a dependency
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.serviceDependency.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Service dependency not found' });
    }

    await prisma.serviceDependency.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'service_dependency.delete',
      entityType: 'service_dependency',
      entityId: req.params.id,
    });

    logger.info('Service dependency deleted', { id: req.params.id });
    res.json({ success: true, message: 'Service dependency deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as serviceDependencyRoutes };
