import axios, { AxiosResponse } from 'axios';

// Use relative URLs to go through Next.js proxy (avoids CORS issues)
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token interceptor
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('nodeprism_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Common response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  count?: number;
  message?: string;
  error?: string;
}

// Helper to extract data from API response
async function getData<T>(promise: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const res = await promise;
  return res.data.data;
}

async function getRaw<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

// Server API
export const serverApi = {
  list: (params?: { status?: string; environment?: string; search?: string; tag?: string }) =>
    getData(api.get('/api/servers', { params })),
  get: (id: string) => getData(api.get(`/api/servers/${id}`)),
  create: (data: {
    hostname: string;
    ipAddress: string;
    environment?: string;
    groupId?: string | null;
    region?: string;
    tags?: string[];
  }) => api.post('/api/servers', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/api/servers/${id}`, data),
  delete: (id: string) => api.delete(`/api/servers/${id}`),
  stats: () => getData(api.get('/api/servers/stats/overview')),
  tags: () => getData<string[]>(api.get('/api/servers/tags')),
  bulkTags: (data: { serverIds: string[]; addTags?: string[]; removeTags?: string[] }) =>
    api.put('/api/servers/tags/bulk', data),
  bulkDelete: (serverIds: string[]) =>
    api.delete('/api/servers/bulk', { data: { serverIds } }),
};

// Server Group API
export interface ServerGroup {
  id: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder: number;
  children?: ServerGroup[];
  _count?: { servers: number };
}

export const serverGroupApi = {
  list: (flat?: boolean) => getData<ServerGroup[]>(api.get('/api/server-groups', { params: flat ? { flat: 'true' } : {} })),
  get: (id: string) => getData(api.get(`/api/server-groups/${id}`)),
  create: (data: { name: string; description?: string; parentId?: string | null; sortOrder?: number }) =>
    getData<ServerGroup>(api.post('/api/server-groups', data)),
  update: (id: string, data: Partial<{ name: string; description: string; parentId: string | null; sortOrder: number }>) =>
    getData<ServerGroup>(api.put(`/api/server-groups/${id}`, data)),
  delete: (id: string) => api.delete(`/api/server-groups/${id}`),
  moveServers: (serverIds: string[], groupId: string | null) =>
    api.post('/api/server-groups/move-servers', { serverIds, groupId }),
};

// Alerts API
export const alertApi = {
  list: (params?: { status?: string; severity?: string; serverId?: string }) =>
    getData(api.get('/api/alerts', { params })),
  rules: () => getData(api.get('/api/alerts/rules')),
  templates: () => getData(api.get('/api/alerts/templates')),
  createRule: (data: {
    name: string;
    description?: string;
    query: string;
    duration?: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'DEBUG';
    enabled?: boolean;
  }) => api.post('/api/alerts/rules', data),
  createTemplate: (data: {
    name: string;
    description?: string;
    matchLabels?: Record<string, string>;
    matchHostLabels?: Record<string, string>;
    query: string;
    calc?: string;
    units?: string;
    warnCondition: { condition: string; hysteresis?: { trigger: number; clear: number } };
    critCondition: { condition: string; hysteresis?: { trigger: number; clear: number } };
    every?: string;
    for?: string;
    actions?: any[];
  }) => api.post('/api/alerts/templates', data),
  updateRule: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/alerts/rules/${id}`, data),
  updateTemplate: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/alerts/templates/${id}`, data),
  deleteRule: (id: string) => api.delete(`/api/alerts/rules/${id}`),
  deleteTemplate: (id: string) => api.delete(`/api/alerts/templates/${id}`),
  testTemplate: (id: string) => getData(api.post(`/api/alerts/templates/${id}/test`)),
  acknowledge: (id: string, acknowledgedBy?: string) =>
    api.post(`/api/alerts/${id}/acknowledge`, { acknowledgedBy }),
  silence: (id: string, silencedBy?: string, duration?: number) =>
    api.post(`/api/alerts/${id}/silence`, { silencedBy, duration }),
  bulkAcknowledge: (alertIds: string[], acknowledgedBy?: string) =>
    api.post('/api/alerts/bulk/acknowledge', { alertIds, acknowledgedBy }),
  bulkSilence: (alertIds: string[], silencedBy?: string, duration?: number) =>
    api.post('/api/alerts/bulk/silence', { alertIds, silencedBy, duration }),
  history: (params?: { serverId?: string; limit?: number; offset?: number }) =>
    getData(api.get('/api/alerts/history', { params })),
  stats: () => getData(api.get('/api/alerts/stats')),
};

// Metrics API
export const metricsApi = {
  query: (query: string, time?: number) =>
    getData(api.get('/api/metrics/query', { params: { query, time } })),
  queryRange: (query: string, start?: number, end?: number, step?: string) =>
    getData(api.get('/api/metrics/query_range', { params: { query, start, end, step } })),
  serverMetrics: (serverId: string) => getData(api.get(`/api/metrics/server/${serverId}`)),
  targets: () => getData(api.get('/api/metrics/targets')),
  rules: () => getData(api.get('/api/metrics/rules')),
  bandwidthTop: (params?: { period?: string; limit?: number }) =>
    getData(api.get('/api/metrics/bandwidth/top', { params })),
  diskUsage: (serverId: string) =>
    getData<DiskMount[]>(api.get(`/api/metrics/server/${serverId}/disk-usage`)),
};

export interface DiskMount {
  mount: string;
  device: string;
  fstype: string;
  sizeBytes: number;
  availBytes: number;
  usedBytes: number;
}

// Logs API (Loki)
export const logsApi = {
  query: (params: { query: string; start: string; end: string; limit: number }) =>
    getData(api.get('/api/logs', { params })),
  labels: () => getData<string[]>(api.get('/api/logs/labels')),
  labelValues: (labelName: string) =>
    getData<string[]>(api.get(`/api/logs/labels/${labelName}/values`)),
};

// Health API
export const healthApi = {
  check: () => getRaw(api.get('/health')),
};

// System Status API
export const systemStatusApi = {
  get: () => getRaw(api.get('/api/system-status')),
};

// User Management API
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  lastLogin: string | null;
  createdAt: string;
}

export const userApi = {
  list: () => getData<UserInfo[]>(api.get('/api/auth/users')),
  create: (data: { email: string; name: string; password: string; role: string }) =>
    api.post('/api/auth/register', data),
  update: (id: string, data: { name?: string; role?: string; password?: string }) =>
    getData<UserInfo>(api.put(`/api/auth/users/${id}`, data)),
  delete: (id: string) => api.delete(`/api/auth/users/${id}`),
};

// Anomaly API
export const anomalyApi = {
  list: () => getData(api.get('/api/anomalies')),
  serverAnomalies: (serverId: string) => getData(api.get(`/api/anomalies/server/${serverId}`)),
  rates: () => getData(api.get('/api/anomalies/rates')),
  serverRate: (serverId: string) => getData(api.get(`/api/anomalies/rate/${serverId}`)),
  events: (params?: { serverId?: string; limit?: number; offset?: number }) =>
    getData(api.get('/api/anomalies/events', { params })),
  models: (params?: { serverId?: string; limit?: number; offset?: number }) =>
    getData(api.get('/api/anomalies/models', { params })),
  stats: () => getData(api.get('/api/anomalies/stats')),
};

// Container API
export interface VirtualContainer {
  id: string;
  serverId: string;
  containerId: string;
  name: string;
  type: string;
  status: string;
  ipAddress: string | null;
  hostname: string | null;
  networkRxBytes: string;
  networkTxBytes: string;
  metadata: Record<string, unknown> | null;
  lastSeen: string | null;
}

export interface ContainerMetrics {
  domain: string;
  cpuPercent: number | null;
  memoryUsageBytes: number | null;
  memoryMaxBytes: number | null;
  vCPUs: number | null;
  diskReadBytesPerSec: number | null;
  diskWriteBytesPerSec: number | null;
  netRxBytesPerSec: number | null;
  netTxBytesPerSec: number | null;
}

export interface StoragePool {
  name: string;
  sizeBytes: number;
  freeBytes: number;
}

export interface ContainerMetricsResponse {
  success: boolean;
  data: ContainerMetrics[];
  storagePool: StoragePool | null;
}

export const containerApi = {
  listByServer: (serverId: string) =>
    getData<VirtualContainer[]>(api.get(`/api/containers/server/${serverId}`)),
  get: (id: string) =>
    getData<VirtualContainer & { server?: { id: string; hostname: string; ipAddress: string } }>(
      api.get(`/api/containers/${id}`)
    ),
  metrics: (serverId: string) =>
    getRaw<ContainerMetricsResponse>(api.get(`/api/containers/server/${serverId}/metrics`)),
};

// Agent API
export const agentApi = {
  list: (params?: { serverId?: string; type?: string; status?: string }) =>
    getData(api.get('/api/agents', { params })),
  register: (data: {
    hostname: string;
    ipAddress: string;
    agentType: string;
    port: number;
    version?: string;
  }) => api.post('/api/agents/register', data),
  unregister: (agentId: string) => api.post('/api/agents/unregister', { agentId }),
  latestVersion: (type: string) =>
    getData<{ type: string; latestVersion: string; changelog?: string }>(
      api.get(`/api/agents/latest-version/${type}`)
    ),
};

// Audit types
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}

// Audit API
export const auditApi = {
  list: (params?: { action?: string; entityType?: string; userId?: string; limit?: number; offset?: number }) =>
    getData<AuditLogEntry[]>(api.get('/api/audit', { params })),
  entityTrail: (entityType: string, entityId: string) =>
    getData<AuditLogEntry[]>(api.get(`/api/audit/entity/${entityType}/${entityId}`)),
  stats: () => getData<{ total: number; last24h: number; byAction: { action: string; count: number }[] }>(
    api.get('/api/audit/stats')
  ),
};

// Notification types
export interface NotificationChannel {
  id: string;
  name: string;
  type: 'EMAIL' | 'SLACK' | 'DISCORD' | 'WEBHOOK' | 'TELEGRAM' | 'PAGERDUTY';
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { logs: number };
}

export interface NotificationLog {
  id: string;
  channelId: string;
  alertId: string;
  status: string;
  message: string | null;
  createdAt: string;
  channel?: { name: string; type: string };
}

// Notification API
export const notificationApi = {
  listChannels: () =>
    getData<NotificationChannel[]>(api.get('/api/notifications/channels')),
  getChannel: (id: string) =>
    getData<NotificationChannel>(api.get(`/api/notifications/channels/${id}`)),
  createChannel: (data: { name: string; type: string; config: Record<string, unknown>; enabled?: boolean }) =>
    getData<NotificationChannel>(api.post('/api/notifications/channels', data)),
  updateChannel: (id: string, data: Partial<{ name: string; type: string; config: Record<string, unknown>; enabled: boolean }>) =>
    getData<NotificationChannel>(api.put(`/api/notifications/channels/${id}`, data)),
  deleteChannel: (id: string) =>
    api.delete(`/api/notifications/channels/${id}`),
  testChannel: (id: string) =>
    getData<{ message: string }>(api.post(`/api/notifications/channels/${id}/test`)),
  logs: (params?: { channelId?: string; status?: string; limit?: number }) =>
    getData<NotificationLog[]>(api.get('/api/notifications/logs', { params })),
};

// Maintenance Window types
export interface MaintenanceWindow {
  id: string;
  serverId: string | null;
  uptimeMonitorId: string | null;
  scope: 'SERVER' | 'MONITOR' | 'GLOBAL';
  reason: string;
  startTime: string;
  endTime: string;
  recurring: boolean;
  rrule: string | null;
  createdBy: string | null;
  createdAt: string;
  server?: { id: string; hostname: string; ipAddress: string } | null;
  uptimeMonitor?: { id: string; name: string; target: string } | null;
}

// Maintenance Window API
export const maintenanceApi = {
  list: (params?: { serverId?: string; active?: string; scope?: string }) =>
    getData<MaintenanceWindow[]>(api.get('/api/maintenance-windows', { params })),
  get: (id: string) =>
    getData<MaintenanceWindow>(api.get(`/api/maintenance-windows/${id}`)),
  create: (data: { serverId?: string | null; uptimeMonitorId?: string | null; scope?: string; reason: string; startTime: string; endTime: string; recurring?: boolean; rrule?: string | null }) =>
    getData<MaintenanceWindow>(api.post('/api/maintenance-windows', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData<MaintenanceWindow>(api.put(`/api/maintenance-windows/${id}`, data)),
  delete: (id: string) =>
    api.delete(`/api/maintenance-windows/${id}`),
  serverActive: (serverId: string) =>
    getData<{ inMaintenance: boolean; window: MaintenanceWindow | null }>(api.get(`/api/maintenance-windows/server/${serverId}/active`)),
};

// Uptime API
export const uptimeApi = {
  list: () => getData(api.get('/api/uptime')),
  get: (id: string) => getData(api.get(`/api/uptime/${id}`)),
  create: (data: { name: string; type: string; target: string; interval?: number; timeout?: number; method?: string; expectedStatus?: number; keyword?: string }) =>
    getData(api.post('/api/uptime', data)),
  update: (id: string, data: Record<string, unknown>) => getData(api.put(`/api/uptime/${id}`, data)),
  delete: (id: string) => api.delete(`/api/uptime/${id}`),
  checks: (id: string, params?: { start?: string; end?: string; limit?: number }) =>
    getData(api.get(`/api/uptime/${id}/checks`, { params })),
  stats: () => getData(api.get('/api/uptime/stats/overview')),
  test: (id: string) => getData(api.post(`/api/uptime/${id}/test`)),
};

// Incident API
export const incidentApi = {
  list: (params?: { status?: string; severity?: string; limit?: number; offset?: number }) =>
    getData(api.get('/api/incidents', { params })),
  get: (id: string) => getData(api.get(`/api/incidents/${id}`)),
  create: (data: { title: string; description?: string; severity: string; assignee?: string; alertId?: string; serverId?: string; createdBy?: string }) =>
    getData(api.post('/api/incidents', data)),
  update: (id: string, data: Record<string, unknown>) => getData(api.put(`/api/incidents/${id}`, data)),
  delete: (id: string) => api.delete(`/api/incidents/${id}`),
  addUpdate: (id: string, data: { message: string; status?: string; createdBy?: string }) =>
    getData(api.post(`/api/incidents/${id}/updates`, data)),
  fromAlert: (alertId: string) => getData(api.post('/api/incidents/from-alert', { alertId })),
  stats: () => getData(api.get('/api/incidents/stats')),
  analyze: (id: string) => getData(api.post(`/api/incidents/${id}/analyze`)),
};

// Forecasting API
export const forecastApi = {
  disk: (serverId: string) => getData(api.get(`/api/forecasting/disk/${serverId}`)),
  memory: (serverId: string) => getData(api.get(`/api/forecasting/memory/${serverId}`)),
  cpu: (serverId: string) => getData(api.get(`/api/forecasting/cpu/${serverId}`)),
  all: (serverId: string) => getData(api.get(`/api/forecasting/all/${serverId}`)),
};

// Settings types
export interface SystemSettings {
  systemName: string;
  logoUrl?: string | null;
  primaryColor: string;
  managerHostname?: string | null;
  managerIp?: string | null;
  timezone: string;
  dateFormat: string;
  dailyReportTime: string;
}

// Settings API
export const settingsApi = {
  get: () => getData<SystemSettings>(api.get('/api/settings')),
  getAll: () => getData(api.get('/api/settings/all')),
  update: (data: Partial<SystemSettings>) => getData(api.put('/api/settings', data)),
  uploadLogo: async (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    // Must explicitly remove Content-Type so browser can set multipart/form-data with boundary
    const res = await api.post('/api/settings/logo', formData, {
      headers: {
        'Content-Type': undefined,
      },
    });
    return res.data;
  },
  deleteLogo: () => api.delete('/api/settings/logo'),
  getSystemInfo: () => getData(api.get('/api/settings/system-info')),
  triggerBackup: () => getData(api.post('/api/settings/backup')),
  triggerDailyReport: () => getData(api.post('/api/settings/daily-report')),
  exportConfig: () => getData(api.get('/api/settings/export')),
  importConfig: (data: Record<string, unknown>, mode: 'skip' | 'overwrite') =>
    getData(api.post('/api/settings/import', { data, mode })),
};

// Dashboard types
export interface DashboardPanel {
  id: string;
  title: string;
  type: 'line' | 'area' | 'bar' | 'gauge' | 'stat' | 'table' | 'heatmap';
  query: string;
  span: number;
  height: number;
  options?: Record<string, unknown>;
}

export interface DashboardConfig {
  panels: DashboardPanel[];
  refreshInterval?: number;
  timeRange?: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  config: DashboardConfig;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Escalation Policy API
export const escalationPolicyApi = {
  list: () => getData(api.get('/api/escalation-policies')),
  get: (id: string) => getData(api.get(`/api/escalation-policies/${id}`)),
  create: (data: { name: string; enabled?: boolean; steps: { stepOrder: number; delayMinutes: number; channelId: string }[] }) =>
    getData(api.post('/api/escalation-policies', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/escalation-policies/${id}`, data)),
  delete: (id: string) => api.delete(`/api/escalation-policies/${id}`),
};

