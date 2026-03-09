import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { Server as SocketIOServer } from 'socket.io';
import { dispatchNotifications } from './notificationSender';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const RECONCILIATION_INTERVAL_MINUTES = parseInt(
  process.env.ALERT_RECONCILIATION_INTERVAL_MINUTES || '5',
  10,
);

let reconciliationInterval: NodeJS.Timeout | null = null;
let socketIO: SocketIOServer | null = null;

interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: string;
  activeAt: string;
  value: string;
}

/**
 * Strip trailing comparison operator + threshold from a PromQL expression
 * to get just the metric expression. E.g.:
 *   "node_load1 > 20" → "node_load1"
 *   "(1 - (avail / total)) * 100 > 95" → "(1 - (avail / total)) * 100"
 */
export function getBaseMetricExpr(query: string): string {
  return query.replace(/\s*(>=|<=|!=|>|<|==)\s*[\d.]+\s*$/, '').trim();
}

/**
 * Query Prometheus for the current value of a metric expression,
 * optionally filtered by instance label.
 */
export async function queryCurrentValue(
  metricExpr: string,
  instance?: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    // If we have an instance, try to narrow the query
    let query = metricExpr;
    if (instance && !metricExpr.includes(instance)) {
      // For simple metric names, add instance filter
      // For complex expressions, rely on instance matching in results
      if (/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(metricExpr)) {
        query = `${metricExpr}{instance="${instance}"}`;
      }
    }

    const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const body = (await response.json()) as {
      data?: { result?: Array<{ metric: Record<string, string>; value: [number, string] }> };
    };

    const results = body.data?.result || [];
    if (results.length === 0) return null;

    // If instance is specified, find matching result
    if (instance) {
      const match = results.find(r => r.metric.instance === instance);
      if (match) return match.value[1];
    }

    // Return first result value
    return results[0].value[1];
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Fetch currently firing alerts from Prometheus
 */
async function getPrometheusAlerts(): Promise<PrometheusAlert[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${PROMETHEUS_URL}/api/v1/alerts`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Prometheus returned ${response.status}`);
    }

    const body = (await response.json()) as { data?: { alerts?: PrometheusAlert[] } };
    return body.data?.alerts || [];
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Build a composite key from alert labels to match against DB fingerprints.
 * Prometheus AlertManager generates fingerprints from the full label set,
 * so we use alertname + instance + server_id + severity + metric_name as a
 * matching heuristic since we can't reproduce the exact fingerprint algorithm.
 */
function buildAlertKey(labels: Record<string, string>): string {
  return [
    labels.alertname || '',
    labels.instance || '',
    labels.server_id || '',
    labels.severity || '',
    labels.metric_name || '',
    labels.vg || '',
    labels.mountpoint || '',
  ].join('|');
}

/**
 * Reconcile NodePrism alert state with Prometheus.
 *
 * Finds alerts marked FIRING in the DB that Prometheus no longer considers active,
 * and auto-resolves them. This catches cases where the AlertManager "resolved"
 * webhook was missed (e.g., during API restart).
 */
