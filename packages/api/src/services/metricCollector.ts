import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import axios from 'axios';
import type { Server as SocketIOServer } from 'socket.io';

// Configuration
const COLLECTION_INTERVAL_SECONDS = parseInt(process.env.METRIC_COLLECTION_INTERVAL_SECONDS || '30', 10);
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const RETENTION_DAYS = parseInt(process.env.METRIC_RETENTION_DAYS || '7', 10);

let collectionInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let socketIO: SocketIOServer | null = null;

// Metric names to collect
const METRIC_QUERIES: Record<string, (serverId: string) => string> = {
  cpu: (serverId) => `100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle", server_id="${serverId}"}[5m])) * 100)`,
  memory: (serverId) => `(1 - (node_memory_MemAvailable_bytes{server_id="${serverId}"} / node_memory_MemTotal_bytes{server_id="${serverId}"})) * 100`,
  disk: (serverId) => `(1 - (node_filesystem_avail_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"} / node_filesystem_size_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"})) * 100`,
  load1: (serverId) => `node_load1{server_id="${serverId}"}`,
  load5: (serverId) => `node_load5{server_id="${serverId}"}`,
  load15: (serverId) => `node_load15{server_id="${serverId}"}`,
  networkIn: (serverId) => `sum(irate(node_network_receive_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*"}[5m]))`,
  networkOut: (serverId) => `sum(irate(node_network_transmit_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*"}[5m]))`,
};

/**
 * Query a single metric from Prometheus
 */
