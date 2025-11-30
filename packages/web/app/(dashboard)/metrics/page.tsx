'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { metricsApi } from '@/lib/api';

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

  const { data: result, isLoading, error } = useQuery({
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
    { label: 'CPU Usage', query: '100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)' },
    { label: 'Memory Usage', query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100' },
    { label: 'Disk Usage', query: '(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100' },
    { label: 'Network RX', query: 'irate(node_network_receive_bytes_total[5m])' },
    { label: 'Network TX', query: 'irate(node_network_transmit_bytes_total[5m])' },
  ];

  const queryResult = result as QueryResult | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Metrics Explorer</h2>
        <p className="text-muted-foreground">Query Prometheus metrics directly</p>
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
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
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
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
              Error executing query: {(error as Error)?.message || 'Unknown error'}
            </div>
          ) : isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : queryResult?.data?.result && queryResult.data.result.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {queryResult.data.result.length} result(s) - Type: {queryResult.data.resultType}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Metric</th>
                      <th className="text-right p-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.data.result.map((item, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {JSON.stringify(item.metric)}
                          </code>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {item.value?.[1] !== undefined
                            ? parseFloat(item.value[1]).toFixed(4)
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No results. Try a different query.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>External Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold">
                G
              </div>
              <div>
                <p className="font-medium">Grafana</p>
                <p className="text-sm text-muted-foreground">Advanced dashboards</p>
              </div>
            </a>
            <a
              href="http://localhost:9090"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
                P
              </div>
              <div>
                <p className="font-medium">Prometheus</p>
                <p className="text-sm text-muted-foreground">Native query UI</p>
              </div>
            </a>
            <a
              href="http://localhost:9093"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold">
                A
              </div>
              <div>
                <p className="font-medium">AlertManager</p>
                <p className="text-sm text-muted-foreground">Alert routing</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
