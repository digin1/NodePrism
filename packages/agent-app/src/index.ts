import dotenv from 'dotenv';
import express from 'express';
import { collectDefaultMetrics, Registry, Counter, Gauge, Histogram } from 'prom-client';
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

// Custom metrics registry for user-defined metrics
const customMetrics = new Map<string, any>();

// HTTP request metrics
const httpRequestsTotal = new Counter({
  name: 'nodeprism_agent_http_requests_total',
  help: 'Total number of HTTP requests to custom endpoints',
  labelNames: ['method', 'endpoint', 'status'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'nodeprism_agent_http_request_duration_seconds',
  help: 'Duration of HTTP requests to custom endpoints',
  labelNames: ['method', 'endpoint'],
  registers: [register],
});

// Set agent info
agentInfo
  .labels(config.agent.version, config.agent.type, config.agent.hostname || 'unknown')
  .set(1);

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

// Custom metrics endpoints
app.post('/metrics/counter/:name', express.json(), (req, res) => {
  const { name } = req.params;
  const { value = 1, labels = {}, help } = req.body;

  try {
    const metricName = `custom_${name}`;
    let counter = customMetrics.get(metricName);

    if (!counter) {
      counter = new Counter({
        name: metricName,
        help: help || `Custom counter: ${name}`,
        labelNames: Object.keys(labels),
        registers: [register],
      });
      customMetrics.set(metricName, counter);
    }

    counter.labels(...Object.values(labels)).inc(value);
    res.json({ success: true, metric: metricName });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/metrics/gauge/:name', express.json(), (req, res) => {
  const { name } = req.params;
  const { value, labels = {}, help } = req.body;

  try {
    const metricName = `custom_${name}`;
    let gauge = customMetrics.get(metricName);

    if (!gauge) {
      gauge = new Gauge({
        name: metricName,
        help: help || `Custom gauge: ${name}`,
        labelNames: Object.keys(labels),
        registers: [register],
      });
      customMetrics.set(metricName, gauge);
    }

    gauge.labels(...Object.values(labels)).set(value);
    res.json({ success: true, metric: metricName });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/metrics/histogram/:name', express.json(), (req, res) => {
  const { name } = req.params;
  const { value, labels = {}, help } = req.body;

  try {
    const metricName = `custom_${name}`;
    let histogram = customMetrics.get(metricName);

    if (!histogram) {
      histogram = new Histogram({
        name: metricName,
        help: help || `Custom histogram: ${name}`,
        labelNames: Object.keys(labels),
        registers: [register],
      });
      customMetrics.set(metricName, histogram);
    }

    histogram.labels(...Object.values(labels)).observe(value);
    res.json({ success: true, metric: metricName });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Middleware to track HTTP requests
app.use('/metrics', (req, res, next) => {
  const start = Date.now();
  const { method } = req;
  const endpoint = req.path;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.labels(method, endpoint, res.statusCode.toString()).inc();
    httpRequestDuration.labels(method, endpoint).observe(duration);
  });

  next();
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
