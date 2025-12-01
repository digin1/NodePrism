import amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import { logger } from '../utils/logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://nodeprism:${DB_PASSWORD}@localhost:5672';
const DEPLOYMENT_QUEUE = 'deployment_jobs';

class RabbitMQService {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.channel) return;

    // Prevent multiple simultaneous connection attempts
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = this._connect();
    await this.connecting;
    this.connecting = null;
  }

  private async _connect(): Promise<void> {
    try {
      logger.info('Connecting to RabbitMQ...', { url: RABBITMQ_URL.replace(/:[^:@]+@/, ':****@') });

      this.connection = await amqp.connect(RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      // Ensure deployment queue exists
      await this.channel.assertQueue(DEPLOYMENT_QUEUE, {
        durable: true,
      });

      // Handle connection close
      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed, will reconnect on next publish');
        this.channel = null;
        this.connection = null;
      });

      logger.info('Connected to RabbitMQ');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ', { error });
      this.channel = null;
      this.connection = null;
      throw error;
    }
  }

  async publishDeploymentJob(job: {
    id: string;
    serverId: string;
    hostname: string;
    ipAddress: string;
    sshPort: number;
    sshUsername: string;
    agentType: string;
    deploymentId: string;
  }): Promise<boolean> {
    try {
      await this.connect();

      if (!this.channel) {
        throw new Error('RabbitMQ channel not available');
      }

      const message = Buffer.from(JSON.stringify(job));
      const result = this.channel.sendToQueue(DEPLOYMENT_QUEUE, message, {
        persistent: true,
      });

      logger.info('Published deployment job to RabbitMQ', {
        jobId: job.id,
        serverId: job.serverId,
        agentType: job.agentType,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish deployment job', { error, job });
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection', { error });
    }
  }
}

// Singleton instance
export const rabbitmq = new RabbitMQService();