// API Token API
export const apiTokenApi = {
  list: () => getData(api.get('/api/api-tokens')),
  create: (data: { name: string; expiresAt?: string; permissions?: string[] }) =>
    getData(api.post('/api/api-tokens', data)),
  revoke: (id: string) => api.post(`/api/api-tokens/${id}/revoke`),
  delete: (id: string) => api.delete(`/api/api-tokens/${id}`),
};

// Post-Mortem API
export const postMortemApi = {
  list: () => getData(api.get('/api/post-mortems')),
  get: (incidentId: string) => getData(api.get(`/api/post-mortems/${incidentId}`)),
  create: (data: { incidentId: string; summary: string; rootCause: string; impact: string; timeline: string; actionItems?: string[]; createdBy?: string }) =>
    getData(api.post('/api/post-mortems', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/post-mortems/${id}`, data)),
  delete: (id: string) => api.delete(`/api/post-mortems/${id}`),
  publish: (id: string) => api.post(`/api/post-mortems/${id}/publish`),
};

// Alert Routing Rule API
export const alertRoutingRuleApi = {
  list: () => getData(api.get('/api/alert-routing-rules')),
  get: (id: string) => getData(api.get(`/api/alert-routing-rules/${id}`)),
  create: (data: { name: string; enabled?: boolean; priority?: number; conditions: { severity?: string[]; tags?: string[]; timeWindow?: { start: string; end: string; timezone?: string } }; channelIds: string[]; muteOthers?: boolean }) =>
    getData(api.post('/api/alert-routing-rules', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/alert-routing-rules/${id}`, data)),
  delete: (id: string) => api.delete(`/api/alert-routing-rules/${id}`),
};

