import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import Redis from 'ioredis';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { getDiskUsage } from '../services/housekeeping';

const router: ExpressRouter = Router();

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const ALERTMANAGER_URL = process.env.ALERTMANAGER_URL || 'http://localhost:9093';
const LOKI_URL = process.env.LOKI_URL || 'http://localhost:3100';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

interface ServiceStatus {
  status: 'ok' | 'down';
  responseTime: number;
}

function timed<T>(fn: () => Promise<T>): Promise<{ result: T; elapsed: number }> {
  const start = Date.now();
  return fn().then(
    (result) => ({ result, elapsed: Date.now() - start }),
    (err) => { throw Object.assign(err, { elapsed: Date.now() - start }); }
  );
}

async function fetchPM2Processes() {
  try {
    const raw = execSync('npx pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const list = JSON.parse(raw);
    const now = Date.now();
    const processes = list.map((p: any) => ({
      name: p.name,
      pid: p.pid,
      status: p.pm2_env?.status,
      cpu: p.monit?.cpu,
      memory: p.monit?.memory,
      uptime: p.pm2_env?.pm_uptime ? now - p.pm2_env.pm_uptime : null,
      restarts: p.pm2_env?.restart_time,
    }));
    const totalOnline = processes.filter((p: any) => p.status === 'online').length;
    return { processes, totalOnline, totalProcesses: processes.length };
  } catch (err) {
    logger.warn('Failed to fetch PM2 processes', { error: (err as Error).message });
    return { processes: [], totalOnline: 0, totalProcesses: 0 };
  }
}

async function fetchDockerContainers() {
  try {
    const raw = execSync(
      'docker ps -a --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.State}}" 2>/dev/null',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const containers = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, image, status, state] = line.split('\t');
        return { name, image, status, state };
      });
    const totalRunning = containers.filter((c) => c.state === 'running').length;
    return { containers, totalRunning, totalContainers: containers.length };
  } catch (err) {
    logger.warn('Failed to fetch Docker containers', { error: (err as Error).message });
    return { containers: [], totalRunning: 0, totalContainers: 0 };
  }
}

async function fetchPrometheus(): Promise<{
  status: 'ok' | 'down';
  responseTime: number;
  targets: { total: number; up: number; down: number } | null;
  tsdb: Record<string, any> | null;
}> {
  let status: 'ok' | 'down' = 'down';
  let responseTime = 0;
  let targets: { total: number; up: number; down: number } | null = null;
  let tsdb: Record<string, any> | null = null;

  try {
    const health = await timed(() => axios.get(`${PROMETHEUS_URL}/-/ready`, { timeout: 3000 }));
    status = 'ok';
    responseTime = health.elapsed;
  } catch (err: any) {
    responseTime = err.elapsed || 0;
    return { status, responseTime, targets, tsdb };
  }

  try {
    const targetsRes = await axios.get(`${PROMETHEUS_URL}/api/v1/targets`, { timeout: 3000 });
    const activeTargets: any[] = targetsRes.data?.data?.activeTargets || [];
    const up = activeTargets.filter((t) => t.health === 'up').length;
    targets = { total: activeTargets.length, up, down: activeTargets.length - up };
  } catch { /* non-critical */ }

  try {
    const tsdbRes = await axios.get(`${PROMETHEUS_URL}/api/v1/status/tsdb`, { timeout: 3000 });
    tsdb = tsdbRes.data?.data?.headStats || null;
  } catch { /* non-critical */ }

  return { status, responseTime, targets, tsdb };
}

async function fetchAlertManager(): Promise<{
  status: 'ok' | 'down';
  responseTime: number;
  activeAlerts: number;
  silences: number;
}> {
  let status: 'ok' | 'down' = 'down';
  let responseTime = 0;
  let activeAlerts = 0;
  let silences = 0;

  try {
    const health = await timed(() => axios.get(`${ALERTMANAGER_URL}/-/ready`, { timeout: 3000 }));
    status = 'ok';
    responseTime = health.elapsed;
  } catch (err: any) {
    responseTime = err.elapsed || 0;
    return { status, responseTime, activeAlerts, silences };
  }

  try {
    const alertsRes = await axios.get(`${ALERTMANAGER_URL}/api/v2/alerts`, { timeout: 3000 });
    activeAlerts = Array.isArray(alertsRes.data) ? alertsRes.data.length : 0;
  } catch { /* non-critical */ }

  try {
    const silencesRes = await axios.get(`${ALERTMANAGER_URL}/api/v2/silences`, { timeout: 3000 });
    const allSilences: any[] = Array.isArray(silencesRes.data) ? silencesRes.data : [];
    silences = allSilences.filter((s) => s.status?.state === 'active').length;
  } catch { /* non-critical */ }

  return { status, responseTime, activeAlerts, silences };
}

