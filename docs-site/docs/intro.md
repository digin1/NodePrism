---
slug: /
sidebar_position: 1
title: Introduction
description: NodePrism is an open-source server monitoring platform for KVM, OpenVZ, Virtuozzo, Docker, LXC containers, and cPanel/WHM hosting panels. Built with Prometheus, Grafana, and intelligent alerting.
keywords: [server monitoring, KVM monitoring, OpenVZ monitoring, Virtuozzo monitoring, cPanel monitoring, Docker monitoring, LXC monitoring, Prometheus, Grafana, open source, self-hosted]
---

# NodePrism Documentation

**NodePrism** is an open-source infrastructure monitoring platform built with TypeScript. It provides real-time monitoring for servers, virtual containers (KVM, OpenVZ, Virtuozzo, Docker, LXC), hosting panels (cPanel/WHM), web servers (Nginx, Apache, LiteSpeed), mail servers (Exim), and databases (MySQL, PostgreSQL, MongoDB).

## Why NodePrism?

- **Multi-platform container monitoring** — Monitor KVM/libvirt VMs, OpenVZ containers, Virtuozzo VPS, Docker containers, and LXC simultaneously from a single dashboard
- **Hosting panel support** — Built-in cPanel/WHM monitoring with account counts, bandwidth, and disk usage tracking
- **Intelligent alerting** — PromQL-based alert rules with dual thresholds, 6 notification channels (Slack, Telegram, Email, Discord, Webhooks, PagerDuty), and interactive Slack buttons
- **ML anomaly detection** — K-means clustering detects unusual metric patterns automatically
- **Self-hosted & open source** — Full control over your monitoring data, no SaaS dependency
- **One-line deploy** — `curl | bash` installer sets up everything on Ubuntu/Debian

## Supported Platforms

| Platform | Monitoring Capabilities |
|----------|------------------------|
| **KVM / libvirt** | Per-VM CPU, memory, disk I/O, network via libvirt exporter |
| **OpenVZ / VZ7** | Per-container CPU%, memory, network rates via vzlist/vestat |
| **Virtuozzo** | Per-VPS stats via prlctl |
| **Docker** | Container stats, lifecycle, resource usage |
| **LXC** | Container metrics and management |
| **cPanel / WHM** | Account counts, domains, bandwidth, disk usage |
| **LiteSpeed** | Requests/sec, connections, bandwidth, per-vhost stats |
| **Exim** | Queue size, frozen messages, deliveries, bounces |
| **MySQL / MariaDB** | Connections, queries/sec, InnoDB stats, replication |
| **PostgreSQL** | Connections, query stats, locks, replication lag |
| **MongoDB** | Operations, connections, replication status |
| **Nginx** | Active connections, requests/sec, response codes |
| **Apache** | Workers, requests, scoreboard, bytes served |
| **Redis** | Memory, keys, commands/sec |

## Quick Links

| Section | Description |
|---------|-------------|
| [Getting Started](./getting-started) | Installation and first-run setup |
| [Architecture](./architecture/overview) | System design and data flow |
| [API Reference](./api/endpoints) | REST API endpoints |
| [Database Schema](./database/schema) | Data models and relations |
| [Services](./services/overview) | Background services (config-sync, anomaly detector) |
| [Frontend](./frontend/overview) | Web UI pages and components |
| [Deployment](./deployment/guide) | Production deployment guide |
| [Environment](./deployment/environment) | Configuration variables |
| [Monitoring](./monitoring/overview) | Prometheus stack and exporters |
| [Agent Scripts](./agents/overview) | Install scripts for monitored nodes |

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.3+ |
| Runtime | Node.js 20+ |
| Package Manager | pnpm 8+ |
| Build | Turborepo |
| Database | PostgreSQL 15, Redis 7 |
| Monitoring | Prometheus, Grafana, Loki, AlertManager |
| Frontend | Next.js 14, React 18, Tailwind CSS, Recharts |
| Backend | Express.js, Socket.IO, Prisma ORM |
| ML | simple-statistics, ml-kmeans |
| Process Manager | PM2 |
