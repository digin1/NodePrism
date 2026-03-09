import axios, { AxiosError } from 'axios';
import { AgentConfig, getLocalIpAddress } from './config';
import { logger } from './logger';

interface RegistrationResponse {
  success: boolean;
  data?: {
    agentId: string;
    serverId: string;
    hostname: string;
    message: string;
  };
  error?: string;
}

interface HeartbeatResponse {
  success: boolean;
  data?: {
    acknowledged: boolean;
    serverStatus: string;
  };
  error?: string;
  code?: string;
}

export class AgentRegistration {
  private config: AgentConfig;
  private agentId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private maxRetries = Infinity;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async register(): Promise<string> {
    const ipAddress = getLocalIpAddress();
    const hostname = this.config.agent.hostname || require('os').hostname();

    logger.info(`Registering agent with manager at ${this.config.manager.url}`);
    logger.info(`Agent type: ${this.config.agent.type}, Port: ${this.config.agent.port}`);
    logger.info(`Hostname: ${hostname}, IP: ${ipAddress}`);

    try {
      const response = await axios.post<RegistrationResponse>(
        `${this.config.manager.url}/api/agents/register`,
        {
          hostname,
          ipAddress,
          agentType: this.config.agent.type,
          port: this.config.agent.port,
          version: this.config.agent.version,
          metadata: {
            registeredAt: new Date().toISOString(),
            platform: process.platform,
            nodeVersion: process.version,
          },
        },
        {
          headers: this.config.manager.apiKey
            ? { Authorization: `Bearer ${this.config.manager.apiKey}` }
            : {},
          timeout: 10000,
        }
      );

      if (response.data.success && response.data.data) {
        this.agentId = response.data.data.agentId;
        this.retryCount = 0;
        logger.info(`Registration successful! Agent ID: ${this.agentId}`);
        logger.info(`Server ID: ${response.data.data.serverId}`);
        return this.agentId;
      }

      throw new Error(response.data.error || 'Registration failed');
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.code === 'ECONNREFUSED') {
          logger.error(`Cannot connect to manager at ${this.config.manager.url}`);
          logger.error('Make sure the manager is running and accessible');
        } else {
          logger.error(`Registration failed: ${error.message}`);
        }
      } else {
        logger.error('Registration failed:', error);
      }
      throw error;
    }
  }

  async registerWithRetry(): Promise<string> {
    while (this.retryCount < this.maxRetries) {
      try {
        return await this.register();
      } catch (error) {
        this.retryCount++;
        if (this.retryCount < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
          logger.info(`Retrying registration in ${delay / 1000}s (attempt ${this.retryCount})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`Failed to register after ${this.maxRetries} attempts`);
  }

  async sendHeartbeat(): Promise<void> {
    if (!this.agentId) {
      logger.warn('Cannot send heartbeat: not registered');
      return;
    }

    try {
      const response = await axios.post<HeartbeatResponse>(
        `${this.config.manager.url}/api/agents/heartbeat`,
        {
          agentId: this.agentId,
          status: 'running',
          metrics: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
          },
        },
        {
          headers: this.config.manager.apiKey
            ? { Authorization: `Bearer ${this.config.manager.apiKey}` }
            : {},
          timeout: 5000,
        }
      );

      if (response.data.success) {
        logger.debug('Heartbeat sent successfully');
      } else if (response.data.code === 'AGENT_NOT_FOUND') {
        logger.warn('Agent not found on server, re-registering...');
        await this.register();
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 404) {
          logger.warn('Agent not found, re-registering...');
          try {
            await this.register();
          } catch (regError) {
            logger.error('Re-registration failed:', regError);
          }
        } else {
          logger.warn(`Heartbeat failed: ${error.message}`);
        }
      } else {
        logger.warn('Heartbeat failed:', error);
      }
    }
  }

  startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    logger.info(`Starting heartbeat every ${this.config.heartbeat.intervalMs / 1000}s`);

    // Send initial heartbeat
    this.sendHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeat.intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Heartbeat stopped');
    }
  }

  async unregister(): Promise<void> {
    if (!this.agentId) {
      return;
    }

    this.stopHeartbeat();

    try {
      await axios.post(
        `${this.config.manager.url}/api/agents/unregister`,
        { agentId: this.agentId },
        {
          headers: this.config.manager.apiKey
            ? { Authorization: `Bearer ${this.config.manager.apiKey}` }
            : {},
          timeout: 5000,
        }
      );
      logger.info('Agent unregistered successfully');
    } catch (error) {
      logger.warn('Failed to unregister agent:', error);
    }

    this.agentId = null;
  }

  getAgentId(): string | null {
    return this.agentId;
  }
}
