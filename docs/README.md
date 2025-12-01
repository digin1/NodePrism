# NodePrism Documentation

> Auto-generated on 2025-12-01

NodePrism is a server monitoring and management platform.

## Quick Links

| Section | Description |
|---------|-------------|
| [Architecture](./architecture/overview.md) | System design and data flow |
| [API Reference](./api/endpoints.md) | REST API endpoints |
| [Database Schema](./database/schema.md) | Data models and relations |
| [Services](./services/README.md) | Background services |
| [Frontend](./frontend/README.md) | Web UI pages |
| [Deployment](./deployment/README.md) | Installation guide |
| [Environment](./deployment/environment.md) | Configuration variables |
| [Monitoring](./monitoring/README.md) | Prometheus & agents |

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env`
3. Start infrastructure: `docker-compose up -d`
4. Install dependencies: `pnpm install`
5. Run migrations: `pnpm prisma migrate deploy`
6. Start development: `pnpm run dev`

## Regenerating Documentation

```bash
pnpm docs:generate
```

Documentation is auto-generated from source code. Run this command after making changes.
