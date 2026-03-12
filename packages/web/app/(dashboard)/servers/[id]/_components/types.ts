export interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  status: string;
  environment: string;
  region?: string;
  tags?: string[];
  createdAt: string;
  agents?: Array<{ id: string; type: string; port: number; status: string }>;
  alerts?: Array<{ id: string; message: string; severity: string; startsAt: string }>;
  metadata?: {
    os?: {
      distro?: string;
      distroId?: string;
      distroVersion?: string;
      distroCodename?: string;
      kernel?: string;
      arch?: string;
      platform?: string;
      controlPanel?: string;
    };
    hardware?: {
      cpuModel?: string;
      cpuCores?: number;
      memoryTotal?: number;
    };
    lastBootUptime?: number;
    [key: string]: unknown;
  };
}

export interface Metrics {
  cpu: number | null;
  memory: number | null;
  memoryTotal: number | null;
  memoryAvailable: number | null;
  disk: number | null;
  diskTotal: number | null;
  diskAvailable: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  networkIn: number | null;
  networkOut: number | null;
  mysqlConnections: number | null;
  mysqlMaxConnections: number | null;
  mysqlQueriesPerSec: number | null;
  mysqlSlowQueries: number | null;
  mysqlUptime: number | null;
  mysqlBufferPoolSize: number | null;
  mysqlBufferPoolUsed: number | null;
  lsConnections: number | null;
  lsSSLConnections: number | null;
  lsMaxConnections: number | null;
  lsReqPerSec: number | null;
  lsReqProcessing: number | null;
  lsTotalRequests: number | null;
  lsBpsIn: number | null;
  lsBpsOut: number | null;
  lsCacheHitsPerSec: number | null;
  lsStaticHitsPerSec: number | null;
  eximQueueSize: number | null;
  eximQueueFrozen: number | null;
  eximDeliveriesToday: number | null;
  eximReceivedToday: number | null;
  eximBouncesToday: number | null;
  eximRejectedToday: number | null;
  eximDeferredToday: number | null;
  cpanelAccounts: number | null;
  cpanelAccountsActive: number | null;
  cpanelAccountsSuspended: number | null;
  cpanelDomains: number | null;
}

export const AGENT_TYPES = [
  { value: 'NODE_EXPORTER', label: 'Node Exporter', defaultPort: 9100 },
  { value: 'MYSQL_EXPORTER', label: 'MySQL Exporter', defaultPort: 9104 },
  { value: 'POSTGRES_EXPORTER', label: 'PostgreSQL Exporter', defaultPort: 9187 },
  { value: 'MONGODB_EXPORTER', label: 'MongoDB Exporter', defaultPort: 9216 },
  { value: 'NGINX_EXPORTER', label: 'Nginx Exporter', defaultPort: 9113 },
  { value: 'REDIS_EXPORTER', label: 'Redis Exporter', defaultPort: 9121 },
  { value: 'LIBVIRT_EXPORTER', label: 'Libvirt Exporter', defaultPort: 9177 },
  { value: 'LITESPEED_EXPORTER', label: 'LiteSpeed Exporter', defaultPort: 9122 },
  { value: 'EXIM_EXPORTER', label: 'Exim Exporter', defaultPort: 9123 },
  { value: 'CPANEL_EXPORTER', label: 'cPanel Exporter', defaultPort: 9124 },
  { value: 'PROMTAIL', label: 'Promtail', defaultPort: 9080 },
  { value: 'APP_AGENT', label: 'Application Agent', defaultPort: 9101 },
  { value: 'CUSTOM', label: 'Custom Exporter', defaultPort: 9100 },
];

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function formatNetworkSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null) return 'N/A';
  const kbps = bytesPerSec / 1024;
  if (kbps < 1) return `${bytesPerSec.toFixed(0)} B/s`;
  const mbps = kbps / 1024;
  if (mbps < 1) return `${kbps.toFixed(1)} KB/s`;
  const gbps = mbps / 1024;
  if (gbps < 1) return `${mbps.toFixed(2)} MB/s`;
  return `${gbps.toFixed(2)} GB/s`;
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatMemoryBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function formatTraffic(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatBytesRate(bytesPerSec: number | null): string {
  if (bytesPerSec === null || bytesPerSec === 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  const i = Math.max(
    0,
    Math.min(units.length - 1, Math.floor(Math.log(bytesPerSec) / Math.log(1024)))
  );
  return `${(bytesPerSec / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
