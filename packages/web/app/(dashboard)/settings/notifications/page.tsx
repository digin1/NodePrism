'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { notificationApi, NotificationChannel } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

const CHANNEL_TYPES = ['EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK', 'TELEGRAM', 'PAGERDUTY'] as const;

const TYPE_LABELS: Record<string, string> = {
  EMAIL: 'Email (SMTP)',
  SLACK: 'Slack',
  DISCORD: 'Discord',
  WEBHOOK: 'Webhook',
  TELEGRAM: 'Telegram',
  PAGERDUTY: 'PagerDuty',
};

const CONFIG_FIELDS: Record<
  string,
  { key: string; label: string; type?: string; placeholder: string; required?: boolean }[]
> = {
  EMAIL: [
    { key: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com', required: true },
    { key: 'port', label: 'Port', type: 'number', placeholder: '587', required: true },
    { key: 'secure', label: 'Use TLS', type: 'checkbox', placeholder: '' },
    { key: 'username', label: 'Username', placeholder: 'user@example.com', required: true },
    {
      key: 'password',
      label: 'Password',
      type: 'password',
      placeholder: 'App password',
      required: true,
    },
    { key: 'from', label: 'From Address', placeholder: 'nodeprism@example.com', required: true },
    {
      key: 'to',
      label: 'To (comma-separated)',
      placeholder: 'admin@example.com, team@example.com',
      required: true,
    },
  ],
  SLACK: [
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      placeholder: 'https://hooks.slack.com/services/...',
      required: true,
    },
    { key: 'channel', label: 'Channel (optional)', placeholder: '#monitoring' },
    { key: 'username', label: 'Bot Name', placeholder: 'NodePrism' },
  ],
  DISCORD: [
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      placeholder: 'https://discord.com/api/webhooks/...',
      required: true,
    },
  ],
  WEBHOOK: [
    { key: 'url', label: 'URL', placeholder: 'https://example.com/webhook', required: true },
    { key: 'method', label: 'Method', placeholder: 'POST' },
    {
      key: 'secret',
      label: 'Secret (X-NodePrism-Secret header)',
      type: 'password',
      placeholder: 'optional shared secret',
    },
  ],
  TELEGRAM: [
    {
      key: 'botToken',
      label: 'Bot Token',
      type: 'password',
      placeholder: '123456:ABC-DEF...',
      required: true,
    },
    { key: 'chatId', label: 'Chat ID', placeholder: '-1001234567890', required: true },
  ],
  PAGERDUTY: [
    {
      key: 'routingKey',
      label: 'Routing Key',
      type: 'password',
      placeholder: 'Integration key from PagerDuty service',
      required: true,
    },
  ],
};

