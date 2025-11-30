'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, metricsApi } from '@/lib/api';

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  ONLINE: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
  OFFLINE: 'secondary',
  DEPLOYING: 'warning',
};

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
  disk: number | null;
  load: number | null;
}

function MetricCard({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {value !== null ? `${value.toFixed(1)}${unit || ''}` : 'N/A'}
      </p>
    </div>
  );
}

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params.id as string;

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => serverApi.get(serverId),
  });

  const { data: metrics } = useQuery({
    queryKey: ['serverMetrics', serverId],
    queryFn: () => metricsApi.serverMetrics(serverId),
    enabled: !!server,
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
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="CPU Usage" value={metricsData?.cpu ?? null} unit="%" />
        <MetricCard label="Memory Usage" value={metricsData?.memory ?? null} unit="%" />
        <MetricCard label="Disk Usage" value={metricsData?.disk ?? null} unit="%" />
        <MetricCard label="Load (1m)" value={metricsData?.load ?? null} />
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
          <CardHeader>
            <CardTitle className="text-lg">Installed Agents</CardTitle>
          </CardHeader>
          <CardContent>
            {serverData.agents && serverData.agents.length > 0 ? (
              <div className="space-y-3">
                {serverData.agents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{agent.type.replace('_', ' ')}</p>
                      <p className="text-sm text-muted-foreground">Port: {agent.port}</p>
                    </div>
                    <Badge variant={agent.status === 'RUNNING' ? 'success' : 'secondary'}>
                      {agent.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No agents installed</p>
                <Button onClick={() => deployMutation.mutate()} disabled={deployMutation.isPending}>
                  Deploy Node Exporter
                </Button>
              </div>
            )}
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
    </div>
  );
}
