'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { sloApi, uptimeApi } from '@/lib/api';

interface Slo {
  id: string;
  name: string;
  description: string | null;
  targetPercent: number;
  windowDays: number;
  uptimeMonitorId: string | null;
  metricQuery: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  uptimeMonitor?: { id: string; name: string; target: string; type: string } | null;
}

interface SloSlo {
  sloId: string;
  name: string;
  targetPercent: number;
  windowDays: number;
  totalWindowMinutes: number;
  errorBudgetMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  remainingPercent: number;
  burnRate: number;
}

interface UptimeMonitor {
  id: string;
  name: string;
  type: string;
  target: string;
}

const defaultForm = {
  name: '',
  description: '',
  targetPercent: '99.9',
  windowDays: '30',
  uptimeMonitorId: '',
  enabled: true,
};

function burnRateColor(rate: number): 'success' | 'warning' | 'danger' {
  if (rate <= 1) return 'success';
  if (rate <= 2) return 'warning';
  return 'danger';
}

function burnRateBgClass(rate: number): string {
  if (rate <= 1) return 'bg-green-500';
  if (rate <= 2) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function SlosPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);

  const { data: slos, isLoading } = useQuery({
    queryKey: ['slos'],
    queryFn: () => sloApi.list(),
  });

  const { data: monitors } = useQuery({
    queryKey: ['uptimeMonitors'],
    queryFn: () => uptimeApi.list(),
  });

  const sloList = slos as Slo[] | undefined;
  const monitorList = monitors as UptimeMonitor[] | undefined;

  // Fetch budgets for all SLOs
  const sloIds = useMemo(() => sloList?.map((s) => s.id) || [], [sloList]);
  const budgetQueries = useQuery({
    queryKey: ['sloBudgets', sloIds],
    queryFn: async () => {
      if (!sloIds.length) return {};
      const results: Record<string, SloSlo> = {};
      await Promise.all(
        sloIds.map(async (id) => {
          try {
            const budget = await sloApi.budget(id);
            results[id] = budget as SloSlo;
          } catch {
            // Skip failed budget calculations
          }
        })
      );
      return results;
    },
    enabled: sloIds.length > 0,
  });

  const budgets = budgetQueries.data as Record<string, SloSlo> | undefined;

  const createMutation = useMutation({
    mutationFn: () =>
      sloApi.create({
        name: formData.name,
        description: formData.description || undefined,
        targetPercent: parseFloat(formData.targetPercent),
        windowDays: parseInt(formData.windowDays),
        uptimeMonitorId: formData.uptimeMonitorId || undefined,
        enabled: formData.enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slos'] });
      queryClient.invalidateQueries({ queryKey: ['sloBudgets'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No SLO selected');
      return sloApi.update(editingId, {
        name: formData.name,
        description: formData.description || null,
        targetPercent: parseFloat(formData.targetPercent),
        windowDays: parseInt(formData.windowDays),
        uptimeMonitorId: formData.uptimeMonitorId || null,
        enabled: formData.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slos'] });
      queryClient.invalidateQueries({ queryKey: ['sloBudgets'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sloApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slos'] });
      queryClient.invalidateQueries({ queryKey: ['sloBudgets'] });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(slo: Slo) {
    setFormData({
      name: slo.name,
      description: slo.description || '',
      targetPercent: String(slo.targetPercent),
      windowDays: String(slo.windowDays),
      uptimeMonitorId: slo.uptimeMonitorId || '',
      enabled: slo.enabled,
    });
    setEditingId(slo.id);
    setShowForm(true);
  }

  const enabledCount = useMemo(() => sloList?.filter((s) => s.enabled).length || 0, [sloList]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reliability"
        title="Service Level Objectives"
        description="Track SLOs with error budgets to balance reliability and feature velocity."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create SLO
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total SLOs" value={sloList?.length || 0} tone="primary" />
        <SummaryStat label="Enabled" value={enabledCount} tone="success" />
        <SummaryStat
          label="High Target (>=99.9%)"
          value={sloList?.filter((s) => s.targetPercent >= 99.9).length || 0}
        />
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit SLO' : 'New Service Level Objective'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="API Availability"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Uptime Monitor
                  </label>
                  <Select
                    value={formData.uptimeMonitorId}
                    onChange={(e) => setFormData((d) => ({ ...d, uptimeMonitorId: e.target.value }))}
                  >
                    <option value="">Select monitor (optional)...</option>
                    {monitorList?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.type})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Description
                </label>
                <Input
                  placeholder="Describe this SLO..."
                  value={formData.description}
                  onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Target (%) <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="99.9"
                    value={formData.targetPercent}
                    onChange={(e) => setFormData((d) => ({ ...d, targetPercent: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Window (days) <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="30"
                    value={formData.windowDays}
                    onChange={(e) => setFormData((d) => ({ ...d, windowDays: e.target.value }))}
                  />
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
                    !formData.name || !formData.targetPercent || !formData.windowDays
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

      {/* SLO Cards */}
      {isLoading ? (
        <LoadingState rows={4} />
      ) : !sloList?.length ? (
        <EmptyState
          title="No SLOs defined"
          description="Create a Service Level Objective to track reliability with error budgets."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sloList.map((slo) => {
            const budget = budgets?.[slo.id];
            const burnRate = budget?.burnRate ?? 0;
            const remainingPct = budget?.remainingPercent ?? 100;
            const consumedPct = 100 - remainingPct;

            return (
              <Card key={slo.id} className="relative overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate">{slo.name}</h3>
                      {slo.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{slo.description}</p>
                      )}
                    </div>
                    <Badge variant={slo.enabled ? 'success' : 'secondary'} className="flex-shrink-0 ml-2">
                      {slo.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>

                  {/* Target & Window */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg bg-accent/30 px-3 py-2 text-center">
                      <p className="text-lg font-bold text-primary">{slo.targetPercent}%</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</p>
                    </div>
                    <div className="rounded-lg bg-accent/30 px-3 py-2 text-center">
                      <p className="text-lg font-bold">{slo.windowDays}d</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Window</p>
                    </div>
                  </div>

                  {/* Error Budget */}
                  {budget && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Error Budget Remaining</span>
                        <span className="font-medium">{remainingPct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-accent/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${burnRateBgClass(burnRate)}`}
                          style={{ width: `${Math.min(consumedPct, 100)}%` }}
                        />
                      </div>

                      {/* Burn Rate */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Burn Rate</span>
                        <Badge variant={burnRateColor(burnRate)}>
                          {burnRate.toFixed(2)}x
                        </Badge>
                      </div>

                      <div className="text-xs text-muted-foreground flex justify-between">
                        <span>Budget: {budget.errorBudgetMinutes.toFixed(0)} min</span>
                        <span>Left: {budget.remainingMinutes.toFixed(0)} min</span>
                      </div>
                    </div>
                  )}

                  {/* Monitor */}
                  {slo.uptimeMonitor && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <p className="text-xs text-muted-foreground">
                        Monitor: <span className="text-foreground">{slo.uptimeMonitor.name}</span>
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(slo)}>Edit</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      onClick={() => {
                        if (confirm(`Delete SLO "${slo.name}"?`)) deleteMutation.mutate(slo.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
