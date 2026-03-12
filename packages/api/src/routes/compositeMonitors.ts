import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/composite-monitors
 * List all composite monitors
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const compositeMonitors = await prisma.compositeMonitor.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: compositeMonitors });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/composite-monitors/:id
 * Get a single composite monitor
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await prisma.compositeMonitor.findUnique({
      where: { id: req.params.id },
    });

    if (!monitor) {
      return res.status(404).json({ success: false, error: 'Composite monitor not found' });
    }

    res.json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/composite-monitors/:id/evaluate
 * Evaluate the composite expression against current uptime monitor statuses
 */
router.get('/:id/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await prisma.compositeMonitor.findUnique({
      where: { id: req.params.id },
    });

    if (!monitor) {
      return res.status(404).json({ success: false, error: 'Composite monitor not found' });
    }

    // Get the latest check status for each referenced uptime monitor
    const monitorStatuses: Record<string, boolean> = {};
    const monitorDetails: { id: string; name: string; status: string }[] = [];

    for (const monitorId of monitor.monitorIds) {
      const uptimeMonitor = await prisma.uptimeMonitor.findUnique({
        where: { id: monitorId },
        select: { id: true, name: true },
      });

      if (!uptimeMonitor) {
        monitorStatuses[monitorId] = false;
        monitorDetails.push({ id: monitorId, name: 'Unknown', status: 'NOT_FOUND' });
        continue;
      }

      const latestCheck = await prisma.uptimeCheck.findFirst({
        where: { monitorId },
        orderBy: { checkedAt: 'desc' },
        select: { status: true },
      });

      const isUp = latestCheck ? (latestCheck.status === 'UP' || latestCheck.status === 'DEGRADED') : false;
      monitorStatuses[monitorId] = isUp;
      monitorDetails.push({
        id: monitorId,
        name: uptimeMonitor.name,
        status: latestCheck?.status || 'NO_DATA',
      });
    }

    // Evaluate the expression
    const result = evaluateExpression(monitor.expression, monitorStatuses);

    res.json({
      success: true,
      data: {
        compositeMonitorId: monitor.id,
        name: monitor.name,
        expression: monitor.expression,
        result,
        monitors: monitorDetails,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Evaluate a boolean expression like "monitor_A AND monitor_B", "monitor_A OR (NOT monitor_C)"
 * Monitor IDs in the expression are replaced with their boolean status values.
 */
function evaluateExpression(expression: string, statuses: Record<string, boolean>): boolean {
  try {
    // Replace monitor IDs with their boolean values
    let expr = expression;

    // Sort IDs by length descending to avoid partial replacements
    const sortedIds = Object.keys(statuses).sort((a, b) => b.length - a.length);
    for (const id of sortedIds) {
      expr = expr.replace(new RegExp(escapeRegExp(id), 'g'), statuses[id] ? 'true' : 'false');
    }

    // Replace boolean operators with JS equivalents
    expr = expr.replace(/\bAND\b/gi, '&&');
    expr = expr.replace(/\bOR\b/gi, '||');
    expr = expr.replace(/\bNOT\b/gi, '!');

    // Validate: only allow true, false, &&, ||, !, (, ), whitespace
    const sanitized = expr.replace(/\b(true|false)\b/g, '').replace(/[&|!() \t]/g, '');
    if (sanitized.length > 0) {
      logger.warn('Invalid characters in composite expression', { expression, sanitized });
      return false;
    }

    // Evaluate safely using Function constructor with no access to global scope
    const fn = new Function(`"use strict"; return (${expr});`);
    return Boolean(fn());
  } catch (err) {
    logger.error('Failed to evaluate composite expression', { expression, error: (err as Error).message });
    return false;
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * POST /api/composite-monitors
 * Create a new composite monitor
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, expression, monitorIds, enabled } = req.body;

    if (!name || !expression || !monitorIds || !Array.isArray(monitorIds) || monitorIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, expression, monitorIds (non-empty array)' });
    }

    const monitor = await prisma.compositeMonitor.create({
      data: {
        name,
        ...(description !== undefined && { description }),
        expression,
        monitorIds,
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'composite_monitor.create',
      entityType: 'composite_monitor',
      entityId: monitor.id,
      details: { name, expression },
    });

    logger.info('Composite monitor created', { id: monitor.id, name });
    res.status(201).json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/composite-monitors/:id
 * Update a composite monitor
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.compositeMonitor.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Composite monitor not found' });
    }

    const { name, description, expression, monitorIds, enabled } = req.body;

    const monitor = await prisma.compositeMonitor.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(expression !== undefined && { expression }),
        ...(monitorIds !== undefined && { monitorIds }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'composite_monitor.update',
      entityType: 'composite_monitor',
      entityId: monitor.id,
    });

    res.json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/composite-monitors/:id
 * Delete a composite monitor
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.compositeMonitor.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Composite monitor not found' });
    }

    await prisma.compositeMonitor.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'composite_monitor.delete',
      entityType: 'composite_monitor',
      entityId: req.params.id,
    });

    logger.info('Composite monitor deleted', { id: req.params.id });
    res.json({ success: true, message: 'Composite monitor deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as compositeMonitorRoutes };
