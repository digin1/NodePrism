import dotenv from 'dotenv';
import path from 'path';
import { DeploymentWorker } from './worker';
import { logger } from './utils/logger';

// Load root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  logger.info('Starting Deployment Worker...');

  const worker = new DeploymentWorker();

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  try {
    await worker.start();
    logger.info('Deployment Worker started successfully');
  } catch (error) {
    logger.error('Failed to start Deployment Worker', { error });
    process.exit(1);
  }
}

main();
