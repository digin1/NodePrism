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
import { slaPolicyApi, uptimeApi } from '@/lib/api';

interface SlaPolicy {
  id: string;
  name: string;
  uptimeMonitorId: string;
  targetPercent: number;
  windowDays: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  uptimeMonitor?: { id: string; name: string; target: string; type: string } | null;
}

interface UptimeMonitor {
  id: string;
  name: string;
  type: string;
  target: string;
}

function targetColor(target: number): 'success' | 'warning' | 'danger' {
  if (target >= 99.9) return 'success';
  if (target >= 99) return 'warning';
  return 'danger';
}

const defaultForm = {
  name: '',
  targetPercent: '99.9',
  windowDays: '30',
  uptimeMonitorId: '',
  enabled: true,
};

export default function SlaPoliciesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['slaPolicies'],
    queryFn: () => slaPolicyApi.list(),
  });

  const { data: monitors } = useQuery({
    queryKey: ['uptimeMonitors'],
    queryFn: () => uptimeApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      slaPolicyApi.create({
        name: formData.name,
        uptimeMonitorId: formData.uptimeMonitorId,
        targetPercent: parseFloat(formData.targetPercent),
        windowDays: parseInt(formData.windowDays),
        enabled: formData.enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slaPolicies'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No policy selected');
      return slaPolicyApi.update(editingId, {
        name: formData.name,
        uptimeMonitorId: formData.uptimeMonitorId,
        targetPercent: parseFloat(formData.targetPercent),
        windowDays: parseInt(formData.windowDays),
        enabled: formData.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slaPolicies'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => slaPolicyApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['slaPolicies'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(policy: SlaPolicy) {
    setFormData({
      name: policy.name,
      targetPercent: String(policy.targetPercent),
      windowDays: String(policy.windowDays),
      uptimeMonitorId: policy.uptimeMonitorId || '',
      enabled: policy.enabled,
    });
    setEditingId(policy.id);
    setShowForm(true);
  }

  const policyList = policies as SlaPolicy[] | undefined;
  const monitorList = monitors as UptimeMonitor[] | undefined;
  const enabledCount = useMemo(() => policyList?.filter((p) => p.enabled).length || 0, [policyList]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance"
        title="SLA Policies"
        description="Define service level agreements with uptime targets linked to monitors."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Policy
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Policies" value={policyList?.length || 0} tone="primary" />
        <SummaryStat label="Enabled" value={enabledCount} tone="success" />
        <SummaryStat
          label="High Target (>=99.9%)"
          value={policyList?.filter((p) => p.targetPercent >= 99.9).length || 0}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Policy' : 'New SLA Policy'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="Production Web SLA"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Uptime Monitor <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.uptimeMonitorId}
                    onChange={(e) => setFormData((d) => ({ ...d, uptimeMonitorId: e.target.value }))}
                  >
                    <option value="">Select monitor...</option>
                    {monitorList?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.type})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Target Uptime (%) <span className="text-red-400">*</span>
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
                    !formData.name || !formData.uptimeMonitorId || !formData.targetPercent || !formData.windowDays
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
      ) : !policyList?.length ? (
        <EmptyState
          title="No SLA policies"
          description="Define service level agreements to track uptime commitments."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
                    <th className="px-4 py-3 font-medium">Target</th>
                    <th className="px-4 py-3 font-medium">Window</th>
                    <th className="px-4 py-3 font-medium">Monitor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policyList.map((policy) => (
                    <tr key={policy.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{policy.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={targetColor(policy.targetPercent)}>
                          {policy.targetPercent}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{policy.windowDays} days</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {policy.uptimeMonitor?.name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={policy.enabled ? 'success' : 'secondary'}>
                          {policy.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(policy)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete policy "${policy.name}"?`)) deleteMutation.mutate(policy.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
