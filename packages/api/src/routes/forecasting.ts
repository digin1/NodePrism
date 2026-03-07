import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import axios from 'axios';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const SECONDS_PER_DAY = 86400;

// ==================== Linear Regression Helpers ====================

interface DataPoint {
  x: number; // timestamp in seconds
  y: number; // metric value
}

interface RegressionResult {
  slope: number;       // change per second
  intercept: number;
  r2: number;          // R-squared (goodness of fit)
  slopePerDay: number; // change per day
}

function linearRegression(points: DataPoint[]): RegressionResult {
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0, slopePerDay: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, r2: 0, slopePerDay: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    slope,
    intercept,
    r2,
    slopePerDay: slope * SECONDS_PER_DAY,
  };
}

function determineTrend(slopePerDay: number): 'increasing' | 'decreasing' | 'stable' {
  if (Math.abs(slopePerDay) < 0.1) return 'stable';
  return slopePerDay > 0 ? 'increasing' : 'decreasing';
}

function daysUntilThreshold(
  currentValue: number,
  slopePerDay: number,
  threshold: number
): number | null {
  if (slopePerDay <= 0) return null; // Will never reach threshold if decreasing or flat
  if (currentValue >= threshold) return 0; // Already past threshold
  return (threshold - currentValue) / slopePerDay;
}

// ==================== Prometheus Query Helper ====================

interface ForecastData {
  currentValue: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  daysUntil90: number | null;
  daysUntil100: number | null;
  projectedValues: Array<{ days: number; value: number }>;
  dataPoints: number;
  r2: number;
}

async function queryPrometheusRange(
  query: string,
  ipAddress: string,
  lookbackDays: number = 7
): Promise<DataPoint[]> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - lookbackDays * SECONDS_PER_DAY;
  // Step: ~1 hour intervals for 7 days gives ~168 data points
  const step = Math.floor((lookbackDays * SECONDS_PER_DAY) / 168);

  const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
    params: {
      query,
      start,
      end,
      step,
    },
    timeout: 15000,
  });

  const result = response.data?.data?.result;
  if (!result || result.length === 0) {
    return [];
  }

  // Extract the values array from the first matching time series
  const values: Array<[number, string]> = result[0].values;
  if (!values || values.length === 0) {
    return [];
  }

  return values
    .map(([timestamp, value]: [number, string]) => ({
      x: timestamp,
      y: parseFloat(value),
    }))
    .filter((p: DataPoint) => !isNaN(p.y) && isFinite(p.y));
}

function buildForecast(points: DataPoint[]): ForecastData {
  if (points.length === 0) {
    return {
      currentValue: 0,
      trend: 'stable',
      slope: 0,
      daysUntil90: null,
      daysUntil100: null,
      projectedValues: [],
      dataPoints: 0,
      r2: 0,
    };
  }

  const regression = linearRegression(points);
  const currentValue = points[points.length - 1].y;
  const trend = determineTrend(regression.slopePerDay);

  const projectedValues = [7, 30, 90].map((days) => ({
    days,
    value: parseFloat((currentValue + regression.slopePerDay * days).toFixed(2)),
  }));

  const days90 = daysUntilThreshold(currentValue, regression.slopePerDay, 90);
  const days100 = daysUntilThreshold(currentValue, regression.slopePerDay, 100);

  return {
    currentValue: parseFloat(currentValue.toFixed(2)),
    trend,
    slope: parseFloat(regression.slopePerDay.toFixed(4)),
    daysUntil90: days90 !== null ? parseFloat(days90.toFixed(1)) : null,
    daysUntil100: days100 !== null ? parseFloat(days100.toFixed(1)) : null,
    projectedValues,
    dataPoints: points.length,
    r2: parseFloat(regression.r2.toFixed(4)),
  };
}

// ==================== Server Lookup Helper ====================

async function getServerIpAddress(serverId: string): Promise<string | null> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ipAddress: true },
  });
  return server?.ipAddress ?? null;
}

