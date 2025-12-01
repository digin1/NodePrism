import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import * as net from 'net';

export interface DiscoveredService {
  type: 'mysql' | 'postgresql' | 'mongodb' | 'nginx' | 'apache' | 'redis' | 'rabbitmq';
  host: string;
  port: number;
  name?: string;
  version?: string;
}

export interface ServiceCheck {
  type: string;
  port: number;
  checkFunction: (host: string, port: number) => Promise<boolean>;
  nameProbe?: (host: string, port: number) => Promise<string | undefined>;
  versionProbe?: (host: string, port: number) => Promise<string | undefined>;
}

/**
 * Auto-Discovery Service
 * Automatically detects running services and suggests exporter configurations
 */
export class AutoDiscoveryService {
  private readonly serviceChecks: ServiceCheck[] = [
    {
      type: 'mysql',
      port: 3306,
      checkFunction: this.checkMySQL.bind(this),
      versionProbe: this.probeMySQLVersion.bind(this),
    },
    {
      type: 'postgresql',
      port: 5432,
      checkFunction: this.checkPostgreSQL.bind(this),
      versionProbe: this.probePostgreSQLVersion.bind(this),
    },
    {
      type: 'mongodb',
      port: 27017,
      checkFunction: this.checkMongoDB.bind(this),
      versionProbe: this.probeMongoDBVersion.bind(this),
    },
    {
      type: 'redis',
      port: 6379,
      checkFunction: this.checkRedis.bind(this),
      versionProbe: this.probeRedisVersion.bind(this),
    },
    {
      type: 'rabbitmq',
      port: 5672,
      checkFunction: this.checkRabbitMQ.bind(this),
      versionProbe: this.probeRabbitMQVersion.bind(this),
    },
    {
      type: 'nginx',
      port: 80,
      checkFunction: this.checkNginx.bind(this),
      nameProbe: this.probeNginxName.bind(this),
    },
    {
      type: 'apache',
      port: 80,
      checkFunction: this.checkApache.bind(this),
      nameProbe: this.probeApacheName.bind(this),
    },
  ];

  /**
   * Scan common ports and localhost for running services
   */
  async discoverServices(): Promise<DiscoveredService[]> {
    const discovered: DiscoveredService[] = [];
    const scanTargets = [
      { host: 'localhost', ports: [3306, 5432, 27017, 6379, 5672, 80, 8080, 8081] },
      { host: '127.0.0.1', ports: [3306, 5432, 27017, 6379, 5672, 80, 8080, 8081] },
    ];

    for (const target of scanTargets) {
      for (const port of target.ports) {
        for (const check of this.serviceChecks) {
          if (check.port === port) {
            try {
              const isRunning = await check.checkFunction(target.host, port);
              if (isRunning) {
                const service: DiscoveredService = {
                  type: check.type as any,
                  host: target.host,
                  port,
                };

                // Try to get additional info
                if (check.nameProbe) {
                  service.name = await check.nameProbe(target.host, port).catch(() => undefined);
                }
                if (check.versionProbe) {
                  service.version = await check
                    .versionProbe(target.host, port)
                    .catch(() => undefined);
                }

                discovered.push(service);
                logger.info(`Discovered ${check.type} service at ${target.host}:${port}`);
              }
            } catch (error) {
              // Service check failed, continue
            }
          }
        }
      }
    }

    return discovered;
  }

  /**
   * Generate Prometheus target configurations for discovered services
   */
  async generateTargetConfigs(
    discoveredServices: DiscoveredService[]
  ): Promise<Record<string, any[]>> {
    const configs: Record<string, any[]> = {};

    for (const service of discoveredServices) {
      const config = this.generateTargetConfig(service);
      if (config) {
        if (!configs[service.type]) {
          configs[service.type] = [];
        }
        configs[service.type].push(config);
      }
    }

    return configs;
  }

