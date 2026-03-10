'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { serverApi, anomalyApi } from '@/lib/api';
import { useWebSocket } from '@/components/providers';
import { useEffect } from 'react';

interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  status: string;
  environment?: string;
  region?: string;
  lastSeen?: string;
}

interface NodeAnomalyRate {
  serverId: string;
  rate: number;
  anomalousCount: number;
  totalCount: number;
  timestamp: string;
}

interface ServerHealthCardProps {
  server: Server;
  anomalyRate?: NodeAnomalyRate;
}

function ServerHealthCard({ server, anomalyRate }: ServerHealthCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return 'bg-green-500';
      case 'WARNING':
        return 'bg-yellow-500';
      case 'CRITICAL':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return 'success';
      case 'WARNING':
        return 'warning';
      case 'CRITICAL':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const getAnomalyColor = (rate?: number) => {
    if (!rate) return 'text-gray-500';
    if (rate >= 50) return 'text-red-600';
    if (rate >= 25) return 'text-orange-600';
    if (rate >= 10) return 'text-yellow-600';
    return 'text-green-600';
  };

  const formatUptime = (lastSeen?: string) => {
    if (!lastSeen) return 'Unknown';
    const diff = Date.now() - new Date(lastSeen).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <Card className="border-border/60 bg-surface/70 transition-all hover:border-cyan-400/25 hover:bg-accent/15">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{server.hostname}</CardTitle>
          <div className={`w-3 h-3 rounded-full ${getStatusColor(server.status)}`} />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(server.status) as any} className="text-xs">
            {server.status}
          </Badge>
          {server.environment && (
            <Badge variant="outline" className="text-xs">
              {server.environment}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          <p>{server.ipAddress}</p>
          {server.region && <p>{server.region}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Last Seen</p>
            <p className="font-medium">{formatUptime(server.lastSeen)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Anomaly Rate</p>
            <p className={`font-medium ${getAnomalyColor(anomalyRate?.rate)}`}>
              {anomalyRate ? `${anomalyRate.rate.toFixed(1)}%` : 'N/A'}
            </p>
          </div>
        </div>

        {anomalyRate && anomalyRate.anomalousCount > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {anomalyRate.anomalousCount} of {anomalyRate.totalCount} metrics anomalous
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ServerHealthCards() {
  const { data: servers, isLoading: serversLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverApi.list(),
    refetchInterval: 30000,
  });

  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ['anomalyRates'],
    queryFn: () => anomalyApi.rates(),
    refetchInterval: 30000,
  });

  const { subscribe } = useWebSocket();

  useEffect(() => {
    // Subscribe to server status updates
    const unsubscribeServerUpdate = subscribe('server:updated', () => {
      // Refetch servers data
    });

    return () => {
      unsubscribeServerUpdate();
    };
  }, [subscribe]);

  const serverList = servers as Server[] | undefined;
  const rateList = rates as NodeAnomalyRate[] | undefined;

  // Create a map of serverId to anomaly rate for quick lookup
  const rateMap = new Map<string, NodeAnomalyRate>();
  if (rateList) {
    rateList.forEach((rate) => rateMap.set(rate.serverId, rate));
  }

  if (serversLoading || ratesLoading) {
    return (
      <LoadingState
        rows={6}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        rowClassName="h-40"
      />
    );
  }

  if (!serverList || serverList.length === 0) {
    return (
      <EmptyState
        className="min-h-[220px]"
        title="No servers configured"
        description="Server health cards will appear here once nodes begin reporting into the platform."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {serverList.map((server) => (
        <ServerHealthCard key={server.id} server={server} anomalyRate={rateMap.get(server.id)} />
      ))}
    </div>
  );
}
