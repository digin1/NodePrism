import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { generateTargetFiles, reloadPrometheus } from './targetGenerator';
import { logServerStatusChange, logAgentStatusChange, logHeartbeatMissed } from './eventLogger';

// Configuration
const HEARTBEAT_TIMEOUT_MINUTES = parseInt(process.env.HEARTBEAT_TIMEOUT_MINUTES || '7', 10);
const CLEANUP_INTERVAL_MINUTES = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '2', 10);
const OFFLINE_THRESHOLD_MINUTES = parseInt(process.env.OFFLINE_THRESHOLD_MINUTES || '15', 10);

let cleanupInterval: NodeJS.Timeout | null = null;
let deepHealthInterval: NodeJS.Timeout | null = null;
const DEEP_HEALTH_CHECK_INTERVAL_MINUTES = parseInt(process.env.DEEP_HEALTH_CHECK_INTERVAL_MINUTES || '5', 10);

/**
 * Mark stale agents as offline/stopped
 * An agent is considered stale if it hasn't sent a heartbeat within the timeout period
 */
export async function cleanupStaleAgents(): Promise<{
  staleAgents: number;
  offlineServers: number;
  warningServers: number;
}> {
  const timeoutThreshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MINUTES * 60 * 1000);
  const offlineThreshold = new Date(Date.now() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

  logger.info('Running heartbeat cleanup...', {
    timeoutMinutes: HEARTBEAT_TIMEOUT_MINUTES,
    offlineThresholdMinutes: OFFLINE_THRESHOLD_MINUTES,
  });

  try {
    // Find agents that are still marked as RUNNING but haven't sent a heartbeat recently
    const staleAgents = await prisma.agent.findMany({
      where: {
        status: 'RUNNING',
        lastHealthCheck: {
          lt: timeoutThreshold,
        },
      },
      include: {
        server: true,
      },
    });

    if (staleAgents.length === 0) {
      logger.debug('No stale agents found');
      return { staleAgents: 0, offlineServers: 0, warningServers: 0 };
    }

    logger.info(`Found ${staleAgents.length} stale agent(s)`);

    // Track affected servers
    const affectedServerIds = new Set<string>();

    // Determine status for each stale agent
    for (const agent of staleAgents) {
      const lastHealthCheck = agent.lastHealthCheck;
      const isOffline = lastHealthCheck && lastHealthCheck < offlineThreshold;

      // Mark agent as STOPPED (stale) or FAILED (offline too long)
      const newStatus = isOffline ? 'FAILED' : 'STOPPED';

      const oldStatus = agent.status;
      await prisma.agent.update({
        where: { id: agent.id },
        data: { status: newStatus },
      });

      affectedServerIds.add(agent.serverId);

      logger.info(`Agent ${agent.type} on ${agent.server.hostname} marked as ${newStatus}`, {
        agentId: agent.id,
        lastHealthCheck: lastHealthCheck?.toISOString(),
        serverId: agent.serverId,
      });

      // Log event for agent status change
      await logAgentStatusChange(
        agent.serverId,
        agent.type,
        oldStatus,
        newStatus,
        agent.server.hostname
      );

      // Log heartbeat missed event
      if (isOffline) {
        await logHeartbeatMissed(agent.serverId, agent.server.hostname, lastHealthCheck);
      }
    }

    // Update server statuses based on their agents
    let offlineServers = 0;
    let warningServers = 0;

    for (const serverId of affectedServerIds) {
      const serverAgents = await prisma.agent.findMany({
        where: { serverId },
      });

      const hasRunning = serverAgents.some(a => a.status === 'RUNNING');
      const hasFailed = serverAgents.some(a => a.status === 'FAILED');
      const hasStopped = serverAgents.some(a => a.status === 'STOPPED');

      let serverStatus: string;

      if (!hasRunning && hasFailed) {
        serverStatus = 'CRITICAL';
        offlineServers++;
      } else if (!hasRunning && hasStopped) {
        serverStatus = 'OFFLINE';
        offlineServers++;
      } else if (hasRunning && (hasFailed || hasStopped)) {
        serverStatus = 'WARNING';
        warningServers++;
      } else if (hasRunning) {
        serverStatus = 'ONLINE';
      } else {
        serverStatus = 'OFFLINE';
        offlineServers++;
      }

      const serverBefore = await prisma.server.findUnique({ where: { id: serverId } });
      const oldServerStatus = serverBefore?.status || 'UNKNOWN';

      await prisma.server.update({
        where: { id: serverId },
        data: { status: serverStatus as any },
      });

      logger.info(`Server ${serverBefore?.hostname} status updated to ${serverStatus}`);

      // Log event for server status change (only if status actually changed)
      if (oldServerStatus !== serverStatus && serverBefore) {
        await logServerStatusChange(
          serverId,
          oldServerStatus,
          serverStatus,
          serverBefore.hostname
        );
      }
    }

    // Regenerate Prometheus targets if any agents went offline
    if (staleAgents.length > 0) {
      try {
        await generateTargetFiles();
        await reloadPrometheus();
        logger.info('Prometheus targets regenerated after cleanup');
      } catch (err) {
        logger.warn('Failed to regenerate Prometheus targets during cleanup', { error: err });
      }
    }

    return {
      staleAgents: staleAgents.length,
      offlineServers,
      warningServers,
    };
  } catch (error) {
    logger.error('Error during heartbeat cleanup', { error });
    throw error;
  }
}

