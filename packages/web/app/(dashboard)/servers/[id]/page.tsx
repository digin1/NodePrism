'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, metricsApi, agentApi } from '@/lib/api';
import { MetricsCharts, BandwidthSummary } from '@/components/dashboard/MetricsCharts';

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  ONLINE: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
  OFFLINE: 'secondary',
  DEPLOYING: 'warning',
};

const AGENT_TYPES = [
  { value: 'NODE_EXPORTER', label: 'Node Exporter', defaultPort: 9100 },
  { value: 'MYSQL_EXPORTER', label: 'MySQL Exporter', defaultPort: 9104 },
  { value: 'NGINX_EXPORTER', label: 'Nginx Exporter', defaultPort: 9113 },
  { value: 'REDIS_EXPORTER', label: 'Redis Exporter', defaultPort: 9121 },
  { value: 'POSTGRES_EXPORTER', label: 'PostgreSQL Exporter', defaultPort: 9187 },
  { value: 'APP_AGENT', label: 'Application Agent', defaultPort: 9101 },
  { value: 'CUSTOM', label: 'Custom Exporter', defaultPort: 9100 },
];

interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  sshPort: number;
  sshUsername?: string;
  status: string;
  environment: string;
  region?: string;
  createdAt: string;
  agents?: Array<{ id: string; type: string; port: number; status: string }>;
  alerts?: Array<{ id: string; message: string; severity: string; startsAt: string }>;
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
    <div className="p-4 bg-gray-50 rounded-lg">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {value !== null ? `${value.toFixed(decimals)}${unit || ''}` : 'N/A'}
      </p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params.id as string;

  // State for manual agent registration
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [agentType, setAgentType] = useState('NODE_EXPORTER');
  const [agentPort, setAgentPort] = useState(9100);
  const [agentVersion, setAgentVersion] = useState('');
  const [registerError, setRegisterError] = useState('');

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => serverApi.get(serverId),
  });

  const { data: metrics } = useQuery({
    queryKey: ['serverMetrics', serverId],
    queryFn: () => metricsApi.serverMetrics(serverId),
    enabled: !!server,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const deleteMutation = useMutation({
    mutationFn: () => serverApi.delete(serverId),
    onSuccess: () => {
      router.push('/servers');
    },
  });

  const deployMutation = useMutation({
    mutationFn: () => serverApi.deploy(serverId, ['NODE_EXPORTER']),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
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
            <h2 className="text-2xl font-bold text-gray-900">{serverData.hostname}</h2>
            <p className="text-muted-foreground font-mono">{serverData.ipAddress}</p>
          </div>
          <Badge variant={statusColors[serverData.status]}>{serverData.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending || serverData.status === 'DEPLOYING'}
          >
            {deployMutation.isPending ? 'Deploying...' : 'Deploy Agents'}
          </Button>
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

      {/* Metrics */}
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
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-muted-foreground">Network In</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{formatNetworkSpeed(metricsData?.networkIn ?? null)}</p>
          <p className="text-xs text-muted-foreground mt-1">Download</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-muted-foreground">Network Out</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">{formatNetworkSpeed(metricsData?.networkOut ?? null)}</p>
          <p className="text-xs text-muted-foreground mt-1">Upload</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Server Info */}
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
                <dt className="text-muted-foreground">SSH Port</dt>
                <dd className="font-mono">{serverData.sshPort}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">SSH User</dt>
                <dd>{serverData.sshUsername || 'Not set'}</dd>
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
            </dl>
          </CardContent>
        </Card>

        {/* Agents */}
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
            {/* Manual Registration Form */}
            {showRegisterForm && (
              <form onSubmit={handleRegisterAgent} className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <h4 className="font-medium text-blue-900 mb-3">Register Existing Exporter</h4>
                <p className="text-sm text-blue-700 mb-4">
                  Use this to register an exporter that is already installed and running on the server.
                </p>

                {registerError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    {registerError}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Exporter Type
                    </label>
                    <select
                      value={agentType}
                      onChange={(e) => handleAgentTypeChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {AGENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={agentPort}
                      onChange={(e) => setAgentPort(parseInt(e.target.value, 10))}
                      min={1}
                      max={65535}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The port where the exporter is listening (e.g., 9100 for node_exporter)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Version (Optional)
                    </label>
                    <input
                      type="text"
                      value={agentVersion}
                      onChange={(e) => setAgentVersion(e.target.value)}
                      placeholder="e.g., 1.6.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{agent.type.replace('_', ' ')}</p>
                      <p className="text-sm text-muted-foreground">Port: {agent.port}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={agent.status === 'RUNNING' ? 'success' : 'secondary'}>
                        {agent.status}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => deployMutation.mutate()} disabled={deployMutation.isPending}>
                    Deploy via SSH
                  </Button>
                  <Button variant="outline" onClick={() => setShowRegisterForm(true)}>
                    Register Existing
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      {serverData.alerts && serverData.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {serverData.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
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
      )}

      {/* Bandwidth Summary */}
      <BandwidthSummary serverId={serverId} />

      {/* Real-time Metrics Charts */}
      <MetricsCharts serverId={serverId} />
    </div>
  );
}
