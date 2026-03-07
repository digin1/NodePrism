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
  list: (params?: { status?: string; environment?: string; search?: string }) =>
    getData(api.get('/api/servers', { params })),
  get: (id: string) => getData(api.get(`/api/servers/${id}`)),
  create: (data: {
    hostname: string;
    ipAddress: string;
    environment?: string;
    region?: string;
    tags?: string[];
  }) => api.post('/api/servers', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/api/servers/${id}`, data),
  delete: (id: string) => api.delete(`/api/servers/${id}`),
  stats: () => getData(api.get('/api/servers/stats/overview')),
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
  acknowledge: (id: string, acknowledgedBy?: string) =>
    api.post(`/api/alerts/${id}/acknowledge`, { acknowledgedBy }),
  silence: (id: string, silencedBy?: string, duration?: number) =>
    api.post(`/api/alerts/${id}/silence`, { silencedBy, duration }),
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
};

// Health API
export const healthApi = {
  check: () => getRaw(api.get('/health')),
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
};
