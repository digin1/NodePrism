'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { otlpApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface Trace {
  traceId: string;
  rootOperation: string;
  serviceName: string;
  startTime: string;
  duration: string;
  spanCount: number;
}

function formatNanoDuration(nanoStr: string): string {
  const ns = BigInt(nanoStr);
  const ms = Number(ns / BigInt(1_000_000));
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function truncateId(id: string): string {
  return id.length > 16 ? id.slice(0, 16) + '...' : id;
}

export default function TracesPage() {
  const { formatDateTime } = useFormatDate();
  const [serviceFilter, setServiceFilter] = useState('');
  const [timeRange, setTimeRange] = useState('1h');

  const getTimeRange = () => {
    const now = new Date();
    const ranges: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    return {
      start: new Date(now.getTime() - (ranges[timeRange] || ranges['1h'])).toISOString(),
      end: now.toISOString(),
    };
  };

  const { data: services } = useQuery({
    queryKey: ['otlp-services'],
    queryFn: () => otlpApi.services(),
  });

  const { start, end } = getTimeRange();

  const { data: traces, isLoading } = useQuery({
    queryKey: ['traces', serviceFilter, timeRange],
    queryFn: () =>
      otlpApi.traces({
        serviceName: serviceFilter || undefined,
        start,
        end,
        limit: 50,
      }),
  });

  const traceList = traces as Trace[] | undefined;
  const serviceList = services as string[] | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observability"
        title="Distributed Traces"
        description="Search and inspect OpenTelemetry traces across services."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Traces" value={traceList?.length || 0} tone="primary" />
        <SummaryStat label="Services" value={serviceList?.length || 0} />
        <SummaryStat label="Time Range" value={timeRange} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <Select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              <option value="">All Services</option>
              {serviceList?.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </Select>
            <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Trace Results</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState rows={6} rowClassName="h-12" />
          ) : !traceList?.length ? (
            <EmptyState
              title="No traces found"
              description="No traces match the current filters. Traces will appear as instrumented services send OTLP data."
              icon={
                <svg
                  className="h-12 w-12 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Trace ID</th>
                    <th className="pb-2 pr-4 font-medium">Root Operation</th>
                    <th className="pb-2 pr-4 font-medium">Service</th>
                    <th className="pb-2 pr-4 font-medium">Duration</th>
                    <th className="pb-2 pr-4 font-medium">Spans</th>
                    <th className="pb-2 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {traceList.map((trace) => (
                    <tr key={trace.traceId} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/traces/${trace.traceId}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {truncateId(trace.traceId)}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 font-medium">{trace.rootOperation}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">{trace.serviceName}</Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {formatNanoDuration(trace.duration)}
                      </td>
                      <td className="py-3 pr-4">{trace.spanCount}</td>
                      <td className="py-3 text-muted-foreground text-xs">
                        {formatDateTime(trace.startTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