// Alert Inhibition Rule API
export const alertInhibitionRuleApi = {
  list: () => getData(api.get('/api/alert-inhibition-rules')),
  get: (id: string) => getData(api.get(`/api/alert-inhibition-rules/${id}`)),
  create: (data: { name: string; sourceMatch: Record<string, string>; targetMatch: Record<string, string>; sourceSeverity: string; targetSeverity: string; enabled?: boolean }) =>
    getData(api.post('/api/alert-inhibition-rules', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/alert-inhibition-rules/${id}`, data)),
  delete: (id: string) => api.delete(`/api/alert-inhibition-rules/${id}`),
};

// SLA Policy API
export const slaPolicyApi = {
  list: () => getData(api.get('/api/sla-policies')),
  get: (id: string) => getData(api.get(`/api/sla-policies/${id}`)),
  create: (data: { name: string; uptimeMonitorId: string; targetPercent: number; windowDays: number; enabled?: boolean }) =>
    getData(api.post('/api/sla-policies', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/sla-policies/${id}`, data)),
  delete: (id: string) => api.delete(`/api/sla-policies/${id}`),
  compliance: (id: string) => getData(api.get(`/api/sla-policies/${id}/compliance`)),
};

// Dashboard API
export const dashboardApi = {
  list: () => getData<Dashboard[]>(api.get('/api/dashboards')),
  get: (id: string) => getData<Dashboard>(api.get(`/api/dashboards/${id}`)),
  create: (data: { name: string; description?: string; config: DashboardConfig; isDefault?: boolean }) =>
    getData<Dashboard>(api.post('/api/dashboards', data)),
  update: (id: string, data: Partial<{ name: string; description: string; config: DashboardConfig; isDefault: boolean }>) =>
    getData<Dashboard>(api.put(`/api/dashboards/${id}`, data)),
  delete: (id: string) => api.delete(`/api/dashboards/${id}`),
};

