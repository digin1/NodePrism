import dotenv from 'dotenv';
import path from 'path';
import { StatusSyncService } from './status-sync';
import { logger } from './utils/logger';

// Load .env from root directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SYNC_INTERVAL = parseInt(process.env.STATUS_SYNC_INTERVAL || '30000', 10);

async function main() {
  logger.info('Config Sync Worker - Starting', {
    prometheusUrl: process.env.PROMETHEUS_URL || 'http://localhost:9090',
    syncInterval: SYNC_INTERVAL,
  });

  const statusSync = new StatusSyncService();

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await statusSync.cleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the status sync service
  statusSync.start(SYNC_INTERVAL);

  logger.info('Status sync service running');
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
