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

## AlertGroups

Base path: `/api/alertGroups`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/alertGroups` | - | - |
| GET | `/alertGroups/:id` | - | - |
| PUT | `/alertGroups/:id/resolve` | - | - |

## AlertInhibitionRules

Base path: `/api/alertInhibitionRules`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/alertInhibitionRules` | - | Validation schemas |
| GET | `/alertInhibitionRules/:id` | - | Validation schemas |
| POST | `/alertInhibitionRules` | - | Validation schemas |
| PUT | `/alertInhibitionRules/:id` | - | Validation schemas |
| DELETE | `/alertInhibitionRules/:id` | - | Validation schemas |

## AlertRoutingRules

Base path: `/api/alertRoutingRules`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/alertRoutingRules` | - | Validation schemas |
| GET | `/alertRoutingRules/:id` | - | Validation schemas |
| POST | `/alertRoutingRules` | - | Validation schemas |
| PUT | `/alertRoutingRules/:id` | - | Validation schemas |
| DELETE | `/alertRoutingRules/:id` | - | Validation schemas |

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

## Annotations

Base path: `/api/annotations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/annotations` | - | - |
| POST | `/annotations` | - | - |
| PUT | `/annotations/:id` | - | - |
| DELETE | `/annotations/:id` | - | - |

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

## ApiTokens

Base path: `/api/apiTokens`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/apiTokens` | - | GET / - List tokens for current user (never expose tokenHash) |
| POST | `/apiTokens` | - | GET / - List tokens for current user (never expose tokenHash) |
| DELETE | `/apiTokens/:id` | - | GET / - List tokens for current user (never expose tokenHash) |
| POST | `/apiTokens/:id/revoke` | - | GET / - List tokens for current user (never expose tokenHash) |

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

## CompositeMonitors

Base path: `/api/compositeMonitors`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/compositeMonitors` | - | - |
| GET | `/compositeMonitors/:id` | - | - |
| GET | `/compositeMonitors/:id/evaluate` | - | - |
| POST | `/compositeMonitors` | - | Get the latest check status for each referenced uptime monitor |
| PUT | `/compositeMonitors/:id` | - | Get the latest check status for each referenced uptime monitor |
| DELETE | `/compositeMonitors/:id` | - | Get the latest check status for each referenced uptime monitor |

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

## EscalationPolicies

Base path: `/api/escalationPolicies`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/escalationPolicies` | - | GET /api/escalation-policies - List all policies with steps |
| GET | `/escalationPolicies/:id` | - | GET /api/escalation-policies - List all policies with steps |
| POST | `/escalationPolicies` | - | GET /api/escalation-policies - List all policies with steps |
| PUT | `/escalationPolicies/:id` | - | GET /api/escalation-policies - List all policies with steps |
| DELETE | `/escalationPolicies/:id` | - | GET /api/escalation-policies - List all policies with steps |

## Events

Base path: `/api/events`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/events` | - | GET /api/events - Get monitoring events |
| GET | `/events/types` | - | GET /api/events - Get monitoring events |
| GET | `/events/severities` | - | GET /api/events - Get monitoring events |
| GET | `/events/stats` | - | GET /api/events - Get monitoring events |
| POST | `/events/cleanup` | - | GET /api/events - Get monitoring events |

## Feeds

Base path: `/api/feeds`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/feeds/incidents.rss` | - | GET /api/feeds/incidents.rss - RSS 2.0 feed of latest incidents |
| GET | `/feeds/incidents.atom` | - | GET /api/feeds/incidents.rss - RSS 2.0 feed of latest incidents |

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
| POST | `/incidents/:id/analyze` | - | GET /api/incidents - List incidents with optional filters |
| POST | `/incidents/from-alert` | - | GET /api/incidents - List incidents with optional filters |

## InfraChanges

Base path: `/api/infraChanges`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/infraChanges` | - | - |
| POST | `/infraChanges` | - | - |
| DELETE | `/infraChanges/:id` | - | If serverId is provided, verify it exists |

## Kubernetes

Base path: `/api/kubernetes`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/kubernetes` | ✓ | - |
| POST | `/kubernetes` | ✓ | Strip sensitive auth config from list response |
| GET | `/kubernetes/:id` | ✓ | Strip sensitive auth config from list response |
| PUT | `/kubernetes/:id` | ✓ | Strip sensitive auth config from list response |
| DELETE | `/kubernetes/:id` | ✓ | Strip sensitive auth config from list response |
| GET | `/kubernetes/:id/status` | ✓ | Strip sensitive auth config from list response |

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
| PUT | `/maintenanceWindows/:id` | ✓ | Verify server exists for SERVER scope |
| DELETE | `/maintenanceWindows/:id` | ✓ | Verify server exists for SERVER scope |
| GET | `/maintenanceWindows/server/:serverId/active` | ✓ | Verify server exists for SERVER scope |

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

