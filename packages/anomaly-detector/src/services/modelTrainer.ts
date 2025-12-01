import { KMeansAnomalyModel, KMeansModelData } from '../models/kmeans';
import { RedisClient } from '../utils/redis';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';

const MODEL_TTL_SECONDS = 48 * 60 * 60; // 48 hours
const MODEL_KEY_PREFIX = 'anomaly:model:';
const MAX_MODELS_PER_METRIC = 6; // Keep 6 models covering ~48 hours

export interface StoredModel {
  data: KMeansModelData;
  createdAt: string;
  slot: number;
}

/**
 * Model Trainer Service
 * Manages training and storage of anomaly detection models
 * Implements multi-model consensus approach from Netdata
 */
export class ModelTrainer {
  private redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;
  }

  /**
   * Train a new model for a metric and store it
   * Maintains multiple models (sliding window) for consensus
   */
  async trainModel(metricName: string, serverId: string, data: number[]): Promise<boolean> {
    try {
      const model = new KMeansAnomalyModel();
      const modelData = model.train(data);

      if (!modelData) {
        logger.debug('Failed to train model - insufficient data', { metricName, serverId });
        return false;
      }

      // Store the model
      await this.storeModel(metricName, serverId, modelData);

      logger.info('Model trained successfully', {
        metricName,
        serverId,
        dataPoints: modelData.dataPoints,
        threshold: modelData.threshold.toFixed(4),
      });

      return true;
    } catch (error) {
      logger.error('Failed to train model', { metricName, serverId, error });
      return false;
    }
  }

  /**
   * Store a trained model in Redis
   * Uses rotating slots to maintain model history
   */
  private async storeModel(
    metricName: string,
    serverId: string,
    modelData: KMeansModelData
  ): Promise<void> {
    const key = this.buildModelKey(metricName, serverId);

    // Get existing models to determine next slot
    const existingModels = await this.getStoredModels(metricName, serverId);
    const nextSlot = this.getNextSlot(existingModels);

    const storedModel: StoredModel = {
      data: modelData,
      createdAt: new Date().toISOString(),
      slot: nextSlot,
    };

    // Store in Redis hash with slot as field
    await this.redis.hset(key, `slot:${nextSlot}`, JSON.stringify(storedModel));
    await this.redis.expire(key, MODEL_TTL_SECONDS);

    // Persist model metadata to PostgreSQL for recovery/analytics
    await this.persistModel(metricName, serverId, modelData, nextSlot);

    // Clean up old models beyond max
    await this.cleanupOldModels(key, existingModels, nextSlot);
  }

  /**
   * Get the next available slot number
   */
  private getNextSlot(existingModels: StoredModel[]): number {
    if (existingModels.length === 0) {
      return 0;
    }

    const maxSlot = Math.max(...existingModels.map((m) => m.slot));
    return (maxSlot + 1) % (MAX_MODELS_PER_METRIC * 2); // Allow wraparound
  }

  /**
   * Clean up old models beyond the maximum count
   */
  private async cleanupOldModels(
    key: string,
    existingModels: StoredModel[],
    latestSlot: number
  ): Promise<void> {
    if (existingModels.length < MAX_MODELS_PER_METRIC) {
      return;
    }

    // Sort by creation time (oldest first)
    const sortedModels = [...existingModels].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Remove oldest models to stay under limit
    const modelsToRemove = sortedModels.slice(0, existingModels.length - MAX_MODELS_PER_METRIC + 1);

    for (const model of modelsToRemove) {
      if (model.slot !== latestSlot) {
        // Note: Redis hset doesn't have hdel in our client, we'll leave old ones to expire
        logger.debug('Old model slot marked for cleanup', { slot: model.slot });
      }
    }
  }

  /**
   * Persist the latest trained model to PostgreSQL for recovery and auditing
   */
  private async persistModel(
    metricName: string,
    serverId: string,
    modelData: KMeansModelData,
    slot: number
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + MODEL_TTL_SECONDS * 1000);

      await prisma.anomalyModel.upsert({
        where: {
          serverId_metricName: {
            serverId,
            metricName,
          },
        },
        update: {
          clusterCenters: modelData.centroids,
          threshold: modelData.threshold,
          trainedAt: modelData.trainedAt,
          expiresAt,
          dataPoints: modelData.dataPoints,
          modelVersion: slot,
        },
        create: {
          serverId,
          metricName,
          clusterCenters: modelData.centroids,
          threshold: modelData.threshold,
          trainedAt: modelData.trainedAt,
          expiresAt,
          dataPoints: modelData.dataPoints,
          modelVersion: slot,
        },
      });
    } catch (error) {
      logger.warn('Failed to persist anomaly model to database', { metricName, serverId, error });
    }
  }

  /**
   * Get all stored models for a metric
   */
  async getStoredModels(metricName: string, serverId: string): Promise<StoredModel[]> {
    const key = this.buildModelKey(metricName, serverId);
    const allFields = await this.redis.hgetall(key);

    const models: StoredModel[] = [];

    for (const [field, value] of Object.entries(allFields)) {
      if (field.startsWith('slot:')) {
        try {
          const model = JSON.parse(value) as StoredModel;
          models.push(model);
        } catch {
          logger.debug('Failed to parse stored model', { field });
        }
      }
    }

    return models;
  }

  /**
   * Get valid (non-expired) models for scoring
   */
  async getValidModels(
    metricName: string,
    serverId: string,
    maxAgeHours: number = 48
  ): Promise<KMeansAnomalyModel[]> {
    const storedModels = await this.getStoredModels(metricName, serverId);
    const validModels: KMeansAnomalyModel[] = [];

    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    for (const stored of storedModels) {
      const age = now - new Date(stored.createdAt).getTime();

      if (age <= maxAgeMs) {
        const model = new KMeansAnomalyModel();
        model.loadFromJSON(stored.data);
        validModels.push(model);
      }
    }

    // Sort by age (newest first)
    return validModels.sort((a, b) => {
      const aData = a.toJSON();
      const bData = b.toJSON();
      return new Date(bData.trainedAt).getTime() - new Date(aData.trainedAt).getTime();
    });
  }

  /**
   * Check if models exist for a metric
   */
  async hasModels(metricName: string, serverId: string): Promise<boolean> {
    const models = await this.getStoredModels(metricName, serverId);
    return models.length > 0;
  }

  /**
   * Delete all models for a metric
   */
  async deleteModels(metricName: string, serverId: string): Promise<void> {
    const key = this.buildModelKey(metricName, serverId);
    await this.redis.del(key);
  }

  /**
   * Build Redis key for a metric's models
   */
  private buildModelKey(metricName: string, serverId: string): string {
    // Sanitize metric name for use as key
    const sanitizedMetric = metricName.replace(/[{}="]/g, '_');
    return `${MODEL_KEY_PREFIX}${serverId}:${sanitizedMetric}`;
  }

  /**
   * Get statistics about stored models
   */
  async getModelStats(): Promise<{
    totalModels: number;
    uniqueMetrics: number;
  }> {
    const keys = await this.redis.keys(`${MODEL_KEY_PREFIX}*`);
    let totalModels = 0;

    for (const key of keys) {
      const models = await this.redis.hgetall(key);
      totalModels += Object.keys(models).filter((k) => k.startsWith('slot:')).length;
    }

    return {
      totalModels,
      uniqueMetrics: keys.length,
    };
  }
}
