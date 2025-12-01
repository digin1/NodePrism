import { MetricType } from './metric';

export interface MonitoredMetricDefinition {
  name: string;
  displayName: string;
  category: MetricType;
  labelKey?: string | null;
  description?: string;
  isCounter?: boolean;
  promql?: string;
}

export const DEFAULT_MONITORED_METRICS: MonitoredMetricDefinition[] = [
  {
    name: 'node_cpu_seconds_total',
    displayName: 'CPU Usage',
    category: 'cpu',
    labelKey: 'mode',
    description: 'Per-mode CPU seconds exposed by node_exporter',
    isCounter: true,
  },
  {
    name: 'node_memory_MemAvailable_bytes',
    displayName: 'Memory Available',
    category: 'memory',
    description: 'Available memory bytes',
  },
  {
    name: 'node_memory_MemTotal_bytes',
    displayName: 'Memory Total',
    category: 'memory',
    description: 'Total memory bytes',
  },
  {
    name: 'node_filesystem_avail_bytes',
    displayName: 'Filesystem Available',
    category: 'disk',
    labelKey: 'mountpoint',
    description: 'Available bytes per filesystem mount',
  },
  {
    name: 'node_network_receive_bytes_total',
    displayName: 'Network Receive',
    category: 'network',
    labelKey: 'device',
    description: 'Network receive bytes per device',
    isCounter: true,
  },
  {
    name: 'node_network_transmit_bytes_total',
    displayName: 'Network Transmit',
    category: 'network',
    labelKey: 'device',
    description: 'Network transmit bytes per device',
    isCounter: true,
  },
  {
    name: 'node_load1',
    displayName: 'Load Average 1m',
    category: 'cpu',
    description: '1-minute load average',
  },
  {
    name: 'node_load5',
    displayName: 'Load Average 5m',
    category: 'cpu',
    description: '5-minute load average',
  },
  {
    name: 'node_disk_read_bytes_total',
    displayName: 'Disk Read Bytes',
    category: 'disk',
    labelKey: 'device',
    description: 'Disk read bytes per device',
    isCounter: true,
  },
  {
    name: 'node_disk_written_bytes_total',
    displayName: 'Disk Written Bytes',
    category: 'disk',
    labelKey: 'device',
    description: 'Disk written bytes per device',
    isCounter: true,
  },
];
