import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

const router: ExpressRouter = Router();

// Redis connection for anomaly scores
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
});

const ANOMALY_SCORE_PREFIX = 'anomaly:score:';
const ANOMALY_RATE_PREFIX = 'anomaly:rate:';

interface AnomalyScore {
  metricName: string;
  serverId: string;
  score: number;
  isAnomalous: boolean;
  timestamp: string;
  modelCount: number;
  consensusRequired: number;
  consensusAchieved: number;
}

interface NodeAnomalyRate {
  serverId: string;
  rate: number;
  anomalousCount: number;
  totalCount: number;
  timestamp: string;
}

// Ensure Redis is connected
const ensureRedisConnection = async () => {
  if (redis.status !== 'ready') {
    try {
      await redis.connect();
    } catch (error) {
      // Already connected or connecting
    }
  }
};

// GET /api/anomalies - Get all current anomalies
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureRedisConnection();

    const keys = await redis.keys(`${ANOMALY_SCORE_PREFIX}*`);
    const anomalies: AnomalyScore[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
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
    anomalies.sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      data: anomalies,
      count: anomalies.length,
    });
  } catch (error) {
    logger.error('Failed to fetch anomalies', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anomalies',
    });
  }
});

// GET /api/anomalies/server/:serverId - Get anomalies for a specific server
router.get('/server/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    await ensureRedisConnection();

    const keys = await redis.keys(`${ANOMALY_SCORE_PREFIX}${serverId}:*`);
    const anomalies: AnomalyScore[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
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

    anomalies.sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      data: anomalies,
      count: anomalies.length,
    });
  } catch (error) {
    logger.error('Failed to fetch server anomalies', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch server anomalies',
    });
  }
});

// GET /api/anomalies/rates - Get Node Anomaly Rates for all servers
router.get('/rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureRedisConnection();

    const keys = await redis.keys(`${ANOMALY_RATE_PREFIX}*`);
    const rates: NodeAnomalyRate[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        try {
          rates.push(JSON.parse(data) as NodeAnomalyRate);
        } catch {
          // Skip invalid data
        }
      }
    }

    // Sort by rate descending
    rates.sort((a, b) => b.rate - a.rate);

    res.json({
      success: true,
      data: rates,
    });
  } catch (error) {
    logger.error('Failed to fetch anomaly rates', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anomaly rates',
    });
  }
});

// GET /api/anomalies/rate/:serverId - Get Node Anomaly Rate for a specific server
router.get('/rate/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    await ensureRedisConnection();

    const data = await redis.get(`${ANOMALY_RATE_PREFIX}${serverId}`);

    if (!data) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: JSON.parse(data) as NodeAnomalyRate,
    });
  } catch (error) {
    logger.error('Failed to fetch server anomaly rate', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch server anomaly rate',
    });
  }
});

// GET /api/anomalies/events - Get historical anomaly events from database
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, limit, offset } = req.query;

    const events = await prisma.anomalyEvent.findMany({
      where: {
        ...(serverId && { serverId: serverId as string }),
      },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(parseInt(limit as string) || 100, 500),
      skip: parseInt(offset as string) || 0,
    });

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    logger.error('Failed to fetch anomaly events', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anomaly events',
    });
  }
});

// GET /api/anomalies/models - Inspect trained models stored in PostgreSQL
router.get('/models', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, limit, offset } = req.query;

    const models = await prisma.anomalyModel.findMany({
      where: {
        ...(serverId && { serverId: serverId as string }),
      },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
      },
      orderBy: { trainedAt: 'desc' },
      take: Math.min(parseInt(limit as string, 10) || 50, 500),
      skip: parseInt(offset as string, 10) || 0,
    });

    res.json({
      success: true,
      data: models,
      count: models.length,
    });
  } catch (error) {
    logger.error('Failed to fetch anomaly models', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anomaly models',
    });
  }
});

// GET /api/anomalies/stats - Get anomaly detection statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureRedisConnection();

    // Get current scores
    const scoreKeys = await redis.keys(`${ANOMALY_SCORE_PREFIX}*`);
    const rateKeys = await redis.keys(`${ANOMALY_RATE_PREFIX}*`);

    let anomalousScores = 0;

    for (const key of scoreKeys) {
      const data = await redis.get(key);
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

    // Get model count
    const modelKeys = await redis.keys('anomaly:model:*');

    const now = Date.now();
    const [dbModelCount, activeDbModels, recentEventCount] = await Promise.all([
      prisma.anomalyModel.count(),
      prisma.anomalyModel.count({
        where: {
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
      prisma.anomalyEvent.count({
        where: {
          startedAt: {
            gte: new Date(now - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalScores: scoreKeys.length,
        anomalousScores,
        serverCount: rateKeys.length,
        redisModelCount: modelKeys.length,
        dbModelCount,
        activeDbModels,
        recentEvents24h: recentEventCount,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch anomaly stats', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anomaly stats',
    });
  }
});

// POST /api/anomalies/events - Record an anomaly event (internal use)
router.post('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, metricName, score, severity } = req.body;

    // Check if there's an existing open event for this metric
    const existingEvent = await prisma.anomalyEvent.findFirst({
      where: {
        serverId,
        metricName,
        endedAt: null,
      },
    });

    if (existingEvent) {
      // Event already exists, skip
      return res.json({
        success: true,
        data: existingEvent,
        message: 'Event already exists',
      });
    }

    const event = await prisma.anomalyEvent.create({
      data: {
        serverId,
        metricName,
        score,
        severity,
        startedAt: new Date(),
      },
    });

    logger.info('Anomaly event recorded', { serverId, metricName, score });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('anomaly:detected', event);
    }

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    logger.error('Failed to record anomaly event', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to record anomaly event',
    });
  }
});

// PUT /api/anomalies/events/:id/resolve - Mark an anomaly event as resolved
router.put('/events/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const event = await prisma.anomalyEvent.update({
      where: { id },
      data: {
        endedAt: new Date(),
      },
    });

    logger.info('Anomaly event resolved', { id });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('anomaly:resolved', event);
    }

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    logger.error('Failed to resolve anomaly event', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to resolve anomaly event',
    });
  }
});

export { router as anomalyRoutes };
