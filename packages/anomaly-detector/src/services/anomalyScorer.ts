import type { MonitoredMetricDefinition } from '@nodeprism/shared';
import { ModelTrainer } from './modelTrainer';
import { MetricsCollector } from './metricsCollector';
import { RedisClient } from '../utils/redis';
import { logger } from '../utils/logger';

const ANOMALY_SCORE_TTL = 60; // 1 minute TTL for current scores
const ANOMALY_SCORE_PREFIX = 'anomaly:score:';
const ANOMALY_RATE_PREFIX = 'anomaly:rate:';

export interface AnomalyScore {
  metricName: string;
  serverId: string;
  score: number;
  isAnomalous: boolean;
  timestamp: Date;
  modelCount: number;
  consensusRequired: number;
  consensusAchieved: number;
}

export interface NodeAnomalyRate {
  serverId: string;
  rate: number; // Percentage of anomalous metrics (0-100)
  anomalousCount: number;
  totalCount: number;
  timestamp: Date;
}

/**
 * Anomaly Scorer Service
 * Scores metrics against trained models using multi-model consensus
 */
export class AnomalyScorer {
  private redis: RedisClient;
  private modelTrainer: ModelTrainer;
  private metricsCollector: MetricsCollector;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.modelTrainer = new ModelTrainer(redis);
    this.metricsCollector = new MetricsCollector();
  }

  /**
   * Score a single metric value against all models
   * Implements multi-model consensus (requires ALL models to agree)
   */
  async scoreMetric(
    metricName: string,
    serverId: string,
    currentValue: number,
    baseMetricName?: string,
    definition?: MonitoredMetricDefinition,
    labels: Record<string, string> = {}
  ): Promise<AnomalyScore | null> {
    try {
      // Get all valid models for this metric
      const models = await this.modelTrainer.getValidModels(metricName, serverId);

      if (models.length < 2) {
        return null; // Need at least 2 models for meaningful consensus
      }

      const resolvedBase = baseMetricName || metricName.replace(/\{.*\}/, '');

      // Fetch recent data for context
      const recentData = await this.metricsCollector.fetchRecentData(
        metricName,
        resolvedBase,
        serverId,
        labels,
        5,
        definition
      );

      if (recentData.length < 6) {
        return null; // Not enough data for scoring
      }

      // Add current value to recent data
      const dataForScoring = [...recentData, currentValue];

      // Score against each model
      let anomalousCount = 0;
      let totalScore = 0;

      for (const model of models) {
        const result = model.score(dataForScoring);

        if (result) {
          totalScore += result.score;
          if (result.isAnomalous) {
            anomalousCount++;
          }
        }
      }

      // Calculate average score
      const avgScore = totalScore / models.length;

      // Multi-model consensus: anomaly only if ALL models agree
      const isAnomalous = anomalousCount === models.length;

      const score: AnomalyScore = {
        metricName,
        serverId,
        score: avgScore,
        isAnomalous,
        timestamp: new Date(),
        modelCount: models.length,
        consensusRequired: models.length,
        consensusAchieved: anomalousCount,
      };

      // Store the score in Redis
      await this.storeScore(score);

      // Update node anomaly rate
      await this.updateNodeAnomalyRate(serverId);

      return score;
    } catch (error) {
      logger.debug('Failed to score metric', { metricName, serverId, error });
      return null;
    }
  }

  /**
   * Store an anomaly score in Redis
   */
  private async storeScore(score: AnomalyScore): Promise<void> {
    const key = this.buildScoreKey(score.metricName, score.serverId);
    await this.redis.set(key, JSON.stringify(score), ANOMALY_SCORE_TTL);
  }

  /**
   * Get current score for a metric
   */
  async getScore(metricName: string, serverId: string): Promise<AnomalyScore | null> {
    const key = this.buildScoreKey(metricName, serverId);
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data) as AnomalyScore;
    } catch {
      return null;
    }
  }

  /**
   * Get all current anomalies for a server
   */
  async getServerAnomalies(serverId: string): Promise<AnomalyScore[]> {
    const pattern = `${ANOMALY_SCORE_PREFIX}${serverId}:*`;
    const keys = await this.redis.keys(pattern);
    const anomalies: AnomalyScore[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          const score = JSON.parse(data) as AnomalyScore;
          if (score.isAnomalous) {
            anomalies.push(score);
          }
        } catch {
          // Skip invalid data
        }
      }
    }

    // Sort by score descending
    return anomalies.sort((a, b) => b.score - a.score);
  }

  /**
   * Get all current anomalies across all servers
   */
  async getAllAnomalies(): Promise<AnomalyScore[]> {
    const pattern = `${ANOMALY_SCORE_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    const anomalies: AnomalyScore[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          const score = JSON.parse(data) as AnomalyScore;
          if (score.isAnomalous) {
            anomalies.push(score);
          }
        } catch {
          // Skip invalid data
        }
      }
    }

    return anomalies.sort((a, b) => b.score - a.score);
  }

  /**
   * Update the Node Anomaly Rate (NAR) for a server
   */
  private async updateNodeAnomalyRate(serverId: string): Promise<void> {
    const pattern = `${ANOMALY_SCORE_PREFIX}${serverId}:*`;
    const keys = await this.redis.keys(pattern);

    let anomalousCount = 0;
    let totalCount = 0;

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          const score = JSON.parse(data) as AnomalyScore;
          totalCount++;
          if (score.isAnomalous) {
            anomalousCount++;
          }
        } catch {
          // Skip invalid data
        }
      }
    }

    const rate: NodeAnomalyRate = {
      serverId,
      rate: totalCount > 0 ? (anomalousCount / totalCount) * 100 : 0,
      anomalousCount,
      totalCount,
      timestamp: new Date(),
    };

    const rateKey = `${ANOMALY_RATE_PREFIX}${serverId}`;
    await this.redis.set(rateKey, JSON.stringify(rate), ANOMALY_SCORE_TTL);
  }

  /**
   * Get the current Node Anomaly Rate for a server
   */
  async getNodeAnomalyRate(serverId: string): Promise<NodeAnomalyRate | null> {
    const key = `${ANOMALY_RATE_PREFIX}${serverId}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data) as NodeAnomalyRate;
    } catch {
      return null;
    }
  }

  /**
   * Get anomaly rates for all servers
   */
  async getAllNodeAnomalyRates(): Promise<NodeAnomalyRate[]> {
    const pattern = `${ANOMALY_RATE_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    const rates: NodeAnomalyRate[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          rates.push(JSON.parse(data) as NodeAnomalyRate);
        } catch {
          // Skip invalid data
        }
      }
    }

    // Sort by rate descending
    return rates.sort((a, b) => b.rate - a.rate);
  }

  /**
   * Get scoring statistics
   */
  async getStats(): Promise<{
    totalScores: number;
    anomalousScores: number;
    serverCount: number;
  }> {
    const scoreKeys = await this.redis.keys(`${ANOMALY_SCORE_PREFIX}*`);
    const rateKeys = await this.redis.keys(`${ANOMALY_RATE_PREFIX}*`);

    let anomalousScores = 0;

    for (const key of scoreKeys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          const score = JSON.parse(data) as AnomalyScore;
          if (score.isAnomalous) {
            anomalousScores++;
          }
        } catch {
          // Skip
        }
      }
    }

    return {
      totalScores: scoreKeys.length,
      anomalousScores,
      serverCount: rateKeys.length,
    };
  }

  /**
   * Build Redis key for a score
   */
  private buildScoreKey(metricName: string, serverId: string): string {
    const sanitizedMetric = metricName.replace(/[{}="]/g, '_');
    return `${ANOMALY_SCORE_PREFIX}${serverId}:${sanitizedMetric}`;
  }
}
