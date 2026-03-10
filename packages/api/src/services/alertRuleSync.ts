/**
 * Alert Rule Sync Service
 *
 * Makes the database the single source of truth for Prometheus alert rules.
 * - On startup: imports existing alerts.yml rules into DB (if DB is empty)
 * - On rule create/update/delete: regenerates alerts.yml from DB and reloads Prometheus
 * - On webhook: matches incoming alerts to DB rules by alertname
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { reloadPrometheus } from './targetGenerator';

// Path to the Prometheus alerts file (Docker bind-mount)
const ALERTS_YML_PATH = process.env.ALERTS_YML_PATH
  || path.resolve(__dirname, '../../../../infrastructure/docker/prometheus/alerts.yml');

interface PrometheusRule {
  alert: string;
  expr: string;
  for?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface PrometheusRuleGroup {
  name: string;
  interval?: string;
  rules: PrometheusRule[];
}

interface PrometheusAlertsConfig {
  groups: PrometheusRuleGroup[];
}

/**
 * Build Prometheus annotations from rule name + query.
 * Extracts threshold from PromQL to produce a human-readable description.
 * Must stay in sync with the copy in alerts.ts routes.
 */
function buildAnnotations(name: string, query: string): Record<string, string> {
  const thresholdMatch = query.match(/\s*(>=|<=|!=|>|<|==)\s*([\d.]+)\s*$/);
  const threshold = thresholdMatch ? thresholdMatch[2] : '';
  const opMap: Record<string, string> = { '>': 'above', '>=': 'at or above', '<': 'below', '<=': 'at or below', '==': 'equal to', '!=': 'not equal to' };
  const opWord = thresholdMatch ? (opMap[thresholdMatch[1]] || thresholdMatch[1]) : 'above';

  return {
    summary: `${name} on {{ $labels.instance }}`,
    description: threshold
      ? `${name} is ${opWord} ${threshold} (current value: {{ $value | printf "%.1f" }})`
      : `${name} triggered (current value: {{ $value | printf "%.1f" }})`,
  };
}

/**
 * Parse alerts.yml and return flat list of rules
 */
function parseAlertsYml(): PrometheusRule[] {
  try {
    const content = fs.readFileSync(ALERTS_YML_PATH, 'utf-8');
    const config = yaml.load(content) as PrometheusAlertsConfig;
    if (!config?.groups) return [];
    const rules: PrometheusRule[] = [];
    for (const group of config.groups) {
      for (const rule of group.rules || []) {
        if (rule.alert) rules.push(rule);
      }
    }
    return rules;
  } catch (err: any) {
    logger.warn(`Failed to parse alerts.yml: ${err.message}`);
    return [];
  }
}

/**
 * Map Prometheus severity string to DB enum
 */
function mapSeverity(severity?: string): 'CRITICAL' | 'WARNING' | 'INFO' | 'DEBUG' {
  const s = (severity || 'warning').toUpperCase();
  if (s === 'CRITICAL') return 'CRITICAL';
  if (s === 'INFO') return 'INFO';
  if (s === 'DEBUG') return 'DEBUG';
  return 'WARNING';
}

/**
 * Import rules from alerts.yml into database (only if DB has no rules).
 * This is a one-time bootstrap — after import, DB is the source of truth.
 */
export async function importRulesFromYml(): Promise<number> {
  const existingCount = await prisma.alertRule.count();
  if (existingCount > 0) {
    logger.info(`Alert rules already in DB (${existingCount}), skipping YAML import`);
    return 0;
  }

  const yamlRules = parseAlertsYml();
  if (yamlRules.length === 0) {
    logger.info('No rules found in alerts.yml to import');
    return 0;
  }

  let imported = 0;
  for (const rule of yamlRules) {
    try {
      await prisma.alertRule.create({
        data: {
          name: rule.alert,
          description: rule.annotations?.summary || rule.annotations?.description || '',
          query: rule.expr,
          duration: rule.for || '5m',
          severity: mapSeverity(rule.labels?.severity),
          labels: rule.labels || {},
          annotations: rule.annotations || {},
          enabled: true,
        },
      });
      imported++;
    } catch (err: any) {
      logger.warn(`Failed to import rule ${rule.alert}: ${err.message}`);
    }
  }

  logger.info(`Imported ${imported} alert rules from alerts.yml into database`);

  // Now regenerate to ensure file matches DB (normalizes format)
  await syncRulesToYml();

  return imported;
}

