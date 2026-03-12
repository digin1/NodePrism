'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import {
  serverApi,
  metricsApi,
  containerApi,
  maintenanceApi,
  VirtualContainer,
  ContainerMetricsResponse,
  DiskMount,
} from '@/lib/api';
import { ServerTypeBadge, isServerTypeTag } from '@/components/icons/ServerTypeIcons';
import { OverviewTab } from './_components/OverviewTab';
import { MetricsTab } from './_components/MetricsTab';
import { ContainerSection } from './_components/ContainerSection';
import { AgentsTab } from './_components/AgentsTab';
import { ServerAlerts } from './_components/ServerAlerts';
import { Server, Metrics } from './_components/types';

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  ONLINE: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
  OFFLINE: 'secondary',
};

type TabKey = 'overview' | 'metrics' | 'containers' | 'agents' | 'alerts';

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params?.id as string;

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Tag management state
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const tagInputRef = useRef<HTMLInputElement>(null);

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

  const { data: containerMetricsResponse } = useQuery({
    queryKey: ['containerMetrics', serverId],
    queryFn: () => containerApi.metrics(serverId),
    enabled: !!containerList && containerList.length > 0,
    refetchInterval: 15000,
  });

  const { data: diskMounts } = useQuery({
    queryKey: ['diskUsage', serverId],
    queryFn: () => metricsApi.diskUsage(serverId),
    enabled: !!server,
    refetchInterval: 30000,
  });

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
    updateTagsMutation.mutate(current.filter((t) => t !== tag));
  };

  const handleTagInputChange = (value: string) => {
    setTagInput(value);
    const q = value.trim().toLowerCase();
    const currentTags = (server as Server | undefined)?.tags || [];
    if (q && allTags) {
      setTagSuggestions(
        allTags.filter((t) => t.toLowerCase().includes(q) && !currentTags.includes(t))
      );
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
    {
      key: 'containers',
      label: 'Containers',
      count: containerCount > 0 ? containerCount : undefined,
    },
    { key: 'agents', label: 'Agents', count: agentCount > 0 ? agentCount : undefined },
    { key: 'alerts', label: 'Alerts', count: alertCount > 0 ? alertCount : undefined },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Server Detail"
        title={serverData.hostname}
        description={serverData.ipAddress}
      >
        <Link href="/servers">
          <Button variant="outline">Back to Servers</Button>
        </Link>
        <Badge variant={statusColors[serverData.status]}>{serverData.status}</Badge>
        {(maintenanceStatus as any)?.inMaintenance && (
          <Badge variant="warning">In Maintenance</Badge>
        )}
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
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          label="Environment"
          value={serverData.environment || 'Unknown'}
          tone="primary"
        />
        <SummaryStat label="Agents" value={serverData.agents?.length || 0} />
        <SummaryStat
          label="Active Alerts"
          value={serverData.alerts?.length || 0}
          tone={(serverData.alerts?.length || 0) > 0 ? 'danger' : 'default'}
        />
        <SummaryStat label="Created" value={new Date(serverData.createdAt).toLocaleDateString()} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {serverData.tags?.filter(isServerTypeTag).map((tag) => (
          <ServerTypeBadge key={tag} type={tag} />
        ))}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {serverData.tags
          ?.filter((t) => !isServerTypeTag(t))
          .map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
            >
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-blue-900 ml-0.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
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
              {tagSuggestions.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                  onClick={() => {
                    addTag(tag);
                    tagInputRef.current?.focus();
                  }}
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
          {tabs.map((tab) => (
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
                <span
                  className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === tab.key
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
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
        <OverviewTab
          serverData={serverData}
          metricsData={metricsData}
          diskMounts={diskMounts as DiskMount[] | undefined}
          serverId={serverId}
        />
      )}

      {/* ===== METRICS TAB ===== */}
      {activeTab === 'metrics' && (
        <MetricsTab serverId={serverId} serverData={serverData} />
      )}

      {/* ===== CONTAINERS TAB ===== */}
      {activeTab === 'containers' && (
        <ContainerSection
          containerList={containerList}
          containerMetricsResponse={containerMetricsResponse as ContainerMetricsResponse | undefined}
        />
      )}

      {/* ===== AGENTS TAB ===== */}
      {activeTab === 'agents' && (
        <AgentsTab serverData={serverData} serverId={serverId} />
      )}

      {/* ===== ALERTS TAB ===== */}
      {activeTab === 'alerts' && (
        <ServerAlerts alerts={serverData.alerts} />
      )}
    </div>
  );
}
