'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/state-panel';
import { systemStatusApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function statusTone(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'healthy' || status === 'ok' || status === 'up' || status === 'online') return 'success';
  if (status === 'degraded') return 'warning';
  return 'danger';
}

function serviceStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'secondary' {
  const s = status.toLowerCase();
  if (s === 'ok' || s === 'online' || s === 'up' || s === 'healthy' || s === 'running') return 'success';
  if (s === 'degraded' || s === 'warning' || s === 'launching') return 'warning';
  if (s === 'errored' || s === 'stopped' || s === 'down' || s === 'critical' || s === 'exited')
    return 'danger';
  return 'secondary';
}

function progressBarColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// Service color map for recent error badges
const serviceColors: Record<string, 'default' | 'secondary' | 'destructive' | 'warning' | 'danger'> = {
  api: 'default',
  web: 'secondary',
  'config-sync': 'warning',
  'anomaly-detector': 'warning',
  'agent-app': 'secondary',
  prometheus: 'destructive',
  alertmanager: 'danger',
  loki: 'default',
  redis: 'secondary',
  database: 'destructive',
};

// ─── Progress Bar Component ──────────────────────────────────────────────────

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  return (
    <div className={`h-2 rounded-full bg-secondary/50 ${className || ''}`}>
      <div
        className={`h-2 rounded-full transition-all ${progressBarColor(clampedPercent)}`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}

// ─── Status Dot ──────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const s = status.toLowerCase();
  let color = 'bg-gray-500';
  if (s === 'ok' || s === 'up' || s === 'healthy' || s === 'online' || s === 'running') color = 'bg-emerald-500';
  else if (s === 'degraded' || s === 'warning') color = 'bg-amber-500';
  else if (s === 'down' || s === 'critical' || s === 'errored' || s === 'stopped')
    color = 'bg-red-500';

  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SystemStatusPage() {
  const { formatDateTime } = useFormatDate();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => systemStatusApi.get(),
    refetchInterval: 15000,
  });

  // Track last updated time
  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  // Tick the "seconds ago" counter
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Platform Health"
          title="System Status"
          description="Real-time health of the monitoring platform and its dependencies"
        />
        <LoadingState rows={8} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Platform Health"
          title="System Status"
          description="Real-time health of the monitoring platform and its dependencies"
        />
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-400">
              <p className="text-sm font-medium">Failed to load system status</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(error as Error)?.message || 'The system status endpoint is not available.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = data as any;
  const d = status.data || status;

  // Compute combined service counts
  const pm2Online = d.pm2?.totalOnline ?? 0;
  const pm2Total = d.pm2?.totalProcesses ?? 0;
  const dockerRunning = d.docker?.totalRunning ?? 0;
  const dockerTotal = d.docker?.totalContainers ?? 0;
  const totalOnline = pm2Online + dockerRunning;
  const totalServices = pm2Total + dockerTotal;

  // Alert pipeline success rate
  const pipelineRate = d.alertPipeline?.successRate ?? 0;

  // Host uptime
  const hostUptimeStr = d.host?.uptime ? formatDuration(d.host.uptime) : '--';

  // Service tone based on ratio
  const serviceTone =
    totalServices === 0
      ? 'default'
      : totalOnline === totalServices
        ? 'success'
        : totalOnline / totalServices >= 0.8
          ? 'warning'
          : ('danger' as const);

  const pipelineTone =
    pipelineRate >= 95 ? 'success' : pipelineRate >= 80 ? 'warning' : ('danger' as const);

  return (
    <div className="space-y-6">
      {/* ─── 1. Page Header ─── */}
      <PageHeader
        eyebrow="Platform Health"
        title="System Status"
        description="Real-time health of the monitoring platform and its dependencies"
      >
        {lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Last updated: {secondsAgo}s ago
            </span>
          </div>
        )}
      </PageHeader>

      {/* ─── 2. Summary Stats ─── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          label="Overall"
          value={d.overallStatus?.charAt(0).toUpperCase() + d.overallStatus?.slice(1) || 'Unknown'}
          tone={statusTone(d.overallStatus)}
        />
        <SummaryStat
          label="Services"
          value={`${totalOnline}/${totalServices}`}
          tone={serviceTone}
        />
        <SummaryStat
          label="Alert Pipeline"
          value={`${pipelineRate.toFixed(1)}%`}
          tone={pipelineTone}
        />
        <SummaryStat label="Host Uptime" value={hostUptimeStr} tone="success" />
      </div>

      {/* ─── 3. Service Health (PM2 Processes) ─── */}
      {d.pm2?.processes?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Service Health</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b subtle-divider">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      CPU
                    </th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Memory
                    </th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Uptime
                    </th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Restarts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.pm2.processes.map((proc: any, i: number) => (
                    <tr
                      key={proc.name}
                      className={`border-b border-border/30 transition-colors hover:bg-muted/30 ${
                        i % 2 === 1 ? 'bg-accent/5' : ''
                      }`}
                    >
                      <td className="px-6 py-3 font-medium">{proc.name}</td>
                      <td className="px-6 py-3">
                        <Badge variant={serviceStatusVariant(proc.status)}>
                          {proc.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                        {proc.cpu != null ? `${proc.cpu}%` : '--'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                        {proc.memory != null ? formatBytes(proc.memory) : '--'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                        {proc.uptime != null ? formatUptime(proc.uptime) : '--'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {proc.restarts != null ? (
                          proc.restarts > 10 ? (
                            <Badge variant="warning">{proc.restarts}</Badge>
                          ) : (
                            <span className="font-mono text-muted-foreground">{proc.restarts}</span>
                          )
                        ) : (
                          '--'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 4. Docker Containers ─── */}
      {d.docker?.containers?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Docker Containers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b subtle-divider">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Image
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      State
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.docker.containers.map((container: any, i: number) => (
                    <tr
                      key={container.name}
                      className={`border-b border-border/30 transition-colors hover:bg-muted/30 ${
                        i % 2 === 1 ? 'bg-accent/5' : ''
                      }`}
                    >
                      <td className="px-6 py-3 font-medium">{container.name}</td>
                      <td className="px-6 py-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                        {container.image}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">{container.status}</td>
                      <td className="px-6 py-3">
                        <Badge variant={serviceStatusVariant(container.state)}>
                          {container.state}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 5. Infrastructure Resources ─── */}
      {d.host && (
        <Card>
          <CardHeader>
            <CardTitle>Infrastructure Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              {/* CPU */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  CPU
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Usage</span>
                    <span className="font-mono font-medium">
                      {d.host.cpu?.usagePercent != null
                        ? `${d.host.cpu.usagePercent.toFixed(1)}%`
                        : '--'}
                    </span>
                  </div>
                  {d.host.cpu?.usagePercent != null && (
                    <ProgressBar percent={d.host.cpu.usagePercent} />
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cores</span>
                    <span className="font-mono">{d.host.cpu?.cores ?? '--'}</span>
                  </div>
                  {d.host.cpu?.loadAvg && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Load Averages</p>
                      <div className="flex gap-3 text-xs font-mono">
                        <span title="1 minute">
                          1m: <strong>{d.host.cpu.loadAvg[0]?.toFixed(2)}</strong>
                        </span>
                        <span title="5 minutes">
                          5m: <strong>{d.host.cpu.loadAvg[1]?.toFixed(2)}</strong>
                        </span>
                        <span title="15 minutes">
                          15m: <strong>{d.host.cpu.loadAvg[2]?.toFixed(2)}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Memory */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Memory
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Used / Total</span>
                    <span className="font-mono font-medium">
                      {d.host.memory?.usedBytes != null && d.host.memory?.totalBytes != null
                        ? `${formatBytes(d.host.memory.usedBytes)} / ${formatBytes(d.host.memory.totalBytes)}`
                        : '--'}
                    </span>
                  </div>
                  {d.host.memory?.usedPercent != null && (
                    <>
                      <ProgressBar percent={d.host.memory.usedPercent} />
                      <div className="flex justify-end text-xs font-mono text-muted-foreground">
                        {d.host.memory.usedPercent.toFixed(1)}%
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Disk */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Disk
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Used / Total</span>
                    <span className="font-mono font-medium">
                      {d.host.disk?.usedGB != null && d.host.disk?.totalGB != null
                        ? `${d.host.disk.usedGB.toFixed(1)} GB / ${d.host.disk.totalGB.toFixed(1)} GB`
                        : '--'}
                    </span>
                  </div>
                  {d.host.disk?.usedPercent != null && (
                    <>
                      <ProgressBar percent={d.host.disk.usedPercent} />
                      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                        <span>{d.host.disk.availableGB?.toFixed(1)} GB free</span>
                        <span>{d.host.disk.usedPercent.toFixed(1)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 6. Monitoring Stack ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Monitoring Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Prometheus */}
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={d.prometheus?.status || 'down'} />
                  <span className="text-sm font-medium">Prometheus</span>
                </div>
                {d.prometheus?.responseTime != null && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {d.prometheus.responseTime}ms
                  </span>
                )}
              </div>
              {d.prometheus?.targets && (
                <div className="text-xs text-muted-foreground">
                  Targets: {d.prometheus.targets.up} up / {d.prometheus.targets.total} total
                  {d.prometheus.targets.down > 0 && (
                    <span className="ml-1 text-red-400">
                      ({d.prometheus.targets.down} down)
                    </span>
                  )}
                </div>
              )}
              {d.prometheus?.tsdb && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Head series: {d.prometheus.tsdb.headSeries?.toLocaleString()}</div>
                  <div>Samples: {d.prometheus.tsdb.numSamples?.toLocaleString()}</div>
                </div>
              )}
            </div>

            {/* AlertManager */}
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={d.alertmanager?.status || 'down'} />
                  <span className="text-sm font-medium">AlertManager</span>
                </div>
                {d.alertmanager?.responseTime != null && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {d.alertmanager.responseTime}ms
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {d.alertmanager?.activeAlerts != null && (
                  <div>
                    Active alerts:{' '}
                    <span
                      className={
                        d.alertmanager.activeAlerts > 0
                          ? 'text-amber-300 font-medium'
                          : ''
                      }
                    >
                      {d.alertmanager.activeAlerts}
                    </span>
                  </div>
                )}
                {d.alertmanager?.silences != null && (
                  <div>Silences: {d.alertmanager.silences}</div>
                )}
              </div>
            </div>

            {/* Loki */}
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={d.loki?.status || 'down'} />
                  <span className="text-sm font-medium">Loki</span>
                </div>
                {d.loki?.responseTime != null && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {d.loki.responseTime}ms
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.loki?.status === 'ok' ? 'Log aggregation healthy' : 'Log aggregation unavailable'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── 7. Database & Cache ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Database & Cache</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* PostgreSQL */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusDot status={d.database?.status || 'down'} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  PostgreSQL
                </p>
                {d.database?.responseTime != null && (
                  <span className="ml-auto text-xs font-mono text-muted-foreground">
                    {d.database.responseTime}ms
                  </span>
                )}
              </div>
              {d.database?.stats ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-accent/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Connections
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {d.database.stats.activeConnections} / {d.database.stats.maxConnections}
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      DB Size
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {d.database.stats.databaseSize || '--'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Tables
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {d.database.stats.tableCount ?? '--'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No database stats available</p>
              )}
            </div>

            {/* Redis */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusDot status={d.redis?.status || 'down'} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Redis
                </p>
                {d.redis?.responseTime != null && (
                  <span className="ml-auto text-xs font-mono text-muted-foreground">
                    {d.redis.responseTime}ms
                  </span>
                )}
              </div>
              {d.redis?.info ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-accent/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Version
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {d.redis.info.version || '--'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Memory
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {d.redis.info.usedMemory || '--'}
                    </p>
                    {d.redis.info.usedMemoryPeak && (
                      <p className="text-[10px] text-muted-foreground">
                        peak: {d.redis.info.usedMemoryPeak}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-accent/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Clients
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {d.redis.info.connectedClients ?? '--'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Hit Rate
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      {d.redis.info.hitRate != null ? `${d.redis.info.hitRate}%` : '--'}
                    </p>
                  </div>
                  {d.redis.info.uptimeInSeconds != null && (
                    <div className="rounded-lg bg-accent/10 p-3 col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Uptime
                      </p>
                      <p className="mt-1 font-mono text-sm font-medium">
                        {formatDuration(d.redis.info.uptimeInSeconds)}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No Redis stats available</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── 8. Alert Pipeline ─── */}
      {d.alertPipeline && (
        <Card>
          <CardHeader>
            <CardTitle>Alert Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Delivery stats */}
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total (24h)
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {d.alertPipeline.last24h?.total ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Successful
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
                    {d.alertPipeline.last24h?.success ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Failed
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-red-400">
                    {d.alertPipeline.last24h?.failed ?? 0}
                  </p>
                </div>
              </div>

              {/* Success rate bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-mono font-medium">{pipelineRate.toFixed(1)}%</span>
                </div>
                <ProgressBar percent={pipelineRate} />
              </div>

              {/* Channel info and firing alerts */}
              <div className="flex flex-wrap gap-6 pt-2 border-t border-border/30">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Enabled Channels
                  </p>
                  <p className="mt-1 font-mono text-sm font-medium">
                    {d.alertPipeline.enabledChannels ?? 0} / {d.alertPipeline.channelCount ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Currently Firing
                  </p>
                  <p
                    className={`mt-1 font-mono text-sm font-medium ${
                      (d.alertPipeline.firingAlerts ?? 0) > 0 ? 'text-amber-300' : 'text-emerald-400'
                    }`}
                  >
                    {d.alertPipeline.firingAlerts ?? 0}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 9. Recent Errors ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Errors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.recentErrors?.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {d.recentErrors.map((err: any, i: number) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-6 py-3 border-b border-border/30 ${
                    i % 2 === 1 ? 'bg-accent/5' : ''
                  }`}
                >
                  <Badge
                    variant={serviceColors[err.service?.toLowerCase()] || 'secondary'}
                    className="mt-0.5 flex-shrink-0 text-[10px]"
                  >
                    {err.service}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground break-words">{err.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDateTime(err.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 px-6 py-10">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-emerald-400">No recent errors</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
