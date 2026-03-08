'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, metricsApi, agentApi, containerApi, maintenanceApi, VirtualContainer, ContainerMetrics, forecastApi } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricsCharts, BandwidthSummary } from '@/components/dashboard/MetricsCharts';
import { ServerForecasting } from './forecasting';

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  ONLINE: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
  OFFLINE: 'secondary',
};

const AGENT_TYPES = [
  { value: 'NODE_EXPORTER', label: 'Node Exporter', defaultPort: 9100 },
  { value: 'MYSQL_EXPORTER', label: 'MySQL Exporter', defaultPort: 9104 },
  { value: 'POSTGRES_EXPORTER', label: 'PostgreSQL Exporter', defaultPort: 9187 },
  { value: 'MONGODB_EXPORTER', label: 'MongoDB Exporter', defaultPort: 9216 },
  { value: 'NGINX_EXPORTER', label: 'Nginx Exporter', defaultPort: 9113 },
  { value: 'REDIS_EXPORTER', label: 'Redis Exporter', defaultPort: 9121 },
  { value: 'LIBVIRT_EXPORTER', label: 'Libvirt Exporter', defaultPort: 9177 },
  { value: 'LITESPEED_EXPORTER', label: 'LiteSpeed Exporter', defaultPort: 9122 },
  { value: 'EXIM_EXPORTER', label: 'Exim Exporter', defaultPort: 9123 },
  { value: 'CPANEL_EXPORTER', label: 'cPanel Exporter', defaultPort: 9124 },
  { value: 'PROMTAIL', label: 'Promtail', defaultPort: 9080 },
  { value: 'APP_AGENT', label: 'Application Agent', defaultPort: 9101 },
  { value: 'CUSTOM', label: 'Custom Exporter', defaultPort: 9100 },
];

interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  status: string;
  environment: string;
  region?: string;
  tags?: string[];
  createdAt: string;
  agents?: Array<{ id: string; type: string; port: number; status: string }>;
  alerts?: Array<{ id: string; message: string; severity: string; startsAt: string }>;
  metadata?: {
    os?: {
      distro?: string;
      distroId?: string;
      distroVersion?: string;
      distroCodename?: string;
      kernel?: string;
      arch?: string;
      platform?: string;
      controlPanel?: string;
    };
    hardware?: {
      cpuModel?: string;
      cpuCores?: number;
      memoryTotal?: number;
    };
    lastBootUptime?: number;
    [key: string]: unknown;
  };
}

