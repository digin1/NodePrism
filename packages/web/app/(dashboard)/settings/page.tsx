'use client';


import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { healthApi, metricsApi, settingsApi, SystemSettings } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface Health {
  status: string;
  uptime?: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === 'ADMIN';

  const [systemName, setSystemName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    await updateSettingsMutation.mutateAsync({ systemName, primaryColor });
    setSaving(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadLogoMutation.mutateAsync(file);
    }
  };

  const healthData = health as Health | undefined;

  const services = [
    { name: 'API Gateway', port: 4000, status: healthData?.status === 'ok' ? 'running' : 'unknown' },
    { name: 'PostgreSQL', port: 5432, status: 'running' },
    { name: 'Redis', port: 6379, status: 'running' },
    { name: 'Prometheus', port: 9090, status: targets ? 'running' : 'unknown' },
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
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-muted-foreground">System configuration and branding</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">System Name</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
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

            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Branding Settings'}
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
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">Port {service.port}</p>
                </div>
                <Badge variant={service.status === 'running' ? 'success' : 'secondary'}>
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
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xl">
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
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold text-xl">
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
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold text-xl">
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
