'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { rumApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface RumStats {
  avgLcp: number | null;
  avgFid: number | null;
  avgCls: number | null;
  avgLoadTime: number | null;
  p50LoadTime: number | null;
  p95LoadTime: number | null;
  totalPageViews: number;
  errorRate: number;
  sessionCount: number;
  topPages: { url: string; views: number; avgLoadTime: number | null }[];
}

interface RumSession {
  id: string;
  sessionId: string;
  userAgent: string | null;
  country: string | null;
  startedAt: string;
  _count: { pageViews: number };
}

function getVitalRating(metric: string, value: number | null): { label: string; variant: 'success' | 'warning' | 'danger' } {
  if (value === null) return { label: 'N/A', variant: 'success' as const };

  switch (metric) {
    case 'LCP':
      if (value <= 2500) return { label: 'Good', variant: 'success' };
      if (value <= 4000) return { label: 'Needs Improvement', variant: 'warning' };
      return { label: 'Poor', variant: 'danger' };
    case 'FID':
      if (value <= 100) return { label: 'Good', variant: 'success' };
      if (value <= 300) return { label: 'Needs Improvement', variant: 'warning' };
      return { label: 'Poor', variant: 'danger' };
    case 'CLS':
      if (value <= 0.1) return { label: 'Good', variant: 'success' };
      if (value <= 0.25) return { label: 'Needs Improvement', variant: 'warning' };
      return { label: 'Poor', variant: 'danger' };
    default:
      return { label: 'N/A', variant: 'success' };
  }
}

function parseBrowser(ua: string | null): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Other';
}

export default function RumPage() {
  const { formatDateTime } = useFormatDate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['rum-stats'],
    queryFn: () => rumApi.stats(),
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['rum-sessions'],
    queryFn: () => rumApi.sessions(),
  });

  const rumStats = stats as RumStats | undefined;
  const sessionList = sessions as RumSession[] | undefined;

  const lcpRating = getVitalRating('LCP', rumStats?.avgLcp ?? null);
  const fidRating = getVitalRating('FID', rumStats?.avgFid ?? null);
  const clsRating = getVitalRating('CLS', rumStats?.avgCls ?? null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance"
        title="Real User Monitoring"
        description="Monitor real user experience with Core Web Vitals, page load times, and session analytics."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryStat
          label="Total Page Views"
          value={rumStats?.totalPageViews || 0}
          tone="primary"
        />
        <SummaryStat label="Sessions" value={rumStats?.sessionCount || 0} />
        <SummaryStat
          label="Error Rate"
          value={rumStats?.errorRate != null ? `${rumStats.errorRate}%` : '-'}
          tone={rumStats?.errorRate && rumStats.errorRate > 5 ? 'danger' : 'default'}
        />
        <SummaryStat
          label="Avg Load Time"
          value={rumStats?.avgLoadTime != null ? `${rumStats.avgLoadTime}ms` : '-'}
        />
      </div>

      {/* Web Vitals Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Largest Contentful Paint (LCP)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">
                  {rumStats?.avgLcp != null ? `${rumStats.avgLcp}ms` : '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Target: &le; 2500ms</p>
              </div>
              <Badge variant={lcpRating.variant}>{lcpRating.label}</Badge>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  lcpRating.variant === 'success'
                    ? 'bg-green-500'
                    : lcpRating.variant === 'warning'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{
                  width: `${Math.min(((rumStats?.avgLcp || 0) / 5000) * 100, 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              First Input Delay (FID)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">
                  {rumStats?.avgFid != null ? `${rumStats.avgFid}ms` : '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Target: &le; 100ms</p>
              </div>
              <Badge variant={fidRating.variant}>{fidRating.label}</Badge>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  fidRating.variant === 'success'
                    ? 'bg-green-500'
                    : fidRating.variant === 'warning'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{
                  width: `${Math.min(((rumStats?.avgFid || 0) / 500) * 100, 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cumulative Layout Shift (CLS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">
                  {rumStats?.avgCls != null ? rumStats.avgCls.toFixed(3) : '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Target: &le; 0.1</p>
              </div>
              <Badge variant={clsRating.variant}>{clsRating.label}</Badge>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  clsRating.variant === 'success'
                    ? 'bg-green-500'
                    : clsRating.variant === 'warning'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{
                  width: `${Math.min(((rumStats?.avgCls || 0) / 0.5) * 100, 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Load Time Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Load Time Percentiles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold font-mono">
                {rumStats?.p50LoadTime != null ? `${rumStats.p50LoadTime}ms` : '-'}
              </p>
              <p className="text-sm text-muted-foreground">P50 (Median)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono">
                {rumStats?.p95LoadTime != null ? `${rumStats.p95LoadTime}ms` : '-'}
              </p>
              <p className="text-sm text-muted-foreground">P95</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Pages */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Top Pages by Views</CardTitle>
          </CardHeader>
          <CardContent>
            {!rumStats?.topPages?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No page data available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">URL</th>
                      <th className="pb-2 pr-4 font-medium text-right">Views</th>
                      <th className="pb-2 font-medium text-right">Avg Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rumStats.topPages.map((page) => (
                      <tr key={page.url} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono text-xs truncate max-w-[200px]">
                          {page.url}
                        </td>
                        <td className="py-2 pr-4 text-right">{page.views}</td>
                        <td className="py-2 text-right font-mono text-xs">
                          {page.avgLoadTime != null ? `${page.avgLoadTime}ms` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <LoadingState rows={5} rowClassName="h-10" />
            ) : !sessionList?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No sessions recorded</p>
            ) : (
              <div className="space-y-2">
                {sessionList.slice(0, 10).map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between border rounded-lg p-3"
                  >
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">
                        {session.sessionId.slice(0, 16)}...
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{parseBrowser(session.userAgent)}</span>
                        {session.country && <span>{session.country}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">{session._count.pageViews} pages</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(session.startedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
