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
};

// Health API
export const healthApi = {
  check: () => getRaw(api.get('/health')),
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

export const containerApi = {
  listByServer: (serverId: string) =>
    getData<VirtualContainer[]>(api.get(`/api/containers/server/${serverId}`)),
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
  serverId: string;
  reason: string;
  startTime: string;
  endTime: string;
  createdBy: string | null;
  createdAt: string;
  server?: { id: string; hostname: string; ipAddress: string };
}

// Maintenance Window API
export const maintenanceApi = {
  list: (params?: { serverId?: string; active?: string }) =>
    getData<MaintenanceWindow[]>(api.get('/api/maintenance-windows', { params })),
  get: (id: string) =>
    getData<MaintenanceWindow>(api.get(`/api/maintenance-windows/${id}`)),
  create: (data: { serverId: string; reason: string; startTime: string; endTime: string }) =>
    getData<MaintenanceWindow>(api.post('/api/maintenance-windows', data)),
  update: (id: string, data: Partial<{ reason: string; startTime: string; endTime: string }>) =>
    getData<MaintenanceWindow>(api.put(`/api/maintenance-windows/${id}`, data)),
  delete: (id: string) =>
    api.delete(`/api/maintenance-windows/${id}`),
  serverActive: (serverId: string) =>
    getData<{ inMaintenance: boolean; window: MaintenanceWindow | null }>(api.get(`/api/maintenance-windows/server/${serverId}/active`)),
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
  exportConfig: () => getData(api.get('/api/settings/export')),
  importConfig: (data: Record<string, unknown>, mode: 'skip' | 'overwrite') =>
    getData(api.post('/api/settings/import', { data, mode })),
};

// Dashboard types
export interface DashboardPanel {
  id: string;
  title: string;
  type: 'line' | 'area' | 'bar' | 'gauge' | 'stat' | 'table';
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
