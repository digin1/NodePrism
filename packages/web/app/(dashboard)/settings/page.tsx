'use client';


import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { healthApi, metricsApi, settingsApi, SystemSettings } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface DependencyHealth {
  status: string;
  responseTime: number;
  error?: string;
}

interface Health {
  status: string;
  uptime?: number;
  responseTime?: number;
  dependencies?: {
    database?: DependencyHealth;
    redis?: DependencyHealth;
    prometheus?: DependencyHealth;
  };
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === 'ADMIN';

  const [systemName, setSystemName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD HH:mm:ss');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importMode, setImportMode] = useState<'skip' | 'overwrite'>('skip');
  const importFileRef = useRef<HTMLInputElement>(null);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check(),
  });

  const { data: targets } = useQuery({
    queryKey: ['targets'],
    queryFn: () => metricsApi.targets(),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  // Update state when settings data changes
  useEffect(() => {
    if (settings) {
      setSystemName(settings.systemName || 'NodePrism');
      setPrimaryColor(settings.primaryColor || '#3B82F6');
      setTimezone(settings.timezone || 'UTC');
      setDateFormat(settings.dateFormat || 'YYYY-MM-DD HH:mm:ss');
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<SystemSettings>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setMessage({ type: 'success', text: 'Logo uploaded successfully' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to upload logo' });
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => settingsApi.deleteLogo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setMessage({ type: 'success', text: 'Logo deleted successfully' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to delete logo' });
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const handleSaveSettings = async () => {
    setSaving(true);
    await updateSettingsMutation.mutateAsync({ systemName, primaryColor, timezone, dateFormat });
    setSaving(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadLogoMutation.mutateAsync(file);
    }
  };

  const healthData = health as Health | undefined;

  const depStatus = (dep?: DependencyHealth) =>
    dep ? (dep.status === 'ok' ? 'running' : 'down') : 'unknown';

  const depDetail = (dep?: DependencyHealth) =>
    dep ? `${dep.responseTime}ms` : undefined;

  const services = [
    { name: 'API Gateway', port: 4000, status: healthData?.status === 'ok' || healthData?.status === 'degraded' ? 'running' : 'unknown', detail: healthData?.responseTime ? `${healthData.responseTime}ms` : undefined },
    { name: 'PostgreSQL', port: 5432, status: depStatus(healthData?.dependencies?.database), detail: depDetail(healthData?.dependencies?.database) },
    { name: 'Redis', port: 6379, status: depStatus(healthData?.dependencies?.redis), detail: depDetail(healthData?.dependencies?.redis) },
    { name: 'Prometheus', port: 9090, status: depStatus(healthData?.dependencies?.prometheus), detail: depDetail(healthData?.dependencies?.prometheus) },
    { name: 'Grafana', port: 3030, status: 'running' },
    { name: 'AlertManager', port: 9093, status: 'running' },
    { name: 'Loki', port: 3100, status: 'running' },
    { name: 'Pushgateway', port: 9091, status: 'running' },
  ];

  // Get logo URL - local paths are proxied via Next.js rewrites
  const logoUrl = settings?.logoUrl || null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground">System configuration and branding</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-500/10 dark:bg-green-500/20 text-green-800 dark:text-green-300' : 'bg-red-500/10 dark:bg-red-500/20 text-red-800 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* System Branding - Admin Only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>System Branding</CardTitle>
            <CardDescription>Customize the look and feel of your NodePrism instance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Logo</label>
              <div className="flex items-center gap-4">
                <div className="rounded-lg flex items-center justify-center bg-white overflow-hidden py-2 px-4" style={{ minHeight: '80px' }}>
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      style={{ height: '70px', width: 'auto', maxWidth: '200px' }}
                    />
                  ) : (
                    <span className="text-4xl font-bold" style={{ color: primaryColor }}>
                      {systemName?.charAt(0) || 'N'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadLogoMutation.isPending}
                  >
                    {uploadLogoMutation.isPending ? 'Uploading...' : 'Upload Logo'}
                  </Button>
                  {logoUrl && (
                    <Button
                      variant="outline"
                      onClick={() => deleteLogoMutation.mutate()}
                      disabled={deleteLogoMutation.isPending}
                      className="text-red-600 hover:text-red-700"
                    >
                      {deleteLogoMutation.isPending ? 'Deleting...' : 'Remove'}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Recommended: Square image, PNG or SVG, max 5MB
              </p>
            </div>

            {/* System Name */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">System Name</label>
              <input
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                className="w-full max-w-md px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="NodePrism"
              />
              <p className="text-xs text-muted-foreground mt-2">
                This name will be displayed in the navbar and login page
              </p>
            </div>

            {/* Primary Color */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-32 px-3 py-2 border rounded-lg font-mono text-sm"
                  placeholder="#3B82F6"
                />
              </div>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Timezone</label>
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {[
                  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
                  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Europe/Istanbul',
                  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore',
                  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Africa/Cairo', 'Africa/Johannesburg',
                ].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Used for displaying timestamps throughout the application
              </p>
            </div>

            {/* Date Format */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Date Format</label>
              <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                {[
                  { value: 'YYYY-MM-DD HH:mm:ss', label: 'YYYY-MM-DD HH:mm:ss (2026-03-07 14:30:00)' },
                  { value: 'DD/MM/YYYY HH:mm:ss', label: 'DD/MM/YYYY HH:mm:ss (07/03/2026 14:30:00)' },
                  { value: 'MM/DD/YYYY HH:mm:ss', label: 'MM/DD/YYYY HH:mm:ss (03/07/2026 14:30:00)' },
                  { value: 'DD-MM-YYYY HH:mm:ss', label: 'DD-MM-YYYY HH:mm:ss (07-03-2026 14:30:00)' },
                  { value: 'YYYY/MM/DD HH:mm:ss', label: 'YYYY/MM/DD HH:mm:ss (2026/03/07 14:30:00)' },
                  { value: 'MMM DD, YYYY HH:mm', label: 'MMM DD, YYYY HH:mm (Mar 07, 2026 14:30)' },
                  { value: 'DD MMM YYYY HH:mm', label: 'DD MMM YYYY HH:mm (07 Mar 2026 14:30)' },
                ].map((fmt) => (
                  <option key={fmt.value} value={fmt.value}>{fmt.label}</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Format used when displaying dates and times
              </p>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Manager System Info */}
      <Card>
        <CardHeader>
          <CardTitle>Manager System</CardTitle>
          <CardDescription>Information about the NodePrism manager server</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Hostname</dt>
              <dd className="font-mono text-sm">{settings?.managerHostname || 'Loading...'}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">IP Address</dt>
              <dd className="font-mono text-sm">{settings?.managerIp || 'Loading...'}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="font-mono text-sm">{settings?.timezone || 'UTC'}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Date Format</dt>
              <dd className="font-mono text-sm">{settings?.dateFormat || 'YYYY-MM-DD HH:mm:ss'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* User Management */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage users, roles, and access permissions</CardDescription>
              </div>
              <a href="/settings/users">
                <Button>Manage Users</Button>
              </a>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Notification Channels */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Notification Channels</CardTitle>
                <CardDescription>Configure where alerts are delivered (Email, Slack, Discord, etc.)</CardDescription>
              </div>
              <a href="/settings/notifications">
                <Button>Manage Channels</Button>
              </a>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Audit Log */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Track all changes made by users across the system</CardDescription>
              </div>
              <a href="/settings/audit">
                <Button>View Audit Log</Button>
              </a>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Database Backup */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Database Backup</CardTitle>
                <CardDescription>Scheduled PostgreSQL backups with configurable retention</CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    setMessage({ type: 'success', text: 'Backup started...' });
                    await settingsApi.triggerBackup();
                    setMessage({ type: 'success', text: 'Database backup completed successfully' });
                    setTimeout(() => setMessage(null), 5000);
                  } catch {
                    setMessage({ type: 'error', text: 'Backup failed. Check server logs.' });
                    setTimeout(() => setMessage(null), 3000);
                  }
                }}
              >
                Backup Now
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Config Export / Import */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration Export / Import</CardTitle>
            <CardDescription>
              Export or import alert rules, templates, dashboards, notification channels, and settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Export */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Export Configuration</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Download a JSON file containing all your alert rules, templates, dashboards, notification channels, and settings.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const data = await settingsApi.exportConfig();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `nodeprism-config-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setMessage({ type: 'success', text: 'Configuration exported successfully' });
                    setTimeout(() => setMessage(null), 3000);
                  } catch {
                    setMessage({ type: 'error', text: 'Failed to export configuration' });
                    setTimeout(() => setMessage(null), 3000);
                  }
                }}
              >
                Export Config
              </Button>
            </div>

            {/* Import */}
            <div className="border-t pt-6">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Import Configuration</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Upload a previously exported JSON file to restore configuration.
              </p>
              <div className="flex items-center gap-4">
                <Select value={importMode} onChange={(e) => setImportMode(e.target.value as 'skip' | 'overwrite')}>
                  <option value="skip">Skip existing</option>
                  <option value="overwrite">Overwrite existing</option>
                </Select>
                <input
                  type="file"
                  ref={importFileRef}
                  accept="application/json,.json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const parsed = JSON.parse(text);
                      if (!parsed.version) {
                        setMessage({ type: 'error', text: 'Invalid config file: missing version field' });
                        setTimeout(() => setMessage(null), 3000);
                        return;
                      }
                      const result = await settingsApi.importConfig(parsed, importMode) as any;
                      const parts: string[] = [];
                      if (result.alertRules) parts.push(`${result.alertRules} alert rules`);
                      if (result.alertTemplates) parts.push(`${result.alertTemplates} templates`);
                      if (result.dashboards) parts.push(`${result.dashboards} dashboards`);
                      if (result.notificationChannels) parts.push(`${result.notificationChannels} channels`);
                      if (result.settings) parts.push('settings');
                      if (result.skipped) parts.push(`${result.skipped} skipped`);
                      setMessage({
                        type: 'success',
                        text: `Import complete: ${parts.length ? parts.join(', ') : 'no changes'}`,
                      });
                      queryClient.invalidateQueries();
                      setTimeout(() => setMessage(null), 5000);
                    } catch {
                      setMessage({ type: 'error', text: 'Failed to import configuration. Check file format.' });
                      setTimeout(() => setMessage(null), 3000);
                    }
                    // Reset input so the same file can be re-imported
                    if (importFileRef.current) importFileRef.current.value = '';
                  }}
                />
                <Button variant="outline" onClick={() => importFileRef.current?.click()}>
                  Import Config
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Overview of all running services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Port {service.port}
                    {service.detail && <span className="ml-2 text-xs">({service.detail})</span>}
                  </p>
                </div>
                <Badge variant={service.status === 'running' ? 'success' : service.status === 'down' ? 'danger' : 'secondary'}>
                  {service.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Info */}
      <Card>
        <CardHeader>
          <CardTitle>API Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">API URL</dt>
              <dd className="font-mono text-sm">{process.env.NEXT_PUBLIC_API_URL || '/api (proxied)'}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={healthData?.status === 'ok' ? 'success' : 'danger'}>
                  {healthData?.status || 'unknown'}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Uptime</dt>
              <dd className="font-mono text-sm">
                {healthData?.uptime ? `${Math.floor(healthData.uptime)}s` : 'N/A'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <a
              href={process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center text-orange-600 font-bold text-xl">
                G
              </div>
              <div>
                <p className="font-medium">Grafana</p>
                <p className="text-sm text-muted-foreground">{process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030'}</p>
                <p className="text-xs text-muted-foreground mt-1">Default credentials configured in .env</p>
              </div>
            </a>
            <a
              href={process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center text-red-600 font-bold text-xl">
                P
              </div>
              <div>
                <p className="font-medium">Prometheus</p>
                <p className="text-sm text-muted-foreground">{process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090'}</p>
              </div>
            </a>
            <a
              href={process.env.NEXT_PUBLIC_ALERTMANAGER_URL || 'http://localhost:9093'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-yellow-500/10 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 font-bold text-xl">
                A
              </div>
              <div>
                <p className="font-medium">AlertManager</p>
                <p className="text-sm text-muted-foreground">{process.env.NEXT_PUBLIC_ALERTMANAGER_URL || 'http://localhost:9093'}</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Environment */}
      <Card>
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
          <CardDescription>Key configuration values</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <pre>{`# External Service URLs (configured in .env)
NEXT_PUBLIC_GRAFANA_URL=${process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030'}
NEXT_PUBLIC_PROMETHEUS_URL=${process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090'}
NEXT_PUBLIC_ALERTMANAGER_URL=${process.env.NEXT_PUBLIC_ALERTMANAGER_URL || 'http://localhost:9093'}
NEXT_PUBLIC_DOCS_URL=${process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3080'}`}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
