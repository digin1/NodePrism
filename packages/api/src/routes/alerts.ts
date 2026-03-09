import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { AlertTemplateService } from '../services/alertTemplateService';
import { dispatchNotifications } from '../services/notificationSender';
import { audit } from '../services/auditLogger';
import { syncRulesToYml, matchAlertToRule } from '../services/alertRuleSync';
import { webhookLimiter } from '../middleware/rateLimit';
import { getBaseMetricExpr, queryCurrentValue } from '../services/alertReconciliation';

const router: ExpressRouter = Router();

// Validation schemas
const createAlertRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  query: z.string().min(1), // PromQL query
  duration: z.string().default('5m'),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO', 'DEBUG']),
  labels: z.record(z.string(), z.string()).optional(),
  annotations: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
});

const alertConditionSchema = z.object({
  condition: z.string().min(1),
  hysteresis: z
    .object({
      trigger: z.number(),
      clear: z.number(),
    })
    .optional(),
});

const createAlertTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  matchLabels: z.record(z.string(), z.string()).optional(),
  matchHostLabels: z.record(z.string(), z.string()).optional(),
  query: z.string().min(1), // PromQL query
  calc: z.string().optional(), // Additional calculation expression
  units: z.string().optional(),
  warnCondition: alertConditionSchema,
  critCondition: alertConditionSchema,
  every: z.string().default('1m'), // Evaluation interval
  for: z.string().default('5m'), // Duration before firing
  actions: z.array(z.any()).optional(),
  enabled: z.boolean().default(true),
});

// GET /api/alerts - Get active alerts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, severity, serverId } = req.query;

    const alerts = await prisma.alert.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(severity && { severity: severity as any }),
        ...(serverId && { serverId: serverId as string }),
      },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
        rule: {
          select: { id: true, name: true },
        },
        template: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/rules - Get all alert rules
