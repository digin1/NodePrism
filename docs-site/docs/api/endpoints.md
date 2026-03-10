---
sidebar_position: 2
title: API Endpoints
---

# API Endpoints


## Base URL

```
http://localhost:4000/api
```

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

---

## Agents

Base path: `/api/agents`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/agents/register` | - | Apply lenient rate limiting for agent heartbeats/registrations |
| POST | `/agents/heartbeat` | - | Apply lenient rate limiting for agent heartbeats/registrations |
| POST | `/agents/unregister` | - | Apply lenient rate limiting for agent heartbeats/registrations |
| GET | `/agents` | - | Apply lenient rate limiting for agent heartbeats/registrations |
| GET | `/agents/latest-version/:type` | - | Apply lenient rate limiting for agent heartbeats/registrations |

## Alerts

Base path: `/api/alerts`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/alerts` | - | Validation schemas |
| GET | `/alerts/rules` | - | Validation schemas |
| GET | `/alerts/templates` | - | Validation schemas |
| POST | `/alerts/templates` | - | Validation schemas |
| GET | `/alerts/templates/:id` | - | Validation schemas |
| PUT | `/alerts/templates/:id` | - | Validation schemas |
| DELETE | `/alerts/templates/:id` | - | Validation schemas |
| POST | `/alerts/templates/:id/test` | - | Validation schemas |
| POST | `/alerts/rules` | - | Validation schemas |
| PUT | `/alerts/rules/:id` | - | Validation schemas |
| DELETE | `/alerts/rules/:id` | - | Validation schemas |
| POST | `/alerts/bulk/acknowledge` | - | Validation schemas |
| POST | `/alerts/bulk/silence` | - | Validation schemas |
| POST | `/alerts/:id/acknowledge` | - | Validation schemas |
| POST | `/alerts/:id/silence` | - | Validation schemas |
| POST | `/alerts/webhook` | - | Validation schemas |
| GET | `/alerts/stats` | - | Validation schemas |
| GET | `/alerts/history` | - | Validation schemas |

## Anomalies

Base path: `/api/anomalies`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/anomalies` | - | Redis connection for anomaly scores |
| GET | `/anomalies/server/:serverId` | - | Redis connection for anomaly scores |
| GET | `/anomalies/rates` | - | Redis connection for anomaly scores |
| GET | `/anomalies/rate/:serverId` | - | Redis connection for anomaly scores |
| GET | `/anomalies/events` | - | Redis connection for anomaly scores |
| GET | `/anomalies/models` | - | Redis connection for anomaly scores |
| GET | `/anomalies/stats` | - | Redis connection for anomaly scores |
| POST | `/anomalies/events` | - | Redis connection for anomaly scores |
| PUT | `/anomalies/events/:id/resolve` | - | Redis connection for anomaly scores |

## Audit

Base path: `/api/audit`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/audit` | ✓ | All audit routes require ADMIN role |
| GET | `/audit/entity/:type/:id` | ✓ | All audit routes require ADMIN role |
| GET | `/audit/stats` | ✓ | All audit routes require ADMIN role |

## Auth

Base path: `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | - | Apply strict rate limiting to auth routes |
| POST | `/auth/login` | - | Apply strict rate limiting to auth routes |
| GET | `/auth/me` | - | Apply strict rate limiting to auth routes |
| POST | `/auth/logout` | - | Apply strict rate limiting to auth routes |
| GET | `/auth/verify-session` | - | Apply strict rate limiting to auth routes |
| GET | `/auth/users` | - | Apply strict rate limiting to auth routes |
| PUT | `/auth/users/:id` | - | Apply strict rate limiting to auth routes |
| DELETE | `/auth/users/:id` | - | Apply strict rate limiting to auth routes |

## Containers

Base path: `/api/containers`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/containers` | - | localhost:9090'; |
| GET | `/containers/server/:serverId` | - | localhost:9090'; |
| GET | `/containers/:id` | - | localhost:9090'; |
| GET | `/containers/server/:serverId/metrics` | - | localhost:9090'; |

## Dashboards

Base path: `/api/dashboards`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboards` | - | Validation schemas |
| GET | `/dashboards/:id` | - | Validation schemas |
| POST | `/dashboards` | - | Validation schemas |
| PUT | `/dashboards/:id` | - | Validation schemas |
| DELETE | `/dashboards/:id` | - | Validation schemas |

## Events

Base path: `/api/events`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/events` | - | GET /api/events - Get monitoring events |
| GET | `/events/types` | - | GET /api/events - Get monitoring events |
| GET | `/events/severities` | - | GET /api/events - Get monitoring events |
| GET | `/events/stats` | - | GET /api/events - Get monitoring events |
| POST | `/events/cleanup` | - | GET /api/events - Get monitoring events |

## Forecasting

Base path: `/api/forecasting`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/forecasting/disk/:serverId` | - | localhost:9090'; |
| GET | `/forecasting/memory/:serverId` | - | localhost:9090'; |
| GET | `/forecasting/cpu/:serverId` | - | localhost:9090'; |
| GET | `/forecasting/all/:serverId` | - | localhost:9090'; |

## Incidents

Base path: `/api/incidents`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/incidents` | - | GET /api/incidents - List incidents with optional filters |
| GET | `/incidents/stats` | - | GET /api/incidents - List incidents with optional filters |
| GET | `/incidents/:id` | - | GET /api/incidents - List incidents with optional filters |
| POST | `/incidents` | - | GET /api/incidents - List incidents with optional filters |
| PUT | `/incidents/:id` | - | GET /api/incidents - List incidents with optional filters |
| POST | `/incidents/:id/updates` | - | GET /api/incidents - List incidents with optional filters |
| DELETE | `/incidents/:id` | - | GET /api/incidents - List incidents with optional filters |
| POST | `/incidents/from-alert` | - | GET /api/incidents - List incidents with optional filters |

