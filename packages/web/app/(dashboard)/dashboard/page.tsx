'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, alertApi, metricsApi, uptimeApi, incidentApi } from '@/lib/api';
import { Sparkline } from '@/components/dashboard/Sparkline';

const REFRESH_INTERVAL = 15000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
}

function extractSparklineValues(data: any): number[] {
  if (!data?.data?.result?.[0]?.values) return [];
  return data.data.result[0].values.map((v: [number, string]) => parseFloat(v[1]));
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function HeroStat({
  label,
  value,
  sub,
  color,
  href,
  pulse,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  href?: string;
  pulse?: boolean;
}) {
  const inner = (
    <div className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-0">
      <div className="flex items-center gap-1.5">
        {pulse && (
          <span
            className="h-2 w-2 rounded-full animate-pulse"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color }}>
          {value}
        </span>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {sub && (
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="hover:bg-muted/50 rounded-lg transition-colors">
        {inner}
      </a>
    );
  }
  return inner;
}

function VerticalDivider() {
  return <div className="w-px bg-border self-stretch my-2" />;
}

function ServerFleetCard({ server }: { server: any }) {
  const cpu = server._metrics?.cpu;
  const mem = server._metrics?.memory;
  const disk = server._metrics?.disk;

  const statusColor =
    server.status === 'ONLINE'
      ? 'bg-green-500'
      : server.status === 'WARNING'
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <a
      href={`/servers/${server.id}`}
      className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/70 border border-transparent hover:border-border transition-all group"
    >
      <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
          {server.hostname}
        </p>
        <p className="text-[11px] text-muted-foreground font-mono">{server.ipAddress}</p>
      </div>
      {(cpu != null || mem != null || disk != null) && (
        <div className="flex gap-1.5 flex-shrink-0">
          {cpu != null && (
            <MiniBar value={cpu} label="C" color={cpu > 90 ? '#ef4444' : cpu > 70 ? '#f59e0b' : '#10b981'} />
          )}
          {mem != null && (
            <MiniBar value={mem} label="M" color={mem > 90 ? '#ef4444' : mem > 70 ? '#f59e0b' : '#3b82f6'} />
          )}
          {disk != null && (
            <MiniBar value={disk} label="D" color={disk > 85 ? '#ef4444' : disk > 70 ? '#f59e0b' : '#8b5cf6'} />
          )}
        </div>
      )}
    </a>
  );
}

function MiniBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={`${label}: ${value.toFixed(1)}%`}>
      <span className="text-[9px] text-muted-foreground font-medium">{label}</span>
      <div className="w-3 h-6 bg-muted rounded-sm overflow-hidden relative">
        <div
          className="absolute bottom-0 w-full rounded-sm transition-all"
          style={{ height: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground">{Math.round(value)}</span>
    </div>
  );
}

function AlertRow({ alert, onAck }: { alert: any; onAck: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors group">
      <div
        className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
          alert.severity === 'CRITICAL' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-tight truncate">{alert.message}</p>
        <div className="flex items-center gap-2 mt-1">
          {alert.server && (
            <a
              href={`/servers/${alert.server.id}`}
              className="text-[11px] font-mono text-muted-foreground hover:text-primary"
            >
              {alert.server.hostname}
            </a>
          )}
          <span className="text-[11px] text-muted-foreground">{timeAgo(alert.startsAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Badge
          variant={alert.severity === 'CRITICAL' ? 'danger' : 'warning'}
          className="text-[10px] px-1.5"
        >
          {alert.severity}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            onAck(alert.id);
          }}
        >
          Ack
        </Button>
      </div>
    </div>
  );
}

function UptimeRow({ monitor }: { monitor: any }) {
  const pct = monitor.uptimePercentage;
  const responseMs = monitor.avgResponseTime || monitor.lastCheck?.responseTime;
  const isUp = monitor.lastCheck?.status === 'UP' || monitor.status === 'UP';

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors">
      <div
        className={`h-2 w-2 rounded-full flex-shrink-0 ${isUp ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{monitor.name}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">
          {monitor.type} &middot; {monitor.target}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        {pct != null && (
          <p
            className={`text-sm font-bold font-mono ${
              pct >= 99.9 ? 'text-green-500' : pct >= 99 ? 'text-yellow-500' : 'text-red-500'
            }`}
          >
            {pct.toFixed(2)}%
          </p>
        )}
        {responseMs != null && (
          <p className="text-[11px] text-muted-foreground font-mono">{responseMs}ms</p>
        )}
      </div>
    </div>
  );
}

function IncidentRow({ incident }: { incident: any }) {
  const statusColors: Record<string, string> = {
    INVESTIGATING: 'text-red-500',
    IDENTIFIED: 'text-orange-500',
    MONITORING: 'text-blue-500',
    RESOLVED: 'text-green-500',
  };

  return (
    <a
      href={`/incidents/${incident.id}`}
      className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors"
    >
      <div className="mt-0.5 flex-shrink-0">
        <svg className={`w-4 h-4 ${statusColors[incident.status] || 'text-muted-foreground'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{incident.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] font-medium ${statusColors[incident.status] || ''}`}>
            {incident.status}
          </span>
          <span className="text-[11px] text-muted-foreground">{timeAgo(incident.createdAt)}</span>
        </div>
      </div>
      <Badge
        variant={incident.severity === 'CRITICAL' ? 'danger' : incident.severity === 'WARNING' ? 'warning' : 'secondary'}
        className="text-[10px] flex-shrink-0"
      >
        {incident.severity}
      </Badge>
    </a>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [bwPeriod, setBwPeriod] = useState<string>('day');

  const refetchOpts = { refetchInterval: REFRESH_INTERVAL };

  // --- Data queries ---
  const { data: serverStats, isLoading: statsLoading } = useQuery({
    queryKey: ['serverStats'],
    queryFn: () => serverApi.stats(),
    ...refetchOpts,
  });

  const { data: alertStats } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
    ...refetchOpts,
  });

  const { data: targets } = useQuery({
    queryKey: ['targets'],
    queryFn: () => metricsApi.targets(),
    ...refetchOpts,
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverApi.list(),
    ...refetchOpts,
  });

  const { data: firingAlerts } = useQuery({
    queryKey: ['alerts', { status: 'FIRING' }],
    queryFn: () => alertApi.list({ status: 'FIRING' }),
    ...refetchOpts,
  });

  const { data: uptimeStats } = useQuery({
    queryKey: ['uptimeStats'],
    queryFn: () => uptimeApi.stats(),
    refetchInterval: 30000,
  });

  const { data: uptimeMonitors } = useQuery({
    queryKey: ['uptimeMonitors'],
    queryFn: () => uptimeApi.list(),
    refetchInterval: 30000,
  });

  const { data: incidentStats } = useQuery({
    queryKey: ['incidentStats'],
    queryFn: () => incidentApi.stats(),
    refetchInterval: 30000,
  });

  const { data: openIncidents } = useQuery({
    queryKey: ['incidents', { status: 'open' }],
    queryFn: () => incidentApi.list({ limit: 5 }),
    refetchInterval: 30000,
  });

  const { data: topBandwidth, isLoading: bwLoading } = useQuery({
    queryKey: ['bandwidthTop', bwPeriod],
    queryFn: () => metricsApi.bandwidthTop({ period: bwPeriod, limit: 8 }),
    refetchInterval: 60000,
  });

  // Sparkline data (1h, 12 points)
  const end = Math.floor(Date.now() / 1000);
  const start = end - 3600;

  const { data: cpuSparkline } = useQuery({
    queryKey: ['sparkline-cpu'],
    queryFn: () =>
      metricsApi.queryRange(
        '100 - avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100',
        start, end, '300'
      ),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: memSparkline } = useQuery({
    queryKey: ['sparkline-mem'],
    queryFn: () =>
      metricsApi.queryRange(
        'avg((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100)',
        start, end, '300'
      ),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: netSparkline } = useQuery({
    queryKey: ['sparkline-net'],
    queryFn: () =>
      metricsApi.queryRange(
        'sum(irate(node_network_receive_bytes_total[5m]))',
        start, end, '300'
      ),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Per-server metrics for fleet grid
  const { data: perServerMetrics } = useQuery<{ cpu: any; mem: any; disk: any }>({
    queryKey: ['per-server-metrics'],
    queryFn: async () => {
      const [cpuRes, memRes, diskRes] = await Promise.all([
        metricsApi.query('100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
        metricsApi.query('(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100'),
        metricsApi.query('max by(instance) ((1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})) * 100)'),
      ]);
      return { cpu: cpuRes, mem: memRes, disk: diskRes };
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Acknowledge mutation
  const ackMutation = useMutation({
    mutationFn: (id: string) => alertApi.acknowledge(id, 'Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });

  // --- Computed ---
  const stats = serverStats as any;
  const aStats = alertStats as any;
  const tData = targets as any;
  const uStats = uptimeStats as any;
  const iStats = incidentStats as any;
  const serverList = servers as any[];
  const alertList = (firingAlerts as any[]) || [];
  const monitorList = (uptimeMonitors as any[]) || [];
  const incidentList = ((openIncidents as any[]) || []).filter(
    (i: any) => i.status !== 'RESOLVED' && i.status !== 'POSTMORTEM'
  );

  const cpuData = extractSparklineValues(cpuSparkline);
  const memData = extractSparklineValues(memSparkline);
  const netData = extractSparklineValues(netSparkline);

  // Enrich server list with per-server metrics
  const enrichedServers = useMemo(() => {
    if (!serverList?.length) return [];
    const metricsMap: Record<string, { cpu?: number; memory?: number; disk?: number }> = {};

    const parseResults = (results: any[], key: string) => {
      if (!results) return;
      for (const r of results) {
        const instance = r.metric?.instance;
        if (!instance) continue;
        const ip = instance.split(':')[0];
        if (!metricsMap[ip]) metricsMap[ip] = {};
        (metricsMap[ip] as any)[key] = parseFloat(r.value?.[1] || '0');
      }
    };

    if (perServerMetrics) {
      parseResults(perServerMetrics.cpu?.data?.result, 'cpu');
      parseResults(perServerMetrics.mem?.data?.result, 'memory');
      parseResults(perServerMetrics.disk?.data?.result, 'disk');
    }

    return serverList.map((s: any) => ({
      ...s,
      _metrics: metricsMap[s.ipAddress] || {},
    }));
  }, [serverList, perServerMetrics]);

  // Overall health percentage
  const healthPct = stats
    ? Math.round(((stats.online || 0) / Math.max(stats.total || 1, 1)) * 100)
    : null;

  return (
    <div className="space-y-6">
      {/* ────────────────────── Hero Status Bar ────────────────────── */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center justify-center divide-x divide-border flex-wrap">
            <HeroStat
              label="Servers"
              value={stats?.total || 0}
              sub={`${stats?.online || 0} online`}
              color="#10b981"
              href="/servers"
            />
            <VerticalDivider />
            <HeroStat
              label="Alerts Firing"
              value={aStats?.firing || 0}
              sub={aStats?.critical ? `${aStats.critical} critical` : undefined}
              color={aStats?.firing > 0 ? '#ef4444' : '#10b981'}
              href="/alerts"
              pulse={aStats?.firing > 0}
            />
            <VerticalDivider />
            <HeroStat
              label="Uptime"
              value={uStats?.totalMonitors ? `${uStats.upCount}/${uStats.totalMonitors}` : '—'}
              sub={uStats?.averageResponseTime ? `${uStats.averageResponseTime}ms avg` : undefined}
              color={uStats?.downCount > 0 ? '#ef4444' : '#10b981'}
              href="/uptime"
              pulse={uStats?.downCount > 0}
            />
            <VerticalDivider />
            <HeroStat
              label="Incidents"
              value={iStats?.open || 0}
              sub="open"
              color={iStats?.open > 0 ? '#f59e0b' : '#10b981'}
              href="/incidents"
            />
            <VerticalDivider />
            <HeroStat
              label="Targets"
              value={`${tData?.summary?.up || 0}/${tData?.summary?.total || 0}`}
              sub={tData?.summary?.down > 0 ? `${tData.summary.down} down` : 'all healthy'}
              color={tData?.summary?.down > 0 ? '#f59e0b' : '#3b82f6'}
            />
            <VerticalDivider />
            <HeroStat
              label="Fleet Health"
              value={healthPct != null ? `${healthPct}%` : '—'}
              color={
                healthPct == null
                  ? '#6b7280'
                  : healthPct >= 90
                  ? '#10b981'
                  : healthPct >= 70
                  ? '#f59e0b'
                  : '#ef4444'
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ────────────────────── Fleet-wide Sparklines ────────────────────── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avg CPU</p>
                <p className="text-xl font-bold mt-0.5">
                  {cpuData.length > 0 ? `${cpuData[cpuData.length - 1].toFixed(1)}%` : '—'}
                </p>
              </div>
              <Sparkline data={cpuData} color="#10b981" width={120} height={36} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avg Memory</p>
                <p className="text-xl font-bold mt-0.5">
                  {memData.length > 0 ? `${memData[memData.length - 1].toFixed(1)}%` : '—'}
                </p>
              </div>
              <Sparkline data={memData} color="#3b82f6" width={120} height={36} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Network In</p>
                <p className="text-xl font-bold mt-0.5">
                  {netData.length > 0 ? formatRate(netData[netData.length - 1]) : '—'}
                </p>
              </div>
              <Sparkline data={netData} color="#8b5cf6" width={120} height={36} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ────────────────────── Server Fleet ────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Server Fleet</CardTitle>
            <a href="/servers" className="text-xs text-primary hover:underline">View all</a>
          </div>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : enrichedServers.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {enrichedServers.map((server: any) => (
                <ServerFleetCard key={server.id} server={server} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No servers registered</p>
              <a href="/servers/new">
                <Button size="sm" variant="outline" className="mt-2">Add Server</Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ────────────────────── Alerts + Incidents + Uptime ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active Alerts */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Active Alerts
                {aStats?.firing > 0 && (
                  <Badge variant="danger" className="text-[10px]">{aStats.firing}</Badge>
                )}
              </CardTitle>
              <a href="/alerts" className="text-xs text-primary hover:underline">View all</a>
            </div>
          </CardHeader>
          <CardContent>
            {alertList.length > 0 ? (
              <div className="space-y-0.5 max-h-[320px] overflow-y-auto">
                {alertList.slice(0, 10).map((alert: any) => (
                  <AlertRow key={alert.id} alert={alert} onAck={(id) => ackMutation.mutate(id)} />
                ))}
                {alertList.length > 10 && (
                  <a href="/alerts" className="block text-center text-xs text-primary hover:underline py-2">
                    +{alertList.length - 10} more
                  </a>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-2 text-sm text-muted-foreground">No active alerts</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Incidents */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Open Incidents
                {iStats?.open > 0 && (
                  <Badge variant="warning" className="text-[10px]">{iStats.open}</Badge>
                )}
              </CardTitle>
              <a href="/incidents" className="text-xs text-primary hover:underline">View all</a>
            </div>
          </CardHeader>
          <CardContent>
            {incidentList.length > 0 ? (
              <div className="space-y-0.5">
                {incidentList.slice(0, 5).map((incident: any) => (
                  <IncidentRow key={incident.id} incident={incident} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="mt-2 text-sm text-muted-foreground">No open incidents</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Uptime Monitors */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Uptime Monitors
                {uStats?.downCount > 0 && (
                  <Badge variant="danger" className="text-[10px]">{uStats.downCount} down</Badge>
                )}
              </CardTitle>
              <a href="/uptime" className="text-xs text-primary hover:underline">View all</a>
            </div>
          </CardHeader>
          <CardContent>
            {monitorList.length > 0 ? (
              <div className="space-y-0.5">
                {monitorList.slice(0, 8).map((monitor: any) => (
                  <UptimeRow key={monitor.id} monitor={monitor} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="mt-2 text-sm text-muted-foreground">No monitors configured</p>
                <a href="/uptime">
                  <Button size="sm" variant="outline" className="mt-2">Add Monitor</Button>
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ────────────────────── Bandwidth + Prometheus Targets ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Bandwidth — 3 cols */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Top Bandwidth</CardTitle>
              <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                {['hour', 'day', 'week', 'month'].map((p) => (
                  <button
                    key={p}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      bwPeriod === p
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setBwPeriod(p)}
                  >
                    {p === 'hour' ? '1h' : p === 'day' ? '24h' : p === 'week' ? '7d' : '30d'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {bwLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
              </div>
            ) : (topBandwidth as any[])?.length > 0 ? (
              <div className="space-y-1">
                {(topBandwidth as any[]).map((server: any, i: number) => {
                  const maxBw = (topBandwidth as any[])[0]?.totalBandwidth || 1;
                  const pct = (server.totalBandwidth / maxBw) * 100;
                  return (
                    <div key={server.id} className="relative group">
                      <div
                        className="absolute inset-0 bg-blue-500/8 dark:bg-blue-400/15 rounded-md transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center justify-between p-2.5 rounded-md">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-muted-foreground w-5 text-right">
                            {i + 1}
                          </span>
                          <a
                            href={`/servers/${server.id}`}
                            className="text-sm font-medium hover:text-primary transition-colors"
                          >
                            {server.hostname}
                          </a>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono">
                          <span className="text-green-500 dark:text-green-400">
                            &#8595; {formatBytes(server.totalIn)}
                          </span>
                          <span className="text-blue-500 dark:text-blue-400">
                            &#8593; {formatBytes(server.totalOut)}
                          </span>
                          <span className="text-muted-foreground hidden sm:inline">
                            {formatRate(server.avgIn + server.avgOut)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No bandwidth data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Prometheus Targets — 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Prometheus Targets</CardTitle>
              {tData?.summary && (
                <span className="text-xs text-muted-foreground font-mono">
                  {tData.summary.up}/{tData.summary.total}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[320px] overflow-y-auto">
              {tData?.targets?.map((target: any) => (
                <div
                  key={target.scrapeUrl}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        target.health === 'up' ? 'bg-green-500' : 'bg-red-500 animate-pulse'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{target.labels?.job}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {target.labels?.instance}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={target.health === 'up' ? 'success' : 'danger'}
                    className="text-[10px] flex-shrink-0 uppercase"
                  >
                    {target.health}
                  </Badge>
                </div>
              ))}
              {(!tData?.targets || tData.targets.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-6">No targets configured</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ────────────────────── Quick Actions ────────────────────── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <a
          href="/servers/new"
          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium group-hover:text-primary transition-colors">Add Server</p>
            <p className="text-[11px] text-muted-foreground">Register new server</p>
          </div>
        </a>
        <a
          href={process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 flex-shrink-0">
            <span className="font-bold text-sm">G</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium group-hover:text-primary transition-colors">Grafana</p>
            <p className="text-[11px] text-muted-foreground">Advanced dashboards</p>
          </div>
        </a>
        <a
          href="/alerts"
          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium group-hover:text-primary transition-colors">Alerts</p>
            <p className="text-[11px] text-muted-foreground">Rules & templates</p>
          </div>
        </a>
        <a
          href="/uptime"
          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium group-hover:text-primary transition-colors">Uptime</p>
            <p className="text-[11px] text-muted-foreground">Service monitors</p>
          </div>
        </a>
      </div>
    </div>
  );
}
