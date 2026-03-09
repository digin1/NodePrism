import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// Helper to safely get IP address (handles IPv4 and IPv6)
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// Configuration
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const RATE_LIMIT_AUTH_MAX = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10', 10); // Stricter for auth
const RATE_LIMIT_AGENT_MAX = parseInt(process.env.RATE_LIMIT_AGENT_MAX || '300', 10); // More lenient for agents

// Custom key generator - use IP + user ID if authenticated
function keyGenerator(req: Request): string {
  const userId = (req as any).user?.userId;
  const ip = getClientIp(req);

  if (userId) {
    return `user:${userId}`;
  }

  return `ip:${ip}`;
}

// Rate limit exceeded handler
function onLimitReached(req: Request, res: Response): void {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    path: req.path,
    userId: (req as any).user?.userId,
  });
}

// Skip rate limiting for certain paths
function skip(req: Request): boolean {
  // Skip health checks
  if (req.path === '/health') {
    return true;
  }

  // Skip if rate limiting is disabled
  if (!RATE_LIMIT_ENABLED) {
    return true;
  }

  return false;
}

/**
 * General API rate limiter
 * 100 requests per minute per IP/user
 */
export const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  skip,
  validate: false, // Disable validation - we handle IP extraction ourselves
  handler: (req, res, next, options) => {
    onLimitReached(req, res);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Strict rate limiter for authentication endpoints
 * 10 requests per minute to prevent brute force
 */
export const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_AUTH_MAX,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // For auth, always use IP to prevent account enumeration
    return `auth:${getClientIp(req)}`;
  },
  skip: () => !RATE_LIMIT_ENABLED,
  validate: false, // Disable validation - we handle IP extraction ourselves
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: getClientIp(req),
      path: req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Agent rate limiter - more lenient for agent heartbeats/registrations
 * 300 requests per minute per IP
 */
export const agentLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_AGENT_MAX,
  message: {
    success: false,
    error: 'Too many agent requests, please try again later',
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `agent:${getClientIp(req)}`;
  },
  skip: () => !RATE_LIMIT_ENABLED,
  validate: false, // Disable validation - we handle IP extraction ourselves
  handler: (req, res, next, options) => {
    logger.warn('Agent rate limit exceeded', {
      ip: getClientIp(req),
      path: req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Metrics query rate limiter - prevent heavy Prometheus queries
 * 30 requests per minute
 */
export const metricsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 30,
  message: {
    success: false,
    error: 'Too many metrics queries, please try again later',
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  skip: () => !RATE_LIMIT_ENABLED,
  validate: false, // Disable validation - we handle IP extraction ourselves
  handler: (req, res, next, options) => {
    logger.warn('Metrics rate limit exceeded', {
      ip: getClientIp(req),
      path: req.path,
      userId: (req as any).user?.userId,
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Webhook rate limiter - for AlertManager and Slack interaction endpoints
 * 60 requests per minute per IP (allows burst for grouped alerts)
 */
export const webhookLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 60,
  message: {
    success: false,
    error: 'Too many webhook requests, please try again later',
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `webhook:${getClientIp(req)}`;
  },
  skip: () => !RATE_LIMIT_ENABLED,
  validate: false,
  handler: (req, res, next, options) => {
    logger.warn('Webhook rate limit exceeded', {
      ip: getClientIp(req),
      path: req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Initialize rate limiting (call during startup)
 */
export async function initRateLimiting(): Promise<void> {
  if (RATE_LIMIT_ENABLED) {
    logger.info('Rate limiting initialized with in-memory store', {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      authMax: RATE_LIMIT_AUTH_MAX,
      agentMax: RATE_LIMIT_AGENT_MAX,
    });
  } else {
    logger.info('Rate limiting is disabled');
  }
}
