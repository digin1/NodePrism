'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DiskMount } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';
import {
  Server,
  Metrics,
  formatBytes,
  formatNetworkSpeed,
  formatUptime,
  formatMemoryBytes,
} from './types';

function MetricCard({
  label,
  value,
  unit,
  subtext,
  decimals = 1,
}: {
  label: string;
  value: number | null;
  unit?: string;
  subtext?: string;
  decimals?: number;
}) {
  return (
    <div className="p-4 bg-muted/50 rounded-lg">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {value !== null ? `${value.toFixed(decimals)}${unit || ''}` : 'N/A'}
      </p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}

// Exim per-domain email stats table
function EximDomainTable({ serverId }: { serverId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: ['eximDomains', serverId],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/server/${serverId}/exim-domains`);
      const json = await res.json();
      return json.data as { domain: string; sentToday: number }[];
    },
    enabled: expanded,
    refetchInterval: 30000,
  });

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-purple-500 hover:text-purple-600 font-medium flex items-center gap-1"
      >
        {expanded ? '▾' : '▸'} Top sending domains
      </button>
      {expanded && data && (
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1 font-medium">Domain</th>
                <th className="text-right py-1 font-medium">Sent Today</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 20).map((d) => (
                <tr key={d.domain} className="border-b border-border/50">
                  <td className="py-1 font-mono">{d.domain}</td>
                  <td className="text-right py-1 tabular-nums">{d.sentToday.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// cPanel per-account table
function CpanelAccountTable({ serverId }: { serverId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: ['cpanelAccounts', serverId],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/server/${serverId}/cpanel-accounts`);
      const json = await res.json();
      return json.data as { account: string; diskUsage: number; domains: number }[];
    },
    enabled: expanded,
    refetchInterval: 30000,
  });

  const formatDisk = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-cyan-500 hover:text-cyan-600 font-medium flex items-center gap-1"
      >
        {expanded ? '▾' : '▸'} Account details (by disk usage)
      </button>
      {expanded && data && (
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1 font-medium">Account</th>
                <th className="text-right py-1 font-medium">Disk</th>
                <th className="text-right py-1 font-medium">Domains</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 30).map((a) => (
                <tr key={a.account} className="border-b border-border/50">
                  <td className="py-1 font-mono">{a.account}</td>
                  <td className="text-right py-1 tabular-nums">{formatDisk(a.diskUsage)}</td>
                  <td className="text-right py-1 tabular-nums">{a.domains}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface OverviewTabProps {
  serverData: Server;
  metricsData: Metrics | undefined;
  diskMounts: DiskMount[] | undefined;
  serverId: string;
}

export function OverviewTab({ serverData, metricsData, diskMounts, serverId }: OverviewTabProps) {
  const { formatDateOnly } = useFormatDate();

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="CPU Usage" value={metricsData?.cpu ?? null} unit="%" />
        <MetricCard
          label="Memory Usage"
          value={metricsData?.memory ?? null}
          unit="%"
          subtext={
            metricsData?.memoryTotal
              ? `${formatBytes(metricsData.memoryAvailable)} free of ${formatBytes(metricsData.memoryTotal)}`
              : undefined
          }
        />
        <MetricCard
          label="Disk Usage"
          value={metricsData?.disk ?? null}
          unit="%"
          subtext={
            metricsData?.diskTotal
              ? `${formatBytes(metricsData.diskAvailable)} free of ${formatBytes(metricsData.diskTotal)}`
              : undefined
          }
        />
        <MetricCard
          label="Load Average"
          value={metricsData?.load1 ?? null}
          decimals={2}
          subtext={
            metricsData?.load5 != null && metricsData?.load15 != null
              ? `5m: ${metricsData.load5.toFixed(2)} / 15m: ${metricsData.load15.toFixed(2)}`
              : undefined
          }
        />
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">Network In</p>
          <p className="text-2xl font-bold mt-1 text-green-600">
            {formatNetworkSpeed(metricsData?.networkIn ?? null)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Download</p>
        </div>
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">Network Out</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">
            {formatNetworkSpeed(metricsData?.networkOut ?? null)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Upload</p>
        </div>
      </div>

      {/* Disk Usage per Mount */}
      {diskMounts && diskMounts.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Disk Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {diskMounts.map((m) => {
                const usagePct = m.sizeBytes > 0 ? (m.usedBytes / m.sizeBytes) * 100 : 0;
                const barColor =
                  usagePct > 95
                    ? 'bg-red-500'
                    : usagePct > 80
                      ? 'bg-yellow-500'
                      : 'bg-green-500';
                return (
                  <div key={m.mount}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-mono font-medium">{m.mount}</span>
                      <span className="text-muted-foreground">
                        {formatBytes(m.usedBytes)} / {formatBytes(m.sizeBytes)} (
                        {formatBytes(m.availBytes)} free)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all`}
                        style={{ width: `${Math.min(usagePct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                      <span>
                        {m.device} ({m.fstype})
                      </span>
                      <span>{usagePct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MySQL Metrics */}
      {serverData.agents?.some(
        (a) => a.type === 'MYSQL_EXPORTER' && a.status === 'RUNNING'
      ) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              MySQL Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
              <div className="p-4 bg-orange-500/10 dark:bg-orange-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Connections</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">
                  {metricsData?.mysqlConnections ?? 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max: {metricsData?.mysqlMaxConnections ?? 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-orange-500/10 dark:bg-orange-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Queries/sec</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">
                  {metricsData?.mysqlQueriesPerSec?.toFixed(1) ?? 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-orange-500/10 dark:bg-orange-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Slow Queries</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">
                  {metricsData?.mysqlSlowQueries ?? 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total</p>
              </div>
              <div className="p-4 bg-orange-500/10 dark:bg-orange-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Buffer Pool</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">
                  {metricsData?.mysqlBufferPoolSize && metricsData?.mysqlBufferPoolUsed
                    ? `${((metricsData.mysqlBufferPoolUsed / metricsData.mysqlBufferPoolSize) * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData?.mysqlBufferPoolSize
                    ? `${formatBytes(metricsData.mysqlBufferPoolSize)} total`
                    : ''}
                </p>
              </div>
              <div className="p-4 bg-orange-500/10 dark:bg-orange-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">
                  {formatUptime(metricsData?.mysqlUptime ?? null)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LiteSpeed Metrics */}
      {serverData.agents?.some(
        (a) => a.type === 'LITESPEED_EXPORTER' && a.status === 'RUNNING'
      ) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <svg
                className="w-5 h-5 text-green-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              LiteSpeed Web Server
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              <div className="p-4 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Connections</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {metricsData?.lsConnections != null
                    ? Math.round(metricsData.lsConnections)
                    : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  SSL:{' '}
                  {metricsData?.lsSSLConnections != null
                    ? Math.round(metricsData.lsSSLConnections)
                    : 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Requests/sec</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {metricsData?.lsReqPerSec?.toFixed(1) ?? 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Processing:{' '}
                  {metricsData?.lsReqProcessing != null
                    ? Math.round(metricsData.lsReqProcessing)
                    : 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {metricsData?.lsTotalRequests != null
                    ? metricsData.lsTotalRequests >= 1000000
                      ? `${(metricsData.lsTotalRequests / 1000000).toFixed(1)}M`
                      : metricsData.lsTotalRequests >= 1000
                        ? `${(metricsData.lsTotalRequests / 1000).toFixed(1)}K`
                        : Math.round(metricsData.lsTotalRequests).toString()
                    : 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Bandwidth</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {metricsData?.lsBpsOut != null
                    ? formatNetworkSpeed(metricsData.lsBpsOut)
                    : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Outbound</p>
              </div>
              <div className="p-4 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Cache Hits/sec</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {metricsData?.lsCacheHitsPerSec?.toFixed(1) ?? 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Static: {metricsData?.lsStaticHitsPerSec?.toFixed(1) ?? 'N/A'}/s
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exim Mail & cPanel panels side by side */}
      {(serverData.agents?.some((a) => a.type === 'EXIM_EXPORTER' && a.status === 'RUNNING') ||
        serverData.agents?.some(
          (a) => a.type === 'CPANEL_EXPORTER' && a.status === 'RUNNING'
        )) && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Exim Mail Metrics */}
          {serverData.agents?.some(
            (a) => a.type === 'EXIM_EXPORTER' && a.status === 'RUNNING'
          ) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-purple-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  Exim Mail Server
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-2">
                  <div className="p-3 bg-purple-500/10 dark:bg-purple-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Queue</p>
                    <p className="text-xl font-bold text-purple-600">
                      {metricsData?.eximQueueSize != null
                        ? Math.round(metricsData.eximQueueSize)
                        : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Frozen:{' '}
                      {metricsData?.eximQueueFrozen != null
                        ? Math.round(metricsData.eximQueueFrozen)
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/10 dark:bg-purple-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Delivered Today</p>
                    <p className="text-xl font-bold text-purple-600">
                      {metricsData?.eximDeliveriesToday != null
                        ? metricsData.eximDeliveriesToday >= 1000
                          ? `${(metricsData.eximDeliveriesToday / 1000).toFixed(1)}K`
                          : Math.round(metricsData.eximDeliveriesToday).toString()
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/10 dark:bg-purple-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Received Today</p>
                    <p className="text-xl font-bold text-purple-600">
                      {metricsData?.eximReceivedToday != null
                        ? metricsData.eximReceivedToday >= 1000
                          ? `${(metricsData.eximReceivedToday / 1000).toFixed(1)}K`
                          : Math.round(metricsData.eximReceivedToday).toString()
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/10 dark:bg-purple-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Bounces / Rejected</p>
                    <p className="text-xl font-bold text-purple-600">
                      {metricsData?.eximBouncesToday != null
                        ? Math.round(metricsData.eximBouncesToday)
                        : 'N/A'}
                      {' / '}
                      {metricsData?.eximRejectedToday != null
                        ? Math.round(metricsData.eximRejectedToday)
                        : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Deferred:{' '}
                      {metricsData?.eximDeferredToday != null
                        ? Math.round(metricsData.eximDeferredToday)
                        : 'N/A'}
                    </p>
                  </div>
                </div>
                <EximDomainTable serverId={serverId} />
              </CardContent>
            </Card>
          )}

          {/* cPanel Metrics */}
          {serverData.agents?.some(
            (a) => a.type === 'CPANEL_EXPORTER' && a.status === 'RUNNING'
          ) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-cyan-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  cPanel / WHM
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-2">
                  <div className="p-3 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Total Accounts</p>
                    <p className="text-xl font-bold text-cyan-600">
                      {metricsData?.cpanelAccounts != null
                        ? Math.round(metricsData.cpanelAccounts)
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-xl font-bold text-cyan-600">
                      {metricsData?.cpanelAccountsActive != null
                        ? Math.round(metricsData.cpanelAccountsActive)
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Suspended</p>
                    <p className="text-xl font-bold text-red-500">
                      {metricsData?.cpanelAccountsSuspended != null
                        ? Math.round(metricsData.cpanelAccountsSuspended)
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">Domains</p>
                    <p className="text-xl font-bold text-cyan-600">
                      {metricsData?.cpanelDomains != null
                        ? Math.round(metricsData.cpanelDomains)
                        : 'N/A'}
                    </p>
                  </div>
                </div>
                <CpanelAccountTable serverId={serverId} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Server Info + System Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Server Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Hostname</dt>
                <dd className="font-medium">{serverData.hostname}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IP Address</dt>
                <dd className="font-mono">{serverData.ipAddress}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Environment</dt>
                <dd>
                  <Badge variant="outline">{serverData.environment}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Region</dt>
                <dd>{serverData.region || 'Not set'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateOnly(serverData.createdAt)}</dd>
              </div>
              {serverData.metadata?.lastBootUptime != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Uptime</dt>
                  <dd>{formatUptime(serverData.metadata.lastBootUptime as number)}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {(serverData.metadata?.os || serverData.metadata?.hardware) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                System Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                {serverData.metadata.os?.distro && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">OS</dt>
                    <dd className="font-medium text-right">{serverData.metadata.os.distro}</dd>
                  </div>
                )}
                {serverData.metadata.os?.kernel && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Kernel</dt>
                    <dd className="font-mono text-sm">{serverData.metadata.os.kernel}</dd>
                  </div>
                )}
                {serverData.metadata.os?.arch && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Architecture</dt>
                    <dd>{serverData.metadata.os.arch}</dd>
                  </div>
                )}
                {serverData.metadata.os?.platform &&
                  !['Unknown', 'none', 'nonenone', 'physical'].includes(
                    serverData.metadata.os.platform
                  ) && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Platform</dt>
                      <dd>{serverData.metadata.os.platform}</dd>
                    </div>
                  )}
                {serverData.metadata.os?.controlPanel && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Control Panel</dt>
                    <dd className="font-medium">{serverData.metadata.os.controlPanel}</dd>
                  </div>
                )}
                {serverData.metadata.hardware?.cpuModel && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">CPU</dt>
                    <dd className="text-right text-sm max-w-[60%]">
                      {serverData.metadata.hardware.cpuModel}
                      {serverData.metadata.hardware.cpuCores && (
                        <span className="text-muted-foreground ml-1">
                          ({serverData.metadata.hardware.cpuCores} cores)
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                {serverData.metadata.hardware?.memoryTotal != null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total Memory</dt>
                    <dd className="font-medium">
                      {formatMemoryBytes(serverData.metadata.hardware.memoryTotal)}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
