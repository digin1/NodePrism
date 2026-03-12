import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/kubernetes
 * List all Kubernetes clusters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clusters = await prisma.kubernetesCluster.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Strip sensitive auth config from list response
    const sanitized = clusters.map(({ authConfig, ...rest }) => ({
      ...rest,
      hasAuth: authConfig != null,
    }));

    res.json({ success: true, data: sanitized, count: sanitized.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/kubernetes
 * Create a new Kubernetes cluster (ADMIN only)
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, apiEndpoint, authConfig, enabled } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!apiEndpoint || typeof apiEndpoint !== 'string' || apiEndpoint.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'apiEndpoint is required' });
    }
    if (!authConfig || typeof authConfig !== 'object') {
      return res.status(400).json({ success: false, error: 'authConfig is required and must be an object' });
    }

    const cluster = await prisma.kubernetesCluster.create({
      data: {
        name: name.trim(),
        apiEndpoint: apiEndpoint.trim(),
        authConfig,
        enabled: enabled ?? true,
      },
    });

    audit(req, {
      action: 'kubernetes_cluster.create',
      entityType: 'kubernetes_cluster',
      entityId: cluster.id,
      details: { name: cluster.name, apiEndpoint: cluster.apiEndpoint },
    });

    logger.info(`Kubernetes cluster created: ${cluster.name}`);

    res.status(201).json({ success: true, data: cluster });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/kubernetes/:id
 * Get a single Kubernetes cluster
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cluster = await prisma.kubernetesCluster.findUnique({
      where: { id: req.params.id },
    });

    if (!cluster) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }

    res.json({ success: true, data: cluster });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/kubernetes/:id
 * Update a Kubernetes cluster
 */
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.kubernetesCluster.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }

    const { name, apiEndpoint, authConfig, enabled } = req.body;

    const cluster = await prisma.kubernetesCluster.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(apiEndpoint !== undefined && { apiEndpoint }),
        ...(authConfig !== undefined && { authConfig }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'kubernetes_cluster.update',
      entityType: 'kubernetes_cluster',
      entityId: cluster.id,
    });

    logger.info(`Kubernetes cluster updated: ${cluster.name}`);

    res.json({ success: true, data: cluster });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/kubernetes/:id
 * Delete a Kubernetes cluster
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.kubernetesCluster.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }

    await prisma.kubernetesCluster.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'kubernetes_cluster.delete',
      entityType: 'kubernetes_cluster',
      entityId: req.params.id,
    });

    logger.info(`Kubernetes cluster deleted: ${existing.name}`);

    res.json({ success: true, message: 'Kubernetes cluster deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/kubernetes/:id/status
 * Get cluster status (stub - returns mock data)
 * Note: Actual K8s API integration requires @kubernetes/client-node which is not installed.
 */
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cluster = await prisma.kubernetesCluster.findUnique({
      where: { id: req.params.id },
    });

    if (!cluster) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }

    // Stub: return mock data structure showing what K8s monitoring would provide
    const mockStatus = {
      nodes: [
        { name: 'node-1', status: 'Ready', cpu: '45%', memory: '60%' },
        { name: 'node-2', status: 'Ready', cpu: '32%', memory: '55%' },
        { name: 'node-3', status: 'Ready', cpu: '67%', memory: '72%' },
      ],
      pods: [
        { name: 'web-abc123', namespace: 'default', status: 'Running', restarts: 0 },
        { name: 'api-def456', namespace: 'default', status: 'Running', restarts: 1 },
        { name: 'worker-ghi789', namespace: 'default', status: 'Running', restarts: 0 },
        { name: 'redis-jkl012', namespace: 'data', status: 'Running', restarts: 0 },
      ],
      deployments: [
        { name: 'web', namespace: 'default', replicas: '3/3', status: 'Available' },
        { name: 'api', namespace: 'default', replicas: '2/2', status: 'Available' },
        { name: 'worker', namespace: 'default', replicas: '1/1', status: 'Available' },
      ],
    };

    res.json({
      success: true,
      data: mockStatus,
      message: 'Stub response - actual K8s API integration requires @kubernetes/client-node',
    });
  } catch (error) {
    next(error);
  }
});

export { router as kubernetesRoutes };
