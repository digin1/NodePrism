---
sidebar_position: 2
title: Endpoints
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
| POST | `/agents/register` | - | Register a new agent |
| POST | `/agents/heartbeat` | - | Send agent heartbeat |
| POST | `/agents/unregister` | - | Unregister an agent |
| GET | `/agents` | - | List all agents |
| GET | `/agents/latest-version/:type` | - | Get latest agent version by type |

## Alerts

Base path: `/api/alerts`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/alerts` | - | List all alerts |
| GET | `/alerts/rules` | - | List alert rules from Prometheus |
| GET | `/alerts/templates` | - | List alert templates |
| POST | `/alerts/templates` | - | Create alert template |
| GET | `/alerts/templates/:id` | - | Get alert template by ID |
| PUT | `/alerts/templates/:id` | - | Update alert template |
| DELETE | `/alerts/templates/:id` | - | Delete alert template |
| POST | `/alerts/templates/:id/test` | - | Test alert template |
| POST | `/alerts/rules` | - | Create alert rule |
| PUT | `/alerts/rules/:id` | - | Update alert rule |
| DELETE | `/alerts/rules/:id` | - | Delete alert rule |
| POST | `/alerts/bulk/acknowledge` | - | Bulk acknowledge alerts |
| POST | `/alerts/bulk/silence` | - | Bulk silence alerts |
| POST | `/alerts/:id/acknowledge` | - | Acknowledge single alert |
| POST | `/alerts/:id/silence` | - | Silence single alert |
| POST | `/alerts/webhook` | - | AlertManager webhook receiver |
| GET | `/alerts/stats` | - | Get alert statistics |
| GET | `/alerts/history` | - | Get alert history |

## Anomalies

Base path: `/api/anomalies`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/anomalies` | - | List all anomaly scores |
| GET | `/anomalies/server/:serverId` | - | Get anomaly scores for a server |
| GET | `/anomalies/rates` | - | Get anomaly rates for all servers |
| GET | `/anomalies/rate/:serverId` | - | Get anomaly rate for a server |
| GET | `/anomalies/events` | - | List anomaly events |
| GET | `/anomalies/models` | - | List anomaly detection models |
| GET | `/anomalies/stats` | - | Get anomaly statistics |
| POST | `/anomalies/events` | - | Create anomaly event |
| PUT | `/anomalies/events/:id/resolve` | - | Resolve anomaly event |

## Audit

Base path: `/api/audit`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/audit` | ✓ | List audit log entries (Admin only) |
| GET | `/audit/entity/:type/:id` | ✓ | Get audit logs for a specific entity (Admin only) |
| GET | `/audit/stats` | ✓ | Get audit log statistics (Admin only) |

## Auth

Base path: `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | - | Register new user |
| POST | `/auth/login` | - | Login and receive JWT token |
| GET | `/auth/me` | ✓ | Get current user profile |
| POST | `/auth/logout` | ✓ | Logout and invalidate token |
| GET | `/auth/users` | ✓ | List all users |
| PUT | `/auth/users/:id` | ✓ | Update user |
| DELETE | `/auth/users/:id` | ✓ | Delete user |

## Containers

Base path: `/api/containers`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/containers` | - | Sync containers for a server |
| GET | `/containers/server/:serverId` | - | List containers for a server |
| GET | `/containers/:id` | - | Get container by ID |
| GET | `/containers/server/:serverId/metrics` | - | Get container metrics for a server |

## Dashboards

Base path: `/api/dashboards`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboards` | - | List all dashboards |
| GET | `/dashboards/:id` | - | Get dashboard by ID |
| POST | `/dashboards` | - | Create dashboard |
| PUT | `/dashboards/:id` | - | Update dashboard |
| DELETE | `/dashboards/:id` | - | Delete dashboard |

## Events

Base path: `/api/events`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/events` | - | List monitoring events |
| GET | `/events/types` | - | Get available event types |
| GET | `/events/severities` | - | Get available event severities |
| GET | `/events/stats` | - | Get event statistics |
| POST | `/events/cleanup` | - | Clean up old events |

## Forecasting

Base path: `/api/forecasting`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/forecasting/disk/:serverId` | - | Forecast disk usage for a server |
| GET | `/forecasting/memory/:serverId` | - | Forecast memory usage for a server |
| GET | `/forecasting/cpu/:serverId` | - | Forecast CPU usage for a server |
| GET | `/forecasting/all/:serverId` | - | Forecast all metrics for a server |

## Incidents

Base path: `/api/incidents`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/incidents` | - | List incidents with optional filters |
| GET | `/incidents/stats` | - | Get incident statistics |
| GET | `/incidents/:id` | - | Get incident by ID |
| POST | `/incidents` | - | Create incident |
| PUT | `/incidents/:id` | - | Update incident |
| POST | `/incidents/:id/updates` | - | Add incident update |
| DELETE | `/incidents/:id` | - | Delete incident |
| POST | `/incidents/from-alert` | - | Create incident from alert |

## Logs

Base path: `/api/logs`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/logs` | - | Query logs from Loki |
| GET | `/logs/labels` | - | Get available log labels |
| GET | `/logs/labels/:name/values` | - | Get values for a log label |
| GET | `/logs/tail` | - | Tail logs in real-time |

