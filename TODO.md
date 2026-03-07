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
- [ ] Fix version probing (MySQL, PostgreSQL, MongoDB, Redis, Nginx)
- [ ] Make discovery configurable (scan specific IPs/subnets, not just localhost)
- [ ] Wire `runDiscoveryAndUpdate()` into a scheduled job
- [ ] Add UI display of discovered services on server detail page
- [ ] Write tests: `autoDiscovery.test.ts`

### 1.6 Custom Dashboards
- [ ] Create `packages/api/src/routes/dashboards.ts` with CRUD endpoints
- [ ] Add `/dashboards` page with dashboard builder UI
- [ ] Support drag-and-drop metric panels with configurable PromQL queries
- [ ] Write tests: `dashboards.test.ts`

---

## Phase 2: High-Value Additions

### 2.1 User Management UI
- [ ] Add `/settings/users` admin page
- [ ] List all users with role, last login, created date
- [ ] Create new user form
- [ ] Edit user (change role, reset password)
- [ ] Delete user (with confirmation)
- [ ] Role assignment (ADMIN, OPERATOR, VIEWER)
- [ ] Write tests: `userManagement.test.ts`

### 2.2 Server Tags UI
- [ ] Add tag management component on server list page (add/remove tags)
- [ ] Add tag filter dropdown to server list
- [ ] Bulk tag operations (select multiple servers, apply/remove tags)
- [ ] Tag auto-complete from existing tags
- [ ] Write tests: `serverTags.test.ts`

### 2.3 Bandwidth / Traffic Dashboard
- [ ] Add bandwidth summary cards to server detail page
- [ ] Show hourly/daily/weekly/monthly traffic breakdown
- [ ] Add network traffic panel to main dashboard
- [ ] Top-N servers by bandwidth widget
- [ ] Write tests: `bandwidth.test.ts`

### 2.4 Bulk Operations
- [ ] Bulk delete servers
- [ ] Bulk acknowledge/silence alerts
- [ ] Bulk move servers to group
- [ ] Select-all checkbox with shift-click support
- [ ] Write tests: `bulkOperations.test.ts`

### 2.5 Config Export / Import
- [ ] Export alert rules, templates, settings as JSON
- [ ] Import from JSON with conflict resolution (skip/overwrite)
- [ ] Add export/import buttons to settings page
- [ ] Write tests: `configExportImport.test.ts`

---

## Phase 3: Operational Improvements

### 3.1 Health Check Endpoint Enrichment
- [ ] Extend `GET /health` to include DB connectivity, Redis status, Prometheus reachability
- [ ] Add response time for each dependency
- [ ] Return degraded status if any dependency is slow/down
- [ ] Update health-check.sh to use enriched endpoint
- [ ] Write tests: `healthCheck.test.ts`

### 3.2 API Self-Monitoring (Prometheus Metrics)
- [ ] Add `prom-client` to API package
- [ ] Expose `GET /metrics` endpoint on API (port 4000)
- [ ] Track: request count, latency histogram, error rate, active WebSocket connections
- [ ] Add API scrape job to Prometheus config
- [ ] Add API metrics panel to Grafana system-overview dashboard
- [ ] Write tests: `apiMetrics.test.ts`

### 3.3 Scheduled Maintenance Windows
- [ ] Add `MaintenanceWindow` model to Prisma schema (serverId, startTime, endTime, reason)
- [ ] Create CRUD routes for maintenance windows
- [ ] Suppress alerts for servers in maintenance window
- [ ] Show maintenance indicator on server cards and detail page
- [ ] Write tests: `maintenanceWindows.test.ts`

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
- [ ] `autoDiscovery.test.ts` — Service auto-discovery
- [ ] `dashboards.test.ts` — Dashboard CRUD
- [ ] `userManagement.test.ts` — User CRUD and roles
- [ ] `serverTags.test.ts` — Tag operations
- [ ] `bandwidth.test.ts` — Bandwidth calculations
- [ ] `bulkOperations.test.ts` — Bulk server/alert operations
- [ ] `configExportImport.test.ts` — Config export/import
- [ ] `healthCheck.test.ts` — Health endpoint
- [ ] `apiMetrics.test.ts` — Prometheus self-metrics
- [ ] `maintenanceWindows.test.ts` — Maintenance window logic
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
