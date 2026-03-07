'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardApi, metricsApi, Dashboard, DashboardPanel, DashboardConfig } from '@/lib/api';

function generateId(): string {
  return 'panel-' + Math.random().toString(36).substring(2, 9);
}

const PRESET_PANELS: DashboardPanel[] = [
  { id: '', title: 'CPU Usage', type: 'line', query: '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', span: 6, height: 300 },
  { id: '', title: 'Memory Usage', type: 'line', query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100', span: 6, height: 300 },
  { id: '', title: 'Disk Usage', type: 'gauge', query: '(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100', span: 4, height: 250 },
  { id: '', title: 'Load Average', type: 'stat', query: 'node_load1', span: 4, height: 250 },
  { id: '', title: 'Network In', type: 'area', query: 'sum(irate(node_network_receive_bytes_total{device=~"eth.*|ens.*"}[5m]))', span: 6, height: 300 },
  { id: '', title: 'Network Out', type: 'area', query: 'sum(irate(node_network_transmit_bytes_total{device=~"eth.*|ens.*"}[5m]))', span: 6, height: 300 },
];

const EMPTY_PANEL: DashboardPanel = {
  id: '',
  title: '',
  type: 'line',
  query: '',
  span: 6,
  height: 300,
};

interface PanelValue {
  panelId: string;
  value: number | null;
  loading: boolean;
}

export default function DashboardsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [panelValues, setPanelValues] = useState<Record<string, number | null>>({});
  const [editingPanelIdx, setEditingPanelIdx] = useState<number | null>(null);
  const [panelForm, setPanelForm] = useState<DashboardPanel>({ ...EMPTY_PANEL });

  const { data: dashboards, isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: () => dashboardApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      dashboardApi.create({
        name,
        description: description || undefined,
        config: { panels, refreshInterval: 30, timeRange: '1h' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setShowCreate(false);
      setName('');
      setDescription('');
      setPanels([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dashboardApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      if (viewingId) setViewingId(null);
    },
  });

  const addPanel = (panel: DashboardPanel) => {
    setPanels([...panels, { ...panel, id: generateId() }]);
  };

  const removePanel = (idx: number) => {
    setPanels(panels.filter((_, i) => i !== idx));
  };

  const saveEditingPanel = () => {
    if (editingPanelIdx === null) return;
    const updated = [...panels];
    updated[editingPanelIdx] = { ...panelForm, id: panels[editingPanelIdx].id };
    setPanels(updated);
    setEditingPanelIdx(null);
    setPanelForm({ ...EMPTY_PANEL });
  };

  // Fetch live values for a dashboard being viewed
  const viewDashboard = async (dashboard: Dashboard) => {
    setViewingId(dashboard.id);
    setPanelValues({});

    const config = dashboard.config as DashboardConfig;
    for (const panel of config.panels) {
      try {
        const result = await metricsApi.query(panel.query);
        const data = (result as any)?.data?.result?.[0]?.value;
        const value = data ? parseFloat(data[1]) : null;
        setPanelValues(prev => ({ ...prev, [panel.id]: value }));
      } catch {
        setPanelValues(prev => ({ ...prev, [panel.id]: null }));
      }
    }
  };

  const dashboardList = dashboards as Dashboard[] | undefined;
  const viewingDashboard = dashboardList?.find(d => d.id === viewingId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboards</h2>
          <p className="text-muted-foreground">Custom metric dashboards with configurable panels</p>
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setViewingId(null); }}>
          {showCreate ? 'Cancel' : 'New Dashboard'}
        </Button>
      </div>

      {/* Create Dashboard */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Dashboard</CardTitle>
            <CardDescription>Add panels with PromQL queries to build a custom dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Dashboard Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Dashboard" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Overview metrics" />
              </div>
            </div>

            {/* Panels */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Panels ({panels.length})</label>
              </div>

              {panels.length > 0 && (
                <div className="space-y-2 mb-4">
                  {panels.map((panel, idx) => (
                    <div key={panel.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <span className="font-medium">{panel.title}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {panel.type} | span: {panel.span}/12
                        </span>
                        <p className="text-xs font-mono text-muted-foreground mt-1 truncate max-w-md">
                          {panel.query}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingPanelIdx(idx);
                            setPanelForm({ ...panel });
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removePanel(idx)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Edit/Add Panel Form */}
              {editingPanelIdx !== null ? (
                <div className="p-4 border rounded-lg space-y-3">
                  <h4 className="text-sm font-medium">Edit Panel</h4>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      value={panelForm.title}
                      onChange={(e) => setPanelForm({ ...panelForm, title: e.target.value })}
                      placeholder="Panel Title"
                    />
                    <Select
                      value={panelForm.type}
                      onChange={(e) => setPanelForm({ ...panelForm, type: e.target.value as DashboardPanel['type'] })}
                    >
                      <option value="line">Line Chart</option>
                      <option value="area">Area Chart</option>
                      <option value="bar">Bar Chart</option>
                      <option value="gauge">Gauge</option>
                      <option value="stat">Stat</option>
                      <option value="table">Table</option>
                    </Select>
                    <Select
                      value={String(panelForm.span)}
                      onChange={(e) => setPanelForm({ ...panelForm, span: parseInt(e.target.value) })}
                    >
                      <option value="3">3 cols (1/4)</option>
                      <option value="4">4 cols (1/3)</option>
                      <option value="6">6 cols (1/2)</option>
                      <option value="8">8 cols (2/3)</option>
                      <option value="12">12 cols (full)</option>
                    </Select>
                  </div>
                  <Input
                    value={panelForm.query}
                    onChange={(e) => setPanelForm({ ...panelForm, query: e.target.value })}
                    placeholder="PromQL query"
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEditingPanel}>Save Panel</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingPanelIdx(null)}>Cancel</Button>
                  </div>
                </div>
              ) : null}

              {/* Preset Panels */}
              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground block mb-2">Quick Add Preset Panels</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PANELS.map((preset) => (
                    <Button
                      key={preset.title}
                      size="sm"
                      variant="outline"
                      onClick={() => addPanel(preset)}
                    >
                      + {preset.title}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name || panels.length === 0 || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Dashboard'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dashboard Viewer */}
      {viewingDashboard && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{viewingDashboard.name}</CardTitle>
                {viewingDashboard.description && (
                  <CardDescription>{viewingDashboard.description}</CardDescription>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setViewingId(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4">
              {(viewingDashboard.config as DashboardConfig).panels.map((panel) => (
                <div
                  key={panel.id}
                  className="bg-gray-50 rounded-lg p-4"
                  style={{
                    gridColumn: `span ${panel.span}`,
                    minHeight: `${panel.height}px`,
                  }}
                >
                  <h4 className="text-sm font-medium mb-2">{panel.title}</h4>
                  <div className="flex items-center justify-center h-full">
                    {panelValues[panel.id] === undefined ? (
                      <Skeleton className="h-16 w-full" />
                    ) : panelValues[panel.id] === null ? (
                      <span className="text-muted-foreground text-sm">No data</span>
                    ) : (
                      <div className="text-center">
                        <p className="text-4xl font-bold">
                          {panelValues[panel.id]!.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-xs">
                          {panel.query.substring(0, 60)}...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dashboard List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isLoading ? 'Loading...' : `${dashboardList?.length || 0} Dashboards`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !dashboardList?.length ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No dashboards yet</h3>
              <p className="mt-1 text-sm text-gray-500">Create a dashboard with custom metric panels.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardList.map((dashboard) => (
                <div
                  key={dashboard.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{dashboard.name}</h4>
                      {dashboard.isDefault && <Badge variant="secondary">Default</Badge>}
                      <Badge variant="outline">
                        {(dashboard.config as DashboardConfig).panels.length} panels
                      </Badge>
                    </div>
                    {dashboard.description && (
                      <p className="text-sm text-muted-foreground mt-1">{dashboard.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => viewDashboard(dashboard)}>
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => {
                        if (confirm('Delete this dashboard?')) {
                          deleteMutation.mutate(dashboard.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
