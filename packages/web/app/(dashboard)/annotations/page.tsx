'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { annotationApi } from '@/lib/api';

interface Annotation {
  id: string;
  title: string;
  message: string | null;
  tags: string[];
  startTime: string;
  endTime: string | null;
  color: string;
  createdBy: string | null;
  createdAt: string;
}

const defaultForm = {
  title: '',
  message: '',
  startTime: '',
  endTime: '',
  tags: '',
  color: '#3B82F6',
  createdBy: '',
};

export default function AnnotationsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);

  const { data: annotations, isLoading } = useQuery({
    queryKey: ['annotations'],
    queryFn: () => annotationApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      annotationApi.create({
        title: formData.title,
        message: formData.message || undefined,
        tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        startTime: new Date(formData.startTime).toISOString(),
        endTime: formData.endTime ? new Date(formData.endTime).toISOString() : undefined,
        color: formData.color,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No annotation selected');
      return annotationApi.update(editingId, {
        title: formData.title,
        message: formData.message || null,
        tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        startTime: new Date(formData.startTime).toISOString(),
        endTime: formData.endTime ? new Date(formData.endTime).toISOString() : null,
        color: formData.color,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => annotationApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(annotation: Annotation) {
    setFormData({
      title: annotation.title,
      message: annotation.message || '',
      startTime: annotation.startTime ? new Date(annotation.startTime).toISOString().slice(0, 16) : '',
      endTime: annotation.endTime ? new Date(annotation.endTime).toISOString().slice(0, 16) : '',
      tags: annotation.tags?.join(', ') || '',
      color: annotation.color || '#3B82F6',
      createdBy: annotation.createdBy || '',
    });
    setEditingId(annotation.id);
    setShowForm(true);
  }

  const annotationList = annotations as Annotation[] | undefined;
  const totalTags = useMemo(() => {
    const tagSet = new Set<string>();
    annotationList?.forEach((a) => a.tags?.forEach((t) => tagSet.add(t)));
    return tagSet.size;
  }, [annotationList]);

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observability"
        title="Annotations"
        description="Create event overlays to mark deployments, incidents, and other notable events on timelines."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Annotation
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Annotations" value={annotationList?.length || 0} tone="primary" />
        <SummaryStat label="Unique Tags" value={totalTags} tone="success" />
        <SummaryStat
          label="With End Time"
          value={annotationList?.filter((a) => a.endTime).length || 0}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Annotation' : 'New Annotation'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="Deployment v2.1.0"
                    value={formData.title}
                    onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Tags (comma-separated)
                  </label>
                  <Input
                    placeholder="deploy, production"
                    value={formData.tags}
                    onChange={(e) => setFormData((d) => ({ ...d, tags: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Message
                </label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Optional description of this event..."
                  value={formData.message}
                  onChange={(e) => setFormData((d) => ({ ...d, message: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Start Time <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData((d) => ({ ...d, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    End Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData((d) => ({ ...d, endTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData((d) => ({ ...d, color: e.target.value }))}
                      className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                    />
                    <Input
                      value={formData.color}
                      onChange={(e) => setFormData((d) => ({ ...d, color: e.target.value }))}
                      placeholder="#3B82F6"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    !formData.title || !formData.startTime
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
      ) : !annotationList?.length ? (
        <EmptyState
          title="No annotations"
          description="Create annotations to mark deployments, incidents, and other notable events."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
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
                    <th className="px-4 py-3 font-medium">Color</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Time Range</th>
                    <th className="px-4 py-3 font-medium">Tags</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {annotationList.map((annotation) => (
                    <tr key={annotation.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <div
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: annotation.color }}
                          title={annotation.color}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{annotation.title}</div>
                        {annotation.message && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">
                            {annotation.message}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <div>{formatDateTime(annotation.startTime)}</div>
                        {annotation.endTime && (
                          <div className="mt-0.5">to {formatDateTime(annotation.endTime)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {annotation.tags?.map((tag) => (
                            <Badge key={tag} variant="secondary">{tag}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(annotation)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete annotation "${annotation.title}"?`)) deleteMutation.mutate(annotation.id);
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
