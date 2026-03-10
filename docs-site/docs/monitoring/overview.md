---
sidebar_position: 1
title: Monitoring
description: NodePrism monitoring stack — Prometheus, Grafana, Loki, AlertManager. Supports 13 exporter types for KVM, OpenVZ, Virtuozzo, cPanel, LiteSpeed, Exim, MySQL, PostgreSQL, MongoDB, Nginx, Apache, and Redis.
keywords: [Prometheus monitoring, Grafana dashboards, KVM monitoring, OpenVZ monitoring, Virtuozzo monitoring, cPanel monitoring, LiteSpeed monitoring, Exim monitoring, server metrics]
---

# Monitoring

## Overview

NodePrism uses a Prometheus-based monitoring stack with file-based service discovery. When agents register, the Config Sync service generates target JSON files that Prometheus watches for changes.

| Component | Purpose | Port |
|-----------|---------|------|
| Prometheus | Metrics collection & storage (30d retention) | 9090 (localhost only) |
| Grafana | Visualization & dashboards | 3030 (localhost only) |
| Loki | Log aggregation | 3100 |
| AlertManager | Alert routing & deduplication | 9093 (localhost only) |
| Promtail | Log shipping to Loki | — |
| Pushgateway | Batch job metrics | 9091 |

Prometheus, Grafana, and AlertManager are bound to `127.0.0.1` and accessed through the Next.js proxy on port 3000 with session cookie authentication.

## Agent / Exporter Types

NodePrism supports 13 agent types. Install them on remote servers with the [agent installer script](../agents/overview).

### System Monitoring

| Agent | Default Port | Metrics |
|-------|-------------|---------|
| `NODE_EXPORTER` | 9100 | CPU, memory, disk, network, load average, filesystem |
| `APP_AGENT` | 9101 | Custom application metrics (counters, gauges, histograms) |
| `PROMTAIL` | 9080 | Log shipping (syslog, auth.log, journal) to Loki |

### Database Exporters

| Agent | Default Port | Metrics |
|-------|-------------|---------|
| `MYSQL_EXPORTER` | 9104 | Connections, queries/sec, InnoDB stats, slow queries, replication |
| `POSTGRES_EXPORTER` | 9187 | Connections, query stats, locks, replication lag |
| `MONGODB_EXPORTER` | 9216 | Operations, connections, replication, storage |
| `REDIS_EXPORTER` | 9121 | Memory, keys, commands/sec, connected clients |

### Web Server Exporters

| Agent | Default Port | Metrics |
|-------|-------------|---------|
| `NGINX_EXPORTER` | 9113 | Active connections, requests/sec, response codes |
| `APACHE_EXPORTER` | 9117 | Workers, requests, scoreboard, bytes served |
| `LITESPEED_EXPORTER` | 9122 | Requests/sec, connections, bandwidth, per-vhost stats |

### Hosting & Mail Exporters

| Agent | Default Port | Metrics |
|-------|-------------|---------|
| `CPANEL_EXPORTER` | 9124 | Account counts, domains, bandwidth, disk usage per account |
| `EXIM_EXPORTER` | 9123 | Queue size, frozen messages, deliveries, bounces, rejections per day |

### Virtualization Exporters

| Agent | Default Port | Metrics |
|-------|-------------|---------|
| `LIBVIRT_EXPORTER` | 9177 | Per-VM CPU time, memory, disk I/O, network per KVM/QEMU domain |

## Container / VM Detection

When installed on a virtualization host, the agent automatically detects and reports containers/VMs:

| Platform | Detection | Metrics Source |
|----------|-----------|----------------|
| **KVM / QEMU** | `virsh list` | Libvirt Exporter (per-VM CPU, memory, disk, network) |
| **OpenVZ / VZ7** | `vzlist` | Container collector via `/proc/vz/vestat` + `vznetstat` |
| **Virtuozzo** | `prlctl list` | `prlctl statistics` per container |
| **Docker** | Docker API | Container stats (CPU%, memory, network I/O) |
| **LXC** | `lxc-ls` | Container resource metrics |

A systemd timer-based **container collector** runs every 30 seconds on OpenVZ/VZ7 hosts, computing delta-based CPU%, memory, and network rates from `vznetstat` counters.

## Collected Metrics

### System Metrics (node_exporter)

| Metric | Description |
|--------|-------------|
| `node_cpu_seconds_total` | CPU time spent in each mode |
| `node_memory_MemAvailable_bytes` | Available memory |
| `node_memory_MemTotal_bytes` | Total memory |
| `node_filesystem_avail_bytes` | Available disk space |
| `node_filesystem_size_bytes` | Total disk size |
| `node_load1` / `node_load5` / `node_load15` | Load averages |
| `node_network_receive_bytes_total` | Network bytes received |
| `node_network_transmit_bytes_total` | Network bytes sent |

## Alert Rules

Alert rules are managed through the Web UI and synced to Prometheus via the Config Sync service. Rules support:

- **Dual thresholds** — warning and critical levels with independent durations
- **Hysteresis** — separate trigger and clear thresholds to prevent flapping
- **PromQL queries** — any valid Prometheus query as the alert condition
- **Multiple severities** — CRITICAL, WARNING, INFO, DEBUG

### Default Alert Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| `InstanceDown` | `up == 0` for 5m | Critical |
| `HighCPUUsage` | CPU > 80% for 2m | Warning |
| `HighLoadAverage` | load1 > 10 for 2m | Warning |
| `CriticalLoadAverage` | load1 > 50 for 1m | Critical |
| `HighMemoryUsage` | Memory > 80% for 2m | Warning |
| `LowDiskSpace` | Disk > 80% for 2m | Warning |
| `CriticalDiskSpace` | Disk > 95% for 2m | Critical |

## Prometheus Queries

### CPU Usage
```promql
100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

### Memory Usage
```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

### Disk Usage
```promql
(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100
```

### Network Throughput
```promql
irate(node_network_receive_bytes_total[5m])
irate(node_network_transmit_bytes_total[5m])
```

## Grafana Dashboards

NodePrism ships with 14 pre-built Grafana dashboards:

| Dashboard | What it shows |
|-----------|---------------|
| System Overview | All-server CPU, memory, disk, network summary |
| Server Details | Deep dive into a single server |
| Container Overview | Virtual container stats across platforms |
| API Metrics | NodePrism API performance and request rates |
| MySQL Overview | MySQL-specific queries, InnoDB, replication |
| PostgreSQL Overview | PostgreSQL connections, locks, queries |
| MongoDB Overview | MongoDB operations, connections, storage |
| Nginx Overview | Nginx request rates and connections |
| Apache Overview | Apache workers and request metrics |
| LiteSpeed Overview | LiteSpeed web server performance |
| Exim Overview | Mail server queue and delivery stats |
| cPanel Overview | cPanel account and resource metrics |
| Network Traffic | Bandwidth monitoring across all servers |
| Anomaly Detection | ML anomaly scores and detected events |

Access at `http://<server-ip>:3000/grafana/` (default credentials: admin / admin123).
