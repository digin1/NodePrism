'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { serverApi } from '@/lib/api';

export default function NewServerPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    hostname: '',
    ipAddress: '',
    sshPort: 22,
    sshUsername: 'root',
    environment: 'PRODUCTION',
    region: '',
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: () => serverApi.create(formData),
    onSuccess: (res) => {
      router.push(`/servers/${res.data.data.id}`);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to create server');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    createMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Add New Server</h2>
        <p className="text-muted-foreground">Register a server for monitoring</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Details</CardTitle>
          <CardDescription>
            Enter the connection details for the server you want to monitor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hostname *</label>
                <Input
                  value={formData.hostname}
                  onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                  placeholder="web-server-01"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">IP Address *</label>
                <Input
                  value={formData.ipAddress}
                  onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                  placeholder="192.168.1.100"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">SSH Port</label>
                <Input
                  type="number"
                  value={formData.sshPort}
                  onChange={(e) => setFormData({ ...formData, sshPort: parseInt(e.target.value) || 22 })}
                  placeholder="22"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">SSH Username</label>
                <Input
                  value={formData.sshUsername}
                  onChange={(e) => setFormData({ ...formData, sshUsername: e.target.value })}
                  placeholder="root"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Environment</label>
                <Select
                  value={formData.environment}
                  onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                >
                  <option value="PRODUCTION">Production</option>
                  <option value="STAGING">Staging</option>
                  <option value="DEVELOPMENT">Development</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Region</label>
                <Input
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  placeholder="us-east-1"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Server'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
