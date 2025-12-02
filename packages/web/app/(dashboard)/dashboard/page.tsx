'use client';


import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, alertApi, metricsApi } from '@/lib/api';

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: serverStats, isLoading: serversLoading } = useQuery({
    queryKey: ['serverStats'],
    queryFn: () => serverApi.stats(),
  });

  const { data: alertStats, isLoading: alertsLoading } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
  });

  const { data: targets, isLoading: targetsLoading } = useQuery({
    queryKey: ['targets'],
    queryFn: () => metricsApi.targets(),
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverApi.list(),
  });

  const isLoading = serversLoading || alertsLoading || targetsLoading;

  // Type assertions for the data
  const stats = serverStats as any;
  const alerts = alertStats as any;
  const targetsData = targets as any;
  const serverList = servers as any;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your monitoring infrastructure</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Total Servers"
              value={stats?.total || 0}
              subtitle={`${stats?.online || 0} online`}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
                  />
                </svg>
              }
            />
            <StatCard
              title="Active Alerts"
              value={alerts?.firing || 0}
              subtitle={`${alerts?.critical || 0} critical`}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              }
            />
            <StatCard
              title="Targets Up"
              value={targetsData?.summary?.up || 0}
              subtitle={`of ${targetsData?.summary?.total || 0} total`}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
            <StatCard
              title="Targets Down"
              value={targetsData?.summary?.down || 0}
              subtitle="Require attention"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
          </>
        )}
      </div>

      {/* Prometheus Targets */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prometheus Targets</CardTitle>
          </CardHeader>
          <CardContent>
            {targetsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {targetsData?.targets?.map((target: any) => (
                  <div
                    key={target.scrapeUrl}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{target.labels?.job}</p>
                      <p className="text-xs text-muted-foreground">{target.labels?.instance}</p>
                    </div>
                    <Badge variant={target.health === 'up' ? 'success' : 'danger'}>
                      {target.health}
                    </Badge>
                  </div>
                ))}
                {(!targetsData?.targets || targetsData.targets.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No targets configured
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Servers</CardTitle>
          </CardHeader>
          <CardContent>
            {serversLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {serverList?.slice(0, 5).map((server: any) => (
                  <div
                    key={server.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{server.hostname}</p>
                      <p className="text-xs text-muted-foreground">{server.ipAddress}</p>
                    </div>
                    <Badge
                      variant={
                        server.status === 'ONLINE'
                          ? 'success'
                          : server.status === 'WARNING'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {server.status}
                    </Badge>
                  </div>
                ))}
                {(!serverList || serverList.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No servers added yet
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="/servers/new"
              className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium">Add Server</p>
                <p className="text-sm text-muted-foreground">Register a new server</p>
              </div>
            </a>
            <a
              href={process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-orange-600 flex items-center justify-center text-white">
                <span className="font-bold">G</span>
              </div>
              <div>
                <p className="font-medium">Open Grafana</p>
                <p className="text-sm text-muted-foreground">View detailed dashboards</p>
              </div>
            </a>
            <a
              href="/alerts"
              className="flex items-center gap-3 p-4 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-red-600 flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium">Manage Alerts</p>
                <p className="text-sm text-muted-foreground">Configure alert rules</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
