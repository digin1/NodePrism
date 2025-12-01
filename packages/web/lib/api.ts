import axios, { AxiosResponse } from 'axios';

// Use relative URLs to go through Next.js proxy (avoids CORS issues)
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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
    sshPort?: number;
    sshUsername?: string;
    environment?: string;
    region?: string;
    tags?: string[];
  }) => api.post('/api/servers', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/servers/${id}`, data),
  delete: (id: string) => api.delete(`/api/servers/${id}`),
  deploy: (id: string, agentTypes?: string[]) =>
    api.post(`/api/servers/${id}/deploy`, { agentTypes }),
  stats: () => getData(api.get('/api/servers/stats/overview')),
};

// Alerts API
export const alertApi = {
  list: (params?: { status?: string; severity?: string; serverId?: string }) =>
    getData(api.get('/api/alerts', { params })),
  rules: () => getData(api.get('/api/alerts/rules')),
  createRule: (data: {
    name: string;
    description?: string;
    query: string;
    duration?: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'DEBUG';
    enabled?: boolean;
  }) => api.post('/api/alerts/rules', data),
  updateRule: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/alerts/rules/${id}`, data),
  deleteRule: (id: string) => api.delete(`/api/alerts/rules/${id}`),
  acknowledge: (id: string, acknowledgedBy?: string) =>
    api.post(`/api/alerts/${id}/acknowledge`, { acknowledgedBy }),
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
  unregister: (agentId: string) =>
    api.post('/api/agents/unregister', { agentId }),
};
