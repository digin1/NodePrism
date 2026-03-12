'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { serviceDependencyApi } from '@/lib/api';

interface MapNode {
  id: string;
  type: 'SERVER' | 'MONITOR';
  name: string;
  detail: string;
  status: string;
}

interface MapEdge {
  id: string;
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  label: string | null;
}

interface MapData {
  nodes: MapNode[];
  edges: MapEdge[];
}

const defaultForm = {
  sourceId: '',
  sourceType: 'SERVER',
  targetId: '',
  targetType: 'SERVER',
  label: '',
};

export default function ServiceMapPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(defaultForm);

  const { data: mapData, isLoading } = useQuery({
    queryKey: ['serviceMap'],
    queryFn: () => serviceDependencyApi.map(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      serviceDependencyApi.create({
        sourceId: formData.sourceId,
        sourceType: formData.sourceType,
        targetId: formData.targetId,
        targetType: formData.targetType,
        label: formData.label || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceMap'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceDependencyApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['serviceMap'] }),
  });

  function resetForm() {
    setShowForm(false);
    setFormData(defaultForm);
  }

  const map = mapData as MapData | undefined;
  const nodeMap = new Map((map?.nodes || []).map((n) => [n.id, n]));

  function getNodeName(id: string): string {
    return nodeMap.get(id)?.name || id.slice(0, 8);
  }

  function getNodeTypeBadge(type: string): string {
    return type === 'SERVER' ? 'default' : 'warning';
  }

  // Filter nodes by type for dropdowns
  const sourceNodes = (map?.nodes || []).filter((n) => n.type === formData.sourceType);
  const targetNodes = (map?.nodes || []).filter((n) => n.type === formData.targetType);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Architecture"
        title="Service Dependency Map"
        description="Visualize how services and monitors depend on each other."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Dependency
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Nodes" value={map?.nodes?.length || 0} tone="primary" />
        <SummaryStat label="Dependencies" value={map?.edges?.length || 0} tone="success" />
        <SummaryStat
          label="Servers"
          value={map?.nodes?.filter((n) => n.type === 'SERVER').length || 0}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add Dependency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Source Type <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.sourceType}
                    onChange={(e) => setFormData((d) => ({ ...d, sourceType: e.target.value, sourceId: '' }))}
                  >
                    <option value="SERVER">Server</option>
                    <option value="MONITOR">Monitor</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Source <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.sourceId}
                    onChange={(e) => setFormData((d) => ({ ...d, sourceId: e.target.value }))}
                  >
                    <option value="">Select source...</option>
                    {sourceNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Target Type <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.targetType}
                    onChange={(e) => setFormData((d) => ({ ...d, targetType: e.target.value, targetId: '' }))}
                  >
                    <option value="SERVER">Server</option>
                    <option value="MONITOR">Monitor</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Target <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.targetId}
                    onChange={(e) => setFormData((d) => ({ ...d, targetId: e.target.value }))}
                  >
                    <option value="">Select target...</option>
                    {targetNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Label (optional)
                </label>
                <Input
                  placeholder="e.g. depends on, monitors, sends data to"
                  value={formData.label}
                  onChange={(e) => setFormData((d) => ({ ...d, label: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !formData.sourceId || !formData.targetId}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
                <Button variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>

              {createMutation.isError && (
                <p className="text-sm text-red-400">
                  {(createMutation.error as any)?.response?.data?.error || 'An error occurred.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingState rows={4} />
      ) : !map?.edges?.length ? (
        <EmptyState
          title="No dependencies defined"
          description="Add dependencies to map relationships between servers and monitors."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dependencies</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium text-center">Relationship</th>
                    <th className="px-4 py-3 font-medium">Target</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {map.edges.map((edge) => {
                    const source = nodeMap.get(edge.sourceId);
                    const target = nodeMap.get(edge.targetId);
                    return (
                      <tr key={edge.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={getNodeTypeBadge(edge.sourceType) as any}>
                              {edge.sourceType}
                            </Badge>
                            <span className="font-medium">{getNodeName(edge.sourceId)}</span>
                            {source && (
                              <span className="text-xs text-muted-foreground">({source.detail})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <span className="text-xs">{edge.label || 'depends on'}</span>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={getNodeTypeBadge(edge.targetType) as any}>
                              {edge.targetType}
                            </Badge>
                            <span className="font-medium">{getNodeName(edge.targetId)}</span>
                            {target && (
                              <span className="text-xs text-muted-foreground">({target.detail})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm('Remove this dependency?')) deleteMutation.mutate(edge.id);
                            }}
                          >
                            Remove
                          </Button>
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
