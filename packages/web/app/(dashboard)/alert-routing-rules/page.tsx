'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { alertRoutingRuleApi, notificationApi, NotificationChannel } from '@/lib/api';

interface AlertRoutingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: { severity?: string[]; tags?: string[]; timeWindow?: { start: string; end: string; timezone: string } };
  channelIds: string[];
  muteOthers: boolean;
  createdAt: string;
  updatedAt: string;
}

const SEVERITIES = ['CRITICAL', 'WARNING', 'INFO', 'DEBUG'] as const;

const initialFormData = {
  name: '',
  priority: 0,
  severities: [] as string[],
  tags: '',
  channelIds: [] as string[],
  muteOthers: false,
  enabled: true,
};

export default function AlertRoutingRulesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialFormData);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['alertRoutingRules'],
    queryFn: () => alertRoutingRuleApi.list(),
  });

  const { data: channels } = useQuery({
    queryKey: ['notificationChannels'],
    queryFn: () => notificationApi.listChannels(),
  });

  function buildPayload() {
    const conditions: Record<string, unknown> = {};
    if (formData.severities.length > 0) conditions.severity = formData.severities;
    if (formData.tags.trim()) conditions.tags = formData.tags.split(',').map((t) => t.trim()).filter(Boolean);
    return {
      name: formData.name,
      enabled: formData.enabled,
      priority: formData.priority,
      conditions,
      channelIds: formData.channelIds,
      muteOthers: formData.muteOthers,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => alertRoutingRuleApi.create(buildPayload() as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRoutingRules'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No rule selected');
      return alertRoutingRuleApi.update(editingId, buildPayload());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRoutingRules'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertRoutingRuleApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertRoutingRules'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      alertRoutingRuleApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertRoutingRules'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(initialFormData);
  }

  function startEdit(rule: AlertRoutingRule) {
    setFormData({
      name: rule.name,
      priority: rule.priority,
      severities: rule.conditions?.severity || [],
      tags: (rule.conditions?.tags || []).join(', '),
      channelIds: rule.channelIds || [],
      muteOthers: rule.muteOthers,
      enabled: rule.enabled,
    });
    setEditingId(rule.id);
    setShowForm(true);
  }

  function toggleSeverity(sev: string) {
    setFormData((d) => ({
      ...d,
      severities: d.severities.includes(sev)
        ? d.severities.filter((s) => s !== sev)
        : [...d.severities, sev],
    }));
  }

  function toggleChannel(id: string) {
    setFormData((d) => ({
      ...d,
      channelIds: d.channelIds.includes(id)
        ? d.channelIds.filter((c) => c !== id)
        : [...d.channelIds, id],
    }));
  }

  const ruleList = rules as AlertRoutingRule[] | undefined;
  const channelList = channels as NotificationChannel[] | undefined;
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
        eyebrow="Routing"
        title="Alert routing rules"
        description="Route alerts to notification channels based on severity and tags."
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
            <CardTitle>{editingId ? 'Edit Rule' : 'New Routing Rule'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Critical to PagerDuty"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Priority</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.priority}
                    onChange={(e) => setFormData((d) => ({ ...d, priority: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Severity Filter</label>
                <div className="flex gap-2 flex-wrap">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSeverity(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        formData.severities.includes(s)
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-border/70 bg-background/50 text-muted-foreground hover:bg-accent/50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Select which severities this rule matches. Leave empty for all.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
                <Input
                  placeholder="e.g. production, web-tier"
                  value={formData.tags}
                  onChange={(e) => setFormData((d) => ({ ...d, tags: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Notification Channels <span className="text-red-400">*</span>
                </label>
                <div className="space-y-1">
                  {channelList?.map((ch) => (
                    <label key={ch.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.channelIds.includes(ch.id)}
                        onChange={() => toggleChannel(ch.id)}
                        className="rounded border-border"
                      />
                      <span className="text-foreground">{ch.name}</span>
                      <span className="text-xs text-muted-foreground">({ch.type})</span>
                    </label>
                  ))}
                  {!channelList?.length && (
                    <p className="text-sm text-muted-foreground">No notification channels configured.</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.muteOthers}
                    onChange={(e) => setFormData((d) => ({ ...d, muteOthers: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span className="text-muted-foreground">Mute other channels</span>
                </label>
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
                  disabled={createMutation.isPending || updateMutation.isPending || !formData.name.trim() || !formData.channelIds.length}
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
          title="No routing rules"
          description="Create an alert routing rule to control how alerts are delivered."
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
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
                    <th className="px-6 py-3 font-medium">Priority</th>
                    <th className="px-6 py-3 font-medium">Severity</th>
                    <th className="px-6 py-3 font-medium">Channels</th>
                    <th className="px-6 py-3 font-medium">Mute Others</th>
                    <th className="px-6 py-3 font-medium">Enabled</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleList.map((rule) => (
                    <tr key={rule.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{rule.name}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{rule.priority}</td>
                      <td className="px-6 py-4">
                        {rule.conditions?.severity?.length ? (
                          <div className="flex gap-1 flex-wrap">
                            {rule.conditions.severity.map((s) => (
                              <Badge key={s} variant={sevBadge[s] || 'default'}>{s}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Any</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {rule.channelIds.length > 0 ? (
                          <span>{rule.channelIds.length} channel{rule.channelIds.length !== 1 ? 's' : ''}</span>
                        ) : (
                          <span className="opacity-50">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {rule.muteOthers ? (
                          <Badge variant="warning">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
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
