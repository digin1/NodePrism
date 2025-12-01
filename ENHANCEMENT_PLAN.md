# NodePrism Enhancement Plan
## Based on Netdata Architecture Analysis

This plan outlines enhancements for NodePrism inspired by Netdata's powerful features, adapted to work with our Prometheus-based architecture.

---

## Executive Summary

After analyzing Netdata's architecture, I've identified four major enhancement areas for NodePrism:

1. **ML-Powered Anomaly Detection** - Automatic detection of unusual metric patterns
2. **Advanced Alerting System** - Template-based alerts with hysteresis and multi-stage evaluation
3. **Enhanced Dashboard** - Real-time metrics with anomaly overlay and better visualization
4. **Extended Collectors** - More out-of-the-box integrations for common services

---

## Phase 1: ML-Powered Anomaly Detection

### Overview
Implement a lightweight anomaly detection system that runs alongside Prometheus, using K-means clustering similar to Netdata's approach.

### Components

#### 1.1 Anomaly Detection Service (`packages/anomaly-detector/`)
- New worker package that periodically fetches metrics from Prometheus
- Trains K-means models on metric time series
- Stores anomaly scores in Redis for real-time access
- Writes anomaly events to PostgreSQL for historical analysis

#### 1.2 Implementation Details

**Algorithm:**
- Use `ml-kmeans` or `simple-statistics` npm packages
- Train on last 4 hours of data per metric
- Maintain multiple models (2-day sliding window) for consensus
- Flag anomaly only when ALL models agree (reduces false positives by 99%)

**Data Structure:**
```typescript
interface AnomalyModel {
  metricName: string;
  serverId: string;
  clusterCenters: number[][];
  threshold: number; // 99th percentile distance
  trainedAt: Date;
  dataPoints: number;
}

interface AnomalyScore {
  metricName: string;
  serverId: string;
  timestamp: Date;
  score: number; // 0-100
  isAnomalous: boolean;
}
```

**API Endpoints:**
- `GET /api/anomalies` - Get current anomalies across all servers
- `GET /api/anomalies/server/:id` - Get anomalies for specific server
- `GET /api/anomalies/rate` - Get Node Anomaly Rate (NAR) over time
- `GET /api/metrics/:name/anomaly-bit` - Get anomaly status for specific metric

#### 1.3 Database Schema Additions
```prisma
model AnomalyEvent {
  id          String   @id @default(uuid())
  serverId    String
  server      Server   @relation(fields: [serverId], references: [id])
  metricName  String
  score       Float
  startedAt   DateTime
  endedAt     DateTime?
  severity    Float    // Percentage of metrics anomalous
  createdAt   DateTime @default(now())
}

model AnomalyModel {
  id             String   @id @default(uuid())
  serverId       String
  metricName     String
  clusterCenters Json
  threshold      Float
  trainedAt      DateTime
  expiresAt      DateTime

  @@unique([serverId, metricName])
}
```

---

## Phase 2: Advanced Alerting System

### Overview
Enhance the current alerting to support Netdata-style features: templates, hysteresis, duration requirements, and multi-stage alerts.

### 2.1 Alert Templates
Allow defining alerts once and applying to all matching servers/metrics.

```typescript
interface AlertTemplate {
  id: string;
  name: string;
  description: string;

  // Matching criteria
  matchLabels: Record<string, string>; // e.g., { "job": "node-exporter" }
  matchHostLabels: Record<string, string>; // e.g., { "environment": "production" }

  // Alert configuration
  query: string; // PromQL
  calc?: string; // Additional calculation expression
  units: string;

  // Thresholds with hysteresis
  warn: {
    condition: string;
    hysteresis?: { trigger: number; clear: number };
  };
  crit: {
    condition: string;
    hysteresis?: { trigger: number; clear: number };
  };

  // Timing
  every: string; // Evaluation interval
  for: string;   // Duration before firing

  // Actions
  actions: AlertAction[];
}
```

### 2.2 Hysteresis (Anti-Flapping)
Prevent alert flapping by requiring different thresholds for triggering vs clearing:

```typescript
// Example: Trigger at 80%, clear at 50%
warn: ($status < $WARNING) ? ($this > 80) : ($this > 50)
```

### 2.3 Multi-Stage Alerts
Create dependent alerts that build on each other:

```yaml
# Stage 1: Calculate baseline
template: requests_avg_yesterday
on: http_requests_total
lookup: average -1h at -1d
every: 10s

# Stage 2: Compare to baseline
template: requests_vs_baseline
on: http_requests_total
calc: $requests_current * 100 / $requests_avg_yesterday
units: %
warn: $this > 150 || $this < 75
crit: $this > 200 || $this < 50
```

### 2.4 Alert States
Expand alert states beyond FIRING/RESOLVED:

