'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { multiStepMonitorApi } from '@/lib/api';

interface StepForm {
  name: string;
  method: string;
  url: string;
  headers: string;
  body: string;
  expectedStatus: string;
  extractVars: string;
  assertions: string;
}

interface MonitorResult {
  id: string;
  monitorId: string;
  status: string;
  duration: number;
  stepResults: any;
  checkedAt: string;
}

interface Monitor {
  id: string;
  name: string;
  interval: number;
  timeout: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  stepCount?: number;
  _count?: { steps: number };
  lastResult?: MonitorResult | null;
  steps?: any[];
  results?: MonitorResult[];
}

const emptyStep: StepForm = {
  name: '',
  method: 'GET',
  url: '',
  headers: '',
  body: '',
  expectedStatus: '',
  extractVars: '',
  assertions: '',
};

const defaultForm = {
  name: '',
  interval: '300',
  timeout: '30',
  enabled: true,
};

function parseJsonSafe(str: string): any {
  if (!str.trim()) return undefined;
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

export default function MultiStepMonitorsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [steps, setSteps] = useState<StepForm[]>([{ ...emptyStep }]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: monitors, isLoading } = useQuery({
    queryKey: ['multiStepMonitors'],
    queryFn: () => multiStepMonitorApi.list(),
  });

  const { data: viewMonitor } = useQuery({
    queryKey: ['multiStepMonitor', viewingId],
    queryFn: () => multiStepMonitorApi.get(viewingId!),
    enabled: !!viewingId,
  });

  const { data: viewResults } = useQuery({
    queryKey: ['multiStepMonitorResults', viewingId],
    queryFn: () => multiStepMonitorApi.results(viewingId!, { limit: 20 }),
    enabled: !!viewingId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      multiStepMonitorApi.create({
        name: formData.name,
        interval: parseInt(formData.interval),
        timeout: parseInt(formData.timeout),
        enabled: formData.enabled,
        steps: steps.map((s, idx) => ({
          stepOrder: idx + 1,
          name: s.name,
          method: s.method,
          url: s.url,
          headers: parseJsonSafe(s.headers),
          body: s.body || undefined,
          expectedStatus: s.expectedStatus ? parseInt(s.expectedStatus) : undefined,
          extractVars: parseJsonSafe(s.extractVars),
          assertions: parseJsonSafe(s.assertions),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiStepMonitors'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No monitor selected');
      return multiStepMonitorApi.update(editingId, {
        name: formData.name,
        interval: parseInt(formData.interval),
        timeout: parseInt(formData.timeout),
        enabled: formData.enabled,
        steps: steps.map((s, idx) => ({
          stepOrder: idx + 1,
          name: s.name,
          method: s.method,
          url: s.url,
          headers: parseJsonSafe(s.headers),
          body: s.body || undefined,
          expectedStatus: s.expectedStatus ? parseInt(s.expectedStatus) : undefined,
          extractVars: parseJsonSafe(s.extractVars),
          assertions: parseJsonSafe(s.assertions),
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiStepMonitors'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => multiStepMonitorApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['multiStepMonitors'] }),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => multiStepMonitorApi.run(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiStepMonitors'] });
      if (viewingId) {
        queryClient.invalidateQueries({ queryKey: ['multiStepMonitorResults', viewingId] });
      }
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
    setSteps([{ ...emptyStep }]);
  }

  function startEdit(monitor: Monitor) {
    setFormData({
      name: monitor.name,
      interval: String(monitor.interval),
      timeout: String(monitor.timeout),
      enabled: monitor.enabled,
    });
    // Load steps if available
    if (monitor.steps && monitor.steps.length > 0) {
      setSteps(
        monitor.steps.map((s: any) => ({
          name: s.name,
          method: s.method || 'GET',
          url: s.url,
          headers: s.headers ? JSON.stringify(s.headers, null, 2) : '',
          body: s.body || '',
          expectedStatus: s.expectedStatus ? String(s.expectedStatus) : '',
          extractVars: s.extractVars ? JSON.stringify(s.extractVars, null, 2) : '',
          assertions: s.assertions ? JSON.stringify(s.assertions, null, 2) : '',
        }))
      );
    } else {
      setSteps([{ ...emptyStep }]);
    }
    setEditingId(monitor.id);
    setShowForm(true);
    setViewingId(null);
  }

  async function handleEditFromView(id: string) {
    const monitor = await multiStepMonitorApi.get(id);
    startEdit(monitor as Monitor);
  }

  function addStep() {
    setSteps((prev) => [...prev, { ...emptyStep }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    setSteps((prev) => {
      const next = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateStep(index: number, field: keyof StepForm, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  const monitorList = monitors as Monitor[] | undefined;
  const passCount = monitorList?.filter((m) => m.lastResult?.status === 'PASS').length || 0;
  const failCount = monitorList?.filter((m) => m.lastResult?.status === 'FAIL').length || 0;

  // Detail view
  if (viewingId && viewMonitor) {
    const mon = viewMonitor as Monitor;
    const results = (viewResults as MonitorResult[] | undefined) || [];

    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Multi-Step Monitors"
          title={mon.name}
          description={`${mon.steps?.length || 0} steps | Interval: ${mon.interval}s | Timeout: ${mon.timeout}s`}
        >
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => runMutation.mutate(mon.id)}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? 'Running...' : 'Run Now'}
            </Button>
            <Button variant="ghost" onClick={() => handleEditFromView(mon.id)}>Edit</Button>
            <Button variant="ghost" onClick={() => setViewingId(null)}>Back</Button>
          </div>
        </PageHeader>

        {/* Steps */}
        <Card>
          <CardHeader>
            <CardTitle>Steps</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">URL</th>
                    <th className="px-4 py-3 font-medium">Expected</th>
                    <th className="px-4 py-3 font-medium">Extract Vars</th>
                  </tr>
                </thead>
                <tbody>
                  {mon.steps?.map((step: any) => (
                    <tr key={step.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{step.stepOrder}</td>
                      <td className="px-4 py-3 font-medium">{step.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{step.method}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[300px] truncate">{step.url}</td>
                      <td className="px-4 py-3 text-muted-foreground">{step.expectedStatus || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {step.extractVars ? Object.keys(step.extractVars).join(', ') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Results History */}
        <Card>
          <CardHeader>
            <CardTitle>Results History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">No results yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Checked At</th>
                      <th className="px-4 py-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <>
                        <tr
                          key={result.id}
                          className="border-b border-border/40 hover:bg-accent/30 transition-colors cursor-pointer"
                          onClick={() => setExpandedResult(expandedResult === result.id ? null : result.id)}
                        >
                          <td className="px-4 py-3">
                            <Badge variant={result.status === 'PASS' ? 'success' : 'danger'}>
                              {result.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{result.duration}ms</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(result.checkedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {expandedResult === result.id ? 'Hide' : 'Show'}
                          </td>
                        </tr>
                        {expandedResult === result.id && (
                          <tr key={`${result.id}-detail`}>
                            <td colSpan={4} className="px-4 py-3 bg-accent/20">
                              <div className="space-y-2">
                                {(Array.isArray(result.stepResults) ? result.stepResults : []).map((sr: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-3 text-sm">
                                    <Badge variant={sr.status === 'PASS' ? 'success' : 'danger'} className="text-xs">
                                      {sr.status}
                                    </Badge>
                                    <span className="font-medium">{sr.name}</span>
                                    <span className="text-muted-foreground">{sr.duration}ms</span>
                                    <span className="text-muted-foreground">{sr.message}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Multi-Step Monitors"
        description="Define sequential API workflows with variable extraction between steps."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Monitor
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Monitors" value={monitorList?.length || 0} tone="primary" />
        <SummaryStat label="Passing" value={passCount} tone="success" />
        <SummaryStat label="Failing" value={failCount} tone="danger" />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Monitor' : 'New Multi-Step Monitor'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="API Login Flow"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Interval (seconds)
                  </label>
                  <Input
                    type="number"
                    min="10"
                    placeholder="300"
                    value={formData.interval}
                    onChange={(e) => setFormData((d) => ({ ...d, interval: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Timeout (seconds)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="30"
                    value={formData.timeout}
                    onChange={(e) => setFormData((d) => ({ ...d, timeout: e.target.value }))}
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

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Steps</h3>
                  <Button variant="ghost" size="sm" onClick={addStep}>+ Add Step</Button>
                </div>

                <div className="space-y-4">
                  {steps.map((step, idx) => (
                    <div key={idx} className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Step {idx + 1}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => moveStep(idx, 'up')} disabled={idx === 0}>
                            Up
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => moveStep(idx, 'down')} disabled={idx === steps.length - 1}>
                            Down
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500"
                            onClick={() => removeStep(idx)}
                            disabled={steps.length === 1}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Name <span className="text-red-400">*</span>
                          </label>
                          <Input
                            placeholder="Login"
                            value={step.name}
                            onChange={(e) => updateStep(idx, 'name', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Method</label>
                          <Select value={step.method} onChange={(e) => updateStep(idx, 'method', e.target.value)}>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                            <option value="PATCH">PATCH</option>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Expected Status</label>
                          <Input
                            type="number"
                            placeholder="200"
                            value={step.expectedStatus}
                            onChange={(e) => updateStep(idx, 'expectedStatus', e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          URL <span className="text-red-400">*</span>
                        </label>
                        <Input
                          placeholder="https://api.example.com/auth/login"
                          value={step.url}
                          onChange={(e) => updateStep(idx, 'url', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {'Use {{varName}} to inject variables from previous steps'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Headers (JSON)</label>
                          <textarea
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono min-h-[60px]"
                            placeholder='{"Authorization": "Bearer {{token}}"}'
                            value={step.headers}
                            onChange={(e) => updateStep(idx, 'headers', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Body</label>
                          <textarea
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono min-h-[60px]"
                            placeholder='{"username": "admin", "password": "secret"}'
                            value={step.body}
                            onChange={(e) => updateStep(idx, 'body', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Extract Variables (JSON)</label>
                          <textarea
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono min-h-[60px]"
                            placeholder='{"token": "data.access_token"}'
                            value={step.extractVars}
                            onChange={(e) => updateStep(idx, 'extractVars', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Assertions (JSON)</label>
                          <textarea
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono min-h-[60px]"
                            placeholder='{"data.status": "active"}'
                            value={step.assertions}
                            onChange={(e) => updateStep(idx, 'assertions', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    !formData.name || steps.some((s) => !s.name || !s.url)
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
          title="No multi-step monitors"
          description="Create sequential API workflows to monitor complex user journeys."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
                    <th className="px-4 py-3 font-medium">Steps</th>
                    <th className="px-4 py-3 font-medium">Last Status</th>
                    <th className="px-4 py-3 font-medium">Last Check</th>
                    <th className="px-4 py-3 font-medium">Interval</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {monitorList.map((monitor) => (
                    <tr key={monitor.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <button
                          className="text-left hover:text-primary transition-colors"
                          onClick={() => { setViewingId(monitor.id); setShowForm(false); }}
                        >
                          {monitor.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {monitor.stepCount ?? monitor._count?.steps ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        {monitor.lastResult ? (
                          <Badge variant={monitor.lastResult.status === 'PASS' ? 'success' : 'danger'}>
                            {monitor.lastResult.status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {monitor.lastResult
                          ? new Date(monitor.lastResult.checkedAt).toLocaleString()
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{monitor.interval}s</td>
                      <td className="px-4 py-3">
                        <Badge variant={monitor.enabled ? 'success' : 'secondary'}>
                          {monitor.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => runMutation.mutate(monitor.id)}
                            disabled={runMutation.isPending}
                          >
                            Run
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditFromView(monitor.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete monitor "${monitor.name}"?`)) deleteMutation.mutate(monitor.id);
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
