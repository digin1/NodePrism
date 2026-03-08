'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  {
    title: 'Overview',
    content: `NodePrism is an advanced server monitoring system that provides real-time metrics collection,
alerting, anomaly detection, and centralized management for your infrastructure. It consists of a manager
server (API + Web UI) and lightweight agents deployed on monitored servers.`,
  },
  {
    title: 'Architecture',
    items: [
      { label: 'Web UI (Port 3000)', desc: 'Next.js dashboard for visualization and management' },
      { label: 'API Server (Port 4000)', desc: 'Express.js REST API backend with PostgreSQL and Redis' },
      { label: 'Config Sync (Port 4002)', desc: 'Service that synchronizes alert configurations' },
      { label: 'Anomaly Detector (Port 4003)', desc: 'Statistical anomaly detection engine' },
      { label: 'Agent (Port 9101)', desc: 'Lightweight agent deployed on monitored servers' },
      { label: 'Prometheus (Port 9090)', desc: 'Time-series metrics storage and querying' },
      { label: 'Grafana (Port 3030)', desc: 'Advanced visualization and dashboards' },
      { label: 'Loki (Port 3100)', desc: 'Log aggregation system' },
    ],
  },
  {
    title: 'API Endpoints',
    docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || 'http://66.85.173.55:3080',
    items: [
      { label: 'GET /health', desc: 'Health check with dependency status' },
      { label: 'POST /api/auth/login', desc: 'Authenticate and receive JWT token' },
      { label: 'GET /api/servers', desc: 'List all monitored servers (filterable by status, environment, tags)' },
      { label: 'GET /api/servers/:id', desc: 'Get detailed server information' },
      { label: 'GET /api/metrics/query', desc: 'Query Prometheus metrics (PromQL)' },
      { label: 'GET /api/metrics/query_range', desc: 'Range query for time-series data' },
      { label: 'GET /api/alerts', desc: 'List active alerts (filterable by status, severity)' },
      { label: 'GET /api/alerts/rules', desc: 'List alert rules' },
      { label: 'GET /api/alerts/templates', desc: 'List alert templates' },
      { label: 'POST /api/alerts/:id/acknowledge', desc: 'Acknowledge an alert' },
      { label: 'GET /api/anomalies', desc: 'List detected anomalies' },
      { label: 'GET /api/dashboards', desc: 'List custom dashboards' },
      { label: 'GET /api/containers/server/:id', desc: 'List containers on a server' },
      { label: 'GET /api/notifications/channels', desc: 'List notification channels' },
      { label: 'GET /api/maintenance-windows', desc: 'List maintenance windows' },
      { label: 'GET /api/settings', desc: 'Get system settings' },
      { label: 'GET /api/audit', desc: 'View audit log (admin only)' },
    ],
  },
  {
    title: 'Agent Setup',
    steps: [
      'SSH into the target server you want to monitor.',
      'Run the agent installer: curl -sL http://66.85.173.55:4000/agent-install.sh | sudo bash',
      'Select "1) Install a new agent" and choose the agent type (e.g., Node Exporter for system metrics).',
      'The agent will automatically register with the manager and begin reporting metrics.',
      'Verify the agent appears in the Servers page with a "connected" status.',
      'To reconfigure an agent, run: sudo nodeprism-agent reconfigure',
    ],
  },
  {
    title: 'Available Agent Types',
    items: [
      { label: 'Node Exporter (port 9100)', desc: 'System metrics — CPU, memory, disk, network, load average. Required for basic server monitoring.' },
      { label: 'MySQL Exporter (port 9104)', desc: 'MySQL/MariaDB metrics — connections, queries/sec, InnoDB stats, slow queries. Requires a read-only DB user (GRANT PROCESS, REPLICATION CLIENT, SELECT).' },
      { label: 'PostgreSQL Exporter (port 9187)', desc: 'PostgreSQL metrics — connections, query stats, replication lag. Requires pg_monitor role.' },
      { label: 'MongoDB Exporter (port 9216)', desc: 'MongoDB metrics — operations, connections, replication. Requires clusterMonitor + read role.' },
      { label: 'Nginx Exporter (port 9113)', desc: 'Nginx metrics — active connections, requests/sec. Requires stub_status enabled.' },
      { label: 'Redis Exporter (port 9121)', desc: 'Redis metrics — memory, keys, commands/sec. For Redis 6+ ACLs, use a read-only user.' },
      { label: 'Libvirt Exporter (port 9177)', desc: 'KVM/QEMU per-VM metrics — CPU time, memory, disk I/O, network per domain. Auto-detected on KVM hosts. Uses read-only libvirt socket (cannot modify VMs).' },
      { label: 'LiteSpeed Exporter (port 9122)', desc: 'LiteSpeed metrics — requests/sec, connections, bandwidth, per-vhost stats, LSAPI/PHP workers. Reads .rtreport files (read-only).' },
      { label: 'Exim Exporter (port 9123)', desc: 'Exim mail metrics — queue size, frozen messages, deliveries/bounces/rejections per day, per-domain send/receive counts.' },
      { label: 'cPanel Exporter (port 9124)', desc: 'cPanel metrics — total accounts, domains, suspended accounts, per-account bandwidth and disk usage. Read-only file access.' },
      { label: 'Promtail (port 9080)', desc: 'Log collector — ships syslog, auth.log, journal, and custom logs to Loki for centralized log viewing.' },
    ],
  },
  {
    title: 'Container / VM Monitoring',
    content: `NodePrism automatically detects and monitors virtual machines and containers on your hosts.
When an agent is installed on a virtualization host (KVM, OpenVZ, or Virtuozzo), the installer gathers
an inventory of all VMs/containers and reports them to the API. This data appears in the server detail
page under "Virtual Machines / Containers" with sortable columns and summary stats.`,
    items: [
      { label: 'KVM / QEMU', desc: 'VMs detected via virsh. Install the Libvirt Exporter for live per-VM CPU, memory, disk I/O, and network metrics via Prometheus. The exporter uses the read-only libvirt socket for safety.' },
      { label: 'OpenVZ', desc: 'Containers detected via vzlist. A periodic collector (systemd timer, every 30s) gathers per-container CPU% (vzstat), memory (/proc/user_beancounters), vCPUs, and network stats (/sys/class/net).' },
      { label: 'Virtuozzo', desc: 'Containers/VMs detected via prlctl. Metrics gathered via prlctl statistics (CPU, memory) with a periodic collector.' },
      { label: 'Grafana Dashboard', desc: 'The "Container / VM Overview" Grafana dashboard shows live status timeline, CPU/memory graphs (top 20), disk I/O and network rates (top 10), plus inventory tables from PostgreSQL.' },
      { label: 'API Endpoints', desc: 'GET /api/containers/server/:id — list containers. GET /api/containers/server/:id/metrics — live metrics (Prometheus for KVM, metadata for OpenVZ/Virtuozzo). GET /api/containers/:id — single container details.' },
    ],
  },
  {
    title: 'Alert Templates',
    content: `Alert templates let you define reusable monitoring rules with PromQL queries.
Each template can specify warning and critical thresholds with optional hysteresis to prevent
flapping. Templates support label matching to target specific servers or groups. When a
threshold is breached, alerts are created and optionally forwarded to notification channels
(Email, Slack, Discord, Webhook, Telegram, PagerDuty).`,
  },
  {
    title: 'Custom Dashboards',
    content: `Create custom dashboards with multiple panel types: line charts, area charts, bar charts,
gauges, stat displays, and tables. Each panel runs a PromQL query against Prometheus. Dashboards support
configurable refresh intervals and time ranges. One dashboard can be set as the default, which is shown
on the main Dashboard page.`,
  },
  {
    title: 'Keyboard Shortcuts',
    items: [
      { label: 'g then d', desc: 'Navigate to Dashboard' },
      { label: 'g then s', desc: 'Navigate to Servers' },
      { label: 'g then a', desc: 'Navigate to Alerts' },
      { label: 'g then m', desc: 'Navigate to Metrics' },
      { label: '?', desc: 'Show shortcuts help overlay' },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Documentation</h2>
        <p className="text-muted-foreground">Reference guide for NodePrism</p>
      </div>

      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{section.title}</CardTitle>
              {section.docsUrl && (
                <a
                  href={section.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-500 hover:text-blue-400 hover:underline"
                >
                  View Interactive API Docs &rarr;
                </a>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {section.content && (
              <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
            )}
            {section.items && (
              <dl className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.label} className="flex flex-col sm:flex-row sm:gap-4 py-1 border-b last:border-0">
                    <dt className="font-mono text-sm font-medium min-w-[260px] text-foreground">
                      {item.label}
                    </dt>
                    <dd className="text-sm text-muted-foreground">{item.desc}</dd>
                  </div>
                ))}
              </dl>
            )}
            {section.steps && (
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                {section.steps.map((step, i) => (
                  <li key={i} className="leading-relaxed">{step}</li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
