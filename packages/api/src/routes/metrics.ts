import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { logger } from '../utils/logger';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { getBandwidthSummary, getAggregatedMetrics } from '../services/metricCollector';

const router: ExpressRouter = Router();

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

// Proxy to Prometheus API
router.get('/query', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, time } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
      });
    }

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query, time },
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    logger.error('Prometheus query error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to query Prometheus',
      details: error.message,
    });
  }
});

// Query range (for graphs)
router.get('/query_range', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, start, end, step } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
      });
    }

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
      params: {
        query,
        start: start || Math.floor(Date.now() / 1000) - 3600,
        end: end || Math.floor(Date.now() / 1000),
        step: step || '15s',
      },
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    logger.error('Prometheus query_range error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to query Prometheus',
      details: error.message,
    });
  }
});

// Get server metrics summary
router.get('/server/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    // Common PromQL queries for server metrics
    const queries: Record<string, string> = {
      cpu: `100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle", server_id="${serverId}"}[5m])) * 100)`,
      memory: `(1 - (node_memory_MemAvailable_bytes{server_id="${serverId}"} / node_memory_MemTotal_bytes{server_id="${serverId}"})) * 100`,
      memoryTotal: `node_memory_MemTotal_bytes{server_id="${serverId}"}`,
      memoryAvailable: `node_memory_MemAvailable_bytes{server_id="${serverId}"}`,
      disk: `(1 - (node_filesystem_avail_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"} / node_filesystem_size_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"})) * 100`,
      diskTotal: `node_filesystem_size_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"}`,
      diskAvailable: `node_filesystem_avail_bytes{server_id="${serverId}", mountpoint="/", fstype!~"tmpfs|fuse.lxcfs"}`,
      networkIn: `sum(irate(node_network_receive_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*|eno.*|venet.*|bond.*"}[5m]))`,
      networkOut: `sum(irate(node_network_transmit_bytes_total{server_id="${serverId}", device=~"eth.*|ens.*|enp.*|eno.*|venet.*|bond.*"}[5m]))`,
      load1: `node_load1{server_id="${serverId}"}`,
      load5: `node_load5{server_id="${serverId}"}`,
      load15: `node_load15{server_id="${serverId}"}`,
    };

    // Check if server has a MySQL exporter registered (regardless of status)
    // We try to fetch metrics even if agent is marked stopped - it may have recovered
    const mysqlAgent = await prisma.agent.findFirst({
      where: {
        serverId,
        type: 'MYSQL_EXPORTER',
      },
    });

    // Add MySQL metrics if MySQL exporter is registered
    if (mysqlAgent) {
      queries.mysqlConnections = `mysql_global_status_threads_connected{server_id="${serverId}"}`;
      queries.mysqlMaxConnections = `mysql_global_variables_max_connections{server_id="${serverId}"}`;
      queries.mysqlQueriesPerSec = `rate(mysql_global_status_queries{server_id="${serverId}"}[1m])`;
      queries.mysqlSlowQueries = `mysql_global_status_slow_queries{server_id="${serverId}"}`;
      queries.mysqlUptime = `mysql_global_status_uptime{server_id="${serverId}"}`;
      queries.mysqlBufferPoolSize = `mysql_global_variables_innodb_buffer_pool_size{server_id="${serverId}"}`;
      queries.mysqlBufferPoolUsed = `mysql_global_status_innodb_buffer_pool_bytes_data{server_id="${serverId}"}`;
    }

    // Add LiteSpeed metrics if LiteSpeed exporter is registered
    const lsAgent = await prisma.agent.findFirst({
      where: { serverId, type: 'LITESPEED_EXPORTER' },
    });
    if (lsAgent) {
      queries.lsConnections = `litespeed_plainconn{server_id="${serverId}"} + litespeed_sslconn{server_id="${serverId}"}`;
      queries.lsSSLConnections = `litespeed_sslconn{server_id="${serverId}"}`;
      queries.lsMaxConnections = `litespeed_maxconn{server_id="${serverId}"}`;
      queries.lsReqPerSec = `litespeed_req_per_sec{server_id="${serverId}"}`;
      queries.lsReqProcessing = `litespeed_req_processing{server_id="${serverId}"}`;
      queries.lsTotalRequests = `litespeed_tot_reqs{server_id="${serverId}"}`;
      queries.lsBpsIn = `litespeed_bps_in{server_id="${serverId}"} + litespeed_ssl_bps_in{server_id="${serverId}"}`;
      queries.lsBpsOut = `litespeed_bps_out{server_id="${serverId}"} + litespeed_ssl_bps_out{server_id="${serverId}"}`;
      queries.lsCacheHitsPerSec = `litespeed_pub_cache_hits_per_sec{server_id="${serverId}"}`;
      queries.lsStaticHitsPerSec = `litespeed_static_hits_per_sec{server_id="${serverId}"}`;
    }

    // Add Exim metrics if Exim exporter is registered
    const eximAgent = await prisma.agent.findFirst({
      where: { serverId, type: 'EXIM_EXPORTER' },
    });
    if (eximAgent) {
      queries.eximQueueSize = `exim_queue_size{server_id="${serverId}"}`;
      queries.eximQueueFrozen = `exim_queue_frozen{server_id="${serverId}"}`;
      queries.eximDeliveriesToday = `exim_deliveries_today{server_id="${serverId}"}`;
      queries.eximReceivedToday = `exim_received_today{server_id="${serverId}"}`;
      queries.eximBouncesToday = `exim_bounces_today{server_id="${serverId}"}`;
      queries.eximRejectedToday = `exim_rejections_today{server_id="${serverId}"}`;
      queries.eximDeferredToday = `exim_deferred_today{server_id="${serverId}"}`;
    }

    // Add cPanel metrics if cPanel exporter is registered
    const cpanelAgent = await prisma.agent.findFirst({
      where: { serverId, type: 'CPANEL_EXPORTER' },
    });
    if (cpanelAgent) {
      queries.cpanelAccounts = `cpanel_accounts_total{server_id="${serverId}"}`;
      queries.cpanelAccountsActive = `cpanel_accounts_active{server_id="${serverId}"}`;
      queries.cpanelAccountsSuspended = `cpanel_accounts_suspended{server_id="${serverId}"}`;
      queries.cpanelDomains = `cpanel_domains_total{server_id="${serverId}"}`;
    }

    const results: Record<string, any> = {};

    // Execute queries in parallel
    await Promise.all(
      Object.entries(queries).map(async ([key, query]) => {
        try {
          const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
            params: { query },
          });
          const data = response.data?.data?.result?.[0]?.value;
          results[key] = data ? parseFloat(data[1]) : null;
        } catch {
          results[key] = null;
        }
      })
    );

    res.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    logger.error('Server metrics error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch server metrics',
    });
  }
});

