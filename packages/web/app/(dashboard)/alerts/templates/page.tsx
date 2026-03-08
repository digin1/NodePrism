'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { alertApi } from '@/lib/api';

interface AlertTemplate {
  id: string;
  name: string;
  description?: string;
  query: string;
  calc?: string;
  units?: string;
  matchLabels?: Record<string, string>;
  matchHostLabels?: Record<string, string>;
  warnCondition?: { condition: string; hysteresis?: { trigger: number; clear: number } };
  critCondition?: { condition: string; hysteresis?: { trigger: number; clear: number } };
  every: string;
  for: string;
  enabled: boolean;
  _count?: { alerts: number };
}

interface TestResult {
  serverId: string;
  hostname: string;
  value: number | null;
  warnFiring: boolean;
  critFiring: boolean;
}

interface TemplateForm {
  name: string;
  description: string;
  query: string;
  units: string;
  warnCondition: string;
  critCondition: string;
  every: string;
  for: string;
}

const DEFAULT_FORM: TemplateForm = {
  name: '',
  description: '',
  query: '',
  units: '',
  warnCondition: '$value > 80',
  critCondition: '$value > 95',
  every: '1m',
  for: '5m',
};

const PRESETS = [
  {
    name: 'CPU Usage',
    query: '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
    units: '%',
    warn: '$value > 80',
    crit: '$value > 95',
    description: 'Average CPU usage percentage across all cores',
  },
  {
    name: 'Memory Usage',
    query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
    units: '%',
    warn: '$value > 80',
    crit: '$value > 95',
    description: 'Percentage of RAM in use',
  },
  {
    name: 'Disk Usage',
    query: '(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100',
    units: '%',
    warn: '$value > 80',
    crit: '$value > 90',
    description: 'Root filesystem usage percentage',
  },
  {
    name: 'Load Average (1m)',
    query: 'node_load1',
    units: '',
    warn: '$value > 4',
    crit: '$value > 8',
    description: '1-minute load average',
  },
];

