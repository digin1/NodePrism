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

interface RuleForm {
  name: string;
  description: string;
  query: string;
  duration: string;
  severity: Severity;
}

const DEFAULT_FORM: RuleForm = {
  name: '',
  description: '',
  query: '',
  duration: '5m',
  severity: 'WARNING',
};

const PRESETS = [
  {
    name: 'High CPU Usage',
    query: '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90',
    severity: 'WARNING' as Severity,
    description: 'Alert when average CPU usage exceeds 90%',
  },
  {
    name: 'High Memory Usage',
    query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90',
    severity: 'WARNING' as Severity,
    description: 'Alert when memory usage exceeds 90%',
  },
  {
    name: 'Disk Almost Full',
    query: '(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100 > 85',
    severity: 'CRITICAL' as Severity,
    description: 'Alert when any disk is more than 85% full',
  },
  {
    name: 'Instance Down',
    query: 'up == 0',
    severity: 'CRITICAL' as Severity,
    description: 'Alert when a monitored target is unreachable',
  },
];

function RuleForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
}: {
  form: RuleForm;
  setForm: (f: RuleForm) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isPending: boolean;
  submitLabel: string;
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
          Expression that returns true when the alert should fire
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
          {isPending ? 'Saving...' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default function AlertRulesPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(DEFAULT_FORM);
  const [search, setSearch] = useState('');

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
        setForm({
          name: rule.name,
          description: rule.description || '',
          query: rule.query,
          duration: rule.duration,
          severity: rule.severity as Severity,
        });
        window.history.replaceState({}, '', '/alerts/rules');
        // Scroll to the rule card after render
        setTimeout(() => {
          document.getElementById(`rule-${rule.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [searchParams, rules]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['alertRules'] });

  const createMutation = useMutation({
    mutationFn: () => alertApi.createRule({ ...form, enabled: true }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setForm(DEFAULT_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      alertApi.updateRule(id, data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(DEFAULT_FORM);
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
    setForm({
      name: rule.name,
      description: rule.description || '',
      query: rule.query,
      duration: rule.duration,
      severity: rule.severity as Severity,
    });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, data: { ...form } });
  };

  const ruleList = rules as AlertRule[] | undefined;
  const filtered = ruleList?.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.query.toLowerCase().includes(search.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/alerts">
            <Button variant="ghost" size="icon">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Alert Rules</h2>
            <p className="text-muted-foreground">
              Prometheus alerting rules with PromQL expressions
            </p>
          </div>
        </div>
        <div className="flex gap-2">
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
                setForm(DEFAULT_FORM);
              }
            }}
          >
            {showCreate ? 'Cancel' : 'Create Rule'}
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Alert Rule</CardTitle>
            <CardDescription>Define a new alerting condition using PromQL</CardDescription>
          </CardHeader>
          <CardContent>
            <RuleForm
              form={form}
              setForm={setForm}
              onSubmit={() => createMutation.mutate()}
              onCancel={() => {
                setShowCreate(false);
                setForm(DEFAULT_FORM);
              }}
              isPending={createMutation.isPending}
              submitLabel="Create Rule"
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
              <svg className="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-foreground">
                {search ? 'No matching rules' : 'No alert rules'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {search ? 'Try a different search term.' : 'Create your first alert rule to get started.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((rule) => (
                <div
                  key={rule.id}
                  id={`rule-${rule.id}`}
                  className={`rounded-lg border transition-colors ${
                    editingId === rule.id
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted/70'
                  }`}
                >
                  {editingId === rule.id ? (
                    /* ── Inline Edit Mode ── */
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="text-sm font-medium text-primary">Editing Rule</span>
                      </div>
                      <RuleForm
                        form={form}
                        setForm={setForm}
                        onSubmit={handleSaveEdit}
                        onCancel={() => {
                          setEditingId(null);
                          setForm(DEFAULT_FORM);
                        }}
                        isPending={updateMutation.isPending}
                        submitLabel="Save Changes"
                      />
                    </div>
                  ) : (
                    /* ── Read Mode ── */
                    <div className="flex items-start justify-between p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium">{rule.name}</h4>
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
                            <Badge variant="outline" className="opacity-60">Disabled</Badge>
                          )}
                          {rule._count?.alerts && rule._count.alerts > 0 ? (
                            <Badge variant="danger">{rule._count.alerts} firing</Badge>
                          ) : null}
                        </div>
                        {rule.description && (
                          <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
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
                          onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                          disabled={toggleMutation.isPending}
                        >
                          {rule.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => {
                            if (confirm('Delete this rule? Active alerts using this rule will be orphaned.')) {
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
          )}
        </CardContent>
      </Card>

      {/* Quick-Start Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick-Start Presets</CardTitle>
          <CardDescription>Click to pre-fill the create form with common alerting rules</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  setForm({
                    name: preset.name,
                    description: preset.description,
                    query: preset.query,
                    duration: '5m',
                    severity: preset.severity,
                  });
                  setShowCreate(true);
                  setEditingId(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-left p-4 border rounded-lg hover:bg-muted/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <p className="font-medium">{preset.name}</p>
                  <Badge
                    variant={preset.severity === 'CRITICAL' ? 'danger' : 'warning'}
                    className="text-[10px]"
                  >
                    {preset.severity}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                <p className="text-xs font-mono text-muted-foreground mt-2 truncate">{preset.query}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