async function fetchLoki(): Promise<ServiceStatus> {
  try {
    const { elapsed } = await timed(() => axios.get(`${LOKI_URL}/ready`, { timeout: 3000 }));
    return { status: 'ok', responseTime: elapsed };
  } catch (err: any) {
    return { status: 'down', responseTime: err.elapsed || 0 };
  }
}

async function fetchRedis(): Promise<{
  status: 'ok' | 'down';
  responseTime: number;
  info: Record<string, any> | null;
}> {
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    lazyConnect: true,
    connectTimeout: 3000,
  });

  try {
    const { result: rawInfo, elapsed } = await timed(async () => {
      await redis.connect();
      const info = await redis.info();
      await redis.quit();
      return info;
    });

    const extract = (key: string) => {
      const match = rawInfo.match(new RegExp(`${key}:(.+?)\\r?\\n`));
      return match ? match[1].trim() : null;
    };

    const hits = parseInt(extract('keyspace_hits') || '0', 10);
    const misses = parseInt(extract('keyspace_misses') || '0', 10);
    const hitRate = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 10000) / 100 : null;

    const info = {
      version: extract('redis_version'),
      usedMemory: extract('used_memory_human'),
      usedMemoryPeak: extract('used_memory_peak_human'),
      connectedClients: parseInt(extract('connected_clients') || '0', 10),
      uptimeInSeconds: parseInt(extract('uptime_in_seconds') || '0', 10),
      hitRate,
    };

    return { status: 'ok', responseTime: elapsed, info };
  } catch (err: any) {
    redis.disconnect();
    return { status: 'down', responseTime: err.elapsed || 0, info: null };
  }
}

async function fetchDatabase(): Promise<{
  status: 'ok' | 'down';
  responseTime: number;
  stats: { activeConnections: number; maxConnections: number; databaseSize: string; tableCount: number } | null;
}> {
  try {
    const { result: stats, elapsed } = await timed(async () => {
      const [activeConns] = await prisma.$queryRaw<[{ count: number }]>`SELECT count(*)::int as count FROM pg_stat_activity WHERE state = 'active'`;
      const [maxConns] = await prisma.$queryRaw<[{ max: number }]>`SELECT setting::int as max FROM pg_settings WHERE name = 'max_connections'`;
      const [dbSize] = await prisma.$queryRaw<[{ size: string }]>`SELECT pg_size_pretty(pg_database_size(current_database())) as size`;
      const [tableCount] = await prisma.$queryRaw<[{ count: number }]>`SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'`;
      return {
        activeConnections: activeConns.count,
        maxConnections: maxConns.max,
        databaseSize: dbSize.size,
        tableCount: tableCount.count,
      };
    });
    return { status: 'ok', responseTime: elapsed, stats };
  } catch (err: any) {
    return { status: 'down', responseTime: err.elapsed || 0, stats: null };
  }
}

function getHostResources() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const disk = getDiskUsage();

  let cpuUsagePercent = 0;
  if (cpus.length > 0) {
    const totals = cpus.reduce(
      (acc, cpu) => {
        const times = cpu.times;
        acc.idle += times.idle;
        acc.total += times.user + times.nice + times.sys + times.idle + times.irq;
        return acc;
      },
      { idle: 0, total: 0 }
    );
    cpuUsagePercent = Math.round((1 - totals.idle / totals.total) * 10000) / 100;
  }

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    cpu: {
      loadAvg: os.loadavg(),
      cores: cpus.length,
      usagePercent: cpuUsagePercent,
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      usedPercent: Math.round((usedMem / totalMem) * 10000) / 100,
    },
    disk: {
      totalGB: disk.totalGB,
      usedGB: disk.usedGB,
      availableGB: disk.availableGB,
      usedPercent: disk.usedPercent,
    },
  };
}

async function fetchAlertPipeline() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [notifLogs, channels, firingAlerts] = await Promise.all([
    prisma.notificationLog.groupBy({
      by: ['status'],
      _count: true,
      where: { createdAt: { gte: dayAgo } },
    }),
    prisma.notificationChannel.findMany({
      select: { enabled: true },
    }),
    prisma.alert.count({
      where: { status: 'FIRING' },
    }),
  ]);

  let success = 0;
  let failed = 0;
  for (const entry of notifLogs) {
    if (entry.status === 'SUCCESS') success = entry._count;
    else failed += entry._count;
  }
  const total = success + failed;
  const successRate = total > 0 ? Math.round((success / total) * 10000) / 100 : 100;

  return {
    last24h: { total, success, failed },
    successRate,
    channelCount: channels.length,
    enabledChannels: channels.filter((c) => c.enabled).length,
    firingAlerts,
  };
}

