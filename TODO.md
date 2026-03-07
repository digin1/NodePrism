# NodePrism - Development Roadmap

> Last updated: 2026-03-07
> Track progress by checking items as they are completed.

---

## Phase 1: Fix Broken / Incomplete Features

### 1.1 Notification System
- [x] Create `packages/api/src/routes/notifications.ts` with CRUD endpoints
- [x] Create `packages/api/src/services/notificationSender.ts` (dispatch engine)
- [x] Implement Email sender (SMTP)
- [x] Implement Slack webhook sender
- [x] Implement Discord webhook sender
- [x] Implement generic Webhook sender
- [x] Implement Telegram bot sender
- [x] Implement PagerDuty integration
- [x] Wire AlertManager webhook handler to trigger notifications
- [x] Add notification channel management UI page (`/settings/notifications`)
- [x] Add notification history/log
- [x] Write tests: `notifications.test.ts`

### 1.2 Audit Logging
- [x] Create `packages/api/src/routes/audit.ts` with query/filter endpoints
- [x] Create `packages/api/src/services/auditLogger.ts` utility
- [x] Populate audit log on: server CRUD, alert rule changes, settings changes, user actions
- [x] Add audit log viewer UI page (`/settings/audit`)
- [x] Write tests: `auditLogger.test.ts`

### 1.3 Multi-Stage Alert Processor
- [x] Replace mock random data with real Prometheus queries in `multiStageAlertProcessor.ts`
- [x] Replace unsafe `eval()` with safe condition parser in `alertTemplateService.ts`
- [x] Implement hysteresis logic using `alertTemplateService.evaluateHysteresis()`
- [x] Wire into alert evaluation loop (called from metric collector cycle)
- [x] Dispatch notifications when template alerts fire
- [x] Write tests: `multiStageAlertProcessor.test.ts`

### 1.4 Alert Template UI
- [x] Add `/alerts/templates` page with template list, create, edit, delete
- [x] Implement the test endpoint (`POST /api/alerts/templates/:id/test`) — run template query against Prometheus and return live results
- [x] Show matched servers per template (test results table with per-server values)
- [x] Write tests: `alertTemplates.test.ts`

### 1.5 Auto-Discovery Service
- [x] Fix version probing (MySQL TCP banner, Redis INFO, PostgreSQL SSL probe)
- [x] Make discovery configurable via DISCOVERY_TARGETS env var
- [x] Wire `runDiscoveryAndUpdate()` into scheduled job (startAutoDiscovery)
- [x] Write Prometheus file_sd target files and reload Prometheus
- [x] Store discovery events in EventLog
- [x] Write tests: `autoDiscovery.test.ts`

### 1.6 Custom Dashboards
- [x] Create `packages/api/src/routes/dashboards.ts` with CRUD endpoints
- [x] Add `/dashboards` page with dashboard builder UI
- [x] Support configurable metric panels with PromQL queries, grid layout, preset panels
- [x] Add Dashboards link to sidebar navigation
- [x] Write tests: `dashboards.test.ts`

---

## Phase 2: High-Value Additions

### 2.1 User Management UI
- [x] Add `/settings/users` admin page
- [x] List all users with role, last login, created date
- [x] Create new user form
- [x] Edit user (change role, reset password)
- [x] Delete user (with confirmation)
- [x] Role assignment (ADMIN, OPERATOR, VIEWER)
- [x] Write tests: `userManagement.test.ts`

### 2.2 Server Tags UI
- [x] Add tag management component on server list page (add/remove tags)
- [x] Add tag filter dropdown to server list
- [x] Bulk tag operations (select multiple servers, apply/remove tags)
- [x] Tag auto-complete from existing tags
- [x] Write tests: `serverTags.test.ts`

