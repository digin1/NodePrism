'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { metricsApi, anomalyApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useFormatDate } from '@/hooks/useFormatDate';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';

interface MetricPoint {
  timestamp: number;
  value: number;
}

interface AnomalyOverlay {
  start: number;
  end: number;
  score: number;
}

interface EnhancedMetricsChartProps {
  serverId?: string;
  metricName: string;
  title: string;
  height?: number;
}

const GRID_STROKE = 'rgba(113, 128, 150, 0.18)';
const AXIS_STROKE = 'rgba(148, 163, 184, 0.78)';
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(10, 15, 22, 0.96)',
  border: '1px solid rgba(100, 116, 139, 0.35)',
  borderRadius: '16px',
  color: '#e5eef8',
};

export function EnhancedMetricsChart({
  serverId,
  metricName,
  title,
  height = 300,
}: EnhancedMetricsChartProps) {
  const { formatDateTime, formatTimeOnly } = useFormatDate();
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('6h');
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [showBaseline, setShowBaseline] = useState(false);

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - getTimeRangeSeconds(timeRange);

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metricsRange', metricName, serverId, startTime, endTime],
    queryFn: () => metricsApi.queryRange(metricName, startTime, endTime),
    enabled: !!metricName,
  });

  const { data: anomalies } = useQuery({
    queryKey: ['anomalyEvents', serverId, startTime * 1000, endTime * 1000],
    queryFn: () =>
      anomalyApi.events({
        serverId,
        limit: 100,
      }),
    enabled: showAnomalies && !!serverId,
  });

  const { data: baselineMetrics } = useQuery({
    queryKey: ['baselineMetrics', metricName, serverId, startTime, endTime],
    queryFn: () => {
      // Get same time range from 7 days ago for baseline
      const baselineEnd = endTime - 7 * 24 * 60 * 60;
      const baselineStart = baselineEnd - getTimeRangeSeconds(timeRange);
      return metricsApi.queryRange(metricName, baselineStart, baselineEnd);
    },
    enabled: showBaseline,
  });

  // Prometheus query_range returns { status: string, data: { resultType: string, result: [...] } }
  const metricData = metrics as
    | { data?: { result?: Array<{ values: [number, string][] }> } }
    | undefined;
  const anomalyData = anomalies as
    | Array<{ startedAt: string; endedAt?: string; score: number; metricName: string }>
    | undefined;
  const baselineData = baselineMetrics as
    | { data?: { result?: Array<{ values: [number, string][] }> } }
    | undefined;

  // Convert data for chart rendering
  // API returns { status, data: { result: [...] } } after getData extracts res.data.data
  const result = metricData?.data?.result;
  const chartData = convertToChartData(result?.[0]?.values);
  const baselineChartData = convertToChartData(baselineData?.data?.result?.[0]?.values);
  const anomalyOverlays = convertToAnomalyOverlays(anomalyData, metricName);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Metric Analysis
          </p>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['1h', '6h', '24h', '7d'] as const).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange(range)}
                className="text-xs"
              >
                {range}
              </Button>
            ))}
          </div>
          <Button
            variant={showAnomalies ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAnomalies(!showAnomalies)}
            className="text-xs"
          >
            Anomalies
          </Button>
          <Button
            variant={showBaseline ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowBaseline(!showBaseline)}
            className="text-xs"
          >
            Baseline
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="relative rounded-[1.25rem] border border-border/60 bg-surface/70 p-3"
          style={{ height: `${height}px` }}
        >
          {metricsLoading ? (
            <LoadingState rows={1} className="h-full" rowClassName="h-full" />
          ) : chartData.length === 0 ? (
            <EmptyState
              className="h-full min-h-0 border-0 bg-transparent px-4 py-0"
              title="No data available"
              description="No samples were returned for this metric and time range."
            />
          ) : (
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height={height - 20}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => formatTimeOnly(ts * 1000)}
                    stroke={AXIS_STROKE}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke={AXIS_STROKE} fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(ts) => formatDateTime(ts * 1000)}
                    formatter={(value: number) => [value.toFixed(4), 'Value']}
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: '#e5eef8' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#38bdf8"
                    strokeWidth={2.4}
                    dot={false}
                  />
                  {showBaseline && baselineChartData.length > 0 && (
                    <Line
                      type="monotone"
                      data={baselineChartData}
                      dataKey="value"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>

              {/* Chart controls */}
              <div className="absolute top-2 right-2 flex gap-1">
                <Badge variant="outline" className="text-xs">
                  {chartData.length} points
                </Badge>
                {anomalyOverlays.length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {anomalyOverlays.length} anomalies
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function getTimeRangeSeconds(range: string): number {
  switch (range) {
    case '1h':
      return 3600;
    case '6h':
      return 6 * 3600;
    case '24h':
      return 24 * 3600;
    case '7d':
      return 7 * 24 * 3600;
    default:
      return 6 * 3600;
  }
}

function convertToChartData(values?: [number, string][]): MetricPoint[] {
  if (!values) return [];

  return values.map(([timestamp, value]) => ({
    timestamp,
    value: parseFloat(value) || 0,
  }));
}

function convertToAnomalyOverlays(
  anomalies:
    | Array<{ startedAt: string; endedAt?: string; score: number; metricName: string }>
    | undefined,
  targetMetric: string
): AnomalyOverlay[] {
  if (!anomalies) return [];

  return anomalies
    .filter((anomaly) => anomaly.metricName === targetMetric)
    .map((anomaly) => ({
      start: new Date(anomaly.startedAt).getTime(),
      end: anomaly.endedAt ? new Date(anomaly.endedAt).getTime() : Date.now(),
      score: anomaly.score,
    }));
}
