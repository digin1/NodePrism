import { prisma } from '../lib/prisma';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

const TARGETS_BASE_PATH = process.env.PROMETHEUS_TARGETS_PATH || '/home/digin/nodeprism-node-vitals/infrastructure/docker/prometheus/targets';

interface PrometheusTarget {
  targets: string[];
  labels: Record<string, string>;
}

/**
 * Generate Prometheus target files for service discovery
 * This creates JSON files that Prometheus will scrape to discover targets
 */
export async function generateTargetFiles(): Promise<void> {
  try {
    const servers = await prisma.server.findMany({
      where: {
        status: { in: ['ONLINE', 'WARNING', 'CRITICAL'] },
      },
      include: {
        agents: {
          where: {
            status: 'RUNNING',
          },
        },
      },
    });

    // Group servers by agent type
    const targetsByType: Record<string, PrometheusTarget[]> = {
      'node-exporter': [],
      'app-agent': [],
      'mysql-exporter': [],
      'postgres-exporter': [],
      'mongodb-exporter': [],
      'nginx-exporter': [],
      'apache-exporter': [],
    };

    for (const server of servers) {
      const baseLabels = {
        server_id: server.id,
        hostname: server.hostname,
        environment: server.environment.toLowerCase(),
        ...(server.region && { region: server.region }),
      };

      for (const agent of server.agents) {
        const targetAddress = `${server.ipAddress}:${agent.port}`;
        const target: PrometheusTarget = {
          targets: [targetAddress],
          labels: {
            ...baseLabels,
            agent_type: agent.type.toLowerCase(),
          },
        };

        switch (agent.type) {
          case 'NODE_EXPORTER':
            targetsByType['node-exporter'].push(target);
            break;
          case 'APP_AGENT':
            targetsByType['app-agent'].push(target);
            break;
          case 'MYSQL_EXPORTER':
            targetsByType['mysql-exporter'].push(target);
            break;
          case 'POSTGRES_EXPORTER':
            targetsByType['postgres-exporter'].push(target);
            break;
          case 'MONGODB_EXPORTER':
            targetsByType['mongodb-exporter'].push(target);
            break;
          case 'NGINX_EXPORTER':
            targetsByType['nginx-exporter'].push(target);
            break;
          case 'APACHE_EXPORTER':
            targetsByType['apache-exporter'].push(target);
            break;
        }
      }
    }

    // Write target files
    for (const [agentType, targets] of Object.entries(targetsByType)) {
      const targetDir = join(TARGETS_BASE_PATH, agentType);

      // Ensure directory exists
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      const targetFile = join(targetDir, 'targets.json');
      writeFileSync(targetFile, JSON.stringify(targets, null, 2));

      logger.info(`Generated ${agentType} targets file with ${targets.length} targets`);
    }

    logger.info('Target files generation complete');
  } catch (error) {
    logger.error('Failed to generate target files', { error });
    throw error;
  }
}

/**
 * Generate target file for a specific agent type
 */
export async function generateTargetFileForType(agentType: string): Promise<void> {
  const typeMap: Record<string, string> = {
    'node-exporter': 'NODE_EXPORTER',
    'app-agent': 'APP_AGENT',
    'mysql-exporter': 'MYSQL_EXPORTER',
    'postgres-exporter': 'POSTGRES_EXPORTER',
    'mongodb-exporter': 'MONGODB_EXPORTER',
    'nginx-exporter': 'NGINX_EXPORTER',
    'apache-exporter': 'APACHE_EXPORTER',
  };

  const dbType = typeMap[agentType];
  if (!dbType) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  const agents = await prisma.agent.findMany({
    where: {
      type: dbType as any,
      status: 'RUNNING',
    },
    include: {
      server: true,
    },
  });

  const targets: PrometheusTarget[] = agents.map((agent) => ({
    targets: [`${agent.server.ipAddress}:${agent.port}`],
    labels: {
      server_id: agent.server.id,
      hostname: agent.server.hostname,
      environment: agent.server.environment.toLowerCase(),
      ...(agent.server.region && { region: agent.server.region }),
      agent_type: agentType,
    },
  }));

  const targetDir = join(TARGETS_BASE_PATH, agentType);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const targetFile = join(targetDir, 'targets.json');
  writeFileSync(targetFile, JSON.stringify(targets, null, 2));

  logger.info(`Generated ${agentType} targets file with ${targets.length} targets`);
}

/**
 * Trigger Prometheus config reload
 */
export async function reloadPrometheus(): Promise<boolean> {
  try {
    const axios = (await import('axios')).default;
    await axios.post(`${process.env.PROMETHEUS_URL || 'http://localhost:9090'}/-/reload`);
    logger.info('Prometheus configuration reloaded');
    return true;
  } catch (error) {
    logger.warn('Failed to reload Prometheus (this is normal if lifecycle API is disabled)');
    return false;
  }
}