### 2.3 Bandwidth / Traffic Dashboard
- [x] Add bandwidth summary cards to server detail page
- [x] Show hourly/daily/weekly/monthly traffic breakdown
- [x] Add network traffic panel to main dashboard
- [x] Top-N servers by bandwidth widget
- [x] Write tests: `bandwidth.test.ts`

### 2.4 Bulk Operations
- [x] Bulk delete servers
- [x] Bulk acknowledge/silence alerts
- [x] Bulk move servers to group
- [x] Select-all checkbox with shift-click support
- [x] Write tests: `bulkOperations.test.ts`

### 2.5 Config Export / Import
- [x] Export alert rules, templates, settings as JSON
- [x] Import from JSON with conflict resolution (skip/overwrite)
- [x] Add export/import buttons to settings page
- [x] Write tests: `configExportImport.test.ts`

---

## Phase 3: Operational Improvements

### 3.1 Health Check Endpoint Enrichment
- [x] Extend `GET /health` to include DB connectivity, Redis status, Prometheus reachability
- [x] Add response time for each dependency
- [x] Return degraded status if any dependency is slow/down
- [x] Update health-check.sh to use enriched endpoint
- [x] Write tests: `healthCheck.test.ts`

### 3.2 API Self-Monitoring (Prometheus Metrics)
- [x] Add `prom-client` to API package
- [x] Expose `GET /metrics` endpoint on API (port 4000)
- [x] Track: request count, latency histogram, error rate, active WebSocket connections
- [x] Add API scrape job to Prometheus config
- [x] Add API metrics panel to Grafana system-overview dashboard
- [x] Write tests: `apiMetrics.test.ts`

### 3.3 Scheduled Maintenance Windows
- [x] Add `MaintenanceWindow` model to Prisma schema (serverId, startTime, endTime, reason)
- [x] Create CRUD routes for maintenance windows
- [x] Suppress alerts for servers in maintenance window
- [x] Show maintenance indicator on server cards and detail page
- [x] Write tests: `maintenanceWindows.test.ts`

### 3.4 Graceful Degradation
- [ ] Anomaly detector: fallback to DB-only mode if Redis is down
- [ ] Config sync: retry with backoff if Prometheus is unreachable
- [ ] API: return cached data if Prometheus query times out
- [ ] Log degraded state and emit WebSocket event
- [ ] Write tests: `gracefulDegradation.test.ts`

### 3.5 Database Backup & Restore
- [ ] Add scheduled PostgreSQL backup (`pg_dump`) to housekeeping service
- [ ] Configurable retention (keep N backups)
- [ ] Add backup status to settings system-info endpoint
- [ ] Add manual backup trigger in settings UI
- [ ] Write tests: `dbBackup.test.ts`

---

## Phase 4: Additional Grafana Dashboards

### 4.1 Dashboards
- [ ] PostgreSQL overview dashboard (connections, queries, locks, replication)
- [ ] MongoDB overview dashboard (operations, connections, memory)
- [ ] Network traffic dashboard (per-server bandwidth, top talkers)
- [ ] Anomaly detection dashboard (NAR scores, model counts, anomaly events timeline)
- [ ] NodePrism API self-monitoring dashboard (request rates, latencies, errors)
- [ ] Container/VM overview dashboard (using PostgreSQL datasource for virtual_containers table)

---

## Phase 5: Nice-to-Have Enhancements

### 5.1 Agent Auto-Update
- [ ] Add version check endpoint to API (`GET /api/agents/latest-version/:type`)
- [ ] Agent script: `update` command that checks version and re-downloads if newer
- [ ] Optional auto-update via cron job

### 5.2 Container Detail View
- [ ] Click-through from container list to detail panel
- [ ] Show resource usage trends (network RX/TX over time)
- [ ] Container status history

### 5.3 SSL/TLS for Agent Communication
- [ ] Integrate `generate-certs.sh` into agent setup flow
- [ ] Support HTTPS for agent registration and heartbeat
- [ ] Mutual TLS option for high-security environments