## Logs

Base path: `/api/logs`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/logs` | - | Loki response types |
| GET | `/logs/labels` | - | Loki response types |
| GET | `/logs/labels/:name/values` | - | Loki response types |
| GET | `/logs/tail` | - | Loki response types |

## MaintenanceWindows

Base path: `/api/maintenanceWindows`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/maintenanceWindows` | ✓ | - |
| GET | `/maintenanceWindows/:id` | ✓ | - |
| POST | `/maintenanceWindows` | ✓ | - |
| PUT | `/maintenanceWindows/:id` | ✓ | Verify server exists |
| DELETE | `/maintenanceWindows/:id` | ✓ | Verify server exists |
| GET | `/maintenanceWindows/server/:serverId/active` | ✓ | Verify server exists |

## Metrics

Base path: `/api/metrics`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/metrics/query` | - | localhost:9090'; |
| GET | `/metrics/query_range` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId` | - | localhost:9090'; |
| GET | `/metrics/targets` | - | localhost:9090'; |
| GET | `/metrics/rules` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/history` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/bandwidth` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/bandwidth/all` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/aggregate` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/chart-data` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/cpanel-accounts` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/exim-domains` | - | localhost:9090'; |
| GET | `/metrics/bandwidth/top` | - | localhost:9090'; |
| GET | `/metrics/server/:serverId/disk-usage` | - | localhost:9090'; |

## Notifications

Base path: `/api/notifications`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications/channels` | - | Validation schemas |
| GET | `/notifications/channels/:id` | - | Validation schemas |
| POST | `/notifications/channels` | - | Validation schemas |
| PUT | `/notifications/channels/:id` | - | Validation schemas |
| DELETE | `/notifications/channels/:id` | - | Validation schemas |
| POST | `/notifications/channels/:id/test` | - | Validation schemas |
| GET | `/notifications/logs` | - | Validation schemas |
| POST | `/notifications/daily-report` | - | Validation schemas |

## ServerGroups

Base path: `/api/serverGroups`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/serverGroups` | - | Helper: build nested tree from flat list |
| GET | `/serverGroups/:id` | - | Helper: build nested tree from flat list |
| POST | `/serverGroups` | - | Helper: build nested tree from flat list |
| PUT | `/serverGroups/:id` | - | Helper: build nested tree from flat list |
| DELETE | `/serverGroups/:id` | - | Helper: build nested tree from flat list |
| POST | `/serverGroups/move-servers` | - | Helper: build nested tree from flat list |

## Servers

Base path: `/api/servers`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/servers/tags` | - | Validation schemas |
| PUT | `/servers/tags/bulk` | - | Validation schemas |
| DELETE | `/servers/bulk` | - | Validation schemas |
| GET | `/servers` | - | Validation schemas |
| GET | `/servers/:id` | - | Validation schemas |
| POST | `/servers` | - | Validation schemas |
| PUT | `/servers/:id` | - | Validation schemas |
| DELETE | `/servers/:id` | - | Validation schemas |
| GET | `/servers/stats/overview` | - | Validation schemas |

## Settings

Base path: `/api/settings`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/settings` | ✓ | Uploads directory configuration |
| GET | `/settings/all` | ✓ | Uploads directory configuration |
| PUT | `/settings` | ✓ | Uploads directory configuration |
| POST | `/settings/logo` | ✓ | Uploads directory configuration |
| DELETE | `/settings/logo` | ✓ | Uploads directory configuration |
| GET | `/settings/system-info` | ✓ | Uploads directory configuration |
| POST | `/settings/backup` | ✓ | Uploads directory configuration |
| POST | `/settings/daily-report` | ✓ | Uploads directory configuration |
| GET | `/settings/export` | ✓ | Uploads directory configuration |
| POST | `/settings/import` | ✓ | Uploads directory configuration |

## SlackInteractions

Base path: `/api/slackInteractions`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/slackInteractions` | - | Skip verification if not configured |

## Uptime

Base path: `/api/uptime`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/uptime/stats/overview` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |
| GET | `/uptime` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |
| GET | `/uptime/:id` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |
| POST | `/uptime` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |
| PUT | `/uptime/:id` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |
| DELETE | `/uptime/:id` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |
| GET | `/uptime/:id/checks` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |
| POST | `/uptime/:id/test` | - | GET /api/uptime/stats/overview - Return aggregate stats across all monitors |

## WebSocket Events

Connect to `http://localhost:4000` with Socket.IO client.

### Server Events (Emitted by Server)

| Event | Description | Payload |
|-------|-------------|---------|
| `server:created` | New server added | Server object |
| `server:updated` | Server modified | Server object |
| `server:deleted` | Server removed | { id: string } |
| `agent:registered` | Agent came online | Agent object |
| `agent:unregistered` | Agent went offline | { agentId: string } |
| `metrics:update` | Real-time metrics | { serverId, metrics } |
| `event:new` | Monitoring event | EventLog object |
| `deployment:started` | Deployment initiated | Deployment object |

### Client Events (Subscribe)

| Event | Description |
|-------|-------------|
| `subscribe:server` | Subscribe to server updates |
| `unsubscribe:server` | Unsubscribe from server |
