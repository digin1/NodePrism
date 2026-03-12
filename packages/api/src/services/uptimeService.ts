import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { dispatchNotifications } from './notificationSender';
import axios from 'axios';
import net from 'net';
import tls from 'tls';
import dns from 'dns';
import { exec } from 'child_process';
import { UptimeCheckType, UptimeCheckStatus } from '@prisma/client';

// Map of monitorId -> interval timer
const monitorIntervals = new Map<string, NodeJS.Timeout>();

// Track last known status per monitor for state-change notifications
const lastKnownStatus = new Map<string, UptimeCheckStatus>();
// Track when a monitor went down (for duration in resolved notifications)
const downSince = new Map<string, Date>();

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
 * Perform an SSL certificate expiry check using the tls module
 */
async function checkSslCert(
  target: string,
  timeout: number
): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string; certExpiry?: Date; certIssuer?: string }> {
  const start = Date.now();

  // Parse host and optional port from target (e.g. "example.com" or "example.com:8443")
  const parts = target.split(':');
  const host = parts[0];
  const port = parseInt(parts[1] || '443', 10);

  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeout * 1000 }, () => {
      const responseTime = Date.now() - start;

      const cert = (socket as any).getPeerCertificate();
      socket.destroy();

      if (!cert || !cert.valid_to) {
        resolve({
          status: 'DOWN',
          responseTime,
          statusCode: null,
          message: 'No certificate found on host',
        });
        return;
      }

      const expiryDate = new Date(cert.valid_to);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Build issuer string from certificate issuer object
      const issuerParts: string[] = [];
      if (cert.issuer) {
        if (cert.issuer.O) issuerParts.push(cert.issuer.O);
        if (cert.issuer.CN) issuerParts.push(cert.issuer.CN);
      }
      const issuerStr = issuerParts.join(' - ') || 'Unknown';

      let status: UptimeCheckStatus;
      let message: string;

      if (daysUntilExpiry < 0) {
        status = 'DOWN';
        message = `Certificate expired ${Math.abs(daysUntilExpiry)} days ago (${expiryDate.toISOString()})`;
      } else if (daysUntilExpiry <= 7) {
        status = 'DOWN';
        message = `Certificate expires in ${daysUntilExpiry} days (${expiryDate.toISOString()})`;
      } else if (daysUntilExpiry <= 30) {
        status = 'DEGRADED';
        message = `Certificate expires in ${daysUntilExpiry} days (${expiryDate.toISOString()})`;
      } else {
        status = 'UP';
        message = `Certificate valid for ${daysUntilExpiry} days (expires ${expiryDate.toISOString()})`;
      }

      resolve({
        status,
        responseTime,
        statusCode: null,
        message,
        certExpiry: expiryDate,
        certIssuer: issuerStr,
      });
    });

    socket.on('timeout', () => {
      const responseTime = Date.now() - start;
      socket.destroy();
      resolve({
        status: 'DOWN',
        responseTime,
        statusCode: null,
        message: `TLS connection timeout after ${timeout}s`,
      });
    });

    socket.on('error', (err: any) => {
      const responseTime = Date.now() - start;
      socket.destroy();
      resolve({
        status: 'DOWN',
        responseTime,
        statusCode: null,
        message: `TLS connection failed: ${err.code || err.message}`,
      });
    });
  });
}

/**
 * Perform a domain expiry check using the whois command
 */
