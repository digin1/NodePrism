'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { alertApi } from '@/lib/api';

interface AlertRule {
  id: string;
  name: string;
  description?: string;
  query: string;
  duration: string;
  severity: string;
  enabled: boolean;
  _count?: { alerts: number };
}

type Severity = 'CRITICAL' | 'WARNING' | 'INFO' | 'DEBUG';

// ─── Create Form (dual-threshold) ────────────────────────────────────

interface CreateForm {
  name: string;
  description: string;
  metric: string;
  operator: string;
  warnThreshold: string;
  critThreshold: string;
  duration: string;
}

const DEFAULT_CREATE: CreateForm = {
  name: '',
  description: '',
  metric: '',
  operator: '>',
  warnThreshold: '',
  critThreshold: '',
  duration: '5m',
};

// ─── Edit Form (single-rule, raw PromQL) ─────────────────────────────

interface EditForm {
  name: string;
  description: string;
  query: string;
  duration: string;
  severity: Severity;
}

const DEFAULT_EDIT: EditForm = {
  name: '',
  description: '',
  query: '',
  duration: '5m',
  severity: 'WARNING',
};

// ─── Presets with dual thresholds ─────────────────────────────────────

const PRESETS: Array<{
  name: string;
  metric: string;
  operator: string;
  warnThreshold: string;
  critThreshold: string;
  description: string;
}> = [
  {
    name: 'High CPU Usage',
    metric: '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
    operator: '>',
    warnThreshold: '80',
    critThreshold: '95',
    description: 'Alert when CPU usage exceeds thresholds',
  },
  {
    name: 'High Memory Usage',
    metric: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
    operator: '>',
    warnThreshold: '85',
    critThreshold: '95',
    description: 'Alert when memory usage exceeds thresholds',
  },
  {
    name: 'Disk Almost Full',
    metric: '(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100',
    operator: '>',
    warnThreshold: '80',
    critThreshold: '90',
    description: 'Alert when disk usage exceeds thresholds',
  },
  {
    name: 'Instance Down',
    metric: 'up',
    operator: '==',
    warnThreshold: '',
    critThreshold: '0',
    description: 'Alert when a monitored target is unreachable',
  },
];

// ─── Create Form Component ────────────────────────────────────────────

function CreateRuleForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  isPending,
}: {
  form: CreateForm;
  setForm: (f: CreateForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const hasWarn = form.warnThreshold.trim() !== '';
  const hasCrit = form.critThreshold.trim() !== '';
  const ruleCount = (hasWarn ? 1 : 0) + (hasCrit ? 1 : 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Rule Name *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="High CPU Usage"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Alert when CPU usage exceeds thresholds"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">PromQL Metric Expression *</label>
        <Input
          value={form.metric}
          onChange={(e) => setForm({ ...form, metric: e.target.value })}
          placeholder='100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
          className="font-mono text-sm"
          required
        />
        <p className="text-xs text-muted-foreground">
          The metric to evaluate. Do not include the comparison operator or threshold here.
        </p>
      </div>

      {/* Thresholds Section */}
      <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Thresholds</label>
          <p className="text-xs text-muted-foreground">
            Define warning and/or critical levels. At least one is required.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Operator</label>
            <Select
              value={form.operator}
              onChange={(e) => setForm({ ...form, operator: e.target.value })}
            >
              <option value=">">&gt; greater than</option>
              <option value="<">&lt; less than</option>
              <option value=">=">&gt;= greater or equal</option>
              <option value="<=">&lt;= less or equal</option>
              <option value="==">== equal to</option>
              <option value="!=">!= not equal</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              Warning Threshold
            </label>
            <Input
              type="number"
              step="any"
              value={form.warnThreshold}
              onChange={(e) => setForm({ ...form, warnThreshold: e.target.value })}
              placeholder="80"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Critical Threshold
            </label>
            <Input
              type="number"
              step="any"
              value={form.critThreshold}
              onChange={(e) => setForm({ ...form, critThreshold: e.target.value })}
              placeholder="95"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Fire after</label>
            <Select
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            >
              <option value="0s">Immediately</option>
              <option value="1m">1 minute</option>
              <option value="2m">2 minutes</option>
              <option value="5m">5 minutes</option>
              <option value="10m">10 minutes</option>
              <option value="15m">15 minutes</option>
              <option value="30m">30 minutes</option>
            </Select>
          </div>
        </div>

        {/* Preview */}
        {(hasWarn || hasCrit) && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground">
              Preview — will create {ruleCount} rule{ruleCount > 1 ? 's' : ''}:
            </p>
            {hasWarn && (
              <div className="flex items-center gap-2">
                <Badge variant="warning" className="text-[10px]">
                  WARNING
                </Badge>
                <code className="text-xs text-muted-foreground">
                  {form.metric ? `${form.metric} ${form.operator} ${form.warnThreshold}` : '...'}
                </code>
              </div>
            )}
            {hasCrit && (
              <div className="flex items-center gap-2">
                <Badge variant="danger" className="text-[10px]">
                  CRITICAL
                </Badge>
                <code className="text-xs text-muted-foreground">
                  {form.metric ? `${form.metric} ${form.operator} ${form.critThreshold}` : '...'}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending || (!hasWarn && !hasCrit)}>
          {isPending ? 'Creating...' : `Create ${ruleCount > 1 ? `${ruleCount} Rules` : 'Rule'}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Edit Form Component (single rule, raw PromQL) ───────────────────

function EditRuleForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  isPending,
}: {
  form: EditForm;
  setForm: (f: EditForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Rule Name *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="High CPU Usage"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Severity</label>
          <Select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}
          >
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
            <option value="DEBUG">Debug</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">PromQL Query *</label>
        <Input
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
          placeholder='100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90'
          className="font-mono text-sm"
          required
        />
        <p className="text-xs text-muted-foreground">
          Full expression including comparison operator and threshold
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Duration (fire after)</label>
          <Select
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value })}
          >
            <option value="0s">Immediately</option>
            <option value="1m">1 minute</option>
            <option value="2m">2 minutes</option>
            <option value="5m">5 minutes</option>
            <option value="10m">10 minutes</option>
            <option value="15m">15 minutes</option>
            <option value="30m">30 minutes</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Alert when CPU usage exceeds 90%"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function AlertRulesPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(DEFAULT_CREATE);
  const [editForm, setEditForm] = useState<EditForm>(DEFAULT_EDIT);
  const [search, setSearch] = useState('');
  const [createError, setCreateError] = useState('');

  const { data: rules, isLoading } = useQuery({
    queryKey: ['alertRules'],
    queryFn: () => alertApi.rules(),
  });

  // Auto-open editor when ?edit=<id> query param is present (e.g., from notification)
  useEffect(() => {
    const editId = searchParams?.get('edit');
    if (editId && rules && !editingId) {
      const rule = (rules as AlertRule[]).find((r) => r.id === editId);
      if (rule) {
        setEditingId(rule.id);
        setShowCreate(false);
        setEditForm({
          name: rule.name,
          description: rule.description || '',
          query: rule.query,
          duration: rule.duration,
          severity: rule.severity as Severity,
        });
        window.history.replaceState({}, '', '/alerts/rules');
        setTimeout(() => {
          document
            .getElementById(`rule-${rule.id}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [searchParams, rules]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['alertRules'] });

  // Create mutation — supports creating 1 or 2 rules from the dual-threshold form
  const [isCreating, setIsCreating] = useState(false);
  const handleCreate = async () => {
    const { name, description, metric, operator, warnThreshold, critThreshold, duration } =
      createForm;
    if (!metric.trim()) return;

    const hasWarn = warnThreshold.trim() !== '';
    const hasCrit = critThreshold.trim() !== '';
    if (!hasWarn && !hasCrit) return;

    setIsCreating(true);
    setCreateError('');
    try {
      if (hasWarn) {
        await alertApi.createRule({
          name,
          description: hasCrit ? `${description} (Warning level)`.trim() : description,
          query: `${metric} ${operator} ${warnThreshold}`,
          duration,
          severity: 'WARNING',
          enabled: true,
        });
      }
      if (hasCrit) {
        await alertApi.createRule({
          name,
          description: hasWarn ? `${description} (Critical level)`.trim() : description,
          query: `${metric} ${operator} ${critThreshold}`,
          duration,
          severity: 'CRITICAL',
          enabled: true,
        });
      }
      invalidate();
      setShowCreate(false);
      setCreateForm(DEFAULT_CREATE);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create rule');
    } finally {
      setIsCreating(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      alertApi.updateRule(id, data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditForm(DEFAULT_EDIT);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertApi.deleteRule(id),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      alertApi.updateRule(id, { enabled }),
    onSuccess: invalidate,
  });

  const startEdit = (rule: AlertRule) => {
    setEditingId(rule.id);
    setShowCreate(false);
    setEditForm({
      name: rule.name,
      description: rule.description || '',
      query: rule.query,
      duration: rule.duration,
      severity: rule.severity as Severity,
    });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, data: { ...editForm } });
  };

  const ruleList = rules as AlertRule[] | undefined;
  const filtered = ruleList?.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.query.toLowerCase().includes(search.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  // Group rules by base metric query for visual pairing
  // Strips the trailing comparison (e.g., "> 80", "== 0") to find rules monitoring the same metric
  function getBaseMetric(query: string): string {
    return query.replace(/\s*(>=|<=|!=|>|<|==)\s*[\d.]+\s*$/, '').trim();
  }

  const ruleGroups: Array<{ key: string; label: string; rules: AlertRule[] }> = [];
  const baseMetricMap = new Map<string, number>(); // base metric -> group index

  filtered?.forEach((r) => {
    const base = getBaseMetric(r.query);
    const existingIdx = baseMetricMap.get(base);
    if (existingIdx !== undefined) {
      ruleGroups[existingIdx].rules.push(r);
    } else {
      baseMetricMap.set(base, ruleGroups.length);
      ruleGroups.push({ key: r.id, label: r.name, rules: [r] });
    }
  });

  // Sort groups: multi-rule groups show the shortest name as label
  ruleGroups.forEach((g) => {
    if (g.rules.length > 1) {
      // Use the shortest name as the group label
      g.label = g.rules.reduce((a, b) => (a.name.length <= b.name.length ? a : b)).name;
      // Sort within group: WARNING before CRITICAL
      const severityOrder: Record<string, number> = { WARNING: 0, INFO: 1, CRITICAL: 2, DEBUG: 3 };
      g.rules.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alert Logic"
        title="Alert rules"
        description="Manage Prometheus rule definitions and threshold logic that power alert generation."
      >
        <Link href="/alerts">
          <Button variant="outline">Back to Alerts</Button>
        </Link>
        <Link href="/alerts/templates">
          <Button variant="outline">Templates</Button>
        </Link>
        <Button
          onClick={() => {
            if (showCreate) {
              setShowCreate(false);
            } else {
              setShowCreate(true);
              setEditingId(null);
              setCreateForm(DEFAULT_CREATE);
              setCreateError('');
            }
          }}
        >
          {showCreate ? 'Cancel' : 'Create Rule'}
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Rules" value={filtered?.length || 0} tone="primary" />
        <SummaryStat label="Create Mode" value={showCreate ? 'Open' : 'Closed'} />
        <SummaryStat label="Search" value={search || 'All'} />
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Alert Rule</CardTitle>
            <CardDescription>
              Define a metric and set warning &amp; critical thresholds. Both levels are created as
              separate Prometheus rules.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
                {createError}
              </div>
            )}
            <CreateRuleForm
              form={createForm}
              setForm={setCreateForm}
              onSubmit={handleCreate}
              onCancel={() => {
                setShowCreate(false);
                setCreateForm(DEFAULT_CREATE);
                setCreateError('');
              }}
              isPending={isCreating}
            />
          </CardContent>
        </Card>
      )}

      {/* Search + Rules List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {isLoading ? 'Loading...' : `${filtered?.length || 0} Rules`}
            </CardTitle>
            {(ruleList?.length || 0) > 3 && (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rules..."
                className="w-64"
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !filtered?.length ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-foreground">
                {search ? 'No matching rules' : 'No alert rules'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? 'Try a different search term.'
                  : 'Create your first alert rule to get started.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ruleGroups.map((group) => (
                <div
                  key={group.key}
                  className={`rounded-lg border transition-colors ${
                    group.rules.length > 1 ? 'border-border/50' : 'border-transparent'
                  } bg-muted/50`}
                >
                  {/* Group header for paired rules */}
                  {group.rules.length > 1 && (
                    <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
                      <span className="text-xs text-muted-foreground">
                        {group.rules.length} threshold levels
                      </span>
                      {group.rules.map((r) => (
                        <Badge
                          key={r.id}
                          variant={
                            r.severity === 'CRITICAL'
                              ? 'danger'
                              : r.severity === 'WARNING'
                                ? 'warning'
                                : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {r.severity}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {group.rules.map((rule) => (
                    <div
                      key={rule.id}
                      id={`rule-${rule.id}`}
                      className={`transition-colors ${editingId === rule.id ? 'bg-primary/5' : ''}`}
                    >
                      {editingId === rule.id ? (
                        /* ── Inline Edit Mode ── */
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <svg
                              className="w-4 h-4 text-primary"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            <span className="text-sm font-medium text-primary">Editing Rule</span>
                          </div>
                          <EditRuleForm
                            form={editForm}
                            setForm={setEditForm}
                            onSubmit={handleSaveEdit}
                            onCancel={() => {
                              setEditingId(null);
                              setEditForm(DEFAULT_EDIT);
                            }}
                            isPending={updateMutation.isPending}
                          />
                        </div>
                      ) : (
                        /* ── Read Mode ── */
                        <div className="flex items-start justify-between p-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Only show name if not in a multi-rule group (group header shows it) */}
                              {group.rules.length === 1 && (
                                <h4 className="font-medium">{rule.name}</h4>
                              )}
                              <Badge
                                variant={
                                  rule.severity === 'CRITICAL'
                                    ? 'danger'
                                    : rule.severity === 'WARNING'
                                      ? 'warning'
                                      : 'secondary'
                                }
                              >
                                {rule.severity}
                              </Badge>
                              {!rule.enabled && (
                                <Badge variant="outline" className="opacity-60">
                                  Disabled
                                </Badge>
                              )}
                              {rule._count?.alerts && rule._count.alerts > 0 ? (
                                <Badge variant="danger">{rule._count.alerts} firing</Badge>
                              ) : null}
                            </div>
                            {rule.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {rule.description}
                              </p>
                            )}
                            <p className="text-xs font-mono text-muted-foreground mt-2 bg-muted p-2 rounded break-all">
                              {rule.query}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>Fire after: {rule.duration}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                            <Button size="sm" variant="outline" onClick={() => startEdit(rule)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })
                              }
                              disabled={toggleMutation.isPending}
                            >
                              {rule.enabled ? 'Disable' : 'Enable'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                              onClick={() => {
                                if (
                                  confirm(
                                    'Delete this rule? Active alerts using this rule will be orphaned.'
                                  )
                                ) {
                                  deleteMutation.mutate(rule.id);
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick-Start Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick-Start Presets</CardTitle>
          <CardDescription>
            Click to pre-fill the create form with common alerting rules
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  setCreateForm({
                    name: preset.name,
                    description: preset.description,
                    metric: preset.metric,
                    operator: preset.operator,
                    warnThreshold: preset.warnThreshold,
                    critThreshold: preset.critThreshold,
                    duration: '5m',
                  });
                  setShowCreate(true);
                  setEditingId(null);
                  setCreateError('');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-left p-4 border rounded-lg hover:bg-muted/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <p className="font-medium">{preset.name}</p>
                  {preset.warnThreshold && (
                    <Badge variant="warning" className="text-[10px]">
                      WARN {preset.operator} {preset.warnThreshold}
                    </Badge>
                  )}
                  {preset.critThreshold && (
                    <Badge variant="danger" className="text-[10px]">
                      CRIT {preset.operator} {preset.critThreshold}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                <p className="text-xs font-mono text-muted-foreground mt-2 truncate">
                  {preset.metric}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
