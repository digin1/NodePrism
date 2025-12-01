import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export interface AlertTemplateMatch {
  templateId: string;
  serverId: string;
  labels: Record<string, string>;
  hostLabels: Record<string, string>;
}

export interface AlertCondition {
  condition: string;
  hysteresis?: {
    trigger: number;
    clear: number;
  };
}

export interface AlertTemplateConfig {
  id: string;
  name: string;
  query: string;
  calc?: string;
  units?: string;
  warn: AlertCondition;
  crit: AlertCondition;
  every: string;
  for: string;
  actions?: any[];
}

/**
 * Alert Template Service
 * Handles template matching and evaluation logic
 */
export class AlertTemplateService {
  /**
   * Find templates that match a given server and labels
   */
  async findMatchingTemplates(
    serverId: string,
    labels: Record<string, string> = {}
  ): Promise<AlertTemplateConfig[]> {
    try {
      const templates = await prisma.alertTemplate.findMany({
        where: { enabled: true },
      });

      const matchingTemplates: AlertTemplateConfig[] = [];

      for (const template of templates) {
        if (await this.matchesTemplate(template, serverId, labels)) {
          matchingTemplates.push(this.convertToConfig(template));
        }
      }

      return matchingTemplates;
    } catch (error) {
      logger.error('Failed to find matching templates', { serverId, error });
      return [];
    }
  }

  /**
   * Check if a template matches the given server and labels
   */
  private async matchesTemplate(
    template: any,
    serverId: string,
    labels: Record<string, string>
  ): Promise<boolean> {
    try {
      // Get server details for host label matching
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { environment: true, region: true, tags: true },
      });

      if (!server) {
        return false;
      }

      // Check matchLabels (Prometheus labels)
      if (template.matchLabels) {
        const matchLabels = template.matchLabels as Record<string, string>;
        for (const [key, value] of Object.entries(matchLabels)) {
          if (labels[key] !== value) {
            return false;
          }
        }
      }

      // Check matchHostLabels (server metadata)
      if (template.matchHostLabels) {
        const matchHostLabels = template.matchHostLabels as Record<string, string>;
        for (const [key, value] of Object.entries(matchHostLabels)) {
          let hostValue: string | undefined;

          switch (key) {
            case 'environment':
              hostValue = server.environment || undefined;
              break;
            case 'region':
              hostValue = server.region || undefined;
              break;
            case 'tag':
              // Check if any tag matches
              hostValue = server.tags.includes(value) ? value : undefined;
              break;
            default:
              // Custom metadata
              hostValue = (server as any)[key] || undefined;
          }

          if (hostValue !== value) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check template match', { templateId: template.id, serverId, error });
      return false;
    }
  }

  /**
   * Convert database template to config object
   */
  private convertToConfig(template: any): AlertTemplateConfig {
    return {
      id: template.id,
      name: template.name,
      query: template.query,
      calc: template.calc,
      units: template.units,
      warn: template.warnCondition as AlertCondition,
      crit: template.critCondition as AlertCondition,
      every: template.every,
      for: template.for,
      actions: template.actions,
    };
  }

  /**
   * Evaluate hysteresis condition
   */
  evaluateHysteresis(
    condition: AlertCondition,
    currentValue: number,
    previousState: 'clear' | 'warning' | 'critical'
  ): boolean {
    const { condition: expr, hysteresis } = condition;

    // Simple expression evaluation (for now, just basic comparisons)
    const result = this.evaluateCondition(expr, currentValue);

    if (!hysteresis) {
      return result;
    }

    // Apply hysteresis
    const { trigger, clear } = hysteresis;

    if (previousState === 'clear') {
      // Need to exceed trigger threshold
      return result && currentValue >= trigger;
    } else {
      // Need to drop below clear threshold
      return result && currentValue >= clear;
    }
  }

  /**
   * Simple condition evaluation (placeholder - would need proper PromQL/expression parser)
   */
  private evaluateCondition(expression: string, value: number): boolean {
    // Very basic implementation - in reality, this would parse PromQL expressions
    // For now, assume simple forms like "$value > 80"

    try {
      // Replace $value with actual value
      const expr = expression.replace(/\$value/g, value.toString());

      // Simple evaluation (this is unsafe and should be replaced with proper parsing)
      // eslint-disable-next-line no-eval
      return eval(expr) as boolean;
    } catch {
      logger.warn('Failed to evaluate condition', { expression, value });
      return false;
    }
  }

  /**
   * Get all enabled templates
   */
  async getAllTemplates(): Promise<AlertTemplateConfig[]> {
    try {
      const templates = await prisma.alertTemplate.findMany({
        where: { enabled: true },
        orderBy: { name: 'asc' },
      });

      return templates.map(this.convertToConfig);
    } catch (error) {
      logger.error('Failed to get all templates', { error });
      return [];
    }
  }

  /**
   * Create a new alert template
   */
  async createTemplate(data: {
    name: string;
    description?: string;
    matchLabels?: Record<string, string>;
    matchHostLabels?: Record<string, string>;
    query: string;
    calc?: string;
    units?: string;
    warnCondition: AlertCondition;
    critCondition: AlertCondition;
    every?: string;
    for?: string;
    actions?: any[];
  }): Promise<AlertTemplateConfig | null> {
    try {
      const template = await prisma.alertTemplate.create({
        data: {
          name: data.name,
          description: data.description,
          matchLabels: data.matchLabels,
          matchHostLabels: data.matchHostLabels,
          query: data.query,
          calc: data.calc,
          units: data.units,
          warnCondition: data.warnCondition as any,
          critCondition: data.critCondition as any,
          every: data.every || '1m',
          for: data.for || '5m',
          actions: data.actions,
        },
      });

      logger.info('Alert template created', { id: template.id, name: template.name });
      return this.convertToConfig(template);
    } catch (error) {
      logger.error('Failed to create alert template', { error });
      return null;
    }
  }
}
