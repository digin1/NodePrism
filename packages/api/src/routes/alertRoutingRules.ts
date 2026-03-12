import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

// Validation schemas
const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  conditions: z.object({
    severity: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    timeWindow: z.object({
      start: z.string(),
      end: z.string(),
      timezone: z.string().default('UTC'),
    }).optional(),
  }),
  channelIds: z.array(z.string().uuid()),
  muteOthers: z.boolean().default(false),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  conditions: z.object({
    severity: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    timeWindow: z.object({
      start: z.string(),
      end: z.string(),
      timezone: z.string().default('UTC'),
    }).optional(),
  }).optional(),
  channelIds: z.array(z.string().uuid()).optional(),
  muteOthers: z.boolean().optional(),
});

/**
 * GET /api/alert-routing-rules
 * List all routing rules ordered by priority ASC
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await prisma.alertRoutingRule.findMany({
      orderBy: { priority: 'asc' },
    });

    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/alert-routing-rules/:id
 * Get a single routing rule
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rule = await prisma.alertRoutingRule.findUnique({
      where: { id: req.params.id },
    });

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Routing rule not found' });
    }

    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alert-routing-rules
 * Create a new routing rule
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createRuleSchema.parse(req.body);

    const rule = await prisma.alertRoutingRule.create({
      data: {
        name: data.name,
        enabled: data.enabled,
        priority: data.priority,
        conditions: data.conditions as any,
        channelIds: data.channelIds,
        muteOthers: data.muteOthers,
      },
    });

    audit(req, {
      action: 'alert_routing_rule.create',
      entityType: 'alert_routing_rule',
      entityId: rule.id,
      details: { name: rule.name, priority: rule.priority },
    });

    logger.info('Alert routing rule created', { id: rule.id, name: rule.name });
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * PUT /api/alert-routing-rules/:id
 * Update a routing rule
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertRoutingRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Routing rule not found' });
    }

    const data = updateRuleSchema.parse(req.body);

    const rule = await prisma.alertRoutingRule.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.conditions !== undefined && { conditions: data.conditions as any }),
        ...(data.channelIds !== undefined && { channelIds: data.channelIds }),
        ...(data.muteOthers !== undefined && { muteOthers: data.muteOthers }),
      },
    });

    audit(req, {
      action: 'alert_routing_rule.update',
      entityType: 'alert_routing_rule',
      entityId: rule.id,
      details: { name: rule.name },
    });

    logger.info('Alert routing rule updated', { id: rule.id, name: rule.name });
    res.json({ success: true, data: rule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/alert-routing-rules/:id
 * Delete a routing rule
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertRoutingRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Routing rule not found' });
    }

    await prisma.alertRoutingRule.delete({
      where: { id: req.params.id },
    });

    audit(req, {
      action: 'alert_routing_rule.delete',
      entityType: 'alert_routing_rule',
      entityId: req.params.id,
      details: { name: existing.name },
    });

    logger.info('Alert routing rule deleted', { id: req.params.id });
    res.json({ success: true, message: 'Routing rule deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as alertRoutingRuleRoutes };
