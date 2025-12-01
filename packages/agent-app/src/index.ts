import dotenv from 'dotenv';
import express from 'express';
import { collectDefaultMetrics, Registry, Counter, Gauge } from 'prom-client';
import { loadConfig, getLocalIpAddress } from './config';
import { AgentRegistration } from './registration';
import { logger } from './logger';

// Load environment variables
dotenv.config();

const config = loadConfig();
const app = express();
const register = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register });

// Custom metrics
const agentInfo = new Gauge({
  name: 'nodeprism_agent_info',
  help: 'Agent information',
  labelNames: ['version', 'type', 'hostname'],
  registers: [register],
});

const heartbeatTotal = new Counter({
  name: 'nodeprism_agent_heartbeats_total',
  help: 'Total number of heartbeats sent',
  registers: [register],
});

const registrationStatus = new Gauge({
  name: 'nodeprism_agent_registered',
  help: 'Agent registration status (1 = registered, 0 = not registered)',
  registers: [register],
});

// Set agent info
agentInfo.labels(config.agent.version, config.agent.type, config.agent.hostname || 'unknown').set(1);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agentId: registration?.getAgentId(),
    uptime: process.uptime(),
  });
});

// Agent info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'NodePrism Agent',
    version: config.agent.version,
    type: config.agent.type,
    hostname: config.agent.hostname,
    ipAddress: getLocalIpAddress(),
    port: config.agent.port,
    agentId: registration?.getAgentId(),
    uptime: process.uptime(),
  });
});

let registration: AgentRegistration;

async function main() {
  logger.info('='.repeat(50));
  logger.info('NodePrism Agent');
  logger.info('='.repeat(50));
  logger.info(`Type: ${config.agent.type}`);
  logger.info(`Port: ${config.agent.port}`);
  logger.info(`Manager URL: ${config.manager.url}`);
  logger.info(`IP Address: ${getLocalIpAddress()}`);
  logger.info(`Hostname: ${config.agent.hostname}`);
  logger.info('='.repeat(50));

  // Start metrics server first
  const server = app.listen(config.agent.port, '0.0.0.0', () => {
    logger.info(`Metrics server listening on port ${config.agent.port}`);
  });

  // Create registration handler
  registration = new AgentRegistration(config);

  // Register with manager
  try {
    await registration.registerWithRetry();
    registrationStatus.set(1);

    // Start heartbeat
    registration.startHeartbeat();

    // Increment heartbeat counter on each heartbeat
    const originalSendHeartbeat = registration.sendHeartbeat.bind(registration);
    registration.sendHeartbeat = async () => {
      await originalSendHeartbeat();
      heartbeatTotal.inc();
    };
  } catch (error) {
    logger.error('Failed to register with manager. Agent will run in standalone mode.');
    logger.error('Metrics will still be available at /metrics endpoint');
    registrationStatus.set(0);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);

    // Unregister from manager
    if (registration) {
      await registration.unregister();
    }

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.warn('Force exiting after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
