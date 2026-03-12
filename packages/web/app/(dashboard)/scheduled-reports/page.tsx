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
import { scheduledReportApi, notificationApi } from '@/lib/api';

interface ScheduledReport {
  id: string;
  name: string;
  type: string;
  schedule: string;
  recipients: { emails: string[]; channelIds: string[] };
  enabled: boolean;
  lastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NotificationChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

const reportTypes = [
  { value: 'DAILY_SUMMARY', label: 'Daily Summary' },
  { value: 'WEEKLY_SLA', label: 'Weekly SLA' },
  { value: 'MONTHLY_UPTIME', label: 'Monthly Uptime' },
];

const defaultForm = {
  name: '',
  type: 'DAILY_SUMMARY',
  schedule: 'daily:08:00',
  emails: '',
  channelIds: [] as string[],
  enabled: true,
};

export default function ScheduledReportsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);

  const { data: reports, isLoading } = useQuery({
    queryKey: ['scheduledReports'],
    queryFn: () => scheduledReportApi.list(),
  });

  const { data: channels } = useQuery({
    queryKey: ['notificationChannels'],
    queryFn: () => notificationApi.listChannels(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      scheduledReportApi.create({
        name: formData.name,
        type: formData.type,
        schedule: formData.schedule,
        recipients: {
          emails: formData.emails.split(',').map((e) => e.trim()).filter(Boolean),
          channelIds: formData.channelIds,
        },
        enabled: formData.enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No report selected');
      return scheduledReportApi.update(editingId, {
        name: formData.name,
        type: formData.type,
        schedule: formData.schedule,
        recipients: {
          emails: formData.emails.split(',').map((e) => e.trim()).filter(Boolean),
          channelIds: formData.channelIds,
        },
        enabled: formData.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scheduledReportApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduledReports'] }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => scheduledReportApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduledReports'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(report: ScheduledReport) {
    const recipients = report.recipients || { emails: [], channelIds: [] };
    setFormData({
      name: report.name,
      type: report.type,
      schedule: report.schedule,
      emails: (recipients.emails || []).join(', '),
      channelIds: recipients.channelIds || [],
      enabled: report.enabled,
    });
    setEditingId(report.id);
    setShowForm(true);
  }

  function toggleChannel(channelId: string) {
    setFormData((d) => ({
      ...d,
      channelIds: d.channelIds.includes(channelId)
        ? d.channelIds.filter((id) => id !== channelId)
        : [...d.channelIds, channelId],
    }));
  }

  const reportList = reports as ScheduledReport[] | undefined;
  const channelList = channels as NotificationChannel[] | undefined;
  const enabledCount = useMemo(() => reportList?.filter((r) => r.enabled).length || 0, [reportList]);

  function typeLabel(type: string): string {
    return reportTypes.find((t) => t.value === type)?.label || type;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Scheduled Reports"
        description="Configure automated reports sent via email or notification channels."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Report
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Reports" value={reportList?.length || 0} tone="primary" />
        <SummaryStat label="Enabled" value={enabledCount} tone="success" />
        <SummaryStat
          label="Report Types"
          value={new Set(reportList?.map((r) => r.type)).size || 0}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Report' : 'New Scheduled Report'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="Daily Infrastructure Report"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Report Type <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={formData.type}
                    onChange={(e) => setFormData((d) => ({ ...d, type: e.target.value }))}
                  >
                    {reportTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Schedule <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="daily:08:00 or weekly:mon:09:00"
                    value={formData.schedule}
                    onChange={(e) => setFormData((d) => ({ ...d, schedule: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Format: daily:HH:MM or weekly:day:HH:MM
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Email Recipients
                  </label>
                  <Input
                    placeholder="admin@example.com, ops@example.com"
                    value={formData.emails}
                    onChange={(e) => setFormData((d) => ({ ...d, emails: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Comma-separated email addresses
                  </p>
                </div>
              </div>

              {channelList && channelList.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Notification Channels
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {channelList.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => toggleChannel(channel.id)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          formData.channelIds.includes(channel.id)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {channel.name} ({channel.type})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData((d) => ({ ...d, enabled: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Enabled</span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    !formData.name || !formData.schedule
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
      ) : !reportList?.length ? (
        <EmptyState
          title="No scheduled reports"
          description="Create automated reports to track infrastructure health over time."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Schedule</th>
                    <th className="px-4 py-3 font-medium">Last Sent</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reportList.map((report) => (
                    <tr key={report.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{report.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{typeLabel(report.type)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{report.schedule}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {report.lastSentAt
                          ? new Date(report.lastSentAt).toLocaleString()
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={report.enabled ? 'success' : 'secondary'}>
                          {report.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => sendMutation.mutate(report.id)}
                            disabled={sendMutation.isPending}
                          >
                            Send
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(report)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete report "${report.name}"?`)) deleteMutation.mutate(report.id);
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
