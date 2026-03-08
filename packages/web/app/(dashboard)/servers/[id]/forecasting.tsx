'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { forecastApi } from '@/lib/api';

interface ForecastData {
  currentValue: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  daysUntil90?: number | null;
  daysUntil100?: number | null;
  projectedValues: { days: number; value: number }[];
  dataPoints: number;
  dataSpanDays?: number;
  r2: number;
}

interface AllForecasts {
  disk: ForecastData | null;
  memory: ForecastData | null;
  cpu: ForecastData | null;
}

const trendIcons: Record<string, string> = {
  increasing: '↗',
  decreasing: '↘',
  stable: '→',
};

const trendColors: Record<string, string> = {
  increasing: 'text-red-500',
  decreasing: 'text-green-500',
  stable: 'text-blue-500',
};

function ForecastCard({ title, forecast, unit }: { title: string; forecast: ForecastData | null; unit: string }) {
  if (!forecast) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const isWarning = forecast.daysUntil90 != null && forecast.daysUntil90 < 30 && forecast.daysUntil90 > 0;
  const isCritical = forecast.daysUntil90 != null && forecast.daysUntil90 < 7 && forecast.daysUntil90 > 0;

  return (
    <Card className={isCritical ? 'border-red-500/50' : isWarning ? 'border-yellow-500/50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          <span className={`text-lg ${trendColors[forecast.trend]}`}>
            {trendIcons[forecast.trend]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current value */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{forecast.currentValue.toFixed(1)}{unit}</span>
          <Badge variant={
            forecast.trend === 'increasing' ? 'danger' :
            forecast.trend === 'decreasing' ? 'success' : 'secondary'
          }>
            {forecast.trend} ({forecast.slope > 0 ? '+' : ''}{forecast.slope.toFixed(2)}{unit}/day)
          </Badge>
        </div>

        {/* Projections */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projections</p>
          <div className="grid grid-cols-3 gap-2">
            {forecast.projectedValues.map((pv) => (
              <div key={pv.days} className="text-center p-2 rounded bg-muted/50">
                <div className="text-xs text-muted-foreground">{pv.days}d</div>
                <div className={`font-mono text-sm font-medium ${
                  pv.value > 90 ? 'text-red-500' :
                  pv.value > 80 ? 'text-yellow-500' : ''
                }`}>
                  {Math.min(pv.value, 100).toFixed(1)}{unit}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exhaustion warnings */}
        {forecast.daysUntil90 != null && forecast.daysUntil90 > 0 && (
          <div className="space-y-1.5">
            <div className={`flex items-center justify-between text-sm p-2 rounded ${
              forecast.daysUntil90 < 7 ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
              forecast.daysUntil90 < 30 ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' :
              'bg-muted/50'
            }`}>
              <span>Reaches 90%</span>
              <span className="font-medium">
                {forecast.daysUntil90 < 1 ? 'less than a day' :
                 `~${Math.round(forecast.daysUntil90)} days`}
              </span>
            </div>
            {forecast.daysUntil100 != null && forecast.daysUntil100 > 0 && (
              <div className={`flex items-center justify-between text-sm p-2 rounded ${
                forecast.daysUntil100 < 14 ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                'bg-muted/50'
              }`}>
                <span>Reaches 100%</span>
                <span className="font-medium">~{Math.round(forecast.daysUntil100)} days</span>
              </div>
            )}
          </div>
        )}

        {/* Correlation & data quality */}
        <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
          <span>R² = {forecast.r2.toFixed(3)}</span>
          <span>({forecast.dataPoints} pts{forecast.dataSpanDays != null ? `, ${forecast.dataSpanDays < 1 ? '<1' : forecast.dataSpanDays.toFixed(0)}d span` : ''})</span>
          {forecast.dataSpanDays != null && forecast.dataSpanDays < 1 && (
            <Badge variant="warning" className="text-[10px]">Insufficient data — need 24h+</Badge>
          )}
          {forecast.dataSpanDays != null && forecast.dataSpanDays >= 1 && forecast.r2 < 0.3 && (
            <Badge variant="secondary" className="text-[10px]">Low correlation</Badge>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              forecast.currentValue > 90 ? 'bg-red-500' :
              forecast.currentValue > 80 ? 'bg-yellow-500' :
              forecast.currentValue > 60 ? 'bg-blue-500' :
              'bg-green-500'
            }`}
            style={{ width: `${Math.min(forecast.currentValue, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function ServerForecasting({ serverId }: { serverId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['forecasting', serverId],
    queryFn: () => forecastApi.all(serverId),
    staleTime: 5 * 60 * 1000,
  });

  const forecasts = data as AllForecasts | undefined;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Resource Forecasting</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
        Failed to load forecasting data: {(error as Error)?.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Resource Forecasting</h3>
        <p className="text-sm text-muted-foreground">Linear regression projections based on 7 days of historical data</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ForecastCard title="Disk Usage" forecast={forecasts?.disk || null} unit="%" />
        <ForecastCard title="Memory Usage" forecast={forecasts?.memory || null} unit="%" />
        <ForecastCard title="CPU Usage" forecast={forecasts?.cpu || null} unit="%" />
      </div>
    </div>
  );
}