## MultiStepMonitors

Base path: `/api/multiStepMonitors`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/multiStepMonitors` | - | GET /api/multi-step-monitors - List all monitors with step count |
| GET | `/multiStepMonitors/:id` | - | GET /api/multi-step-monitors - List all monitors with step count |
| POST | `/multiStepMonitors` | - | GET /api/multi-step-monitors - List all monitors with step count |
| PUT | `/multiStepMonitors/:id` | - | GET /api/multi-step-monitors - List all monitors with step count |
| DELETE | `/multiStepMonitors/:id` | - | GET /api/multi-step-monitors - List all monitors with step count |
| POST | `/multiStepMonitors/:id/run` | - | GET /api/multi-step-monitors - List all monitors with step count |
| GET | `/multiStepMonitors/:id/results` | - | GET /api/multi-step-monitors - List all monitors with step count |

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

## OnCallSchedules

Base path: `/api/onCallSchedules`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/onCallSchedules/current` | - | - |
| GET | `/onCallSchedules` | - | Enrich with user info |
| POST | `/onCallSchedules` | - | Enrich with user info |
| GET | `/onCallSchedules/:id` | - | Enrich with user info |
| PUT | `/onCallSchedules/:id` | - | Enrich with user info |
| DELETE | `/onCallSchedules/:id` | - | Enrich with user info |
| POST | `/onCallSchedules/:id/rotations` | - | Enrich with user info |
| DELETE | `/onCallSchedules/rotations/:rotationId` | - | Enrich with user info |

## Otlp

Base path: `/api/otlp`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/otlp/v1/traces` | - | POST /api/otlp/v1/traces - Accept OTLP JSON trace data (public endpoint) |
| GET | `/otlp/services` | - | POST /api/otlp/v1/traces - Accept OTLP JSON trace data (public endpoint) |
| GET | `/otlp/traces` | - | POST /api/otlp/v1/traces - Accept OTLP JSON trace data (public endpoint) |
| GET | `/otlp/traces/:traceId` | - | POST /api/otlp/v1/traces - Accept OTLP JSON trace data (public endpoint) |

## PostMortems

Base path: `/api/postMortems`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/postMortems` | - | GET /api/post-mortems - List all post-mortems with incident title |
| GET | `/postMortems/:incidentId` | - | GET /api/post-mortems - List all post-mortems with incident title |
| POST | `/postMortems` | - | GET /api/post-mortems - List all post-mortems with incident title |
| PUT | `/postMortems/:id` | - | GET /api/post-mortems - List all post-mortems with incident title |
| POST | `/postMortems/:id/publish` | - | GET /api/post-mortems - List all post-mortems with incident title |
| DELETE | `/postMortems/:id` | - | GET /api/post-mortems - List all post-mortems with incident title |

## RetentionPolicies

Base path: `/api/retentionPolicies`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/retentionPolicies` | - | - |
| POST | `/retentionPolicies` | - | - |
| PUT | `/retentionPolicies/:id` | - | - |
| DELETE | `/retentionPolicies/:id` | - | - |

## Rum

Base path: `/api/rum`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/rum/beacon` | - | POST /api/rum/beacon - Public endpoint for RUM data collection |
| GET | `/rum/stats` | - | POST /api/rum/beacon - Public endpoint for RUM data collection |
| GET | `/rum/sessions` | - | POST /api/rum/beacon - Public endpoint for RUM data collection |

## Runbooks

