'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { metricsApi, anomalyApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

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

  const metricData = metrics as { result?: Array<{ values: [number, string][] }> } | undefined;
  const anomalyData = anomalies as
    | Array<{ startedAt: string; endedAt?: string; score: number; metricName: string }>
    | undefined;
  const baselineData = baselineMetrics as
    | { result?: Array<{ values: [number, string][] }> }
    | undefined;

  // Convert data for chart rendering
  const chartData = convertToChartData(metricData?.result?.[0]?.values);
  const baselineChartData = convertToChartData(baselineData?.result?.[0]?.values);
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
              {/* Simple chart visualization - in a real app, use a charting library */}
              <SimpleChart
                data={chartData}
                baselineData={showBaseline ? baselineChartData : undefined}
                anomalies={showAnomalies ? anomalyOverlays : []}
                height={height}
              />

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

// Simple chart component - replace with a real charting library like Chart.js or Recharts
function SimpleChart({
  data,
  baselineData,
  anomalies,
  height,
}: {
  data: MetricPoint[];
  baselineData?: MetricPoint[];
  anomalies: AnomalyOverlay[];
  height: number;
}) {
  if (data.length === 0) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 800; // Fixed width for simplicity
  const padding = 40;

  return (
    <svg width={width} height={height} className="w-full h-full" viewBox={`0 0 ${width} ${height}`}>
      {/* Grid lines */}
      <defs>
        <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      {/* Anomaly overlays */}
      {anomalies.map((anomaly, i) => {
        const startX =
          ((anomaly.start - data[0].timestamp) /
            (data[data.length - 1].timestamp - data[0].timestamp)) *
            (width - 2 * padding) +
          padding;
        const endX =
          ((anomaly.end - data[0].timestamp) /
            (data[data.length - 1].timestamp - data[0].timestamp)) *
            (width - 2 * padding) +
          padding;

        return (
          <rect
            key={i}
            x={startX}
            y={padding}
            width={Math.max(endX - startX, 2)}
            height={height - 2 * padding}
            fill="rgba(239, 68, 68, 0.1)"
            stroke="rgb(239, 68, 68)"
            strokeWidth="1"
          />
        );
      })}

      {/* Baseline line */}
      {baselineData && baselineData.length > 0 && (
        <polyline
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray="5,5"
          points={baselineData
            .map((point, i) => {
              const x = (i / (baselineData.length - 1)) * (width - 2 * padding) + padding;
              const y = height - padding - ((point.value - min) / range) * (height - 2 * padding);
              return `${x},${y}`;
            })
            .join(' ')}
        />
      )}

      {/* Main data line */}
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        points={data
          .map((point, i) => {
            const x = (i / (data.length - 1)) * (width - 2 * padding) + padding;
            const y = height - padding - ((point.value - min) / range) * (height - 2 * padding);
            return `${x},${y}`;
          })
          .join(' ')}
      />

      {/* Y-axis labels */}
      <text x="10" y={padding} className="text-xs fill-gray-600" textAnchor="middle">
        {max.toFixed(2)}
      </text>
      <text x="10" y={height - padding} className="text-xs fill-gray-600" textAnchor="middle">
        {min.toFixed(2)}
      </text>
    </svg>
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