// Annotation API
export const annotationApi = {
  list: (params?: { start?: string; end?: string; tags?: string }) =>
    getData(api.get('/api/annotations', { params })),
  create: (data: { title: string; message?: string; tags?: string[]; startTime: string; endTime?: string; color?: string }) =>
    getData(api.post('/api/annotations', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/annotations/${id}`, data)),
  delete: (id: string) => api.delete(`/api/annotations/${id}`),
};

// Composite Monitor API
export const compositeMonitorApi = {
  list: () => getData(api.get('/api/composite-monitors')),
  get: (id: string) => getData(api.get(`/api/composite-monitors/${id}`)),
  create: (data: { name: string; description?: string; expression: string; monitorIds: string[]; enabled?: boolean }) =>
    getData(api.post('/api/composite-monitors', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/composite-monitors/${id}`, data)),
  delete: (id: string) => api.delete(`/api/composite-monitors/${id}`),
  evaluate: (id: string) => getData(api.get(`/api/composite-monitors/${id}/evaluate`)),
};

// Alert Group API
export const alertGroupApi = {
  list: () => getData(api.get('/api/alert-groups')),
  get: (id: string) => getData(api.get(`/api/alert-groups/${id}`)),
  resolve: (id: string) => getData(api.put(`/api/alert-groups/${id}/resolve`)),
};

