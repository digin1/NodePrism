import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { executeMultiStepCheck } from '../services/multiStepService';

const router: ExpressRouter = Router();

// GET /api/multi-step-monitors - List all monitors with step count
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitors = await prisma.multiStepMonitor.findMany({
      include: {
        _count: { select: { steps: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with latest result
    const enriched = await Promise.all(
      monitors.map(async (monitor) => {
        const lastResult = await prisma.multiStepMonitorResult.findFirst({
          where: { monitorId: monitor.id },
          orderBy: { checkedAt: 'desc' },
        });

        return {
          ...monitor,
          stepCount: monitor._count.steps,
          lastResult,
        };
      })
    );

    res.json({
      success: true,
      data: enriched,
      count: enriched.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/multi-step-monitors/:id - Get monitor with steps and recent results
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const monitor = await prisma.multiStepMonitor.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        results: {
          orderBy: { checkedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!monitor) {
      return res.status(404).json({
        success: false,
        error: 'Monitor not found',
      });
    }

    res.json({
      success: true,
      data: monitor,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/multi-step-monitors - Create monitor with nested steps
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, interval, timeout, enabled, steps } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one step is required' });
    }

    // Validate each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.name || typeof step.name !== 'string') {
        return res.status(400).json({ success: false, error: `Step ${i + 1}: name is required` });
      }
      if (!step.url || typeof step.url !== 'string') {
        return res.status(400).json({ success: false, error: `Step ${i + 1}: url is required` });
      }
    }

    const monitor = await prisma.multiStepMonitor.create({
      data: {
        name: name.trim(),
        interval: interval ?? 300,
        timeout: timeout ?? 30,
        enabled: enabled ?? true,
        steps: {
          create: steps.map((step: any, idx: number) => ({
            stepOrder: step.stepOrder ?? idx + 1,
            name: step.name,
            method: step.method ?? 'GET',
            url: step.url,
            headers: step.headers ?? null,
            body: step.body ?? null,
            expectedStatus: step.expectedStatus ?? null,
            extractVars: step.extractVars ?? null,
            assertions: step.assertions ?? null,
          })),
        },
      },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    logger.info(`Multi-step monitor created: ${monitor.name}`);

    res.status(201).json({
      success: true,
      data: monitor,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/multi-step-monitors/:id - Update monitor (replaces steps)
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.multiStepMonitor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    const { name, interval, timeout, enabled, steps } = req.body;

    // Update monitor fields
    const monitor = await prisma.multiStepMonitor.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(interval !== undefined && { interval }),
        ...(timeout !== undefined && { timeout }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    // If steps are provided, replace all steps
    if (steps && Array.isArray(steps)) {
      await prisma.multiStepMonitorStep.deleteMany({ where: { monitorId: id } });

      await prisma.multiStepMonitorStep.createMany({
        data: steps.map((step: any, idx: number) => ({
          monitorId: id,
          stepOrder: step.stepOrder ?? idx + 1,
          name: step.name,
          method: step.method ?? 'GET',
          url: step.url,
          headers: step.headers ?? null,
          body: step.body ?? null,
          expectedStatus: step.expectedStatus ?? null,
          extractVars: step.extractVars ?? null,
          assertions: step.assertions ?? null,
        })),
      });
    }

    const updated = await prisma.multiStepMonitor.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    logger.info(`Multi-step monitor updated: ${monitor.name}`);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/multi-step-monitors/:id - Delete monitor
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.multiStepMonitor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    await prisma.multiStepMonitor.delete({ where: { id } });

    logger.info(`Multi-step monitor deleted: ${existing.name}`);

    res.json({
      success: true,
      message: 'Monitor deleted',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/multi-step-monitors/:id/run - Manually trigger a run
router.post('/:id/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const monitor = await prisma.multiStepMonitor.findUnique({ where: { id } });
    if (!monitor) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    const result = await executeMultiStepCheck(id);

    res.json({
      success: true,
      data: {
        monitorId: id,
        monitorName: monitor.name,
        ...result,
        testedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/multi-step-monitors/:id/results - Get check results with pagination
router.get('/:id/results', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const existing = await prisma.multiStepMonitor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    const results = await prisma.multiStepMonitorResult.findMany({
      where: { monitorId: id },
      orderBy: { checkedAt: 'desc' },
      take: Math.min(limit ? parseInt(limit as string, 10) : 50, 500),
    });

    res.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error) {
    next(error);
  }
});

export { router as multiStepMonitorRoutes };
