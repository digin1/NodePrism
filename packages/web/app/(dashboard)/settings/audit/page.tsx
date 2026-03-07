'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { auditApi, AuditLogEntry } from '@/lib/api';

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'server', label: 'Servers' },
  { value: 'server_group', label: 'Server Groups' },
  { value: 'alert_rule', label: 'Alert Rules' },
  { value: 'alert_template', label: 'Alert Templates' },
  { value: 'alert', label: 'Alerts' },
  { value: 'notification_channel', label: 'Notification Channels' },
  { value: 'settings', label: 'Settings' },
  { value: 'user', label: 'Users' },
];

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/20 text-green-400',
  update: 'bg-blue-500/20 text-blue-400',
  delete: 'bg-red-500/20 text-red-400',
  login: 'bg-purple-500/20 text-purple-400',
  register: 'bg-purple-500/20 text-purple-400',
  acknowledge: 'bg-yellow-500/20 text-yellow-400',
  silence: 'bg-yellow-500/20 text-yellow-400',
};

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return color;
  }
  return 'bg-muted text-muted-foreground';
}

function formatAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return '';
  const entries = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined)
    .slice(0, 4);
  return entries.map(([k, v]) => {
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `${k}: ${val.length > 50 ? val.substring(0, 50) + '...' : val}`;
  }).join(', ');
}

export default function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: stats } = useQuery({
    queryKey: ['auditStats'],
    queryFn: () => auditApi.stats(),
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['auditLogs', entityType, page],
    queryFn: () => auditApi.list({
      ...(entityType && { entityType }),
      limit: pageSize,
      offset: page * pageSize,
    }),
  });

  const logList = logs as AuditLogEntry[] | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-sm text-muted-foreground">Track all changes made to the system</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Total Events</p>
              <p className="text-2xl font-bold">{(stats as any).total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Last 24 Hours</p>
              <p className="text-2xl font-bold">{(stats as any).last24h}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Top Action</p>
              <p className="text-2xl font-bold">
                {(stats as any).byAction?.[0]?.action
                  ? formatAction((stats as any).byAction[0].action)
                  : 'None'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-4 items-center">
        <label className="text-sm text-muted-foreground">Filter by type:</label>
        <Select
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(0); }}
          className="w-48"
        >
          {ENTITY_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </div>

      {/* Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : !logList?.length ? (
            <p className="text-center text-muted-foreground py-8">No audit events found</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">User</th>
                      <th className="pb-2 pr-4">Action</th>
                      <th className="pb-2 pr-4">Entity</th>
                      <th className="pb-2 pr-4">Details</th>
                      <th className="pb-2">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logList.map((log) => (
                      <tr key={log.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {log.user?.name || log.user?.email || 'System'}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-foreground whitespace-nowrap">
                          {log.entityType}
                          {log.entityId && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              {log.entityId.substring(0, 8)}...
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground max-w-xs truncate">
                          {formatDetails(log.details)}
                        </td>
                        <td className="py-2.5 text-muted-foreground text-xs">
                          {log.ipAddress || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={(logList?.length || 0) < pageSize}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
