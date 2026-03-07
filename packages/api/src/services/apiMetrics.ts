import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Create a custom registry so we don't mix with any default metrics
const register = new client.Registry();

// Default process metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// HTTP request counter
const httpRequestsTotal = new client.Counter({
  name: 'nodeprism_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'nodeprism_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Active WebSocket connections gauge
const wsConnectionsActive = new client.Gauge({
  name: 'nodeprism_websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

// HTTP errors counter
const httpErrorsTotal = new client.Counter({
  name: 'nodeprism_http_errors_total',
  help: 'Total number of HTTP error responses (4xx and 5xx)',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

/**
 * Normalize Express route path for metrics labels.
 * Replaces UUID-like segments and numeric IDs with :id placeholder.
 */
function normalizeRoute(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Express middleware to track request metrics.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics endpoint itself to avoid recursion
  if (req.path === '/metrics') {
    next();
    return;
  }

  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const route = normalizeRoute(req.path);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    end(labels);
    httpRequestsTotal.inc(labels);

    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });

  next();
}

/**
 * Track WebSocket connection count changes.
 */
export function setWebSocketConnections(count: number): void {
  wsConnectionsActive.set(count);
}

/**
 * Get the Prometheus registry for the /metrics endpoint.
 */
export { register as metricsRegistry };
