'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { statusPageApi, uptimeApi } from '@/lib/api';

interface StatusPageComponent {
  id?: string;
  name: string;
  description?: string | null;
  uptimeMonitorId?: string | null;
  sortOrder: number;
}

interface StatusPage {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  logoUrl?: string | null;
  customCss?: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  components: StatusPageComponent[];
  _count?: { subscribers: number };
}

interface UptimeMonitor {
  id: string;
  name: string;
  type: string;
  target: string;
}

const defaultForm = {
  slug: '',
  title: '',
  description: '',
  isPublic: true,
  components: [] as { name: string; uptimeMonitorId: string; sortOrder: number }[],
};

export default function StatusPagesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [newCompName, setNewCompName] = useState('');
  const [newCompMonitorId, setNewCompMonitorId] = useState('');

  const { data: pages, isLoading } = useQuery({
    queryKey: ['statusPages'],
    queryFn: () => statusPageApi.list(),
  });

  const { data: monitors } = useQuery({
    queryKey: ['uptimeMonitors'],
    queryFn: () => uptimeApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      statusPageApi.create({
        slug: formData.slug,
        title: formData.title,
        description: formData.description || undefined,
        components: formData.components.map((c, i) => ({
          name: c.name,
          uptimeMonitorId: c.uptimeMonitorId || undefined,
          sortOrder: c.sortOrder ?? i,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statusPages'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No page selected');
      return statusPageApi.update(editingId, {
        slug: formData.slug,
        title: formData.title,
        description: formData.description || null,
        isPublic: formData.isPublic,
        components: formData.components.map((c, i) => ({
          name: c.name,
          uptimeMonitorId: c.uptimeMonitorId || null,
          sortOrder: c.sortOrder ?? i,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statusPages'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => statusPageApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['statusPages'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
    setNewCompName('');
    setNewCompMonitorId('');
  }

  function startEdit(page: StatusPage) {
    setFormData({
      slug: page.slug,
      title: page.title,
      description: page.description || '',
      isPublic: page.isPublic,
      components: page.components.map((c) => ({
        name: c.name,
        uptimeMonitorId: c.uptimeMonitorId || '',
        sortOrder: c.sortOrder,
      })),
    });
    setEditingId(page.id);
    setShowForm(true);
  }

  function addComponent() {
    if (!newCompName.trim()) return;
    setFormData((d) => ({
      ...d,
      components: [
        ...d.components,
        { name: newCompName.trim(), uptimeMonitorId: newCompMonitorId, sortOrder: d.components.length },
      ],
    }));
    setNewCompName('');
    setNewCompMonitorId('');
  }

  function removeComponent(index: number) {
    setFormData((d) => ({
      ...d,
      components: d.components.filter((_, i) => i !== index),
    }));
  }

  const pageList = pages as StatusPage[] | undefined;
  const monitorList = monitors as UptimeMonitor[] | undefined;
  const publicCount = useMemo(() => pageList?.filter((p) => p.isPublic).length || 0, [pageList]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public"
        title="Status Pages"
        description="Create public status pages showing system health and uptime to users."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Status Page
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Pages" value={pageList?.length || 0} tone="primary" />
        <SummaryStat label="Public" value={publicCount} tone="success" />
        <SummaryStat
          label="Total Subscribers"
          value={pageList?.reduce((sum, p) => sum + (p._count?.subscribers || 0), 0) || 0}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Status Page' : 'New Status Page'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="Service Status"
                    value={formData.title}
                    onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Slug <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="my-service"
                    value={formData.slug}
                    onChange={(e) => setFormData((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Public URL: /status/{formData.slug || 'my-service'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Description
                </label>
                <Input
                  placeholder="Current status of our services"
                  value={formData.description}
                  onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData((d) => ({ ...d, isPublic: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Publicly visible</span>
              </label>

              {/* Components section */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Components
                </label>

                {formData.components.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formData.components.map((comp, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-lg border border-border/50 bg-accent/20 px-3 py-2 text-sm">
                        <span className="font-medium flex-1">{comp.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {comp.uptimeMonitorId
                            ? monitorList?.find(m => m.id === comp.uptimeMonitorId)?.name || 'Monitor'
                            : 'No monitor'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeComponent(idx)}
                          className="text-red-400 hover:text-red-300 ml-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Component name (e.g., API, Web App)"
                    value={newCompName}
                    onChange={(e) => setNewCompName(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComponent(); } }}
                  />
                  <select
                    value={newCompMonitorId}
                    onChange={(e) => setNewCompMonitorId(e.target.value)}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">No monitor</option>
                    {monitorList?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.type})
                      </option>
                    ))}
                  </select>
                  <Button variant="ghost" onClick={addComponent} disabled={!newCompName.trim()}>
                    Add
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    !formData.title || !formData.slug
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
      ) : !pageList?.length ? (
        <EmptyState
          title="No status pages"
          description="Create a public status page to show your system health to users."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Components</th>
                    <th className="px-4 py-3 font-medium">Subscribers</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageList.map((page) => (
                    <tr key={page.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{page.title}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/status/${page.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-mono text-xs"
                        >
                          /status/{page.slug}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{page.components.length}</td>
                      <td className="px-4 py-3 text-muted-foreground">{page._count?.subscribers || 0}</td>
                      <td className="px-4 py-3">
                        <Badge variant={page.isPublic ? 'success' : 'secondary'}>
                          {page.isPublic ? 'Public' : 'Private'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(page)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete status page "${page.title}"?`)) deleteMutation.mutate(page.id);
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