| State | Description |
|-------|-------------|
| CLEAR | Conditions not triggered |
| WARNING | Warning threshold exceeded |
| CRITICAL | Critical threshold exceeded |
| UNDEFINED | Cannot evaluate (no data) |
| PENDING | Condition met, waiting for duration |
| SILENCED | Manually silenced |

### 2.5 API Enhancements
- `POST /api/alerts/templates` - Create alert template
- `GET /api/alerts/templates` - List templates
- `POST /api/alerts/templates/:id/test` - Test template against historical data
- `POST /api/alerts/:id/silence` - Silence an alert
- `GET /api/alerts/history` - Get alert state transition history

---

## Phase 3: Enhanced Dashboard

### Overview
Improve the web UI with real-time metrics, anomaly overlays, and better visualization.

### 3.1 Real-time Metrics Dashboard
- WebSocket-based metric streaming (already have Socket.IO)
- 1-second resolution charts for key metrics
- Anomaly overlay on charts (highlight anomalous periods)

### 3.2 New Dashboard Components

**Anomaly Advisor Panel:**
- Shows current Node Anomaly Rate
- Lists top anomalous metrics
- One-click drill-down to affected charts
- AI-assisted troubleshooting suggestions (future)

**Server Health Cards:**
```tsx
interface ServerHealthCard {
  serverId: string;
  hostname: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  anomalyRate: number;
  activeAlerts: number;
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
    network: { in: number; out: number };
  };
}
```

**Timeline View:**
- Unified timeline showing:
  - Metric anomalies
  - Alert state changes
  - Deployment events
  - Configuration changes

### 3.3 Chart Enhancements
- Composite charts (multiple metrics on same chart)
- Chart zoom and time range selection
- Metric correlation view
- Baseline comparison (current vs yesterday/last week)

---

## Phase 4: Extended Collectors

### Overview
Add more out-of-the-box monitoring capabilities for common services.

### 4.1 Priority Collectors to Add

**Databases:**
- MySQL/MariaDB exporter
- PostgreSQL exporter
- MongoDB exporter
- Redis exporter

**Web Servers:**
- Nginx exporter
- Apache exporter
- HAProxy exporter

**Message Queues:**
- RabbitMQ exporter (already have RabbitMQ in stack)
- Kafka exporter

**Containers:**
- Docker metrics
- Container resource usage

### 4.2 Auto-Discovery
Implement service auto-discovery:
- Detect running services on target servers
- Automatically configure appropriate exporters
- Generate relevant dashboards

### 4.3 Application Metrics
Enhance the agent-app to collect:
- Process-level metrics
- Custom application metrics (via HTTP endpoint)
- Log-based metrics extraction

---

## Implementation Priority

### Sprint 1 (Immediate)
1. Add anomaly detection service skeleton
2. Create anomaly database schema
3. Implement basic K-means training

### Sprint 2
1. Complete anomaly detection API
2. Add anomaly overlay to dashboards
3. Implement alert templates

### Sprint 3
1. Add hysteresis to alerts
2. Implement multi-stage alerts
3. Enhanced alert history

### Sprint 4
1. Real-time metric streaming
2. Anomaly advisor panel
3. Timeline view

### Sprint 5
1. Additional database exporters
2. Service auto-discovery
3. Enhanced agent-app

---

## Technical Considerations

### Performance
- Anomaly detection runs asynchronously (not in request path)
- Model training batched during low-load periods
- Redis caching for real-time anomaly scores
- Efficient Prometheus queries with time-based partitioning

### Storage
- Anomaly events in PostgreSQL (historical analysis)
- Current anomaly state in Redis (real-time access)
- Models stored in PostgreSQL with expiration

### Scalability
- Anomaly detection can be distributed per server group
- Alert evaluation can be parallelized
- WebSocket updates use pub/sub pattern

---

## File Structure for New Packages

```
packages/
├── anomaly-detector/
│   ├── src/
│   │   ├── index.ts
│   │   ├── services/
│   │   │   ├── modelTrainer.ts
│   │   │   ├── anomalyScorer.ts
│   │   │   └── metricsCollector.ts
│   │   ├── models/
│   │   │   └── kmeans.ts
│   │   └── utils/
│   │       └── featureExtractor.ts
│   ├── package.json
│   └── tsconfig.json
└── shared/
    └── src/
        └── types/
            └── anomaly.ts (new)
```

---

## Reference: Netdata Features Adapted

| Netdata Feature | NodePrism Adaptation |
|-----------------|---------------------|
| K-means anomaly detection | anomaly-detector package |
| Multi-model consensus | Multiple models per metric |
| Anomaly bit in storage | Separate anomaly_events table |
| Alert templates | alert_templates table + matching |
| Hysteresis | Threshold conditions with status |
| Edge evaluation | Alerts evaluated at API level |
| Parent-child streaming | Already using Prometheus remote write |

---

## Next Steps

1. Review and approve this plan
2. Create the anomaly-detector package
3. Add Prisma schema for anomaly models and events
4. Begin Phase 1 implementation

