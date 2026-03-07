import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { execSync } from 'child_process';

// Configuration with defaults
const HOUSEKEEPING_INTERVAL_MINUTES = parseInt(process.env.HOUSEKEEPING_INTERVAL_MINUTES || '60', 10);

// Retention defaults (days)
const EVENT_LOG_RETENTION_DAYS = parseInt(process.env.EVENT_LOG_RETENTION_DAYS || '30', 10);
const METRIC_HISTORY_RETENTION_DAYS = parseInt(process.env.METRIC_HISTORY_RETENTION_DAYS || '14', 10);
const ANOMALY_EVENT_RETENTION_DAYS = parseInt(process.env.ANOMALY_EVENT_RETENTION_DAYS || '30', 10);
const RESOLVED_ALERT_RETENTION_DAYS = parseInt(process.env.RESOLVED_ALERT_RETENTION_DAYS || '90', 10);

// Disk thresholds (percentage used)
const DISK_WARNING_THRESHOLD = parseInt(process.env.DISK_WARNING_THRESHOLD || '75', 10);
const DISK_CRITICAL_THRESHOLD = parseInt(process.env.DISK_CRITICAL_THRESHOLD || '90', 10);

let housekeepingInterval: NodeJS.Timeout | null = null;

interface DiskUsage {
  totalGB: number;
  usedGB: number;
  availableGB: number;
  usedPercent: number;
  mountPoint: string;
}

/**
 * Get disk usage for the root filesystem
 */
export function getDiskUsage(): DiskUsage {
  try {
    const output = execSync("df -BG / | tail -1", { encoding: 'utf-8' }).trim();
    const parts = output.split(/\s+/);
    // Format: Filesystem 1G-blocks Used Available Use% Mounted
    const totalGB = parseInt(parts[1]) || 0;
    const usedGB = parseInt(parts[2]) || 0;
    const availableGB = parseInt(parts[3]) || 0;
    const usedPercent = parseInt(parts[4]) || 0;
    const mountPoint = parts[5] || '/';

    return { totalGB, usedGB, availableGB, usedPercent, mountPoint };
  } catch {
    logger.warn('Could not determine disk usage');
    return { totalGB: 0, usedGB: 0, availableGB: 0, usedPercent: 0, mountPoint: '/' };
  }
}

/**
 * Calculate retention multiplier based on disk pressure
 * Returns a value between 0.25 (aggressive cleanup) and 1.0 (normal)
 */
function getRetentionMultiplier(disk: DiskUsage): number {
  if (disk.usedPercent >= DISK_CRITICAL_THRESHOLD) {
    return 0.25; // Keep only 25% of normal retention
  }
  if (disk.usedPercent >= DISK_WARNING_THRESHOLD) {
    // Linear scale: 75% disk = 0.75 multiplier, 90% disk = 0.25
    const range = DISK_CRITICAL_THRESHOLD - DISK_WARNING_THRESHOLD;
    const pressure = disk.usedPercent - DISK_WARNING_THRESHOLD;
    return Math.max(0.25, 1.0 - (pressure / range) * 0.75);
  }
  return 1.0;
}

/**
 * Prune old event logs
 */
async function pruneEventLogs(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.eventLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Prune old metric history
 */
async function pruneMetricHistory(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.metricHistory.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Prune old anomaly events (only closed ones)
 */
async function pruneAnomalyEvents(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.anomalyEvent.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      endedAt: { not: null }, // Only prune closed events
    },
  });
  return result.count;
}

/**
 * Prune old resolved/acknowledged alerts
 */
async function pruneResolvedAlerts(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.alert.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      status: { in: ['RESOLVED', 'ACKNOWLEDGED', 'CLEAR'] },
    },
  });
  return result.count;
}

/**
 * Prune stale virtual containers not seen recently
 */
async function pruneStaleContainers(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  const result = await prisma.virtualContainer.deleteMany({
    where: {
      status: 'stopped',
      lastSeen: { lt: cutoff },
    },
  });
  return result.count;
}

/**
 * Prune Docker resources
 */
function pruneDockerResources(aggressive: boolean): string {
  const results: string[] = [];
  try {
    // Always prune dangling images and stopped containers
    execSync('docker image prune -f 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 30000,
    });
    results.push('dangling images pruned');

    // Always prune build cache older than 24h
    execSync('docker builder prune -f --filter until=24h 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 30000,
    });
    results.push('old build cache pruned');

    if (aggressive) {
      // Under disk pressure: aggressively prune build cache, keep minimal
      execSync('docker builder prune -f --keep-storage=500m 2>/dev/null || true', {
        encoding: 'utf-8',
        timeout: 30000,
      });
      // Also prune unused images (not just dangling)
      execSync('docker image prune -a -f --filter until=168h 2>/dev/null || true', {
        encoding: 'utf-8',
        timeout: 30000,
      });
      results.push('aggressive cleanup (unused images + build cache)');
    }

    return results.join('; ');
  } catch {
    return 'Docker prune skipped (not available or failed)';
  }
}