// Get targets status
router.get('/targets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/targets`);

    const targets = response.data?.data?.activeTargets || [];
    const summary = {
      total: targets.length,
      up: targets.filter((t: any) => t.health === 'up').length,
      down: targets.filter((t: any) => t.health === 'down').length,
      unknown: targets.filter((t: any) => t.health === 'unknown').length,
    };

    res.json({
      success: true,
      data: {
        summary,
        targets,
      },
    });
  } catch (error: any) {
    logger.error('Prometheus targets error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch targets',
    });
  }
});

// Get Prometheus rules (alerts)
router.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules`);

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rules',
    });
  }
});

// ==================== HISTORICAL METRICS ENDPOINTS ====================

// Get historical metrics for a server (for charts)
router.get('/server/:serverId/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const {
      metric,
      period = '1h',
      limit = '100'
    } = req.query as { metric?: string; period?: string; limit?: string };

    // Calculate time range based on period
    const periodMs: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };

    const ms = periodMs[period] || periodMs['1h'];
    const startTime = new Date(Date.now() - ms);

    const whereClause: any = {
      serverId,
      timestamp: { gte: startTime },
    };

    if (metric) {
      whereClause.metricName = metric;
    }

    const metrics = await prisma.metricHistory.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' },
      take: parseInt(limit, 10),
      select: {
        metricName: true,
        value: true,
        timestamp: true,
      },
    });

    // Group by metric name for easier charting
    const grouped: Record<string, Array<{ value: number; timestamp: string }>> = {};
    for (const m of metrics) {
      if (!grouped[m.metricName]) {
        grouped[m.metricName] = [];
      }
      grouped[m.metricName].push({
        value: m.value,
        timestamp: m.timestamp.toISOString(),
      });
    }

    res.json({
      success: true,
      data: grouped,
    });
  } catch (error: any) {
    logger.error('Historical metrics error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical metrics',
    });
  }
});

// Get bandwidth summary for a server
router.get('/server/:serverId/bandwidth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const { period = 'day' } = req.query as { period?: 'hour' | 'day' | 'week' | 'month' };

    const summary = await getBandwidthSummary(serverId, period);

    res.json({
      success: true,
      data: {
        period,
        ...summary,
      },
    });
  } catch (error: any) {
    logger.error('Bandwidth summary error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bandwidth summary',
    });
  }
});

// Get all bandwidth summaries (all periods)
router.get('/server/:serverId/bandwidth/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    const [hour, day, week, month] = await Promise.all([
      getBandwidthSummary(serverId, 'hour'),
      getBandwidthSummary(serverId, 'day'),
      getBandwidthSummary(serverId, 'week'),
      getBandwidthSummary(serverId, 'month'),
    ]);

    res.json({
      success: true,
      data: {
        hour,
        day,
        week,
        month,
      },
    });
  } catch (error: any) {
    logger.error('Bandwidth summary all error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bandwidth summaries',
    });
  }
});

// Get aggregated metric value
router.get('/server/:serverId/aggregate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const {
      metric,
      aggregation = 'avg',
      startTime,
      endTime
    } = req.query as {
      metric: string;
      aggregation?: 'avg' | 'min' | 'max' | 'sum';
      startTime?: string;
      endTime?: string;
    };

    if (!metric) {
      return res.status(400).json({
        success: false,
        error: 'metric parameter is required',
      });
    }

    const start = startTime ? new Date(startTime) : new Date(Date.now() - 60 * 60 * 1000);
    const end = endTime ? new Date(endTime) : new Date();

    const value = await getAggregatedMetrics(serverId, metric, start, end, aggregation);

    res.json({
      success: true,
      data: {
        metric,
        aggregation,
        value,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Aggregated metric error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch aggregated metric',
    });
  }
});

// Get latest metrics for charting (combined endpoint for efficiency)
router.get('/server/:serverId/chart-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const { period = '1h' } = req.query as { period?: string };

    const periodMs: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };

    const ms = periodMs[period] || periodMs['1h'];
    const startTime = new Date(Date.now() - ms);

    // Get all metrics for the time range
    const metrics = await prisma.metricHistory.findMany({
      where: {
        serverId,
        timestamp: { gte: startTime },
      },
      orderBy: { timestamp: 'asc' },
      select: {
        metricName: true,
        value: true,
        timestamp: true,
      },
    });

    // Transform into chart-friendly format: array of objects with timestamp and all metrics
    const timeMap = new Map<string, Record<string, number>>();

    for (const m of metrics) {
      const timeKey = m.timestamp.toISOString();
      if (!timeMap.has(timeKey)) {
        timeMap.set(timeKey, { timestamp: m.timestamp.getTime() });
      }
      timeMap.get(timeKey)![m.metricName] = m.value;
    }

    // Convert to array sorted by timestamp
    const chartData = Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    res.json({
      success: true,
      data: chartData,
    });
  } catch (error: any) {
    logger.error('Chart data error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chart data',
    });
  }
});

// Get cPanel account details from Prometheus
router.get('/server/:serverId/cpanel-accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    // Query per-account disk usage and addon domains from Prometheus
    const [diskRes, domainsRes] = await Promise.all([
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: `cpanel_account_disk_usage_bytes{server_id="${serverId}"}` },
      }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: `cpanel_account_addon_domains{server_id="${serverId}"}` },
      }),
    ]);

    const diskData = diskRes.data?.data?.result || [];
    const domainData = domainsRes.data?.data?.result || [];

    // Build account map
    const accounts: Record<string, { account: string; diskUsage: number; domains: number }> = {};

    for (const item of diskData) {
      const account = item.metric?.account;
      if (account) {
        accounts[account] = {
          account,
          diskUsage: parseFloat(item.value[1]) || 0,
          domains: 0,
        };
      }
    }

    for (const item of domainData) {
      const account = item.metric?.account;
      if (account) {
        if (!accounts[account]) {
          accounts[account] = { account, diskUsage: 0, domains: 0 };
        }
        accounts[account].domains = parseFloat(item.value[1]) || 0;
      }
    }

    // Sort by disk usage descending
    const sorted = Object.values(accounts).sort((a, b) => b.diskUsage - a.diskUsage);

    res.json({ success: true, data: sorted });
  } catch (error: any) {
    logger.error('cPanel accounts error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch cPanel accounts' });
  }
});

// Get Exim per-domain email stats from Prometheus
router.get('/server/:serverId/exim-domains', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    const sentRes = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query: `exim_domain_sent_today{server_id="${serverId}"}` },
    });

    const sentData = sentRes.data?.data?.result || [];
    const domains = sentData
      .map((item: any) => ({
        domain: item.metric?.domain || 'unknown',
        sentToday: parseFloat(item.value[1]) || 0,
      }))
      .sort((a: any, b: any) => b.sentToday - a.sentToday);

    res.json({ success: true, data: domains });
  } catch (error: any) {
    logger.error('Exim domains error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch Exim domain stats' });
  }
});

// Get top-N servers by bandwidth usage
router.get('/bandwidth/top', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period = 'day', limit: limitStr = '10' } = req.query as { period?: string; limit?: string };
    const limit = Math.min(parseInt(limitStr, 10) || 10, 50);

    const periodMs: Record<string, number> = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    const ms = periodMs[period] || periodMs['day'];
    const startTime = new Date(Date.now() - ms);

    // Get all servers with their bandwidth data
    const servers = await prisma.server.findMany({
      select: { id: true, hostname: true, ipAddress: true, status: true },
    });

    const results = await Promise.all(
      servers.map(async (server) => {
        const summary = await getBandwidthSummary(server.id, (period as 'hour' | 'day' | 'week' | 'month') || 'day');
        return {
          ...server,
          totalIn: summary.totalIn,
          totalOut: summary.totalOut,
          totalBandwidth: summary.totalIn + summary.totalOut,
          avgIn: summary.avgIn,
          avgOut: summary.avgOut,
        };
      })
    );

    // Sort by total bandwidth descending and take top N
    results.sort((a, b) => b.totalBandwidth - a.totalBandwidth);
    const topServers = results.slice(0, limit).filter(s => s.totalBandwidth > 0);

    res.json({
      success: true,
      data: topServers,
    });
  } catch (error: any) {
    logger.error('Top bandwidth error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top bandwidth servers',
    });
  }
});

export { router as metricRoutes };
