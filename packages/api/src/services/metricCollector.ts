import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import axios from 'axios';
import type { Server as SocketIOServer } from 'socket.io';
import { AgentType } from '@prisma/client';
import { MultiStageAlertProcessor } from './multiStageAlertProcessor';

// Configuration
const COLLECTION_INTERVAL_SECONDS = parseInt(process.env.METRIC_COLLECTION_INTERVAL_SECONDS || '30', 10);
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const RETENTION_DAYS = parseInt(process.env.METRIC_RETENTION_DAYS || '7', 10);

let collectionInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let socketIO: SocketIOServer | null = null;
const alertProcessor = new MultiStageAlertProcessor();

// Node exporter metric queries (always collected)
const NODE_METRIC_QUERIES: Record<string, (serverId: string) => string> = {
  cpu: (serverId) => `100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle", server_id="${serverId}"}[5m])) * 100)`,
  memory: (serverId) => `(1 - (node_memory_MemAvailable_bytes{server_id="${serverId}"} / node_memory_MemTotal_bytes{server_id="${serverId}"})) * 100`,
  disk: (serverId) => `(1 - (node_filesystem_avail_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"} / node_filesystem_size_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"})) * 100`,
  load1: (serverId) => `node_load1{server_id="${serverId}"}`,
  load5: (serverId) => `node_load5{server_id="${serverId}"}`,
  load15: (serverId) => `node_load15{server_id="${serverId}"}`,
  networkIn: (serverId) => `sum(irate(node_network_receive_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*|eno.*|venet.*|bond.*"}[5m]))`,
  networkOut: (serverId) => `sum(irate(node_network_transmit_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*|eno.*|venet.*|bond.*"}[5m]))`,
};

// MySQL exporter metric queries (only collected when MYSQL_EXPORTER agent is running)
const MYSQL_METRIC_QUERIES: Record<string, (serverId: string) => string> = {
  mysqlConnections: (serverId) => `mysql_global_status_threads_connected{server_id="${serverId}"}`,
  mysqlMaxConnections: (serverId) => `mysql_global_variables_max_connections{server_id="${serverId}"}`,
  mysqlQueriesPerSec: (serverId) => `rate(mysql_global_status_queries{server_id="${serverId}"}[1m])`,
  mysqlSlowQueries: (serverId) => `mysql_global_status_slow_queries{server_id="${serverId}"}`,
  mysqlUptime: (serverId) => `mysql_global_status_uptime{server_id="${serverId}"}`,
  mysqlBufferPoolSize: (serverId) => `mysql_global_variables_innodb_buffer_pool_size{server_id="${serverId}"}`,
  mysqlBufferPoolUsed: (serverId) => `mysql_global_status_innodb_buffer_pool_bytes_data{server_id="${serverId}"}`,
};

// Combined for backward compatibility
const METRIC_QUERIES: Record<string, (serverId: string) => string> = {
  ...NODE_METRIC_QUERIES,
};

// In-memory cache of last successful metric values per server
const metricCache = new Map<string, { value: number; timestamp: number }>();
const CACHE_TTL_MS = 120_000; // 2 minutes

// Track which servers have had their OS info populated (only query once per startup)
const osInfoPopulated = new Set<string>();

/**
 * Fetch OS and hardware info from Prometheus and store in server metadata.
 * Only runs once per server per process lifetime.
 */
async function populateServerOsInfo(serverId: string): Promise<void> {
  if (osInfoPopulated.has(serverId)) return;
  osInfoPopulated.add(serverId);

  try {
    // Fetch node_uname_info, node_os_info, CPU count, and memory total in parallel
    const [unameRes, osRes, cpuRes, memRes] = await Promise.all([
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: `node_uname_info{server_id="${serverId}"}` },
        timeout: 5000,
      }).catch(() => null),
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: `node_os_info{server_id="${serverId}"}` },
        timeout: 5000,
      }).catch(() => null),
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: `count(node_cpu_seconds_total{server_id="${serverId}",mode="idle"})` },
        timeout: 5000,
      }).catch(() => null),
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: `node_memory_MemTotal_bytes{server_id="${serverId}"}` },
        timeout: 5000,
      }).catch(() => null),
    ]);

    const uname = unameRes?.data?.data?.result?.[0]?.metric || {};
    const osInfo = osRes?.data?.data?.result?.[0]?.metric || {};
    const cpuCores = cpuRes?.data?.data?.result?.[0]?.value?.[1]
      ? parseInt(cpuRes.data.data.result[0].value[1])
      : null;
    const memTotal = memRes?.data?.data?.result?.[0]?.value?.[1]
      ? parseInt(memRes.data.data.result[0].value[1])
      : null;

    // Only update if we got at least some info
    if (!uname.sysname && !osInfo.pretty_name) return;

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { metadata: true },
    });

    const existingMetadata = (server?.metadata as Record<string, unknown>) || {};

    const metadata = {
      ...existingMetadata,
      os: {
        distro: osInfo.pretty_name || osInfo.name || uname.sysname || null,
        distroId: osInfo.id || null,
        distroVersion: osInfo.version_id || null,
        distroCodename: osInfo.version_codename || null,
        kernel: uname.release || null,
        arch: uname.machine || null,
        platform: uname.sysname || null,
      },
      hardware: {
        cpuCores: cpuCores,
        memoryTotal: memTotal,
      },
    };

    await prisma.server.update({
      where: { id: serverId },
      data: { metadata },
    });

    logger.info(`Populated OS info for server ${serverId}: ${osInfo.pretty_name || uname.sysname}`);
  } catch (error) {
    // Don't prevent future retries on error
    osInfoPopulated.delete(serverId);
    logger.debug(`Failed to populate OS info for server ${serverId}`, { error });
  }
}

