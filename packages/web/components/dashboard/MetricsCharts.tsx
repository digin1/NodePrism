'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { io, Socket } from 'socket.io-client';

// Use relative URLs for API calls (goes through Next.js proxy)
// Socket.IO needs the full URL for direct connection
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ||
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

interface ChartDataPoint {
  timestamp: number;
  cpu?: number;
  memory?: number;
  disk?: number;
  load1?: number;
  load5?: number;
  load15?: number;
  networkIn?: number;
  networkOut?: number;
  // MySQL metrics
  mysqlConnections?: number;
  mysqlQueriesPerSec?: number;
  mysqlSlowQueries?: number;
  mysqlBufferPoolUsed?: number;
}

interface MetricsChartsProps {
  serverId: string;
  hasMySQLExporter?: boolean;
}

const TIME_PERIODS = [
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
] as const;

type TimePeriod = typeof TIME_PERIODS[number]['value'];

// Custom tooltip formatter
function formatValue(value: number, metricType: string): string {
  if (metricType.includes('network')) {
    // Convert bytes/sec to human readable
    if (value < 1024) return `${value.toFixed(0)} B/s`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB/s`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB/s`;
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
  }
  if (metricType.includes('load')) {
    return value.toFixed(2);
  }
  return `${value.toFixed(1)}%`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function MetricsCharts({ serverId, hasMySQLExporter = false }: MetricsChartsProps) {
  const [period, setPeriod] = useState<TimePeriod>('1h');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Fetch historical chart data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['chartData', serverId, period],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/metrics/server/${serverId}/chart-data?period=${period}`);
      const json = await response.json();
      return json.data as ChartDataPoint[];
    },
    refetchInterval: 30000, // Refetch every 30 seconds as backup
  });

  // Update chart data when API data changes
  useEffect(() => {
    if (data) {
      setChartData(data);
    }
  }, [data]);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Socket connected for metrics');
      newSocket.emit('subscribe:server', serverId);
    });

    newSocket.on('metrics:update', (update: { serverId: string; metrics: Record<string, number | null>; timestamp: string }) => {
      if (update.serverId === serverId) {
        const newPoint: ChartDataPoint = {
          timestamp: new Date(update.timestamp).getTime(),
          ...Object.fromEntries(
            Object.entries(update.metrics)
              .filter(([_, v]) => v !== null)
              .map(([k, v]) => [k, v as number])
          ),
        };

        setChartData(prev => {
          // Keep data within the selected time period
          const periodMs: Record<string, number> = {
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
          };
          const cutoff = Date.now() - (periodMs[period] || periodMs['1h']);
          const filtered = prev.filter(p => p.timestamp > cutoff);
          return [...filtered, newPoint];
        });
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('unsubscribe:server', serverId);
      newSocket.disconnect();
    };
  }, [serverId, period]);

  // Handle period change - refetch data
  const handlePeriodChange = useCallback((newPeriod: TimePeriod) => {
    setPeriod(newPeriod);
  }, []);

  if (isLoading && chartData.length === 0) {
    return (
      <div className="grid gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-lg">Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] bg-gray-100 animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Time period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Real-time Metrics</h2>
        <div className="flex gap-1">
          {TIME_PERIODS.map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePeriodChange(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* CPU & Memory Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            CPU & Memory Usage
            <Badge variant="outline" className="font-normal">
              {chartData.length} data points
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                stroke="#9ca3af"
                fontSize={12}
              />
              <Tooltip
                labelFormatter={(label) => new Date(label).toLocaleString()}
                formatter={(value: number, name: string) => [formatValue(value, name), name]}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="cpu"
                name="CPU"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorCpu)"
              />
              <Area
                type="monotone"
                dataKey="memory"
                name="Memory"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorMemory)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Load Average Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Load Average</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                tickFormatter={(v) => v.toFixed(1)}
              />
              <Tooltip
                labelFormatter={(label) => new Date(label).toLocaleString()}
                formatter={(value: number, name: string) => [value.toFixed(2), name]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="load1"
                name="1 min"
                stroke="#f59e0b"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="load5"
                name="5 min"
                stroke="#8b5cf6"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="load15"
                name="15 min"
                stroke="#06b6d4"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Network Traffic Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Network Traffic</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorNetIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorNetOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                tickFormatter={(v) => {
                  if (v < 1024) return `${v.toFixed(0)} B`;
                  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
                  return `${(v / 1024 / 1024).toFixed(1)} MB`;
                }}
              />
              <Tooltip
                labelFormatter={(label) => new Date(label).toLocaleString()}
                formatter={(value: number, name: string) => [formatValue(value, 'network'), name]}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="networkIn"
                name="Download"
                stroke="#22c55e"
                fillOpacity={1}
                fill="url(#colorNetIn)"
              />
              <Area
                type="monotone"
                dataKey="networkOut"
                name="Upload"
                stroke="#0ea5e9"
                fillOpacity={1}
                fill="url(#colorNetOut)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Disk Usage Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Disk Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                stroke="#9ca3af"
                fontSize={12}
              />
              <Tooltip
                labelFormatter={(label) => new Date(label).toLocaleString()}
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Disk']}
              />
              <Area
                type="monotone"
                dataKey="disk"
                name="Disk Usage"
                stroke="#f97316"
                fillOpacity={1}
                fill="url(#colorDisk)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* MySQL Metrics Charts - Only shown when MySQL exporter is available */}
      {hasMySQLExporter && chartData.some(d => d.mysqlConnections !== undefined || d.mysqlQueriesPerSec !== undefined) && (
        <>
          {/* MySQL Connections & Queries Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                MySQL Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatTime}
                    stroke="#9ca3af"
                    fontSize={12}
                  />
                  <YAxis
                    yAxisId="connections"
                    stroke="#9ca3af"
                    fontSize={12}
                    tickFormatter={(v) => v.toString()}
                  />
                  <YAxis
                    yAxisId="qps"
                    orientation="right"
                    stroke="#9ca3af"
                    fontSize={12}
                    tickFormatter={(v) => `${v}/s`}
                  />
                  <Tooltip
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    formatter={(value: number, name: string) => {
                      if (name === 'Queries/sec') return [`${value.toFixed(1)}/s`, name];
                      return [value.toFixed(0), name];
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="connections"
                    type="monotone"
                    dataKey="mysqlConnections"
                    name="Connections"
                    stroke="#ea580c"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="qps"
                    type="monotone"
                    dataKey="mysqlQueriesPerSec"
                    name="Queries/sec"
                    stroke="#c2410c"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Bandwidth Summary Card component
interface BandwidthSummaryProps {
  serverId: string;
}

interface BandwidthData {
  totalIn: number;
  totalOut: number;
  avgIn: number;
  avgOut: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function BandwidthSummary({ serverId }: BandwidthSummaryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['bandwidth', serverId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/metrics/server/${serverId}/bandwidth/all`);
      const json = await response.json();
      return json.data as {
        hour: BandwidthData;
        day: BandwidthData;
        week: BandwidthData;
        month: BandwidthData;
      };
    },
    refetchInterval: 60000, // Refetch every minute
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bandwidth Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-gray-100 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const periods = [
    { label: 'Last Hour', data: data.hour },
    { label: 'Last 24h', data: data.day },
    { label: 'Last 7d', data: data.week },
    { label: 'Last 30d', data: data.month },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bandwidth Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {periods.map(({ label, data: periodData }) => (
            <div key={label} className="space-y-1">
              <div className="text-sm font-medium text-muted-foreground">{label}</div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">↓</span>
                <span className="text-sm">{formatBytes(periodData.totalIn)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-600">↑</span>
                <span className="text-sm">{formatBytes(periodData.totalOut)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
