# Services

> Auto-generated on 2026-03-07

## Overview

NodePrism services handle background processing, data collection, and system coordination.

| Service | Purpose |
|---------|---------|
| [MetricCollector](#metriccollector) | Collects metrics from Prometheus and stores in database |
| [EventLogger](#eventlogger) | Centralized event logging with real-time Socket.IO distribution |
| [TargetGenerator](#targetgenerator) | Generates Prometheus target files for service discovery |
| [HeartbeatCleanup](#heartbeatcleanup) | Monitors agent heartbeats and cleans up stale data |
| [AlertTemplateService](#alerttemplateservice) | Advanced alert template management with hysteresis support |
| [AutoDiscoveryService](#autodiscoveryservice) | Automatically discovers running services on target servers |

---

## MetricCollector

**File:** `packages/api/src/services/metricCollector.ts`

Collects metrics from Prometheus and stores in database

**Key Functions:**

- `startMetricCollector()`
- `stopMetricCollector()`
- `collectAllMetrics()`
- `getAggregatedMetrics()`
- `getBandwidthSummary()`

---

## EventLogger

**File:** `packages/api/src/services/eventLogger.ts`

Centralized event logging with real-time Socket.IO distribution

**Key Functions:**

- `logEvent()`
- `logServerStatusChange()`
- `logAgentStatusChange()`
- `logDeployment()`
- `logThresholdAlert()`

---

## TargetGenerator

**File:** `packages/api/src/services/targetGenerator.ts`

Generates Prometheus target files for service discovery

**Key Functions:**

- `generateTargetFiles()`
- `generateTargetFileForType()`
- `reloadPrometheus()`

---

## HeartbeatCleanup

**File:** `packages/api/src/services/heartbeatCleanup.ts`

Monitors agent heartbeats and cleans up stale data

**Key Functions:**

- `startHeartbeatCleanup()`
- `stopHeartbeatCleanup()`

---

## AlertTemplateService

**File:** `packages/api/src/services/alertTemplateService.ts`

Advanced alert template management with hysteresis support

**Key Functions:**

- `evaluateTemplate()`
- `matchTemplate()`
- `processAlerts()`

---

## AutoDiscoveryService

**File:** `packages/api/src/services/autoDiscoveryService.ts`

Automatically discovers running services on target servers

**Key Functions:**

- `discoverServices()`
- `generateTargetConfigs()`

---

