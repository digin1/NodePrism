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
import { retentionPolicyApi } from '@/lib/api';

interface RetentionPolicy {
  id: string;
  metricType: string;
  retentionDays: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const METRIC_TYPES = [
  'event_logs',
  'metric_history',
  'anomaly_events',
  'alerts',
  'uptime_checks',
  'snmp_poll_results',
  'otlp_spans',
  'rum_page_views',
];

const defaultForm = {
  metricType: '',
  retentionDays: '90',
  enabled: true,
};

export default function RetentionPoliciesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['retentionPolicies'],
    queryFn: () => retentionPolicyApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      retentionPolicyApi.create({
        metricType: formData.metricType,
        retentionDays: parseInt(formData.retentionDays),
        enabled: formData.enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retentionPolicies'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No policy selected');
      return retentionPolicyApi.update(editingId, {
        retentionDays: parseInt(formData.retentionDays),
        enabled: formData.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retentionPolicies'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => retentionPolicyApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['retentionPolicies'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(policy: RetentionPolicy) {
    setFormData({
      metricType: policy.metricType,
      retentionDays: String(policy.retentionDays),
      enabled: policy.enabled,
    });
    setEditingId(policy.id);
    setShowForm(true);
  }

  const policyList = policies as RetentionPolicy[] | undefined;
  const enabledCount = useMemo(() => policyList?.filter((p) => p.enabled).length || 0, [policyList]);

  // Filter out metric types that already have a policy (for create mode)
  const existingTypes = useMemo(() => new Set(policyList?.map((p) => p.metricType) || []), [policyList]);
  const availableTypes = METRIC_TYPES.filter((t) => !existingTypes.has(t));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data Management"
        title="Retention Policies"
        description="Configure how long each data type is retained before automatic cleanup."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Policy
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Policies" value={policyList?.length || 0} tone="primary" />
        <SummaryStat label="Enabled" value={enabledCount} tone="success" />
        <SummaryStat
          label="Unconfigured Types"
          value={availableTypes.length}
          tone={availableTypes.length > 0 ? 'warning' : 'primary'}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Retention Policy' : 'New Retention Policy'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Metric Type <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.metricType}
                    onChange={(e) => setFormData((d) => ({ ...d, metricType: e.target.value }))}
                    disabled={!!editingId}
                  >
                    <option value="">Select type...</option>
                    {(editingId ? METRIC_TYPES : availableTypes).map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Retention Days <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="90"
                    value={formData.retentionDays}
                    onChange={(e) => setFormData((d) => ({ ...d, retentionDays: e.target.value }))}
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
                    !formData.metricType || !formData.retentionDays
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
          title="No retention policies"
          description="Configure data retention to automatically clean up old records."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    <th className="px-4 py-3 font-medium">Metric Type</th>
                    <th className="px-4 py-3 font-medium">Retention Days</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policyList.map((policy) => (
                    <tr key={policy.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium capitalize">
                        {policy.metricType.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {policy.retentionDays} days
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
                              if (confirm(`Delete retention policy for "${policy.metricType}"?`)) deleteMutation.mutate(policy.id);
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
