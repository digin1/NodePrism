import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import axios from 'axios';
import net from 'net';
import dns from 'dns';
import { exec } from 'child_process';
import { UptimeCheckType, UptimeCheckStatus } from '@prisma/client';

// Map of monitorId -> interval timer
const monitorIntervals = new Map<string, NodeJS.Timeout>();

// Master polling interval that syncs monitors from DB
let masterInterval: NodeJS.Timeout | null = null;
const MASTER_POLL_SECONDS = 30;

/**
 * Perform an HTTP/HTTPS check against a target URL
 */
async function checkHttp(
  target: string,
  method: string,
  timeout: number,
  expectedStatus: number | null,
  keyword: string | null,
  headers: Record<string, string> | null
): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string }> {
  const start = Date.now();
  try {
    const response = await axios({
      method: method as any,
      url: target,
      timeout: timeout * 1000,
      headers: headers || undefined,
      validateStatus: () => true, // Accept any status code
      maxRedirects: 5,
    });

    const responseTime = Date.now() - start;
    const statusCode = response.status;

    // Check expected status code
    if (expectedStatus && statusCode !== expectedStatus) {
      return {
        status: 'DOWN',
        responseTime,
        statusCode,
        message: `Expected status ${expectedStatus}, got ${statusCode}`,
      };
    }

    // Check for keyword in response body
    if (keyword) {
      const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (!body.includes(keyword)) {
        return {
          status: 'DOWN',
          responseTime,
          statusCode,
          message: `Keyword "${keyword}" not found in response`,
        };
      }
    }

    // Consider 4xx/5xx as DOWN if no explicit expected status was set
    if (!expectedStatus && statusCode >= 400) {
      return {
        status: 'DOWN',
        responseTime,
        statusCode,
        message: `HTTP ${statusCode}`,
      };
    }

    // Degraded if response time is over 2 seconds
    const checkStatus: UptimeCheckStatus = responseTime > 2000 ? 'DEGRADED' : 'UP';

    return {
      status: checkStatus,
      responseTime,
      statusCode,
      message: `HTTP ${statusCode} - ${responseTime}ms`,
    };
  } catch (error: any) {
    const responseTime = Date.now() - start;
    const message = error.code === 'ECONNABORTED'
      ? `Timeout after ${timeout}s`
      : error.code || error.message || 'Connection failed';
    return {
      status: 'DOWN',
      responseTime,
      statusCode: null,
      message,
    };
  }
}

/**
 * Perform a TCP connection check
 */
async function checkTcp(
  target: string,
  timeout: number
): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string }> {
  const start = Date.now();

  // Parse host:port from target
  const parts = target.split(':');
  const host = parts[0];
  const port = parseInt(parts[1] || '80', 10);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeout * 1000 });

    socket.on('connect', () => {
      const responseTime = Date.now() - start;
      socket.destroy();
      resolve({
        status: responseTime > 2000 ? 'DEGRADED' : 'UP',
        responseTime,
        statusCode: null,
        message: `TCP connection successful - ${responseTime}ms`,
      });
    });

    socket.on('timeout', () => {
      const responseTime = Date.now() - start;
      socket.destroy();
      resolve({
        status: 'DOWN',
        responseTime,
        statusCode: null,
        message: `TCP timeout after ${timeout}s`,
      });
    });

    socket.on('error', (err: any) => {
      const responseTime = Date.now() - start;
      socket.destroy();
      resolve({
        status: 'DOWN',
        responseTime,
        statusCode: null,
        message: err.code || err.message || 'TCP connection failed',
      });
    });
  });
}

/**
 * Perform a PING check using system ping command
 */
async function checkPing(
  target: string,
  timeout: number
): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string }> {
  const start = Date.now();

  return new Promise((resolve) => {
    exec(`ping -c 1 -W ${timeout} ${target}`, (error, stdout) => {
      const responseTime = Date.now() - start;

      if (error) {
        resolve({
          status: 'DOWN',
          responseTime,
          statusCode: null,
          message: 'Ping failed - host unreachable',
        });
        return;
      }

      // Extract round-trip time from ping output
      const rttMatch = stdout.match(/time[=<]([\d.]+)\s*ms/);
      const rtt = rttMatch ? parseFloat(rttMatch[1]) : responseTime;

      resolve({
        status: rtt > 500 ? 'DEGRADED' : 'UP',
        responseTime: Math.round(rtt),
        statusCode: null,
        message: `Ping successful - ${Math.round(rtt)}ms`,
      });
    });
  });
}

/**
 * Perform a DNS resolution check
 */
async function checkDns(
  target: string,
  timeout: number
): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string }> {
  const start = Date.now();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        status: 'DOWN',
        responseTime: Date.now() - start,
        statusCode: null,
        message: `DNS timeout after ${timeout}s`,
      });
    }, timeout * 1000);

    dns.resolve(target, (err, addresses) => {
      clearTimeout(timer);
      const responseTime = Date.now() - start;

      if (err) {
        resolve({
          status: 'DOWN',
          responseTime,
          statusCode: null,
          message: `DNS resolution failed: ${err.code || err.message}`,
        });
        return;
      }

      resolve({
        status: responseTime > 1000 ? 'DEGRADED' : 'UP',
        responseTime,
        statusCode: null,
        message: `Resolved to ${addresses.join(', ')} - ${responseTime}ms`,
      });
    });
  });
}

