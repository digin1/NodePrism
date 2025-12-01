import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from root .env file
const rootDir = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(rootDir, '.env') });

// Helper to build database URL from components
function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'nodeprism';
  const user = process.env.DB_USER || 'nodeprism';
  const password = process.env.DB_PASSWORD || 'nodeprism123';
  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

// Helper to build Redis URL from components
function buildRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;
  if (password) {
    return `redis://:${password}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}

// Helper to build RabbitMQ URL from components
function buildRabbitmqUrl(): string {
  if (process.env.RABBITMQ_URL) return process.env.RABBITMQ_URL;
  const host = process.env.RABBITMQ_HOST || 'localhost';
  const port = process.env.RABBITMQ_PORT || '5672';
  const user = process.env.RABBITMQ_USER || 'nodeprism';
  const password = process.env.RABBITMQ_PASSWORD || 'nodeprism123';
  return `amqp://${user}:${password}@${host}:${port}`;
}

// Helper to build simple HTTP URLs
function buildHttpUrl(envUrl: string | undefined, hostEnv: string, portEnv: string, defaultHost: string, defaultPort: string): string {
  if (envUrl) return envUrl;
  const host = process.env[hostEnv] || defaultHost;
  const port = process.env[portEnv] || defaultPort;
  return `http://${host}:${port}`;
}

export const config = {
  // General
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL || 'info',

  // API Server
  api: {
    port: parseInt(process.env.API_PORT || process.env.PORT || '4000', 10),
    host: process.env.API_HOST || 'localhost',
  },

  // Web UI
  web: {
    port: parseInt(process.env.WEB_PORT || '3000', 10),
    apiUrl: process.env.NEXT_PUBLIC_API_URL || '',
  },

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'nodeprism',
    user: process.env.DB_USER || 'nodeprism',
    password: process.env.DB_PASSWORD || 'nodeprism123',
    url: buildDatabaseUrl(),
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    url: buildRedisUrl(),
  },

  // RabbitMQ
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    user: process.env.RABBITMQ_USER || 'nodeprism',
    password: process.env.RABBITMQ_PASSWORD || 'nodeprism123',
    url: buildRabbitmqUrl(),
  },

  // Prometheus
  prometheus: {
    host: process.env.PROMETHEUS_HOST || 'localhost',
    port: parseInt(process.env.PROMETHEUS_PORT || '9090', 10),
    url: buildHttpUrl(process.env.PROMETHEUS_URL, 'PROMETHEUS_HOST', 'PROMETHEUS_PORT', 'localhost', '9090'),
  },

  // Loki
  loki: {
    host: process.env.LOKI_HOST || 'localhost',
    port: parseInt(process.env.LOKI_PORT || '3100', 10),
    url: buildHttpUrl(process.env.LOKI_URL, 'LOKI_HOST', 'LOKI_PORT', 'localhost', '3100'),
  },

  // Grafana
  grafana: {
    host: process.env.GRAFANA_HOST || 'localhost',
    port: parseInt(process.env.GRAFANA_PORT || '3030', 10),
    user: process.env.GRAFANA_USER || 'admin',
    password: process.env.GRAFANA_PASSWORD || 'admin',
    url: buildHttpUrl(process.env.GRAFANA_URL, 'GRAFANA_HOST', 'GRAFANA_PORT', 'localhost', '3030'),
  },

  // AlertManager
  alertmanager: {
    host: process.env.ALERTMANAGER_HOST || 'localhost',
    port: parseInt(process.env.ALERTMANAGER_PORT || '9093', 10),
    url: buildHttpUrl(process.env.ALERTMANAGER_URL, 'ALERTMANAGER_HOST', 'ALERTMANAGER_PORT', 'localhost', '9093'),
  },

  // Authentication
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-key',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // CORS
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()),
  },

  // Status Sync
  statusSync: {
    interval: parseInt(process.env.STATUS_SYNC_INTERVAL || '30000', 10),
  },

  // Deployment
  deployment: {
    sshTimeout: parseInt(process.env.SSH_TIMEOUT || '30000', 10),
    defaultSshUser: process.env.DEFAULT_SSH_USER || 'root',
  },
};

export default config;