// Multi-Step Monitor API
export const multiStepMonitorApi = {
  list: () => getData(api.get('/api/multi-step-monitors')),
  get: (id: string) => getData(api.get(`/api/multi-step-monitors/${id}`)),
  create: (data: { name: string; interval?: number; timeout?: number; enabled?: boolean; steps: { stepOrder: number; name: string; method: string; url: string; headers?: Record<string,string>; body?: string; expectedStatus?: number; extractVars?: Record<string,string>; assertions?: Record<string,unknown> }[] }) =>
    getData(api.post('/api/multi-step-monitors', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/multi-step-monitors/${id}`, data)),
  delete: (id: string) => api.delete(`/api/multi-step-monitors/${id}`),
  run: (id: string) => getData(api.post(`/api/multi-step-monitors/${id}/run`)),
  results: (id: string, params?: { limit?: number }) =>
    getData(api.get(`/api/multi-step-monitors/${id}/results`, { params })),
};

// Scheduled Report API
export const scheduledReportApi = {
  list: () => getData(api.get('/api/scheduled-reports')),
  get: (id: string) => getData(api.get(`/api/scheduled-reports/${id}`)),
  create: (data: { name: string; type: string; schedule: string; recipients?: { emails: string[]; channelIds: string[] }; enabled?: boolean }) =>
    getData(api.post('/api/scheduled-reports', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/scheduled-reports/${id}`, data)),
  delete: (id: string) => api.delete(`/api/scheduled-reports/${id}`),
  send: (id: string) => getData(api.post(`/api/scheduled-reports/${id}/send`)),
};

