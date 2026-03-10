---
sidebar_position: 1
title: Architecture Overview
description: NodePrism system architecture — manager node with Next.js, Express API, config sync, anomaly detector, and Prometheus-based monitoring stack.
keywords: [architecture, system design, Prometheus, Grafana, Socket.IO, PM2, reverse proxy]
---

# Architecture Overview

## System Architecture

```mermaid
flowchart TB
    Browser["Browser"]

    subgraph Manager["NodePrism Manager"]
        Proxy["Nginx Reverse Proxy :8443
        Rate limiting · Security headers · SSL"]
        Web["Next.js Web UI :3000
        Proxies /grafana/ /prometheus/ /alertmanager/"]
        API["Express API + Socket.IO :4000
        REST API · JWT auth · Prisma ORM"]
        CS["Config Sync :4002"]
        AD["Anomaly Detector :4003
        K-means clustering · Redis cache"]

        subgraph Docker["Docker Infrastructure"]
            Prometheus["Prometheus :9090
            (127.0.0.1 only)"]
            Grafana["Grafana :3030
            (127.0.0.1 only)"]
            AM["AlertManager :9093
            (127.0.0.1 only)"]
            Loki["Loki :3100"]
            DB[(PostgreSQL)]
            Redis[(Redis)]
        end
    end

    subgraph Servers["Monitored Servers"]
        S1["Server 1
        Agent · Exporters · Promtail"]
        S2["Server 2
        Agent · Exporters · Promtail"]
        SN["Server N
        Agent · Exporters · Promtail"]
    end

    Browser --> Proxy
    Proxy --> Web
    Proxy --> API
    Web -->|"proxy rewrites"| Grafana
    Web -->|"proxy rewrites"| Prometheus
    Web -->|"proxy rewrites"| AM

    API --> DB
    API --> Redis
    AD --> Prometheus
    AD --> Redis
    AD --> DB
    CS --> DB
    CS -->|"writes target files"| Prometheus

    Prometheus -->|"scrapes metrics"| S1
    Prometheus -->|"scrapes metrics"| S2
    Prometheus -->|"scrapes metrics"| SN
    Prometheus --> AM
    AM -->|"webhook"| API

    S1 -->|"register + heartbeat"| API
    S2 -->|"register + heartbeat"| API
    SN -->|"register + heartbeat"| API

    S1 -->|"logs"| Loki
    S2 -->|"logs"| Loki
    SN -->|"logs"| Loki
```

## Package Structure

| Package | Port | Purpose |
|---------|------|---------|
| `@nodeprism/web` | 3000 | Next.js management UI, proxies monitoring tools |
| `@nodeprism/api` | 4000 | Express REST API + Socket.IO + webhook handlers |
| `@nodeprism/config-sync` | 4002 | Syncs servers/agents to Prometheus target files, syncs status back |
| `@nodeprism/anomaly-detector` | 4003 | ML anomaly detection with K-means clustering |
| `@nodeprism/agent-app` | 9101 | Remote server monitoring agent |
| `@nodeprism/shared` | — | Shared TypeScript types, Zod schemas, utilities |

## Data Flow

### 1. Agent Registration

```mermaid
flowchart LR
    Agent["Agent :9101"] --> |"POST /api/agents/register"| API["API :4000"]
    API --> DB[(PostgreSQL)]
    CS["Config Sync"] --> DB
    CS --> |"writes targets.json"| TJ["Prometheus file_sd"]
    TJ --> P["Prometheus"]
    Agent --> |"heartbeat every 30s"| API
```

When an agent registers, the API creates server and agent records in PostgreSQL. Config Sync periodically reads the database and generates JSON target files. Prometheus watches these files for changes via `file_sd_configs`.

### 2. Metrics Collection

```mermaid
flowchart LR
    Exporters["Exporters
    :9100 :9104 :9113 ..."] --> P["Prometheus"]
    P --> G["Grafana"]
    P --> API["API :4000"]
    API --> WS["Socket.IO"]
    WS --> UI["Web UI"]
```

### 3. Alert Pipeline

```mermaid
flowchart LR
    P["Prometheus"] --> |"fires alerts"| AM["AlertManager"]
    AM --> |"webhook POST"| API["API :4000"]
    API --> DB[(Database)]
    API --> N["Notifications
    Slack · Telegram · Email
    Discord · Webhook · PagerDuty"]
    API --> WS["Socket.IO → Web UI"]
```

AlertManager sends webhooks to the API when alerts fire or resolve. The API processes them, stores alert records, sends notifications through configured channels, and emits real-time Socket.IO events to connected browsers.

### 4. Anomaly Detection

```mermaid
flowchart LR
    P["Prometheus"] --> |"4h metric history"| AD["Anomaly Detector"]
    AD --> |"train K-means model"| Redis["Redis cache"]
    AD --> |"score every 10s"| Events["Anomaly Events"]
    Events --> DB[(PostgreSQL)]
```

The anomaly detector fetches 4 hours of historical data from Prometheus, trains K-means clustering models (cached in Redis), and scores current metrics every 10 seconds. When anomalies are detected, events are stored in the database and pushed via Socket.IO.

## Proxy Architecture

Prometheus, Grafana, and AlertManager bind to `127.0.0.1` only — they are not directly accessible from outside the server. They are accessed through Next.js proxy rewrites on port 3000:

| URL Path | Destination |
|----------|-------------|
| `/grafana/*` | `http://localhost:3030/grafana/*` |
| `/prometheus/*` | `http://localhost:9090/*` |
| `/alertmanager/*` | `http://localhost:9093/*` |

A Next.js middleware checks the `nodeprism_session` cookie on these paths, redirecting unauthenticated users to the login page.

In production, the Nginx reverse proxy on port 8443 sits in front of everything, adding rate limiting, security headers, gzip compression, and optional SSL/TLS.

## Ports Reference

| Service | Port | Binding |
|---------|------|---------|
| Web UI | 3000 | Public |
| API + Socket.IO | 4000 | Public |
| Config Sync | 4002 | Internal (no HTTP server) |
| Anomaly Detector | 4003 | Internal (no HTTP server) |
| Agent | 9101 | Public |
| Nginx Reverse Proxy | 8443 | Public |
| PostgreSQL | 5432 | Localhost |
| Redis | 6379 | Public |
| Prometheus | 9090 | 127.0.0.1 |
| Grafana | 3030 | 127.0.0.1 |
| AlertManager | 9093 | 127.0.0.1 |
| Loki | 3100 | Public |
| Pushgateway | 9091 | Public |
