'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ModalPanel, ModalTitle } from '@/components/ui/modal';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { escalationPolicyApi, notificationApi, NotificationChannel } from '@/lib/api';

interface EscalationStep {
  id?: string;
  stepOrder: number;
  delayMinutes: number;
  channelId: string;
  channel?: { id: string; name: string; type: string };
}

interface EscalationPolicy {
  id: string;
  name: string;
  enabled: boolean;
  steps: EscalationStep[];
  createdAt: string;
  updatedAt: string;
}

const defaultFormData = {
  name: '',
  enabled: true,
};

const defaultStep: Omit<EscalationStep, 'id'> = {
  stepOrder: 1,
  delayMinutes: 5,
  channelId: '',
};

export default function EscalationPoliciesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [steps, setSteps] = useState<Omit<EscalationStep, 'id'>[]>([]);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['escalationPolicies'],
    queryFn: () => escalationPolicyApi.list(),
  });

  const { data: channels } = useQuery({
    queryKey: ['notificationChannels'],
    queryFn: () => notificationApi.listChannels(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; enabled?: boolean; steps: { stepOrder: number; delayMinutes: number; channelId: string }[] }) =>
      escalationPolicyApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalationPolicies'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      escalationPolicyApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalationPolicies'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => escalationPolicyApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalationPolicies'] });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultFormData);
    setSteps([]);
  }

  function startEdit(policy: EscalationPolicy) {
    setFormData({
      name: policy.name,
      enabled: policy.enabled,
    });
    setSteps(
      policy.steps.map((s) => ({
        stepOrder: s.stepOrder,
        delayMinutes: s.delayMinutes,
        channelId: s.channelId,
      }))
    );
    setEditingId(policy.id);
    setShowForm(true);
  }

  function addStep() {
    const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.stepOrder)) + 1 : 1;
    setSteps([...steps, { ...defaultStep, stepOrder: nextOrder }]);
  }

  function removeStep(index: number) {
    const updated = steps.filter((_, i) => i !== index);
    // Renumber step orders
    setSteps(updated.map((s, i) => ({ ...s, stepOrder: i + 1 })));
  }

  function updateStep(index: number, field: string, value: string | number) {
    setSteps(steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function handleSubmit() {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { name: formData.name, enabled: formData.enabled, steps } });
    } else {
      createMutation.mutate({ name: formData.name, enabled: formData.enabled, steps });
    }
  }

  const policyList = policies as EscalationPolicy[] | undefined;
  const channelList = channels as NotificationChannel[] | undefined;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const totalSteps = useMemo(() => policyList?.reduce((acc, p) => acc + (p.steps?.length || 0), 0) || 0, [policyList]);

  function getChannelName(channelId: string): string {
    const ch = channelList?.find((c) => c.id === channelId);
    return ch ? ch.name : channelId;
  }

  function getChannelType(channelId: string): string {
    const ch = channelList?.find((c) => c.id === channelId);
    return ch ? ch.type : '';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Response"
        title="Escalation policies"
        description="Define multi-step notification chains that automatically escalate unacknowledged alerts through configured channels."
      >
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Policy
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryStat label="Total Policies" value={policyList?.length || 0} tone="primary" />
        <SummaryStat
          label="Total Steps"
          value={totalSteps}
        />
      </div>

      {/* Policy List */}
      {isLoading ? (
        <LoadingState rows={3} rowClassName="h-20" />
      ) : !policyList?.length ? (
        <EmptyState
          title="No escalation policies"
          description="Create an escalation policy to define how alerts are routed through notification channels over time."
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 10h4l3-7 4 14 3-7h4"
              />
            </svg>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Steps</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policyList.map((policy) => (
                    <tr
                      key={policy.id}
                      className="border-b border-border/40 hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-foreground">{policy.name}</td>
                      <td className="px-6 py-4">
                        <Badge variant="default">{policy.steps?.length || 0} steps</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={policy.enabled ? 'success' : 'secondary'}>
                          {policy.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(policy)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete policy "${policy.name}"?`)) {
                                deleteMutation.mutate(policy.id);
                              }
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

      {/* Create / Edit Modal */}
      <Modal open={showForm} onClose={() => resetForm()}>
        <ModalPanel className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-5">
            <ModalTitle>{editingId ? 'Edit Policy' : 'Create Escalation Policy'}</ModalTitle>

            {/* Policy fields */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Critical Alert Chain"
                />
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
            </div>

            {/* Steps */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Escalation Steps ({steps.length})
                </h3>
                <Button variant="outline" size="sm" onClick={addStep}>
                  + Add Step
                </Button>
              </div>

              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No steps defined. Add a step to configure the notification chain.
                </p>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div
                      key={index}
                      className="flex items-end gap-3 rounded-xl border border-border/70 bg-background/50 p-3"
                    >
                      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary text-sm font-semibold">
                        {step.stepOrder}
                      </div>
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">
                            Delay (minutes)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={step.delayMinutes}
                            onChange={(e) =>
                              updateStep(index, 'delayMinutes', parseInt(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">
                            Notification Channel
                          </label>
                          <Select
                            value={step.channelId}
                            onChange={(e) => updateStep(index, 'channelId', e.target.value)}
                          >
                            <option value="">Select channel...</option>
                            {channelList?.map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.name} ({ch.type})
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
                        onClick={() => removeStep(index)}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!formData.name || isSaving}>
                {isSaving ? 'Saving...' : editingId ? 'Update Policy' : 'Create Policy'}
              </Button>
            </div>
          </div>
        </ModalPanel>
      </Modal>
    </div>
  );
}
