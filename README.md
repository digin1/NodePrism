<p align="center">
  <img src="packages/web/public/favicon.svg" alt="NodePrism" width="80" height="80">
</p>

<h1 align="center">NodePrism</h1>

<p align="center">
  <strong>Open-source infrastructure monitoring platform for servers, containers, and services</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#documentation">Docs</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange.svg" alt="pnpm">
  <img src="https://img.shields.io/badge/typescript-5.x-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/tests-725%20passing-brightgreen.svg" alt="Tests">
</p>

---

## Features

### Monitoring & Metrics
- **Real-time System Monitoring** — CPU, memory, disk, network, and load average with live WebSocket updates
- **Multi-platform Containers** — OpenVZ, KVM/libvirt, Virtuozzo, Docker, and LXC container management with storage pool and network traffic tracking
- **LVM/Disk Monitoring** — Volume group tracking, partition free space, and disk pressure handling
- **Uptime Monitoring** — HTTP/HTTPS, TCP, ICMP (ping), and DNS checks with response time tracking and keyword matching
- **Log Aggregation** — Centralized log storage and querying via Loki + Promtail

### Alerting & Notifications
- **Intelligent Alerting** — PromQL-based alert rules with dual thresholds (warning + critical), hysteresis, and multi-stage evaluation
- **6 Notification Channels** — Slack (with interactive buttons), Telegram, Email (SMTP), Discord, Webhooks, and PagerDuty
- **Slack Interactions** — Acknowledge, silence, or create incidents directly from Slack notification buttons
- **Alert Reconciliation** — Auto-resolves stale alerts missed by AlertManager
- **Maintenance Windows** — Suppress alerts during scheduled maintenance

### Intelligence
- **Anomaly Detection** — ML-based scoring using K-means clustering with automatic model retraining and configurable sensitivity per server
- **Forecasting** — Linear regression-based disk and resource usage trend prediction with 30-day projections
- **Daily Infrastructure Reports** — Automated Slack/Telegram summaries with VM counts, stopped containers, disk usage, and mail server stats

### Operations
- **Incident Management** — Create, track, and resolve incidents with status workflow (Investigating → Identified → Monitoring → Resolved) and timeline updates
- **Custom Dashboards** — Build and share dashboards with PromQL-powered panels
- **14 Pre-built Grafana Dashboards** — System overview, API metrics, containers, server details, MySQL, PostgreSQL, MongoDB, Nginx, Apache, LiteSpeed, Exim, cPanel, network traffic, and anomaly detection
- **Audit Logging** — Tracks all admin actions (server changes, alert rules, user roles, incident updates)
- **Automated Housekeeping** — Configurable retention policies with disk pressure-aware cleanup and PostgreSQL VACUUM
- **Database Backups** — Automated pg_dump with gzip compression, configurable schedule and retention

### Security
- **JWT Authentication** — Role-based access control (Admin/User) with configurable token expiry
- **Reverse Proxy** — Nginx with rate limiting, security headers (X-Frame-Options, CSP, XSS protection), and gzip compression
- **SSL/TLS Ready** — Let's Encrypt ACME support with certificate configuration
- **Slack Signature Verification** — HMAC-SHA256 request validation for webhook security

## Quick Start

### Prerequisites

- Ubuntu/Debian Linux (tested on Ubuntu 22.04/24.04, Debian 12)
- 2+ CPU cores, 4GB+ RAM recommended

### One-Line Deploy

```bash
curl -sL https://raw.githubusercontent.com/digin1/NodePrism/main/deploy.sh | sudo bash
```

This installs Docker, Node.js 20, pnpm, PM2, clones the repo, configures `.env` (auto-detects server IP, generates JWT secret), starts all infrastructure containers, builds and launches the app with PM2.

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/digin1/NodePrism.git
cd NodePrism

# Copy env file and configure
cp .env.example .env
# Edit .env — set SERVER_IP to your server's public IP

# Initialize Prometheus config files
bash infrastructure/docker/init-prometheus.sh

# Symlink .env for Docker Compose
ln -sf "$(pwd)/.env" infrastructure/docker/.env

# Install dependencies
pnpm install

# Start infrastructure services (PostgreSQL, Redis, Prometheus, etc.)
pnpm docker:up