async function queryMetric(query: string): Promise<number | null> {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query },
      timeout: 5000,
    });
    const data = response.data?.data?.result?.[0]?.value;
    return data ? parseFloat(data[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Collect metrics for a single server
 */
async function collectServerMetrics(serverId: string): Promise<Record<string, number | null>> {
  const results: Record<string, number | null> = {};

  await Promise.all(
    Object.entries(METRIC_QUERIES).map(async ([metricName, queryFn]) => {
      results[metricName] = await queryMetric(queryFn(serverId));
    })
  );

  return results;
}

/**
 * Store metrics in the database
 */
async function storeMetrics(serverId: string, metrics: Record<string, number | null>): Promise<void> {
  const timestamp = new Date();
  const metricsToStore = Object.entries(metrics)
    .filter(([_, value]) => value !== null)
    .map(([metricName, value]) => ({
      serverId,
      metricName,
      value: value as number,
      timestamp,
    }));

  if (metricsToStore.length === 0) return;

  await prisma.metricHistory.createMany({
    data: metricsToStore,
  });
}

/**
 * Emit real-time metrics update via Socket.IO
 */
function emitMetricsUpdate(serverId: string, metrics: Record<string, number | null>): void {
  if (!socketIO) return;

  socketIO.to(`server:${serverId}`).emit('metrics:update', {
    serverId,
    metrics,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Collect and store metrics for all servers
 */
export async function collectAllMetrics(): Promise<{
  serversProcessed: number;
  metricsStored: number;
}> {
  logger.debug('Collecting metrics for all servers...');

  try {
    // Get all online servers with node_exporter agent
    const servers = await prisma.server.findMany({
      where: {
        status: { in: ['ONLINE', 'WARNING'] },
        agents: {
          some: {
            type: 'NODE_EXPORTER',
            status: 'RUNNING',
          },
        },
      },
      select: { id: true, hostname: true },
    });

    if (servers.length === 0) {
      logger.debug('No online servers with running node-exporter found');
      return { serversProcessed: 0, metricsStored: 0 };
    }

    let totalMetricsStored = 0;

    await Promise.all(
      servers.map(async (server) => {
        try {
          const metrics = await collectServerMetrics(server.id);
          await storeMetrics(server.id, metrics);
          emitMetricsUpdate(server.id, metrics);

          const storedCount = Object.values(metrics).filter(v => v !== null).length;
          totalMetricsStored += storedCount;

          logger.debug(`Collected ${storedCount} metrics for ${server.hostname}`);
        } catch (error) {
          logger.warn(`Failed to collect metrics for server ${server.hostname}`, { error });
        }
      })
    );

    logger.info(`Metrics collection complete: ${servers.length} servers, ${totalMetricsStored} metrics`);

    return {
      serversProcessed: servers.length,
      metricsStored: totalMetricsStored,
    };
  } catch (error) {
    logger.error('Error collecting metrics', { error });
    throw error;
  }
}

/**
 * Clean up old metrics beyond retention period
 */
export async function cleanupOldMetrics(): Promise<number> {
  const retentionDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  logger.info(`Cleaning up metrics older than ${retentionDate.toISOString()}`);

  try {
    const result = await prisma.metricHistory.deleteMany({
      where: {
        timestamp: { lt: retentionDate },
      },
    });

    logger.info(`Deleted ${result.count} old metric records`);
    return result.count;
  } catch (error) {
    logger.error('Error cleaning up old metrics', { error });
    throw error;
  }
}

/**
 * Start the metric collection service
 */
export function startMetricCollector(io?: SocketIOServer): void {
  if (collectionInterval) {
    logger.warn('Metric collector already running');
    return;
  }

  if (io) {
    socketIO = io;
  }

  // Run immediately on startup
  collectAllMetrics().catch(err => {
    logger.error('Initial metric collection failed', { error: err });
  });

  // Schedule periodic collection
  const intervalMs = COLLECTION_INTERVAL_SECONDS * 1000;
  collectionInterval = setInterval(() => {
    collectAllMetrics().catch(err => {
      logger.error('Periodic metric collection failed', { error: err });
    });
  }, intervalMs);

  // Schedule daily cleanup at midnight
  const scheduleCleanup = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      cleanupOldMetrics().catch(err => {
        logger.error('Metric cleanup failed', { error: err });
      });
      // Schedule next cleanup
      cleanupInterval = setInterval(() => {
        cleanupOldMetrics().catch(err => {
          logger.error('Periodic metric cleanup failed', { error: err });
        });
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  };

  scheduleCleanup();

  // Also run initial cleanup
  cleanupOldMetrics().catch(err => {
    logger.error('Initial metric cleanup failed', { error: err });
  });

  logger.info(`Metric collector started (interval: ${COLLECTION_INTERVAL_SECONDS} seconds, retention: ${RETENTION_DAYS} days)`);
}

/**
 * Stop the metric collection service
 */
export function stopMetricCollector(): void {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  socketIO = null;
  logger.info('Metric collector stopped');
}

/**
 * Get aggregated metrics for a server over a time period
 */
export async function getAggregatedMetrics(
  serverId: string,
  metricName: string,
  startTime: Date,
  endTime: Date,
  aggregation: 'avg' | 'min' | 'max' | 'sum' = 'avg'
): Promise<number | null> {
  const result = await prisma.metricHistory.aggregate({
    where: {
      serverId,
      metricName,
      timestamp: {
        gte: startTime,
        lte: endTime,
      },
    },
    _avg: aggregation === 'avg' ? { value: true } : undefined,
    _min: aggregation === 'min' ? { value: true } : undefined,
    _max: aggregation === 'max' ? { value: true } : undefined,
    _sum: aggregation === 'sum' ? { value: true } : undefined,
  });

  switch (aggregation) {
    case 'avg': return result._avg?.value ?? null;
    case 'min': return result._min?.value ?? null;
    case 'max': return result._max?.value ?? null;
    case 'sum': return result._sum?.value ?? null;
    default: return null;
  }
}

/**
 * Get bandwidth usage summary for a server
 */
export async function getBandwidthSummary(
  serverId: string,
  period: 'hour' | 'day' | 'week' | 'month'
): Promise<{ totalIn: number; totalOut: number; avgIn: number; avgOut: number }> {
  const periodMs = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };

  const startTime = new Date(Date.now() - periodMs[period]);
  const endTime = new Date();

  const [inMetrics, outMetrics] = await Promise.all([
    prisma.metricHistory.aggregate({
      where: {
        serverId,
        metricName: 'networkIn',
        timestamp: { gte: startTime, lte: endTime },
      },
      _sum: { value: true },
      _avg: { value: true },
    }),
    prisma.metricHistory.aggregate({
      where: {
        serverId,
        metricName: 'networkOut',
        timestamp: { gte: startTime, lte: endTime },
      },
      _sum: { value: true },
      _avg: { value: true },
    }),
  ]);

  // Calculate total bytes by multiplying average rate by period duration
  // Note: stored values are bytes/second, so we multiply by the collection interval
  const collectionIntervalSeconds = COLLECTION_INTERVAL_SECONDS;
  const metricsCount = await prisma.metricHistory.count({
    where: {
      serverId,
      metricName: 'networkIn',
      timestamp: { gte: startTime, lte: endTime },
    },
  });

  return {
    totalIn: (inMetrics._sum?.value ?? 0) * collectionIntervalSeconds,
    totalOut: (outMetrics._sum?.value ?? 0) * collectionIntervalSeconds,
    avgIn: inMetrics._avg?.value ?? 0,
    avgOut: outMetrics._avg?.value ?? 0,
  };
}
