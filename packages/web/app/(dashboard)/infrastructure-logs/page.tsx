'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { logsApi } from '@/lib/api';

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

function buildLogQLQuery(hostname: string, job: string, level: string): string {
  const matchers: string[] = [];
  if (hostname) matchers.push(`hostname="${hostname}"`);
  if (job) matchers.push(`job="${job}"`);
  if (level) matchers.push(`level="${level}"`);

  if (matchers.length === 0) {
    return '{job=~".+"}';
  }
  return `{${matchers.join(', ')}}`;
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

  // Dropdown filter state
  const [hostnameFilter, setHostnameFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const isManualQuery = useRef(false);

  // Fetch label values for dropdowns
  const { data: hostnames } = useQuery({
    queryKey: ['lokiLabelValues', 'hostname'],
    queryFn: () => logsApi.labelValues('hostname'),
    staleTime: 60000,
  });

  const { data: jobs } = useQuery({
    queryKey: ['lokiLabelValues', 'job'],
    queryFn: () => logsApi.labelValues('job'),
    staleTime: 60000,
  });

  const { data: levels } = useQuery({
    queryKey: ['lokiLabelValues', 'level'],
    queryFn: () => logsApi.labelValues('level'),
    staleTime: 60000,
  });

  // Auto-build query from dropdown selections
  useEffect(() => {
    if (isManualQuery.current) {
      isManualQuery.current = false;
      return;
    }
    const built = buildLogQLQuery(hostnameFilter, jobFilter, levelFilter);
    setQuery(built);
    setSubmittedQuery(built);
  }, [hostnameFilter, jobFilter, levelFilter]);

  // Fetch log data
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
      return logsApi.query({ query: submittedQuery, start, end, limit });
    },
    enabled: !!submittedQuery && !isTailing,
  });

  const logEntries: LogEntry[] = (logResults as LogEntry[] | undefined) || [];

  // Filter by text
  const filteredLogs = filterText
    ? logEntries.filter(e => e.message.toLowerCase().includes(filterText.toLowerCase()))
    : logEntries;

  // Tail mode via SSE
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
    isManualQuery.current = true;
    setSubmittedQuery(query);
    setHostnameFilter('');
    setJobFilter('');
    setLevelFilter('');
  };

  const handleQuickQuery = (q: string) => {
    isManualQuery.current = true;
    setQuery(q);
    setSubmittedQuery(q);
    setHostnameFilter('');
    setJobFilter('');
    setLevelFilter('');
  };

  const clearFilters = () => {
    setHostnameFilter('');
    setJobFilter('');
    setLevelFilter('');
  };

  const hasActiveFilters = hostnameFilter || jobFilter || levelFilter;

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
          {/* Filter dropdowns */}
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">Hostname</label>
              <Select
                value={hostnameFilter}
                onChange={(e) => setHostnameFilter(e.target.value)}
              >
                <option value="">All Hosts</option>
                {hostnames?.map((h: string) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </Select>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs text-muted-foreground mb-1 block">Job</label>
              <Select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
              >
                <option value="">All Jobs</option>
                {jobs?.map((j: string) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </Select>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs text-muted-foreground mb-1 block">Level</label>
              <Select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
              >
                <option value="">All Levels</option>
                {levels?.map((l: string) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </div>
            {hasActiveFilters && (
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            )}
          </div>

          {/* Manual query input */}
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
                onClick={() => handleQuickQuery(q.query)}
                className="px-3 py-1 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors text-muted-foreground hover:text-foreground"
              >
                {q.label}
              </button>
            ))}
          </div>
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
                            {entry.labels.hostname?.split('.')[0] || entry.labels.job || entry.labels.filename?.split('/').pop() || '-'}
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
