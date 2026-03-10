'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { serverApi } from '@/lib/api';

export default function NewServerPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    hostname: '',
    ipAddress: '',
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

  const managerUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : 'http://<manager-ip>:4000';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Provision"
        title="Add new server"
        description="Register a new server, assign its environment, and prepare the agent installation workflow."
      >
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Environment" value={formData.environment} tone="primary" />
        <SummaryStat label="Region" value={formData.region || 'Not set'} />
        <SummaryStat label="Agent URL" value="Ready" tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Details</CardTitle>
          <CardDescription>
            Enter the hostname and IP address of the server you want to monitor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
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

      {/* Agent Install Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Next Step: Install Agent</CardTitle>
          <CardDescription>
            After creating the server, run this command on the target server to install the
            monitoring agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <pre>{`# Download and run the agent installer on the target server
curl -sO ${managerUrl}/agent/nodeprism-agent.sh
chmod +x nodeprism-agent.sh
sudo ./nodeprism-agent.sh install`}</pre>
          </div>
          <p className="text-sm text-muted-foreground">
            The agent script will guide you through selecting which exporters to install
            (node_exporter, mysql_exporter, etc.) and automatically register with this NodePrism
            instance.
          </p>
          <p className="text-sm text-muted-foreground">
            Alternatively, servers are auto-registered when agents connect — you can skip this form
            and just run the agent script directly on the target server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
