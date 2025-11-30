# Veeble Node Vitals

Advanced monitoring system for 50+ servers with automated deployment and comprehensive metrics.

## Features

- **Comprehensive Monitoring**: System metrics, application metrics, logs, and database monitoring
- **Automated Deployment**: One-click SSH-based agent deployment to remote servers
- **Real-time Dashboards**: Beautiful Next.js UI with live metrics and alerts
- **Advanced Alerting**: Multi-channel notifications (Email, Slack, PagerDuty, Webhooks)
- **Log Aggregation**: Centralized log storage and querying with Loki
- **100% Open Source**: All components use permissive open source licenses

## Architecture

### Manager Node (Docker-based)
- Prometheus, Grafana, Loki, AlertManager
- PostgreSQL, Redis, RabbitMQ, OpenBao
- API Gateway (Express + Socket.IO)
- Next.js Management UI

### Monitored Nodes (Lightweight agents)
- Node Exporter (system metrics)
- Custom application agent
- Database exporters (MySQL, PostgreSQL, MongoDB)
- Web server exporters (Nginx, Apache)
- Promtail (log shipping)

## Quick Start

### Prerequisites
- Docker Desktop or Docker Engine + Docker Compose
- Node.js 20+ and PNPM 8+
- 16GB RAM minimum for local development

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/digin1/veeble-node-vitals.git
cd veeble-node-vitals
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Start Docker services**
```bash
pnpm docker:up
```

4. **Start development servers**
```bash
pnpm dev
```

5. **Access the applications**
- Next.js UI: http://localhost:3000
- API Gateway: http://localhost:4000
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090

## Project Structure

```
veeble-node-vitals/
├── packages/
│   ├── web/                    # Next.js Management UI
│   ├── api/                    # API Gateway (Express)
│   ├── deployment-worker/      # Agent deployment service
│   ├── config-sync/            # Configuration sync worker
│   ├── agent-app/              # Custom application agent
│   └── shared/                 # Shared TypeScript types
│
├── infrastructure/
│   └── docker/                 # Docker Compose configs
│       ├── prometheus/
│       ├── grafana/
│       ├── loki/
│       └── alertmanager/
│
├── agents/                     # Pre-built agent binaries
├── scripts/                    # Utility scripts
└── config/                     # Configuration templates
```

## Technology Stack

All tools are 100% free and open source:

- **Monitoring**: Prometheus, Grafana, Loki, AlertManager
- **Storage**: PostgreSQL, Redis
- **Infrastructure**: RabbitMQ, OpenBao
- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Next.js 14, shadcn/ui, Tailwind CSS
- **Development**: Turborepo, PNPM, TypeScript

## Development

```bash
# Install dependencies
pnpm install

# Start all dev servers
pnpm dev

# Build all packages
pnpm build

# Run linting
pnpm lint

# Run tests
pnpm test

# Format code
pnpm format
```

## Docker Commands

```bash
# Start all services
pnpm docker:up

# Stop all services
pnpm docker:down

# View logs
pnpm docker:logs

# Restart specific service
docker-compose -f infrastructure/docker/docker-compose.yml restart prometheus
```

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions, please use the GitHub issue tracker.
