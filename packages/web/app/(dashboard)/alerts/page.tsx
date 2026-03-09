'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/components/providers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { alertApi } from '@/lib/api';

const severityColors: Record<string, 'danger' | 'warning' | 'secondary' | 'default'> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'secondary',
  DEBUG: 'default',
};

const statusColors: Record<string, 'danger' | 'success' | 'secondary' | 'warning'> = {
  FIRING: 'danger',
  RESOLVED: 'success',
  ACKNOWLEDGED: 'warning',
  SILENCED: 'secondary',
};

const SILENCE_DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: '8 hours', value: 480 },
  { label: '24 hours', value: 1440 },
];

interface Alert {
  id: string;
  message: string;
  severity: string;
  status: string;
  startsAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  serverId?: string;
  rule?: { name: string };
  template?: { name: string };
  server?: { id: string; hostname: string; ipAddress?: string };
  labels?: { instance?: string; hostname?: string; alertname?: string; [key: string]: string | undefined };
  annotations?: { summary?: string; description?: string; value?: string; [key: string]: string | undefined };
}

interface AlertStats {
  firing: number;
  critical: number;
  warning: number;
  resolved: number;
  silenced: number;
  acknowledged: number;
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();
  const [statusFilter, setStatusFilter] = useState('FIRING');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [silenceDuration, setSilenceDuration] = useState(60);

