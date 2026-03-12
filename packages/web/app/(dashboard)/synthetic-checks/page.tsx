'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalPanel, ModalTitle } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { syntheticCheckApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface SyntheticCheckResult {
  id: string;
  checkId: string;
  status: string;
  duration: number;
  screenshot: string | null;
  errorMessage: string | null;
  stepResults: unknown;
  checkedAt: string;
}

interface SyntheticCheck {
  id: string;
  name: string;
  script: string;
  interval: number;
  timeout: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastResult: SyntheticCheckResult | null;
  results?: SyntheticCheckResult[];
}

const SCRIPT_PLACEHOLDER = `// Example Playwright script
const { test, expect } = require('@playwright/test');

test('homepage loads correctly', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
  await expect(page.locator('h1')).toBeVisible();
});`;

export default function SyntheticChecksPage() {
  const queryClient = useQueryClient();
  const { formatDateTime } = useFormatDate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCheck, setEditingCheck] = useState<SyntheticCheck | null>(null);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    script: '',
    interval: 300,
    timeout: 60,
    enabled: true,
  });

  const { data: checks, isLoading } = useQuery({
    queryKey: ['syntheticChecks'],
    queryFn: () => syntheticCheckApi.list(),
  });

  const { data: checkDetail } = useQuery({
    queryKey: ['syntheticCheck', selectedCheckId],
    queryFn: () => syntheticCheckApi.get(selectedCheckId!),
    enabled: !!selectedCheckId,
  });

  const { data: checkResults } = useQuery({
    queryKey: ['syntheticCheckResults', selectedCheckId],
    queryFn: () => syntheticCheckApi.results(selectedCheckId!, { limit: 50 }),
    enabled: !!selectedCheckId,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => syntheticCheckApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syntheticChecks'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      syntheticCheckApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syntheticChecks'] });
      queryClient.invalidateQueries({ queryKey: ['syntheticCheck', editingCheck?.id] });
      setEditingCheck(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => syntheticCheckApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syntheticChecks'] });
      if (selectedCheckId) setSelectedCheckId(null);
    },
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => syntheticCheckApi.run(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syntheticChecks'] });
      queryClient.invalidateQueries({ queryKey: ['syntheticCheckResults', selectedCheckId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      syntheticCheckApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syntheticChecks'] });
    },
  });

  const checkList = checks as SyntheticCheck[] | undefined;
  const detail = checkDetail as SyntheticCheck | undefined;
  const results = (checkResults as { data?: SyntheticCheckResult[] } | SyntheticCheckResult[] | undefined);
  const resultList = Array.isArray(results) ? results : (results as any)?.data ?? (results as any) ?? [];

  const resetForm = () => {
    setFormData({ name: '', script: '', interval: 300, timeout: 60, enabled: true });
  };

  const openEditModal = (check: SyntheticCheck) => {
    setEditingCheck(check);
    setFormData({
      name: check.name,
      script: check.script,
      interval: check.interval,
      timeout: check.timeout,
      enabled: check.enabled,
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'PASS':
        return 'bg-green-500';
      case 'FAIL':
        return 'bg-red-500';
      case 'TIMEOUT':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  // Results history view
  if (selectedCheckId) {
    const check = checkList?.find((c) => c.id === selectedCheckId);

    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Synthetic Checks"
          title={check?.name || 'Check Results'}
          description="Browser check result history. Actual browser execution requires Playwright installation."
        >
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => runMutation.mutate(selectedCheckId)}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? 'Running...' : 'Run Now'}
            </Button>
            <Button variant="outline" onClick={() => setSelectedCheckId(null)}>
              Back to Checks
            </Button>
          </div>
        </PageHeader>

        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(resultList) && resultList.length > 0 ? (
                  (resultList as SyntheticCheckResult[]).map((result) => (
                    <tr key={result.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${statusColor(result.status)}`} />
                          <Badge
                            variant={
                              result.status === 'PASS'
                                ? 'default'
                                : result.status === 'TIMEOUT'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                          >
                            {result.status}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{result.duration}ms</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                        {result.errorMessage || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDateTime(result.checkedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No results yet. Click &quot;Run Now&quot; to execute a check.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Browser Monitoring"
        title="Synthetic checks"
        description="Define Playwright-based browser scripts to continuously validate user journeys and page functionality."
      >
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Check
        </Button>
      </PageHeader>

      {/* Check List */}
      <div className="space-y-3">
        {isLoading ? (
          <LoadingState rows={3} rowClassName="h-20" />
        ) : !checkList?.length ? (
          <EmptyState
            title="No synthetic checks"
            description="Create a synthetic check to monitor user journeys with Playwright browser scripts."
            icon={
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            }
          />
        ) : (
          checkList.map((check) => (
            <Card key={check.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        !check.lastResult
                          ? 'bg-gray-400'
                          : statusColor(check.lastResult.status)
                      } ${check.lastResult ? 'animate-pulse-dot' : ''}`}
                    />
                  </div>

                  {/* Info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setSelectedCheckId(check.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{check.name}</span>
                      {!check.enabled && (
                        <Badge variant="secondary" className="text-xs bg-gray-500/10 text-gray-500">
                          Paused
                        </Badge>
                      )}
                      {check.lastResult && (
                        <Badge
                          variant={
                            check.lastResult.status === 'PASS'
                              ? 'default'
                              : check.lastResult.status === 'TIMEOUT'
                                ? 'secondary'
                                : 'destructive'
                          }
                          className="text-xs"
                        >
                          {check.lastResult.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Every {check.interval}s | Timeout: {check.timeout}s
                    </p>
                  </div>

                  {/* Last run */}
                  <div className="text-right flex-shrink-0">
                    {check.lastResult ? (
                      <>
                        <div className="text-sm font-mono">
                          {check.lastResult.duration}ms
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(check.lastResult.checkedAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Never run</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => runMutation.mutate(check.id)}
                      disabled={runMutation.isPending}
                      title="Run Now"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        toggleMutation.mutate({ id: check.id, enabled: !check.enabled })
                      }
                      title={check.enabled ? 'Pause' : 'Resume'}
                    >
                      {check.enabled ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditModal(check)}
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => {
                        if (confirm('Delete this check?')) {
                          deleteMutation.mutate(check.id);
                        }
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalPanel className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-4">
            <ModalTitle>Create Synthetic Check</ModalTitle>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Homepage Load Test"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Script
                </label>
                <textarea
                  className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.script}
                  onChange={(e) => setFormData((p) => ({ ...p, script: e.target.value }))}
                  placeholder={SCRIPT_PLACEHOLDER}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Note: actual browser execution requires Playwright installation.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Interval (seconds)
                  </label>
                  <Input
                    type="number"
                    value={formData.interval}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, interval: parseInt(e.target.value) || 300 }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Timeout (seconds)
                  </label>
                  <Input
                    type="number"
                    value={formData.timeout}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, timeout: parseInt(e.target.value) || 60 }))
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(formData)}
                  disabled={!formData.name || !formData.script || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Check'}
                </Button>
              </div>
            </div>
          </div>
        </ModalPanel>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingCheck} onClose={() => { setEditingCheck(null); resetForm(); }}>
        <ModalPanel className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-4">
            <ModalTitle>Edit Synthetic Check</ModalTitle>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Homepage Load Test"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Script
                </label>
                <textarea
                  className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.script}
                  onChange={(e) => setFormData((p) => ({ ...p, script: e.target.value }))}
                  placeholder={SCRIPT_PLACEHOLDER}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Interval (seconds)
                  </label>
                  <Input
                    type="number"
                    value={formData.interval}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, interval: parseInt(e.target.value) || 300 }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">
                    Timeout (seconds)
                  </label>
                  <Input
                    type="number"
                    value={formData.timeout}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, timeout: parseInt(e.target.value) || 60 }))
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setEditingCheck(null); resetForm(); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    editingCheck &&
                    updateMutation.mutate({ id: editingCheck.id, data: formData })
                  }
                  disabled={!formData.name || !formData.script || updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        </ModalPanel>
      </Modal>
    </div>
  );
}