# Build and start the application with PM2
pnpm run build && pnpm run start:pm2
```

### Access

| Service | URL | Credentials |
|---------|-----|-------------|
| Web UI | `http://<server-ip>:3000` | Register on first visit |
| Grafana | `http://<server-ip>:3000/grafana/` | admin / admin |
| Prometheus | `http://<server-ip>:3000/prometheus/` | — |
| AlertManager | `http://<server-ip>:3000/alertmanager/` | — |
| API | `http://<server-ip>:4000` | — |
| Documentation | [Online docs](https://digin1.github.io/NodePrism/) | — |

Grafana, Prometheus, and AlertManager are proxied through the Web UI on port 3000 — session-authenticated and accessible from a single origin.

### Adding Remote Servers

Install the NodePrism agent on any server you want to monitor:

```bash
curl -sL http://<nodeprism-ip>:3000/agent-install.sh | sudo bash
```

The agent auto-registers with the manager and begins shipping metrics, container stats, and logs.

**Supported agent/exporter types:**

| Agent | Port | What it monitors |
|-------|------|------------------|
| Node Exporter | 9100 | CPU, memory, disk, network, load |
| App Agent | 9101 | Custom application metrics |
| MySQL Exporter | 9104 | MySQL/MariaDB databases |
| Nginx Exporter | 9113 | Nginx web server |
| Apache Exporter | 9117 | Apache web server |
| PostgreSQL Exporter | 9187 | PostgreSQL databases |
| MongoDB Exporter | 9216 | MongoDB databases |
| Redis Exporter | — | Redis instances |
| Libvirt Exporter | — | KVM/libvirt virtual machines |
| LiteSpeed Exporter | — | LiteSpeed web server |
| Exim Exporter | — | Exim mail server |
| cPanel Exporter | — | cPanel/WHM hosting panels |
| Promtail | 9080 | Log shipping to Loki |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Manager Node                            │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌─────────┐ │
│  │ Next.js  │  │ Express  │  │  Config     │  │Anomaly  │ │
│  │ Web UI   │  │ API +    │  │  Sync       │  │Detector │ │
│  │ :3000    │  │ Socket.IO│  │  :4002      │  │ :4003   │ │
│  │          │  │ :4000    │  │             │  │         │ │
│  └──────────┘  └────┬─────┘  └─────────────┘  └─────────┘ │
│                     │                                       │
│  ┌──────────────────┼──────────────────────────────────┐   │
│  │           Docker Infrastructure                      │   │
│  │  Prometheus · Grafana · Loki · AlertManager          │   │
│  │  PostgreSQL · Redis · Pushgateway                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Server 1 │ │ Server 2 │ │ Server N │
        │          │ │          │ │          │
        │ Agent    │ │ Agent    │ │ Agent    │
        │ :9101    │ │ :9101    │ │ :9101    │
        │          │ │          │ │          │
        │ Node     │ │ Node     │ │ Node     │
        │ Exporter │ │ Exporter │ │ Exporter │
        │ :9100    │ │ :9100    │ │ :9100    │
        └──────────┘ └──────────┘ └──────────┘
```

### Services

| Service | Role |
|---------|------|
| **Web UI** (Next.js :3000) | Dashboard, management interface, reverse proxy for tools |
| **API** (Express :4000) | REST API, Socket.IO gateway, webhook handlers |
| **Config Sync** (:4002) | Syncs server/agent config to Prometheus targets |
| **Anomaly Detector** (:4003) | ML pipeline — trains models and scores metrics |
| **Agent** (:9101) | Runs on remote servers, collects and ships metrics |

## Project Structure

```
NodePrism/
├── packages/
│   ├── web/                  # Next.js 14 — Management UI
│   ├── api/                  # Express — REST API + Socket.IO + Prisma
│   ├── config-sync/          # Prometheus target & status sync worker
│   ├── anomaly-detector/     # K-means clustering anomaly detection
│   ├── agent-app/            # Remote server monitoring agent
│   └── shared/               # Shared TypeScript types & Zod schemas
│
├── infrastructure/
│   └── docker/               # Docker Compose + service configs
│       ├── prometheus/       # Prometheus config, alert rules, targets
│       ├── grafana/          # Datasources + 14 pre-built dashboards
│       ├── alertmanager/     # Alert routing config
│       ├── loki/             # Log aggregation config
│       └── nginx/            # Reverse proxy with rate limiting & security
│
├── docs-site/                # Docusaurus documentation site
├── scripts/                  # Setup, cert generation, agent download scripts
├── deploy.sh                 # One-line deployment script
└── ecosystem.config.js       # PM2 production process config
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 14, React 18, TanStack Query, Tailwind CSS, Recharts, Socket.IO Client |
| **Backend** | Node.js, Express, Socket.IO, Prisma ORM, Zod |
| **Database** | PostgreSQL 15, Redis 7 |
| **Monitoring** | Prometheus, Grafana, Loki, AlertManager, Pushgateway |
| **ML** | simple-statistics, ml-kmeans (anomaly detection & forecasting) |
| **Infrastructure** | Docker Compose, PM2, Nginx, Turborepo, pnpm workspaces |
| **Language** | TypeScript (strict mode) |

## Production (PM2)

NodePrism runs 5 services managed by PM2 with auto-restart, memory limits, and systemd boot persistence:

| Service | Memory Limit | Purpose |
|---------|-------------|---------|
| nodeprism-api | 500 MB | REST API + WebSocket gateway |
| nodeprism-web | 500 MB | Next.js frontend |
| nodeprism-config-sync | 300 MB | Prometheus target sync |
| nodeprism-anomaly-detector | 768 MB | ML anomaly pipeline |
| nodeprism-agent | 200 MB | Local agent (manager node) |

```bash
pnpm run build && pnpm run start:pm2   # Build and start all services
pnpm run status:pm2                     # Check service status
pnpm run logs:pm2                       # Tail all logs
pnpm run stop:pm2                       # Stop all services
pnpm run restart:pm2                    # Restart all services
```

## Configuration

Copy `.env.example` to `.env` and configure. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_IP` | — | Your server's public IP (required) |
| `JWT_SECRET` | — | Random string for token signing (required) |
| `DB_PASSWORD` | `nodeprism123` | PostgreSQL password |
| `GRAFANA_PASSWORD` | `admin123` | Grafana admin password |
| `DAILY_REPORT_TIME` | `08:00` | When to send daily reports |
| `BACKUP_SCHEDULE_HOURS` | `24` | Database backup interval |
| `BACKUP_RETENTION_COUNT` | `7` | Number of backups to keep |

See [`.env.example`](.env.example) for all 60+ configuration options.

## Development

```bash
# Development mode (hot reload)
pnpm run dev

# Run tests (725 tests across 36 suites)
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint all packages
pnpm lint

# Format code
pnpm format
```

### Docker Commands

```bash
pnpm docker:up      # Start all infrastructure services
pnpm docker:down    # Stop all services
pnpm docker:logs    # View logs
```

## Documentation

Full documentation is available online and locally:

- **Online**: [https://digin1.github.io/NodePrism/](https://digin1.github.io/NodePrism/)
- **Local**: `http://localhost:3080` when running the docs container

Topics covered: architecture, API reference, database schema, deployment, monitoring & alerting setup, and agent configuration.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
