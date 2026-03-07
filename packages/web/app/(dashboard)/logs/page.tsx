'use client';


import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { io, Socket } from 'socket.io-client';

// Use relative URL to go through Next.js proxy
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ||
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

interface EventEntry {
  id: string;
  serverId: string | null;
  serverHostname?: string;
  type: string;
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  source: string | null;
  createdAt: string;
}

interface EventStats {
  period: string;
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}

const severityColors: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 dark:bg-red-500/20 text-red-800 dark:text-red-300 border-red-500/20',
  WARNING: 'bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border-yellow-500/20',
  INFO: 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-500/20',
  DEBUG: 'bg-muted text-muted-foreground border-border',
};

const severityBadgeColors: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  WARNING: 'bg-yellow-500',
  INFO: 'bg-blue-500',
  DEBUG: 'bg-gray-500',
};

const typeIcons: Record<string, string> = {
  SERVER_ONLINE: '🟢',
  SERVER_OFFLINE: '🔴',
  SERVER_WARNING: '🟡',
  SERVER_CRITICAL: '🔴',
  AGENT_INSTALLED: '📦',
  AGENT_STARTED: '▶️',
  AGENT_STOPPED: '⏹️',
  AGENT_FAILED: '❌',
  AGENT_UPDATED: '🔄',
  ALERT_TRIGGERED: '🔔',
  ALERT_RESOLVED: '✅',
  ALERT_ACKNOWLEDGED: '👁️',
  THRESHOLD_WARNING: '⚠️',
  THRESHOLD_CRITICAL: '🚨',
  THRESHOLD_CLEARED: '✅',
  ANOMALY_DETECTED: '🔍',
  ANOMALY_RESOLVED: '✅',
  SYSTEM_STARTUP: '🚀',
  SYSTEM_SHUTDOWN: '🛑',
  HEARTBEAT_MISSED: '💔',
  CONNECTION_LOST: '🔌',
  CONNECTION_RESTORED: '🔗',
};

export default function EventsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [realtimeEvents, setRealtimeEvents] = useState<EventEntry[]>([]);

  // Calculate time range
  const getTimeParams = () => {
    const now = Date.now();
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    const start = new Date(now - (ranges[timeRange] || ranges['24h'])).toISOString();
    const end = new Date(now).toISOString();
    return { start, end };
  };

  // Fetch events
  const { data: eventsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['events', timeRange, severityFilter, typeFilter],
    queryFn: async () => {
      const { start, end } = getTimeParams();
      const params = new URLSearchParams({
        startTime: start,
        endTime: end,
        limit: '200',
      });
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);

      const response = await fetch(`${API_URL}/api/events?${params}`);
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      return data.data as EventEntry[];
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['eventStats', timeRange],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/events/stats?period=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      return data.data as EventStats;
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Setup WebSocket for real-time events
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      // connected
    });

    socket.on('event:new', (event: EventEntry) => {
      setRealtimeEvents(prev => [event, ...prev].slice(0, 50));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Combine API events with realtime events
  const allEvents = [...realtimeEvents, ...(eventsData || [])];

  // Remove duplicates by id
  const uniqueEvents = allEvents.filter((event, index, self) =>
    index === self.findIndex(e => e.id === event.id)
  );

  // Filter by search term
  const filteredEvents = uniqueEvents.filter(event =>
    !searchTerm ||
    event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.serverHostname?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Event Log</h2>
          <p className="text-muted-foreground">Monitor server and system events</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            size="sm"
          >
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button onClick={() => refetch()} disabled={isFetching} size="sm">
            {isFetching ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Events</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-red-600">Critical</div>
              <div className="text-2xl font-bold text-red-600">{stats.bySeverity?.CRITICAL || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-yellow-600">Warning</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.bySeverity?.WARNING || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-blue-600">Info</div>
              <div className="text-2xl font-bold text-blue-600">{stats.bySeverity?.INFO || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Debug</div>
              <div className="text-2xl font-bold text-muted-foreground">{stats.bySeverity?.DEBUG || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Search</label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search events..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Severity</label>
              <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                <option value="all">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="WARNING">Warning</option>
                <option value="INFO">Info</option>
                <option value="DEBUG">Debug</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Event Type</label>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                <optgroup label="Server">
                  <option value="SERVER_ONLINE">Server Online</option>
                  <option value="SERVER_OFFLINE">Server Offline</option>
                  <option value="SERVER_WARNING">Server Warning</option>
                  <option value="SERVER_CRITICAL">Server Critical</option>
                </optgroup>
                <optgroup label="Agent">
                  <option value="AGENT_STARTED">Agent Started</option>
                  <option value="AGENT_STOPPED">Agent Stopped</option>
                  <option value="AGENT_FAILED">Agent Failed</option>
                </optgroup>
                <optgroup label="Alerts">
                  <option value="ALERT_TRIGGERED">Alert Triggered</option>
                  <option value="ALERT_RESOLVED">Alert Resolved</option>
                  <option value="THRESHOLD_WARNING">Threshold Warning</option>
                  <option value="THRESHOLD_CRITICAL">Threshold Critical</option>
                </optgroup>
                <optgroup label="System">
                  <option value="SYSTEM_STARTUP">System Startup</option>
                  <option value="HEARTBEAT_MISSED">Heartbeat Missed</option>
                </optgroup>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Time Range</label>
              <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                <option value="1h">Last 1 hour</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>
              {isLoading ? 'Loading...' : `${filteredEvents.length} Events`}
            </span>
            {realtimeEvents.length > 0 && (
              <Badge variant="secondary" className="bg-green-500/10 dark:bg-green-500/20 text-green-800 dark:text-green-300">
                {realtimeEvents.length} new
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-foreground">No events found</h3>
              <p className="mt-1 text-sm text-muted-foreground">Events will appear here as they occur.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className={`p-4 hover:bg-muted/50 transition-colors ${
                    event.severity === 'CRITICAL' ? 'bg-red-500/10 dark:bg-red-500/20' :
                    event.severity === 'WARNING' ? 'bg-yellow-500/10 dark:bg-yellow-500/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0">
                      {typeIcons[event.type] || '📋'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${severityBadgeColors[event.severity]} text-white text-xs`}>
                          {event.severity}
                        </Badge>
                        <span className="font-medium text-foreground">{event.title}</span>
                        {event.serverHostname && (
                          <Badge variant="outline" className="text-xs">
                            {event.serverHostname}
                          </Badge>
                        )}
                        {event.source && (
                          <span className="text-xs text-muted-foreground">{event.source}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{event.message}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(event.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