// ==================== Routes ====================

// GET /api/forecasting/disk/:serverId - Forecast disk exhaustion
router.get('/disk/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const ipAddress = await getServerIpAddress(serverId);

    if (!ipAddress) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const query = `(1 - node_filesystem_avail_bytes{instance="${ipAddress}:9100",mountpoint="/"} / node_filesystem_size_bytes{instance="${ipAddress}:9100",mountpoint="/"}) * 100`;
    const points = await queryPrometheusRange(query, ipAddress);

    if (points.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No disk metrics available for this server',
      });
    }

    const forecast = buildForecast(points);

    res.json({
      success: true,
      data: forecast,
    });
  } catch (error) {
    logger.error('Disk forecast error', { error: (error as Error).message });
    next(error);
  }
});

// GET /api/forecasting/memory/:serverId - Forecast memory exhaustion
router.get('/memory/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const ipAddress = await getServerIpAddress(serverId);

    if (!ipAddress) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const query = `(1 - node_memory_MemAvailable_bytes{instance="${ipAddress}:9100"} / node_memory_MemTotal_bytes{instance="${ipAddress}:9100"}) * 100`;
    const points = await queryPrometheusRange(query, ipAddress);

    if (points.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No memory metrics available for this server',
      });
    }

    const forecast = buildForecast(points);

    res.json({
      success: true,
      data: forecast,
    });
  } catch (error) {
    logger.error('Memory forecast error', { error: (error as Error).message });
    next(error);
  }
});

// GET /api/forecasting/cpu/:serverId - Forecast CPU trend
router.get('/cpu/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const ipAddress = await getServerIpAddress(serverId);

    if (!ipAddress) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const query = `100 - (avg by(instance)(irate(node_cpu_seconds_total{instance="${ipAddress}:9100",mode="idle"}[5m])) * 100)`;
    const points = await queryPrometheusRange(query, ipAddress);

    if (points.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No CPU metrics available for this server',
      });
    }

    // CPU forecast: same structure but thresholds are less meaningful
    // since CPU at 100% is transient, not an exhaustion event.
    // We still provide daysUntil90/100 for consistency, but trend is the key indicator.
    const forecast = buildForecast(points);

    res.json({
      success: true,
      data: forecast,
    });
  } catch (error) {
    logger.error('CPU forecast error', { error: (error as Error).message });
    next(error);
  }
});

// GET /api/forecasting/all/:serverId - Return all forecasts for a server
router.get('/all/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const ipAddress = await getServerIpAddress(serverId);

    if (!ipAddress) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const instance = `${ipAddress}:9100`;

    const diskQuery = `(1 - node_filesystem_avail_bytes{instance="${instance}",mountpoint="/"} / node_filesystem_size_bytes{instance="${instance}",mountpoint="/"}) * 100`;
    const memoryQuery = `(1 - node_memory_MemAvailable_bytes{instance="${instance}"} / node_memory_MemTotal_bytes{instance="${instance}"}) * 100`;
    const cpuQuery = `100 - (avg by(instance)(irate(node_cpu_seconds_total{instance="${instance}",mode="idle"}[5m])) * 100)`;

    const [diskPoints, memoryPoints, cpuPoints] = await Promise.all([
      queryPrometheusRange(diskQuery, ipAddress),
      queryPrometheusRange(memoryQuery, ipAddress),
      queryPrometheusRange(cpuQuery, ipAddress),
    ]);

    const disk = diskPoints.length > 0 ? buildForecast(diskPoints) : null;
    const memory = memoryPoints.length > 0 ? buildForecast(memoryPoints) : null;
    const cpu = cpuPoints.length > 0 ? buildForecast(cpuPoints) : null;

    res.json({
      success: true,
      data: {
        disk,
        memory,
        cpu,
      },
    });
  } catch (error) {
    logger.error('Combined forecast error', { error: (error as Error).message });
    next(error);
  }
});

export { router as forecastingRoutes };
