---
sidebar_position: 2
title: Getting Started
---

# Getting Started

## Prerequisites

- Node.js 20+
- PNPM 8+
- Docker & Docker Compose
- PostgreSQL 15 (or use Docker)

## 1. Clone and Install

```bash
git clone https://github.com/digin1/NodePrism.git
cd NodePrism
pnpm install
```

## 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

See [Environment Variables](./deployment/environment) for all options.

## 3. Start Infrastructure

```bash
cd infrastructure/docker
docker-compose up -d
```

## 4. Initialize Database

```bash
pnpm prisma migrate deploy
pnpm prisma db seed
```

## 5. Start Development

```bash
pnpm run dev
```

This starts:
- **Web UI** at `http://localhost:3000`
- **API Server** at `http://localhost:4000`
- **Config Sync** service
- **Anomaly Detector** service

## Production Deployment

### Build

```bash
pnpm run build
```

### Start

```bash
pnpm run start
```

### Docker Deployment

```bash
docker-compose -f infrastructure/docker/docker-compose.prod.yml up -d
```