router.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await prisma.alertRule.findMany({
      include: {
        _count: {
          select: { alerts: { where: { status: 'FIRING' } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/templates - Get all alert templates
router.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templateService = new AlertTemplateService();
    const templates = await templateService.getAllTemplates();

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/templates - Create alert template
router.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createAlertTemplateSchema.parse(req.body);
    const templateService = new AlertTemplateService();

    const template = await templateService.createTemplate(data);

    if (!template) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create template',
      });
    }

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// GET /api/alerts/templates/:id - Get specific template
router.get('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const template = await prisma.alertTemplate.findUnique({
      where: { id },
      include: {
        _count: {
          select: { alerts: { where: { status: 'FIRING' } } },
        },
      },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/alerts/templates/:id - Update alert template
router.put('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = createAlertTemplateSchema.partial().parse(req.body);

    const template = await prisma.alertTemplate.update({
      where: { id },
      data,
    });

    logger.info(`Alert template updated: ${template.name}`);
    audit(req, { action: 'alert_template.update', entityType: 'alert_template', entityId: req.params.id, details: { name: template.name } });

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// DELETE /api/alerts/templates/:id - Delete alert template
router.delete('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await prisma.alertTemplate.delete({
      where: { id },
    });

    logger.info(`Alert template deleted: ${id}`);
    audit(req, { action: 'alert_template.delete', entityType: 'alert_template', entityId: id });

    res.json({
      success: true,
      message: 'Alert template deleted',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/templates/:id/test - Test template against live Prometheus data
router.post('/templates/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const template = await prisma.alertTemplate.findUnique({ where: { id } });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    // Get servers to test against (capped at 100 to prevent heavy queries)
    const servers = await prisma.server.findMany({
      where: { status: { in: ['ONLINE', 'WARNING'] } },
      select: { id: true, hostname: true, ipAddress: true },
      take: 100,
    });

    const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
    const templateService = new AlertTemplateService();
    const results: Array<{ serverId: string; hostname: string; value: number | null; error?: string; warnFiring: boolean; critFiring: boolean }> = [];

    for (const server of servers) {
      // Check if template matches this server
      const matching = await templateService.findMatchingTemplates(server.id);
      if (!matching.some(t => t.id === id)) continue;

      // Query Prometheus
      let query = template.query;
      if (query.includes('{')) {
        query = query.replace('{', `{server_id="${server.id}", `);
      } else {
        query = query.replace(/^(\w+)/, `$1{server_id="${server.id}"}`);
      }

      let value: number | null = null;
      let queryError: string | undefined;
      try {
        const axios = require('axios');
        const resp = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
          params: { query },
          timeout: 5000,
        });
        const data = resp.data?.data?.result?.[0]?.value;
        value = data ? parseFloat(data[1]) : null;
      } catch (err: any) {
        queryError = err.message || 'Prometheus query failed';
        logger.warn('Prometheus query failed during template test', { query, error: queryError });
      }

      const warnCond = template.warnCondition as any;
      const critCond = template.critCondition as any;

      results.push({
        serverId: server.id,
        hostname: server.hostname,
        value,
        ...(queryError && { error: queryError }),
        warnFiring: value !== null && warnCond?.condition ? templateService.evaluateCondition(warnCond.condition, value) : false,
        critFiring: value !== null && critCond?.condition ? templateService.evaluateCondition(critCond.condition, value) : false,
      });
    }

    res.json({
      success: true,
      data: {
        templateId: id,
        templateName: template.name,
        results,
        testedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/rules - Create alert rule
router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createAlertRuleSchema.parse(req.body);

    const rule = await prisma.alertRule.create({
      data,
    });

    logger.info(`Alert rule created: ${rule.name}`);
    audit(req, { action: 'alert_rule.create', entityType: 'alert_rule', entityId: rule.id, details: { name: rule.name, severity: rule.severity } });

    // Sync to Prometheus alerts.yml
    syncRulesToYml().catch(err => logger.error('Failed to sync rules to YAML', { error: err.message }));

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// PUT /api/alerts/rules/:id - Update alert rule
router.put('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = createAlertRuleSchema.partial().parse(req.body);

    const rule = await prisma.alertRule.update({
      where: { id },
      data,
    });

    logger.info(`Alert rule updated: ${rule.name}`);
    audit(req, { action: 'alert_rule.update', entityType: 'alert_rule', entityId: req.params.id, details: { name: rule.name } });

    // Sync to Prometheus alerts.yml
    syncRulesToYml().catch(err => logger.error('Failed to sync rules to YAML', { error: err.message }));

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/alerts/rules/:id - Delete alert rule
router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await prisma.alertRule.delete({
      where: { id },
    });

    logger.info(`Alert rule deleted: ${id}`);
    audit(req, { action: 'alert_rule.delete', entityType: 'alert_rule', entityId: id });

    // Sync to Prometheus alerts.yml
    syncRulesToYml().catch(err => logger.error('Failed to sync rules to YAML', { error: err.message }));

    res.json({
      success: true,
      message: 'Alert rule deleted',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/bulk/acknowledge - Bulk acknowledge alerts
// NOTE: Bulk routes MUST be defined before /:id routes to avoid Express matching "bulk" as :id
router.post('/bulk/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      alertIds: z.array(z.string().uuid()).min(1),
      acknowledgedBy: z.string().default('Admin'),
    });
    const data = schema.parse(req.body);

    const result = await prisma.alert.updateMany({
      where: { id: { in: data.alertIds }, status: 'FIRING' },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedBy: data.acknowledgedBy },
    });

    logger.info(`Bulk acknowledged ${result.count} alerts`);
    audit(req, { action: 'alert.acknowledge', entityType: 'alert', entityId: data.alertIds.join(','), details: { count: result.count } });

    res.json({ success: true, data: { updated: result.count } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// POST /api/alerts/bulk/silence - Bulk silence alerts
router.post('/bulk/silence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      alertIds: z.array(z.string().uuid()).min(1),
      silencedBy: z.string().default('Admin'),
      duration: z.number().min(1).default(60), // minutes
    });
    const data = schema.parse(req.body);

    const result = await prisma.alert.updateMany({
      where: { id: { in: data.alertIds }, status: { in: ['FIRING', 'ACKNOWLEDGED'] } },
      data: { status: 'SILENCED', acknowledgedAt: new Date(), acknowledgedBy: data.silencedBy },
    });

    logger.info(`Bulk silenced ${result.count} alerts for ${data.duration}m`);
    audit(req, { action: 'alert.silence', entityType: 'alert', entityId: data.alertIds.join(','), details: { count: result.count, duration: data.duration } });

    res.json({ success: true, data: { updated: result.count } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// POST /api/alerts/:id/acknowledge - Acknowledge an alert
router.post('/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { acknowledgedBy } = req.body;

    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
    });

    logger.info(`Alert acknowledged: ${id}`);
    audit(req, { action: 'alert.acknowledge', entityType: 'alert', entityId: id });

    const io = req.app.get('io');
    if (io) {
      io.emit('alert:acknowledged', alert);
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/:id/silence - Silence an alert
router.post('/:id/silence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { silencedBy, duration } = req.body; // duration in minutes

    const silencedUntil = duration ? new Date(Date.now() + duration * 60 * 1000) : null;

    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: 'SILENCED',
        acknowledgedAt: new Date(),
        acknowledgedBy: silencedBy,
      },
    });

    logger.info(`Alert silenced: ${id}`, { duration, silencedUntil });
    audit(req, { action: 'alert.silence', entityType: 'alert', entityId: id, details: { duration, silencedUntil } });

    const io = req.app.get('io');
    if (io) {
      io.emit('alert:silenced', alert);
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts/webhook - Receive alerts from AlertManager
router.post('/webhook', webhookLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { alerts } = req.body;

    logger.info('Received AlertManager webhook', { alertCount: alerts?.length });

    // Cache server lookups within this webhook batch to avoid repeated DB queries
    const serverCache = new Map<string, { id: string; hostname: string; ipAddress: string | null } | null>();

    // Cache maintenance window checks per server within this batch
    const maintenanceCache = new Map<string, boolean>();
    const now = new Date();

    // Process each alert from AlertManager
    for (const alert of alerts || []) {
      const fingerprint = alert.fingerprint;
      const status = alert.status === 'firing' ? 'FIRING' : 'RESOLVED';

      // Try to find the server from labels (with per-batch caching)
      let serverId: string | null = null;
      const instance = alert.labels?.instance;
      const hostname = alert.labels?.hostname;
      const labelServerId = alert.labels?.server_id;

      // Build a cache key from the lookup parameters
      const serverCacheKey = labelServerId || `${instance || ''}:${hostname || ''}`;

      if (serverCache.has(serverCacheKey)) {
        const cached = serverCache.get(serverCacheKey);
        serverId = cached?.id || null;
      } else {
        // First check if server_id is directly in the labels (from Prometheus relabeling)
        if (labelServerId) {
          const server = await prisma.server.findUnique({
            where: { id: labelServerId },
            select: { id: true, hostname: true, ipAddress: true },
          });
          serverCache.set(serverCacheKey, server);
          if (server) {
            serverId = server.id;
          }
        }

        // If no match by server_id, try instance/hostname
        if (!serverId && (instance || hostname)) {
          const ip = instance ? instance.split(':')[0] : null;

          const server = await prisma.server.findFirst({
            where: {
              OR: [
                ...(ip ? [{ ipAddress: ip }] : []),
                ...(hostname ? [{ hostname: hostname }] : []),
                ...(instance ? [{ hostname: instance.split(':')[0] }] : []),
              ],
            },
            select: { id: true, hostname: true, ipAddress: true },
          });
          serverCache.set(serverCacheKey, server);
          if (server) {
            serverId = server.id;
          }
        }
      }

      // Check if server is in maintenance window — suppress new alerts (cached per server)
      if (serverId && status === 'FIRING') {
        let inMaintenance = maintenanceCache.get(serverId);
        if (inMaintenance === undefined) {
          const activeWindow = await prisma.maintenanceWindow.findFirst({
            where: {
              serverId,
              startTime: { lte: now },
              endTime: { gte: now },
            },
          });
          inMaintenance = !!activeWindow;
          maintenanceCache.set(serverId, inMaintenance);
        }
        if (inMaintenance) {
          logger.debug(`Alert suppressed for server ${serverId}: in maintenance window`);
          continue;
        }
      }

      // Match to DB alert rule by alertname or rule_id label
      const ruleId = await matchAlertToRule(alert.labels || {});

      // Check existing alert to avoid duplicate notifications
      const existingAlert = await prisma.alert.findUnique({ where: { fingerprint } });
      const isNewAlert = !existingAlert;
      const statusChanged = existingAlert && existingAlert.status !== status;
      // Don't overwrite ACKNOWLEDGED/SILENCED with FIRING (user already handled it)
      const effectiveStatus = (status === 'FIRING' && existingAlert &&
        (existingAlert.status === 'ACKNOWLEDGED' || existingAlert.status === 'SILENCED'))
        ? existingAlert.status : status;

      // Upsert the alert
      const upsertedAlert = await prisma.alert.upsert({
        where: { fingerprint },
        create: {
          fingerprint,
          status,
          severity: (alert.labels?.severity?.toUpperCase() || 'WARNING') as any,
          message:
            alert.annotations?.summary || alert.annotations?.description || 'Alert triggered',
          labels: alert.labels,
          annotations: alert.annotations,
          startsAt: new Date(alert.startsAt),
          endsAt: alert.endsAt ? new Date(alert.endsAt) : null,
          ...(serverId && { serverId }),
          ...(ruleId && { ruleId }),
        },
        update: {
          status: effectiveStatus,
          endsAt: alert.endsAt ? new Date(alert.endsAt) : null,
          ...(serverId && { serverId }),
          ...(ruleId && { ruleId }),
        },
        include: { server: { select: { hostname: true, ipAddress: true } } },
      });

      // Notification dedup: skip re-fires unless it's a critical alert repeat
      // AlertManager already throttles critical repeats to 1h, so we let those through
      const severity = (alert.labels?.severity || 'warning').toUpperCase();
      const isCriticalRepeat = !isNewAlert && !statusChanged && severity === 'CRITICAL' && status === 'FIRING';
      if (!isNewAlert && !statusChanged && !isCriticalRepeat) {
        logger.debug(`Skipping notification for alert ${fingerprint}: status unchanged (${status})`);
        continue;
      }

      // For resolved alerts, enrich annotations with current metric value
      let enrichedAnnotations = (upsertedAlert.annotations as Record<string, string>) || {};
      if (status === 'RESOLVED' && ruleId) {
        try {
          const rule = await prisma.alertRule.findUnique({
            where: { id: ruleId },
            select: { query: true },
          });
          if (rule?.query) {
            const baseExpr = getBaseMetricExpr(rule.query);
            const instance = alert.labels?.instance;
            const currentVal = await queryCurrentValue(baseExpr, instance);
            if (currentVal !== null) {
              const formatted = isNaN(Number(currentVal))
                ? currentVal
                : Number(currentVal).toFixed(2);
              enrichedAnnotations = { ...enrichedAnnotations, current_value: formatted };
              if (enrichedAnnotations.description) {
                enrichedAnnotations.description += ` → Current value: ${formatted}`;
              }
            }
          }
        } catch (err: any) {
          logger.debug('Failed to fetch current value for resolved alert', { error: err.message });
        }
      }

      // Dispatch notifications (non-blocking)
      dispatchNotifications({
        id: upsertedAlert.id,
        status: upsertedAlert.status,
        severity: upsertedAlert.severity,
        message: upsertedAlert.message,
        labels: (upsertedAlert.labels as Record<string, string>) || {},
        annotations: enrichedAnnotations,
        startsAt: upsertedAlert.startsAt,
        endsAt: upsertedAlert.endsAt,
        serverId: upsertedAlert.serverId || undefined,
        ruleId: upsertedAlert.ruleId || undefined,
        templateId: upsertedAlert.templateId || undefined,
        serverHostname: upsertedAlert.server?.hostname,
        serverIp: upsertedAlert.server?.ipAddress,
      }).catch(err => logger.error('Notification dispatch error', { error: err.message }));
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('alerts:updated', { count: alerts?.length });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/stats - Get alert statistics (single query instead of 6)
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groups = await prisma.alert.groupBy({
      by: ['status', 'severity'],
      _count: true,
    });

    let firing = 0, resolved = 0, critical = 0, warning = 0, silenced = 0, acknowledged = 0;
    for (const g of groups) {
      const count = g._count;
      switch (g.status) {
        case 'FIRING':
          firing += count;
          if (g.severity === 'CRITICAL') critical += count;
          if (g.severity === 'WARNING') warning += count;
          break;
        case 'RESOLVED':
          resolved += count;
          break;
        case 'SILENCED':
          silenced += count;
          break;
        case 'ACKNOWLEDGED':
          acknowledged += count;
          break;
      }
    }

    res.json({
      success: true,
      data: { firing, resolved, critical, warning, silenced, acknowledged },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/alerts/history - Get alert state transition history
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, limit, offset } = req.query;

    const alerts = await prisma.alert.findMany({
      where: {
        ...(serverId && { serverId: serverId as string }),
      },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
        template: {
          select: { id: true, name: true },
        },
        rule: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string) || 100, 500),
      skip: Math.max(parseInt(offset as string) || 0, 0),
    });

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    next(error);
  }
});

export { router as alertRoutes };