/**
 * Generate alerts.yml from database rules and write to disk.
 * Groups rules by severity for cleaner organization.
 */
export async function syncRulesToYml(): Promise<void> {
  const rules = await prisma.alertRule.findMany({
    orderBy: { name: 'asc' },
  });

  // Ensure all rules use standardized annotations from buildAnnotations().
  // This keeps threshold text in sync with the PromQL query and ensures
  // consistent formatting (printf "%.1f") across all notifications.
  for (const rule of rules) {
    const expected = buildAnnotations(rule.name, rule.query);
    const current = (rule.annotations as Record<string, string>) || {};
    if (current.description !== expected.description || current.summary !== expected.summary) {
      await prisma.alertRule.update({
        where: { id: rule.id },
        data: { annotations: expected },
      });
      (rule as any).annotations = expected;
      logger.info(`Normalized annotations for rule: ${rule.name}`);
    }
  }

  // Group: enabled rules go to prometheus, disabled are excluded
  const enabledRules = rules.filter(r => r.enabled);

  const prometheusRules: PrometheusRule[] = enabledRules.map(rule => {
    const promRule: PrometheusRule = {
      alert: rule.name,
      expr: rule.query,
    };
    if (rule.duration && rule.duration !== '0s') {
      promRule.for = rule.duration;
    }
    const labels = (rule.labels as Record<string, string>) || {};
    promRule.labels = {
      ...labels,
      severity: rule.severity.toLowerCase(),
      rule_id: rule.id,  // embed DB ID for matching on webhook
    };
    const annotations = (rule.annotations as Record<string, string>) || {};
    if (Object.keys(annotations).length > 0) {
      promRule.annotations = annotations;
    }
    return promRule;
  });

  const config: PrometheusAlertsConfig = {
    groups: [
      {
        name: 'nodeprism_rules',
        interval: '30s',
        rules: prometheusRules,
      },
    ],
  };

  const yamlContent = yaml.dump(config, {
    lineWidth: -1,      // don't wrap long PromQL expressions
    quotingType: '"',
    forceQuotes: false,
    noRefs: true,
  });

  try {
    // Use open + write + truncate to preserve the file inode.
    // fs.writeFileSync replaces the file (new inode), which breaks Docker bind mounts.
    const fd = fs.openSync(ALERTS_YML_PATH, 'w');
    fs.writeSync(fd, yamlContent, 0, 'utf-8');
    fs.closeSync(fd);
    logger.info(`Wrote ${enabledRules.length} alert rules to alerts.yml (${rules.length - enabledRules.length} disabled)`);

    // Reload Prometheus to pick up changes
    await reloadPrometheus();
  } catch (err: any) {
    logger.error(`Failed to write alerts.yml: ${err.message}`);
    throw err;
  }
}

/**
 * Match an incoming alert (from AlertManager webhook) to a DB rule by alertname or rule_id label.
 * Returns the ruleId if found.
 */
export async function matchAlertToRule(alertLabels: Record<string, string>): Promise<string | null> {
  // First try rule_id label (injected by syncRulesToYml)
  const ruleIdLabel = alertLabels?.rule_id;
  if (ruleIdLabel) {
    const rule = await prisma.alertRule.findUnique({ where: { id: ruleIdLabel } });
    if (rule) return rule.id;
  }

  // Fallback: match by alertname
  const alertname = alertLabels?.alertname;
  if (alertname) {
    const rule = await prisma.alertRule.findFirst({
      where: { name: alertname },
    });
    if (rule) return rule.id;
  }

  return null;
}
