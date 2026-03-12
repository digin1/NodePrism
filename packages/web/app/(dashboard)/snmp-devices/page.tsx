'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { snmpDeviceApi } from '@/lib/api';

interface SnmpDevice {
  id: string;
  name: string;
  host: string;
  port: number;
  version: string;
  community: string | null;
  oids: Record<string, unknown>[];
  interval: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastPollAt: string | null;
}

const defaultForm = {
  name: '',
  host: '',
  port: '161',
  version: '2c',
  community: '',
  oids: '[]',
  interval: '60',
  enabled: true,
};

export default function SnmpDevicesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);

  const { data: devices, isLoading } = useQuery({
    queryKey: ['snmpDevices'],
    queryFn: () => snmpDeviceApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      let parsedOids: Record<string, unknown>[];
      try {
        parsedOids = JSON.parse(formData.oids);
      } catch {
        throw new Error('Invalid OIDs JSON');
      }
      return snmpDeviceApi.create({
        name: formData.name,
        host: formData.host,
        port: parseInt(formData.port),
        version: formData.version,
        community: formData.community || undefined,
        oids: parsedOids,
        interval: parseInt(formData.interval),
        enabled: formData.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snmpDevices'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No device selected');
      let parsedOids: Record<string, unknown>[];
      try {
        parsedOids = JSON.parse(formData.oids);
      } catch {
        throw new Error('Invalid OIDs JSON');
      }
      return snmpDeviceApi.update(editingId, {
        name: formData.name,
        host: formData.host,
        port: parseInt(formData.port),
        version: formData.version,
        community: formData.community || null,
        oids: parsedOids,
        interval: parseInt(formData.interval),
        enabled: formData.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snmpDevices'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => snmpDeviceApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['snmpDevices'] }),
  });

  const pollMutation = useMutation({
    mutationFn: (id: string) => snmpDeviceApi.poll(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['snmpDevices'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(device: SnmpDevice) {
    setFormData({
      name: device.name,
      host: device.host,
      port: String(device.port),
      version: device.version,
      community: device.community || '',
      oids: JSON.stringify(device.oids, null, 2),
      interval: String(device.interval),
      enabled: device.enabled,
    });
    setEditingId(device.id);
    setShowForm(true);
  }

  const deviceList = devices as SnmpDevice[] | undefined;
  const enabledCount = useMemo(() => deviceList?.filter((d) => d.enabled).length || 0, [deviceList]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Network"
        title="SNMP Devices"
        description="Monitor network devices via SNMP polling."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Device
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Devices" value={deviceList?.length || 0} tone="primary" />
        <SummaryStat label="Enabled" value={enabledCount} tone="success" />
        <SummaryStat
          label="Recently Polled"
          value={deviceList?.filter((d) => d.lastPollAt && new Date(d.lastPollAt) > new Date(Date.now() - 3600000)).length || 0}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Device' : 'New SNMP Device'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="Core Switch"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Host <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="192.168.1.1"
                    value={formData.host}
                    onChange={(e) => setFormData((d) => ({ ...d, host: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Port</label>
                  <Input
                    type="number"
                    placeholder="161"
                    value={formData.port}
                    onChange={(e) => setFormData((d) => ({ ...d, port: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">SNMP Version</label>
                  <Select
                    value={formData.version}
                    onChange={(e) => setFormData((d) => ({ ...d, version: e.target.value }))}
                  >
                    <option value="2c">v2c</option>
                    <option value="3">v3</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Community String</label>
                  <Input
                    placeholder="public"
                    value={formData.community}
                    onChange={(e) => setFormData((d) => ({ ...d, community: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Interval (seconds)
                  </label>
                  <Input
                    type="number"
                    min="10"
                    placeholder="60"
                    value={formData.interval}
                    onChange={(e) => setFormData((d) => ({ ...d, interval: e.target.value }))}
                  />
                </div>
                <div className="flex items-end pb-1">
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
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  OIDs (JSON) <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={'[\n  { "oid": "1.3.6.1.2.1.1.1.0", "name": "sysDescr", "type": "string" }\n]'}
                  value={formData.oids}
                  onChange={(e) => setFormData((d) => ({ ...d, oids: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    !formData.name || !formData.host
                  }
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </Button>
                <Button variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>

              {(createMutation.isError || updateMutation.isError) && (
                <p className="text-sm text-red-400">
                  {(createMutation.error as any)?.response?.data?.error ||
                    (createMutation.error as any)?.message ||
                    (updateMutation.error as any)?.response?.data?.error ||
                    (updateMutation.error as any)?.message ||
                    'An error occurred.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingState rows={4} />
      ) : !deviceList?.length ? (
        <EmptyState
          title="No SNMP devices"
          description="Add network devices to monitor via SNMP polling."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
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
                    <th className="px-4 py-3 font-medium">Host:Port</th>
                    <th className="px-4 py-3 font-medium">Version</th>
                    <th className="px-4 py-3 font-medium">OIDs</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last Poll</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceList.map((device) => (
                    <tr key={device.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{device.name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {device.host}:{device.port}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">v{device.version}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {Array.isArray(device.oids) ? device.oids.length : 0}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={device.enabled ? 'success' : 'secondary'}>
                          {device.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {device.lastPollAt
                          ? new Date(device.lastPollAt).toLocaleString()
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => pollMutation.mutate(device.id)}
                            disabled={pollMutation.isPending}
                          >
                            Poll
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(device)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete device "${device.name}"?`)) deleteMutation.mutate(device.id);
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
