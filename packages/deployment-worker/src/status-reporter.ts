import axios, { AxiosInstance } from 'axios';
import { logger } from './utils/logger';

export type DeploymentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface StatusUpdate {
  deploymentId: string;
  serverId: string;
  status: DeploymentStatus;
  message?: string;
  error?: string;
  completedAt?: Date;
}

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.INTERNAL_API_KEY || '';

export class StatusReporter {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': API_KEY,
      },
    });
  }

  async updateStatus(update: StatusUpdate): Promise<boolean> {
    try {
      await this.client.patch(`/api/deployments/${update.deploymentId}`, {
        status: update.status,
        message: update.message,
        error: update.error,
        completedAt: update.completedAt,
      });

      logger.info('Deployment status updated', {
        deploymentId: update.deploymentId,
        status: update.status,
      });

      return true;
    } catch (error) {
      logger.error('Failed to update deployment status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        deploymentId: update.deploymentId,
      });
      return false;
    }
  }

  async updateServerAgentStatus(
    serverId: string,
    agentType: string,
    installed: boolean
  ): Promise<boolean> {
    try {
      await this.client.patch(`/api/servers/${serverId}/agents`, {
        agentType,
        installed,
        installedAt: installed ? new Date() : null,
      });

      logger.info('Server agent status updated', {
        serverId,
        agentType,
        installed,
      });

      return true;
    } catch (error) {
      logger.error('Failed to update server agent status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        serverId,
        agentType,
      });
      return false;
    }
  }

  async markStarted(deploymentId: string, serverId: string): Promise<void> {
    await this.updateStatus({
      deploymentId,
      serverId,
      status: 'IN_PROGRESS',
      message: 'Deployment started',
    });
  }

  async markCompleted(
    deploymentId: string,
    serverId: string,
    agentType: string
  ): Promise<void> {
    await this.updateStatus({
      deploymentId,
      serverId,
      status: 'COMPLETED',
      message: 'Agent deployed successfully',
      completedAt: new Date(),
    });

    await this.updateServerAgentStatus(serverId, agentType, true);
  }

  async markFailed(
    deploymentId: string,
    serverId: string,
    error: string
  ): Promise<void> {
    await this.updateStatus({
      deploymentId,
      serverId,
      status: 'FAILED',
      error,
      completedAt: new Date(),
    });
  }
}
