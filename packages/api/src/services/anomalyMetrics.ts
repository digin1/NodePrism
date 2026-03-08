import client from 'prom-client';
import Redis from 'ioredis';
import { metricsRegistry } from './apiMetrics';
import { logger } from '../utils/logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const ANOMALY_SCORE_PREFIX = 'anomaly:score:';
const ANOMALY_RATE_PREFIX = 'anomaly:rate:';

let redis: Redis | null = null;

interface AnomalyScore {
  metricName: string;
  serverId: string;
  score: number;
  isAnomalous: boolean;
}

interface NodeAnomalyRate {
  serverId: string;
  rate: number;
  anomalousCount: number;
  totalCount: number;
}

async function ensureRedis(): Promise<Redis> {
  if (redis && redis.status === 'ready') return redis;

  if (!redis) {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
  }

  if (redis.status !== 'ready') {
    try {
      await redis.connect();
    } catch {
      // Already connecting or failed
    }
  }

  return redis;
}

// Per-metric anomaly score (0-100)
const anomalyScoreGauge = new client.Gauge({
  name: 'nodeprism_anomaly_score',
  help: 'Per-metric anomaly score (0-100, higher = more anomalous)',
  labelNames: ['server_id', 'metric_name'] as const,
  registers: [metricsRegistry],
});

// Whether metric is currently flagged anomalous (0 or 1)
const anomalyDetectedGauge = new client.Gauge({
  name: 'nodeprism_anomaly_detected',
  help: 'Whether a metric is currently anomalous (0 or 1)',
  labelNames: ['server_id', 'metric_name'] as const,
  registers: [metricsRegistry],
});

// Node Anomaly Rate per server (0-100)
const anomalyRateGauge = new client.Gauge({
  name: 'nodeprism_anomaly_rate',
  help: 'Node Anomaly Rate per server (0-100, percentage of metrics flagged anomalous)',
  labelNames: ['server_id'] as const,
  registers: [metricsRegistry],
  async collect() {
    await refreshAnomalyMetrics();
  },
});

async function refreshAnomalyMetrics(): Promise<void> {
  try {
    const r = await ensureRedis();
    if (r.status !== 'ready') return;

    // Reset all gauges to clear stale label sets from expired keys
    anomalyRateGauge.reset();
    anomalyScoreGauge.reset();
    anomalyDetectedGauge.reset();

    // Read anomaly scores
    const scoreKeys = await r.keys(`${ANOMALY_SCORE_PREFIX}*`);
    for (const key of scoreKeys) {
      const data = await r.get(key);
      if (!data) continue;
      try {
        const score = JSON.parse(data) as AnomalyScore;
        const labels = { server_id: score.serverId, metric_name: score.metricName };
        anomalyScoreGauge.set(labels, score.score);
        anomalyDetectedGauge.set(labels, score.isAnomalous ? 1 : 0);
      } catch {
        // Skip invalid entries
      }
    }

    // Read anomaly rates
    const rateKeys = await r.keys(`${ANOMALY_RATE_PREFIX}*`);
    for (const key of rateKeys) {
      const data = await r.get(key);
      if (!data) continue;
      try {
        const rate = JSON.parse(data) as NodeAnomalyRate;
        anomalyRateGauge.set({ server_id: rate.serverId }, rate.rate);
      } catch {
        // Skip invalid entries
      }
    }
  } catch (error) {
    logger.debug('Failed to collect anomaly metrics from Redis', { error });
  }
}

/**
 * Initialize anomaly Prometheus metrics.
 * Call once at startup — gauges register themselves on the shared registry.
 */
export function initAnomalyMetrics(): void {
  logger.info('Anomaly Prometheus metrics registered');
}
