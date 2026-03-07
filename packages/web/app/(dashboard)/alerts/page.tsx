'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const statusColors: Record<string, 'danger' | 'success' | 'secondary'> = {
  FIRING: 'danger',
  RESOLVED: 'success',
  ACKNOWLEDGED: 'secondary',
};

interface Alert {
  id: string;
  message: string;
  severity: string;
  status: string;
  startsAt: string;
  rule?: { name: string };
  server?: { hostname: string; ipAddress?: string };
  labels?: { instance?: string; hostname?: string; alertname?: string; [key: string]: string | undefined };
}

interface AlertStats {
  firing: number;
  critical: number;
  warning: number;
  resolved: number;
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('FIRING');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', { status: statusFilter, severity: severityFilter }],
    queryFn: () => alertApi.list({ status: statusFilter || undefined, severity: severityFilter || undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
  });

  const invalidateAlerts = () => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    queryClient.invalidateQueries({ queryKey: ['alertStats'] });
  };

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertApi.acknowledge(id, 'Admin'),
    onSuccess: invalidateAlerts,
  });

  const bulkAcknowledgeMutation = useMutation({
    mutationFn: (alertIds: string[]) => alertApi.bulkAcknowledge(alertIds, 'Admin'),
    onSuccess: () => { invalidateAlerts(); setSelectedAlerts(new Set()); },
  });

  const bulkSilenceMutation = useMutation({
    mutationFn: (alertIds: string[]) => alertApi.bulkSilence(alertIds, 'Admin', 60),
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

  // Only show bulk actions for firing alerts
  const selectedFiringIds = alertList
    ?.filter(a => selectedAlerts.has(a.id) && (a.status === 'FIRING' || a.status === 'ACKNOWLEDGED'))
    .map(a => a.id) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Alerts</h2>
          <p className="text-muted-foreground">Monitor and manage active alerts</p>
        </div>
        <div className="flex gap-2">
          <a href="/alerts/templates">
            <Button variant="outline">Templates</Button>
          </a>
          <a href="/alerts/rules">
            <Button variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manage Rules
          </Button>
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
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
        <Card className="stat-card-accent" style={{ '--accent-color': '#10b981' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resolved</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{alertStats?.resolved || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
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
                {bulkSilenceMutation.isPending ? 'Silencing...' : 'Silence Selected (1h)'}
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
                      {alert.rule && (
                        <p className="text-xs text-muted-foreground">{alert.rule.name}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {alert.server ? (
                        <div>
                          <span className="font-mono text-sm">{alert.server.hostname}</span>
                          {alert.server.ipAddress && (
                            <p className="text-xs text-muted-foreground">{alert.server.ipAddress}</p>
                          )}
                        </div>
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
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(alert.startsAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {alert.status === 'FIRING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                        >
                          Acknowledge
                        </Button>
                      )}
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
