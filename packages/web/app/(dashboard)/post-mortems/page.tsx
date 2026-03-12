'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { postMortemApi, incidentApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface PostMortem {
  id: string;
  incidentId: string;
  summary: string;
  rootCause: string;
  impact: string;
  timeline: string;
  actionItems: string[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  incident?: { id: string; title: string; severity: string; status: string };
}

interface Incident {
  id: string;
  title: string;
  status: string;
  severity: string;
}

const initialFormData = {
  incidentId: '',
  summary: '',
  rootCause: '',
  impact: '',
  timeline: '',
  actionItems: '',
};

export default function PostMortemsPage() {
  const queryClient = useQueryClient();
  const { formatDateTime } = useFormatDate();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialFormData);

  const { data: postMortems, isLoading } = useQuery({
    queryKey: ['postMortems'],
    queryFn: () => postMortemApi.list(),
  });

  const { data: incidents } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => incidentApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      postMortemApi.create({
        incidentId: formData.incidentId,
        summary: formData.summary,
        rootCause: formData.rootCause,
        impact: formData.impact,
        timeline: formData.timeline,
        actionItems: formData.actionItems.split('\n').filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postMortems'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No post-mortem selected');
      return postMortemApi.update(editingId, {
        summary: formData.summary,
        rootCause: formData.rootCause,
        impact: formData.impact,
        timeline: formData.timeline,
        actionItems: formData.actionItems.split('\n').filter(Boolean),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postMortems'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => postMortemApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['postMortems'] }),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => postMortemApi.publish(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['postMortems'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(initialFormData);
  }

  function startEdit(pm: PostMortem) {
    setFormData({
      incidentId: pm.incidentId,
      summary: pm.summary || '',
      rootCause: pm.rootCause || '',
      impact: pm.impact || '',
      timeline: pm.timeline || '',
      actionItems: Array.isArray(pm.actionItems) ? pm.actionItems.join('\n') : '',
    });
    setEditingId(pm.id);
    setShowForm(true);
  }

  const pmList = postMortems as PostMortem[] | undefined;
  const incidentList = incidents as Incident[] | undefined;

  const totalCount = useMemo(() => pmList?.length || 0, [pmList]);
  const publishedCount = useMemo(() => pmList?.filter((pm) => pm.publishedAt).length || 0, [pmList]);
  const draftCount = useMemo(() => totalCount - publishedCount, [totalCount, publishedCount]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Response"
        title="Post-Mortems"
        description="Document root causes, timelines, and lessons learned from resolved incidents."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Post-Mortem
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total" value={totalCount} tone="primary" />
        <SummaryStat label="Published" value={publishedCount} tone="success" />
        <SummaryStat label="Draft" value={draftCount} tone="warning" />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Post-Mortem' : 'Create Post-Mortem'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!editingId && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Incident <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.incidentId}
                    onChange={(e) => setFormData((d) => ({ ...d, incidentId: e.target.value }))}
                  >
                    <option value="">Select an incident...</option>
                    {incidentList?.map((incident) => (
                      <option key={incident.id} value={incident.id}>
                        {incident.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Summary <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="w-full rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                  placeholder="High-level summary of the incident and its impact..."
                  value={formData.summary}
                  onChange={(e) => setFormData((d) => ({ ...d, summary: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Root Cause <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="w-full rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                  placeholder="What was the underlying cause..."
                  value={formData.rootCause}
                  onChange={(e) => setFormData((d) => ({ ...d, rootCause: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Impact <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="w-full rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                  placeholder="What was the impact on users/services..."
                  value={formData.impact}
                  onChange={(e) => setFormData((d) => ({ ...d, impact: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Timeline <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="w-full rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={4}
                  placeholder="Chronological sequence of events..."
                  value={formData.timeline}
                  onChange={(e) => setFormData((d) => ({ ...d, timeline: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Action Items (one per line)
                </label>
                <textarea
                  className="w-full rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                  placeholder="Add monitoring for X&#10;Update runbook for Y&#10;..."
                  value={formData.actionItems}
                  onChange={(e) => setFormData((d) => ({ ...d, actionItems: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    (!editingId && !formData.incidentId) ||
                    !formData.summary || !formData.rootCause || !formData.impact || !formData.timeline
                  }
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingId ? 'Update Post-Mortem' : 'Create Post-Mortem'}
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
        <LoadingState rows={4} rowClassName="h-20" />
      ) : !pmList?.length ? (
        <EmptyState
          title="No post-mortems"
          description="Create a post-mortem report to document lessons learned from an incident."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Incident</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pmList.map((pm) => {
                    const isDraft = !pm.publishedAt;
                    return (
                      <tr key={pm.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-medium max-w-xs truncate">{pm.summary}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {pm.incident?.title || pm.incidentId}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={isDraft ? 'warning' : 'success'}>
                            {isDraft ? 'DRAFT' : 'PUBLISHED'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(pm.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {isDraft && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => publishMutation.mutate(pm.id)}
                                disabled={publishMutation.isPending}
                              >
                                Publish
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => startEdit(pm)}>Edit</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                              onClick={() => {
                                if (confirm('Delete this post-mortem?')) deleteMutation.mutate(pm.id);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
