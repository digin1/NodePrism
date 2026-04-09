---
sidebar_position: 2
title: Database Schema
---

# Database Schema


NodePrism uses PostgreSQL with Prisma ORM.

## Entity Relationship Overview

```
Server (1) ──── (*) Agent
   │
   ├──── (*) Deployment
   ├──── (*) Alert
   ├──── (*) AnomalyEvent
   ├──── (*) MetricHistory
   └──── (*) EventLog

User (1) ──── (*) AuditLog

AlertRule ──── Alert
AlertTemplate ──── NotificationChannel
```

---

## Models

### ServerGroup

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| description | String | - | - |
| parentId | String | - | - |
| sortOrder | Int | ✓ | Default: 0 |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| parent | ServerGroup | - | Relation |
| children | ServerGroup[] | ✓ | Relation |
| servers | Server[] | ✓ | - |

---

### Server

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| hostname | String | ✓ | - |
| ipAddress | String | ✓ | - |
| status | ServerStatus | ✓ | Default: OFFLINE |
| environment | Environment | ✓ | Default: PRODUCTION |
| groupId | String | - | - |
| region | String | - | - |
| tags | String[] | ✓ | Default: [] |
| metadata | Json | - | - |
| lastSeen | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| group | ServerGroup | - | Relation |
| agents | Agent[] | ✓ | - |
| virtualContainers | VirtualContainer[] | ✓ | - |
| alerts | Alert[] | ✓ | - |
| anomalyEvents | AnomalyEvent[] | ✓ | - |
| anomalyModels | AnomalyModel[] | ✓ | - |
| metricHistory | MetricHistory[] | ✓ | - |
| eventLogs | EventLog[] | ✓ | - |
| maintenanceWindows | MaintenanceWindow[] | ✓ | - |
| uptimeMonitors | UptimeMonitor[] | ✓ | - |
| incidents | Incident[] | ✓ | - |
| infraChanges | InfraChange[] | ✓ | - |

---

### VirtualContainer

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | ✓ | - |
| containerId | String | ✓ | - |
| name | String | ✓ | - |
| type | String | ✓ | - |
| status | String | ✓ | Default: "unknown" |
| ipAddress | String | - | - |
| hostname | String | - | - |
| networkRxBytes | BigInt | ✓ | Default: 0 |
| networkTxBytes | BigInt | ✓ | Default: 0 |
| metadata | Json | - | - |
| lastSeen | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| server | Server | ✓ | Relation |

**Indexes:**
- `@@index([serverId])`

---

### Agent

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | ✓ | - |
| type | AgentType | ✓ | - |
| status | AgentStatus | ✓ | Default: NOT_INSTALLED |
| version | String | - | - |
| port | Int | ✓ | - |
| config | Json | - | - |
| lastHealthCheck | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| server | Server | ✓ | Relation |

---

### AlertRule

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| description | String | - | - |
| query | String | ✓ | - |
| duration | String | ✓ | Default: "5m" |
| severity | AlertSeverity | ✓ | - |
| labels | Json | - | - |
| annotations | Json | - | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| alerts | Alert[] | ✓ | - |

**Indexes:**
- `@@index([enabled])`

---

### Alert

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| ruleId | String | - | - |
| templateId | String | - | - |
| serverId | String | - | - |
| status | AlertStatus | ✓ | Default: FIRING |
| severity | AlertSeverity | ✓ | - |
| message | String | ✓ | - |
| labels | Json | - | - |
| annotations | Json | - | - |
| fingerprint | String | ✓ | Unique |
| startsAt | DateTime | ✓ | - |
| endsAt | DateTime | - | - |
| acknowledgedAt | DateTime | - | - |
| acknowledgedBy | String | - | - |
| isFlapping | Boolean | ✓ | Default: false |
| groupId | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| rule | AlertRule | - | Relation |
| template | AlertTemplate | - | Relation |
| server | Server | - | Relation |
| group | AlertGroup | - | Relation |

**Indexes:**
- `@@index([status])`
- `@@index([status, severity])`
- `@@index([serverId])`
- `@@index([serverId, status])`
- `@@index([startsAt])`
- `@@index([createdAt])`
- `@@index([groupId])`

---

