'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { infraChangeApi, serverApi } from '@/lib/api';

interface InfraChange {
  id: string;
  serverId: string | null;
  changeType: string;
  source: string;
  title: string;
  details: Record<string, unknown> | null;
  detectedAt: string;
  createdAt: string;
  server?: { id: string; hostname: string; ipAddress: string } | null;
}

interface Server {
  id: string;
  hostname: string;
}

const CHANGE_TYPES = ['PACKAGE_UPDATE', 'CONFIG_CHANGE', 'SERVICE_RESTART', 'DEPLOY'];

function changeTypeBadgeVariant(type: string): 'default' | 'warning' | 'success' | 'danger' {
  switch (type) {
    case 'DEPLOY': return 'success';
    case 'CONFIG_CHANGE': return 'warning';
    case 'SERVICE_RESTART': return 'danger';
    case 'PACKAGE_UPDATE': return 'default';
    default: return 'default';
  }
}

export default function InfraChangesPage() {
  const queryClient = useQueryClient();
  const [filterServerId, setFilterServerId] = useState('');
  const [filterChangeType, setFilterChangeType] = useState('');

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverApi.list(),
  });

  const { data: changesData, isLoading } = useQuery({
    queryKey: ['infraChanges', filterServerId, filterChangeType],
    queryFn: () =>
      infraChangeApi.list({
        ...(filterServerId && { serverId: filterServerId }),
        ...(filterChangeType && { changeType: filterChangeType }),
        limit: 100,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => infraChangeApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['infraChanges'] }),
  });

  const changeList = changesData as InfraChange[] | undefined;
  const serverList = servers as Server[] | undefined;

  const changesByType = useMemo(() => {
    const counts: Record<string, number> = {};
    changeList?.forEach((c) => {
      counts[c.changeType] = (counts[c.changeType] || 0) + 1;
    });
    return counts;
  }, [changeList]);

  const todayCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return changeList?.filter((c) => new Date(c.detectedAt) >= today).length || 0;
  }, [changeList]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Infrastructure Changes"
        description="Track deployments, config changes, package updates and service restarts."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryStat label="Total Changes" value={changeList?.length || 0} tone="primary" />
        <SummaryStat label="Today" value={todayCount} tone="success" />
        <SummaryStat label="Deploys" value={changesByType['DEPLOY'] || 0} />
        <SummaryStat label="Config Changes" value={changesByType['CONFIG_CHANGE'] || 0} tone="warning" />
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex gap-4 items-end">
            <div className="w-48">
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Server</label>
              <Select
                value={filterServerId}
                onChange={(e) => setFilterServerId(e.target.value)}
              >
                <option value="">All servers</option>
                {serverList?.map((s) => (
                  <option key={s.id} value={s.id}>{s.hostname}</option>
                ))}
              </Select>
            </div>
            <div className="w-48">
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Change Type</label>
              <Select
                value={filterChangeType}
                onChange={(e) => setFilterChangeType(e.target.value)}
              >
                <option value="">All types</option>
                {CHANGE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
            {(filterServerId || filterChangeType) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterServerId('');
                  setFilterChangeType('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : !changeList?.length ? (
        <EmptyState
          title="No infrastructure changes"
          description="Changes will appear here when detected by agents or received via webhooks."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-3">
          {changeList.map((change) => (
            <Card key={change.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5">
                      <Badge variant={changeTypeBadgeVariant(change.changeType)}>
                        {change.changeType.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{change.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {change.server && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                            </svg>
                            {change.server.hostname}
                          </span>
                        )}
                        <span>Source: {change.source}</span>
                        <span>
                          {new Date(change.detectedAt).toLocaleString()}
                        </span>
                      </div>
                      {change.details && Object.keys(change.details).length > 0 && (
                        <pre className="mt-2 text-xs text-muted-foreground bg-accent/30 rounded p-2 overflow-x-auto max-w-xl">
                          {JSON.stringify(change.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
                    onClick={() => {
                      if (confirm('Delete this change record?')) deleteMutation.mutate(change.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