/**
 * Start the heartbeat cleanup scheduler
 */
export function startHeartbeatCleanup(): void {
  if (cleanupInterval) {
    logger.warn('Heartbeat cleanup already running');
    return;
  }

  // Run immediately on startup
  cleanupStaleAgents().catch(err => {
    logger.error('Initial heartbeat cleanup failed', { error: err });
  });

  // Schedule periodic cleanup
  const intervalMs = CLEANUP_INTERVAL_MINUTES * 60 * 1000;
  cleanupInterval = setInterval(() => {
    cleanupStaleAgents().catch(err => {
      logger.error('Periodic heartbeat cleanup failed', { error: err });
    });
  }, intervalMs);

  // Schedule periodic deep health check (for recovery detection)
  const deepHealthIntervalMs = DEEP_HEALTH_CHECK_INTERVAL_MINUTES * 60 * 1000;
  deepHealthInterval = setInterval(() => {
    deepHealthCheck().catch(err => {
      logger.error('Deep health check failed', { error: err });
    });
  }, deepHealthIntervalMs);

  logger.info(`Heartbeat cleanup started (interval: ${CLEANUP_INTERVAL_MINUTES} minutes)`);
  logger.info(`Deep health check started (interval: ${DEEP_HEALTH_CHECK_INTERVAL_MINUTES} minutes)`);
}

/**
 * Stop the heartbeat cleanup scheduler
 */
export function stopHeartbeatCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Heartbeat cleanup stopped');
  }
  if (deepHealthInterval) {
    clearInterval(deepHealthInterval);
    deepHealthInterval = null;
    logger.info('Deep health check stopped');
  }
}

/**
 * Check agent health status by IP address
 * This can be used to verify if an agent is actually responsive
 */
export async function checkAgentHealth(ipAddress: string, port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`http://${ipAddress}:${port}/metrics`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Perform deep health check on all agents
 * This actually tries to connect to each agent's metrics endpoint
 */
export async function deepHealthCheck(): Promise<{
  checked: number;
  healthy: number;
  unhealthy: number;
}> {
  logger.info('Running deep health check...');

  const agents = await prisma.agent.findMany({
    where: {
      status: { in: ['RUNNING', 'STOPPED', 'FAILED'] },
    },
    include: { server: true },
  });

  let healthy = 0;
  let unhealthy = 0;

  for (const agent of agents) {
    const isHealthy = await checkAgentHealth(agent.server.ipAddress, agent.port);

    if (isHealthy && agent.status !== 'RUNNING') {
      // Agent is back online
      const oldAgentStatus = agent.status;
      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: 'RUNNING',
          lastHealthCheck: new Date(),
        },
      });
      logger.info(`Agent ${agent.type} on ${agent.server.hostname} is back online`);

      // Log agent recovery event
      await logAgentStatusChange(
        agent.serverId,
        agent.type,
        oldAgentStatus,
        'RUNNING',
        agent.server.hostname
      );

      // Check if server should be marked as recovered (all agents now running)
      const serverAgents = await prisma.agent.findMany({
        where: { serverId: agent.serverId },
      });
      const allRunning = serverAgents.every(a => a.id === agent.id || a.status === 'RUNNING');

      if (allRunning) {
        const server = await prisma.server.findUnique({ where: { id: agent.serverId } });
        if (server && (server.status === 'OFFLINE' || server.status === 'CRITICAL' || server.status === 'WARNING')) {
          const oldServerStatus = server.status;
          await prisma.server.update({
            where: { id: agent.serverId },
            data: { status: 'ONLINE', lastSeen: new Date() },
          });
          logger.info(`Server ${agent.server.hostname} recovered - all agents online`);

          // Log server recovery event
          await logServerStatusChange(
            agent.serverId,
            oldServerStatus,
            'ONLINE',
            agent.server.hostname,
            'deep-health-check'
          );
        }
      }

      healthy++;
    } else if (!isHealthy && agent.status === 'RUNNING') {
      // Agent has gone offline
      await prisma.agent.update({
        where: { id: agent.id },
        data: { status: 'STOPPED' },
      });
      logger.info(`Agent ${agent.type} on ${agent.server.hostname} is unresponsive`);
      unhealthy++;
    } else if (isHealthy) {
      // Update last health check for healthy agents
      await prisma.agent.update({
        where: { id: agent.id },
        data: { lastHealthCheck: new Date() },
      });
      healthy++;
    } else {
      unhealthy++;
    }
  }

  // Regenerate targets if status changed
  if (unhealthy > 0 || healthy > 0) {
    try {
      await generateTargetFiles();
      await reloadPrometheus();
    } catch (err) {
      logger.warn('Failed to regenerate targets after deep health check', { error: err });
    }
  }

  logger.info(`Deep health check complete: ${healthy} healthy, ${unhealthy} unhealthy`);

  return {
    checked: agents.length,
    healthy,
    unhealthy,
  };
}
