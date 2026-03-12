'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { compositeMonitorApi, uptimeApi } from '@/lib/api';

interface CompositeMonitor {
  id: string;
  name: string;
  description: string | null;
  expression: string;
  monitorIds: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UptimeMonitor {
  id: string;
  name: string;
  type: string;
  target: string;
}

interface EvaluationResult {
  compositeMonitorId: string;
  name: string;
  expression: string;
  result: boolean;
  monitors: { id: string; name: string; status: string }[];
}

const defaultForm = {
  name: '',
  description: '',
  expression: '',
  monitorIds: [] as string[],
  enabled: true,
};

export default function CompositeMonitorsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationResult>>({});

  const { data: compositeMonitors, isLoading } = useQuery({
    queryKey: ['compositeMonitors'],
    queryFn: () => compositeMonitorApi.list(),
  });

  const { data: monitors } = useQuery({
    queryKey: ['uptimeMonitors'],
    queryFn: () => uptimeApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      compositeMonitorApi.create({
        name: formData.name,
        description: formData.description || undefined,
        expression: formData.expression,
        monitorIds: formData.monitorIds,
        enabled: formData.enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compositeMonitors'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No monitor selected');
      return compositeMonitorApi.update(editingId, {
        name: formData.name,
        description: formData.description || null,
        expression: formData.expression,
        monitorIds: formData.monitorIds,
        enabled: formData.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compositeMonitors'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => compositeMonitorApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compositeMonitors'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(monitor: CompositeMonitor) {
    setFormData({
      name: monitor.name,
      description: monitor.description || '',
      expression: monitor.expression,
      monitorIds: monitor.monitorIds || [],
      enabled: monitor.enabled,
    });
    setEditingId(monitor.id);
    setShowForm(true);
  }

  async function evaluateMonitor(id: string) {
    try {
      const result = await compositeMonitorApi.evaluate(id) as EvaluationResult;
      setEvaluations((prev) => ({ ...prev, [id]: result }));
    } catch {
      // ignore
    }
  }

  function toggleMonitorId(monitorId: string) {
    setFormData((d) => {
      const ids = d.monitorIds.includes(monitorId)
        ? d.monitorIds.filter((id) => id !== monitorId)
        : [...d.monitorIds, monitorId];
      return { ...d, monitorIds: ids };
    });
  }

  const monitorList = compositeMonitors as CompositeMonitor[] | undefined;
  const uptimeMonitorList = monitors as UptimeMonitor[] | undefined;
  const enabledCount = useMemo(() => monitorList?.filter((m) => m.enabled).length || 0, [monitorList]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Composite Monitors"
        description="Combine multiple uptime monitors with boolean expressions to create aggregate health checks."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Composite Monitor
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Composites" value={monitorList?.length || 0} tone="primary" />
        <SummaryStat label="Enabled" value={enabledCount} tone="success" />
        <SummaryStat
          label="Disabled"
          value={(monitorList?.length || 0) - enabledCount}
          tone="warning"
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Composite Monitor' : 'New Composite Monitor'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="All Production Services"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Description
                  </label>
                  <Input
                    placeholder="Checks all production services are up"
                    value={formData.description}
                    onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Expression <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  rows={3}
                  placeholder="monitor_id_1 AND monitor_id_2 OR (NOT monitor_id_3)"
                  value={formData.expression}
                  onChange={(e) => setFormData((d) => ({ ...d, expression: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use monitor IDs with AND, OR, NOT operators and parentheses. Select monitors below to get their IDs.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Uptime Monitors <span className="text-red-400">*</span>
                </label>
                <div className="border border-border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {uptimeMonitorList?.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.monitorIds.includes(m.id)}
                        onChange={() => toggleMonitorId(m.id)}
                        className="rounded border-border"
                      />
                      <span className="text-foreground">{m.name}</span>
                      <span className="text-xs text-muted-foreground">({m.type})</span>
                      <code className="text-xs text-muted-foreground ml-auto">{m.id}</code>
                    </label>
                  )) || (
                    <p className="text-sm text-muted-foreground">No uptime monitors available</p>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData((d) => ({ ...d, enabled: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Enabled</span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    !formData.name || !formData.expression || formData.monitorIds.length === 0
                  }
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </Button>
                <Button variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>

              {(createMutation.isError || updateMutation.isError) && (
                <p className="text-sm text-red-400">
                  {(createMutation.error as any)?.response?.data?.error ||
                    (updateMutation.error as any)?.response?.data?.error ||
                    'An error occurred.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingState rows={4} />
      ) : !monitorList?.length ? (
        <EmptyState
          title="No composite monitors"
          description="Combine multiple uptime monitors with boolean logic to create aggregate health checks."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Expression</th>
                    <th className="px-4 py-3 font-medium">Monitors</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {monitorList.map((monitor) => {
                    const evaluation = evaluations[monitor.id];
                    return (
                      <tr key={monitor.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{monitor.name}</div>
                          {monitor.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[250px]">
                              {monitor.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs bg-accent/50 px-1.5 py-0.5 rounded">
                            {monitor.expression.length > 50
                              ? monitor.expression.slice(0, 50) + '...'
                              : monitor.expression}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {monitor.monitorIds?.length || 0} monitors
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={monitor.enabled ? 'success' : 'secondary'}>
                            {monitor.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {evaluation ? (
                            <Badge variant={evaluation.result ? 'success' : 'danger'}>
                              {evaluation.result ? 'PASS' : 'FAIL'}
                            </Badge>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => evaluateMonitor(monitor.id)}>
                              Evaluate
                            </Button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(monitor)}>Edit</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                              onClick={() => {
                                if (confirm(`Delete composite monitor "${monitor.name}"?`)) deleteMutation.mutate(monitor.id);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