/**
 * Query a single metric from Prometheus.
 * On failure, returns cached value if available within TTL.
 */
async function queryMetric(query: string): Promise<number | null> {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query },
      timeout: 5000,
    });
    const data = response.data?.data?.result?.[0]?.value;
    if (data) {
      const value = parseFloat(data[1]);
      metricCache.set(query, { value, timestamp: Date.now() });
      return value;
    }
    return null;
  } catch {
    // Return cached value if still fresh
    const cached = metricCache.get(query);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug('Serving cached metric value (Prometheus unavailable)', { query });
      return cached.value;
    }
    return null;
  }
}

/**
 * Check if a server has a specific agent type registered (regardless of status)
 * This is used to determine if we should try to collect metrics for that agent type
 */
async function hasAgentRegistered(serverId: string, agentType: AgentType): Promise<boolean> {
  const agent = await prisma.agent.findFirst({
    where: {
      serverId,
      type: agentType,
    },
  });
  return agent !== null;
}

/**
 * Collect metrics for a single server
 */
async function collectServerMetrics(serverId: string): Promise<Record<string, number | null>> {
  const results: Record<string, number | null> = {};

  // Always collect node exporter metrics
  await Promise.all(
    Object.entries(NODE_METRIC_QUERIES).map(async ([metricName, queryFn]) => {
      results[metricName] = await queryMetric(queryFn(serverId));
    })
  );

  // Collect MySQL metrics if MYSQL_EXPORTER is registered (regardless of current status)
  // This ensures we can recover agents that were incorrectly marked as stopped
  const hasMySQLExporter = await hasAgentRegistered(serverId, AgentType.MYSQL_EXPORTER);
  if (hasMySQLExporter) {
    await Promise.all(
      Object.entries(MYSQL_METRIC_QUERIES).map(async ([metricName, queryFn]) => {
        results[metricName] = await queryMetric(queryFn(serverId));
      })
    );
  }

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
 * Update passive exporter agent's last health check when metrics are successfully collected
 * This prevents the heartbeat cleanup from marking passive agents as STOPPED
 */
async function updatePassiveAgentHealthCheck(serverId: string, agentType: AgentType): Promise<void> {
  try {
    await prisma.agent.updateMany({
      where: {
        serverId,
        type: agentType,
      },
      data: {
        lastHealthCheck: new Date(),
        status: 'RUNNING', // Ensure agent is marked as running if we're collecting metrics
      },
    });
  } catch (error) {
    logger.warn(`Failed to update ${agentType} health check`, { serverId, error });
  }
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
    // Get all online servers with node_exporter agent (include any status since we'll verify by collecting)
    const servers = await prisma.server.findMany({
      where: {
        status: { in: ['ONLINE', 'WARNING'] },
        agents: {
          some: {
            type: 'NODE_EXPORTER',
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
          const storedCount = Object.values(metrics).filter(v => v !== null).length;

          if (storedCount > 0) {
            await storeMetrics(server.id, metrics);
            emitMetricsUpdate(server.id, metrics);
            totalMetricsStored += storedCount;

            // Update NODE_EXPORTER health check since we successfully collected node metrics
            // This prevents heartbeat cleanup from marking passive agents as STOPPED
            await updatePassiveAgentHealthCheck(server.id, AgentType.NODE_EXPORTER);

            // If we collected MySQL metrics, update MYSQL_EXPORTER health check too
            const hasMySQLMetrics = metrics.mysqlConnections !== null || metrics.mysqlQueriesPerSec !== null;
            if (hasMySQLMetrics) {
              await updatePassiveAgentHealthCheck(server.id, AgentType.MYSQL_EXPORTER);
            }

            // Populate OS info from Prometheus (only once per server per startup)
            await populateServerOsInfo(server.id);

            logger.debug(`Collected ${storedCount} metrics for ${server.hostname}`);
          }

          // Evaluate alert templates against this server (non-blocking)
          alertProcessor.evaluateMultiStageAlerts(server.id).catch(err => {
            logger.warn(`Alert evaluation failed for ${server.hostname}`, { error: err });
          });
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