Base path: `/api/runbooks`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/runbooks` | ✓ | GET /api/runbooks - List runbooks |
| POST | `/runbooks` | ✓ | GET /api/runbooks - List runbooks |
| GET | `/runbooks/:id` | ✓ | GET /api/runbooks - List runbooks |
| PUT | `/runbooks/:id` | ✓ | GET /api/runbooks - List runbooks |
| DELETE | `/runbooks/:id` | ✓ | GET /api/runbooks - List runbooks |
| POST | `/runbooks/:id/execute` | ✓ | GET /api/runbooks - List runbooks |
| GET | `/runbooks/:id/executions` | ✓ | GET /api/runbooks - List runbooks |

## ScheduledReports

Base path: `/api/scheduledReports`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/scheduledReports` | - | GET /api/scheduled-reports - List all reports |
| GET | `/scheduledReports/:id` | - | GET /api/scheduled-reports - List all reports |
| POST | `/scheduledReports` | - | GET /api/scheduled-reports - List all reports |
| PUT | `/scheduledReports/:id` | - | GET /api/scheduled-reports - List all reports |
| DELETE | `/scheduledReports/:id` | - | GET /api/scheduled-reports - List all reports |
| POST | `/scheduledReports/:id/send` | - | GET /api/scheduled-reports - List all reports |

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

## ServiceDependencies

Base path: `/api/serviceDependencies`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/serviceDependencies/map` | - | - |
| GET | `/serviceDependencies` | - | - |
| POST | `/serviceDependencies` | - | - |
| DELETE | `/serviceDependencies/:id` | - | - |

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

## SlaPolicies

Base path: `/api/slaPolicies`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/slaPolicies` | - | - |
| GET | `/slaPolicies/:id` | - | - |
| GET | `/slaPolicies/:id/compliance` | - | - |
| POST | `/slaPolicies` | - | - |
| PUT | `/slaPolicies/:id` | - | Verify monitor exists |
| DELETE | `/slaPolicies/:id` | - | Verify monitor exists |

## SlackInteractions

Base path: `/api/slackInteractions`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/slackInteractions` | - | Rebuild URL from validated components — breaks CodeQL taint chain |

## Slos

Base path: `/api/slos`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/slos` | - | - |
| POST | `/slos` | - | Enrich with uptime monitor names |
| GET | `/slos/:id` | - | Enrich with uptime monitor names |
| PUT | `/slos/:id` | - | Enrich with uptime monitor names |
| DELETE | `/slos/:id` | - | Enrich with uptime monitor names |
| GET | `/slos/:id/budget` | - | Enrich with uptime monitor names |

## SnmpDevices

Base path: `/api/snmpDevices`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/snmpDevices` | - | - |
| GET | `/snmpDevices/:id` | - | - |
| POST | `/snmpDevices` | - | - |
| PUT | `/snmpDevices/:id` | - | - |
| DELETE | `/snmpDevices/:id` | - | - |
| GET | `/snmpDevices/:id/results` | - | - |
| POST | `/snmpDevices/:id/poll` | - | - |

## StatusPages

Base path: `/api/statusPages`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/statusPages` | - | - |
| GET | `/statusPages/public/:slug` | - | - |
| POST | `/statusPages/public/:slug/subscribe` | - | For each component linked to an uptime monitor, get the latest check status |
| GET | `/statusPages/public/confirm/:token` | - | For each component linked to an uptime monitor, get the latest check status |
| POST | `/statusPages/public/:slug/unsubscribe` | - | For each component linked to an uptime monitor, get the latest check status |
| GET | `/statusPages/:id` | - | For each component linked to an uptime monitor, get the latest check status |
| POST | `/statusPages` | - | For each component linked to an uptime monitor, get the latest check status |
| PUT | `/statusPages/:id` | - | For each component linked to an uptime monitor, get the latest check status |
| DELETE | `/statusPages/:id` | - | For each component linked to an uptime monitor, get the latest check status |

## SyntheticChecks

Base path: `/api/syntheticChecks`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/syntheticChecks` | ✓ | - |
| POST | `/syntheticChecks` | ✓ | Flatten the latest result onto each check |
| GET | `/syntheticChecks/:id` | ✓ | Flatten the latest result onto each check |
| PUT | `/syntheticChecks/:id` | ✓ | Flatten the latest result onto each check |
| DELETE | `/syntheticChecks/:id` | ✓ | Flatten the latest result onto each check |
| POST | `/syntheticChecks/:id/run` | ✓ | Flatten the latest result onto each check |
| GET | `/syntheticChecks/:id/results` | ✓ | Flatten the latest result onto each check |

## SystemStatus

Base path: `/api/systemStatus`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/systemStatus` | - | localhost:9090'; |

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