async function checkDomainExpiry(
  target: string,
  timeout: number
): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string; domainExpiry?: Date }> {
  const start = Date.now();

  // Sanitize domain input: only allow valid hostname characters
  const domain = target.replace(/[^a-zA-Z0-9.\-]/g, '');

  return new Promise((resolve) => {
    exec(`whois ${domain}`, { timeout: timeout * 1000 }, (error, stdout) => {
      const responseTime = Date.now() - start;

      if (error) {
        resolve({
          status: 'DOWN',
          responseTime,
          statusCode: null,
          message: `WHOIS lookup failed: ${error.message}`,
        });
        return;
      }

      // Try multiple common expiry date patterns from whois output
      const expiryPatterns = [
        /Registry Expiry Date:\s*(.+)/i,
        /Registrar Registration Expiration Date:\s*(.+)/i,
        /Expiration Date:\s*(.+)/i,
        /Expiry Date:\s*(.+)/i,
        /paid-till:\s*(.+)/i,
        /Expiry date:\s*(.+)/i,
        /expires:\s*(.+)/i,
        /expire:\s*(.+)/i,
      ];

      let expiryDateStr: string | null = null;
      for (const pattern of expiryPatterns) {
        const match = stdout.match(pattern);
        if (match) {
          expiryDateStr = match[1].trim();
          break;
        }
      }

      if (!expiryDateStr) {
        resolve({
          status: 'DOWN',
          responseTime,
          statusCode: null,
          message: 'Could not parse expiry date from WHOIS response',
        });
        return;
      }

      const expiryDate = new Date(expiryDateStr);
      if (isNaN(expiryDate.getTime())) {
        resolve({
          status: 'DOWN',
          responseTime,
          statusCode: null,
          message: `Invalid expiry date format: ${expiryDateStr}`,
        });
        return;
      }

      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let status: UptimeCheckStatus;
      let message: string;

      if (daysUntilExpiry < 0) {
        status = 'DOWN';
        message = `Domain expired ${Math.abs(daysUntilExpiry)} days ago (${expiryDate.toISOString()})`;
      } else if (daysUntilExpiry <= 14) {
        status = 'DOWN';
        message = `Domain expires in ${daysUntilExpiry} days (${expiryDate.toISOString()})`;
      } else if (daysUntilExpiry <= 30) {
        status = 'DEGRADED';
        message = `Domain expires in ${daysUntilExpiry} days (${expiryDate.toISOString()})`;
      } else {
        status = 'UP';
        message = `Domain valid for ${daysUntilExpiry} days (expires ${expiryDate.toISOString()})`;
      }

      resolve({
        status,
        responseTime,
        statusCode: null,
        message,
        domainExpiry: expiryDate,
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
}): Promise<{ status: UptimeCheckStatus; responseTime: number; statusCode: number | null; message: string; certExpiry?: Date; certIssuer?: string; domainExpiry?: Date }> {
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
    case 'SSL_CERT':
      return checkSslCert(monitor.target, monitor.timeout);
    case 'DOMAIN':
      return checkDomainExpiry(monitor.target, monitor.timeout);
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
      lastKnownStatus.delete(monitorId);
      downSince.delete(monitorId);
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
        certExpiry: result.certExpiry ?? null,
        certIssuer: result.certIssuer ?? null,
        domainExpiry: result.domainExpiry ?? null,
      },
    });

    logger.debug(`Uptime check for "${monitor.name}": ${result.status} (${result.responseTime}ms)`);

    // Detect state transitions and send notifications
    const prevStatus = lastKnownStatus.get(monitorId);
    const isDown = result.status === 'DOWN';
    const wasDown = prevStatus === 'DOWN';

    if (prevStatus !== undefined && isDown !== wasDown) {
      if (isDown) {
        // Service went DOWN
        const now = new Date();
        downSince.set(monitorId, now);
        dispatchNotifications({
          id: `uptime-${monitorId}-${now.getTime()}`,
          status: 'FIRING',
          severity: 'CRITICAL',
          message: `${monitor.name} is down`,
          labels: {
            alertname: 'UptimeDown',
            monitor_id: monitorId,
            monitor_name: monitor.name,
            target: monitor.target,
            check_type: monitor.type,
          },
          annotations: {
            summary: `Uptime monitor "${monitor.name}" is down`,
            description: `${monitor.type} check to ${monitor.target} failed: ${result.message}`,
          },
          startsAt: now,
        }).catch(err => logger.error('Failed to send uptime DOWN notification', { error: err.message }));

        logger.warn(`Uptime monitor "${monitor.name}" is DOWN: ${result.message}`);
      } else {
        // Service came back UP
        const wentDownAt = downSince.get(monitorId);
        const now = new Date();
        downSince.delete(monitorId);

        dispatchNotifications({
          id: `uptime-${monitorId}-${now.getTime()}`,
          status: 'RESOLVED',
          severity: 'CRITICAL',
          message: `${monitor.name} is back up`,
          labels: {
            alertname: 'UptimeDown',
            monitor_id: monitorId,
            monitor_name: monitor.name,
            target: monitor.target,
            check_type: monitor.type,
          },
          annotations: {
            summary: `Uptime monitor "${monitor.name}" has recovered`,
            description: `${monitor.type} check to ${monitor.target} is healthy again: ${result.message}`,
            current_value: `${result.responseTime}ms`,
          },
          startsAt: wentDownAt || now,
          endsAt: now,
        }).catch(err => logger.error('Failed to send uptime RESOLVED notification', { error: err.message }));

        logger.info(`Uptime monitor "${monitor.name}" is back UP (${result.responseTime}ms)`);
      }
    }

    lastKnownStatus.set(monitorId, result.status);
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
  lastKnownStatus.clear();
  downSince.clear();
  logger.info('Uptime monitoring stopped');
}