// On-Call Schedule API
export const onCallApi = {
  list: () => getData(api.get('/api/on-call-schedules')),
  get: (id: string) => getData(api.get(`/api/on-call-schedules/${id}`)),
  create: (data: { name: string; timezone?: string }) => getData(api.post('/api/on-call-schedules', data)),
  update: (id: string, data: Record<string, unknown>) => getData(api.put(`/api/on-call-schedules/${id}`, data)),
  delete: (id: string) => api.delete(`/api/on-call-schedules/${id}`),
  addRotation: (id: string, data: { userId: string; startTime: string; endTime: string }) => getData(api.post(`/api/on-call-schedules/${id}/rotations`, data)),
  removeRotation: (rotationId: string) => api.delete(`/api/on-call-schedules/rotations/${rotationId}`),
  current: () => getData(api.get('/api/on-call-schedules/current')),
};

// SLO API
export const sloApi = {
  list: () => getData(api.get('/api/slos')),
  get: (id: string) => getData(api.get(`/api/slos/${id}`)),
  create: (data: { name: string; description?: string; targetPercent: number; windowDays: number; uptimeMonitorId?: string; metricQuery?: string; enabled?: boolean }) =>
    getData(api.post('/api/slos', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/slos/${id}`, data)),
  delete: (id: string) => api.delete(`/api/slos/${id}`),
  budget: (id: string) => getData(api.get(`/api/slos/${id}/budget`)),
};

// SNMP Device API
export const snmpDeviceApi = {
  list: () => getData(api.get('/api/snmp-devices')),
  get: (id: string) => getData(api.get(`/api/snmp-devices/${id}`)),
  create: (data: { name: string; host: string; port?: number; version?: string; community?: string; authConfig?: Record<string, unknown>; oids: Record<string, unknown>[]; interval?: number; enabled?: boolean }) =>
    getData(api.post('/api/snmp-devices', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/snmp-devices/${id}`, data)),
  delete: (id: string) => api.delete(`/api/snmp-devices/${id}`),
  results: (id: string, params?: { limit?: number; offset?: number }) =>
    getData(api.get(`/api/snmp-devices/${id}/results`, { params })),
  poll: (id: string) => getData(api.post(`/api/snmp-devices/${id}/poll`)),
};

