# Database Documentation

> Auto-generated on 2026-03-07

## Overview

NodePrism uses PostgreSQL as its primary database with Prisma as the ORM.

## Quick Links

- [Schema Reference](./schema.md) - All models and fields

## Connection

```
DATABASE_URL=postgresql://user:password@localhost:5432/nodeprism
```

## Migrations

```bash
# Generate migration after schema changes
pnpm prisma migrate dev --name <migration_name>

# Apply migrations in production
pnpm prisma migrate deploy

# Reset database (development only)
pnpm prisma migrate reset
```

## Key Models

| Model | Purpose |
|-------|---------|
| Server | Monitored server instances |
| Agent | Monitoring agents (node_exporter, etc.) |
| Alert | Active and historical alerts |
| MetricHistory | Time-series metric storage |
| EventLog | System events and audit trail |
| User | Authentication and authorization |
