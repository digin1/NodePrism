'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { incidentApi } from '@/lib/api';

interface IncidentUpdate {
  id: string;
  message: string;
  status: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface Incident {
  id: string;
  title: string;
  description: string | null;
  status: string;
  severity: string;
  alertId: string | null;
  serverId: string | null;
  assignee: string | null;
  startedAt: string;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updates?: IncidentUpdate[];
  _count?: { updates: number };
}

interface IncidentStats {
  open: number;
  resolved: number;
  total: number;
  avgResolutionTime: number | null;
}

const statusColors: Record<string, 'danger' | 'warning' | 'secondary' | 'success' | 'default'> = {
  INVESTIGATING: 'danger',
  IDENTIFIED: 'warning',
  MONITORING: 'secondary',
  RESOLVED: 'success',
  POSTMORTEM: 'default',
};

const severityColors: Record<string, 'danger' | 'warning' | 'secondary' | 'default'> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'secondary',
  DEBUG: 'default',
};

const statusLabels: Record<string, string> = {
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Identified',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
  POSTMORTEM: 'Post-mortem',
};

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    severity: 'WARNING',
    assignee: '',
    alertId: '',
    serverId: '',
  });
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');

  // Pre-fill form from query params (e.g., from Slack "Create Incident" button)
  useEffect(() => {
    if (!searchParams) return;
    const title = searchParams.get('title');
    if (title) {
      setCreateForm({
        title: title,
        description: searchParams.get('description') || '',
        severity: searchParams.get('severity') || 'WARNING',
        assignee: '',
        alertId: searchParams.get('alertId') || '',
        serverId: searchParams.get('serverId') || '',
      });
      setShowCreateModal(true);
    }
  }, [searchParams]);

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents', statusFilter],
    queryFn: () => incidentApi.list({ status: statusFilter || undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ['incidentStats'],
    queryFn: () => incidentApi.stats(),
  });

  const { data: incidentDetail } = useQuery({
    queryKey: ['incident', selectedIncident?.id],
    queryFn: () => incidentApi.get(selectedIncident!.id),
    enabled: !!selectedIncident?.id,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) => {
      const { alertId, serverId, ...rest } = data;
      return incidentApi.create({
        ...rest,
        ...(alertId && { alertId }),
        ...(serverId && { serverId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incidentStats'] });
      setShowCreateModal(false);
      setCreateForm({ title: '', description: '', severity: 'WARNING', assignee: '', alertId: '', serverId: '' });
      // Clear URL params after creation
      if (searchParams?.get('title')) {
        window.history.replaceState({}, '', '/incidents');
      }
    },
  });

  const addUpdateMutation = useMutation({
    mutationFn: ({ id, message, status }: { id: string; message: string; status?: string }) =>
      incidentApi.addUpdate(id, { message, status: status || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident', selectedIncident?.id] });
      queryClient.invalidateQueries({ queryKey: ['incidentStats'] });
      setUpdateMessage('');
      setUpdateStatus('');
    },
  });

  const incidentList = incidents as Incident[] | undefined;
  const incidentStats = stats as IncidentStats | undefined;
  const detail = incidentDetail as Incident | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Incidents</h2>
          <p className="text-muted-foreground">Track and manage service incidents</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Incident
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="stat-card-accent" style={{ '--accent-color': '#ef4444' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Open</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{incidentStats?.open || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#10b981' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resolved</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{incidentStats?.resolved || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#3b82f6' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-3xl font-bold mt-1">{incidentStats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-accent" style={{ '--accent-color': '#8b5cf6' } as React.CSSProperties}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Avg Resolution</p>
            <p className="text-3xl font-bold mt-1">
              {incidentStats?.avgResolutionTime
                ? formatDuration(incidentStats.avgResolutionTime)
                : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="INVESTIGATING">Investigating</option>
              <option value="IDENTIFIED">Identified</option>
              <option value="MONITORING">Monitoring</option>
              <option value="RESOLVED">Resolved</option>
              <option value="POSTMORTEM">Post-mortem</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Incident List */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : !incidentList?.length ? (
            <Card>
              <CardContent className="p-12 text-center">
                <svg className="mx-auto h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium">No incidents</h3>
                <p className="mt-1 text-sm text-muted-foreground">All systems operating normally.</p>
              </CardContent>
            </Card>
          ) : (
            incidentList.map((incident) => (
              <Card
                key={incident.id}
                className={`cursor-pointer transition-colors ${
                  selectedIncident?.id === incident.id
                    ? 'ring-2 ring-primary'
                    : 'hover:bg-muted/30'
                }`}
                onClick={() => setSelectedIncident(incident)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      incident.status === 'RESOLVED' ? 'bg-green-500' :
                      incident.severity === 'CRITICAL' ? 'bg-red-500 animate-pulse-dot' :
                      'bg-yellow-500 animate-pulse-dot'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{incident.title}</span>
                        <Badge variant={severityColors[incident.severity]}>
                          {incident.severity}
                        </Badge>
                        <Badge variant={statusColors[incident.status]}>
                          {statusLabels[incident.status] || incident.status}
                        </Badge>
                      </div>
                      {incident.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{incident.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Started {new Date(incident.startedAt).toLocaleString()}</span>
                        {incident.assignee && <span>Assigned to {incident.assignee}</span>}
                        {incident._count && <span>{incident._count.updates} updates</span>}
                        {incident.resolvedAt && (
                          <span>
                            Duration: {formatDuration(
                              new Date(incident.resolvedAt).getTime() - new Date(incident.startedAt).getTime()
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Incident Detail / Timeline */}
        <div className="space-y-4">
          {selectedIncident && detail ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Incident Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Timeline events */}
                    <div className="relative pl-6 space-y-4">
                      <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

                      {/* Creation event */}
                      <div className="relative">
                        <div className="absolute -left-4 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-background" />
                        <div className="text-sm">
                          <p className="font-medium">Incident created</p>
                          {detail.createdBy && (
                            <p className="text-xs text-muted-foreground">by {detail.createdBy}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {new Date(detail.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Updates */}
                      {detail.updates?.map((update) => (
                        <div key={update.id} className="relative">
                          <div className={`absolute -left-4 w-2.5 h-2.5 rounded-full ring-2 ring-background ${
                            update.status === 'RESOLVED' ? 'bg-green-500' :
                            update.status === 'IDENTIFIED' ? 'bg-yellow-500' :
                            update.status === 'MONITORING' ? 'bg-blue-500' :
                            'bg-gray-400'
                          }`} />
                          <div className="text-sm">
                            {update.status && (
                              <Badge variant={statusColors[update.status]} className="mb-1">
                                {statusLabels[update.status] || update.status}
                              </Badge>
                            )}
                            <p className="text-muted-foreground">{update.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {update.createdBy && `${update.createdBy} - `}
                              {new Date(update.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Add Update */}
              {detail.status !== 'RESOLVED' && detail.status !== 'POSTMORTEM' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Add Update</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                      placeholder="Describe the update..."
                      value={updateMessage}
                      onChange={(e) => setUpdateMessage(e.target.value)}
                    />
                    <Select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value)}>
                      <option value="">No status change</option>
                      <option value="INVESTIGATING">Investigating</option>
                      <option value="IDENTIFIED">Identified</option>
                      <option value="MONITORING">Monitoring</option>
                      <option value="RESOLVED">Resolved</option>
                    </Select>
                    <Button
                      className="w-full"
                      onClick={() => addUpdateMutation.mutate({
                        id: detail.id,
                        message: updateMessage,
                        status: updateStatus,
                      })}
                      disabled={!updateMessage || addUpdateMutation.isPending}
                    >
                      {addUpdateMutation.isPending ? 'Posting...' : 'Post Update'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p className="text-sm">Select an incident to view its timeline</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle>Create Incident</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Title</label>
                <Input
                  value={createForm.title}
                  onChange={(e) => setCreateForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Brief description of the incident"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Description</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                  placeholder="Detailed description..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Severity</label>
                  <Select value={createForm.severity} onChange={(e) => setCreateForm(p => ({ ...p, severity: e.target.value }))}>
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Assignee</label>
                  <Input
                    value={createForm.assignee}
                    onChange={(e) => setCreateForm(p => ({ ...p, assignee: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate(createForm)}
                  disabled={!createForm.title || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Incident'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