export default function NotificationsPage() {
  const { formatDateTime } = useFormatDate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'SLACK' as string,
    config: {} as Record<string, unknown>,
    enabled: true,
  });

  const { data: channels, isLoading } = useQuery({
    queryKey: ['notificationChannels'],
    queryFn: () => notificationApi.listChannels(),
  });

  const { data: logs } = useQuery({
    queryKey: ['notificationLogs'],
    queryFn: () => notificationApi.logs({ limit: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const config = { ...formData.config };
      // Convert comma-separated 'to' to array for email
      if (formData.type === 'EMAIL' && typeof config.to === 'string') {
        config.to = (config.to as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      // Convert port to number for email
      if (formData.type === 'EMAIL' && config.port) {
        config.port = parseInt(config.port as string);
      }
      return notificationApi.createChannel({ ...formData, config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No channel selected');
      const config = { ...formData.config };
      if (formData.type === 'EMAIL' && typeof config.to === 'string') {
        config.to = (config.to as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (formData.type === 'EMAIL' && config.port) {
        config.port = parseInt(config.port as string);
      }
      return notificationApi.updateChannel(editingId, { ...formData, config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationApi.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      notificationApi.updateChannel(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
    },
  });

  function resetForm() {
    setShowCreate(false);
    setEditingId(null);
    setFormData({ name: '', type: 'SLACK', config: {}, enabled: true });
  }

  function startEdit(channel: NotificationChannel) {
    const config = { ...channel.config };
    // Convert 'to' array back to string for email editing
    if (channel.type === 'EMAIL' && Array.isArray(config.to)) {
      config.to = (config.to as string[]).join(', ');
    }
    setFormData({
      name: channel.name,
      type: channel.type,
      config,
      enabled: channel.enabled,
    });
    setEditingId(channel.id);
    setShowCreate(true);
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResult(null);
    try {
      await notificationApi.testChannel(id);
      setTestResult({ id, success: true, message: 'Test sent!' });
    } catch (err: any) {
      setTestResult({ id, success: false, message: err.response?.data?.error || err.message });
    } finally {
      setTestingId(null);
      queryClient.invalidateQueries({ queryKey: ['notificationLogs'] });
    }
  }

  const channelList = channels as NotificationChannel[] | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Delivery"
        title="Notification channels"
        description="Configure how alerts and reports are delivered across chat, email, webhooks, and paging systems."
      >
        <Link href="/settings">
          <Button variant="outline">Back to Settings</Button>
        </Link>
        <Button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
        >
          + Add Channel
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Channels" value={channelList?.length || 0} tone="primary" />
        <SummaryStat
          label="Form Mode"
          value={editingId ? 'Editing' : showCreate ? 'Creating' : 'Idle'}
        />
        <SummaryStat label="Recent Logs" value={(logs as any[] | undefined)?.length || 0} />
      </div>

      {/* Create / Edit Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Channel' : 'New Notification Channel'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name
                  </label>
                  <Input
                    placeholder="My Slack Channel"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Type
                  </label>
                  <Select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, type: e.target.value, config: {} }))
                    }
                  >
                    {CHANNEL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  {TYPE_LABELS[formData.type]} Configuration
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {CONFIG_FIELDS[formData.type]?.map((field) => (
                    <div
                      key={field.key}
                      className={
                        field.type === 'checkbox' ? 'flex items-center gap-2 col-span-2' : ''
                      }
                    >
                      {field.type === 'checkbox' ? (
                        <>
                          <input
                            type="checkbox"
                            checked={!!formData.config[field.key]}
                            onChange={(e) =>
                              setFormData((d) => ({
                                ...d,
                                config: { ...d.config, [field.key]: e.target.checked },
                              }))
                            }
                            className="rounded border-border"
                          />
                          <label className="text-sm text-muted-foreground">{field.label}</label>
                        </>
                      ) : (
                        <>
                          <label className="text-sm font-medium text-muted-foreground mb-1 block">
                            {field.label}{' '}
                            {field.required && <span className="text-red-400">*</span>}
                          </label>
                          <Input
                            type={field.type || 'text'}
                            placeholder={field.placeholder}
                            value={(formData.config[field.key] as string) || ''}
                            onChange={(e) =>
                              setFormData((d) => ({
                                ...d,
                                config: { ...d.config, [field.key]: e.target.value },
                              }))
                            }
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={createMutation.isPending || updateMutation.isPending || !formData.name}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingId
                      ? 'Update'
                      : 'Create'}
                </Button>
                <Button variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !channelList?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg mb-2">No notification channels configured</p>
            <p className="text-sm">
              Add a channel to start receiving alert notifications via Slack, Email, Discord, etc.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {channelList.map((channel) => (
            <Card key={channel.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-2 h-2 rounded-full ${channel.enabled ? 'bg-green-500' : 'bg-gray-500'}`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{channel.name}</span>
                        <Badge variant={channel.enabled ? 'default' : 'secondary'}>
                          {TYPE_LABELS[channel.type]}
                        </Badge>
                        {!channel.enabled && <Badge variant="secondary">Disabled</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {channel._count?.logs || 0} notifications sent
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {testResult?.id === channel.id && (
                      <span
                        className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {testResult.message}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(channel.id)}
                      disabled={testingId === channel.id}
                    >
                      {testingId === channel.id ? 'Sending...' : 'Test'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toggleMutation.mutate({ id: channel.id, enabled: !channel.enabled })
                      }
                    >
                      {channel.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(channel)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      onClick={() => {
                        if (confirm(`Delete channel "${channel.name}"?`)) {
                          deleteMutation.mutate(channel.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Notification Logs */}
      {(logs as any[])?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Delivery Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Channel</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs as any[]).map((log: any) => (
                    <tr key={log.id} className="border-b border-border">
                      <td className="py-2 text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-2">
                        {log.channel?.name || 'Unknown'} ({log.channel?.type})
                      </td>
                      <td className="py-2">
                        <Badge variant={log.status === 'SUCCESS' ? 'default' : 'destructive'}>
                          {log.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground max-w-xs truncate">
                        {log.message || '-'}
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