function TemplateFormComponent({
  form,
  setForm,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
}: {
  form: TemplateForm;
  setForm: (f: TemplateForm) => void;
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
          <label className="text-sm font-medium">Template Name *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="High CPU Usage"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Units</label>
          <Input
            value={form.units}
            onChange={(e) => setForm({ ...form, units: e.target.value })}
            placeholder="% or bytes or ms"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Description</label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Alert when CPU usage is too high"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">PromQL Query *</label>
        <Input
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
          placeholder='100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
          className="font-mono text-sm"
          required
        />
        <p className="text-xs text-muted-foreground">
          Should return a single numeric value. <code className="bg-muted px-1 rounded">server_id</code> label is injected automatically per server.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Warning Condition *</label>
          <Input
            value={form.warnCondition}
            onChange={(e) => setForm({ ...form, warnCondition: e.target.value })}
            placeholder="$value > 80"
            className="font-mono text-sm"
            required
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">$value</code> with: {'>'} {'<'} {'>='} {'<='} == !=
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Critical Condition *</label>
          <Input
            value={form.critCondition}
            onChange={(e) => setForm({ ...form, critCondition: e.target.value })}
            placeholder="$value > 95"
            className="font-mono text-sm"
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Evaluation Interval</label>
          <Select
            value={form.every}
            onChange={(e) => setForm({ ...form, every: e.target.value })}
          >
            <option value="30s">30 seconds</option>
            <option value="1m">1 minute</option>
            <option value="2m">2 minutes</option>
            <option value="5m">5 minutes</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Fire After</label>
          <Select
            value={form.for}
            onChange={(e) => setForm({ ...form, for: e.target.value })}
          >
            <option value="0s">Immediately</option>
            <option value="1m">1 minute</option>
            <option value="2m">2 minutes</option>
            <option value="5m">5 minutes</option>
            <option value="10m">10 minutes</option>
            <option value="15m">15 minutes</option>
          </Select>
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

export default function AlertTemplatesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [form, setForm] = useState<TemplateForm>(DEFAULT_FORM);
  const [search, setSearch] = useState('');

  const { data: templates, isLoading } = useQuery({
    queryKey: ['alertTemplates'],
    queryFn: () => alertApi.templates(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['alertTemplates'] });

  const createMutation = useMutation({
    mutationFn: () =>
      alertApi.createTemplate({
        name: form.name,
        description: form.description || undefined,
        query: form.query,
        units: form.units || undefined,
        warnCondition: { condition: form.warnCondition },
        critCondition: { condition: form.critCondition },
        every: form.every,
        for: form.for,
      }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setForm(DEFAULT_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      alertApi.updateTemplate(id, data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(DEFAULT_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertApi.deleteTemplate(id),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      alertApi.updateTemplate(id, { enabled }),
    onSuccess: invalidate,
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => alertApi.testTemplate(id),
    onSuccess: (data: any) => {
      setTestResults(data.results || []);
    },
  });

  const startEdit = (template: AlertTemplate) => {
    setEditingId(template.id);
    setShowCreate(false);
    setForm({
      name: template.name,
      description: template.description || '',
      query: template.query,
      units: template.units || '',
      warnCondition: template.warnCondition?.condition || '$value > 80',
      critCondition: template.critCondition?.condition || '$value > 95',
      every: template.every,
      for: template.for,
    });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: {
        name: form.name,
        description: form.description || undefined,
        query: form.query,
        units: form.units || undefined,
        warnCondition: { condition: form.warnCondition },
        critCondition: { condition: form.critCondition },
        every: form.every,
        for: form.for,
      },
    });
  };

  const handleTest = (id: string) => {
    setTestingId(id);
    setTestResults(null);
    testMutation.mutate(id);
  };

  const templateList = templates as AlertTemplate[] | undefined;
  const filtered = templateList?.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.query.toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase())
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
            <h2 className="text-2xl font-bold text-foreground">Alert Templates</h2>
            <p className="text-muted-foreground">
              Per-server threshold templates with warning and critical conditions
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/alerts/rules">
            <Button variant="outline">Rules</Button>
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
            {showCreate ? 'Cancel' : 'Create Template'}
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Alert Template</CardTitle>
            <CardDescription>
              Define a PromQL query and threshold conditions. The query is evaluated per-server automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TemplateFormComponent
              form={form}
              setForm={setForm}
              onSubmit={() => createMutation.mutate()}
              onCancel={() => {
                setShowCreate(false);
                setForm(DEFAULT_FORM);
              }}
              isPending={createMutation.isPending}
              submitLabel="Create Template"
            />
          </CardContent>
        </Card>
      )}

      {/* Templates List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {isLoading ? 'Loading...' : `${filtered?.length || 0} Templates`}
            </CardTitle>
            {(templateList?.length || 0) > 3 && (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-64"
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !filtered?.length ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-foreground">
                {search ? 'No matching templates' : 'No alert templates'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? 'Try a different search term.'
                  : 'Create a template to evaluate alerts per-server with warn/crit thresholds.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((template) => (
                <div
                  key={template.id}
                  className={`rounded-lg border transition-colors ${
                    editingId === template.id
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted/70'
                  }`}
                >
                  {editingId === template.id ? (
                    /* ── Inline Edit Mode ── */
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="text-sm font-medium text-primary">Editing Template</span>
                      </div>
                      <TemplateFormComponent
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
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium">{template.name}</h4>
                            {!template.enabled && (
                              <Badge variant="outline" className="opacity-60">Disabled</Badge>
                            )}
                            {template._count?.alerts ? (
                              <Badge variant="danger">{template._count.alerts} firing</Badge>
                            ) : null}
                            {template.units && (
                              <Badge variant="secondary">{template.units}</Badge>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                          )}
                          <p className="text-xs font-mono text-muted-foreground mt-2 bg-muted p-2 rounded break-all">
                            {template.query}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span>
                              Warn: <code className="text-yellow-600 dark:text-yellow-400">{template.warnCondition?.condition}</code>
                            </span>
                            <span>
                              Crit: <code className="text-red-600 dark:text-red-400">{template.critCondition?.condition}</code>
                            </span>
                            <span>Every: {template.every}</span>
                            <span>For: {template.for}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTest(template.id)}
                            disabled={testMutation.isPending && testingId === template.id}
                          >
                            {testMutation.isPending && testingId === template.id ? 'Testing...' : 'Test'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => startEdit(template)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleMutation.mutate({ id: template.id, enabled: !template.enabled })}
                            disabled={toggleMutation.isPending}
                          >
                            {template.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                            onClick={() => {
                              if (confirm('Delete this template? Active alerts will be orphaned.')) {
                                deleteMutation.mutate(template.id);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      {/* Test Results (inline below this card) */}
                      {testingId === template.id && testResults && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-sm font-medium">
                              Test Results ({testResults.length} server{testResults.length !== 1 ? 's' : ''} matched)
                            </h5>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setTestingId(null);
                                setTestResults(null);
                              }}
                            >
                              Close
                            </Button>
                          </div>
                          {testResults.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No servers matched this template. Check matchLabels or ensure servers are online.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-muted-foreground border-b">
                                    <th className="pb-2 pr-4 font-medium">Server</th>
                                    <th className="pb-2 pr-4 font-medium">Current Value</th>
                                    <th className="pb-2 pr-4 font-medium">Warning</th>
                                    <th className="pb-2 font-medium">Critical</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {testResults.map((r) => (
                                    <tr key={r.serverId} className="border-b border-border/50">
                                      <td className="py-2 pr-4">{r.hostname}</td>
                                      <td className="py-2 pr-4 font-mono">
                                        {r.value !== null ? r.value.toFixed(2) : 'N/A'}
                                        {r.value !== null && template.units ? ` ${template.units}` : ''}
                                      </td>
                                      <td className="py-2 pr-4">
                                        <Badge variant={r.warnFiring ? 'warning' : 'secondary'}>
                                          {r.warnFiring ? 'FIRING' : 'OK'}
                                        </Badge>
                                      </td>
                                      <td className="py-2">
                                        <Badge variant={r.critFiring ? 'danger' : 'secondary'}>
                                          {r.critFiring ? 'FIRING' : 'OK'}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
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
          <CardDescription>Click to pre-fill the create form with common monitoring templates</CardDescription>
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
                    units: preset.units,
                    warnCondition: preset.warn,
                    critCondition: preset.crit,
                    every: '1m',
                    for: '5m',
                  });
                  setShowCreate(true);
                  setEditingId(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-left p-4 border rounded-lg hover:bg-muted/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <p className="font-medium">{preset.name}</p>
                  {preset.units && (
                    <Badge variant="secondary" className="text-[10px]">{preset.units}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                <p className="text-xs font-mono text-muted-foreground mt-2 truncate">{preset.query}</p>
                <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span>Warn: <code className="text-yellow-600 dark:text-yellow-400">{preset.warn}</code></span>
                  <span>Crit: <code className="text-red-600 dark:text-red-400">{preset.crit}</code></span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