function fetchRecentErrors(): { service: string; timestamp: string; message: string }[] {
  const logDir = path.resolve(__dirname, '../../../../logs');
  if (!fs.existsSync(logDir)) return [];

  try {
    const errorLogFiles = fs.readdirSync(logDir).filter((f) => f.endsWith('-error.log'));
    const allErrors: { service: string; timestamp: string; message: string }[] = [];

    for (const file of errorLogFiles) {
      const service = file.replace('-error.log', '');
      const logFile = path.join(logDir, file);
      try {
        const raw = execSync(`tail -n 20 "${logFile}"`, { encoding: 'utf-8', timeout: 3000 });
        const lines = raw.split('\n').filter(Boolean);
        for (const line of lines) {
          const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[^\s]*)/);
          allErrors.push({
            service,
            timestamp: tsMatch ? tsMatch[1] : '',
            message: tsMatch ? line.slice(tsMatch[0].length).trim() : line.trim(),
          });
        }
      } catch { /* skip unreadable files */ }
    }

    allErrors.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return b.timestamp.localeCompare(a.timestamp);
    });

    return allErrors.slice(0, 50);
  } catch (err) {
    logger.warn('Failed to read error logs', { error: (err as Error).message });
    return [];
  }
}

function determineOverallStatus(results: {
  database: { status: string };
  prometheus: { status: string };
  alertmanager: { status: string };
  loki: { status: string };
  redis: { status: string };
  host: { memory: { usedPercent: number }; disk: { usedPercent: number } };
}): 'healthy' | 'degraded' | 'critical' {
  if (results.database.status === 'down' || results.prometheus.status === 'down') {
    return 'critical';
  }

  if (
    results.alertmanager.status === 'down' ||
    results.loki.status === 'down' ||
    results.redis.status === 'down' ||
    results.host.disk.usedPercent > 90 ||
    results.host.memory.usedPercent > 90
  ) {
    return 'degraded';
  }

  return 'healthy';
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      pm2Result,
      dockerResult,
      prometheusResult,
      alertmanagerResult,
      lokiResult,
      redisResult,
      databaseResult,
      alertPipelineResult,
    ] = await Promise.allSettled([
      fetchPM2Processes(),
      fetchDockerContainers(),
      fetchPrometheus(),
      fetchAlertManager(),
      fetchLoki(),
      fetchRedis(),
      fetchDatabase(),
      fetchAlertPipeline(),
    ]);

    const pm2 = pm2Result.status === 'fulfilled'
      ? pm2Result.value
      : { processes: [], totalOnline: 0, totalProcesses: 0 };

    const docker = dockerResult.status === 'fulfilled'
      ? dockerResult.value
      : { containers: [], totalRunning: 0, totalContainers: 0 };

    const prometheus = prometheusResult.status === 'fulfilled'
      ? prometheusResult.value
      : { status: 'down' as const, responseTime: 0, targets: null, tsdb: null };

    const alertmanager = alertmanagerResult.status === 'fulfilled'
      ? alertmanagerResult.value
      : { status: 'down' as const, responseTime: 0, activeAlerts: 0, silences: 0 };

    const loki = lokiResult.status === 'fulfilled'
      ? lokiResult.value
      : { status: 'down' as const, responseTime: 0 };

    const redis = redisResult.status === 'fulfilled'
      ? redisResult.value
      : { status: 'down' as const, responseTime: 0, info: null };

    const database = databaseResult.status === 'fulfilled'
      ? databaseResult.value
      : { status: 'down' as const, responseTime: 0, stats: null };

    const host = getHostResources();

    const alertPipeline = alertPipelineResult.status === 'fulfilled'
      ? alertPipelineResult.value
      : { last24h: { total: 0, success: 0, failed: 0 }, successRate: 100, channelCount: 0, enabledChannels: 0, firingAlerts: 0 };

    const recentErrors = fetchRecentErrors();

    const overallStatus = determineOverallStatus({
      database,
      prometheus,
      alertmanager,
      loki,
      redis,
      host,
    });

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        overallStatus,
        pm2,
        docker,
        prometheus,
        alertmanager,
        loki,
        redis,
        database,
        host,
        alertPipeline,
        recentErrors,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as systemStatusRoutes };
