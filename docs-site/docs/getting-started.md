---
sidebar_position: 2
title: Getting Started
description: Install and deploy NodePrism server monitoring platform. One-line installer for Ubuntu/Debian or manual setup with Docker, Node.js, and PM2.
keywords: [install NodePrism, deploy monitoring, server setup, Docker, PM2]
---

# Getting Started

## Prerequisites

- Ubuntu 22.04/24.04 or Debian 12 (recommended)
- 2+ CPU cores, 4GB+ RAM
- Docker Engine + Docker Compose
- Node.js 20+ and pnpm 8+

## Option 1: One-Line Deploy (Recommended)

```bash
curl -sL https://raw.githubusercontent.com/digin1/NodePrism/main/deploy.sh | sudo bash
```

This automatically installs Docker, Node.js 20, pnpm, PM2, clones the repo to `/opt/nodeprism`, configures `.env` (auto-detects server IP, generates JWT secret), starts all Docker containers, builds the app, and starts all services with PM2.

## Option 2: Manual Installation

### 1. Clone and Install

```bash
git clone https://github.com/digin1/NodePrism.git
cd NodePrism
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:
- `SERVER_IP` — your server's public IP address
- `JWT_SECRET` — a random string for token signing (use `openssl rand -hex 32`)

See [Environment Variables](./deployment/environment) for all 60+ options.

### 3. Initialize Prometheus Configs

```bash
bash infrastructure/docker/init-prometheus.sh
```

This creates empty target files and alert rules needed by Prometheus on first run.

### 4. Symlink .env for Docker Compose

```bash
ln -sf "$(pwd)/.env" infrastructure/docker/.env
```

Docker Compose reads `.env` from its own directory, so the symlink ensures it picks up your root config.

### 5. Start Infrastructure

```bash
pnpm docker:up
```

This starts PostgreSQL, Redis, Prometheus, Grafana, Loki, AlertManager, and all exporters.

### 6. Build and Start

```bash
pnpm run build && pnpm run start:pm2
```

## Access

| Service | URL |
|---------|-----|
| Web UI | `http://<server-ip>:3000` |
| Grafana | `http://<server-ip>:3000/grafana/` |
| Prometheus | `http://<server-ip>:3000/prometheus/` |
| AlertManager | `http://<server-ip>:3000/alertmanager/` |

Register your first admin account at the Web UI.

Grafana, Prometheus, and AlertManager are proxied through Next.js on port 3000 with session cookie authentication — they are not directly exposed.

## Adding Monitored Servers

Install the NodePrism agent on any server you want to monitor:

```bash
curl -sL http://<nodeprism-ip>:3000/agent-install.sh | sudo bash
```

The agent automatically:
1. Installs the selected exporter (node_exporter, mysql_exporter, etc.)
2. Configures the firewall (CSF, UFW, firewalld, iptables)
3. Registers with your NodePrism manager API
4. Detects containers/VMs on virtualization hosts (KVM, OpenVZ, Virtuozzo)

See [Agent Scripts](./agents/overview) for all 13 supported agent types and detailed setup options.

## PM2 Management

```bash
pnpm run status:pm2     # Check service status
pnpm run logs:pm2       # Tail all logs
pnpm run stop:pm2       # Stop all services
pnpm run restart:pm2    # Restart all services
```

## Development Mode

For development with hot reload (not for production):

```bash
pnpm run dev
```

## Troubleshooting

### Ports in Use

```bash
lsof -ti:3000,4000,4002,4003,9101 | xargs kill -9 2>/dev/null
```

### Check Database

```bash
docker exec -it nodeprism-postgres psql -U nodeprism -d nodeprism
```

### Check Prometheus Targets

```bash
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {scrapeUrl, health}'
```
