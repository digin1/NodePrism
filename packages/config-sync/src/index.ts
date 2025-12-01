import dotenv from 'dotenv';
import { StatusSyncService } from './status-sync';

dotenv.config();

const SYNC_INTERVAL = parseInt(process.env.STATUS_SYNC_INTERVAL || '30000', 10);

async function main() {
  console.log('Config Sync Worker - Starting');
  console.log('================================');
  console.log(`Prometheus URL: ${process.env.PROMETHEUS_URL || 'http://localhost:9090'}`);
  console.log(`Sync interval: ${SYNC_INTERVAL}ms`);
  console.log('');

  const statusSync = new StatusSyncService();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await statusSync.cleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the status sync service
  statusSync.start(SYNC_INTERVAL);

  console.log('[ConfigSync] Status sync service running');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
