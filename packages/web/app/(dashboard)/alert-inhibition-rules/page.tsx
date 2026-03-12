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
import { alertInhibitionRuleApi } from '@/lib/api';

interface AlertInhibitionRule {
  id: string;
  name: string;
  sourceMatch: Record<string, string>;
  targetMatch: Record<string, string>;
  sourceSeverity: string;
  targetSeverity: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const SEVERITIES = ['CRITICAL', 'WARNING', 'INFO', 'DEBUG'] as const;

const initialFormData = {
  name: '',
  sourceMatchKey: '',
  sourceMatchValue: '',
  targetMatchKey: '',
  targetMatchValue: '',
  sourceSeverity: 'CRITICAL',
  targetSeverity: 'WARNING',
  enabled: true,
};

export default function AlertInhibitionRulesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialFormData);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['alertInhibitionRules'],
    queryFn: () => alertInhibitionRuleApi.list(),
  });

  function buildPayload() {
    const sourceMatch: Record<string, string> = {};
    if (formData.sourceMatchKey.trim() && formData.sourceMatchValue.trim()) {
      sourceMatch[formData.sourceMatchKey.trim()] = formData.sourceMatchValue.trim();
    }
    const targetMatch: Record<string, string> = {};
    if (formData.targetMatchKey.trim() && formData.targetMatchValue.trim()) {
      targetMatch[formData.targetMatchKey.trim()] = formData.targetMatchValue.trim();
    }
    return {
      name: formData.name,
      sourceMatch,
      targetMatch,
      sourceSeverity: formData.sourceSeverity,
      targetSeverity: formData.targetSeverity,
      enabled: formData.enabled,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => alertInhibitionRuleApi.create(buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertInhibitionRules'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No rule selected');
      return alertInhibitionRuleApi.update(editingId, buildPayload());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertInhibitionRules'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertInhibitionRuleApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertInhibitionRules'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      alertInhibitionRuleApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertInhibitionRules'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(initialFormData);
  }

  function startEdit(rule: AlertInhibitionRule) {
    const srcKeys = Object.keys(rule.sourceMatch || {});
    const tgtKeys = Object.keys(rule.targetMatch || {});
    setFormData({
      name: rule.name,
      sourceMatchKey: srcKeys[0] || '',
      sourceMatchValue: srcKeys[0] ? (rule.sourceMatch[srcKeys[0]] || '') : '',
      targetMatchKey: tgtKeys[0] || '',
      targetMatchValue: tgtKeys[0] ? (rule.targetMatch[tgtKeys[0]] || '') : '',
      sourceSeverity: rule.sourceSeverity,
      targetSeverity: rule.targetSeverity,
      enabled: rule.enabled,
    });
    setEditingId(rule.id);
    setShowForm(true);
  }

  const ruleList = rules as AlertInhibitionRule[] | undefined;
  const enabledCount = useMemo(() => ruleList?.filter((r) => r.enabled).length || 0, [ruleList]);

  const sevBadge: Record<string, 'danger' | 'warning' | 'secondary' | 'default'> = {
    CRITICAL: 'danger',
    WARNING: 'warning',
    INFO: 'secondary',
    DEBUG: 'default',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alert Management"
        title="Alert inhibition rules"
        description="Suppress target alerts when a matching source alert is firing."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Rule
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryStat label="Total Rules" value={ruleList?.length || 0} tone="primary" />
        <SummaryStat label="Enabled" value={enabledCount} tone="success" />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Rule' : 'New Inhibition Rule'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  placeholder="e.g. Suppress warnings when critical fires"
                  value={formData.name}
                  onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Source Severity <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.sourceSeverity}
                    onChange={(e) => setFormData((d) => ({ ...d, sourceSeverity: e.target.value }))}
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    The severity of the source alert that triggers inhibition.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Target Severity <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.targetSeverity}
                    onChange={(e) => setFormData((d) => ({ ...d, targetSeverity: e.target.value }))}
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    The severity of the target alert to suppress.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Source Match Label</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="key (e.g. alertname)"
                      value={formData.sourceMatchKey}
                      onChange={(e) => setFormData((d) => ({ ...d, sourceMatchKey: e.target.value }))}
                    />
                    <Input
                      placeholder="value (e.g. HostDown)"
                      value={formData.sourceMatchValue}
                      onChange={(e) => setFormData((d) => ({ ...d, sourceMatchValue: e.target.value }))}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Label key=value the source alert must match.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Target Match Label</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="key (e.g. instance)"
                      value={formData.targetMatchKey}
                      onChange={(e) => setFormData((d) => ({ ...d, targetMatchKey: e.target.value }))}
                    />
                    <Input
                      placeholder="value (e.g. .*)"
                      value={formData.targetMatchValue}
                      onChange={(e) => setFormData((d) => ({ ...d, targetMatchValue: e.target.value }))}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Label key=value the target alert must match to be suppressed.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData((d) => ({ ...d, enabled: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span className="text-muted-foreground">Enabled</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={createMutation.isPending || updateMutation.isPending || !formData.name.trim()}
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
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
        <LoadingState rows={4} rowClassName="h-16" />
      ) : !ruleList?.length ? (
        <EmptyState
          title="No inhibition rules"
          description="Create an alert inhibition rule to suppress lower-severity alerts when a higher-severity alert is firing."
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/70">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Source Severity</th>
                    <th className="px-6 py-3 font-medium">Target Severity</th>
                    <th className="px-6 py-3 font-medium">Source Match</th>
                    <th className="px-6 py-3 font-medium">Target Match</th>
                    <th className="px-6 py-3 font-medium">Enabled</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleList.map((rule) => (
                    <tr key={rule.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{rule.name}</td>
                      <td className="px-6 py-4">
                        <Badge variant={sevBadge[rule.sourceSeverity] || 'default'}>{rule.sourceSeverity}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={sevBadge[rule.targetSeverity] || 'default'}>{rule.targetSeverity}</Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                        {Object.entries(rule.sourceMatch || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                        {Object.entries(rule.targetMatch || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={rule.enabled ? 'success' : 'secondary'}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                          >
                            {rule.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(rule)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => { if (confirm(`Delete rule "${rule.name}"?`)) deleteMutation.mutate(rule.id); }}
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
