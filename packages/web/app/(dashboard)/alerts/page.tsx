'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
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

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', { status: statusFilter, severity: severityFilter }],
    queryFn: () => alertApi.list({ status: statusFilter || undefined, severity: severityFilter || undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertApi.acknowledge(id, 'Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });

  const alertList = alerts as Alert[] | undefined;
  const alertStats = stats as AlertStats | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alerts</h2>
          <p className="text-muted-foreground">Monitor and manage active alerts</p>
        </div>
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

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Firing</p>
            <p className="text-3xl font-bold text-red-600">{alertStats?.firing || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Critical</p>
            <p className="text-3xl font-bold text-red-800">{alertStats?.critical || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Warning</p>
            <p className="text-3xl font-bold text-yellow-600">{alertStats?.warning || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Resolved</p>
            <p className="text-3xl font-bold text-green-600">{alertStats?.resolved || 0}</p>
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
              <h3 className="mt-2 text-sm font-medium text-gray-900">No alerts</h3>
              <p className="mt-1 text-sm text-gray-500">All systems are operating normally.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