  // Listen for real-time alert updates via Socket.io (replaces aggressive polling)
  useEffect(() => {
    const unsub = subscribe('alerts:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    });
    return unsub;
  }, [subscribe, queryClient]);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', { status: statusFilter, severity: severityFilter }],
    queryFn: () => alertApi.list({ status: statusFilter || undefined, severity: severityFilter || undefined }),
    refetchInterval: 60000, // Fallback polling at 60s (Socket.io handles real-time)
  });

  const { data: stats } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
    refetchInterval: 60000, // Fallback polling at 60s
  });

  const invalidateAlerts = () => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    queryClient.invalidateQueries({ queryKey: ['alertStats'] });
  };

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertApi.acknowledge(id, 'Admin'),
    onSuccess: invalidateAlerts,
  });

  const silenceMutation = useMutation({
    mutationFn: (id: string) => alertApi.silence(id, 'Admin', silenceDuration),
    onSuccess: invalidateAlerts,
  });

  const bulkAcknowledgeMutation = useMutation({
    mutationFn: (alertIds: string[]) => alertApi.bulkAcknowledge(alertIds, 'Admin'),
    onSuccess: () => { invalidateAlerts(); setSelectedAlerts(new Set()); },
  });

  const bulkSilenceMutation = useMutation({
    mutationFn: (alertIds: string[]) => alertApi.bulkSilence(alertIds, 'Admin', silenceDuration),
    onSuccess: () => { invalidateAlerts(); setSelectedAlerts(new Set()); },
  });

  const alertList = alerts as Alert[] | undefined;
  const alertStats = stats as AlertStats | undefined;

  const toggleAlertSelection = (alertId: string) => {
    setSelectedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(alertId)) next.delete(alertId);
      else next.add(alertId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!alertList) return;
    if (selectedAlerts.size === alertList.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(alertList.map(a => a.id)));
    }
  };

  const selectedFiringIds = alertList
    ?.filter(a => selectedAlerts.has(a.id) && (a.status === 'FIRING' || a.status === 'ACKNOWLEDGED'))
    .map(a => a.id) || [];

  const silenceLabel = SILENCE_DURATIONS.find(d => d.value === silenceDuration)?.label || `${silenceDuration}m`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Alerts</h2>
          <p className="text-muted-foreground">Monitor and manage active alerts</p>
        </div>
        <div className="flex gap-2">
          <a href="/alerts/templates">
            <Button variant="outline" size="sm">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Templates
            </Button>
          </a>
          <a href="/alerts/rules">
            <Button variant="outline" size="sm">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Rules
            </Button>
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="stat-card-accent" style={{ '--accent-color': '#ef4444' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Firing</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{alertStats?.firing || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#dc2626' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Critical</p>
            <p className="text-3xl font-bold text-red-700 dark:text-red-300 mt-1">{alertStats?.critical || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#f59e0b' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Warning</p>
            <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{alertStats?.warning || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#6366f1' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Acknowledged</p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{alertStats?.acknowledged || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#8b5cf6' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Silenced</p>
            <p className="text-3xl font-bold text-violet-600 dark:text-violet-400 mt-1">{alertStats?.silenced || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#10b981' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resolved</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{alertStats?.resolved || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Silence Duration */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="FIRING">Firing</option>
              <option value="RESOLVED">Resolved</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="SILENCED">Silenced</option>
            </Select>
            <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">All Severity</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </Select>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Silence for:</label>
              <Select
                value={String(silenceDuration)}
                onChange={(e) => setSilenceDuration(Number(e.target.value))}
              >
                {SILENCE_DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedAlerts.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 rounded-lg">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
            {selectedAlerts.size} alert{selectedAlerts.size !== 1 ? 's' : ''} selected
          </span>
          {selectedFiringIds.length > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkAcknowledgeMutation.mutate(selectedFiringIds)}
                disabled={bulkAcknowledgeMutation.isPending}
              >
                {bulkAcknowledgeMutation.isPending ? 'Acknowledging...' : 'Acknowledge Selected'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkSilenceMutation.mutate(selectedFiringIds)}
                disabled={bulkSilenceMutation.isPending}
              >
                {bulkSilenceMutation.isPending ? 'Silencing...' : `Silence Selected (${silenceLabel})`}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelectedAlerts(new Set())}>
            Clear Selection
          </Button>
        </div>
      )}

      {/* Alert List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isLoading ? 'Loading...' : `${alertList?.length || 0} Alerts`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !alertList?.length ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium">No alerts</h3>
              <p className="mt-1 text-sm text-muted-foreground">All systems are operating normally.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={alertList.length > 0 && selectedAlerts.size === alertList.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertList?.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedAlerts.has(alert.id)}
                        onChange={() => toggleAlertSelection(alert.id)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{alert.message}</p>
                      {alert.annotations?.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{alert.annotations.description}</p>
                      )}
                      {(alert.rule || alert.template) && (
                        <p className="text-xs text-muted-foreground opacity-60">
                          {alert.rule?.name || alert.template?.name}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {alert.server ? (
                        <a href={`/servers/${alert.server.id}`} className="hover:underline">
                          <span className="font-mono text-sm">{alert.server.hostname}</span>
                          {alert.server.ipAddress && (
                            <p className="text-xs text-muted-foreground">{alert.server.ipAddress}</p>
                          )}
                        </a>
                      ) : alert.labels?.instance || alert.labels?.hostname ? (
                        <span className="font-mono text-sm text-muted-foreground">
                          {alert.labels.hostname || alert.labels.instance}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityColors[alert.severity] || 'default'}>
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[alert.status] || 'secondary'}>
                        {alert.status}
                      </Badge>
                      {alert.acknowledgedBy && (alert.status === 'ACKNOWLEDGED' || alert.status === 'SILENCED') && (
                        <p className="text-xs text-muted-foreground mt-1">
                          by {alert.acknowledgedBy}
                          {alert.acknowledgedAt && <> at {new Date(alert.acknowledgedAt).toLocaleTimeString()}</>}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(alert.startsAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {alert.status === 'FIRING' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acknowledgeMutation.mutate(alert.id)}
                              disabled={acknowledgeMutation.isPending}
                            >
                              Ack
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => silenceMutation.mutate(alert.id)}
                              disabled={silenceMutation.isPending}
                              title={`Silence for ${silenceLabel}`}
                            >
                              Silence ({silenceLabel})
                            </Button>
                          </>
                        )}
                        {alert.status === 'ACKNOWLEDGED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => silenceMutation.mutate(alert.id)}
                            disabled={silenceMutation.isPending}
                            title={`Silence for ${silenceLabel}`}
                          >
                            Silence ({silenceLabel})
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
