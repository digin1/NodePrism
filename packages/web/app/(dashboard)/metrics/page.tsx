'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { metricsApi } from '@/lib/api';
import { EnhancedMetricsChart } from '@/components/dashboard/EnhancedMetricsChart';

interface QueryResult {
  data?: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
    }>;
  };
}

export default function MetricsPage() {
  const [query, setQuery] = useState('up');
  const [submittedQuery, setSubmittedQuery] = useState('up');

  const {
    data: result,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['prometheusQuery', submittedQuery],
    queryFn: () => metricsApi.query(submittedQuery),
    enabled: !!submittedQuery,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  const exampleQueries = [
    { label: 'Targets Up', query: 'up' },
    {
      label: 'CPU Usage',
      query: '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
    },
    {
      label: 'Memory Usage',
      query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
    },
    {
      label: 'Disk Usage',
      query: '(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100',
    },
    { label: 'Network RX', query: 'irate(node_network_receive_bytes_total[5m])' },
    { label: 'Network TX', query: 'irate(node_network_transmit_bytes_total[5m])' },
  ];

  const queryResult = result as QueryResult | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prometheus"
        title="Metrics explorer"
        description="Run direct PromQL queries, inspect returned series, and pivot into the wider monitoring stack."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Current Query" value={submittedQuery} tone="primary" />
        <SummaryStat label="Series Returned" value={queryResult?.data?.result?.length || 0} />
        <SummaryStat label="Result Type" value={queryResult?.data?.resultType || 'vector'} />
      </div>

      {/* Query Form */}
      <Card>
        <CardHeader>
          <CardTitle>PromQL Query</CardTitle>
          <CardDescription>Enter a Prometheus query expression</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter PromQL query..."
                className="font-mono"
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Querying...' : 'Execute'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {exampleQueries.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setQuery(ex.query);
                    setSubmittedQuery(ex.query);
                  }}
                  className="px-3 py-1 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors text-muted-foreground hover:text-foreground"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400">
              Error executing query: {(error as Error)?.message || 'Unknown error'}
            </div>
          ) : isLoading ? (
            <LoadingState rows={4} />
          ) : queryResult?.data?.result && queryResult.data.result.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {queryResult.data.result.length} result(s) - Type: {queryResult.data.resultType}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queryResult.data.result.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <code className="rounded-md bg-muted/60 px-2 py-1 text-[11px] text-cyan-100">
                          {JSON.stringify(item.metric)}
                        </code>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.value?.[1] !== undefined
                          ? parseFloat(item.value[1]).toFixed(4)
                          : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              className="min-h-[180px]"
              title="No query results"
              description="The current PromQL expression returned no series. Adjust the selector, labels, or time range and run it again."
            />
          )}
        </CardContent>
      </Card>

      {/* Enhanced Chart */}
      {submittedQuery && (
        <EnhancedMetricsChart
          metricName={submittedQuery}
          title={`Chart: ${submittedQuery}`}
          height={400}
        />
      )}

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>External Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href={process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-sm">
                G
              </div>
              <div>
                <p className="font-medium text-sm">Grafana</p>
                <p className="text-xs text-muted-foreground">Advanced dashboards</p>
              </div>
            </a>
            <a
              href={process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center text-red-500 font-bold text-sm">
                P
              </div>
              <div>
                <p className="font-medium text-sm">Prometheus</p>
                <p className="text-xs text-muted-foreground">Native query UI</p>
              </div>
            </a>
            <a
              href={process.env.NEXT_PUBLIC_ALERTMANAGER_URL || 'http://localhost:9093'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-500 font-bold text-sm">
                A
              </div>
              <div>
                <p className="font-medium text-sm">AlertManager</p>
                <p className="text-xs text-muted-foreground">Alert routing</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
