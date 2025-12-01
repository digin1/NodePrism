import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export class AnomalyEventStore {
  async recordEvent(
    serverId: string,
    metricName: string,
    score: number,
    severity: number
  ): Promise<void> {
    try {
      const existing = await prisma.anomalyEvent.findFirst({
        where: {
          serverId,
          metricName,
          endedAt: null,
        },
      });

      if (existing) {
        await prisma.anomalyEvent.update({
          where: { id: existing.id },
          data: {
            score,
            severity,
          },
        });
        return;
      }

      await prisma.anomalyEvent.create({
        data: {
          serverId,
          metricName,
          score,
          severity,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      logger.warn('Failed to record anomaly event', { serverId, metricName, error });
    }
  }

  async resolveEvent(serverId: string, metricName: string): Promise<void> {
    try {
      await prisma.anomalyEvent.updateMany({
        where: {
          serverId,
          metricName,
          endedAt: null,
        },
        data: { endedAt: new Date() },
      });
    } catch (error) {
      logger.warn('Failed to resolve anomaly event', { serverId, metricName, error });
    }
  }
}