  /**
   * Generate target configuration for a single service
   */
  private generateTargetConfig(service: DiscoveredService): any | null {
    const labels: Record<string, string> = {
      __meta_service_type: service.type,
      __meta_service_host: service.host,
      __meta_service_port: service.port.toString(),
      __meta_discovered_at: new Date().toISOString(),
    };

    if (service.name) {
      labels.__meta_service_name = service.name;
    }
    if (service.version) {
      labels.__meta_service_version = service.version;
    }

    return {
      targets: [`${service.host}:${this.getExporterPort(service.type)}`],
      labels,
    };
  }

  /**
   * Get the default exporter port for a service type
   */
  private getExporterPort(serviceType: string): number {
    const portMap: Record<string, number> = {
      mysql: 9104,
      postgresql: 9187,
      mongodb: 9216,
      redis: 9121,
      rabbitmq: 15692,
      nginx: 9113,
      apache: 9117,
    };
    return portMap[serviceType] || 9100;
  }

  // Service check implementations

  private async checkMySQL(host: string, port: number): Promise<boolean> {
    return this.checkTCPConnection(host, port);
  }

  private async checkPostgreSQL(host: string, port: number): Promise<boolean> {
    return this.checkTCPConnection(host, port);
  }

  private async checkMongoDB(host: string, port: number): Promise<boolean> {
    return this.checkTCPConnection(host, port);
  }

  private async checkRedis(host: string, port: number): Promise<boolean> {
    return this.checkTCPConnection(host, port);
  }

  private async checkRabbitMQ(host: string, port: number): Promise<boolean> {
    return this.checkTCPConnection(host, port);
  }

  private async checkNginx(host: string, port: number): Promise<boolean> {
    try {
      // Check for nginx stub status endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${host}:${port}/status`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok && (response.headers.get('server')?.includes('nginx') || true);
    } catch {
      return false;
    }
  }

  private async checkApache(host: string, port: number): Promise<boolean> {
    try {
      // Check for apache server status endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${host}:${port}/server-status?auto`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok && (response.headers.get('server')?.includes('Apache') || true);
    } catch {
      return false;
    }
  }

  // Version probe implementations

  private async probeMySQLVersion(host: string, port: number): Promise<string | undefined> {
    // This would require a MySQL client connection
    // For now, return undefined
    return undefined;
  }

  private async probePostgreSQLVersion(host: string, port: number): Promise<string | undefined> {
    // This would require a PostgreSQL client connection
    return undefined;
  }

  private async probeMongoDBVersion(host: string, port: number): Promise<string | undefined> {
    // This would require a MongoDB client connection
    return undefined;
  }

  private async probeRedisVersion(host: string, port: number): Promise<string | undefined> {
    // This would require a Redis client connection
    return undefined;
  }

  private async probeRabbitMQVersion(host: string, port: number): Promise<string | undefined> {
    // This would require an AMQP connection
    return undefined;
  }

  private async probeNginxName(host: string, port: number): Promise<string | undefined> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${host}:${port}/status`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (response.ok) {
        return 'nginx';
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  private async probeApacheName(host: string, port: number): Promise<string | undefined> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${host}:${port}/server-status?auto`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (response.ok) {
        return 'apache';
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  /**
   * Basic TCP connection check
   */
  private async checkTCPConnection(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.connect(port, host, () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Run discovery and update Prometheus targets
   */
  async runDiscoveryAndUpdate(): Promise<void> {
    try {
      logger.info('Starting service auto-discovery...');

      const discovered = await this.discoverServices();
      const configs = await this.generateTargetConfigs(discovered);

      logger.info(`Discovered ${discovered.length} services:`, {
        services: discovered.map((s) => `${s.type} at ${s.host}:${s.port}`),
      });

      // Here you would write the configs to Prometheus target files
      // For now, just log them
      for (const [serviceType, targets] of Object.entries(configs)) {
        logger.info(`Generated ${targets.length} targets for ${serviceType}`);
      }

      // TODO: Write configs to /etc/prometheus/targets/ files
      // TODO: Reload Prometheus configuration
    } catch (error) {
      logger.error('Auto-discovery failed', { error });
    }
  }
}
