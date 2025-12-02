'use client';


import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi } from '@/lib/api';

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  ONLINE: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
  OFFLINE: 'secondary',
  DEPLOYING: 'warning',
};

interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  status: string;
  environment: string;
  agents?: Array<{ id: string }>;
  _count?: { alerts: number };
}

export default function ServersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers', { search, status: statusFilter, environment: envFilter }],
    queryFn: () => serverApi.list({ search: search || undefined, status: statusFilter || undefined, environment: envFilter || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serverApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const deployMutation = useMutation({
    mutationFn: (id: string) => serverApi.deploy(id, ['NODE_EXPORTER']),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const serverList = servers as Server[] | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Servers</h2>
          <p className="text-muted-foreground">Manage your monitored servers</p>
        </div>
        <Link href="/servers/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Server
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by hostname or IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="ONLINE">Online</option>
              <option value="OFFLINE">Offline</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </Select>
            <Select value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}>
              <option value="">All Environments</option>
              <option value="PRODUCTION">Production</option>
              <option value="STAGING">Staging</option>
              <option value="DEVELOPMENT">Development</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Server List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isLoading ? 'Loading...' : `${serverList?.length || 0} Servers`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !serverList?.length ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No servers</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by adding a new server.</p>
              <div className="mt-6">
                <Link href="/servers/new">
                  <Button>Add Server</Button>
                </Link>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serverList?.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell>
                      <Link href={`/servers/${server.id}`} className="font-medium hover:underline">
                        {server.hostname}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{server.ipAddress}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[server.status] || 'secondary'}>
                        {server.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{server.environment}</Badge>
                    </TableCell>
                    <TableCell>{server.agents?.length || 0}</TableCell>
                    <TableCell>
                      {server._count?.alerts && server._count.alerts > 0 ? (
                        <Badge variant="danger">{server._count.alerts}</Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deployMutation.mutate(server.id)}
                          disabled={deployMutation.isPending || server.status === 'DEPLOYING'}
                        >
                          Deploy
                        </Button>
                        <Link href={`/servers/${server.id}`}>
                          <Button size="sm" variant="ghost">
                            View
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this server?')) {
                              deleteMutation.mutate(server.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