/**
 * Run a single check for a monitor and return the result (without storing)
 */
export async function runCheck(monitor: {
  id: string;
  type: UptimeCheckType;
  target: string;
  method: string;
  timeout: number;
  expectedStatus: number | null;
  keyword: string | null;
  headers: any;
}): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string }> {
  const headers = monitor.headers as Record<string, string> | null;

  switch (monitor.type) {
    case 'HTTP':
    case 'HTTPS':
      return checkHttp(monitor.target, monitor.method, monitor.timeout, monitor.expectedStatus, monitor.keyword, headers);
    case 'TCP':
      return checkTcp(monitor.target, monitor.timeout);
    case 'PING':
      return checkPing(monitor.target, monitor.timeout);
    case 'DNS':
      return checkDns(monitor.target, monitor.timeout);
    default:
      return {
        status: 'DOWN',
        responseTime: 0,
        statusCode: null,
        message: `Unsupported check type: ${monitor.type}`,
      };
  }
}

/**
 * Run a check for a monitor and store the result in the database
 */
async function executeCheck(monitorId: string): Promise<void> {
  try {
    const monitor = await prisma.uptimeMonitor.findUnique({ where: { id: monitorId } });
    if (!monitor || !monitor.enabled) {
      // Monitor was deleted or disabled, clear its interval
      clearMonitorInterval(monitorId);
      return;
    }

    const result = await runCheck(monitor);

    await prisma.uptimeCheck.create({
      data: {
        monitorId: monitor.id,
        status: result.status,
        responseTime: result.responseTime,
        statusCode: result.statusCode,
        message: result.message,
      },
    });

    logger.debug(`Uptime check for "${monitor.name}": ${result.status} (${result.responseTime}ms)`);
  } catch (error: any) {
    logger.error(`Error executing uptime check for monitor ${monitorId}`, { error: error.message });
  }
}

/**
 * Clear the interval for a specific monitor
 */
function clearMonitorInterval(monitorId: string): void {
  const existing = monitorIntervals.get(monitorId);
  if (existing) {
    clearInterval(existing);
    monitorIntervals.delete(monitorId);
  }
}

/**
 * Set up or update the interval for a specific monitor
 */
function setupMonitorInterval(monitorId: string, intervalSeconds: number): void {
  clearMonitorInterval(monitorId);

  const intervalMs = intervalSeconds * 1000;
  const timer = setInterval(() => {
    executeCheck(monitorId).catch((err) => {
      logger.error(`Uptime check failed for monitor ${monitorId}`, { error: err.message });
    });
  }, intervalMs);

  monitorIntervals.set(monitorId, timer);
}

/**
 * Sync monitors from the database: start intervals for new/changed monitors,
 * stop intervals for removed/disabled ones.
 */
async function syncMonitors(): Promise<void> {
  try {
    const monitors = await prisma.uptimeMonitor.findMany({
      where: { enabled: true },
      select: { id: true, interval: true },
    });

    const activeIds = new Set(monitors.map((m) => m.id));

    // Remove intervals for monitors that no longer exist or are disabled
    for (const [monitorId] of monitorIntervals) {
      if (!activeIds.has(monitorId)) {
        clearMonitorInterval(monitorId);
        logger.debug(`Stopped uptime monitoring for removed/disabled monitor ${monitorId}`);
      }
    }

    // Add or update intervals for active monitors
    for (const monitor of monitors) {
      if (!monitorIntervals.has(monitor.id)) {
        // New monitor - run immediately, then set up interval
        executeCheck(monitor.id).catch((err) => {
          logger.error(`Initial uptime check failed for monitor ${monitor.id}`, { error: err.message });
        });
        setupMonitorInterval(monitor.id, monitor.interval);
        logger.debug(`Started uptime monitoring for monitor ${monitor.id} (every ${monitor.interval}s)`);
      }
    }
  } catch (error: any) {
    logger.error('Error syncing uptime monitors', { error: error.message });
  }
}

/**
 * Start the uptime monitoring system.
 * Syncs monitors from the DB every MASTER_POLL_SECONDS and manages per-monitor intervals.
 */
export function startUptimeMonitoring(): void {
  if (masterInterval) {
    logger.warn('Uptime monitoring already running');
    return;
  }

  logger.info('Starting uptime monitoring service');

  // Initial sync
  syncMonitors().catch((err) => {
    logger.error('Initial uptime monitor sync failed', { error: err.message });
  });

  // Periodic sync to pick up new/changed/deleted monitors
  masterInterval = setInterval(() => {
    syncMonitors().catch((err) => {
      logger.error('Periodic uptime monitor sync failed', { error: err.message });
    });
  }, MASTER_POLL_SECONDS * 1000);

  logger.info(`Uptime monitoring started (sync every ${MASTER_POLL_SECONDS}s)`);
}

/**
 * Stop the uptime monitoring system and clear all intervals.
 */
export function stopUptimeMonitoring(): void {
  if (masterInterval) {
    clearInterval(masterInterval);
    masterInterval = null;
  }

  for (const [monitorId] of monitorIntervals) {
    clearMonitorInterval(monitorId);
  }

  monitorIntervals.clear();
  logger.info('Uptime monitoring stopped');
}
