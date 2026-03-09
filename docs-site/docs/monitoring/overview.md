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
| `NODE_EXPORTER` | 9100 | CPU, memory, disk, network |
| `MYSQL_EXPORTER` | 9104 | MySQL server metrics |
| `POSTGRES_EXPORTER` | 9187 | PostgreSQL metrics |
| `MONGODB_EXPORTER` | 9216 | MongoDB metrics |
| `NGINX_EXPORTER` | 9113 | Nginx metrics |
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
| `PrometheusTargetMissing` | `up == 0` (non-system jobs) for 5m | Critical |
| `HighCPUUsage` | CPU > 80% for 2m | Warning |
| `HighLoadAverage` | load1 > 10 for 5m | Warning |
| `CriticalLoadAverage` | load1 > 50 for 5m | Critical |
| `HighMemoryUsage` | Memory > 80% for 2m | Warning |
| `LowDiskSpace` | Disk > 80% for 2m | Warning |
| `CriticalDiskSpace` | Disk > 95% for 2m | Critical |
| `EximQueueHigh` | exim_queue_size > 1000 for 5m | Warning |
| `LVMVolumeGroupLowSpace` | LVM VG > 80% for 5m | Warning |
| `LVMVolumeGroupCriticalSpace` | LVM VG > 95% for 2m | Critical |
| `HighAnomalyRate` | anomaly_rate > 30% for 2m | Warning |
| `CriticalAnomalyRate` | anomaly_rate > 60% for 1m | Critical |
| `SustainedAnomaly` | anomaly detected for 5m | Warning |
| `TooManyScrapeErrors` | scrape errors > 10/min for 5m | Warning |

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

Access Grafana at `http://localhost:3030`

Default credentials:
- Username: `admin`
- Password: `admin123`
