import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/synthetic-checks
 * List all synthetic checks
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const checks = await prisma.syntheticCheck.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        results: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    });

    // Flatten the latest result onto each check
    const enriched = checks.map(({ results, ...check }) => ({
      ...check,
      lastResult: results[0] || null,
    }));

    res.json({ success: true, data: enriched, count: enriched.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/synthetic-checks
 * Create a new synthetic check (ADMIN only)
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, script, interval, timeout, enabled } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'script is required' });
    }

    const check = await prisma.syntheticCheck.create({
      data: {
        name: name.trim(),
        script: script,
        interval: interval ?? 300,
        timeout: timeout ?? 60,
        enabled: enabled ?? true,
      },
    });

    audit(req, {
      action: 'synthetic_check.create',
      entityType: 'synthetic_check',
      entityId: check.id,
      details: { name: check.name },
    });

    logger.info(`Synthetic check created: ${check.name}`);

    res.status(201).json({ success: true, data: check });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/synthetic-checks/:id
 * Get a single synthetic check with recent results
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const check = await prisma.syntheticCheck.findUnique({
      where: { id: req.params.id },
      include: {
        results: {
          orderBy: { checkedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!check) {
      return res.status(404).json({ success: false, error: 'Synthetic check not found' });
    }

    res.json({ success: true, data: check });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/synthetic-checks/:id
 * Update a synthetic check
 */
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.syntheticCheck.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Synthetic check not found' });
    }

    const { name, script, interval, timeout, enabled } = req.body;

    const check = await prisma.syntheticCheck.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(script !== undefined && { script }),
        ...(interval !== undefined && { interval }),
        ...(timeout !== undefined && { timeout }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'synthetic_check.update',
      entityType: 'synthetic_check',
      entityId: check.id,
    });

    logger.info(`Synthetic check updated: ${check.name}`);

    res.json({ success: true, data: check });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/synthetic-checks/:id
 * Delete a synthetic check and its results
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.syntheticCheck.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Synthetic check not found' });
    }

    await prisma.syntheticCheck.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'synthetic_check.delete',
      entityType: 'synthetic_check',
      entityId: req.params.id,
    });

    logger.info(`Synthetic check deleted: ${existing.name}`);

    res.json({ success: true, message: 'Synthetic check deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/synthetic-checks/:id/run
 * Run a synthetic check manually (stub - records an attempt noting Playwright is not installed)
 */
router.post('/:id/run', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const check = await prisma.syntheticCheck.findUnique({
      where: { id: req.params.id },
    });

    if (!check) {
      return res.status(404).json({ success: false, error: 'Synthetic check not found' });
    }

    // Stub: create a result entry noting that Playwright is not installed
    const result = await prisma.syntheticCheckResult.create({
      data: {
        checkId: check.id,
        status: 'FAIL',
        duration: 0,
        errorMessage: 'Playwright is not installed. Install @playwright/test to enable browser-based synthetic checks.',
        stepResults: { steps: [], note: 'Stub execution - Playwright runtime not available' },
      },
    });

    logger.info(`Synthetic check run attempted (stub): ${check.name}`);

    res.json({
      success: true,
      data: result,
      message: 'Stub execution - actual browser checks require Playwright installation',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/synthetic-checks/:id/results
 * Get results with pagination
 */
router.get('/:id/results', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const existing = await prisma.syntheticCheck.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Synthetic check not found' });
    }

    const take = Math.min(parseInt(limit as string, 10) || 50, 500);
    const skip = parseInt(offset as string, 10) || 0;

    const [results, total] = await Promise.all([
      prisma.syntheticCheckResult.findMany({
        where: { checkId: id },
        orderBy: { checkedAt: 'desc' },
        take,
        skip,
      }),
      prisma.syntheticCheckResult.count({ where: { checkId: id } }),
    ]);

    res.json({
      success: true,
      data: results,
      count: results.length,
      total,
    });
  } catch (error) {
    next(error);
  }
});

export { router as syntheticCheckRoutes };
