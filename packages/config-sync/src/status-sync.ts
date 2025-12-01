import { PrismaClient } from '@prisma/client';
import { PrometheusClient } from './prometheus';

const prisma = new PrismaClient();
const prometheus = new PrometheusClient();

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
          try {
            await prisma.server.update({
              where: { id: server.id },
              data: {
                status: newStatus,
                lastSeen: newStatus === 'ONLINE' ? new Date() : undefined,
              },
            });
            updated++;
            console.log(`[StatusSync] ${server.hostname}: ${server.status} → ${newStatus}`);
          } catch (err) {
            const errorMsg = `Failed to update ${server.hostname}: ${err}`;
            errors.push(errorMsg);
            console.error(`[StatusSync] ${errorMsg}`);
          }
        }
      }

      return { updated, errors };
    } catch (error) {
      const errorMsg = `Status sync failed: ${error}`;
      errors.push(errorMsg);
      console.error(`[StatusSync] ${errorMsg}`);
      return { updated, errors };
    }
  }

  /**
   * Start periodic status sync
   */
  start(intervalMs: number = 30000): void {
    console.log(`[StatusSync] Starting status sync (interval: ${intervalMs}ms)`);

    // Run immediately
    this.syncServerStatus().then(({ updated, errors }) => {
      console.log(`[StatusSync] Initial sync: ${updated} servers updated`);
      if (errors.length > 0) {
        console.error(`[StatusSync] Errors:`, errors);
      }
    });

    // Then run periodically
    this.syncInterval = setInterval(async () => {
      const { updated, errors } = await this.syncServerStatus();
      if (updated > 0) {
        console.log(`[StatusSync] ${updated} servers updated`);
      }
      if (errors.length > 0) {
        console.error(`[StatusSync] Errors:`, errors);
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
      console.log('[StatusSync] Stopped');
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stop();
    await prisma.$disconnect();
  }
}
