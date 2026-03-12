'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalPanel, ModalTitle } from '@/components/ui/modal';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { runbookApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface RunbookExecution {
  id: string;
  status: string;
  output: string | null;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
}

interface Runbook {
  id: string;
  name: string;
  description: string | null;
  script: string;
  language: string;
  timeout: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastExecution: { id: string; status: string; startedAt: string; finishedAt: string | null } | null;
  executions?: RunbookExecution[];
  _count?: { executions: number };
}

const statusColors: Record<string, 'success' | 'danger' | 'warning' | 'secondary' | 'default'> = {
  SUCCESS: 'success',
  FAILED: 'danger',
  TIMEOUT: 'warning',
  RUNNING: 'secondary',
  PENDING: 'default',
};

const languageLabels: Record<string, string> = {
  bash: 'Bash',
  python: 'Python',
  node: 'Node.js',
};

export default function RunbooksPage() {
  const queryClient = useQueryClient();
  const { formatDateTime } = useFormatDate();
  const [showModal, setShowModal] = useState(false);
  const [editingRunbook, setEditingRunbook] = useState<Runbook | null>(null);
  const [selectedRunbook, setSelectedRunbook] = useState<string | null>(null);
  const [expandedOutput, setExpandedOutput] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    script: '',
    language: 'bash',
    timeout: 300,
    enabled: true,
  });

  const { data: runbooks, isLoading } = useQuery({
    queryKey: ['runbooks'],
    queryFn: () => runbookApi.list(),
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ['runbook', selectedRunbook],
    queryFn: () => runbookApi.get(selectedRunbook!),
    enabled: !!selectedRunbook,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => runbookApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof form }) => runbookApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      queryClient.invalidateQueries({ queryKey: ['runbook', editingRunbook?.id] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => runbookApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      if (selectedRunbook === editingRunbook?.id) setSelectedRunbook(null);
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => runbookApi.execute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      queryClient.invalidateQueries({ queryKey: ['runbook', selectedRunbook] });
    },
  });

  function openCreate() {
    setEditingRunbook(null);
    setForm({ name: '', description: '', script: '', language: 'bash', timeout: 300, enabled: true });
    setShowModal(true);
  }

  function openEdit(rb: Runbook) {
    setEditingRunbook(rb);
    setForm({
      name: rb.name,
      description: rb.description || '',
      script: rb.script,
      language: rb.language,
      timeout: rb.timeout,
      enabled: rb.enabled,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingRunbook(null);
  }

  function handleSubmit() {
    if (editingRunbook) {
      updateMutation.mutate({ id: editingRunbook.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const runbookList = runbooks as Runbook[] | undefined;
  const detail = selectedDetail as Runbook | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Runbooks"
        description="Create, manage, and execute operational runbooks for automated remediation."
      >
        <Button onClick={openCreate}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Runbook
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Runbooks" value={runbookList?.length || 0} tone="primary" />
        <SummaryStat
          label="Enabled"
          value={runbookList?.filter((r) => r.enabled).length || 0}
          tone="success"
        />
        <SummaryStat
          label="Disabled"
          value={runbookList?.filter((r) => !r.enabled).length || 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Runbook List */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <LoadingState rows={4} rowClassName="h-20" />
          ) : !runbookList?.length ? (
            <EmptyState
              title="No runbooks"
              description="Create your first runbook to automate operational tasks."
              icon={
                <svg
                  className="h-12 w-12 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              }
            />
          ) : (
            runbookList.map((rb) => (
              <Card
                key={rb.id}
                className={`cursor-pointer transition-colors ${
                  selectedRunbook === rb.id ? 'ring-2 ring-primary' : 'hover:bg-muted/30'
                }`}
                onClick={() => setSelectedRunbook(rb.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{rb.name}</span>
                        <Badge variant="secondary">{languageLabels[rb.language] || rb.language}</Badge>
                        <Badge variant={rb.enabled ? 'success' : 'default'}>
                          {rb.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      {rb.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {rb.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Timeout: {rb.timeout}s</span>
                        {rb._count && <span>{rb._count.executions} executions</span>}
                        {rb.lastExecution && (
                          <span className="flex items-center gap-1">
                            Last run:{' '}
                            <Badge variant={statusColors[rb.lastExecution.status]}>
                              {rb.lastExecution.status}
                            </Badge>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(rb);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          executeMutation.mutate(rb.id);
                        }}
                        disabled={!rb.enabled || executeMutation.isPending}
                      >
                        Run
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Execution Log */}
        <div className="space-y-4">
          {selectedRunbook && detail ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Execution History</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      if (confirm('Delete this runbook?')) {
                        deleteMutation.mutate(detail.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!detail.executions?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No executions yet</p>
                ) : (
                  <div className="space-y-3">
                    {detail.executions.map((exec) => {
                      const duration =
                        exec.finishedAt && exec.startedAt
                          ? Math.round(
                              (new Date(exec.finishedAt).getTime() -
                                new Date(exec.startedAt).getTime()) /
                                1000
                            )
                          : null;
                      return (
                        <div key={exec.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant={statusColors[exec.status]}>{exec.status}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(exec.startedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {duration !== null && <span>Duration: {duration}s</span>}
                            {exec.exitCode !== null && <span>Exit code: {exec.exitCode}</span>}
                            {exec.triggeredBy && <span>By: {exec.triggeredBy}</span>}
                          </div>
                          {exec.output && (
                            <div>
                              <button
                                className="text-xs text-primary hover:underline"
                                onClick={() =>
                                  setExpandedOutput(
                                    expandedOutput === exec.id ? null : exec.id
                                  )
                                }
                              >
                                {expandedOutput === exec.id ? 'Hide output' : 'Show output'}
                              </button>
                              {expandedOutput === exec.id && (
                                <pre className="mt-2 p-2 bg-muted/50 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono">
                                  {exec.output}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p className="text-sm">Select a runbook to view execution history</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={closeModal}>
        <ModalPanel className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-4">
            <ModalTitle>{editingRunbook ? 'Edit Runbook' : 'Create Runbook'}</ModalTitle>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Restart Nginx"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Description
                </label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Language
                  </label>
                  <Select
                    value={form.language}
                    onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
                  >
                    <option value="bash">Bash</option>
                    <option value="python">Python</option>
                    <option value="node">Node.js</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Timeout (s)
                  </label>
                  <Input
                    type="number"
                    value={form.timeout}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, timeout: parseInt(e.target.value) || 300 }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
                      className="rounded"
                    />
                    Enabled
                  </label>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Script
                </label>
                <textarea
                  className="min-h-[200px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="#!/bin/bash&#10;echo 'Hello, World!'"
                  value={form.script}
                  onChange={(e) => setForm((p) => ({ ...p, script: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    !form.name ||
                    !form.script ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingRunbook
                      ? 'Update Runbook'
                      : 'Create Runbook'}
                </Button>
              </div>
            </div>
          </div>
        </ModalPanel>
      </Modal>
    </div>
  );
}
