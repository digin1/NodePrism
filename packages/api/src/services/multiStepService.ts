import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import axios from 'axios';

// Map of monitorId -> interval timer
const monitorIntervals = new Map<string, NodeJS.Timeout>();

// Master polling interval that syncs monitors from DB
let masterInterval: NodeJS.Timeout | null = null;
const MASTER_POLL_SECONDS = 30;

/**
 * Resolve a JSONPath-like dot-notation path on an object.
 * E.g. "data.access_token" on { data: { access_token: "abc" } } => "abc"
 */
function resolvePath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Replace {{varName}} placeholders in a string with values from the vars map.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? vars[key] : `{{${key}}}`;
  });
}

/**
 * Interpolate variables into headers object values.
 */
function interpolateHeaders(
  headers: Record<string, string> | null | undefined,
  vars: Record<string, string>
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = interpolate(String(value), vars);
  }
  return result;
}

/**
 * Execute a single multi-step monitor: run all steps sequentially,
 * extract variables, check assertions, and record the result.
 */
export async function executeMultiStepCheck(monitorId: string): Promise<{
  status: string;
  duration: number;
  stepResults: any[];
}> {
  const monitor = await prisma.multiStepMonitor.findUnique({
    where: { id: monitorId },
    include: {
      steps: { orderBy: { stepOrder: 'asc' } },
    },
  });

  if (!monitor || !monitor.enabled) {
    clearMonitorInterval(monitorId);
    return { status: 'FAIL', duration: 0, stepResults: [] };
  }

  const vars: Record<string, string> = {};
  const stepResults: any[] = [];
  let overallStatus = 'PASS';
  const overallStart = Date.now();

  for (const step of monitor.steps) {
    const stepStart = Date.now();
    let stepStatus = 'PASS';
    let statusCode: number | null = null;
    let message = '';
    let responseBody: any = null;

    try {
      // Interpolate variables into URL, headers, and body
      const url = interpolate(step.url, vars);
      const headers = interpolateHeaders(step.headers as Record<string, string> | null, vars);
      let body = step.body ? interpolate(step.body, vars) : undefined;

      // Try to parse body as JSON if it looks like JSON
      let parsedBody: any = body;
      if (body) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body;
        }
      }

      const response = await axios({
        method: step.method as any,
        url,
        headers,
        data: parsedBody,
        timeout: monitor.timeout * 1000,
        validateStatus: () => true,
        maxRedirects: 5,
      });

      statusCode = response.status;
      responseBody = response.data;

      // Check expected status
      if (step.expectedStatus && statusCode !== step.expectedStatus) {
        stepStatus = 'FAIL';
        message = `Expected status ${step.expectedStatus}, got ${statusCode}`;
      } else {
        message = `HTTP ${statusCode}`;
      }

      // Extract variables from response
      const extractVars = step.extractVars as Record<string, string> | null;
      if (extractVars && responseBody) {
        for (const [varName, path] of Object.entries(extractVars)) {
          const value = resolvePath(responseBody, path);
          if (value !== undefined) {
            vars[varName] = String(value);
          }
        }
      }

      // Check assertions
      const assertions = step.assertions as Record<string, unknown> | null;
      if (assertions && stepStatus === 'PASS') {
        for (const [path, expected] of Object.entries(assertions)) {
          const actual = resolvePath(responseBody, path);
          if (String(actual) !== String(expected)) {
            stepStatus = 'FAIL';
            message = `Assertion failed: ${path} expected "${expected}", got "${actual}"`;
            break;
          }
        }
      }
    } catch (error: any) {
      stepStatus = 'FAIL';
      message = error.code === 'ECONNABORTED'
        ? `Timeout after ${monitor.timeout}s`
        : error.code || error.message || 'Request failed';
    }

    const stepDuration = Date.now() - stepStart;

    stepResults.push({
      stepId: step.id,
      name: step.name,
      stepOrder: step.stepOrder,
      status: stepStatus,
      statusCode,
      duration: stepDuration,
      message,
    });

    if (stepStatus === 'FAIL') {
      overallStatus = 'FAIL';
      break; // Stop executing subsequent steps on failure
    }
  }

  const totalDuration = Date.now() - overallStart;

  // Store result
  await prisma.multiStepMonitorResult.create({
    data: {
      monitorId,
      status: overallStatus,
      duration: totalDuration,
      stepResults: stepResults,
    },
  });

  logger.debug(`Multi-step check for "${monitor.name}": ${overallStatus} (${totalDuration}ms)`);

  return { status: overallStatus, duration: totalDuration, stepResults };
}

