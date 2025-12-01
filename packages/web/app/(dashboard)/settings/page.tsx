'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { healthApi, metricsApi } from '@/lib/api';

interface Health {
  status: string;
  uptime?: number;
}

export default function SettingsPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check(),
  });

  const { data: targets } = useQuery({
    queryKey: ['targets'],
    queryFn: () => metricsApi.targets(),
  });

  const healthData = health as Health | undefined;

  const services = [
    { name: 'API Gateway', port: 4000, status: healthData?.status === 'ok' ? 'running' : 'unknown' },
    { name: 'PostgreSQL', port: 5432, status: 'running' },
    { name: 'Redis', port: 6379, status: 'running' },
    { name: 'Prometheus', port: 9090, status: targets ? 'running' : 'unknown' },
    { name: 'Grafana', port: 3001, status: 'running' },
    { name: 'AlertManager', port: 9093, status: 'running' },
    { name: 'Loki', port: 3100, status: 'running' },
    { name: 'Pushgateway', port: 9091, status: 'running' },
    { name: 'RabbitMQ', port: 5672, status: 'running' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-muted-foreground">System configuration and status</p>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Overview of all running services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">Port {service.port}</p>
                </div>
                <Badge variant={service.status === 'running' ? 'success' : 'secondary'}>
                  {service.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Info */}
      <Card>
        <CardHeader>
          <CardTitle>API Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">API URL</dt>
              <dd className="font-mono text-sm">http://localhost:4000</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={healthData?.status === 'ok' ? 'success' : 'danger'}>
                  {healthData?.status || 'unknown'}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Uptime</dt>
              <dd className="font-mono text-sm">
                {healthData?.uptime ? `${Math.floor(healthData.uptime)}s` : 'N/A'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xl">
                G
              </div>
              <div>
                <p className="font-medium">Grafana</p>
                <p className="text-sm text-muted-foreground">http://localhost:3001</p>
                <p className="text-xs text-muted-foreground mt-1">admin / admin</p>
              </div>
            </a>
            <a
              href="http://localhost:9090"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold text-xl">
                P
              </div>
              <div>
                <p className="font-medium">Prometheus</p>
                <p className="text-sm text-muted-foreground">http://localhost:9090</p>
              </div>
            </a>
            <a
              href="http://localhost:9093"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold text-xl">
                A
              </div>
              <div>
                <p className="font-medium">AlertManager</p>
                <p className="text-sm text-muted-foreground">http://localhost:9093</p>
              </div>
            </a>
            <a
              href="http://localhost:15672"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                R
              </div>
              <div>
                <p className="font-medium">RabbitMQ</p>
                <p className="text-sm text-muted-foreground">http://localhost:15672</p>
                <p className="text-xs text-muted-foreground mt-1">guest / guest</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Environment */}
      <Card>
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
          <CardDescription>Key configuration values</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <pre>{`# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nodeprism
REDIS_URL=redis://localhost:6379

# Prometheus
PROMETHEUS_URL=http://localhost:9090

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672`}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
