---
sidebar_position: 1
title: Agent Scripts
---

# NodePrism Agent Manager

A single script to install, uninstall, and manage monitoring agents on your servers.

## Quick Start

Copy `scripts/agents/nodeprism-agent.sh` to your target server and run:

```bash
# Interactive menu (install, uninstall, or check status)
sudo ./nodeprism-agent.sh

# Direct commands
sudo ./nodeprism-agent.sh install
sudo ./nodeprism-agent.sh uninstall
sudo ./nodeprism-agent.sh status
```

## Available Agents

| Agent | Default Port | Description |
|-------|-------------|-------------|
| `node_exporter` | 9100 | System metrics (CPU, memory, disk, network, load average) |
| `mysql_exporter` | 9104 | MySQL/MariaDB metrics (connections, queries/sec, InnoDB stats, slow queries) |
| `postgres_exporter` | 9187 | PostgreSQL metrics (connections, query stats, replication lag) |
| `mongodb_exporter` | 9216 | MongoDB metrics (operations, connections, replication) |
| `nginx_exporter` | 9113 | Nginx metrics (active connections, requests/sec) |
| `redis_exporter` | 9121 | Redis metrics (memory, keys, commands/sec) |
| `libvirt_exporter` | 9177 | KVM/QEMU per-VM metrics (CPU time, memory, disk I/O, network per domain) |
| `litespeed_exporter` | 9122 | LiteSpeed metrics (requests/sec, connections, bandwidth, per-vhost stats) |
| `exim_exporter` | 9123 | Exim mail metrics (queue size, frozen messages, deliveries/bounces per day) |
| `cpanel_exporter` | 9124 | cPanel metrics (accounts, domains, bandwidth, disk usage) |
| `promtail` | 9080 | Log collector (ships syslog, auth.log, journal to Loki) |

## Non-Interactive Mode

```bash
# Install node_exporter with defaults
sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter

# Install and register with manager
sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter \
  --api-url http://manager:4000

# Custom port
sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter --port 9101

# Uninstall specific agent
sudo ./nodeprism-agent.sh uninstall --type node_exporter

# Uninstall all agents
sudo ./nodeprism-agent.sh uninstall --type all
```

## What the Installer Does

1. Creates a dedicated service user (e.g., `node_exporter`)
2. Downloads the official binary from GitHub releases
3. Creates a systemd service with security hardening
4. Starts and enables the service
5. Optionally registers with your NodePrism manager API

## Container / VM Detection

When installed on a virtualization host, the agent automatically detects and reports containers/VMs:

| Platform | Detection Method | Metrics Source |
|----------|-----------------|----------------|
| KVM/QEMU | `virsh list` | Libvirt Exporter (Prometheus) |
| OpenVZ / Virtuozzo 7 | `vzlist` | Periodic collector (`/proc/vz/vestat` for CPU, `vznetstat` for network) |
| Virtuozzo | `prlctl list` | `prlctl statistics` |

A **container collector** (systemd timer, every 30s) runs on OpenVZ/VZ7 hosts to gather per-container CPU%, memory, and network rates (delta-based computation from `vznetstat` counters).

## Files Created

| File | Purpose |
|------|---------|
| `/usr/local/bin/<agent>` | Agent binary |
| `/etc/systemd/system/<agent>.service` | Systemd service |
| `/etc/<agent>.env` | Credentials (database exporters) |
| `/etc/promtail/config.yml` | Promtail config (promtail only) |
| `/usr/local/bin/nodeprism-container-collector` | Container metrics collector (virtualization hosts) |
| `/tmp/nodeprism-vznet-prev.dat` | VZ7 network rate snapshot (temporary) |

## CLI Options

```
Usage: sudo ./nodeprism-agent.sh [COMMAND] [OPTIONS]

Commands:
  install       Install a monitoring agent
  uninstall     Remove an installed agent
  status        Show status of installed agents
  (none)        Interactive main menu

Options (install):
  --non-interactive    Skip prompts, use defaults
  --type TYPE          Agent type
  --port PORT          Listen port
  --hostname NAME      Hostname label
  --log-dir DIR        Custom log directory (promtail)
  --api-url URL        NodePrism manager URL
  --api-token TOKEN    Auth token for API
  --skip-register      Skip API registration

Options (uninstall):
  --type TYPE          Agent to remove (or 'all')
  --non-interactive    Skip confirmation prompts
```
