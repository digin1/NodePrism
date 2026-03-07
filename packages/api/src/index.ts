import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer, ServerOptions } from 'https';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { generalLimiter, initRateLimiting } from './middleware/rateLimit';
import { routes } from './routes';
import { startHeartbeatCleanup, stopHeartbeatCleanup } from './services/heartbeatCleanup';
import { startMetricCollector, stopMetricCollector } from './services/metricCollector';
import { startHousekeeping, stopHousekeeping } from './services/housekeeping';
import { startAutoDiscovery, stopAutoDiscovery } from './services/autoDiscoveryService';
import { setEventLoggerSocket, logSystemStartup } from './services/eventLogger';
import { prisma } from './lib/prisma';
import { metricsMiddleware, metricsRegistry, setWebSocketConnections } from './services/apiMetrics';

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();

// TLS/SSL configuration
const SSL_ENABLED = process.env.SSL_ENABLED === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/app/certs/server.key';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/app/certs/server.crt';
const SSL_CA_PATH = process.env.SSL_CA_PATH;

let server;

if (SSL_ENABLED) {
  try {
    const sslOptions: ServerOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH),
    };

    // Add CA certificate if provided (for client certificate validation)
    if (SSL_CA_PATH && fs.existsSync(SSL_CA_PATH)) {
      sslOptions.ca = fs.readFileSync(SSL_CA_PATH);
      sslOptions.requestCert = true;
      sslOptions.rejectUnauthorized = false; // Set to true to require valid client certs
    }

    server = createHttpsServer(sslOptions, app);
    logger.info('HTTPS server created with SSL/TLS enabled');
  } catch (error) {
    logger.error('Failed to load SSL certificates, falling back to HTTP', { error });
    server = createHttpServer(app);
  }
} else {
  server = createHttpServer(app);
}
// CORS configuration - support multiple origins from env
const corsOriginsEnv = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
const allowedOrigins: string[] = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://172.26.183.253:3000',
  ...corsOriginsEnv.split(',').map(o => o.trim()).filter(Boolean),
].filter((origin, index, self) => self.indexOf(origin) === index); // Remove duplicates

logger.info('CORS allowed origins:', { origins: allowedOrigins });

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

const PORT = process.env.PORT || process.env.API_PORT || 4000;

// Middleware
// Configure helmet to allow cross-origin requests
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to API routes
app.use('/api', generalLimiter);

// Prometheus metrics middleware
app.use(metricsMiddleware);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Track last known health status for degraded state notifications
let lastHealthStatus = 'ok';

// Enriched health check endpoint with dependency checks
app.get('/health', async (req, res) => {
  const start = Date.now();
  const dependencies: Record<string, { status: string; responseTime: number; error?: string }> = {};

  // Check PostgreSQL via Prisma
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dependencies.database = { status: 'ok', responseTime: Date.now() - dbStart };
  } catch (err: any) {
    dependencies.database = { status: 'down', responseTime: Date.now() - dbStart, error: err.message };
  }

  // Check Redis
  const redisStart = Date.now();
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  try {
    await new Promise<void>((resolve, reject) => {
      const net = require('net');
      const sock = net.createConnection({ host: redisHost, port: redisPort, timeout: 2000 }, () => {
        sock.end();
        resolve();
      });
      sock.on('error', (err: Error) => { sock.destroy(); reject(err); });
      sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
    });
    dependencies.redis = { status: 'ok', responseTime: Date.now() - redisStart };
  } catch (err: any) {
    dependencies.redis = { status: 'down', responseTime: Date.now() - redisStart, error: err.message };
  }

  // Check Prometheus
  const promStart = Date.now();
  const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  try {
    const axios = require('axios');
    await axios.get(`${prometheusUrl}/-/ready`, { timeout: 3000 });
    dependencies.prometheus = { status: 'ok', responseTime: Date.now() - promStart };
  } catch (err: any) {
    dependencies.prometheus = { status: 'down', responseTime: Date.now() - promStart, error: err.message };
  }

  const allOk = Object.values(dependencies).every(d => d.status === 'ok');
  const anyDown = Object.values(dependencies).some(d => d.status === 'down');
  const overallStatus = allOk ? 'ok' : anyDown ? 'degraded' : 'ok';

  // Emit WebSocket event on status change
  if (overallStatus !== lastHealthStatus) {
    logger.warn(`System health changed: ${lastHealthStatus} → ${overallStatus}`, { dependencies });
    io.emit('system:health', { status: overallStatus, dependencies });
    lastHealthStatus = overallStatus;
  }

  const statusCode = overallStatus === 'ok' ? 200 : 503;
  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: Date.now() - start,
    dependencies,
  });
});

// API routes
app.use('/api', routes);

// Static file serving for uploads (logos, etc.)
const uploadsPath = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  setWebSocketConnections(io.engine.clientsCount);

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
    setWebSocketConnections(io.engine.clientsCount);
  });

  // Subscribe to server updates
  socket.on('subscribe:server', (serverId: string) => {
    socket.join(`server:${serverId}`);
    logger.info(`Socket ${socket.id} subscribed to server:${serverId}`);
  });

  socket.on('unsubscribe:server', (serverId: string) => {
    socket.leave(`server:${serverId}`);
    logger.info(`Socket ${socket.id} unsubscribed from server:${serverId}`);
  });
});

// Make io available to routes
app.set('io', io);

// Error handler (must be last)
app.use(errorHandler);

// Start server
server.listen(PORT, async () => {
  const protocol = SSL_ENABLED ? 'HTTPS' : 'HTTP';
  logger.info(`API Gateway listening on ${protocol} port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (SSL_ENABLED) {
    logger.info('SSL/TLS is enabled');
  }

  // Initialize rate limiting
  await initRateLimiting();

  // Start heartbeat cleanup service
  startHeartbeatCleanup();

  // Initialize event logger with Socket.IO
  setEventLoggerSocket(io);

  // Start metric collector service with Socket.IO for real-time updates
  startMetricCollector(io);

  // Start housekeeping (log rotation, DB pruning, disk monitoring)
  startHousekeeping();

  // Start auto-discovery service (periodic service detection)
  startAutoDiscovery();

  // Log system startup event
  logSystemStartup();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopHeartbeatCleanup();
  stopMetricCollector();
  stopHousekeeping();
  stopAutoDiscovery();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { io };
