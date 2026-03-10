import 'dotenv/config';
import { logger } from './utils/logger';
import { MetricsCollector } from './services/metricsCollector';
import { ModelTrainer } from './services/modelTrainer';
import { AnomalyScorer } from './services/anomalyScorer';
import { AnomalyEventStore } from './services/anomalyEventStore';
import { RedisClient } from './utils/redis';

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection (caught globally)', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception (caught globally)', { error: error.message });
  // Don't exit — let PM2 decide based on health, not crashes
});

const TRAINING_INTERVAL = parseInt(process.env.TRAINING_INTERVAL || '300000', 10); // 5 minutes
const SCORING_INTERVAL = parseInt(process.env.SCORING_INTERVAL || '10000', 10); // 10 seconds

class AnomalyDetectorService {
  private metricsCollector: MetricsCollector;
  private modelTrainer: ModelTrainer;
  private anomalyScorer: AnomalyScorer;
  private anomalyEventStore: AnomalyEventStore;
  private redis: RedisClient;
  private trainingTimer?: NodeJS.Timeout;
  private scoringTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor() {
    this.redis = new RedisClient();
    this.metricsCollector = new MetricsCollector();
    this.modelTrainer = new ModelTrainer(this.redis);
    this.anomalyScorer = new AnomalyScorer(this.redis);
    this.anomalyEventStore = new AnomalyEventStore();
  }

  async start(): Promise<void> {
    logger.info('Starting Anomaly Detector Service...');

    try {
      // Connect to Redis (will fall back to DB-only mode if unavailable)
      await this.redis.connect();
      if (!this.redis.isConnected) {
        logger.warn('Running in degraded mode: Redis unavailable, using DB-only fallback');
      }

      this.isRunning = true;

      // Initial training run
      await this.runTrainingCycle();

      // Start periodic training (wrapped to prevent unhandled rejections)
      this.trainingTimer = setInterval(() => {
        if (this.isRunning) {
          this.runTrainingCycle().catch(err =>
            logger.error('Training cycle threw unexpectedly', { error: err.message })
          );
        }
      }, TRAINING_INTERVAL);

      // Start periodic scoring (wrapped to prevent unhandled rejections)
      this.scoringTimer = setInterval(() => {
        if (this.isRunning) {
          this.runScoringCycle().catch(err =>
            logger.error('Scoring cycle threw unexpectedly', { error: err.message })
          );
        }
      }, SCORING_INTERVAL);

      logger.info('Anomaly Detector Service started successfully');
      logger.info(`Training interval: ${TRAINING_INTERVAL}ms`);
      logger.info(`Scoring interval: ${SCORING_INTERVAL}ms`);
    } catch (error) {
      logger.error('Failed to start Anomaly Detector Service', { error });
      throw error;
    }
  }

  private async runTrainingCycle(): Promise<void> {
    try {
      logger.debug('Starting training cycle...');

      // Get list of metrics to train on
      const metrics = await this.metricsCollector.getTrainableMetrics();
      logger.info(`Found ${metrics.length} metrics to train`);

      // Process in batches to limit memory usage
      const BATCH_SIZE = 50;
      for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
        const batch = metrics.slice(i, i + BATCH_SIZE);

        for (const metric of batch) {
          if (!this.isRunning) return; // Stop early if shutting down

          try {
            // Fetch historical data for training (last 4 hours)
            const data = await this.metricsCollector.fetchMetricData(
              metric,
              4 * 60 * 60 // 4 hours in seconds
            );

            if (data.length < 100) {
              logger.debug(
                `Skipping ${metric.metricKey} - insufficient data points (${data.length})`
              );
              continue;
            }

            // Train model
            await this.modelTrainer.trainModel(metric.metricKey, metric.serverId, data);
            logger.debug(`Trained model for ${metric.metricKey} on server ${metric.serverId}`);
          } catch (error) {
            logger.warn(`Failed to train model for ${metric.metricKey}`, { error });
          }
        }

        // Yield to event loop and allow GC between batches
        if (i + BATCH_SIZE < metrics.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info('Training cycle completed');
    } catch (error) {
      logger.error('Training cycle failed', { error });
    }
  }

  private async runScoringCycle(): Promise<void> {
    try {
      // Get current metric values
      const currentMetrics = await this.metricsCollector.fetchCurrentMetrics();
      const serverRateCache = new Map<string, number>();

      for (const metric of currentMetrics) {
        try {
          const score = await this.anomalyScorer.scoreMetric(
            metric.metricKey,
            metric.serverId,
            metric.value,
            metric.baseName,
            metric.definition,
            metric.labels
          );

          if (score === null) {
            continue;
          }

          if (score.isAnomalous) {
            const rate = await this.getServerAnomalyRate(metric.serverId, serverRateCache);
            const severity = rate > 0 ? rate : score.score;

            logger.info(`Anomaly detected: ${metric.metricKey} on ${metric.serverId}`, {
              score: score.score,
              severity,
              value: metric.value,
            });

            await this.anomalyEventStore.recordEvent(
              metric.serverId,
              metric.metricKey,
              score.score,
              severity
            );
          } else {
            await this.anomalyEventStore.resolveEvent(metric.serverId, metric.metricKey);
          }
        } catch (error) {
          // Silently skip metrics without trained models
        }
      }
    } catch (error) {
      logger.error('Scoring cycle failed', { error });
    }
  }

  private async getServerAnomalyRate(
    serverId: string,
    cache: Map<string, number>
  ): Promise<number> {
    if (cache.has(serverId)) {
      return cache.get(serverId)!;
    }

    const rate = await this.anomalyScorer.getNodeAnomalyRate(serverId);
    const value = rate?.rate ?? 0;
    cache.set(serverId, value);
    return value;
  }

  async stop(): Promise<void> {
    logger.info('Stopping Anomaly Detector Service...');
    this.isRunning = false;

    if (this.trainingTimer) {
      clearInterval(this.trainingTimer);
    }

    if (this.scoringTimer) {
      clearInterval(this.scoringTimer);
    }

    await this.redis.disconnect();
    logger.info('Anomaly Detector Service stopped');
  }
}

// Handle graceful shutdown
const service = new AnomalyDetectorService();

process.on('SIGTERM', async () => {
  await service.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await service.stop();
  process.exit(0);
});

// Start the service
service.start().catch((error) => {
  logger.error('Fatal error starting service', { error });
  process.exit(1);
});
