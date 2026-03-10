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
  <a href="#screenshots">Screenshots</a> •
  <a href="#documentation">Docs</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange.svg" alt="pnpm">
  <img src="https://img.shields.io/badge/typescript-5.x-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/tests-725%20passing-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/docker-20%20containers-blue.svg" alt="Docker">
</p>

---

## Features

- **Real-time Monitoring** — System metrics, container stats, disk/LVM usage, and network bandwidth with live WebSocket updates
- **Multi-platform Containers** — OpenVZ, KVM/libvirt, Virtuozzo, Docker, and LXC container management and monitoring
- **Intelligent Alerting** — Multi-channel notifications (Slack, Telegram, Email, Webhooks) with acknowledge/silence actions directly from Slack
- **Anomaly Detection** — ML-based anomaly scoring with configurable sensitivity per server
- **Daily Infrastructure Reports** — Automated reports to Slack/Telegram with VM counts, stopped containers, disk usage, and exim stats
- **Log Aggregation** — Centralized log storage and querying via Loki + Promtail
- **Custom Dashboards** — Build and share dashboards with PromQL-powered panels
- **Uptime Monitoring** — HTTP/HTTPS/TCP/ICMP checks with response time tracking
- **Incident Management** — Create, track, and resolve incidents with timeline updates
- **Forecasting** — Disk and resource usage trend prediction
- **100% Open Source** — All components use permissive open-source licenses

## Quick Start

### Prerequisites

- Docker Engine + Docker Compose
- Node.js 20+ and pnpm 8+
- PostgreSQL 15+ (runs in Docker)

### One-Line Deploy (Ubuntu/Debian)

```bash
curl -sL https://raw.githubusercontent.com/digin1/NodePrism/main/deploy.sh | sudo bash
```

This installs all dependencies (Docker, Node.js 20, pnpm, PM2), clones the repo, starts infrastructure containers, builds and launches the app.

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

### Adding Remote Servers (Agent)

Install the NodePrism agent on any server you want to monitor:

```bash
curl -sL http://<nodeprism-ip>:3000/agent-install.sh | sudo bash
```

The agent collects system metrics, container stats, and log data, and ships them to the manager node.

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

## Project Structure

```
NodePrism/
├── packages/
│   ├── web/                  # Next.js 14 Management UI
│   ├── api/                  # Express API + Socket.IO Gateway
│   ├── config-sync/          # Prometheus target sync worker
│   ├── anomaly-detector/     # ML anomaly detection service
│   ├── agent-app/            # Remote server agent
│   └── shared/               # Shared TypeScript types
│
├── infrastructure/
│   └── docker/               # Docker Compose + configs
│       ├── prometheus/       # Prometheus rules, targets, config
│       ├── grafana/          # Dashboards & datasources
│       ├── alertmanager/     # Alert routing config
│       └── loki/             # Log aggregation config
│
├── docs-site/                # Docusaurus documentation site
├── docs/                     # Doc generation scripts
└── scripts/                  # Utility & testing scripts
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 14, React 18, TanStack Query, Tailwind CSS, Recharts |
| **Backend** | Node.js, Express, Socket.IO, Prisma ORM |
| **Database** | PostgreSQL, Redis |
| **Monitoring** | Prometheus, Grafana, Loki, AlertManager |
| **Infrastructure** | Docker Compose, Turborepo, pnpm workspaces |
| **Language** | TypeScript (strict mode) |

## Production (PM2)

```bash
pnpm run build && pnpm run start:pm2   # Build and start all services
pnpm run status:pm2                     # Check service status
pnpm run logs:pm2                       # Tail all logs
pnpm run stop:pm2                       # Stop all services
pnpm run restart:pm2                    # Restart all services
```

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

Topics covered:

- Architecture overview
- API reference & endpoints
- Database schema
- Deployment guide
- Monitoring & alerting setup
- Agent configuration

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