export async function reconcileAlerts(): Promise<{
  resolved: number;
  stillFiring: number;
}> {
  logger.info('Running alert reconciliation...');

  try {
    // 1. Get currently firing alerts from Prometheus
    const promAlerts = await getPrometheusAlerts();
    const firingKeys = new Set<string>();

    for (const pa of promAlerts) {
      if (pa.state === 'firing') {
        firingKeys.add(buildAlertKey(pa.labels));
      }
    }

    logger.debug(`Prometheus has ${firingKeys.size} firing alerts`);

    // 2. Get all FIRING alerts from the database
    const dbFiringAlerts = await prisma.alert.findMany({
      where: {
        status: 'FIRING',
      },
      include: {
        server: { select: { hostname: true, ipAddress: true } },
      },
    });

    if (dbFiringAlerts.length === 0) {
      logger.debug('No firing alerts in DB, nothing to reconcile');
      return { resolved: 0, stillFiring: 0 };
    }

    // 3. Check each DB alert against Prometheus state
    let resolved = 0;
    let stillFiring = 0;

    for (const dbAlert of dbFiringAlerts) {
      const labels = (dbAlert.labels as Record<string, string>) || {};
      const key = buildAlertKey(labels);

      if (firingKeys.has(key)) {
        stillFiring++;
        continue;
      }

      // Not in Prometheus firing set — but only auto-resolve if the alert
      // has been firing for at least 10 minutes (avoid racing with AlertManager
      // which may just be about to send the initial webhook)
      const ageMs = Date.now() - new Date(dbAlert.startsAt).getTime();
      if (ageMs < 10 * 60 * 1000) {
        stillFiring++;
        continue;
      }

      // Auto-resolve this stale alert
      await prisma.alert.update({
        where: { id: dbAlert.id },
        data: {
          status: 'RESOLVED',
          endsAt: new Date(),
        },
      });

      resolved++;

      logger.info(
        `Auto-resolved stale alert: ${labels.alertname || 'unknown'} on ${dbAlert.server?.hostname || labels.instance || 'unknown'}`,
        {
          alertId: dbAlert.id,
          fingerprint: dbAlert.fingerprint,
          alertname: labels.alertname,
          firingDuration: `${Math.round(ageMs / 60000)}m`,
        },
      );

      // Fetch current metric value from Prometheus for the resolution notification
      const annotations = { ...((dbAlert.annotations as Record<string, string>) || {}) };
      if (dbAlert.ruleId) {
        const rule = await prisma.alertRule.findUnique({
          where: { id: dbAlert.ruleId },
          select: { query: true },
        });
        if (rule?.query) {
          const baseExpr = getBaseMetricExpr(rule.query);
          const currentVal = await queryCurrentValue(baseExpr, labels.instance);
          if (currentVal !== null) {
            const formatted = isNaN(Number(currentVal))
              ? currentVal
              : Number(currentVal).toFixed(2);
            annotations.current_value = formatted;
            annotations.description = annotations.description
              ? `${annotations.description} → Current value: ${formatted}`
              : `Current value: ${formatted}`;
          }
        }
      }

      // Send resolution notification
      dispatchNotifications({
        id: dbAlert.id,
        status: 'RESOLVED',
        severity: dbAlert.severity,
        message: `[Auto-resolved] ${dbAlert.message}`,
        labels,
        annotations,
        startsAt: dbAlert.startsAt,
        endsAt: new Date(),
        serverId: dbAlert.serverId || undefined,
        ruleId: dbAlert.ruleId || undefined,
        templateId: dbAlert.templateId || undefined,
        serverHostname: dbAlert.server?.hostname,
        serverIp: dbAlert.server?.ipAddress,
      }).catch(err =>
        logger.error('Failed to send resolution notification', { error: err.message }),
      );
    }

    // 4. Emit real-time update if any alerts were resolved
    if (resolved > 0 && socketIO) {
      socketIO.emit('alerts:updated', { reconciled: resolved });
    }

    logger.info(
      `Alert reconciliation complete: ${resolved} resolved, ${stillFiring} still firing`,
    );

    return { resolved, stillFiring };
  } catch (error: any) {
    // If Prometheus is unreachable, log a warning but don't throw —
    // we don't want to break the scheduler
    if (error.name === 'AbortError' || error.cause?.code === 'ECONNREFUSED') {
      logger.warn('Alert reconciliation skipped: Prometheus unreachable');
    } else {
      logger.error('Alert reconciliation failed', { error: error.message });
    }
    return { resolved: 0, stillFiring: 0 };
  }
}

/**
 * Start the alert reconciliation scheduler
 */
export function startAlertReconciliation(io?: SocketIOServer): void {
  if (reconciliationInterval) {
    logger.warn('Alert reconciliation already running');
    return;
  }

  if (io) {
    socketIO = io;
  }

  // Run after a 30s delay on startup (let Prometheus stabilize)
  setTimeout(() => {
    reconcileAlerts().catch(err =>
      logger.error('Initial alert reconciliation failed', { error: err.message }),
    );
  }, 30000);

  // Schedule periodic reconciliation
  const intervalMs = RECONCILIATION_INTERVAL_MINUTES * 60 * 1000;
  reconciliationInterval = setInterval(() => {
    reconcileAlerts().catch(err =>
      logger.error('Periodic alert reconciliation failed', { error: err.message }),
    );
  }, intervalMs);

  logger.info(
    `Alert reconciliation started (interval: ${RECONCILIATION_INTERVAL_MINUTES} minutes)`,
  );
}

/**
 * Stop the alert reconciliation scheduler
 */
export function stopAlertReconciliation(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
    logger.info('Alert reconciliation stopped');
  }
}
