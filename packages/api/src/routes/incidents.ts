import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

// GET /api/incidents - List incidents with optional filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, severity, limit, offset } = req.query;

    const incidents = await prisma.incident.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(severity && { severity: severity as any }),
      },
      include: {
        _count: { select: { updates: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit as string) || 50,
      skip: parseInt(offset as string) || 0,
    });

    res.json({
      success: true,
      data: incidents,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/incidents/stats - Incident statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [open, resolved, total] = await Promise.all([
      prisma.incident.count({
        where: { status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] } },
      }),
      prisma.incident.count({
        where: { status: 'RESOLVED' },
      }),
      prisma.incident.count(),
    ]);

    // Calculate average resolution time from incidents that have been resolved
    const resolvedIncidents = await prisma.incident.findMany({
      where: {
        status: 'RESOLVED',
        resolvedAt: { not: null },
      },
      select: {
        startedAt: true,
        resolvedAt: true,
      },
    });

    let avgResolutionMs: number | null = null;
    if (resolvedIncidents.length > 0) {
      const totalMs = resolvedIncidents.reduce((sum, inc) => {
        return sum + (inc.resolvedAt!.getTime() - inc.startedAt.getTime());
      }, 0);
      avgResolutionMs = totalMs / resolvedIncidents.length;
    }

    res.json({
      success: true,
      data: {
        open,
        resolved,
        total,
        avgResolutionMs,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/incidents/:id - Get single incident with updates
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        updates: {
          orderBy: { createdAt: 'asc' },
        },
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
      },
    });

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found',
      });
    }

    res.json({
      success: true,
      data: incident,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/incidents - Create incident
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, severity, description, alertId, serverId, assignee, createdBy } = req.body;

    if (!title || !severity) {
      return res.status(400).json({
        success: false,
        error: 'title and severity are required',
      });
    }

    const validSeverities = ['CRITICAL', 'WARNING', 'INFO', 'DEBUG'];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({
        success: false,
        error: `severity must be one of: ${validSeverities.join(', ')}`,
      });
    }

    const incident = await prisma.incident.create({
      data: {
        title,
        severity,
        ...(description && { description }),
        ...(alertId && { alertId }),
        ...(serverId && { serverId }),
        ...(assignee && { assignee }),
        ...(createdBy && { createdBy }),
      },
    });

    logger.info(`Incident created: ${incident.title} [${incident.severity}]`);

    res.status(201).json({
      success: true,
      data: incident,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/incidents/:id - Update incident
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, description, severity, assignee, status } = req.body;

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found',
      });
    }

    if (severity) {
      const validSeverities = ['CRITICAL', 'WARNING', 'INFO', 'DEBUG'];
      if (!validSeverities.includes(severity)) {
        return res.status(400).json({
          success: false,
          error: `severity must be one of: ${validSeverities.join(', ')}`,
        });
      }
    }

    if (status) {
      const validStatuses = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'POSTMORTEM'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `status must be one of: ${validStatuses.join(', ')}`,
        });
      }
    }

    // If status changes to RESOLVED, set resolvedAt
    const resolvedAt =
      status === 'RESOLVED' && existing.status !== 'RESOLVED'
        ? new Date()
        : undefined;

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(severity !== undefined && { severity }),
        ...(assignee !== undefined && { assignee }),
        ...(status !== undefined && { status }),
        ...(resolvedAt && { resolvedAt }),
      },
    });

    logger.info(`Incident updated: ${incident.id} [${incident.status}]`);

    res.json({
      success: true,
      data: incident,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/incidents/:id/updates - Add an update to an incident
router.post('/:id/updates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { message, status, createdBy } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required',
      });
    }

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found',
      });
    }

    if (status) {
      const validStatuses = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'POSTMORTEM'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `status must be one of: ${validStatuses.join(', ')}`,
        });
      }
    }

    // Create the update and optionally update the incident status in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const update = await tx.incidentUpdate.create({
        data: {
          incidentId: id,
          message,
          ...(status && { status }),
          ...(createdBy && { createdBy }),
        },
      });

      // If status is provided, also update the incident's status
      if (status) {
        const resolvedAt =
          status === 'RESOLVED' && incident.status !== 'RESOLVED'
            ? new Date()
            : undefined;

        await tx.incident.update({
          where: { id },
          data: {
            status,
            ...(resolvedAt && { resolvedAt }),
          },
        });
      }

      return update;
    });

    logger.info(`Incident update added to ${id}${status ? ` [status -> ${status}]` : ''}`);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/incidents/:id - Delete incident and its updates
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found',
      });
    }

    // IncidentUpdate has onDelete: Cascade in the schema, so deleting
    // the incident will automatically delete its updates.
    await prisma.incident.delete({ where: { id } });

    logger.info(`Incident deleted: ${id}`);

    res.json({
      success: true,
      message: 'Incident deleted',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/incidents/from-alert - Create incident from an existing alert
router.post('/from-alert', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { alertId } = req.body;

    if (!alertId) {
      return res.status(400).json({
        success: false,
        error: 'alertId is required',
      });
    }

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        message: true,
        severity: true,
        serverId: true,
      },
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    // Map AlertSeverity to the incident severity (they share the same enum)
    const incident = await prisma.incident.create({
      data: {
        title: alert.message,
        severity: alert.severity as any,
        alertId: alert.id,
        ...(alert.serverId && { serverId: alert.serverId }),
      },
    });

    logger.info(`Incident created from alert ${alertId}: ${incident.title}`);

    res.status(201).json({
      success: true,
      data: incident,
    });
  } catch (error) {
    next(error);
  }
});

export { router as incidentRoutes };
