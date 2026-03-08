---
sidebar_position: 1
title: Monitoring
---

# Monitoring


## Overview

NodePrism uses a Prometheus-based monitoring stack:

| Component | Purpose | Port |
|-----------|---------|------|
| Prometheus | Metrics collection & storage | 9090 |
| Grafana | Visualization & dashboards | 3030 |
| Loki | Log aggregation | 3100 |
| AlertManager | Alert routing | 9093 |

## Agent Types

| Agent | Port | Metrics |
|-------|------|---------|
| `NODE_EXPORTER` | 9100 | CPU, memory, disk, network, load average |
| `MYSQL_EXPORTER` | 9104 | MySQL/MariaDB connections, queries/sec, InnoDB stats |
| `POSTGRES_EXPORTER` | 9187 | PostgreSQL connections, query stats, replication lag |
| `MONGODB_EXPORTER` | 9216 | MongoDB operations, connections, replication |
| `NGINX_EXPORTER` | 9113 | Nginx active connections, requests/sec |
| `REDIS_EXPORTER` | 9121 | Redis memory, keys, commands/sec |
| `LIBVIRT_EXPORTER` | 9177 | KVM/QEMU per-VM CPU, memory, disk I/O, network |
| `LITESPEED_EXPORTER` | 9122 | LiteSpeed requests/sec, connections, bandwidth |
| `EXIM_EXPORTER` | 9123 | Exim mail queue, deliveries, bounces |
| `CPANEL_EXPORTER` | 9124 | cPanel accounts, domains, bandwidth, disk |
| `APACHE_EXPORTER` | 9117 | Apache metrics |
| `PROMTAIL` | 9080 | Log shipping to Loki |
| `APP_AGENT` | 9101 | Custom application metrics |

## Collected Metrics

### System Metrics (node_exporter)

| Metric | Description |
|--------|-------------|
| `node_cpu_seconds_total` | CPU time spent in each mode |
| `node_memory_MemAvailable_bytes` | Available memory |
| `node_memory_MemTotal_bytes` | Total memory |
| `node_filesystem_avail_bytes` | Available disk space |
| `node_filesystem_size_bytes` | Total disk size |
| `node_load1` | 1-minute load average |
| `node_load5` | 5-minute load average |
| `node_load15` | 15-minute load average |
| `node_network_receive_bytes_total` | Network bytes received |
| `node_network_transmit_bytes_total` | Network bytes sent |

## Alert Rules

Default alert rules in `infrastructure/docker/prometheus/alerts.yml`:

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
sum(irate(node_network_receive_bytes_total{device=~"eth.*|ens.*|enp.*|eno.*|venet.*|bond.*"}[5m]))
sum(irate(node_network_transmit_bytes_total{device=~"eth.*|ens.*|enp.*|eno.*|venet.*|bond.*"}[5m]))
```

:::note
The device filter includes `eno.*` (common on Supermicro/Dell), `venet.*` (OpenVZ/VZ7 host-routed), and `bond.*` (bonded interfaces) in addition to the standard `eth/ens/enp` patterns.
:::

## Grafana Dashboards

Access Grafana at `http://localhost:3030`

Default credentials:
- Username: `admin`
- Password: `admin123`
