import { prisma } from '../lib/prisma';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

const TARGETS_BASE_PATH = process.env.PROMETHEUS_TARGETS_PATH || '/home/ubuntu/NodePrism/infrastructure/docker/prometheus/targets';

interface PrometheusTarget {
  targets: string[];
  labels: Record<string, string>;
}

/**
 * Generate Prometheus target files for service discovery
 * This creates JSON files that Prometheus will scrape to discover targets
 */
// Passive exporter types that don't send heartbeats - include them even if not marked RUNNING
// since their status depends on whether we can scrape them
const PASSIVE_EXPORTER_TYPES = ['NODE_EXPORTER', 'MYSQL_EXPORTER', 'POSTGRES_EXPORTER', 'MONGODB_EXPORTER', 'NGINX_EXPORTER', 'APACHE_EXPORTER', 'REDIS_EXPORTER', 'LIBVIRT_EXPORTER', 'LITESPEED_EXPORTER', 'EXIM_EXPORTER', 'CPANEL_EXPORTER'];

export async function generateTargetFiles(): Promise<void> {
  try {
    // Include all servers (not just ONLINE) for passive exporters.
    // Prometheus will determine reachability via scrape — this avoids a chicken-and-egg
    // problem where new servers can't get scraped because heartbeat cleanup marks them
    // OFFLINE before Prometheus ever discovers them.
    const servers = await prisma.server.findMany({
      include: {
        agents: {
          where: {
            OR: [
              // Include all passive exporters regardless of status (they may recover)
              { type: { in: PASSIVE_EXPORTER_TYPES as any } },
              // For active agents, only include if RUNNING
              { status: 'RUNNING' },
            ],
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
      'redis-exporter': [],
      'libvirt-exporter': [],
      'litespeed-exporter': [],
      'exim-exporter': [],
      'cpanel-exporter': [],
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
          case 'REDIS_EXPORTER':
            targetsByType['redis-exporter'].push(target);
            break;
          case 'LIBVIRT_EXPORTER':
            targetsByType['libvirt-exporter'].push(target);
            break;
          case 'LITESPEED_EXPORTER':
            targetsByType['litespeed-exporter'].push(target);
            break;
          case 'EXIM_EXPORTER':
            targetsByType['exim-exporter'].push(target);
            break;
          case 'CPANEL_EXPORTER':
            targetsByType['cpanel-exporter'].push(target);
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
    'redis-exporter': 'REDIS_EXPORTER',
    'libvirt-exporter': 'LIBVIRT_EXPORTER',
    'litespeed-exporter': 'LITESPEED_EXPORTER',
    'exim-exporter': 'EXIM_EXPORTER',
    'cpanel-exporter': 'CPANEL_EXPORTER',
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
