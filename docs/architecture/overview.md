# Architecture Overview

> Auto-generated on 2025-12-02

## System Architecture

```mermaid
flowchart TB
    subgraph Manager["NodePrism Manager"]
        Web["Next.js Web UI
:3000"]
        API["Express API
:4000"]
        Workers["Workers
(RabbitMQ)"]
        DB[(PostgreSQL)]

        subgraph Monitoring["Monitoring Stack"]
            Prometheus["Prometheus
:9090"]
            Grafana["Grafana
:3030"]
            Loki["Loki
:3100"]
            AlertMgr["AlertManager
:9093"]
        end
    end

    subgraph Servers["Monitored Servers"]
        S1["Server 1
node_exporter :9100"]
        S2["Server 2
node_exporter :9100"]
        SN["Server N
node_exporter :9100"]
    end

    Web --> API
    API --> Workers
    API --> DB
    API --> Prometheus

    Prometheus --> S1
    Prometheus --> S2
    Prometheus --> SN
    Prometheus --> AlertMgr
    AlertMgr --> API
```

## Package Structure

| Package | Port | Purpose |
|---------|------|---------|
| `@nodeprism/web` | 3000 | Next.js management UI |
| `@nodeprism/api` | 4000 | Express REST API + WebSocket |
| `@nodeprism/deployment-worker` | - | SSH agent deployment |
| `@nodeprism/config-sync` | - | Configuration synchronization |
| `@nodeprism/anomaly-detector` | - | ML anomaly detection |
| `@nodeprism/agent-app` | 9101 | Custom app monitoring agent |
| `@nodeprism/shared` | - | Shared types and utilities |

## Data Flow

### 1. Metrics Collection

```mermaid
flowchart LR
    NE[node_exporter] --> P[Prometheus]
    P --> MC[MetricCollector]
    MC --> DB[(PostgreSQL)]
    MC --> WS[Socket.IO]
    WS --> UI[Web UI]
    P --> G[Grafana]
```

### 2. Agent Registration

```mermaid
flowchart LR
    RS[Remote Server] --> |POST /api/agents/register| API[API]
    API --> DB[(Database)]
    DB --> TG[TargetGenerator]
    TG --> TJ[targets.json]
    TJ --> P[Prometheus]
```

### 3. Alert Processing

```mermaid
flowchart LR
    P[Prometheus] --> AM[AlertManager]
    AM --> |Webhook| API[API]
    API --> DB[(Database)]
    API --> WS[Socket.IO]
    WS --> UI[Web UI]
```

## Technology Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.3+ |
| Runtime | Node.js 20+ |
| Package Manager | PNPM 8+ |
| Build | Turborepo |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Queue | RabbitMQ 3.13 |
| Monitoring | Prometheus, Grafana, Loki |

## Ports Reference

| Service | Port |
|---------|------|
| Web UI | 3000 |
| API | 4000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RabbitMQ | 5672 |
| RabbitMQ Management | 15672 |
| Prometheus | 9090 |
| Grafana | 3030 |
| Loki | 3100 |
| AlertManager | 9093 |
| Node Exporter | 9100 |