/**
 * Run a full housekeeping cycle
 */
export async function runHousekeeping(): Promise<void> {
  const startTime = Date.now();
  const disk = getDiskUsage();
  const multiplier = getRetentionMultiplier(disk);

  logger.info('Housekeeping started', {
    disk: `${disk.usedPercent}% used (${disk.availableGB}GB free)`,
    retentionMultiplier: multiplier.toFixed(2),
  });

  // Calculate adjusted retention periods
  const eventLogDays = Math.max(1, Math.floor(EVENT_LOG_RETENTION_DAYS * multiplier));
  const metricHistoryDays = Math.max(1, Math.floor(METRIC_HISTORY_RETENTION_DAYS * multiplier));
  const anomalyDays = Math.max(1, Math.floor(ANOMALY_EVENT_RETENTION_DAYS * multiplier));
  const alertDays = Math.max(7, Math.floor(RESOLVED_ALERT_RETENTION_DAYS * multiplier));

  if (multiplier < 1.0) {
    logger.warn('Disk pressure detected — reducing retention periods', {
      diskUsed: `${disk.usedPercent}%`,
      eventLogDays,
      metricHistoryDays,
      anomalyDays,
      alertDays,
    });
  }

  try {
    // Run all pruning operations
    const [eventLogs, metricHistory, anomalyEvents, alerts, containers] = await Promise.all([
      pruneEventLogs(eventLogDays),
      pruneMetricHistory(metricHistoryDays),
      pruneAnomalyEvents(anomalyDays),
      pruneResolvedAlerts(alertDays),
      pruneStaleContainers(),
    ]);

    const totalPruned = eventLogs + metricHistory + anomalyEvents + alerts + containers;

    if (totalPruned > 0) {
      logger.info('Database pruning complete', {
        eventLogs,
        metricHistory,
        anomalyEvents,
        alerts,
        containers,
      });
    }

    // Docker cleanup (always prune stale build cache; aggressive when disk is tight)
    const dockerResult = pruneDockerResources(disk.usedPercent >= DISK_WARNING_THRESHOLD);
    logger.info('Docker cleanup', { result: dockerResult });

    // PostgreSQL VACUUM when we deleted a lot
    if (totalPruned > 1000) {
      try {
        await prisma.$executeRawUnsafe('VACUUM (VERBOSE, ANALYZE) event_logs');
        await prisma.$executeRawUnsafe('VACUUM (VERBOSE, ANALYZE) metric_history');
        logger.info('PostgreSQL VACUUM completed for high-churn tables');
      } catch (err) {
        logger.warn('VACUUM failed (non-critical)', { error: err });
      }
    }

    // Log disk status after cleanup
    const diskAfter = getDiskUsage();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.info('Housekeeping complete', {
      elapsed: `${elapsed}s`,
      pruned: totalPruned,
      diskBefore: `${disk.usedPercent}%`,
      diskAfter: `${diskAfter.usedPercent}%`,
      freedGB: Math.max(0, disk.usedGB - diskAfter.usedGB),
    });

    // Emit critical disk warning
    if (diskAfter.usedPercent >= DISK_CRITICAL_THRESHOLD) {
      logger.error('CRITICAL: Disk usage above threshold after cleanup', {
        usedPercent: diskAfter.usedPercent,
        availableGB: diskAfter.availableGB,
      });
    }
  } catch (error) {
    logger.error('Housekeeping failed', { error });
  }
}

/**
 * Start the housekeeping scheduler
 */
export function startHousekeeping(): void {
  if (housekeepingInterval) {
    logger.warn('Housekeeping already running');
    return;
  }

  // Run initial check after a short delay (let other services start first)
  setTimeout(() => {
    runHousekeeping().catch(err => {
      logger.error('Initial housekeeping failed', { error: err });
    });
  }, 30000);

  // Schedule periodic runs
  const intervalMs = HOUSEKEEPING_INTERVAL_MINUTES * 60 * 1000;
  housekeepingInterval = setInterval(() => {
    runHousekeeping().catch(err => {
      logger.error('Periodic housekeeping failed', { error: err });
    });
  }, intervalMs);

  logger.info(`Housekeeping started (interval: ${HOUSEKEEPING_INTERVAL_MINUTES} minutes)`);
}

/**
 * Stop the housekeeping scheduler
 */
export function stopHousekeeping(): void {
  if (housekeepingInterval) {
    clearInterval(housekeepingInterval);
    housekeepingInterval = null;
    logger.info('Housekeeping stopped');
  }
}
