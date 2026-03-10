import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { AlertTemplateService, AlertTemplateConfig } from './alertTemplateService';
import { dispatchNotifications } from './notificationSender';
import axios from 'axios';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

export interface MultiStageAlert {
  id: string;
  templateId: string;
  serverId: string;
  stage: number;
  status: 'pending' | 'firing' | 'resolved';
  value: number;
  threshold: number;
  startedAt: Date;
  lastEvaluated: Date;
  labels: Record<string, string>;
}

/**
 * Query Prometheus for a single instant value.
 * Returns null if the query fails or returns no data.
 */
async function queryPrometheus(query: string): Promise<number | null> {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query },
      timeout: 5000,
    });
    const result = response.data?.data?.result?.[0]?.value;
    return result ? parseFloat(result[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Inject server_id label into a PromQL query.
 * If the query already contains a label selector (curly braces), appends server_id.
 * Otherwise wraps the metric name with {server_id="..."}.
 */
function injectServerId(query: string, serverId: string): string {
  // Sanitize serverId to prevent PromQL injection
  const safeId = serverId.replace(/[^a-zA-Z0-9_:-]/g, '');
  const idx = query.indexOf('{');
  if (idx !== -1) {
    // Insert server_id into existing label selector (after first '{')
    return query.slice(0, idx + 1) + `server_id="${safeId}", ` + query.slice(idx + 1);
  }
  // No label selector — add one
  return query.replace(/^(\w+)/, `$1{server_id="${safeId}"}`);
}

/**
 * Multi-Stage Alert Processor
 * Evaluates alert templates against live Prometheus data for each server.
 */
export class MultiStageAlertProcessor {
  private templateService: AlertTemplateService;

  constructor() {
    this.templateService = new AlertTemplateService();
  }

  /**
   * Evaluate all matching alert templates for a single server.
   * Called from the metric collection cycle.
   */
  async evaluateMultiStageAlerts(serverId: string): Promise<void> {
    try {
      const templates = await this.templateService.findMatchingTemplates(serverId);

      for (const template of templates) {
        await this.evaluateTemplate(template, serverId);
      }
    } catch (error) {
      logger.error('Failed to evaluate multi-stage alerts', { serverId, error });
    }
  }

  /**
   * Evaluate a single template against a server: query Prometheus, check warn/crit conditions.
   */
  private async evaluateTemplate(
    template: AlertTemplateConfig,
    serverId: string
  ): Promise<void> {
    // Query Prometheus with server_id injected
    const query = injectServerId(template.query, serverId);
    const value = await queryPrometheus(query);

    if (value === null) {
      // No data from Prometheus — skip evaluation
      return;
    }

    // Determine previous state from DB
    const previousState = await this.getPreviousState(template.id, serverId);

    // Check critical first (higher priority)
    const critFiring = this.templateService.evaluateHysteresis(
      template.crit,
      value,
      previousState
    );

    if (critFiring) {
      await this.upsertAlert(template, serverId, 'CRITICAL', value);
      return;
    }

    // Check warning
    const warnFiring = this.templateService.evaluateHysteresis(
      template.warn,
      value,
      previousState
    );

    if (warnFiring) {
      await this.upsertAlert(template, serverId, 'WARNING', value);
      return;
    }

    // Neither condition met — resolve if there was an active alert
    await this.resolveAlert(template.id, serverId);
  }

  /**
   * Look up the current state of the alert for this template+server.
   */
  private async getPreviousState(
    templateId: string,
    serverId: string
  ): Promise<'clear' | 'warning' | 'critical'> {
    const existing = await prisma.alert.findFirst({
      where: {
        templateId,
        serverId,
        status: { in: ['FIRING', 'PENDING'] },
      },
      select: { severity: true },
    });

    if (!existing) return 'clear';
    if (existing.severity === 'CRITICAL') return 'critical';
    if (existing.severity === 'WARNING') return 'warning';
    return 'clear';
  }

  /**
   * Create or update an alert for a template+server, and dispatch notifications.
   * Suppresses alerts if the server is in a maintenance window.
   */
  private async upsertAlert(
    template: AlertTemplateConfig,
    serverId: string,
    severity: 'WARNING' | 'CRITICAL',
    value: number
  ): Promise<void> {
    try {
      // Check if server is in a maintenance window — suppress alert if so
      const now = new Date();
      const activeWindow = await prisma.maintenanceWindow.findFirst({
        where: {
          serverId,
          startTime: { lte: now },
          endTime: { gte: now },
        },
      });

      if (activeWindow) {
        logger.debug(`Alert suppressed for server ${serverId}: in maintenance window until ${activeWindow.endTime.toISOString()}`);
        return;
      }

      const fingerprint = `template-${template.id}-${serverId}`;

      const alert = await prisma.alert.upsert({
        where: { fingerprint },
        create: {
          templateId: template.id,
          serverId,
          status: 'FIRING',
          severity,
          message: `${template.name}: ${severity.toLowerCase()} (value: ${value.toFixed(2)}${template.units ? ' ' + template.units : ''})`,
          labels: { server_id: serverId },
          annotations: { template: template.name, value, units: template.units },
          fingerprint,
          startsAt: new Date(),
        },
        update: {
          status: 'FIRING',
          severity,
          message: `${template.name}: ${severity.toLowerCase()} (value: ${value.toFixed(2)}${template.units ? ' ' + template.units : ''})`,
          annotations: { template: template.name, value, units: template.units },
        },
        include: {
          server: { select: { hostname: true, ipAddress: true } },
        },
      });

      // Dispatch notifications (non-blocking)
      dispatchNotifications({
        id: alert.id,
        status: alert.status,
        severity: alert.severity,
        message: alert.message,
        labels: (alert.labels as Record<string, string>) || {},
        annotations: (alert.annotations as Record<string, string>) || undefined,
        startsAt: alert.startsAt,
        endsAt: alert.endsAt,
        serverId: alert.serverId || undefined,
        templateId: alert.templateId || undefined,
        ruleId: alert.ruleId || undefined,
        serverHostname: alert.server?.hostname,
        serverIp: alert.server?.ipAddress,
      }).catch(err => {
        logger.error('Failed to dispatch template alert notifications', { error: err.message });
      });

      logger.info('Template alert fired', {
        template: template.name,
        serverId,
        severity,
        value,
      });
    } catch (error) {
      logger.error('Failed to upsert template alert', { templateId: template.id, serverId, error });
    }
  }

  /**
   * Resolve an active alert if conditions have cleared.
   */
  private async resolveAlert(templateId: string, serverId: string): Promise<void> {
    try {
      const alert = await prisma.alert.findFirst({
        where: {
          templateId,
          serverId,
          status: { in: ['FIRING', 'PENDING'] },
        },
      });

      if (alert) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: {
            status: 'RESOLVED',
            endsAt: new Date(),
          },
        });

        logger.info('Template alert resolved', { template: templateId, serverId });
      }
    } catch (error) {
      logger.error('Failed to resolve template alert', { templateId, serverId, error });
    }
  }

  /**
   * Get current multi-stage alert states for the API.
   */
  async getMultiStageStates(serverId?: string): Promise<MultiStageAlert[]> {
    try {
      const alerts = await prisma.alert.findMany({
        where: {
          ...(serverId && { serverId }),
          templateId: { not: null },
          status: { in: ['FIRING', 'PENDING'] },
        },
        include: { template: true },
      });

      return alerts.map((alert) => ({
        id: alert.id,
        templateId: alert.templateId!,
        serverId: alert.serverId!,
        stage: alert.severity === 'CRITICAL' ? 2 : 1,
        status: alert.status === 'PENDING' ? 'pending' as const : 'firing' as const,
        value: (alert.annotations as any)?.value || 0,
        threshold: 0,
        startedAt: alert.startsAt,
        lastEvaluated: alert.createdAt,
        labels: (alert.labels as Record<string, string>) || {},
      }));
    } catch (error) {
      logger.error('Failed to get multi-stage states', { serverId, error });
      return [];
    }
  }
}