## MaintenanceWindows

Base path: `/api/maintenanceWindows`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/maintenanceWindows` | ✓ | List maintenance windows |
| GET | `/maintenanceWindows/:id` | ✓ | Get maintenance window by ID |
| POST | `/maintenanceWindows` | ✓ | Create maintenance window |
| PUT | `/maintenanceWindows/:id` | ✓ | Update maintenance window |
| DELETE | `/maintenanceWindows/:id` | ✓ | Delete maintenance window |
| GET | `/maintenanceWindows/server/:serverId/active` | ✓ | Get active maintenance windows for a server |

## Metrics

Base path: `/api/metrics`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/metrics/query` | - | Execute instant Prometheus query |
| GET | `/metrics/query_range` | - | Execute range Prometheus query |
| GET | `/metrics/server/:serverId` | - | Get current metrics for a server |
| GET | `/metrics/targets` | - | List Prometheus scrape targets |
| GET | `/metrics/rules` | - | List Prometheus alert rules |
| GET | `/metrics/server/:serverId/history` | - | Get metric history for a server |
| GET | `/metrics/server/:serverId/bandwidth` | - | Get bandwidth metrics for a server |
| GET | `/metrics/server/:serverId/bandwidth/all` | - | Get all interface bandwidth for a server |
| GET | `/metrics/server/:serverId/aggregate` | - | Get aggregated metrics for a server |
| GET | `/metrics/server/:serverId/chart-data` | - | Get chart-ready metric data for a server |
| GET | `/metrics/server/:serverId/cpanel-accounts` | - | Get cPanel account metrics for a server |
| GET | `/metrics/server/:serverId/exim-domains` | - | Get Exim domain metrics for a server |
| GET | `/metrics/bandwidth/top` | - | Get top bandwidth consumers |
| GET | `/metrics/server/:serverId/disk-usage` | - | Get disk usage for a server |

## Notifications

Base path: `/api/notifications`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications/channels` | - | List notification channels |
| GET | `/notifications/channels/:id` | - | Get notification channel by ID |
| POST | `/notifications/channels` | - | Create notification channel |
| PUT | `/notifications/channels/:id` | - | Update notification channel |
| DELETE | `/notifications/channels/:id` | - | Delete notification channel |
| POST | `/notifications/channels/:id/test` | - | Send test notification |
| GET | `/notifications/logs` | - | Get notification logs |
| POST | `/notifications/daily-report` | - | Trigger daily infrastructure report |

## ServerGroups

Base path: `/api/serverGroups`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/serverGroups` | - | List server groups (nested tree) |
| GET | `/serverGroups/:id` | - | Get server group by ID |
| POST | `/serverGroups` | - | Create server group |
| PUT | `/serverGroups/:id` | - | Update server group |
| DELETE | `/serverGroups/:id` | - | Delete server group |
| POST | `/serverGroups/move-servers` | - | Move servers between groups |

## Servers

Base path: `/api/servers`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/servers/tags` | - | List all unique server tags |
| PUT | `/servers/tags/bulk` | - | Bulk update server tags |
| DELETE | `/servers/bulk` | - | Bulk delete servers |
| GET | `/servers` | - | List all servers |
| GET | `/servers/:id` | - | Get server by ID |
| POST | `/servers` | - | Create server |
| PUT | `/servers/:id` | - | Update server |
| DELETE | `/servers/:id` | - | Delete server |
| GET | `/servers/stats/overview` | - | Get server statistics overview |

## Settings

Base path: `/api/settings`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/settings` | ✓ | Get system settings |
| GET | `/settings/all` | ✓ | Get all settings including internal |
| PUT | `/settings` | ✓ | Update system settings |
| POST | `/settings/logo` | ✓ | Upload system logo |
| DELETE | `/settings/logo` | ✓ | Delete system logo |
| GET | `/settings/system-info` | ✓ | Get system information |
| POST | `/settings/backup` | ✓ | Create database backup |
| GET | `/settings/export` | ✓ | Export configuration |
| POST | `/settings/import` | ✓ | Import configuration |

## SlackInteractions

Base path: `/api/slackInteractions`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/slackInteractions` | - | Handle Slack interactive actions (button clicks, etc.) |

## Uptime

Base path: `/api/uptime`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/uptime/stats/overview` | - | Get aggregate uptime statistics |
| GET | `/uptime` | - | List uptime monitors |
| GET | `/uptime/:id` | - | Get uptime monitor by ID |
| POST | `/uptime` | - | Create uptime monitor |
| PUT | `/uptime/:id` | - | Update uptime monitor |
| DELETE | `/uptime/:id` | - | Delete uptime monitor |
| GET | `/uptime/:id/checks` | - | Get check history for a monitor |
| POST | `/uptime/:id/test` | - | Run a test check |

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
