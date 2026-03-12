'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { otlpApi } from '@/lib/api';
import { useFormatDate } from '@/hooks/useFormatDate';

interface Span {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: string;
  duration: string;
  status: string;
  attributes: Record<string, any> | null;
  events: any[] | null;
}

function formatNanoDuration(nanoStr: string): string {
  const ns = BigInt(nanoStr);
  const ms = Number(ns / BigInt(1_000_000));
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function durationMs(nanoStr: string): number {
  return Number(BigInt(nanoStr) / BigInt(1_000_000));
}

// Assign colors to services
const SERVICE_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
];

function getServiceColor(serviceName: string, serviceIndex: Map<string, number>): string {
  if (!serviceIndex.has(serviceName)) {
    serviceIndex.set(serviceName, serviceIndex.size);
  }
  return SERVICE_COLORS[serviceIndex.get(serviceName)! % SERVICE_COLORS.length];
}

interface SpanNode extends Span {
  children: SpanNode[];
  depth: number;
}

function buildTree(spans: Span[]): SpanNode[] {
  const nodeMap = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  // Create nodes
  for (const span of spans) {
    nodeMap.set(span.spanId, { ...span, children: [], depth: 0 });
  }

  // Build parent-child relationships
  for (const node of nodeMap.values()) {
    if (node.parentSpanId && nodeMap.has(node.parentSpanId)) {
      nodeMap.get(node.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Calculate depths
  function setDepth(node: SpanNode, depth: number) {
    node.depth = depth;
    node.children.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    setDepth(root, 0);
  }

  return roots;
}

function flattenTree(nodes: SpanNode[]): SpanNode[] {
  const result: SpanNode[] = [];
  function walk(node: SpanNode) {
    result.push(node);
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const node of nodes) {
    walk(node);
  }
  return result;
}

export default function TraceDetailPage() {
  const params = useParams();
  const traceId = params?.traceId as string;
  const { formatDateTime } = useFormatDate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => otlpApi.traceDetail(traceId),
  });

  const spans = data as Span[] | undefined;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !spans || spans.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/traces">
            <Button variant="ghost" size="icon">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Button>
          </Link>
          <h2 className="text-2xl font-bold">Trace Not Found</h2>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">This trace does not exist.</p>
            <Link href="/traces">
              <Button variant="outline" className="mt-4">
                Back to Traces
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Compute trace-level stats
  const traceStart = Math.min(...spans.map((s) => new Date(s.startTime).getTime()));
  const traceEnd = Math.max(
    ...spans.map((s) => new Date(s.startTime).getTime() + durationMs(s.duration))
  );
  const traceDurationMs = traceEnd - traceStart;
  const services = [...new Set(spans.map((s) => s.serviceName))];
  const errorCount = spans.filter((s) => s.status === 'ERROR').length;

  // Build tree and flatten for waterfall
  const tree = buildTree(spans);
  const flatSpans = flattenTree(tree);
  const serviceIndex = new Map<string, number>();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trace Detail"
        title={`Trace ${traceId.slice(0, 16)}...`}
        description={`${spans.length} spans across ${services.length} services`}
      >
        <Link href="/traces">
          <Button variant="outline">Back to Traces</Button>
        </Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryStat label="Spans" value={spans.length} tone="primary" />
        <SummaryStat label="Services" value={services.length} />
        <SummaryStat label="Duration" value={traceDurationMs < 1 ? '<1ms' : `${traceDurationMs}ms`} />
        <SummaryStat
          label="Errors"
          value={errorCount}
          tone={errorCount > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Service Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            {services.map((svc) => (
              <div key={svc} className="flex items-center gap-2 text-sm">
                <div
                  className={`w-3 h-3 rounded ${getServiceColor(svc, serviceIndex)}`}
                />
                <span>{svc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Waterfall */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Span Waterfall</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {flatSpans.map((span) => {
              const spanStart = new Date(span.startTime).getTime() - traceStart;
              const spanDur = durationMs(span.duration);
              const leftPercent =
                traceDurationMs > 0 ? (spanStart / traceDurationMs) * 100 : 0;
              const widthPercent =
                traceDurationMs > 0
                  ? Math.max((spanDur / traceDurationMs) * 100, 0.5)
                  : 100;
              const color = getServiceColor(span.serviceName, serviceIndex);

              return (
                <div key={span.spanId} className="flex items-center gap-2 group">
                  {/* Label column */}
                  <div
                    className="flex-shrink-0 text-xs truncate text-right"
                    style={{
                      width: '240px',
                      paddingLeft: `${span.depth * 16}px`,
                    }}
                  >
                    <span className="font-medium">{span.operationName}</span>
                    <span className="text-muted-foreground ml-1">
                      ({span.serviceName})
                    </span>
                  </div>

                  {/* Bar column */}
                  <div className="flex-1 relative h-6 bg-muted/30 rounded overflow-hidden">
                    <div
                      className={`absolute top-0.5 bottom-0.5 rounded ${color} ${
                        span.status === 'ERROR' ? 'ring-2 ring-red-400' : ''
                      }`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        minWidth: '2px',
                      }}
                    />
                  </div>

                  {/* Duration column */}
                  <div className="flex-shrink-0 w-16 text-right text-xs font-mono text-muted-foreground">
                    {formatNanoDuration(span.duration)}
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0 w-12">
                    {span.status === 'ERROR' && (
                      <Badge variant="danger">ERR</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Span Details Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Span Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Operation</th>
                  <th className="pb-2 pr-4 font-medium">Service</th>
                  <th className="pb-2 pr-4 font-medium">Duration</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Start</th>
                </tr>
              </thead>
              <tbody>
                {spans.map((span) => (
                  <tr key={span.spanId} className="border-b border-border/50">
                    <td className="py-2 pr-4">
                      <span className="font-medium">{span.operationName}</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">
                        {span.spanId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{span.serviceName}</Badge>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatNanoDuration(span.duration)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={span.status === 'ERROR' ? 'danger' : 'success'}>
                        {span.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {formatDateTime(span.startTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