### AlertTemplate

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | Unique |
| description | String | - | - |
| matchLabels | Json | - | - |
| matchHostLabels | Json | - | - |
| query | String | ✓ | - |
| calc | String | - | - |
| units | String | - | - |
| warnCondition | Json | - | - |

---

### NotificationChannel

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| type | NotificationChannelType | ✓ | - |
| config | Json | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| logs | NotificationLog[] | ✓ | - |
| escalationSteps | EscalationStep[] | ✓ | - |

---

### NotificationLog

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| channelId | String | ✓ | - |
| alertId | String | ✓ | - |
| status | String | ✓ | - |
| message | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| channel | NotificationChannel | ✓ | Relation |

**Indexes:**
- `@@index([channelId])`
- `@@index([alertId])`
- `@@index([createdAt])`

---

### User

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| email | String | ✓ | Unique |
| name | String | ✓ | - |
| passwordHash | String | ✓ | - |
| role | UserRole | ✓ | Default: VIEWER |
| lastLogin | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| auditLogs | AuditLog[] | ✓ | - |
| apiTokens | ApiToken[] | ✓ | - |

---

### AuditLog

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| userId | String | - | - |
| action | String | ✓ | - |
| entityType | String | ✓ | - |
| entityId | String | - | - |
| details | Json | - | - |
| ipAddress | String | - | - |
| userAgent | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| user | User | - | Relation |

**Indexes:**
- `@@index([entityType, entityId])`

---

### Dashboard

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| description | String | - | - |
| config | Json | ✓ | - |
| isDefault | Boolean | ✓ | Default: false |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

---

### SystemSettings

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: "default" |
| systemName | String | ✓ | Default: "NodePrism" |
| logoPath | String | - | - |
| logoUrl | String | - | - |
| primaryColor | String | ✓ | Default: "#3B82F6" |
| managerHostname | String | - | - |
| managerIp | String | - | - |
| timezone | String | ✓ | Default: "UTC" |
| dateFormat | String | ✓ | Default: "YYYY-MM-DD" |
| dailyReportTime | String | ✓ | Default: "08:00" |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

---

### MaintenanceWindow

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | - | - |
| uptimeMonitorId | String | - | - |
| scope | String | ✓ | Default: "SERVER" |
| reason | String | ✓ | - |
| startTime | DateTime | ✓ | - |
| endTime | DateTime | ✓ | - |
| recurring | Boolean | ✓ | Default: false |
| rrule | String | - | - |
| createdBy | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| server | Server | - | Relation |
| uptimeMonitor | UptimeMonitor | - | Relation |

**Indexes:**
- `@@index([serverId])`
- `@@index([uptimeMonitorId])`
- `@@index([startTime, endTime])`

---

