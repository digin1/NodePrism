'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalPanel, ModalTitle } from '@/components/ui/modal';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { uptimeApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface UptimeMonitor {
  id: string;
  name: string;
  type: string;
  target: string;
  interval: number;
  timeout: number;
  method: string;
  enabled: boolean;
  currentStatus: string | null;
  uptimePercentage: number | null;
  lastCheck: {
    status: string;
    responseTime: number | null;
    checkedAt: string;
    message: string | null;
  } | null;
  recentChecks?: Array<{
    status: string;
    responseTime: number | null;
    checkedAt: string;
  }>;
}

interface UptimeStats {
  total: number;
  up: number;
  down: number;
  avgResponseTime: number | null;
}

const statusColors: Record<string, string> = {
  UP: 'bg-green-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-yellow-500',
};

export default function UptimePage() {
  const queryClient = useQueryClient();
  const { formatDateTime } = useFormatDate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'HTTP',
    target: '',
    interval: 60,
    timeout: 10,
    method: 'GET',
    expectedStatus: 200,
    keyword: '',
  });

  const { data: monitors, isLoading } = useQuery({
    queryKey: ['uptimeMonitors'],
    queryFn: () => uptimeApi.list(),
  });

  const { data: stats } = useQuery({
    queryKey: ['uptimeStats'],
    queryFn: () => uptimeApi.stats(),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => uptimeApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uptimeMonitors'] });
      queryClient.invalidateQueries({ queryKey: ['uptimeStats'] });
      setShowCreateModal(false);
      setFormData({
        name: '',
        type: 'HTTP',
        target: '',
        interval: 60,
        timeout: 10,
        method: 'GET',
        expectedStatus: 200,
        keyword: '',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => uptimeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uptimeMonitors'] });
      queryClient.invalidateQueries({ queryKey: ['uptimeStats'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      uptimeApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uptimeMonitors'] });
    },
  });

  const monitorList = monitors as UptimeMonitor[] | undefined;
  const uptimeStats = stats as UptimeStats | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Availability"
        title="Uptime monitoring"
        description="Track service reachability, response times, and availability trends across configured checks."
      >
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Monitor
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Total Monitors" value={uptimeStats?.total || 0} tone="primary" />
        <SummaryStat label="Healthy" value={uptimeStats?.up || 0} tone="success" />
        <SummaryStat
          label="Down"
          value={uptimeStats?.down || 0}
          tone={(uptimeStats?.down || 0) > 0 ? 'danger' : 'default'}
        />
        <SummaryStat
          label="Avg Response"
          value={uptimeStats?.avgResponseTime != null ? `${uptimeStats.avgResponseTime}ms` : 'N/A'}
        />
      </div>

      {/* Monitor List */}
      <div className="space-y-3">
        {isLoading ? (
          <LoadingState rows={4} rowClassName="h-24" />
        ) : !monitorList?.length ? (
          <EmptyState
            title="No monitors configured"
            description="Add an uptime monitor to start tracking reachability, response times, and availability drift."
            icon={
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
        ) : (
          monitorList.map((monitor) => (
            <Card key={monitor.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        monitor.currentStatus === 'UP'
                          ? 'bg-green-500 animate-pulse-dot'
                          : monitor.currentStatus === 'DOWN'
                            ? 'bg-red-500 animate-pulse-dot'
                            : monitor.currentStatus === 'DEGRADED'
                              ? 'bg-yellow-500 animate-pulse-dot'
                              : 'bg-gray-400'
                      }`}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{monitor.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {monitor.type}
                      </Badge>
                      {!monitor.enabled && (
                        <Badge variant="secondary" className="text-xs bg-gray-500/10 text-gray-500">
                          Paused
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-mono truncate">
                      {monitor.target}
                    </p>
                  </div>

                  {/* Uptime percentage */}
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-lg font-bold ${
                        (monitor.uptimePercentage ?? 0) >= 99.9
                          ? 'text-green-600 dark:text-green-400'
                          : (monitor.uptimePercentage ?? 0) >= 99
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {monitor.uptimePercentage != null
                        ? `${monitor.uptimePercentage.toFixed(2)}%`
                        : '-'}
                    </div>
                    <p className="text-xs text-muted-foreground">24h uptime</p>
                  </div>

                  {/* Response time */}
                  <div className="text-right flex-shrink-0 w-20">
                    <div className="text-sm font-mono">
                      {monitor.lastCheck?.responseTime != null
                        ? `${monitor.lastCheck.responseTime}ms`
                        : '-'}
                    </div>
                    <p className="text-xs text-muted-foreground">response</p>
                  </div>

                  {/* Uptime bar (mini) */}
                  <div className="flex-shrink-0 w-32 hidden md:block">
                    <div className="flex gap-px">
                      {(monitor.recentChecks || []).slice(-30).map((check, i) => (
                        <div
                          key={i}
                          className={`h-6 flex-1 rounded-sm ${
                            check.status === 'UP'
                              ? 'bg-green-500/70'
                              : check.status === 'DOWN'
                                ? 'bg-red-500/70'
                                : 'bg-yellow-500/70'
                          }`}
                          title={`${check.status} - ${formatDateTime(check.checkedAt)}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        toggleMutation.mutate({ id: monitor.id, enabled: !monitor.enabled })
                      }
                      title={monitor.enabled ? 'Pause' : 'Resume'}
                    >
                      {monitor.enabled ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => {
                        if (confirm('Delete this monitor?')) {
                          deleteMutation.mutate(monitor.id);
                        }
                      }}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </Button>
                  </div>
                </div>

                {/* Last check info */}
                {monitor.lastCheck && (
                  <div className="mt-2 ml-7 text-xs text-muted-foreground">
                    Last checked: {formatDateTime(monitor.lastCheck.checkedAt)}
                    {monitor.lastCheck.message && (
                      <span
                        className={`ml-2 ${
                          monitor.lastCheck.status === 'UP'
                            ? 'text-green-500'
                            : monitor.lastCheck.status === 'DEGRADED'
                              ? 'text-yellow-500'
                              : 'text-red-500'
                        }`}
                      >
                        {monitor.lastCheck.message}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalPanel className="max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-4">
            <ModalTitle>Add Uptime Monitor</ModalTitle>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="My Website"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Type
                  </label>
                  <Select
                    value={formData.type}
                    onChange={(e) => setFormData((p) => ({ ...p, type: e.target.value }))}
                  >
                    <option value="HTTP">HTTP</option>
                    <option value="HTTPS">HTTPS</option>
                    <option value="TCP">TCP</option>
                    <option value="PING">Ping</option>
                    <option value="DNS">DNS</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    {formData.type === 'HTTP' || formData.type === 'HTTPS' ? 'Method' : 'Protocol'}
                  </label>
                  {formData.type === 'HTTP' || formData.type === 'HTTPS' ? (
                    <Select
                      value={formData.method}
                      onChange={(e) => setFormData((p) => ({ ...p, method: e.target.value }))}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="HEAD">HEAD</option>
                    </Select>
                  ) : (
                    <Input value={formData.type} disabled />
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Target
                </label>
                <Input
                  value={formData.target}
                  onChange={(e) => setFormData((p) => ({ ...p, target: e.target.value }))}
                  placeholder={
                    formData.type === 'HTTP' || formData.type === 'HTTPS'
                      ? 'https://example.com'
                      : formData.type === 'TCP'
                        ? 'hostname:port'
                        : 'hostname or IP'
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Interval (s)
                  </label>
                  <Input
                    type="number"
                    value={formData.interval}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, interval: parseInt(e.target.value) || 60 }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Timeout (s)
                  </label>
                  <Input
                    type="number"
                    value={formData.timeout}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, timeout: parseInt(e.target.value) || 10 }))
                    }
                  />
                </div>
                {(formData.type === 'HTTP' || formData.type === 'HTTPS') && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground block mb-1">
                      Expected Status
                    </label>
                    <Input
                      type="number"
                      value={formData.expectedStatus}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          expectedStatus: parseInt(e.target.value) || 200,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
              {(formData.type === 'HTTP' || formData.type === 'HTTPS') && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Keyword (optional)
                  </label>
                  <Input
                    value={formData.keyword}
                    onChange={(e) => setFormData((p) => ({ ...p, keyword: e.target.value }))}
                    placeholder="Expected text in response body"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(formData)}
                  disabled={!formData.name || !formData.target || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Monitor'}
                </Button>
              </div>
            </div>
          </div>
        </ModalPanel>
      </Modal>
    </div>
  );
}
