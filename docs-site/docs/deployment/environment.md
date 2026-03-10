---
sidebar_position: 2
title: Environment Variables
---

# Environment Variables


## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

---

## General

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | - |
| `LOG_LEVEL` | `info` | - |

## Server IP

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_IP` | `your-server-ip` | Your server's public IP address |

## API Server

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `4000` | - |
| `API_HOST` | `0.0.0.0` | - |

## Web UI

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3000` | - |
| `NEXT_PUBLIC_API_URL` | `-` | Leave empty to use Next.js proxy (recommended for dev) |

## Database (PostgreSQL)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `postgres` | - |
| `DB_PORT` | `5432` | - |
| `DB_NAME` | `nodeprism` | - |
| `DB_USER` | `nodeprism` | - |
| `DB_PASSWORD` | `nodeprism123` | - |

## MySQL (Sample DB for Monitoring)

| Variable | Default | Description |
|----------|---------|-------------|
| `MYSQL_HOST` | `mysql` | - |
| `MYSQL_PORT` | `3306` | - |
| `MYSQL_ROOT_PASSWORD` | `password` | - |
| `MYSQL_DATABASE` | `nodeprism` | - |
| `MYSQL_USER` | `nodeprism` | - |
| `MYSQL_PASSWORD` | `nodeprism123` | - |

## MongoDB (Sample DB for Monitoring)

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_HOST` | `mongodb` | - |
| `MONGODB_PORT` | `27017` | - |
| `MONGODB_ROOT_USERNAME` | `root` | - |
| `MONGODB_ROOT_PASSWORD` | `password` | - |
| `MONGODB_DATABASE` | `admin` | - |

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `redis` | - |
| `REDIS_PORT` | `6379` | - |
| `REDIS_PASSWORD` | `-` | - |

## Prometheus

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMETHEUS_HOST` | `prometheus` | - |
| `PROMETHEUS_PORT` | `9090` | - |

## Loki

| Variable | Default | Description |
|----------|---------|-------------|
| `LOKI_HOST` | `loki` | - |
| `LOKI_PORT` | `3100` | - |

## Grafana

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_HOST` | `grafana` | - |
| `GRAFANA_PORT` | `3030` | - |
| `GRAFANA_USER` | `admin` | - |
| `GRAFANA_PASSWORD` | `admin123` | - |

## AlertManager

| Variable | Default | Description |
|----------|---------|-------------|
| `ALERTMANAGER_HOST` | `alertmanager` | - |
| `ALERTMANAGER_PORT` | `9093` | - |

## Authentication (JWT)

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `change-this-to-a-secure-random...` | - |
| `JWT_EXPIRES_IN` | `7d` | - |

## CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed origins |

## Status Sync

| Variable | Default | Description |
|----------|---------|-------------|
| `STATUS_SYNC_INTERVAL` | `30000` | How often to sync server status from Prometheus (ms) |

## Public URLs (for Web UI external links)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_GRAFANA_URL` | `/grafana/` | Relative paths - proxied through Next.js (recommended) |
| `NEXT_PUBLIC_PROMETHEUS_URL` | `/prometheus/` | - |
| `NEXT_PUBLIC_ALERTMANAGER_URL` | `/alertmanager/` | - |
| `NEXT_PUBLIC_DOCS_URL` | `http://localhost:3080` | - |

## App URL

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_URL` | `http://your-server-ip:3000` | Full URL where the app is accessible (used for cookies, links) |

## Daily Report

| Variable | Default | Description |
|----------|---------|-------------|
| `DAILY_REPORT_TIME` | `08:00` | - |

