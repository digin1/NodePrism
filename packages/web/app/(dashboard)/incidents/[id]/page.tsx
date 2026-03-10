'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { incidentApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

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
  updatedAt: string;
  updates?: IncidentUpdate[];
  server?: { id: string; hostname: string; ipAddress: string } | null;
  alert?: { id: string; message: string } | null;
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const queryClient = useQueryClient();
  const { formatDateTime } = useFormatDate();

  const [updateMessage, setUpdateMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const [editSeverity, setEditSeverity] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [showEditFields, setShowEditFields] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidentApi.get(id),
  });

  const incident = data as Incident | undefined;

  const addUpdateMutation = useMutation({
    mutationFn: ({ message, status }: { message: string; status?: string }) =>
      incidentApi.addUpdate(id, { message, status: status || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incidentStats'] });
      setUpdateMessage('');
      setUpdateStatus('');
    },
  });

  const updateIncidentMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => incidentApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowEditFields(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => incidentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incidentStats'] });
      router.push('/incidents');
    },
  });

  const isOpen = incident && incident.status !== 'RESOLVED' && incident.status !== 'POSTMORTEM';
  const duration = incident
    ? (incident.resolvedAt
        ? new Date(incident.resolvedAt).getTime()
        : Date.now()) - new Date(incident.startedAt).getTime()
    : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/incidents">
            <Button variant="ghost" size="icon">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          </Link>
          <h2 className="text-2xl font-bold">Incident Not Found</h2>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">This incident does not exist or has been deleted.</p>
            <Link href="/incidents">
              <Button variant="outline" className="mt-4">Back to Incidents</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/incidents">
          <Button variant="ghost" size="icon" className="mt-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold">{incident.title}</h2>
            <Badge variant={severityColors[incident.severity]}>{incident.severity}</Badge>
            <Badge variant={statusColors[incident.status]}>
              {statusLabels[incident.status] || incident.status}
            </Badge>
          </div>
          {incident.description && (
            <p className="text-muted-foreground mt-1">{incident.description}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6 space-y-6">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

                {/* Creation event */}
                <div className="relative">
                  <div className="absolute -left-4 w-3 h-3 rounded-full bg-blue-500 ring-2 ring-background" />
                  <div>
                    <p className="text-sm font-medium">Incident created</p>
                    {incident.createdBy && (
                      <p className="text-xs text-muted-foreground">by {incident.createdBy}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(incident.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Updates */}
                {incident.updates?.map((update) => (
                  <div key={update.id} className="relative">
                    <div
                      className={`absolute -left-4 w-3 h-3 rounded-full ring-2 ring-background ${
                        update.status === 'RESOLVED'
                          ? 'bg-green-500'
                          : update.status === 'IDENTIFIED'
                          ? 'bg-yellow-500'
                          : update.status === 'MONITORING'
                          ? 'bg-blue-500'
                          : update.status === 'INVESTIGATING'
                          ? 'bg-red-500'
                          : 'bg-gray-400'
                      }`}
                    />
                    <div>
                      {update.status && (
                        <Badge variant={statusColors[update.status]} className="mb-1.5">
                          {statusLabels[update.status] || update.status}
                        </Badge>
                      )}
                      <p className="text-sm text-foreground">{update.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {update.createdBy && `${update.createdBy} \u00b7 `}
                        {formatDateTime(update.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Resolution event */}
                {incident.resolvedAt && (
                  <div className="relative">
                    <div className="absolute -left-4 w-3 h-3 rounded-full bg-green-500 ring-2 ring-background" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        Incident resolved
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(incident.resolvedAt)} &middot;
                        Duration: {formatDuration(duration)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Add Update Form */}
          {isOpen && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Post Update</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Describe what's happening, what you've found, or what actions are being taken..."
                  value={updateMessage}
                  onChange={(e) => setUpdateMessage(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <Select
                    value={updateStatus}
                    onChange={(e) => setUpdateStatus(e.target.value)}
                  >
                    <option value="">No status change</option>
                    <option value="INVESTIGATING">Investigating</option>
                    <option value="IDENTIFIED">Identified</option>
                    <option value="MONITORING">Monitoring</option>
                    <option value="RESOLVED">Resolved</option>
                  </Select>
                  <Button
                    onClick={() =>
                      addUpdateMutation.mutate({
                        message: updateMessage,
                        status: updateStatus,
                      })
                    }
                    disabled={!updateMessage.trim() || addUpdateMutation.isPending}
                  >
                    {addUpdateMutation.isPending ? 'Posting...' : 'Post Update'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Details */}
        <div className="space-y-4">
          {/* Details card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Details</CardTitle>
                {isOpen && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditSeverity(incident.severity);
                      setEditAssignee(incident.assignee || '');
                      setShowEditFields(!showEditFields);
                    }}
                  >
                    {showEditFields ? 'Cancel' : 'Edit'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={statusColors[incident.status]}>
                      {statusLabels[incident.status] || incident.status}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Severity</dt>
                  <dd>
                    {showEditFields ? (
                      <Select
                        value={editSeverity}
                        onChange={(e) => setEditSeverity(e.target.value)}
                      >
                        <option value="CRITICAL">Critical</option>
                        <option value="WARNING">Warning</option>
                        <option value="INFO">Info</option>
                      </Select>
                    ) : (
                      <Badge variant={severityColors[incident.severity]}>
                        {incident.severity}
                      </Badge>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-mono">{formatDuration(duration)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Started</dt>
                  <dd>{formatDateTime(incident.startedAt)}</dd>
                </div>
                {incident.resolvedAt && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Resolved</dt>
                    <dd>{formatDateTime(incident.resolvedAt)}</dd>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Assignee</dt>
                  <dd>
                    {showEditFields ? (
                      <Input
                        value={editAssignee}
                        onChange={(e) => setEditAssignee(e.target.value)}
                        placeholder="Unassigned"
                        className="w-32 h-7 text-sm"
                      />
                    ) : (
                      <span>{incident.assignee || 'Unassigned'}</span>
                    )}
                  </dd>
                </div>
                {incident.server && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Server</dt>
                    <dd>
                      <a
                        href={`/servers/${incident.server.id}`}
                        className="text-primary hover:underline font-mono text-xs"
                      >
                        {incident.server.hostname}
                      </a>
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Updates</dt>
                  <dd>{incident.updates?.length || 0}</dd>
                </div>
              </dl>

              {showEditFields && (
                <Button
                  className="w-full mt-4"
                  size="sm"
                  onClick={() =>
                    updateIncidentMutation.mutate({
                      severity: editSeverity,
                      assignee: editAssignee || null,
                    })
                  }
                  disabled={updateIncidentMutation.isPending}
                >
                  {updateIncidentMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {isOpen && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {incident.status !== 'IDENTIFIED' && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    size="sm"
                    onClick={() =>
                      addUpdateMutation.mutate({
                        message: 'Root cause has been identified.',
                        status: 'IDENTIFIED',
                      })
                    }
                    disabled={addUpdateMutation.isPending}
                  >
                    <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2" />
                    Mark as Identified
                  </Button>
                )}
                {incident.status !== 'MONITORING' && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    size="sm"
                    onClick={() =>
                      addUpdateMutation.mutate({
                        message: 'A fix has been applied. Monitoring for stability.',
                        status: 'MONITORING',
                      })
                    }
                    disabled={addUpdateMutation.isPending}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                    Mark as Monitoring
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start text-green-600 hover:text-green-700"
                  size="sm"
                  onClick={() =>
                    addUpdateMutation.mutate({
                      message: 'Incident has been resolved.',
                      status: 'RESOLVED',
                    })
                  }
                  disabled={addUpdateMutation.isPending}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                  Resolve Incident
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Delete */}
          <Card className="border-red-500/20">
            <CardContent className="p-4">
              <Button
                variant="outline"
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-800"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this incident? This cannot be undone.')) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Incident'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
