# Database Schema

> Auto-generated on 2025-12-02

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

### Server

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| hostname | String | ✓ | - |
| ipAddress | String | ✓ | - |
| sshPort | Int | ✓ | Default: 22 |
| sshUsername | String | - | - |
| status | ServerStatus | ✓ | Default: OFFLINE |
| environment | Environment | ✓ | Default: PRODUCTION |
| region | String | - | - |
| tags | String[] | ✓ | Default: [] |
| metadata | Json | - | - |
| lastSeen | DateTime | - | - |
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |
| agents | Agent[] | ✓ | - |
| deployments | Deployment[] | ✓ | - |
| alerts | Alert[] | ✓ | - |
| anomalyEvents | AnomalyEvent[] | ✓ | - |
| anomalyModels | AnomalyModel[] | ✓ | - |
| metricHistory | MetricHistory[] | ✓ | - |
| eventLogs | EventLog[] | ✓ | - |

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

### Deployment

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | ✓ | - |
| agentType | AgentType | ✓ | - |
| status | DeploymentStatus | ✓ | Default: PENDING |
| logs | String | - | - |
| startedAt | DateTime | - | - |
| finishedAt | DateTime | - | - |
| error | String | - | - |
| createdAt | DateTime | ✓ | Default: now( |
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
| createdAt | DateTime | ✓ | Default: now( |
| rule | AlertRule | - | Relation |
| template | AlertTemplate | - | Relation |
| server | Server | - | Relation |

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

### SshCredential

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | String | ✓ | Primary Key, Default: uuid( |
| serverId | String | ✓ | Unique |
| vaultPath | String | ✓ | - |
| keyType | String | ✓ | Default: "password" |
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
| createdAt | DateTime | ✓ | Default: now( |
| updatedAt | DateTime | ✓ | - |

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

## Enums

### ServerStatus

| Value | Description |
|-------|-------------|
| `ONLINE` | - |
| `OFFLINE` | - |
| `WARNING` | - |
| `CRITICAL` | - |
| `DEPLOYING` | - |
| `MAINTENANCE` | - |

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

### DeploymentStatus

| Value | Description |
|-------|-------------|
| `PENDING` | - |
| `IN_PROGRESS` | - |
| `COMPLETED` | - |
| `FAILED` | - |
| `CANCELLED` | - |

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
| `DEPLOYMENT_STARTED` | - |
| `DEPLOYMENT_COMPLETED` | - |
| `DEPLOYMENT_FAILED` | - |
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

