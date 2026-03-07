'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, alertApi, metricsApi } from '@/lib/api';
import { Sparkline } from '@/components/dashboard/Sparkline';

const REFRESH_INTERVAL = 30000; // 30s

function useAutoRefresh(interval: number) {
  const [secondsLeft, setSecondsLeft] = useState(interval / 1000);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          setLastUpdated(new Date());
          return interval / 1000;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [interval]);

  const reset = useCallback(() => {
    setSecondsLeft(interval / 1000);
    setLastUpdated(new Date());
  }, [interval]);

  return { secondsLeft, lastUpdated, reset };
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  accentColor,
  trend,
  sparklineData,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor: string;
  trend?: 'up' | 'down' | 'neutral';
  sparklineData?: number[];
}) {
  return (
    <Card className="stat-card-accent" style={{ '--accent-color': accentColor } as React.CSSProperties}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {sparklineData && sparklineData.length >= 2 && (
                <Sparkline data={sparklineData} color={accentColor} width={72} height={28} className="mb-1" />
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                {trend === 'up' && <span className="text-red-500">&#9650;</span>}
                {trend === 'down' && <span className="text-green-500">&#9660;</span>}
                {subtitle}
              </p>
            )}
          </div>
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

export default function DashboardPage() {
  const [bwPeriod, setBwPeriod] = useState<string>('day');
  const { secondsLeft, lastUpdated, reset } = useAutoRefresh(REFRESH_INTERVAL);
  const [now, setNow] = useState(Date.now());

  // Update the "ago" display every 5 seconds
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const refetchOpts = { refetchInterval: REFRESH_INTERVAL };

  const { data: serverStats, isLoading: serversLoading, dataUpdatedAt: serversUpdatedAt } = useQuery({
    queryKey: ['serverStats'],
    queryFn: () => serverApi.stats(),
    ...refetchOpts,
  });

  const { data: alertStats, isLoading: alertsLoading } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
    ...refetchOpts,
  });

  const { data: targets, isLoading: targetsLoading } = useQuery({
    queryKey: ['targets'],
    queryFn: () => metricsApi.targets(),
    ...refetchOpts,
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverApi.list(),
    ...refetchOpts,
  });

  const { data: topBandwidth, isLoading: bwLoading } = useQuery({
    queryKey: ['bandwidthTop', bwPeriod],
    queryFn: () => metricsApi.bandwidthTop({ period: bwPeriod, limit: 10 }),
    refetchInterval: 60000,
  });

  // Sparkline data — fetch 1h of data in 12 points (5m steps)
  const end = Math.floor(Date.now() / 1000);
  const start = end - 3600;

  const { data: cpuSparkline } = useQuery({
    queryKey: ['sparkline-cpu'],
    queryFn: () => metricsApi.queryRange(
      '100 - avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100',
      start, end, '300'
    ),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: memSparkline } = useQuery({
    queryKey: ['sparkline-mem'],
    queryFn: () => metricsApi.queryRange(
      'avg((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100)',
      start, end, '300'
    ),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: netSparkline } = useQuery({
    queryKey: ['sparkline-net'],
    queryFn: () => metricsApi.queryRange(
      'sum(irate(node_network_receive_bytes_total[5m]))',
      start, end, '300'
    ),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const isLoading = serversLoading || alertsLoading || targetsLoading;

  const stats = serverStats as any;
  const alerts = alertStats as any;
  const targetsData = targets as any;
  const serverList = servers as any;

  const cpuData = extractSparklineValues(cpuSparkline);
  const memData = extractSparklineValues(memSparkline);
  const netData = extractSparklineValues(netSparkline);

  // Progress ring for refresh countdown
  const progress = 1 - (secondsLeft / (REFRESH_INTERVAL / 1000));

  return (
    <div className="space-y-6">
      {/* Header with auto-refresh indicator */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your monitoring infrastructure</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: `${REFRESH_INTERVAL}ms`, animationTimingFunction: 'linear' }} viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray={`${progress * 40.8} 40.8`} strokeLinecap="round" className="opacity-50" />
            </svg>
            <span>{formatTimeAgo(new Date(serversUpdatedAt || Date.now()))}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Total Servers"
              value={stats?.total || 0}
              subtitle={`${stats?.online || 0} online`}
              accentColor="#10b981"
              sparklineData={cpuData}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              }
            />
            <StatCard
              title="Active Alerts"
              value={alerts?.firing || 0}
              subtitle={`${alerts?.critical || 0} critical`}
              accentColor={alerts?.firing > 0 ? '#ef4444' : '#10b981'}
              trend={alerts?.firing > 0 ? 'up' : undefined}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            />
            <StatCard
              title="Targets Up"
              value={targetsData?.summary?.up || 0}
              subtitle={`of ${targetsData?.summary?.total || 0} total`}
              accentColor="#3b82f6"
              sparklineData={memData}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              title="Targets Down"
              value={targetsData?.summary?.down || 0}
              subtitle="Require attention"
              accentColor={targetsData?.summary?.down > 0 ? '#f59e0b' : '#10b981'}
              trend={targetsData?.summary?.down > 0 ? 'down' : undefined}
              sparklineData={netData}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </>
        )}
      </div>

      {/* Prometheus Targets & Recent Servers */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Prometheus Targets</CardTitle>
              {targetsData?.summary && (
                <span className="text-xs text-muted-foreground font-mono">
                  {targetsData.summary.up}/{targetsData.summary.total} up
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {targetsLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {targetsData?.targets?.map((target: any) => (
                  <div
                    key={target.scrapeUrl}
                    className="flex items-center justify-between p-2.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${
                          target.health === 'up'
                            ? 'bg-green-500 animate-pulse-dot'
                            : 'bg-red-500 animate-status-glow'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{target.labels?.job}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{target.labels?.instance}</p>
                      </div>
                    </div>
                    <Badge
                      variant={target.health === 'up' ? 'success' : 'danger'}
                      className="flex-shrink-0 text-[10px] uppercase"
                    >
                      {target.health}
                    </Badge>
                  </div>
                ))}
                {(!targetsData?.targets || targetsData.targets.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No targets configured
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Servers</CardTitle>
              {serverList?.length > 0 && (
                <a href="/servers" className="text-xs text-primary hover:underline">
                  View all
                </a>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {serversLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {serverList?.slice(0, 5).map((server: any) => (
                  <a
                    key={server.id}
                    href={`/servers/${server.id}`}
                    className="flex items-center justify-between p-2.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${
                          server.status === 'ONLINE'
                            ? 'bg-green-500'
                            : server.status === 'WARNING'
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                          {server.hostname}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{server.ipAddress}</p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        server.status === 'ONLINE'
                          ? 'success'
                          : server.status === 'WARNING'
                            ? 'warning'
                            : 'danger'
                      }
                      className="flex-shrink-0 text-[10px] uppercase"
                    >
                      {server.status}
                    </Badge>
                  </a>
                ))}
                {(!serverList || serverList.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No servers added yet
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Network Traffic - Top Servers by Bandwidth */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Top Servers by Bandwidth</CardTitle>
            <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
              {['hour', 'day', 'week', 'month'].map(p => (
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
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
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
                        <div>
                          <a
                            href={`/servers/${server.id}`}
                            className="text-sm font-medium hover:text-primary transition-colors"
                          >
                            {server.hostname}
                          </a>
                          <p className="text-xs text-muted-foreground font-mono">{server.ipAddress}</p>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-green-500 dark:text-green-400">
                            &#8595; {formatBytes(server.totalIn)}
                          </span>
                          <span className="text-blue-500 dark:text-blue-400">
                            &#8593; {formatBytes(server.totalOut)}
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-0.5 font-mono">
                          avg: {formatRate(server.avgIn + server.avgOut)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No bandwidth data available yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <a
          href="/servers/new"
          className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm group-hover:text-primary transition-colors">Add Server</p>
            <p className="text-xs text-muted-foreground">Register a new server</p>
          </div>
        </a>
        <a
          href={process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="h-10 w-10 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center text-orange-500">
            <span className="font-bold text-sm">G</span>
          </div>
          <div>
            <p className="font-medium text-sm group-hover:text-primary transition-colors">Open Grafana</p>
            <p className="text-xs text-muted-foreground">View detailed dashboards</p>
          </div>
          <svg className="w-3.5 h-3.5 ml-auto text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <a
          href="/alerts"
          className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="h-10 w-10 rounded-lg bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center text-red-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm group-hover:text-primary transition-colors">Manage Alerts</p>
            <p className="text-xs text-muted-foreground">Configure alert rules</p>
          </div>
        </a>
      </div>
    </div>
  );
}