/**
 * Clear the interval for a specific monitor.
 */
function clearMonitorInterval(monitorId: string): void {
  const existing = monitorIntervals.get(monitorId);
  if (existing) {
    clearInterval(existing);
    monitorIntervals.delete(monitorId);
  }
}

/**
 * Set up the interval for a specific monitor.
 */
function setupMonitorInterval(monitorId: string, intervalSeconds: number): void {
  clearMonitorInterval(monitorId);

  const intervalMs = intervalSeconds * 1000;
  const timer = setInterval(() => {
    executeMultiStepCheck(monitorId).catch((err) => {
      logger.error(`Multi-step check failed for monitor ${monitorId}`, { error: err.message });
    });
  }, intervalMs);

  monitorIntervals.set(monitorId, timer);
}

/**
 * Sync monitors from the database: start intervals for new monitors,
 * stop intervals for removed/disabled ones.
 */
async function syncMonitors(): Promise<void> {
  try {
    const monitors = await prisma.multiStepMonitor.findMany({
      where: { enabled: true },
      select: { id: true, interval: true },
    });

    const activeIds = new Set(monitors.map((m) => m.id));

    // Remove intervals for monitors that no longer exist or are disabled
    for (const [monitorId] of monitorIntervals) {
      if (!activeIds.has(monitorId)) {
        clearMonitorInterval(monitorId);
        logger.debug(`Stopped multi-step monitoring for removed/disabled monitor ${monitorId}`);
      }
    }

    // Add intervals for new active monitors
    for (const monitor of monitors) {
      if (!monitorIntervals.has(monitor.id)) {
        // Run immediately, then set up interval
        executeMultiStepCheck(monitor.id).catch((err) => {
          logger.error(`Initial multi-step check failed for monitor ${monitor.id}`, { error: err.message });
        });
        setupMonitorInterval(monitor.id, monitor.interval);
        logger.debug(`Started multi-step monitoring for monitor ${monitor.id} (every ${monitor.interval}s)`);
      }
    }
  } catch (error: any) {
    logger.error('Error syncing multi-step monitors', { error: error.message });
  }
}

/**
 * Start the multi-step monitoring system.
 */
export function startMultiStepMonitoring(): void {
  if (masterInterval) {
    logger.warn('Multi-step monitoring already running');
    return;
  }

  logger.info('Starting multi-step monitoring service');

  // Initial sync
  syncMonitors().catch((err) => {
    logger.error('Initial multi-step monitor sync failed', { error: err.message });
  });

  // Periodic sync
  masterInterval = setInterval(() => {
    syncMonitors().catch((err) => {
      logger.error('Periodic multi-step monitor sync failed', { error: err.message });
    });
  }, MASTER_POLL_SECONDS * 1000);

  logger.info(`Multi-step monitoring started (sync every ${MASTER_POLL_SECONDS}s)`);
}

/**
 * Stop the multi-step monitoring system and clear all intervals.
 */
export function stopMultiStepMonitoring(): void {
  if (masterInterval) {
    clearInterval(masterInterval);
    masterInterval = null;
  }

  for (const [monitorId] of monitorIntervals) {
    clearMonitorInterval(monitorId);
  }

  monitorIntervals.clear();
  logger.info('Multi-step monitoring stopped');
}
