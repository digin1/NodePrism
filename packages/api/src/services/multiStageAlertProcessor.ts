import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { AlertTemplateService, AlertTemplateConfig } from './alertTemplateService';

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

export interface AlertStage {
  name: string;
  query: string;
  calc?: string;
  condition: string;
  duration: string; // How long condition must be true
  severity: 'warning' | 'critical';
}

/**
 * Multi-Stage Alert Processor
 * Handles complex alerts that build on each other
 */
export class MultiStageAlertProcessor {
  private templateService: AlertTemplateService;

  constructor() {
    this.templateService = new AlertTemplateService();
  }

  /**
   * Evaluate multi-stage alerts for a server
   */
  async evaluateMultiStageAlerts(serverId: string): Promise<void> {
    try {
      // Get all templates that match this server
      const templates = await this.templateService.findMatchingTemplates(serverId);

      for (const template of templates) {
        await this.evaluateTemplateStages(template, serverId);
      }
    } catch (error) {
      logger.error('Failed to evaluate multi-stage alerts', { serverId, error });
    }
  }

  /**
   * Evaluate all stages of a template
   */
  private async evaluateTemplateStages(
    template: AlertTemplateConfig,
    serverId: string
  ): Promise<void> {
    // For now, implement basic two-stage logic (warning -> critical)
    // In a full implementation, this would parse template.calc for multi-stage definitions

    const stages: AlertStage[] = [
      {
        name: 'warning',
        query: template.query,
        calc: template.calc,
        condition: template.warn.condition,
        duration: template.for,
        severity: 'warning',
      },
      {
        name: 'critical',
        query: template.query,
        calc: template.calc,
        condition: template.crit.condition,
        duration: template.for,
        severity: 'critical',
      },
    ];

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageResult = await this.evaluateStage(stage, serverId, template);

      if (stageResult) {
        await this.handleStageFiring(template, serverId, i + 1, stage, stageResult);
      } else {
        await this.handleStageResolution(template, serverId, i + 1);
      }
    }
  }

  /**
   * Evaluate a single stage
   */
  private async evaluateStage(
    stage: AlertStage,
    serverId: string,
    template: AlertTemplateConfig
  ): Promise<{ value: number; labels: Record<string, string> } | null> {
    try {
      // This would query Prometheus with the stage query
      // For now, return mock data
      const mockValue = Math.random() * 100;
      const mockLabels = { server_id: serverId };

      // Evaluate condition
      const conditionMet = this.templateService.evaluateHysteresis(
        { condition: stage.condition },
        mockValue,
        'clear' // Would track previous state
      );

      if (conditionMet) {
        return { value: mockValue, labels: mockLabels };
      }

      return null;
    } catch (error) {
      logger.error('Failed to evaluate stage', { stage: stage.name, serverId, error });
      return null;
    }
  }

  /**
   * Handle stage firing
   */
  private async handleStageFiring(
    template: AlertTemplateConfig,
    serverId: string,
    stageNumber: number,
    stage: AlertStage,
    result: { value: number; labels: Record<string, string> }
  ): Promise<void> {
    try {
      // Check if alert already exists
      const existingAlert = await prisma.alert.findFirst({
        where: {
          templateId: template.id,
          serverId,
          status: { in: ['FIRING', 'PENDING'] },
        },
      });

      if (existingAlert) {
        // Update existing alert
        await prisma.alert.update({
          where: { id: existingAlert.id },
          data: {
            status: 'FIRING',
            severity: stage.severity.toUpperCase() as any,
            message: `${template.name} - ${stage.name} stage`,
            labels: result.labels,
          },
        });
      } else {
        // Create new alert
        const fingerprint = `${template.id}-${serverId}-${stageNumber}`;

        await prisma.alert.create({
          data: {
            templateId: template.id,
            serverId,
            status: 'PENDING', // Would transition to FIRING after duration
            severity: stage.severity.toUpperCase() as any,
            message: `${template.name} - ${stage.name} stage`,
            labels: result.labels,
            annotations: {
              stage: stageNumber,
              template: template.name,
              value: result.value,
            },
            fingerprint,
            startsAt: new Date(),
          },
        });
      }

      logger.info('Multi-stage alert fired', {
        template: template.name,
        serverId,
        stage: stageNumber,
        severity: stage.severity,
      });
    } catch (error) {
      logger.error('Failed to handle stage firing', { templateId: template.id, serverId, error });
    }
  }

  /**
   * Handle stage resolution
   */
  private async handleStageResolution(
    template: AlertTemplateConfig,
    serverId: string,
    stageNumber: number
  ): Promise<void> {
    try {
      const alert = await prisma.alert.findFirst({
        where: {
          templateId: template.id,
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

        logger.info('Multi-stage alert resolved', {
          template: template.name,
          serverId,
          stage: stageNumber,
        });
      }
    } catch (error) {
      logger.error('Failed to handle stage resolution', {
        templateId: template.id,
        serverId,
        error,
      });
    }
  }

  /**
   * Get current multi-stage alert states
   */
  async getMultiStageStates(serverId?: string): Promise<MultiStageAlert[]> {
    try {
      const alerts = await prisma.alert.findMany({
        where: {
          ...(serverId && { serverId }),
          templateId: { not: null },
          status: { in: ['FIRING', 'PENDING'] },
        },
        include: {
          template: true,
        },
      });

      return alerts.map((alert) => ({
        id: alert.id,
        templateId: alert.templateId!,
        serverId: alert.serverId!,
        stage: (alert.annotations as any)?.stage || 1,
        status: alert.status === 'PENDING' ? 'pending' : 'firing',
        value: (alert.annotations as any)?.value || 0,
        threshold: 0, // Would be calculated from template
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
