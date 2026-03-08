---
sidebar_position: 1
title: Agent Scripts
---

# NodePrism Agent Manager

A single script to install, uninstall, and manage monitoring agents on your servers.

## Quick Start

### One-Liner Install (Recommended)

Install agents directly from your NodePrism manager via `curl`. The script is served through **nginx on port 80**, so it works even on servers with restrictive firewalls (e.g., CSF/cPanel):

```bash
# Install node_exporter (non-interactive)
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- install --non-interactive --type node_exporter

# Install promtail
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- install --non-interactive --type promtail

# Check agent status
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- status

# Uninstall an agent
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- uninstall --type node_exporter --non-interactive
```

> **Note:** The script is served on port 80 (via nginx reverse proxy) because many servers with CSF or strict firewalls block non-standard outbound ports like 3000 or 4000. Port 80 is universally allowed.

### Interactive Mode

For interactive mode (menus/prompts), download the script first:

```bash
curl -sL http://MANAGER_IP/agent-install.sh -o nodeprism-agent.sh
sudo bash nodeprism-agent.sh
```

Or copy `scripts/agents/nodeprism-agent.sh` to the target server manually:

```bash
sudo ./nodeprism-agent.sh              # Interactive menu
sudo ./nodeprism-agent.sh install      # Interactive install
sudo ./nodeprism-agent.sh status       # Show agent status
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

# Install and register with manager (auto-detected when using curl one-liner)
sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter \
  --api-url http://manager-ip

# Custom port
sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter --port 9101

# Uninstall specific agent
sudo ./nodeprism-agent.sh uninstall --type node_exporter --non-interactive

# Uninstall all agents
sudo ./nodeprism-agent.sh uninstall --type all --non-interactive
```

## What the Installer Does

1. Creates a dedicated service user (e.g., `node_exporter`)
2. Downloads the official binary from GitHub releases
3. Creates a systemd service with security hardening
4. Starts and enables the service
5. **Auto-detects and configures firewall** (CSF, UFW, firewalld, iptables) — opens the agent port
6. Registers with your NodePrism manager API (auto-detected from the download URL)
7. Detects containers/VMs on virtualization hosts and reports them

## Firewall Auto-Configuration

The installer automatically detects and opens the agent port in your firewall:

| Firewall | Detection | Action |
|----------|-----------|--------|
| **CSF** (cPanel/WHM) | `/etc/csf/csf.conf` exists | Adds port to `TCP_IN`, runs `csf -r` |
| **UFW** (Ubuntu) | `ufw status` is active | `ufw allow <port>/tcp` |
| **firewalld** (CentOS/RHEL) | `firewall-cmd --state` is running | `firewall-cmd --permanent --add-port` + reload |
| **iptables** | Non-default rules exist | `iptables -I INPUT` + saves rules |
| **None** | No firewall detected | Skips (port already accessible) |

On uninstall, the port is automatically closed/removed from the firewall.

## Database Exporter Setup

Database exporters (MySQL, PostgreSQL, MongoDB) require credentials to connect to the database. The exporter runs as a dedicated system user (e.g., `mysql_exporter`), not as root, so it cannot use socket authentication — explicit credentials are required.

### MySQL Exporter

**1. Create a read-only MySQL monitoring user:**

```bash
mysql -e "CREATE USER IF NOT EXISTS 'exporter'@'localhost' IDENTIFIED BY 'YourSecurePassword';
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'localhost';
FLUSH PRIVILEGES;"
```

The grants are fully **read-only**:
- `PROCESS` — view running queries (`SHOW PROCESSLIST`)
- `REPLICATION CLIENT` — view replication status
- `SELECT` — read-only queries for metric collection

**2. Configure the exporter credentials:**

```bash
cat > /etc/mysql_exporter.env << 'EOF'
[client]
user=exporter
password=YourSecurePassword
host=localhost
port=3306
EOF
chmod 600 /etc/mysql_exporter.env
```

**3. Restart the exporter:**

```bash
systemctl restart mysql_exporter && systemctl status mysql_exporter
```

> **Note:** If you installed via the interactive installer and left the password blank, the exporter will fail to start with `"no user specified in section or parent"`. Follow the steps above to fix it.

### PostgreSQL Exporter

```bash
sudo -u postgres psql -c "CREATE USER exporter WITH PASSWORD 'YourSecurePassword'; GRANT pg_monitor TO exporter;"
```

The connection string is configured in the systemd service as `DATA_SOURCE_NAME`.

### MongoDB Exporter

```bash
# In mongo shell:
use admin
db.createUser({
  user: "exporter",
  pwd: "YourSecurePassword",
  roles: [{role: "clusterMonitor", db: "admin"}, {role: "read", db: "local"}]
})
```

The connection URI is configured in the systemd service as `MONGODB_URI`.

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
