'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { alertApi, anomalyApi } from '@/lib/api';
import { useWebSocket } from '@/components/providers';
import { useEffect, useState } from 'react';

interface TimelineEvent {
  id: string;
  type: 'alert' | 'anomaly' | 'deployment';
  title: string;
  description: string;
  timestamp: Date;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  serverId?: string;
  status?: string;
}

export function EventTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['alertHistory'],
    queryFn: () => alertApi.history({ limit: 20 }),
    refetchInterval: 60000,
  });

  const { data: anomalies, isLoading: anomaliesLoading } = useQuery({
    queryKey: ['anomalyEvents'],
    queryFn: () => anomalyApi.events({ limit: 20 }),
    refetchInterval: 60000,
  });

  const { subscribe } = useWebSocket();

  useEffect(() => {
    // Subscribe to real-time events
    const unsubscribeAlert = subscribe('alert:firing', (data) => {
      addEvent({
        id: `alert-${data.id}`,
        type: 'alert',
        title: 'Alert Fired',
        description: data.message,
        timestamp: new Date(data.startsAt),
        severity: getAlertSeverity(data.severity),
        serverId: data.serverId,
        status: 'firing',
      });
    });

    const unsubscribeAnomaly = subscribe('anomaly:detected', (data) => {
      addEvent({
        id: `anomaly-${data.metricName}-${Date.now()}`,
        type: 'anomaly',
        title: 'Anomaly Detected',
        description: `Anomaly in ${data.metricName}`,
        timestamp: new Date(data.timestamp),
        severity: 'high',
        serverId: data.serverId,
      });
    });

    return () => {
      unsubscribeAlert();
      unsubscribeAnomaly();
    };
  }, [subscribe]);

  useEffect(() => {
    // Combine and sort events when data changes
    const combinedEvents: TimelineEvent[] = [];

    const alertsData = alerts as any[] | undefined;
    const anomaliesData = anomalies as any[] | undefined;

    if (alertsData) {
      alertsData.forEach((alert) => {
        combinedEvents.push({
          id: `alert-${alert.id}`,
          type: 'alert',
          title: `Alert ${alert.status.toLowerCase()}`,
          description: alert.message,
          timestamp: new Date(alert.startsAt),
          severity: getAlertSeverity(alert.severity),
          serverId: alert.serverId,
          status: alert.status,
        });
      });
    }

    if (anomaliesData) {
      anomaliesData.forEach((anomaly) => {
        combinedEvents.push({
          id: `anomaly-${anomaly.id}`,
          type: 'anomaly',
          title: 'Anomaly Event',
          description: `Anomaly in ${anomaly.metricName}`,
          timestamp: new Date(anomaly.startedAt),
          severity: 'high',
          serverId: anomaly.serverId,
        });
      });
    }

    // Sort by timestamp descending
    combinedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setEvents(combinedEvents.slice(0, 20)); // Keep only 20 most recent
  }, [alerts, anomalies]);

  const addEvent = (event: TimelineEvent) => {
    setEvents((prev) => [event, ...prev.slice(0, 19)]);
  };

  const getAlertSeverity = (severity: string): 'low' | 'medium' | 'high' | 'critical' => {
    switch (severity) {
      case 'CRITICAL':
        return 'critical';
      case 'WARNING':
        return 'high';
      case 'INFO':
        return 'medium';
      default:
        return 'low';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return (
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
        );
      case 'anomaly':
        return (
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-orange-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
        );
      case 'deployment':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
              />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        );
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50';
      case 'high':
        return 'text-orange-600 bg-orange-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (alertsLoading || anomaliesLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Event Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Event Timeline</CardTitle>
        <p className="text-sm text-muted-foreground">Recent alerts, anomalies, and system events</p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No recent events</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {events.map((event, index) => (
              <div key={event.id} className="flex gap-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  {getEventIcon(event.type)}
                  {index < events.length - 1 && <div className="w-px h-8 bg-gray-200 mt-2" />}
                </div>

                {/* Event content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{event.title}</h4>
                    {event.severity && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${getSeverityColor(event.severity)}`}
                      >
                        {event.severity}
                      </Badge>
                    )}
                    {event.status && (
                      <Badge variant="outline" className="text-xs">
                        {event.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{event.timestamp.toLocaleString()}</span>
                    {event.serverId && <span>Server: {event.serverId}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
