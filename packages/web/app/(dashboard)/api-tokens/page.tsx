'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { apiTokenApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface ApiToken {
  id: string;
  name: string;
  permissions: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
}

const AVAILABLE_PERMISSIONS = [
  { value: 'servers:read', label: 'Servers (Read)' },
  { value: 'servers:write', label: 'Servers (Write)' },
  { value: 'alerts:read', label: 'Alerts (Read)' },
  { value: 'alerts:write', label: 'Alerts (Write)' },
  { value: 'metrics:read', label: 'Metrics (Read)' },
  { value: 'incidents:read', label: 'Incidents (Read)' },
  { value: 'incidents:write', label: 'Incidents (Write)' },
  { value: 'settings:read', label: 'Settings (Read)' },
  { value: 'settings:write', label: 'Settings (Write)' },
];

function getTokenStatus(token: ApiToken): 'active' | 'revoked' | 'expired' {
  if (token.revoked) return 'revoked';
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return 'expired';
  return 'active';
}

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning'> = {
  active: 'success',
  revoked: 'danger',
  expired: 'warning',
};

export default function ApiTokensPage() {
  const { formatDateOnly } = useFormatDate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    expiresAt: '',
    permissions: [] as string[],
  });

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['apiTokens'],
    queryFn: () => apiTokenApi.list(),
  });

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiTokenApi.create({
        name: formData.name,
        expiresAt: formData.expiresAt || undefined,
        permissions: formData.permissions.length > 0 ? formData.permissions : undefined,
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
      setCreatedToken(data.token || null);
      setShowCreate(false);
      setFormData({ name: '', expiresAt: '', permissions: [] });
      showMessage('success', 'Token created successfully');
    },
    onError: (err: any) => {
      showMessage('error', err.response?.data?.error || 'Failed to create token');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiTokenApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
      showMessage('success', 'Token revoked');
    },
    onError: () => showMessage('error', 'Failed to revoke token'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiTokenApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
      showMessage('success', 'Token deleted');
    },
    onError: () => showMessage('error', 'Failed to delete token'),
  });

  const togglePermission = (perm: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tokenList = tokens as ApiToken[] | undefined;
  const activeCount = useMemo(() => tokenList?.filter((t) => getTokenStatus(t) === 'active').length || 0, [tokenList]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="API Tokens"
        description="Create and manage API tokens for programmatic access to the monitoring platform."
      >
        <Button
          onClick={() => {
            setShowCreate(!showCreate);
            setCreatedToken(null);
          }}
        >
          {showCreate ? 'Cancel' : '+ Generate Token'}
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryStat label="Total Tokens" value={tokenList?.length || 0} tone="primary" />
        <SummaryStat label="Active" value={activeCount} tone="success" />
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-500/10 dark:bg-green-500/20 text-green-800 dark:text-green-300' : 'bg-red-500/10 dark:bg-red-500/20 text-red-800 dark:text-red-300'}`}
        >
          {message.text}
        </div>
      )}

      {/* Show newly created token -- one-time display */}
      {createdToken && (
        <Card className="border-emerald-500/30">
          <CardContent className="py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-emerald-400">
                  Token created -- copy it now. It will not be shown again.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-sm font-mono text-foreground break-all">
                  {createdToken}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(createdToken)}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setCreatedToken(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Token Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Generate New Token</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="CI/CD Pipeline Token"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Expires At</label>
                  <Input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Permissions</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {AVAILABLE_PERMISSIONS.map((perm) => (
                    <label
                      key={perm.value}
                      className="flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(perm.value)}
                        onChange={() => togglePermission(perm.value)}
                        className="rounded border-border"
                      />
                      <span className="text-sm text-foreground">{perm.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty to grant all permissions.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={createMutation.isPending || !formData.name}>
                  {createMutation.isPending ? 'Generating...' : 'Generate Token'}
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Token List */}
      {isLoading ? (
        <LoadingState rows={4} rowClassName="h-16" />
      ) : !tokenList?.length ? (
        <EmptyState
          title="No API tokens"
          description="Generate an API token to enable programmatic access to the monitoring platform."
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {tokenList.length} Token{tokenList.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Token</th>
                    <th className="px-6 py-3 font-medium">Permissions</th>
                    <th className="px-6 py-3 font-medium">Created</th>
                    <th className="px-6 py-3 font-medium">Expires</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenList.map((token) => {
                    const status = getTokenStatus(token);
                    const permissions = Array.isArray(token.permissions) ? token.permissions : [];
                    return (
                      <tr
                        key={token.id}
                        className="border-b border-border/40 hover:bg-accent/30 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-foreground">{token.name}</td>
                        <td className="px-6 py-4">
                          <code className="text-xs font-mono text-muted-foreground">
                            np_••••••••
                          </code>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {permissions.length ? (
                              permissions.map((perm: string) => (
                                <Badge key={perm} variant="secondary" className="text-[10px]">
                                  {perm}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="default" className="text-[10px]">all</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {formatDateOnly(token.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {token.expiresAt ? formatDateOnly(token.expiresAt) : 'Never'}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {status === 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Revoke token "${token.name}"? This cannot be undone.`)) {
                                    revokeMutation.mutate(token.id);
                                  }
                                }}
                                disabled={revokeMutation.isPending}
                              >
                                Revoke
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                              onClick={() => {
                                if (confirm(`Delete token "${token.name}"? This cannot be undone.`)) {
                                  deleteMutation.mutate(token.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
