'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface LogEntry {
  timestamp: string;
  message: string;
  labels: Record<string, string>;
}

const severityColors: Record<string, string> = {
  error: 'bg-red-100 text-red-800 border-red-200',
  warn: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  debug: 'bg-gray-100 text-gray-800 border-gray-200',
};

function getLogLevel(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('error') || lower.includes('err')) return 'error';
  if (lower.includes('warn')) return 'warn';
  if (lower.includes('debug')) return 'debug';
  return 'info';
}

export default function LogsPage() {
  const [query, setQuery] = useState('{job=~".+"}');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeRange, setTimeRange] = useState('1h');
  const [limit, setLimit] = useState('200');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Calculate time range
  const getTimeParams = () => {
    const now = Date.now();
    const ranges: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '3h': 3 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    };
    const start = new Date(now - (ranges[timeRange] || ranges['1h'])).toISOString();
    const end = new Date(now).toISOString();
    return { start, end };
  };

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', query, timeRange, limit],
    queryFn: async () => {
      const { start, end } = getTimeParams();
      const params = new URLSearchParams({
        query,
        start,
        end,
        limit,
      });
      const response = await fetch(`${API_URL}/api/logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      return data.data as LogEntry[];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const { data: labels } = useQuery({
    queryKey: ['logLabels'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/logs/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      const data = await response.json();
      return data.data as string[];
    },
  });

  // Filter logs by search term
  const filteredLogs = logs?.filter(log =>
    !searchTerm || log.message.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Logs</h2>
          <p className="text-muted-foreground">View and search application logs from Loki</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            size="sm"
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
          <Button onClick={() => refetch()} disabled={isFetching} size="sm">
            {isFetching ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">LogQL Query</label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='{job="promtail"}'
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Search</label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter logs..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Time Range</label>
              <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                <option value="15m">Last 15 minutes</option>
                <option value="1h">Last 1 hour</option>
                <option value="3h">Last 3 hours</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Limit</label>
              <Select value={limit} onChange={(e) => setLimit(e.target.value)}>
                <option value="50">50 lines</option>
                <option value="100">100 lines</option>
                <option value="200">200 lines</option>
                <option value="500">500 lines</option>
                <option value="1000">1000 lines</option>
              </Select>
            </div>
          </div>
          {labels && labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Available labels:</span>
              {labels.slice(0, 10).map((label) => (
                <Badge key={label} variant="secondary" className="text-xs cursor-pointer hover:bg-gray-200"
                  onClick={() => setQuery(`{${label}=~".+"}`)}
                >
                  {label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Output */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>
              {isLoading ? 'Loading...' : `${filteredLogs.length} Log Entries`}
            </span>
            {isFetching && !isLoading && (
              <span className="text-sm text-gray-500 animate-pulse">Refreshing...</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No logs found</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your query or time range.</p>
            </div>
          ) : (
            <div className="font-mono text-sm bg-gray-900 text-gray-100 rounded-b-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                {filteredLogs.map((log, index) => {
                  const level = getLogLevel(log.message);
                  return (
                    <div
                      key={index}
                      className={`px-4 py-1.5 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                        level === 'error' ? 'bg-red-900/20' :
                        level === 'warn' ? 'bg-yellow-900/20' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-gray-500 shrink-0 text-xs">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        {log.labels.job && (
                          <Badge variant="secondary" className="text-xs shrink-0 bg-gray-700 text-gray-300">
                            {log.labels.job}
                          </Badge>
                        )}
                        <span className={`break-all ${
                          level === 'error' ? 'text-red-400' :
                          level === 'warn' ? 'text-yellow-400' :
                          'text-gray-200'
                        }`}>
                          {log.message}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
