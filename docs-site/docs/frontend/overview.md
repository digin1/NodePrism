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
| `/alerts` | `(dashboard)/alerts/page.tsx` | Active alerts list |
| `/alerts/rules` | `(dashboard)/alerts/rules/page.tsx` | Alert rules management |
| `/alerts/templates` | `(dashboard)/alerts/templates/page.tsx` | - |
| `/dashboard` | `(dashboard)/dashboard/page.tsx` | Main dashboard with overview |
| `/dashboards` | `(dashboard)/dashboards/page.tsx` | - |
| `/docs` | `(dashboard)/docs/page.tsx` | - |
| `/logs` | `(dashboard)/logs/page.tsx` | Log aggregation view |
| `/metrics` | `(dashboard)/metrics/page.tsx` | Metrics explorer (PromQL) |
| `/servers/:id` | `(dashboard)/servers/[id]/page.tsx` | Server details and metrics |
| `/servers/new` | `(dashboard)/servers/new/page.tsx` | Add new server |
| `/servers` | `(dashboard)/servers/page.tsx` | Server list and management |
| `/settings/audit` | `(dashboard)/settings/audit/page.tsx` | - |
| `/settings/notifications` | `(dashboard)/settings/notifications/page.tsx` | - |
| `/settings` | `(dashboard)/settings/page.tsx` | System settings |
| `/` | `page.tsx` | Home page / redirect |


## Key Components

| Component | Purpose |
|-----------|---------|
| `MetricsCharts` | Real-time metric visualization |
| `ServerCard` | Server status overview |
| `AlertsTable` | Alert list with filtering |
| `EnhancedMetricsChart` | Interactive Recharts graphs |
| `Sidebar` | Navigation menu |
