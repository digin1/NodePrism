'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { anomalyApi } from '@/lib/api';
import { useWebSocket } from '@/components/providers';
import { useEffect, useState } from 'react';

interface AnomalyScore {
  metricName: string;
  serverId: string;
  score: number;
  isAnomalous: boolean;
  timestamp: string;
  modelCount: number;
  consensusRequired: number;
  consensusAchieved: number;
}

interface NodeAnomalyRate {
  serverId: string;
  rate: number;
  anomalousCount: number;
  totalCount: number;
  timestamp: string;
}

export function AnomalyAdvisorPanel() {
  const {
    data: anomalies,
    isLoading: anomaliesLoading,
    refetch: refetchAnomalies,
  } = useQuery({
    queryKey: ['anomalies'],
    queryFn: () => anomalyApi.list(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const {
    data: rates,
    isLoading: ratesLoading,
    refetch: refetchRates,
  } = useQuery({
    queryKey: ['anomalyRates'],
    queryFn: () => anomalyApi.rates(),
    refetchInterval: 30000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['anomalyStats'],
    queryFn: () => anomalyApi.stats(),
    refetchInterval: 60000, // Refresh every minute
  });

  const { subscribe } = useWebSocket();
  const [realTimeAnomalies, setRealTimeAnomalies] = useState<AnomalyScore[]>([]);

  useEffect(() => {
    // Subscribe to real-time anomaly updates
    const unsubscribeDetected = subscribe('anomaly:detected', (data: AnomalyScore) => {
      setRealTimeAnomalies((prev) => [data, ...prev.slice(0, 9)]); // Keep last 10
      refetchAnomalies();
      refetchRates();
    });

    const unsubscribeResolved = subscribe('anomaly:resolved', (data: any) => {
      setRealTimeAnomalies((prev) => prev.filter((a) => a.metricName !== data.metricName));
      refetchAnomalies();
      refetchRates();
    });

    return () => {
      unsubscribeDetected();
      unsubscribeResolved();
    };
  }, [subscribe, refetchAnomalies, refetchRates]);

  const currentAnomalies = anomalies as AnomalyScore[] | undefined;
  const currentRates = rates as NodeAnomalyRate[] | undefined;
  const anomalyStats = stats as any;

  const getSeverityColor = (score: number) => {
    if (score >= 80) return 'bg-red-500';
    if (score >= 60) return 'bg-orange-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getSeverityLabel = (score: number) => {
    if (score >= 80) return 'Critical';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  };

  const getRateColor = (rate: number) => {
    if (rate >= 50) return 'text-red-600';
    if (rate >= 25) return 'text-orange-600';
    if (rate >= 10) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Current Anomalies */}
      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Active Anomalies</CardTitle>
            <p className="text-sm text-muted-foreground">
              Real-time anomaly detection across all servers
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {currentAnomalies?.length || 0} active
          </Badge>
        </CardHeader>
        <CardContent>
          {anomaliesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : currentAnomalies && currentAnomalies.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {currentAnomalies.slice(0, 5).map((anomaly, i) => (
                <div
                  key={`${anomaly.metricName}-${anomaly.serverId}-${i}`}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getSeverityColor(anomaly.score)}`} />
                      <p className="font-medium text-sm">{anomaly.metricName}</p>
                      <Badge variant="outline" className="text-xs">
                        {getSeverityLabel(anomaly.score)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Server: {anomaly.serverId} • Score: {anomaly.score.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(anomaly.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {currentAnomalies.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  +{currentAnomalies.length - 5} more anomalies
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm">No anomalies detected</p>
              <p className="text-xs mt-1">All systems operating normally</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Node Anomaly Rates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Server Health</CardTitle>
          <p className="text-sm text-muted-foreground">Anomaly rates by server</p>
        </CardHeader>
        <CardContent>
          {ratesLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : currentRates && currentRates.length > 0 ? (
            <div className="space-y-3">
              {currentRates.slice(0, 4).map((rate) => (
                <div
                  key={rate.serverId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-sm">{rate.serverId}</p>
                    <p className="text-xs text-muted-foreground">
                      {rate.anomalousCount}/{rate.totalCount} metrics
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${getRateColor(rate.rate)}`}>
                      {rate.rate.toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No server data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anomaly Statistics */}
      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle className="text-lg">Anomaly Detection Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : anomalyStats ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{anomalyStats.totalScores || 0}</p>
                <p className="text-sm text-muted-foreground">Total Metrics</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">
                  {anomalyStats.anomalousScores || 0}
                </p>
                <p className="text-sm text-muted-foreground">Anomalous</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {anomalyStats.activeDbModels || 0}
                </p>
                <p className="text-sm text-muted-foreground">Active Models</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">
                  {anomalyStats.recentEvents24h || 0}
                </p>
                <p className="text-sm text-muted-foreground">Events (24h)</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Statistics not available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
