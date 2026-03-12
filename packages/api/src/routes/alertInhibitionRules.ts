import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

// Validation schemas
const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  sourceMatch: z.record(z.string()),
  targetMatch: z.record(z.string()),
  sourceSeverity: z.string().min(1),
  targetSeverity: z.string().min(1),
  enabled: z.boolean().default(true),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sourceMatch: z.record(z.string()).optional(),
  targetMatch: z.record(z.string()).optional(),
  sourceSeverity: z.string().min(1).optional(),
  targetSeverity: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/alert-inhibition-rules
 * List all inhibition rules
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await prisma.alertInhibitionRule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/alert-inhibition-rules/:id
 * Get a single inhibition rule
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rule = await prisma.alertInhibitionRule.findUnique({
      where: { id: req.params.id },
    });

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Inhibition rule not found' });
    }

    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alert-inhibition-rules
 * Create a new inhibition rule
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createRuleSchema.parse(req.body);

    const rule = await prisma.alertInhibitionRule.create({
      data: {
        name: data.name,
        sourceMatch: data.sourceMatch as any,
        targetMatch: data.targetMatch as any,
        sourceSeverity: data.sourceSeverity,
        targetSeverity: data.targetSeverity,
        enabled: data.enabled,
      },
    });

    audit(req, {
      action: 'alert_inhibition_rule.create',
      entityType: 'alert_inhibition_rule',
      entityId: rule.id,
      details: { name: rule.name },
    });

    logger.info('Alert inhibition rule created', { id: rule.id, name: rule.name });
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * PUT /api/alert-inhibition-rules/:id
 * Update an inhibition rule
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertInhibitionRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Inhibition rule not found' });
    }

    const data = updateRuleSchema.parse(req.body);

    const rule = await prisma.alertInhibitionRule.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sourceMatch !== undefined && { sourceMatch: data.sourceMatch as any }),
        ...(data.targetMatch !== undefined && { targetMatch: data.targetMatch as any }),
        ...(data.sourceSeverity !== undefined && { sourceSeverity: data.sourceSeverity }),
        ...(data.targetSeverity !== undefined && { targetSeverity: data.targetSeverity }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
      },
    });

    audit(req, {
      action: 'alert_inhibition_rule.update',
      entityType: 'alert_inhibition_rule',
      entityId: rule.id,
      details: { name: rule.name },
    });

    logger.info('Alert inhibition rule updated', { id: rule.id, name: rule.name });
    res.json({ success: true, data: rule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/alert-inhibition-rules/:id
 * Delete an inhibition rule
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertInhibitionRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Inhibition rule not found' });
    }

    await prisma.alertInhibitionRule.delete({
      where: { id: req.params.id },
    });

    audit(req, {
      action: 'alert_inhibition_rule.delete',
      entityType: 'alert_inhibition_rule',
      entityId: req.params.id,
      details: { name: existing.name },
    });

    logger.info('Alert inhibition rule deleted', { id: req.params.id });
    res.json({ success: true, message: 'Inhibition rule deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as alertInhibitionRuleRoutes };
