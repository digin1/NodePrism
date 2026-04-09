---
sidebar_position: 1
title: Frontend
---

# Frontend Pages


## Technology Stack

- **Framework:** Next.js 14 (App Router)
- **UI Library:** React 18
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** Zustand + React Query
- **Real-time:** Socket.IO Client

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/login` | `(auth)/login/page.tsx` | User authentication |
| `/register` | `(auth)/register/page.tsx` | User registration |
| `/alert-inhibition-rules` | `(dashboard)/alert-inhibition-rules/page.tsx` | - |
| `/alert-routing-rules` | `(dashboard)/alert-routing-rules/page.tsx` | - |
| `/alerts` | `(dashboard)/alerts/page.tsx` | Active alerts list |
| `/alerts/rules` | `(dashboard)/alerts/rules/page.tsx` | Alert rules management |
| `/alerts/templates` | `(dashboard)/alerts/templates/page.tsx` | - |
| `/annotations` | `(dashboard)/annotations/page.tsx` | - |
| `/api-tokens` | `(dashboard)/api-tokens/page.tsx` | - |
| `/composite-monitors` | `(dashboard)/composite-monitors/page.tsx` | - |
| `/dashboard` | `(dashboard)/dashboard/page.tsx` | Main dashboard with overview |
| `/dashboards` | `(dashboard)/dashboards/page.tsx` | - |
| `/docs` | `(dashboard)/docs/page.tsx` | - |
| `/escalation-policies` | `(dashboard)/escalation-policies/page.tsx` | - |
| `/incidents/:id` | `(dashboard)/incidents/[id]/page.tsx` | - |
| `/incidents` | `(dashboard)/incidents/page.tsx` | - |
| `/infra-changes` | `(dashboard)/infra-changes/page.tsx` | - |
| `/infrastructure-logs` | `(dashboard)/infrastructure-logs/page.tsx` | - |
| `/kubernetes` | `(dashboard)/kubernetes/page.tsx` | - |
| `/logs` | `(dashboard)/logs/page.tsx` | Log aggregation view |
| `/metrics` | `(dashboard)/metrics/page.tsx` | Metrics explorer (PromQL) |
| `/multi-step-monitors` | `(dashboard)/multi-step-monitors/page.tsx` | - |
| `/on-call` | `(dashboard)/on-call/page.tsx` | - |
| `/post-mortems` | `(dashboard)/post-mortems/page.tsx` | - |
| `/retention-policies` | `(dashboard)/retention-policies/page.tsx` | - |
| `/rum` | `(dashboard)/rum/page.tsx` | - |
| `/runbooks` | `(dashboard)/runbooks/page.tsx` | - |
| `/scheduled-reports` | `(dashboard)/scheduled-reports/page.tsx` | - |
| `/servers/:id` | `(dashboard)/servers/[id]/page.tsx` | Server details and metrics |
| `/servers/new` | `(dashboard)/servers/new/page.tsx` | Add new server |
| `/servers` | `(dashboard)/servers/page.tsx` | Server list and management |
| `/service-map` | `(dashboard)/service-map/page.tsx` | - |
| `/settings/audit` | `(dashboard)/settings/audit/page.tsx` | - |
| `/settings/notifications` | `(dashboard)/settings/notifications/page.tsx` | - |
| `/settings` | `(dashboard)/settings/page.tsx` | System settings |
| `/settings/users` | `(dashboard)/settings/users/page.tsx` | - |
| `/sla-policies` | `(dashboard)/sla-policies/page.tsx` | - |
| `/slos` | `(dashboard)/slos/page.tsx` | - |
| `/snmp-devices` | `(dashboard)/snmp-devices/page.tsx` | - |
| `/status-pages` | `(dashboard)/status-pages/page.tsx` | - |
| `/synthetic-checks` | `(dashboard)/synthetic-checks/page.tsx` | - |
| `/system-status` | `(dashboard)/system-status/page.tsx` | - |
| `/traces/:traceId` | `(dashboard)/traces/[traceId]/page.tsx` | - |
| `/traces` | `(dashboard)/traces/page.tsx` | - |
| `/uptime` | `(dashboard)/uptime/page.tsx` | - |
| `/` | `page.tsx` | Home page / redirect |
| `/status/:slug` | `status/[slug]/page.tsx` | - |


## Key Components

| Component | Purpose |
|-----------|---------|
| `MetricsCharts` | Real-time metric visualization |
| `ServerCard` | Server status overview |
| `AlertsTable` | Alert list with filtering |
| `EnhancedMetricsChart` | Interactive Recharts graphs |
| `Sidebar` | Navigation menu |