// Retention Policy API
export const retentionPolicyApi = {
  list: () => getData(api.get('/api/retention-policies')),
  create: (data: { metricType: string; retentionDays: number; enabled?: boolean }) =>
    getData(api.post('/api/retention-policies', data)),
  update: (id: string, data: { retentionDays?: number; enabled?: boolean }) =>
    getData(api.put(`/api/retention-policies/${id}`, data)),
  delete: (id: string) => api.delete(`/api/retention-policies/${id}`),
};

// Service Dependency API
export const serviceDependencyApi = {
  list: () => getData(api.get('/api/service-dependencies')),
  create: (data: { sourceId: string; sourceType: string; targetId: string; targetType: string; label?: string }) =>
    getData(api.post('/api/service-dependencies', data)),
  delete: (id: string) => api.delete(`/api/service-dependencies/${id}`),
  map: () => getData(api.get('/api/service-dependencies/map')),
};

// Infrastructure Change API
export const infraChangeApi = {
  list: (params?: { serverId?: string; changeType?: string; start?: string; end?: string; limit?: number; offset?: number }) =>
    getData(api.get('/api/infra-changes', { params })),
  create: (data: { serverId?: string; changeType: string; source: string; title: string; details?: Record<string, unknown>; detectedAt?: string }) =>
    getData(api.post('/api/infra-changes', data)),
  delete: (id: string) => api.delete(`/api/infra-changes/${id}`),
};

