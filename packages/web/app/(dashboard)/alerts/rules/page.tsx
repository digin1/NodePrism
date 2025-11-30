'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { alertApi } from '@/lib/api';

interface AlertRule {
  id: string;
  name: string;
  description?: string;
  query: string;
  duration: string;
  severity: string;
  enabled: boolean;
  _count?: { alerts: number };
}

export default function AlertRulesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    query: string;
    duration: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'DEBUG';
    enabled: boolean;
  }>({
    name: '',
    description: '',
    query: '',
    duration: '5m',
    severity: 'WARNING',
    enabled: true,
  });

  const { data: rules, isLoading } = useQuery({
    queryKey: ['alertRules'],
    queryFn: () => alertApi.rules(),
  });

  const createMutation = useMutation({
    mutationFn: () => alertApi.createRule(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      setShowCreate(false);
      setFormData({
        name: '',
        description: '',
        query: '',
        duration: '5m',
        severity: 'WARNING',
        enabled: true,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
    },
  });

  const ruleList = rules as AlertRule[] | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/alerts">
            <Button variant="ghost" size="icon">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Alert Rules</h2>
            <p className="text-muted-foreground">Configure alerting conditions</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : 'Create Rule'}
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Alert Rule</CardTitle>
            <CardDescription>Define a new alerting condition using PromQL</CardDescription>
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
                  <label className="text-sm font-medium">Rule Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="High CPU Usage"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Severity</label>
                  <Select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value as 'CRITICAL' | 'WARNING' | 'INFO' | 'DEBUG' })}
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                    <option value="DEBUG">Debug</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">PromQL Query *</label>
                <Input
                  value={formData.query}
                  onChange={(e) => setFormData({ ...formData, query: e.target.value })}
                  placeholder='100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90'
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enter a PromQL expression that returns true when the alert should fire
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Duration</label>
                  <Select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  >
                    <option value="1m">1 minute</option>
                    <option value="5m">5 minutes</option>
                    <option value="10m">10 minutes</option>
                    <option value="15m">15 minutes</option>
                    <option value="30m">30 minutes</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Alert when CPU usage exceeds 90%"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Rule'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isLoading ? 'Loading...' : `${ruleList?.length || 0} Rules`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !ruleList?.length ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No alert rules</h3>
              <p className="mt-1 text-sm text-gray-500">Create your first alert rule to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ruleList?.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-start justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{rule.name}</h4>
                      <Badge
                        variant={
                          rule.severity === 'CRITICAL'
                            ? 'danger'
                            : rule.severity === 'WARNING'
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {rule.severity}
                      </Badge>
                      {!rule.enabled && <Badge variant="outline">Disabled</Badge>}
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                    )}
                    <p className="text-xs font-mono text-muted-foreground mt-2 bg-gray-100 p-2 rounded">
                      {rule.query}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Duration: {rule.duration}</span>
                      {rule._count?.alerts && rule._count.alerts > 0 && (
                        <span className="text-red-600">{rule._count.alerts} firing</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this rule?')) {
                        deleteMutation.mutate(rule.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Common Rules Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Common Alert Templates</CardTitle>
          <CardDescription>Quick-start templates for common alerting scenarios</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                name: 'High CPU Usage',
                query: '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90',
                severity: 'WARNING' as const,
              },
              {
                name: 'High Memory Usage',
                query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90',
                severity: 'WARNING' as const,
              },
              {
                name: 'Disk Almost Full',
                query: '(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100 > 85',
                severity: 'CRITICAL' as const,
              },
              {
                name: 'Instance Down',
                query: 'up == 0',
                severity: 'CRITICAL' as const,
              },
            ].map((template) => (
              <button
                key={template.name}
                onClick={() => {
                  setFormData({
                    ...formData,
                    name: template.name,
                    query: template.query,
                    severity: template.severity,
                  });
                  setShowCreate(true);
                }}
                className="text-left p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium">{template.name}</p>
                <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                  {template.query}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
