'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { metricsApi, anomalyApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

export function EnhancedMetricsChart({
  serverId,
  metricName,
  title,
  height = 300,
}: EnhancedMetricsChartProps) {
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
  const metricData = metrics as { data?: { result?: Array<{ values: [number, string][] }> } } | undefined;
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
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
        <div className="relative bg-gray-50 rounded-lg" style={{ height: `${height}px` }}>
          {metricsLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading metrics...</div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">No data available</div>
            </div>
          ) : (
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height={height - 20}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString()}
                    stroke="#6b7280"
                    fontSize={12}
                  />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    labelFormatter={(ts) => new Date(ts * 1000).toLocaleString()}
                    formatter={(value: number) => [value.toFixed(4), 'Value']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
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