// Kubernetes Cluster API
export const kubernetesApi = {
  list: () => getData(api.get('/api/kubernetes')),
  get: (id: string) => getData(api.get(`/api/kubernetes/${id}`)),
  create: (data: { name: string; apiEndpoint: string; authConfig: { token?: string } }) =>
    getData(api.post('/api/kubernetes', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/kubernetes/${id}`, data)),
  delete: (id: string) => api.delete(`/api/kubernetes/${id}`),
  status: (id: string) => getData(api.get(`/api/kubernetes/${id}/status`)),
};

// Synthetic Check API
export const syntheticCheckApi = {
  list: () => getData(api.get('/api/synthetic-checks')),
  get: (id: string) => getData(api.get(`/api/synthetic-checks/${id}`)),
  create: (data: { name: string; script: string; interval?: number; timeout?: number; enabled?: boolean }) =>
    getData(api.post('/api/synthetic-checks', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/synthetic-checks/${id}`, data)),
  delete: (id: string) => api.delete(`/api/synthetic-checks/${id}`),
  run: (id: string) => getData(api.post(`/api/synthetic-checks/${id}/run`)),
  results: (id: string, params?: { limit?: number; offset?: number }) =>
    getData(api.get(`/api/synthetic-checks/${id}/results`, { params })),
};

// Status Page API
export const statusPageApi = {
  list: () => getData(api.get('/api/status-pages')),
  get: (id: string) => getData(api.get(`/api/status-pages/${id}`)),
  create: (data: { slug: string; title: string; description?: string; components?: { name: string; uptimeMonitorId?: string; sortOrder?: number }[] }) =>
    getData(api.post('/api/status-pages', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/status-pages/${id}`, data)),
  delete: (id: string) => api.delete(`/api/status-pages/${id}`),
  getPublic: (slug: string) => getRaw(api.get(`/api/status-pages/public/${slug}`)),
  subscribe: (slug: string, data: { type: string; endpoint: string }) =>
    api.post(`/api/status-pages/public/${slug}/subscribe`, data),
};

// OTLP / Traces API
export const otlpApi = {
  services: () => getData<string[]>(api.get('/api/otlp/services')),
  traces: (params?: { serviceName?: string; start?: string; end?: string; limit?: number }) =>
    getData(api.get('/api/otlp/traces', { params })),
  traceDetail: (traceId: string) => getData(api.get(`/api/otlp/traces/${traceId}`)),
  ingest: (data: { resourceSpans: any[] }) => api.post('/api/otlp/v1/traces', data),
};

// Runbook API
export const runbookApi = {
  list: () => getData(api.get('/api/runbooks')),
  get: (id: string) => getData(api.get(`/api/runbooks/${id}`)),
  create: (data: { name: string; description?: string; script: string; language?: string; timeout?: number; enabled?: boolean }) =>
    getData(api.post('/api/runbooks', data)),
  update: (id: string, data: Record<string, unknown>) =>
    getData(api.put(`/api/runbooks/${id}`, data)),
  delete: (id: string) => api.delete(`/api/runbooks/${id}`),
  execute: (id: string, data?: { alertId?: string; serverId?: string }) =>
    getData(api.post(`/api/runbooks/${id}/execute`, data || {})),
  executions: (id: string, params?: { limit?: number }) =>
    getData(api.get(`/api/runbooks/${id}/executions`, { params })),
};

// RUM API
export const rumApi = {
  stats: (params?: { start?: string; end?: string }) =>
    getData(api.get('/api/rum/stats', { params })),
  sessions: (params?: { limit?: number; offset?: number }) =>
    getData(api.get('/api/rum/sessions', { params })),
  beacon: (data: { sessionId: string; url: string; loadTime?: number; domContentLoaded?: number; firstPaint?: number; lcp?: number; fid?: number; cls?: number; errorCount?: number; userAgent?: string; country?: string }) =>
    api.post('/api/rum/beacon', data),
};