### 5.4 UI Enhancements
- [ ] Dark/light theme toggle (currently dark-only)
- [ ] Timezone and date format editable in settings UI
- [ ] Keyboard shortcuts for common actions
- [ ] In-app documentation page (instead of redirect to external docs)

### 5.5 Cleanup
- [ ] Remove `zustand` from web package.json (unused dependency)
- [ ] Fix health-check.sh to use correct API port (shows 3002, should be 4000)
- [ ] Fix integration-test.sh API_URL default (shows 3002, should be 4000)

---

## Test Suite Status

### Unit Tests
- [x] `targetGenerator.test.ts` — Prometheus target generation (8 tests)
- [x] `notifications.test.ts` — Notification dispatch (24 tests)
- [x] `auditLogger.test.ts` — Audit log entries and querying (16 tests)
- [x] `multiStageAlertProcessor.test.ts` — Condition evaluation, hysteresis, PromQL injection (30 tests)
- [x] `alertTemplates.test.ts` — Alert template config, label matching, validation (19 tests)
- [x] `autoDiscovery.test.ts` — Target parsing, port mapping, banner parsing (20 tests)
- [x] `dashboards.test.ts` — Panel validation, config structure, grid layout (17 tests)
- [x] `userManagement.test.ts` — User CRUD, roles, and permission hierarchy (19 tests)
- [x] `serverTags.test.ts` — Tag filtering, bulk ops, autocomplete (25 tests)
- [x] `bandwidth.test.ts` — Bandwidth formatting, ranking, and visualization (14 tests)
- [x] `bulkOperations.test.ts` — Bulk delete, acknowledge, silence, move, selection (19 tests)
- [x] `configExportImport.test.ts` — Config export/import validation and conflict resolution (32 tests)
- [x] `healthCheck.test.ts` — Health endpoint enrichment and dependency checks (23 tests)
- [x] `apiMetrics.test.ts` — Prometheus self-metrics, route normalization, error classification (26 tests)
- [x] `maintenanceWindows.test.ts` — Maintenance window validation, suppression, overlap detection (23 tests)
- [ ] `gracefulDegradation.test.ts` — Fallback behavior
- [ ] `dbBackup.test.ts` — Backup scheduling
- [x] `housekeeping.test.ts` — Disk-aware cleanup logic (11 tests)
- [ ] `heartbeatCleanup.test.ts` — Agent health monitoring
- [x] `metricCollector.test.ts` — Metric collection and storage (12 tests)
- [x] `eventLogger.test.ts` — Event logging (11 tests)
- [x] `containers.test.ts` — Container CRUD and BigInt serialization (11 tests)
- [x] `auth.test.ts` — Authentication and authorization (8 tests)
- [x] `servers.test.ts` — Server CRUD and validation (11 tests)
- [x] `agents.test.ts` — Agent registration and heartbeat (18 tests)
- [x] `alerts.test.ts` — Alert lifecycle (fire, acknowledge, silence, resolve) (17 tests)
- [x] `serverGroups.test.ts` — Hierarchical group operations (19 tests)

### Integration Tests
- [x] `integration-test.sh` — End-to-end service health and API tests
- [x] `health-check.sh` — Quick service port checks
- [ ] Agent registration flow (script -> API -> Prometheus targets -> scraping)
- [ ] Alert flow (Prometheus rule fires -> AlertManager -> webhook -> EventLog -> WebSocket)
- [ ] Anomaly detection flow (Prometheus data -> training -> scoring -> WebSocket)
- [ ] Config sync flow (Prometheus targets -> DB status update -> EventLog)
- [ ] Container reporting flow (agent script -> API -> DB -> UI)

### Load / Stress Tests
- [ ] API rate limiting validation (general, auth, agent, metrics limiters)
- [ ] WebSocket connection scaling (100+ concurrent connections)
- [ ] Metric collection under high server count (50+ servers)
- [ ] Housekeeping performance with large tables (100k+ rows)
