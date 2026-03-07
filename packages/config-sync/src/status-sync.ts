import { PrismaClient } from '@prisma/client';
import { PrometheusClient } from './prometheus';
import axios from 'axios';
import { logger } from './utils/logger';

const prisma = new PrismaClient();
const prometheus = new PrometheusClient();

// API URL for logging events (uses the api server's eventLogger)
const API_URL = process.env.API_URL || 'http://localhost:4000';

interface ServerHealthStatus {
  hostname: string;
  ipAddress: string;
  isUp: boolean;
  lastScrape?: string;
  error?: string;
}

export class StatusSyncService {
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Get health status for all servers from Prometheus targets
   */
  async getServerHealthFromPrometheus(): Promise<Map<string, ServerHealthStatus>> {
    const healthMap = new Map<string, ServerHealthStatus>();
    const targets = await prometheus.getTargets();

    for (const target of targets) {
      // Extract hostname from labels or instance
      const hostname = target.labels.hostname || target.labels.instance?.split(':')[0];

      if (hostname) {
        healthMap.set(hostname, {
          hostname,
          ipAddress: target.labels.instance?.split(':')[0] || '',
          isUp: target.health === 'up',
          lastScrape: target.lastScrape,
          error: target.lastError,
        });
      }
    }

    return healthMap;
  }

  /**
   * Sync server status from Prometheus to database
   */
  async syncServerStatus(): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;

    try {
      // Check if Prometheus is healthy
      const isPrometheusUp = await prometheus.isHealthy();
      if (!isPrometheusUp) {
        return { updated: 0, errors: ['Prometheus is not available'] };
      }

      // Get health status from Prometheus
      const healthMap = await this.getServerHealthFromPrometheus();

      // Get all servers from database
      const servers = await prisma.server.findMany({
        select: {
          id: true,
          hostname: true,
          ipAddress: true,
          status: true,
        },
      });

      // Update each server based on Prometheus health
      for (const server of servers) {
        const health = healthMap.get(server.hostname);

        let newStatus: 'ONLINE' | 'OFFLINE' | 'WARNING' | 'CRITICAL';

        if (health) {
          // Server found in Prometheus targets
          newStatus = health.isUp ? 'ONLINE' : 'CRITICAL';
        } else {
          // Server not found in Prometheus - check by IP
          const healthByIp = Array.from(healthMap.values()).find(
            (h) => h.ipAddress === server.ipAddress
          );

          if (healthByIp) {
            newStatus = healthByIp.isUp ? 'ONLINE' : 'CRITICAL';
          } else {
            // Not being monitored by Prometheus
            newStatus = 'OFFLINE';
          }
        }

        // Only update if status changed
        if (server.status !== newStatus) {
          const oldStatus = server.status;
          const isRecovery = (oldStatus === 'OFFLINE' || oldStatus === 'CRITICAL') && newStatus === 'ONLINE';

          try {
            await prisma.server.update({
              where: { id: server.id },
              data: {
                status: newStatus,
                lastSeen: newStatus === 'ONLINE' ? new Date() : undefined,
              },
            });
            updated++;

            const statusLabel = isRecovery ? 'RECOVERED' : newStatus;
            logger.info(`${server.hostname}: ${oldStatus} → ${statusLabel}`);

            // Log event via internal API call to maintain consistency with Socket.IO events
            try {
              await this.logStatusChangeEvent(server.id, oldStatus, newStatus, server.hostname, isRecovery);
            } catch (eventErr) {
              logger.error(`Failed to log event for ${server.hostname}`, { error: eventErr });
            }
          } catch (err) {
            const errorMsg = `Failed to update ${server.hostname}: ${err}`;
            errors.push(errorMsg);
            logger.error(errorMsg);
          }
        }
      }

      return { updated, errors };
    } catch (error) {
      const errorMsg = `Status sync failed: ${error}`;
      errors.push(errorMsg);
      logger.error(errorMsg);
      return { updated, errors };
    }
  }

  /**
   * Start periodic status sync
   */
  start(intervalMs: number = 30000): void {
    logger.info(`Starting status sync (interval: ${intervalMs}ms)`);

    // Run immediately
    this.syncServerStatus().then(({ updated, errors }) => {
      logger.info(`Initial sync: ${updated} servers updated`);
      if (errors.length > 0) {
        logger.error('Sync errors', { errors });
      }
    });

    // Then run periodically
    this.syncInterval = setInterval(async () => {
      const { updated, errors } = await this.syncServerStatus();
      if (updated > 0) {
        logger.info(`${updated} servers updated`);
      }
      if (errors.length > 0) {
        logger.error('Sync errors', { errors });
      }
    }, intervalMs);
  }

  /**
   * Stop periodic status sync
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Stopped');
    }
  }

  /**
   * Log server status change event via the API
   */
  private async logStatusChangeEvent(
    serverId: string,
    oldStatus: string,
    newStatus: string,
    hostname: string,
    isRecovery: boolean
  ): Promise<void> {
    const typeMap: Record<string, string> = {
      ONLINE: 'SERVER_ONLINE',
      OFFLINE: 'SERVER_OFFLINE',
      WARNING: 'SERVER_WARNING',
      CRITICAL: 'SERVER_CRITICAL',
    };

    const severityMap: Record<string, string> = {
      ONLINE: 'INFO',
      OFFLINE: 'CRITICAL',
      WARNING: 'WARNING',
      CRITICAL: 'CRITICAL',
    };

    const eventType = isRecovery ? 'SERVER_RECOVERED' : (typeMap[newStatus] || 'SERVER_OFFLINE');
    const title = isRecovery ? 'Server recovered' : `Server ${newStatus.toLowerCase()}`;
    const message = isRecovery
      ? `Server ${hostname} has recovered and is now online (was ${oldStatus})`
      : `Server ${hostname} changed status from ${oldStatus} to ${newStatus}`;

    // Create event directly in database (same as eventLogger does)
    await prisma.eventLog.create({
      data: {
        serverId,
        type: eventType as any,
        severity: (severityMap[newStatus] || 'INFO') as any,
        title,
        message,
        metadata: { oldStatus, newStatus, hostname, isRecovery },
        source: 'status-sync',
      },
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stop();
    await prisma.$disconnect();
  }
}
