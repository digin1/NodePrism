---
sidebar_position: 1
title: Frontend
---

# Frontend Pages


## Technology Stack

- **Framework:** Next.js 14 (App Router)
- **UI Library:** React 18
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** TanStack Query (React Query)
- **Real-time:** Socket.IO Client

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/login` | `(auth)/login/page.tsx` | User authentication |
| `/register` | `(auth)/register/page.tsx` | User registration |
| `/dashboard` | `(dashboard)/dashboard/page.tsx` | Main dashboard with overview |
| `/servers` | `(dashboard)/servers/page.tsx` | Server list and management |
| `/servers/:id` | `(dashboard)/servers/[id]/page.tsx` | Server details, metrics, and container/VM monitoring |
| `/servers/new` | `(dashboard)/servers/new/page.tsx` | Add new server |
| `/alerts` | `(dashboard)/alerts/page.tsx` | Active alerts list |
| `/alerts/rules` | `(dashboard)/alerts/rules/page.tsx` | Alert rules management |
| `/alerts/templates` | `(dashboard)/alerts/templates/page.tsx` | Alert template management |
| `/metrics` | `(dashboard)/metrics/page.tsx` | Metrics explorer (PromQL) |
| `/dashboards` | `(dashboard)/dashboards/page.tsx` | Custom dashboards |
| `/uptime` | `(dashboard)/uptime/page.tsx` | Uptime monitoring |
| `/incidents` | `(dashboard)/incidents/page.tsx` | Incident management |
| `/logs` | `(dashboard)/logs/page.tsx` | Log aggregation view (Loki) |
| `/infrastructure-logs` | `(dashboard)/infrastructure-logs/page.tsx` | Infrastructure event logs |
| `/docs` | `(dashboard)/docs/page.tsx` | Documentation reference |
| `/settings` | `(dashboard)/settings/page.tsx` | System settings |
| `/settings/users` | `(dashboard)/settings/users/page.tsx` | User management |
| `/settings/notifications` | `(dashboard)/settings/notifications/page.tsx` | Notification channels |
| `/settings/audit` | `(dashboard)/settings/audit/page.tsx` | Audit log |
| `/` | `page.tsx` | Home page / redirect |


## Key Components

| Component | Purpose |
|-----------|---------|
| `MetricsCharts` | Real-time metric visualization |
| `ServerCard` | Server status overview |
| `AlertsTable` | Alert list with filtering |
| `EnhancedMetricsChart` | Interactive Recharts graphs |
| `Sidebar` | Navigation menu |
