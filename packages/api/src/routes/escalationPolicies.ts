import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

// GET /api/escalation-policies - List all policies with steps
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await prisma.escalationPolicy.findMany({
      include: {
        steps: {
          include: { channel: true },
          orderBy: { stepOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: policies,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/escalation-policies/:id - Get single policy with steps
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const policy = await prisma.escalationPolicy.findUnique({
      where: { id },
      include: {
        steps: {
          include: { channel: true },
          orderBy: { stepOrder: 'asc' },
        },
      },
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'Escalation policy not found',
      });
    }

    res.json({
      success: true,
      data: policy,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/escalation-policies - Create policy with nested steps
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, enabled, steps } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'name is required',
      });
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'steps array is required and must not be empty',
      });
    }

    const policy = await prisma.escalationPolicy.create({
      data: {
        name,
        ...(enabled !== undefined && { enabled }),
        steps: {
          create: steps.map((s: { stepOrder: number; delayMinutes: number; channelId: string }) => ({
            stepOrder: s.stepOrder,
            delayMinutes: s.delayMinutes,
            channelId: s.channelId,
          })),
        },
      },
      include: {
        steps: {
          include: { channel: true },
          orderBy: { stepOrder: 'asc' },
        },
      },
    });

    audit(req, { action: 'escalation_policy.create', entityType: 'escalation_policy', entityId: policy.id, details: { name: policy.name } });
    logger.info(`Escalation policy created: ${policy.name}`);

    res.status(201).json({
      success: true,
      data: policy,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/escalation-policies/:id - Update policy (replace steps if provided)
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, enabled, steps } = req.body;

    const existing = await prisma.escalationPolicy.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Escalation policy not found',
      });
    }

    const policy = await prisma.$transaction(async (tx) => {
      // If steps provided, delete existing and recreate
      if (steps && Array.isArray(steps)) {
        await tx.escalationStep.deleteMany({ where: { policyId: id } });
        await tx.escalationStep.createMany({
          data: steps.map((s: { stepOrder: number; delayMinutes: number; channelId: string }) => ({
            policyId: id,
            stepOrder: s.stepOrder,
            delayMinutes: s.delayMinutes,
            channelId: s.channelId,
          })),
        });
      }

      return tx.escalationPolicy.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(enabled !== undefined && { enabled }),
        },
        include: {
          steps: {
            include: { channel: true },
            orderBy: { stepOrder: 'asc' },
          },
        },
      });
    });

    audit(req, { action: 'escalation_policy.update', entityType: 'escalation_policy', entityId: policy.id, details: { name: policy.name } });
    logger.info(`Escalation policy updated: ${policy.id}`);

    res.json({
      success: true,
      data: policy,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/escalation-policies/:id - Delete policy (cascade handles steps)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.escalationPolicy.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Escalation policy not found',
      });
    }

    await prisma.escalationPolicy.delete({ where: { id } });

    audit(req, { action: 'escalation_policy.delete', entityType: 'escalation_policy', entityId: id, details: { name: existing.name } });
    logger.info(`Escalation policy deleted: ${id}`);

    res.json({
      success: true,
      message: 'Escalation policy deleted',
    });
  } catch (error) {
    next(error);
  }
});

export { router as escalationPolicyRoutes };
