import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { logger } from '../utils/logger';
import axios from 'axios';

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
    const queries = {
      cpu: `100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle", server_id="${serverId}"}[5m])) * 100)`,
      memory: `(1 - (node_memory_MemAvailable_bytes{server_id="${serverId}"} / node_memory_MemTotal_bytes{server_id="${serverId}"})) * 100`,
      disk: `(1 - (node_filesystem_avail_bytes{server_id="${serverId}", fstype!~"tmpfs|fuse.lxcfs"} / node_filesystem_size_bytes{server_id="${serverId}", fstype!~"tmpfs|fuse.lxcfs"})) * 100`,
      networkIn: `irate(node_network_receive_bytes_total{server_id="${serverId}", device!~"lo|veth.*"}[5m])`,
      networkOut: `irate(node_network_transmit_bytes_total{server_id="${serverId}", device!~"lo|veth.*"}[5m])`,
      load: `node_load1{server_id="${serverId}"}`,
    };

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

export { router as metricRoutes };