interface Metrics {
  cpu: number | null;
  memory: number | null;
  memoryTotal: number | null;
  memoryAvailable: number | null;
  disk: number | null;
  diskTotal: number | null;
  diskAvailable: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  networkIn: number | null;
  networkOut: number | null;
  mysqlConnections: number | null;
  mysqlMaxConnections: number | null;
  mysqlQueriesPerSec: number | null;
  mysqlSlowQueries: number | null;
  mysqlUptime: number | null;
  mysqlBufferPoolSize: number | null;
  mysqlBufferPoolUsed: number | null;
  lsConnections: number | null;
  lsSSLConnections: number | null;
  lsMaxConnections: number | null;
  lsReqPerSec: number | null;
  lsReqProcessing: number | null;
  lsTotalRequests: number | null;
  lsBpsIn: number | null;
  lsBpsOut: number | null;
  lsCacheHitsPerSec: number | null;
  lsStaticHitsPerSec: number | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatNetworkSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null) return 'N/A';
  const kbps = bytesPerSec / 1024;
  if (kbps < 1) return `${bytesPerSec.toFixed(0)} B/s`;
  const mbps = kbps / 1024;
  if (mbps < 1) return `${kbps.toFixed(1)} KB/s`;
  const gbps = mbps / 1024;
  if (gbps < 1) return `${mbps.toFixed(2)} MB/s`;
  return `${gbps.toFixed(2)} GB/s`;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatMemoryBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatTraffic(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatBytesRate(bytesPerSec: number | null): string {
  if (bytesPerSec === null || bytesPerSec === 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  const i = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(bytesPerSec) / Math.log(1024))));
  return `${(bytesPerSec / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function ContainerRow({ container: c, metrics }: { container: VirtualContainer; metrics?: ContainerMetrics }) {
  const [expanded, setExpanded] = useState(false);
  const meta = c.metadata as Record<string, unknown> | null;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8 text-center">
          <span className="text-muted-foreground text-xs">{expanded ? '▼' : '▶'}</span>
        </TableCell>
        <TableCell className="font-medium">{c.name}</TableCell>
        <TableCell>
          <Badge variant="outline">{c.type.toUpperCase()}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant={c.status === 'running' ? 'success' : c.status === 'paused' ? 'warning' : 'secondary'}>
            {c.status}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-sm">{c.ipAddress || '—'}</TableCell>
        <TableCell className="text-right">
          {metrics?.cpuPercent != null ? `${metrics.cpuPercent.toFixed(1)}%` : '—'}
        </TableCell>
        <TableCell className="text-right">
          {metrics?.memoryUsageBytes != null && metrics?.memoryMaxBytes
            ? `${formatBytes(metrics.memoryUsageBytes)} / ${formatBytes(metrics.memoryMaxBytes)}`
            : '—'}
        </TableCell>
        <TableCell className="text-right text-green-600">
          {metrics?.netRxBytesPerSec != null ? formatBytesRate(metrics.netRxBytesPerSec) : formatTraffic(c.networkRxBytes)}
        </TableCell>
        <TableCell className="text-right text-blue-600">
          {metrics?.netTxBytesPerSec != null ? formatBytesRate(metrics.netTxBytesPerSec) : formatTraffic(c.networkTxBytes)}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Container ID</p>
                <p className="font-mono text-sm">{c.containerId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Type</p>
                <p className="text-sm">{c.type}</p>
              </div>
              {metrics?.vCPUs != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">vCPUs</p>
                  <p className="text-sm">{metrics.vCPUs}</p>
                </div>
              )}
              {metrics?.cpuPercent != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">CPU Usage</p>
                  <p className="text-sm font-medium">{metrics.cpuPercent.toFixed(1)}%</p>
                </div>
              )}
              {metrics?.memoryUsageBytes != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Memory Used</p>
                  <p className="text-sm font-medium">{formatBytes(metrics.memoryUsageBytes)}</p>
                </div>
              )}
              {metrics?.memoryMaxBytes != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Memory Max</p>
                  <p className="text-sm">{formatBytes(metrics.memoryMaxBytes)}</p>
                </div>
              )}
              {metrics?.diskReadBytesPerSec != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Disk Read</p>
                  <p className="text-sm">{formatBytesRate(metrics.diskReadBytesPerSec)}</p>
                </div>
              )}
              {metrics?.diskWriteBytesPerSec != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Disk Write</p>
                  <p className="text-sm">{formatBytesRate(metrics.diskWriteBytesPerSec)}</p>
                </div>
              )}
              {!metrics && meta && Object.keys(meta).length > 0 && (
                <>
                  {meta.vcpus !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">vCPUs</p>
                      <p className="text-sm">{String(meta.vcpus)}</p>
                    </div>
                  )}
                  {meta.memoryKB !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Memory</p>
                      <p className="text-sm">{formatBytes(Number(meta.memoryKB) * 1024)}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            {c.lastSeen && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Last seen: {new Date(c.lastSeen).toLocaleString()}.
                  {c.status === 'running' ? ' Currently active.' : ` Currently ${c.status}.`}
                </p>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function MetricCard({
  label,
  value,
  unit,
  subtext,
  decimals = 1
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

type TabKey = 'overview' | 'metrics' | 'containers' | 'agents' | 'alerts';

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params?.id as string;

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // State for manual agent registration
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [agentType, setAgentType] = useState('NODE_EXPORTER');
  const [agentPort, setAgentPort] = useState(9100);
  const [agentVersion, setAgentVersion] = useState('');
  const [registerError, setRegisterError] = useState('');

  // Tag management state
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Container sort state
  const [containerSort, setContainerSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => serverApi.get(serverId),
  });

  const { data: metrics } = useQuery({
    queryKey: ['serverMetrics', serverId],
    queryFn: () => metricsApi.serverMetrics(serverId),
    enabled: !!server,
    refetchInterval: 5000,
  });

  const { data: containers } = useQuery({
    queryKey: ['serverContainers', serverId],
    queryFn: () => containerApi.listByServer(serverId),
    enabled: !!server,
    refetchInterval: 30000,
  });

  const containerList = containers as VirtualContainer[] | undefined;

  const { data: containerMetrics } = useQuery({
    queryKey: ['containerMetrics', serverId],
    queryFn: () => containerApi.metrics(serverId),
    enabled: !!containerList && containerList.length > 0,
    refetchInterval: 15000,
  });

  const containerMetricsList = containerMetrics as ContainerMetrics[] | undefined;

  const { data: allTags } = useQuery({
    queryKey: ['serverTags'],
    queryFn: () => serverApi.tags(),
  });

  const { data: maintenanceStatus } = useQuery({
    queryKey: ['serverMaintenance', serverId],
    queryFn: () => maintenanceApi.serverActive(serverId),
    enabled: !!server,
    refetchInterval: 60000,
  });

  const updateTagsMutation = useMutation({
    mutationFn: (tags: string[]) => serverApi.update(serverId, { tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['serverTags'] });
    },
  });

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    const current = (server as Server | undefined)?.tags || [];
    if (current.includes(trimmed)) return;
    updateTagsMutation.mutate([...current, trimmed]);
    setTagInput('');
    setTagSuggestions([]);
  };

  const removeTag = (tag: string) => {
    const current = (server as Server | undefined)?.tags || [];
    updateTagsMutation.mutate(current.filter(t => t !== tag));
  };

  const handleTagInputChange = (value: string) => {
    setTagInput(value);
    const q = value.trim().toLowerCase();
    const currentTags = (server as Server | undefined)?.tags || [];
    if (q && allTags) {
      setTagSuggestions(allTags.filter(t => t.toLowerCase().includes(q) && !currentTags.includes(t)));
    } else {
      setTagSuggestions([]);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => serverApi.delete(serverId),
    onSuccess: () => {
      router.push('/servers');
    },
  });

  const registerAgentMutation = useMutation({
    mutationFn: (data: { agentType: string; port: number; version?: string }) =>
      agentApi.register({
        hostname: serverData?.hostname || '',
        ipAddress: serverData?.ipAddress || '',
        agentType: data.agentType,
        port: data.port,
        version: data.version,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      setShowRegisterForm(false);
      setRegisterError('');
      setAgentVersion('');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      setRegisterError(error.response?.data?.error || error.message || 'Failed to register agent');
    },
  });

  const unregisterAgentMutation = useMutation({
    mutationFn: (agentId: string) => agentApi.unregister(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
    },
  });

  const handleRegisterAgent = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    registerAgentMutation.mutate({
      agentType,
      port: agentPort,
      version: agentVersion || undefined,
    });
  };

  const handleAgentTypeChange = (type: string) => {
    setAgentType(type);
    const agentConfig = AGENT_TYPES.find((t) => t.value === type);
    if (agentConfig) {
      setAgentPort(agentConfig.defaultPort);
    }
  };

  const serverData = server as Server | undefined;
  const metricsData = metrics as Metrics | undefined;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!serverData) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold">Server not found</h2>
        <Link href="/servers">
          <Button className="mt-4">Back to Servers</Button>
        </Link>
      </div>
    );
  }

  const containerCount = containerList?.length ?? 0;
  const alertCount = serverData.alerts?.length ?? 0;
  const agentCount = serverData.agents?.length ?? 0;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'metrics', label: 'Metrics' },
    { key: 'containers', label: 'Containers', count: containerCount > 0 ? containerCount : undefined },
    { key: 'agents', label: 'Agents', count: agentCount > 0 ? agentCount : undefined },
    { key: 'alerts', label: 'Alerts', count: alertCount > 0 ? alertCount : undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/servers">
            <Button variant="ghost" size="icon">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{serverData.hostname}</h2>
            <p className="text-muted-foreground font-mono">{serverData.ipAddress}</p>
          </div>
          <Badge variant={statusColors[serverData.status]}>{serverData.status}</Badge>
          {(maintenanceStatus as any)?.inMaintenance && (
            <Badge variant="warning">In Maintenance</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm('Are you sure you want to delete this server?')) {
                deleteMutation.mutate();
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {serverData.tags?.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-blue-900 ml-0.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <div className="relative">
          <Input
            ref={tagInputRef}
            value={tagInput}
            onChange={(e) => handleTagInputChange(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Add tag..."
            className="w-32 h-8 text-sm"
          />
          {tagSuggestions.length > 0 && (
            <div className="absolute z-10 w-48 mt-1 bg-card border rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {tagSuggestions.slice(0, 8).map(tag => (
                <button
                  key={tag}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                  onClick={() => { addTag(tag); tagInputRef.current?.focus(); }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-0 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === tab.key
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="CPU Usage" value={metricsData?.cpu ?? null} unit="%" />
            <MetricCard
              label="Memory Usage"
              value={metricsData?.memory ?? null}
              unit="%"
              subtext={metricsData?.memoryTotal ? `${formatBytes(metricsData.memoryAvailable)} free of ${formatBytes(metricsData.memoryTotal)}` : undefined}
            />
            <MetricCard
              label="Disk Usage"
              value={metricsData?.disk ?? null}
              unit="%"
              subtext={metricsData?.diskTotal ? `${formatBytes(metricsData.diskAvailable)} free of ${formatBytes(metricsData.diskTotal)}` : undefined}
            />
            <MetricCard
              label="Load Average"
              value={metricsData?.load1 ?? null}
              decimals={2}
              subtext={metricsData?.load5 != null && metricsData?.load15 != null ? `5m: ${metricsData.load5.toFixed(2)} / 15m: ${metricsData.load15.toFixed(2)}` : undefined}
            />
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Network In</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{formatNetworkSpeed(metricsData?.networkIn ?? null)}</p>
              <p className="text-xs text-muted-foreground mt-1">Download</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Network Out</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{formatNetworkSpeed(metricsData?.networkOut ?? null)}</p>
              <p className="text-xs text-muted-foreground mt-1">Upload</p>
            </div>
          </div>

          {/* MySQL Metrics */}
          {serverData.agents?.some(a => a.type === 'MYSQL_EXPORTER' && a.status === 'RUNNING') && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
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
          {serverData.agents?.some(a => a.type === 'LITESPEED_EXPORTER' && a.status === 'RUNNING') && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                      {metricsData?.lsConnections != null ? Math.round(metricsData.lsConnections) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      SSL: {metricsData?.lsSSLConnections != null ? Math.round(metricsData.lsSSLConnections) : 'N/A'}
                    </p>
                  </div>
                  <div className="p-4 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">Requests/sec</p>
                    <p className="text-2xl font-bold mt-1 text-green-600">
                      {metricsData?.lsReqPerSec?.toFixed(1) ?? 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Processing: {metricsData?.lsReqProcessing != null ? Math.round(metricsData.lsReqProcessing) : 'N/A'}
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
                      {metricsData?.lsBpsOut != null ? formatNetworkSpeed(metricsData.lsBpsOut) : 'N/A'}
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
                    <dd><Badge variant="outline">{serverData.environment}</Badge></dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Region</dt>
                    <dd>{serverData.region || 'Not set'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{new Date(serverData.createdAt).toLocaleDateString()}</dd>
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
                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
                    {serverData.metadata.os?.platform && !['Unknown', 'none', 'nonenone', 'physical'].includes(serverData.metadata.os.platform) && (
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
                            <span className="text-muted-foreground ml-1">({serverData.metadata.hardware.cpuCores} cores)</span>
                          )}
                        </dd>
                      </div>
                    )}
                    {serverData.metadata.hardware?.memoryTotal != null && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Total Memory</dt>
                        <dd className="font-medium">{formatMemoryBytes(serverData.metadata.hardware.memoryTotal)}</dd>
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ===== METRICS TAB ===== */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <BandwidthSummary serverId={serverId} />
          <ServerForecasting serverId={serverId} />
          <MetricsCharts serverId={serverId} hasMySQLExporter={serverData.agents?.some(a => a.type === 'MYSQL_EXPORTER' && a.status === 'RUNNING')} />
        </div>
      )}

      {/* ===== CONTAINERS TAB ===== */}
      {activeTab === 'containers' && (
        <div className="space-y-6">
          {containerList && containerList.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Virtual Machines / Containers
                  <span className="text-sm font-normal text-muted-foreground">
                    ({containerList.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const running = containerList.filter(c => c.status === 'running').length;
                  const stopped = containerList.length - running;
                  const totalMemUsed = containerMetricsList?.reduce((sum, m) => sum + (m.memoryUsageBytes ?? 0), 0) ?? 0;
                  const totalMemMax = containerMetricsList?.reduce((sum, m) => sum + (m.memoryMaxBytes ?? 0), 0) ?? 0;
                  const totalCpu = containerMetricsList?.reduce((sum, m) => sum + (m.cpuPercent ?? 0), 0) ?? 0;
                  const totalVCPUs = containerMetricsList?.reduce((sum, m) => sum + (m.vCPUs ?? 0), 0) ?? 0;
                  const hasCpu = containerMetricsList?.some(m => m.cpuPercent != null);
                  const hasMem = totalMemMax > 0 || totalMemUsed > 0;
                  return (
                    <div className="flex flex-wrap gap-4 mb-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        <span className="text-muted-foreground">{running} running</span>
                      </div>
                      {stopped > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                          <span className="text-muted-foreground">{stopped} stopped</span>
                        </div>
                      )}
                      {totalVCPUs > 0 && (
                        <div className="text-muted-foreground">
                          {totalVCPUs} vCPUs
                        </div>
                      )}
                      {hasCpu && (
                        <div className="text-muted-foreground">
                          CPU: {totalCpu.toFixed(1)}%
                        </div>
                      )}
                      {hasMem && (
                        <div className="text-muted-foreground">
                          Memory: {totalMemUsed > 0 ? `${formatBytes(totalMemUsed)} / ` : ''}{formatBytes(totalMemMax)}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      {[
                        { key: 'name', label: 'Name', align: '' },
                        { key: 'type', label: 'Type', align: '' },
                        { key: 'status', label: 'Status', align: '' },
                        { key: 'ip', label: 'IP Address', align: '' },
                        { key: 'cpu', label: 'CPU', align: 'text-right' },
                        { key: 'memory', label: 'Memory', align: 'text-right' },
                        { key: 'rx', label: 'RX', align: 'text-right' },
                        { key: 'tx', label: 'TX', align: 'text-right' },
                      ].map(col => (
                        <TableHead
                          key={col.key}
                          className={`${col.align} cursor-pointer select-none hover:text-foreground`}
                          onClick={() => setContainerSort(prev =>
                            prev.key === col.key
                              ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                              : { key: col.key, dir: 'asc' }
                          )}
                        >
                          {col.label}
                          {containerSort.key === col.key && (
                            <span className="ml-1 text-xs">{containerSort.dir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const getMetrics = (c: VirtualContainer) =>
                        containerMetricsList?.find(m => m.domain === c.name || m.domain === c.containerId);
                      const sorted = [...containerList].sort((a, b) => {
                        const dir = containerSort.dir === 'asc' ? 1 : -1;
                        const ma = getMetrics(a);
                        const mb = getMetrics(b);
                        switch (containerSort.key) {
                          case 'name': return dir * a.name.localeCompare(b.name);
                          case 'type': return dir * a.type.localeCompare(b.type);
                          case 'status': return dir * a.status.localeCompare(b.status);
                          case 'ip': return dir * (a.ipAddress || '').localeCompare(b.ipAddress || '');
                          case 'cpu': return dir * ((ma?.cpuPercent ?? -1) - (mb?.cpuPercent ?? -1));
                          case 'memory': return dir * ((ma?.memoryUsageBytes ?? ma?.memoryMaxBytes ?? -1) - (mb?.memoryUsageBytes ?? mb?.memoryMaxBytes ?? -1));
                          case 'rx': return dir * (Number(a.networkRxBytes) - Number(b.networkRxBytes));
                          case 'tx': return dir * (Number(a.networkTxBytes) - Number(b.networkTxBytes));
                          default: return 0;
                        }
                      });
                      return sorted.map((c) => (
                        <ContainerRow
                          key={c.id}
                          container={c}
                          metrics={getMetrics(c)}
                        />
                      ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">No containers or VMs detected on this server.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ===== AGENTS TAB ===== */}
      {activeTab === 'agents' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Installed Agents</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRegisterForm(!showRegisterForm)}
              >
                {showRegisterForm ? 'Cancel' : 'Register Agent'}
              </Button>
            </CardHeader>
            <CardContent>
              {showRegisterForm && (
                <form onSubmit={handleRegisterAgent} className="mb-6 p-4 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg border border-blue-500/20">
                  <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-3">Register Existing Exporter</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
                    Use this to register an exporter that is already installed and running on the server.
                  </p>

                  {registerError && (
                    <div className="mb-4 p-3 bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 rounded text-red-700 dark:text-red-400 text-sm">
                      {registerError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Exporter Type
                      </label>
                      <select
                        value={agentType}
                        onChange={(e) => handleAgentTypeChange(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                      >
                        {AGENT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        value={agentPort}
                        onChange={(e) => setAgentPort(parseInt(e.target.value, 10))}
                        min={1}
                        max={65535}
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        The port where the exporter is listening (e.g., 9100 for node_exporter)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Version (Optional)
                      </label>
                      <input
                        type="text"
                        value={agentVersion}
                        onChange={(e) => setAgentVersion(e.target.value)}
                        placeholder="e.g., 1.6.1"
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={registerAgentMutation.isPending}
                      className="w-full"
                    >
                      {registerAgentMutation.isPending ? 'Registering...' : 'Register Agent'}
                    </Button>
                  </div>
                </form>
              )}

              {serverData.agents && serverData.agents.length > 0 ? (
                <div className="space-y-3">
                  {serverData.agents.map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{AGENT_TYPES.find(t => t.value === agent.type)?.label || agent.type.replaceAll('_', ' ')}</p>
                        <p className="text-sm text-muted-foreground">Port: {agent.port}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={agent.status === 'RUNNING' ? 'success' : 'secondary'}>
                          {agent.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => {
                            if (confirm('Are you sure you want to unregister this agent?')) {
                              unregisterAgentMutation.mutate(agent.id);
                            }
                          }}
                          disabled={unregisterAgentMutation.isPending}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showRegisterForm ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No agents installed</p>
                  <Button variant="outline" onClick={() => setShowRegisterForm(true)}>
                    Register Existing
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== ALERTS TAB ===== */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          {serverData.alerts && serverData.alerts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {serverData.alerts.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-3 bg-red-500/10 dark:bg-red-500/20 rounded-lg border border-red-500/20">
                      <div>
                        <p className="font-medium text-red-800">{alert.message}</p>
                        <p className="text-sm text-red-600">
                          Started: {new Date(alert.startsAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="danger">{alert.severity}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">No active alerts for this server.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