### MetricHistory

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | ✓ | - |
| metricName | String | ✓ | - |
| value | Float | ✓ | - |
| timestamp | DateTime | ✓ | - |
| createdAt | DateTime | ✓ | Default: now( |
| server | Server | ✓ | Relation |

**Indexes:**
- `@@index([serverId, metricName, timestamp])`
- `@@index([serverId, timestamp])`
- `@@index([timestamp])`

---

### EventLog

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | - | - |
| type | EventType | ✓ | - |
| severity | EventSeverity | ✓ | Default: INFO |
| title | String | ✓ | - |
| message | String | ✓ | - |
| metadata | Json | - | - |
| source | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| server | Server | - | Relation |

**Indexes:**
- `@@index([serverId, createdAt])`
- `@@index([type, createdAt])`
- `@@index([severity, createdAt])`
- `@@index([createdAt])`

---

### UptimeMonitor

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| type | UptimeCheckType | ✓ | Default: HTTP |
| target | String | ✓ | - |
| interval | Int | ✓ | Default: 60 |
| timeout | Int | ✓ | Default: 10 |
| method | String | ✓ | Default: "GET" |
| expectedStatus | Int | - | - |
| keyword | String | - | - |
| headers | Json | - | - |
| enabled | Boolean | ✓ | Default: true |
| serverId | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| server | Server | - | Relation |
| checks | UptimeCheck[] | ✓ | - |
| slaPolicies | SlaPolicy[] | ✓ | - |
| maintenanceWindows | MaintenanceWindow[] | ✓ | - |

---

### UptimeCheck

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| monitorId | String | ✓ | - |
| status | UptimeCheckStatus | ✓ | - |
| responseTime | Int | - | - |
| statusCode | Int | - | - |
| message | String | - | - |
| certExpiry | DateTime | - | - |
| certIssuer | String | - | - |
| domainExpiry | DateTime | - | - |
| probeLabel | String | - | - |
| checkedAt | DateTime | ✓ | Default: now( |
| monitor | UptimeMonitor | ✓ | Relation |

**Indexes:**
- `@@index([monitorId, checkedAt])`
- `@@index([checkedAt])`

---

### Incident

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| title | String | ✓ | - |
| description | String | - | - |
| status | IncidentStatus | ✓ | Default: INVESTIGATING |
| severity | AlertSeverity | ✓ | - |
| alertId | String | - | - |
| serverId | String | - | - |
| assignee | String | - | - |
| startedAt | DateTime | ✓ | Default: now( |
| resolvedAt | DateTime | - | - |
| createdBy | String | - | - |
| aiAnalysis | String | - | - |
| aiAnalyzedAt | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| server | Server | - | Relation |
| updates | IncidentUpdate[] | ✓ | - |
| postMortem | PostMortem | - | - |

**Indexes:**
- `@@index([status])`
- `@@index([startedAt])`

---

### IncidentUpdate

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| incidentId | String | ✓ | - |
| message | String | ✓ | - |
| status | IncidentStatus | - | - |
| createdBy | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| incident | Incident | ✓ | Relation |

**Indexes:**
- `@@index([incidentId, createdAt])`

---

### AnomalyEvent

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | ✓ | - |
| metricName | String | ✓ | - |
| score | Float | ✓ | - |
| severity | Float | ✓ | - |
| startedAt | DateTime | ✓ | - |
| endedAt | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| server | Server | ✓ | Relation |

**Indexes:**
- `@@index([serverId, startedAt])`
- `@@index([metricName])`

---

### AnomalyModel

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | ✓ | - |
| metricName | String | ✓ | - |
| clusterCenters | Json | ✓ | - |
| threshold | Float | ✓ | - |
| trainedAt | DateTime | ✓ | - |
| expiresAt | DateTime | ✓ | - |
| dataPoints | Int | ✓ | - |
| modelVersion | Int | ✓ | Default: 1 |
| createdAt | DateTime | ✓ | Default: now( |
| server | Server | ✓ | Relation |

**Indexes:**
- `@@index([serverId, metricName])`

---

### EscalationPolicy

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| steps | EscalationStep[] | ✓ | - |

---

### EscalationStep

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| policyId | String | ✓ | - |
| stepOrder | Int | ✓ | - |
| delayMinutes | Int | ✓ | - |
| channelId | String | ✓ | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| policy | EscalationPolicy | ✓ | Relation |
| channel | NotificationChannel | ✓ | Relation |

**Indexes:**
- `@@index([policyId, stepOrder])`
- `@@index([channelId])`

---

### ApiToken

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| tokenHash | String | ✓ | Unique |
| userId | String | ✓ | - |
| permissions | Json | ✓ | Default: "[]" |
| expiresAt | DateTime | - | - |
| lastUsedAt | DateTime | - | - |
| revoked | Boolean | ✓ | Default: false |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| user | User | ✓ | Relation |

**Indexes:**
- `@@index([userId])`
- `@@index([revoked])`

---

### PostMortem

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| incidentId | String | ✓ | Unique |
| summary | String | ✓ | - |
| rootCause | String | ✓ | - |
| impact | String | ✓ | - |
| timeline | String | ✓ | - |
| actionItems | Json | ✓ | Default: "[]" |
| createdBy | String | - | - |
| publishedAt | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| incident | Incident | ✓ | Relation |

---

### AlertRoutingRule

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| priority | Int | ✓ | Default: 0 |
| conditions | Json | ✓ | - |

---

### SlaPolicy

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| uptimeMonitorId | String | ✓ | - |
| targetPercent | Float | ✓ | - |
| windowDays | Int | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| uptimeMonitor | UptimeMonitor | ✓ | Relation |

**Indexes:**
- `@@index([uptimeMonitorId])`
- `@@index([enabled])`

---

### AlertInhibitionRule

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| sourceMatch | Json | ✓ | - |
| targetMatch | Json | ✓ | - |
| sourceSeverity | String | ✓ | - |
| targetSeverity | String | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

---

### AlertGroup

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| fingerprint | String | ✓ | Unique |
| status | String | ✓ | Default: "active" |
| alertCount | Int | ✓ | Default: 1 |
| firstSeenAt | DateTime | ✓ | - |
| lastSeenAt | DateTime | ✓ | - |
| resolvedAt | DateTime | - | - |
| groupLabels | Json | ✓ | - |
| createdAt | DateTime | ✓ | Default: now( |
| alerts | Alert[] | ✓ | - |

**Indexes:**
- `@@index([status])`

---

### StatusPage

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| slug | String | ✓ | Unique |
| title | String | ✓ | Default: "Service Status" |
| description | String | - | - |
| logoUrl | String | - | - |
| customCss | String | - | - |
| isPublic | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| components | StatusPageComponent[] | ✓ | - |
| subscribers | StatusPageSubscriber[] | ✓ | - |

---

### StatusPageComponent

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| statusPageId | String | ✓ | - |
| name | String | ✓ | - |
| description | String | - | - |
| uptimeMonitorId | String | - | - |
| sortOrder | Int | ✓ | Default: 0 |
| createdAt | DateTime | ✓ | Default: now( |
| statusPage | StatusPage | ✓ | Relation |

**Indexes:**
- `@@index([statusPageId])`

---

### StatusPageSubscriber

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| statusPageId | String | ✓ | - |
| type | String | ✓ | - |
| endpoint | String | ✓ | - |
| confirmed | Boolean | ✓ | Default: false |
| confirmToken | String | - | Unique |
| createdAt | DateTime | ✓ | Default: now( |
| statusPage | StatusPage | ✓ | Relation |

**Indexes:**
- `@@index([statusPageId])`

---

### Annotation

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| title | String | ✓ | - |
| message | String | - | - |
| tags | String[] | ✓ | Default: [] |
| startTime | DateTime | ✓ | - |
| endTime | DateTime | - | - |
| color | String | ✓ | Default: "#3B82F6" |
| createdBy | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |

**Indexes:**
- `@@index([startTime])`

---

### CompositeMonitor

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| description | String | - | - |
| expression | String | ✓ | - |
| monitorIds | String[] | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

---

### MultiStepMonitor

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| interval | Int | ✓ | Default: 300 |
| timeout | Int | ✓ | Default: 30 |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| steps | MultiStepMonitorStep[] | ✓ | - |
| results | MultiStepMonitorResult[] | ✓ | - |

---

### MultiStepMonitorStep

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| monitorId | String | ✓ | - |
| stepOrder | Int | ✓ | - |
| name | String | ✓ | - |
| method | String | ✓ | Default: "GET" |
| url | String | ✓ | - |
| headers | Json | - | - |
| body | String | - | - |
| expectedStatus | Int | - | - |
| extractVars | Json | - | - |
| assertions | Json | - | - |
| monitor | MultiStepMonitor | ✓ | Relation |

**Indexes:**
- `@@index([monitorId, stepOrder])`

---

### MultiStepMonitorResult

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| monitorId | String | ✓ | - |
| status | String | ✓ | - |
| duration | Int | ✓ | - |
| stepResults | Json | ✓ | - |
| checkedAt | DateTime | ✓ | Default: now( |
| monitor | MultiStepMonitor | ✓ | Relation |

**Indexes:**
- `@@index([monitorId, checkedAt])`

---

### ScheduledReport

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| type | String | ✓ | - |
| schedule | String | ✓ | - |
| recipients | Json | ✓ | - |

---

### SnmpDevice

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| host | String | ✓ | - |
| port | Int | ✓ | Default: 161 |
| version | String | ✓ | Default: "2c" |
| community | String | - | - |
| authConfig | Json | - | - |
| oids | Json | ✓ | - |

---

### SnmpPollResult

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| deviceId | String | ✓ | - |
| values | Json | ✓ | - |
| polledAt | DateTime | ✓ | Default: now( |
| device | SnmpDevice | ✓ | Relation |

**Indexes:**
- `@@index([deviceId, polledAt])`

---

### RetentionPolicy

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| metricType | String | ✓ | Unique |
| retentionDays | Int | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

---

### ServiceDependency

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| sourceId | String | ✓ | - |
| sourceType | String | ✓ | - |
| targetId | String | ✓ | - |
| targetType | String | ✓ | - |
| label | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |

---

### InfraChange

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | - | - |
| changeType | String | ✓ | - |
| source | String | ✓ | - |
| title | String | ✓ | - |
| details | Json | - | - |
| detectedAt | DateTime | ✓ | - |
| createdAt | DateTime | ✓ | Default: now( |
| server | Server | - | Relation |

**Indexes:**
- `@@index([serverId, detectedAt])`
- `@@index([detectedAt])`

---

### OnCallSchedule

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| timezone | String | ✓ | Default: "UTC" |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| rotations | OnCallRotation[] | ✓ | - |

---

### OnCallRotation

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| scheduleId | String | ✓ | - |
| userId | String | ✓ | - |
| startTime | DateTime | ✓ | - |
| endTime | DateTime | ✓ | - |
| schedule | OnCallSchedule | ✓ | Relation |

**Indexes:**
- `@@index([scheduleId, startTime])`

---

### Slo

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| description | String | - | - |
| targetPercent | Float | ✓ | - |
| windowDays | Int | ✓ | - |
| uptimeMonitorId | String | - | - |
| metricQuery | String | - | - |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

---

### OtlpSpan

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| traceId | String | ✓ | - |
| spanId | String | ✓ | - |
| parentSpanId | String | - | - |
| operationName | String | ✓ | - |
| serviceName | String | ✓ | - |
| startTime | DateTime | ✓ | - |
| duration | BigInt | ✓ | - |
| status | String | ✓ | Default: "OK" |
| attributes | Json | - | - |
| events | Json | - | - |
| createdAt | DateTime | ✓ | Default: now( |

**Indexes:**
- `@@index([traceId])`
- `@@index([serviceName, startTime])`
- `@@index([startTime])`

---

### Runbook

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| description | String | - | - |
| script | String | ✓ | - |
| language | String | ✓ | Default: "bash" |
| timeout | Int | ✓ | Default: 300 |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| executions | RunbookExecution[] | ✓ | - |
| alertTemplates | AlertTemplate[] | ✓ | - |

---

### RunbookExecution

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| runbookId | String | ✓ | - |
| alertId | String | - | - |
| serverId | String | - | - |
| status | String | ✓ | - |
| output | String | - | - |
| exitCode | Int | - | - |
| startedAt | DateTime | ✓ | - |
| finishedAt | DateTime | - | - |
| triggeredBy | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| runbook | Runbook | ✓ | Relation |

**Indexes:**
- `@@index([runbookId, startedAt])`

---

### RumSession

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| sessionId | String | ✓ | Unique |
| userAgent | String | - | - |
| country | String | - | - |
| startedAt | DateTime | ✓ | - |
| createdAt | DateTime | ✓ | Default: now( |
| pageViews | RumPageView[] | ✓ | - |

**Indexes:**
- `@@index([startedAt])`

---

### RumPageView

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| sessionId | String | ✓ | - |
| url | String | ✓ | - |
| loadTime | Int | - | - |
| domContentLoaded | Int | - | - |
| firstPaint | Int | - | - |
| lcp | Int | - | - |
| fid | Int | - | - |
| cls | Float | - | - |
| errorCount | Int | ✓ | Default: 0 |
| viewedAt | DateTime | ✓ | - |
| session | RumSession | ✓ | Relation |

**Indexes:**
- `@@index([sessionId])`
- `@@index([viewedAt])`

---

### KubernetesCluster

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| apiEndpoint | String | ✓ | - |
| authConfig | Json | ✓ | - |
| enabled | Boolean | ✓ | Default: true |
| lastSyncAt | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

---

### SyntheticCheck

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| name | String | ✓ | - |
| script | String | ✓ | - |
| interval | Int | ✓ | Default: 300 |
| timeout | Int | ✓ | Default: 60 |
| enabled | Boolean | ✓ | Default: true |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| results | SyntheticCheckResult[] | ✓ | - |

---

### SyntheticCheckResult

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| checkId | String | ✓ | - |
| status | String | ✓ | - |
| duration | Int | ✓ | - |
| screenshot | String | - | - |
| errorMessage | String | - | - |
| stepResults | Json | - | - |
| checkedAt | DateTime | ✓ | Default: now( |
| check | SyntheticCheck | ✓ | Relation |

**Indexes:**
- `@@index([checkId, checkedAt])`

---

## Enums

### ServerStatus

| Value | Description |
|-------|-------------|
| `ONLINE` | - |
| `OFFLINE` | - |
| `WARNING` | - |
| `CRITICAL` | - |

### Environment

| Value | Description |
|-------|-------------|
| `DEVELOPMENT` | - |
| `STAGING` | - |
| `PRODUCTION` | - |

### AgentType

| Value | Description |
|-------|-------------|
| `NODE_EXPORTER` | - |
| `APP_AGENT` | - |
| `MYSQL_EXPORTER` | - |
| `POSTGRES_EXPORTER` | - |
| `MONGODB_EXPORTER` | - |
| `NGINX_EXPORTER` | - |
| `APACHE_EXPORTER` | - |
| `REDIS_EXPORTER` | - |
| `LIBVIRT_EXPORTER` | - |
| `LITESPEED_EXPORTER` | - |
| `EXIM_EXPORTER` | - |
| `CPANEL_EXPORTER` | - |
| `PROMTAIL` | - |

### AgentStatus

| Value | Description |
|-------|-------------|
| `NOT_INSTALLED` | - |
| `INSTALLING` | - |
| `RUNNING` | - |
| `STOPPED` | - |
| `FAILED` | - |
| `UPDATING` | - |

### AlertSeverity

| Value | Description |
|-------|-------------|
| `CRITICAL` | - |
| `WARNING` | - |
| `INFO` | - |
| `DEBUG` | - |

### AlertStatus

| Value | Description |
|-------|-------------|
| `CLEAR` | - |
| `WARNING` | - |
| `CRITICAL` | - |
| `UNDEFINED` | - |
| `PENDING` | - |
| `FIRING` | - |
| `RESOLVED` | - |
| `SILENCED` | - |
| `ACKNOWLEDGED` | - |

### NotificationChannelType

| Value | Description |
|-------|-------------|
| `EMAIL` | - |
| `SLACK` | - |
| `DISCORD` | - |
| `WEBHOOK` | - |
| `PAGERDUTY` | - |
| `TELEGRAM` | - |

### UserRole

| Value | Description |
|-------|-------------|
| `ADMIN` | - |
| `OPERATOR` | - |
| `VIEWER` | - |

### EventType

| Value | Description |
|-------|-------------|
| `SERVER_ONLINE` | - |
| `SERVER_OFFLINE` | - |
| `SERVER_WARNING` | - |
| `SERVER_CRITICAL` | - |
| `SERVER_RECOVERED` | - |
| `AGENT_INSTALLED` | - |
| `AGENT_STARTED` | - |
| `AGENT_STOPPED` | - |
| `AGENT_FAILED` | - |
| `AGENT_UPDATED` | - |
| `ALERT_TRIGGERED` | - |
| `ALERT_RESOLVED` | - |
| `ALERT_ACKNOWLEDGED` | - |
| `THRESHOLD_WARNING` | - |
| `THRESHOLD_CRITICAL` | - |
| `THRESHOLD_CLEARED` | - |
| `ANOMALY_DETECTED` | - |
| `ANOMALY_RESOLVED` | - |
| `SYSTEM_STARTUP` | - |
| `SYSTEM_SHUTDOWN` | - |
| `HEARTBEAT_MISSED` | - |
| `CONNECTION_LOST` | - |
| `CONNECTION_RESTORED` | - |

### EventSeverity

| Value | Description |
|-------|-------------|
| `DEBUG` | - |
| `INFO` | - |
| `WARNING` | - |
| `CRITICAL` | - |

### UptimeCheckType

| Value | Description |
|-------|-------------|
| `HTTP` | - |
| `HTTPS` | - |
| `TCP` | - |
| `PING` | - |
| `DNS` | - |
| `SSL_CERT` | - |
| `DOMAIN` | - |

### UptimeCheckStatus

| Value | Description |
|-------|-------------|
| `UP` | - |
| `DOWN` | - |
| `DEGRADED` | - |

### IncidentStatus

| Value | Description |
|-------|-------------|
| `INVESTIGATING` | - |
| `IDENTIFIED` | - |
| `MONITORING` | - |
| `RESOLVED` | - |
| `POSTMORTEM` | - |

