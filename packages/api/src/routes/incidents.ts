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

    // Calculate average resolution time using database aggregation
    const avgResult = await prisma.$queryRaw<[{ avg_ms: number | null }]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("resolved_at" - "started_at")) * 1000) as avg_ms
      FROM incidents
      WHERE status = 'RESOLVED' AND "resolved_at" IS NOT NULL
    `;
    const avgResolutionMs = avgResult[0]?.avg_ms ? Number(avgResult[0].avg_ms) : null;

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

// POST /api/incidents/:id/analyze - AI root cause analysis
router.post('/:id/analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true, status: true, environment: true, region: true },
        },
        updates: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found',
      });
    }

    // Gather correlated alerts (same server or within incident timeframe)
    const alertWhere: any = {};
    const incidentStart = new Date(incident.startedAt);
    const incidentEnd = incident.resolvedAt ? new Date(incident.resolvedAt) : new Date();

    if (incident.serverId) {
      alertWhere.serverId = incident.serverId;
    }
    alertWhere.createdAt = {
      gte: new Date(incidentStart.getTime() - 60 * 60 * 1000), // 1 hour before
      lte: incidentEnd,
    };

    const correlatedAlerts = await prisma.alert.findMany({
      where: alertWhere,
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: {
        id: true,
        message: true,
        severity: true,
        status: true,
        createdAt: true,
        server: { select: { hostname: true } },
      },
    });

    // Gather recent events on affected server
    let recentEvents: any[] = [];
    if (incident.serverId) {
      recentEvents = await prisma.eventLog.findMany({
        where: {
          serverId: incident.serverId,
          createdAt: {
            gte: new Date(incidentStart.getTime() - 24 * 60 * 60 * 1000),
            lte: incidentEnd,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { type: true, message: true, createdAt: true },
      });
    }

    // Build structured analysis
    const lines: string[] = [];
    lines.push(`# Root Cause Analysis: ${incident.title}`);
    lines.push('');
    lines.push(`**Severity:** ${incident.severity}`);
    lines.push(`**Status:** ${incident.status}`);
    lines.push(`**Started:** ${incidentStart.toISOString()}`);
    if (incident.resolvedAt) {
      const durationMs = incidentEnd.getTime() - incidentStart.getTime();
      const durationMin = Math.round(durationMs / 60000);
      lines.push(`**Resolved:** ${incident.resolvedAt} (Duration: ${durationMin} minutes)`);
    }
    lines.push('');

    // Correlated alerts section
    lines.push('## Correlated Alerts');
    lines.push('');
    if (correlatedAlerts.length === 0) {
      lines.push('No correlated alerts found in the incident timeframe.');
    } else {
      for (const alert of correlatedAlerts) {
        const time = new Date(alert.createdAt).toISOString();
        const host = alert.server?.hostname || 'N/A';
        lines.push(`- **[${alert.severity}]** ${alert.message} (${host}, ${time})`);
      }
    }
    lines.push('');

    // Affected servers section
    lines.push('## Affected Server');
    lines.push('');
    if (incident.server) {
      const s = incident.server;
      lines.push(`- **Hostname:** ${s.hostname}`);
      lines.push(`- **IP:** ${s.ipAddress}`);
      lines.push(`- **Status:** ${s.status}`);
      if (s.environment) lines.push(`- **Environment:** ${s.environment}`);
      if (s.region) lines.push(`- **Region:** ${s.region}`);
    } else {
      lines.push('No specific server associated with this incident.');
    }
    lines.push('');

    // Recent infrastructure changes
    lines.push('## Recent Infrastructure Changes');
    lines.push('');
    if (recentEvents.length === 0) {
      lines.push('No recent infrastructure changes detected on the affected server.');
    } else {
      for (const event of recentEvents) {
        const time = new Date(event.createdAt).toISOString();
        lines.push(`- **[${event.type}]** ${event.message} (${time})`);
      }
    }
    lines.push('');

    // Root cause suggestions based on alert patterns
    lines.push('## Likely Root Causes');
    lines.push('');

    const alertMessages = correlatedAlerts.map((a) => a.message.toLowerCase());
    const suggestions: string[] = [];

    if (alertMessages.some((m) => m.includes('cpu') || m.includes('load'))) {
      suggestions.push('High CPU utilization or process runaway detected. Check for resource-intensive processes or CPU throttling.');
    }
    if (alertMessages.some((m) => m.includes('memory') || m.includes('oom') || m.includes('swap'))) {
      suggestions.push('Memory pressure detected. Investigate memory leaks, OOM killer events, or insufficient memory allocation.');
    }
    if (alertMessages.some((m) => m.includes('disk') || m.includes('storage') || m.includes('filesystem'))) {
      suggestions.push('Disk space or I/O issues detected. Check for full partitions, high IOPS, or failing storage hardware.');
    }
    if (alertMessages.some((m) => m.includes('network') || m.includes('connection') || m.includes('timeout') || m.includes('dns'))) {
      suggestions.push('Network connectivity issues detected. Investigate DNS resolution, firewall rules, or network saturation.');
    }
    if (alertMessages.some((m) => m.includes('service') || m.includes('process') || m.includes('down'))) {
      suggestions.push('Service availability issues detected. Check service logs, restart policies, and dependency health.');
    }

    if (suggestions.length === 0) {
      suggestions.push('Insufficient alert pattern data for automated root cause determination. Manual investigation recommended.');
      suggestions.push('Review incident timeline and server logs for anomalies around the incident start time.');
    }

    for (const suggestion of suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('');

    // Incident timeline summary
    lines.push('## Incident Timeline');
    lines.push('');
    lines.push(`1. Incident reported at ${incidentStart.toISOString()}`);
    if (incident.updates && incident.updates.length > 0) {
      for (const update of incident.updates) {
        const time = new Date(update.createdAt).toISOString();
        const statusChange = update.status ? ` [Status: ${update.status}]` : '';
        lines.push(`2. ${update.message}${statusChange} (${time})`);
      }
    }
    if (incident.resolvedAt) {
      lines.push(`3. Incident resolved at ${incident.resolvedAt}`);
    }

    const analysis = lines.join('\n');

    // Store analysis
    const updated = await prisma.incident.update({
      where: { id },
      data: {
        aiAnalysis: analysis,
        aiAnalyzedAt: new Date(),
      },
    });

    logger.info(`AI analysis generated for incident ${id}`);

    res.json({
      success: true,
      data: {
        aiAnalysis: updated.aiAnalysis,
        aiAnalyzedAt: updated.aiAnalyzedAt,
      },
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
