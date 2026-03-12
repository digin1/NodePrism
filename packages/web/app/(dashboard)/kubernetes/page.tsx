'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalPanel, ModalTitle } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { kubernetesApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface KubernetesCluster {
  id: string;
  name: string;
  apiEndpoint: string;
  enabled: boolean;
  hasAuth: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ClusterStatus {
  nodes: { name: string; status: string; cpu: string; memory: string }[];
  pods: { name: string; namespace: string; status: string; restarts: number }[];
  deployments: { name: string; namespace: string; replicas: string; status: string }[];
}

type StatusTab = 'nodes' | 'pods' | 'deployments';

export default function KubernetesPage() {
  const queryClient = useQueryClient();
  const { formatDateTime } = useFormatDate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>('nodes');
  const [formData, setFormData] = useState({
    name: '',
    apiEndpoint: '',
    token: '',
  });

  const { data: clusters, isLoading } = useQuery({
    queryKey: ['kubernetesClusters'],
    queryFn: () => kubernetesApi.list(),
  });

  const { data: clusterStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['kubernetesStatus', selectedCluster],
    queryFn: () => kubernetesApi.status(selectedCluster!),
    enabled: !!selectedCluster,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; apiEndpoint: string; authConfig: { token?: string } }) =>
      kubernetesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kubernetesClusters'] });
      setShowCreateModal(false);
      setFormData({ name: '', apiEndpoint: '', token: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => kubernetesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kubernetesClusters'] });
      if (selectedCluster) setSelectedCluster(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      kubernetesApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kubernetesClusters'] });
    },
  });

  const clusterList = clusters as KubernetesCluster[] | undefined;
  const status = clusterStatus as ClusterStatus | undefined;

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      apiEndpoint: formData.apiEndpoint,
      authConfig: formData.token ? { token: formData.token } : {},
    });
  };

  // Detail view when a cluster is selected
  if (selectedCluster) {
    const cluster = clusterList?.find((c) => c.id === selectedCluster);

    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Kubernetes"
          title={cluster?.name || 'Cluster Details'}
          description={cluster?.apiEndpoint || ''}
        >
          <Button variant="outline" onClick={() => setSelectedCluster(null)}>
            Back to Clusters
          </Button>
        </PageHeader>

        {/* Tab selector */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
          {(['nodes', 'pods', 'deployments'] as StatusTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {statusLoading ? (
          <LoadingState rows={4} rowClassName="h-12" />
        ) : !status ? (
          <EmptyState
            title="No status data"
            description="Could not retrieve cluster status."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              {activeTab === 'nodes' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">CPU</th>
                      <th className="px-4 py-3">Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.nodes.map((node) => (
                      <tr key={node.name} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{node.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={node.status === 'Ready' ? 'default' : 'destructive'}>
                            {node.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{node.cpu}</td>
                        <td className="px-4 py-3 font-mono text-sm">{node.memory}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'pods' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Namespace</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Restarts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.pods.map((pod) => (
                      <tr key={pod.name} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-sm">{pod.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{pod.namespace}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={pod.status === 'Running' ? 'default' : 'destructive'}>
                            {pod.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{pod.restarts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'deployments' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Namespace</th>
                      <th className="px-4 py-3">Replicas</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.deployments.map((dep) => (
                      <tr key={dep.name} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{dep.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{dep.namespace}</Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{dep.replicas}</td>
                        <td className="px-4 py-3">
                          <Badge variant={dep.status === 'Available' ? 'default' : 'destructive'}>
                            {dep.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cloud Native"
        title="Kubernetes clusters"
        description="Monitor and manage Kubernetes clusters, nodes, pods, and deployments."
      >
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Cluster
        </Button>
      </PageHeader>

      {/* Cluster List */}
      <div className="space-y-3">
        {isLoading ? (
          <LoadingState rows={3} rowClassName="h-20" />
        ) : !clusterList?.length ? (
          <EmptyState
            title="No Kubernetes clusters"
            description="Add a Kubernetes cluster to start monitoring nodes, pods, and deployments."
            icon={
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            }
          />
        ) : (
          clusterList.map((cluster) => (
            <Card key={cluster.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        cluster.enabled ? 'bg-green-500 animate-pulse-dot' : 'bg-gray-400'
                      }`}
                    />
                  </div>

                  {/* Info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setSelectedCluster(cluster.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{cluster.name}</span>
                      {!cluster.enabled && (
                        <Badge variant="secondary" className="text-xs bg-gray-500/10 text-gray-500">
                          Disabled
                        </Badge>
                      )}
                      {cluster.hasAuth && (
                        <Badge variant="secondary" className="text-xs">
                          Authenticated
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-mono truncate">
                      {cluster.apiEndpoint}
                    </p>
                  </div>

                  {/* Last sync */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground">
                      {cluster.lastSyncAt
                        ? `Last sync: ${formatDateTime(cluster.lastSyncAt)}`
                        : 'Never synced'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        toggleMutation.mutate({ id: cluster.id, enabled: !cluster.enabled })
                      }
                      title={cluster.enabled ? 'Disable' : 'Enable'}
                    >
                      {cluster.enabled ? (
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
                      onClick={() => setSelectedCluster(cluster.id)}
                      title="View Details"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => {
                        if (confirm('Delete this cluster?')) {
                          deleteMutation.mutate(cluster.id);
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
        <ModalPanel className="max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-4">
            <ModalTitle>Add Kubernetes Cluster</ModalTitle>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Production Cluster"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  API Endpoint
                </label>
                <Input
                  value={formData.apiEndpoint}
                  onChange={(e) => setFormData((p) => ({ ...p, apiEndpoint: e.target.value }))}
                  placeholder="https://k8s.example.com:6443"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Auth Token (optional)
                </label>
                <Input
                  type="password"
                  value={formData.token}
                  onChange={(e) => setFormData((p) => ({ ...p, token: e.target.value }))}
                  placeholder="Bearer token for authentication"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formData.name || !formData.apiEndpoint || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Add Cluster'}
                </Button>
              </div>
            </div>
          </div>
        </ModalPanel>
      </Modal>
    </div>
  );
}
