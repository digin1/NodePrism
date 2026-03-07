'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

interface LogEntry {
  timestamp: string;
  message: string;
  labels: Record<string, string>;
}

const severityColors: Record<string, string> = {
  error: 'text-red-500',
  err: 'text-red-500',
  fatal: 'text-red-600 font-bold',
  warn: 'text-yellow-500',
  warning: 'text-yellow-500',
  info: 'text-blue-400',
  debug: 'text-gray-500',
};

function detectSeverity(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('fatal') || lower.includes('panic')) return 'fatal';
  if (lower.includes('error') || lower.includes(' err ')) return 'error';
  if (lower.includes('warn')) return 'warn';
  if (lower.includes('debug')) return 'debug';
  return 'info';
}

export default function InfrastructureLogsPage() {
  const [query, setQuery] = useState('{job=~".+"}');
  const [submittedQuery, setSubmittedQuery] = useState('{job=~".+"}');
  const [timeRange, setTimeRange] = useState('1h');
  const [limit, setLimit] = useState(200);
  const [filterText, setFilterText] = useState('');
  const [isTailing, setIsTailing] = useState(false);
  const [tailLogs, setTailLogs] = useState<LogEntry[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch labels for the query builder
  const { data: labels } = useQuery({
    queryKey: ['lokiLabels'],
    queryFn: async () => {
      const res = await api.get('/api/logs/labels');
      return res.data.data as string[];
    },
    staleTime: 60000,
  });

  // Fetch log data - API returns already-parsed { timestamp, message, labels } objects
  const { data: logResults, isLoading, error, refetch } = useQuery({
    queryKey: ['lokiLogs', submittedQuery, timeRange, limit],
    queryFn: async () => {
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

      const res = await api.get('/api/logs', {
        params: { query: submittedQuery, start, end, limit },
      });
      return (res.data.data || []) as LogEntry[];
    },
    enabled: !!submittedQuery && !isTailing,
  });

  // The API already returns sorted, parsed log entries
  const logEntries: LogEntry[] = logResults || [];

  // Filter by text
  const filteredLogs = filterText
    ? logEntries.filter(e => e.message.toLowerCase().includes(filterText.toLowerCase()))
    : logEntries;

  // Tail mode via SSE - the tail endpoint sends raw Loki result arrays
  useEffect(() => {
    if (!isTailing) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    setTailLogs([]);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const url = `${apiUrl}/api/logs/tail?query=${encodeURIComponent(submittedQuery)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const streams = JSON.parse(event.data);
        if (Array.isArray(streams)) {
          const entries: LogEntry[] = [];
          for (const stream of streams) {
            const streamLabels = stream.stream || {};
            for (const [ts, line] of stream.values || []) {
              entries.push({
                timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
                message: line,
                labels: streamLabels,
              });
            }
          }
          if (entries.length > 0) {
            setTailLogs(prev => [...entries, ...prev].slice(0, 500));
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isTailing, submittedQuery]);

  // Auto-scroll in tail mode
  useEffect(() => {
    if (isTailing && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tailLogs, isTailing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  const displayLogs = isTailing ? tailLogs : filteredLogs;

  const quickQueries = [
    { label: 'All Logs', query: '{job=~".+"}' },
    { label: 'Syslog', query: '{job="syslog"}' },
    { label: 'Auth Logs', query: '{filename="/var/log/auth.log"}' },
    { label: 'Errors Only', query: '{job=~".+"} |~ "(?i)error|fatal|panic"' },
    { label: 'Warnings', query: '{job=~".+"} |~ "(?i)warn"' },
    { label: 'Kernel', query: '{filename=~"/var/log/kern.*"}' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Infrastructure Logs</h2>
          <p className="text-muted-foreground">Query logs from Loki (Promtail)</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isTailing ? 'default' : 'outline'}
            onClick={() => {
              setIsTailing(!isTailing);
              if (isTailing) refetch();
            }}
            size="sm"
          >
            {isTailing ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse mr-2" />
                Tailing Live
              </>
            ) : (
              'Start Tail'
            )}
          </Button>
        </div>
      </div>

      {/* Query Builder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">LogQL Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='{job="syslog"} |~ "error"'
              className="font-mono text-sm"
            />
            <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="w-32">
              <option value="15m">15 min</option>
              <option value="1h">1 hour</option>
              <option value="3h">3 hours</option>
              <option value="6h">6 hours</option>
              <option value="24h">24 hours</option>
            </Select>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Querying...' : 'Query'}
            </Button>
          </form>

          {/* Quick queries */}
          <div className="flex flex-wrap gap-2">
            {quickQueries.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  setQuery(q.query);
                  setSubmittedQuery(q.query);
                }}
                className="px-3 py-1 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors text-muted-foreground hover:text-foreground"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Available labels */}
          {labels && labels.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Labels: {labels.filter((l: string) => l !== '__name__').join(', ')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter bar */}
      {!isTailing && (
        <div className="flex items-center gap-4">
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs..."
            className="max-w-sm"
          />
          <span className="text-sm text-muted-foreground">
            {displayLogs.length} log entries
          </span>
        </div>
      )}

      {/* Log Output */}
      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              Error: {(error as Error)?.message || 'Failed to query logs'}
            </div>
          ) : null}

          {isLoading && !isTailing ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : displayLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">
                {isTailing ? 'Waiting for logs...' : 'No logs found. Try a different query or time range.'}
              </p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[600px] font-mono text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-card border-b">
                  <tr>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium w-44">Timestamp</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium w-28">Source</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLogs.map((entry, i) => {
                    const severity = entry.labels.detected_level || detectSeverity(entry.message);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-border/30 hover:bg-muted/30 ${
                          severity === 'error' || severity === 'fatal' ? 'bg-red-500/5' :
                          severity === 'warn' ? 'bg-yellow-500/5' : ''
                        }`}
                      >
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap align-top">
                          {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap align-top">
                          <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                            {entry.labels.job || entry.labels.filename?.split('/').pop() || '-'}
                          </span>
                        </td>
                        <td className={`px-3 py-1.5 whitespace-pre-wrap break-all ${severityColors[severity] || 'text-foreground'}`}>
                          {entry.message}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div ref={logsEndRef} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
