# NodePrism Agent Manager

A single script to install, uninstall, and manage monitoring agents on your servers. Copy `nodeprism-agent.sh` to your target server and run it.

## Quick Start

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
| `node_exporter` | 9100 | System metrics (CPU, memory, disk, network) |
| `mysql_exporter` | 9104 | MySQL database metrics |
| `postgres_exporter` | 9187 | PostgreSQL database metrics |
| `mongodb_exporter` | 9216 | MongoDB database metrics |
| `nginx_exporter` | 9113 | Nginx web server metrics |
| `redis_exporter` | 9121 | Redis cache metrics |
| `promtail` | 9080 | Log collector (ships to Loki) |

## Non-Interactive Mode

```bash
# Install node_exporter with defaults
sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter

# Install and register with manager
sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter --api-url http://manager:4000

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

## Files Created

| File | Purpose |
|------|---------|
| `/usr/local/bin/<agent>` | Agent binary |
| `/etc/systemd/system/<agent>.service` | Systemd service |
| `/etc/<agent>.env` | Credentials (database exporters) |
| `/etc/promtail/config.yml` | Promtail config (promtail only) |
