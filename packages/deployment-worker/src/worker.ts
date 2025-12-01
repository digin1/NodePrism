import amqp from 'amqplib';
import type { Channel, ConsumeMessage, ChannelModel } from 'amqplib';
import { SSHDeployer } from './deployer';
import { StatusReporter } from './status-reporter';
import { logger } from './utils/logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://nodeprism:${DB_PASSWORD}@localhost:5672';
const QUEUE_NAME = 'deployment_jobs';

export interface DeploymentJob {
  id: string;
  serverId: string;
  hostname: string;
  ipAddress: string;
  sshPort: number;
  sshUsername: string;
  agentType: string;
  deploymentId: string;
}

export class DeploymentWorker {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private deployer: SSHDeployer;
  private statusReporter: StatusReporter;

  constructor() {
    this.deployer = new SSHDeployer();
    this.statusReporter = new StatusReporter();
  }

  async start(): Promise<void> {
    try {
      logger.info('Connecting to RabbitMQ...', { url: RABBITMQ_URL.replace(/:[^:@]+@/, ':****@') });

      const connection = await amqp.connect(RABBITMQ_URL);
      this.connection = connection;
      const channel = await connection.createChannel();
      this.channel = channel;

      // Ensure queue exists
      await channel.assertQueue(QUEUE_NAME, {
        durable: true,
      });

      // Set prefetch to 1 for fair dispatch
      await channel.prefetch(1);

      logger.info(`Waiting for deployment jobs on queue: ${QUEUE_NAME}`);

      // Start consuming messages
      await channel.consume(QUEUE_NAME, this.handleMessage.bind(this), {
        noAck: false,
      });
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      logger.info('Disconnected from RabbitMQ');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection', { error });
    }
  }

  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;

    const startTime = Date.now();
    let job: DeploymentJob | null = null;

    try {
      job = JSON.parse(msg.content.toString()) as DeploymentJob;
      logger.info('Received deployment job', {
        jobId: job.id,
        serverId: job.serverId,
        hostname: job.hostname,
        agentType: job.agentType,
      });

      // Mark deployment as started
      await this.statusReporter.markStarted(job.deploymentId, job.serverId);

      // Execute deployment
      const result = await this.deployer.deploy(job);

      if (result.success) {
        logger.info('Deployment completed successfully', {
          jobId: job.id,
          hostname: job.hostname,
          duration: Date.now() - startTime,
        });

        // Report success
        await this.statusReporter.markCompleted(job.deploymentId, job.serverId, job.agentType);

        // Acknowledge the message
        this.channel.ack(msg);
      } else {
        logger.error('Deployment failed', {
          jobId: job.id,
          hostname: job.hostname,
          error: result.error,
        });

        // Report failure
        await this.statusReporter.markFailed(job.deploymentId, job.serverId, result.error || 'Unknown error');

        // Reject and don't requeue (send to dead letter queue if configured)
        this.channel.nack(msg, false, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing deployment job', {
        error: errorMessage,
        jobId: job?.id,
      });

      // Report failure if we have job info
      if (job) {
        await this.statusReporter.markFailed(job.deploymentId, job.serverId, errorMessage);
      }

      // Reject the message
      this.channel.nack(msg, false, false);
    }
  }
}
