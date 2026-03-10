---
sidebar_position: 1
title: Deployment Guide
description: Deploy NodePrism in production with Docker, PM2, and Nginx reverse proxy. One-line installer or manual setup for Ubuntu/Debian servers.
keywords: [deploy NodePrism, production setup, PM2, Docker Compose, Nginx reverse proxy, SSL]
---

# Deployment Guide

## Quick Start

### One-Line Deploy (Recommended)

```bash
curl -sL https://raw.githubusercontent.com/digin1/NodePrism/main/deploy.sh | sudo bash
```

This script handles everything:
1. Installs Docker Engine and Docker Compose
2. Installs Node.js 20 and pnpm 8
3. Installs PM2 globally
4. Creates a `nodeprism` system user
5. Clones the repo to `/opt/nodeprism`
6. Auto-detects server IP and generates JWT secret
7. Initializes Prometheus config files
8. Starts all Docker infrastructure containers
9. Builds the application
10. Pushes database schema via Prisma
11. Starts all 5 services with PM2
12. Enables PM2 startup on boot via systemd

### Manual Deployment

#### Prerequisites

- Ubuntu 22.04/24.04 or Debian 12
- Docker Engine + Docker Compose
- Node.js 20+ and pnpm 8+
- PM2 (`npm install -g pm2`)

#### Steps

```bash
# 1. Clone
git clone https://github.com/digin1/NodePrism.git
cd NodePrism

# 2. Configure environment
cp .env.example .env
# Edit .env — set SERVER_IP and JWT_SECRET at minimum

# 3. Initialize Prometheus configs
bash infrastructure/docker/init-prometheus.sh

# 4. Symlink .env for Docker Compose
ln -sf "$(pwd)/.env" infrastructure/docker/.env

# 5. Install dependencies
pnpm install

# 6. Start Docker infrastructure
pnpm docker:up

# 7. Build and start with PM2
pnpm run build && pnpm run start:pm2

# 8. Enable boot startup
pm2 startup systemd
pm2 save
```

## PM2 Services

NodePrism runs 5 services managed by PM2:

| Service | Memory Limit | Purpose |
|---------|-------------|---------|
| nodeprism-api | 500 MB | REST API + Socket.IO gateway |
| nodeprism-web | 500 MB | Next.js frontend + tool proxy |
| nodeprism-config-sync | 300 MB | Prometheus target sync |
| nodeprism-anomaly-detector | 768 MB | ML anomaly pipeline |
| nodeprism-agent | 200 MB | Local agent (manager node) |

```bash
pnpm run status:pm2     # Check status
pnpm run logs:pm2       # Tail logs
pnpm run restart:pm2    # Restart all
pnpm run stop:pm2       # Stop all
```

## Adding Monitored Servers

Install the NodePrism agent on each server you want to monitor:

```bash
curl -sL http://<nodeprism-ip>:3000/agent-install.sh | sudo bash
```

This automatically:
- Installs the selected exporter (node_exporter, mysql_exporter, libvirt_exporter, etc.)
- Configures the firewall (CSF, UFW, firewalld, iptables)
- Registers with your NodePrism manager
- Detects containers/VMs on virtualization hosts (KVM, OpenVZ, Virtuozzo)

See [Agent Scripts](../agents/overview) for all 13 supported agent types.

## SSL / TLS

The Nginx reverse proxy is SSL-ready. To enable:

1. Obtain certificates (Let's Encrypt or commercial)
2. Uncomment the SSL lines in `infrastructure/docker/docker-compose.yml`:
   ```yaml
   ports:
     - '443:443'
   volumes:
     - ./certs:/etc/nginx/certs:ro
     - ./certbot:/var/www/certbot:ro
   ```
3. Update `infrastructure/docker/nginx/nginx.conf` with SSL config
4. Restart: `docker compose -f infrastructure/docker/docker-compose.yml restart reverse-proxy`

## Firewall Configuration

Ensure these ports are open on the manager node:

| Port | Service | Required |
|------|---------|----------|
| 3000 | Web UI + proxied tools | Yes |
| 4000 | API (for agent registration) | Yes |
| 8443 | Nginx reverse proxy | Optional (production) |
| 3100 | Loki (for remote Promtail) | If using remote log shipping |

## Troubleshooting

### Kill Stuck Processes

```bash
lsof -ti:3000,4000,4002,4003,9101 2>/dev/null | xargs kill -9 2>/dev/null
```

### Check Database

```bash
docker exec -it nodeprism-postgres psql -U nodeprism -d nodeprism
```

### Check Prometheus Targets

```bash
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {scrapeUrl, health}'
```

### View PM2 Logs

```bash
pm2 logs nodeprism-api --lines 50
pm2 logs nodeprism-web --lines 50
```
