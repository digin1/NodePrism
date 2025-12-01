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

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
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

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
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

  // Start metric collector service with Socket.IO for real-time updates
  startMetricCollector(io);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopHeartbeatCleanup();
  stopMetricCollector();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { io };
