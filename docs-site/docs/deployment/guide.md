---
sidebar_position: 1
title: Deployment Guide
---

# Deployment Guide


## Quick Start

### Prerequisites

- Node.js 20+
- PNPM 8+
- Docker & Docker Compose
- PostgreSQL 15 (or use Docker)

### 1. Clone and Install

```bash
git clone https://github.com/your-org/NodePrism.git
cd NodePrism
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

See [Environment Variables](./environment.md) for all options.

### 3. Start Infrastructure

```bash
cd infrastructure/docker
docker-compose up -d
```

### 4. Initialize Database

```bash
pnpm prisma migrate deploy
pnpm prisma db seed
```

### 5. Start Development

```bash
pnpm run dev
```

## Production Deployment

### Build

```bash
pnpm run build
```

### Start

```bash
pnpm run start
```

## Docker Deployment

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Adding Monitored Servers

### Option 1: One-Liner Install (Recommended)

The NodePrism agent installer is served via **nginx on port 80**, making it accessible from any server — including those with restrictive firewalls like CSF/cPanel.

```bash
# Install node_exporter
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- install --non-interactive --type node_exporter

# Install multiple agents
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- install --non-interactive --type promtail
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- install --non-interactive --type mysql_exporter

# Check status of installed agents
curl -sL http://MANAGER_IP/agent-install.sh | sudo bash -s -- status
```

This automatically:
- Downloads and installs the agent binary
- Creates a systemd service
- **Opens the firewall port** (CSF, UFW, firewalld, or iptables)
- Registers with the NodePrism manager API
- Detects containers/VMs on virtualization hosts

> **Why port 80?** Servers with CSF (cPanel/WHM) or strict firewalls typically block outbound connections to non-standard ports (3000, 4000, etc.). Nginx on the manager server reverse-proxies port 80 to the API (port 4000) and web UI (port 3000), so the one-liner works everywhere.

For interactive mode (download first):
```bash
curl -sL http://MANAGER_IP/agent-install.sh -o nodeprism-agent.sh
sudo bash nodeprism-agent.sh
```

### Option 2: Via Web UI (SSH)

1. Add server in UI (Servers → Add New)
2. Click "Deploy Agent"
3. Agent is automatically installed via SSH

### Option 3: Manual Install

For manual installation of each exporter without the installer script, see below.

<details>
<summary>Manual Node Exporter Installation</summary>

**Port:** 9100 | **Metrics:** CPU, memory, disk, network, load

```bash
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xvfz node_exporter-*.tar.gz
sudo mv node_exporter-*/node_exporter /usr/local/bin/
sudo useradd -rs /bin/false node_exporter

sudo tee /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter --web.listen-address=:9100
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
curl http://localhost:9100/metrics | head
```

</details>

<details>
<summary>Manual MySQL Exporter Installation</summary>

**Port:** 9104

```bash
wget https://github.com/prometheus/mysqld_exporter/releases/download/v0.15.1/mysqld_exporter-0.15.1.linux-amd64.tar.gz
tar xvfz mysqld_exporter-*.tar.gz
sudo mv mysqld_exporter-*/mysqld_exporter /usr/local/bin/

mysql -u root -p -e "CREATE USER 'exporter'@'localhost' IDENTIFIED BY 'password'; GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'localhost'; FLUSH PRIVILEGES;"

sudo tee /etc/.mysqld_exporter.cnf <<EOF
[client]
user=exporter
password=password
EOF
sudo chmod 600 /etc/.mysqld_exporter.cnf

sudo tee /etc/systemd/system/mysqld_exporter.service <<EOF
[Unit]
Description=Prometheus MySQL Exporter
After=network.target

[Service]
User=mysqld_exporter
ExecStart=/usr/local/bin/mysqld_exporter --config.my-cnf=/etc/.mysqld_exporter.cnf --web.listen-address=:9104
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload && sudo systemctl enable --now mysqld_exporter
```

</details>

<details>
<summary>Manual PostgreSQL Exporter Installation</summary>

**Port:** 9187

```bash
wget https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
tar xvfz postgres_exporter-*.tar.gz
sudo mv postgres_exporter-*/postgres_exporter /usr/local/bin/

sudo -u postgres psql -c "CREATE USER exporter WITH PASSWORD 'password'; GRANT pg_monitor TO exporter;"

sudo tee /etc/systemd/system/postgres_exporter.service <<EOF
[Unit]
Description=Prometheus PostgreSQL Exporter
After=network.target

[Service]
Environment="DATA_SOURCE_NAME=postgresql://exporter:password@localhost:5432/postgres?sslmode=disable"
ExecStart=/usr/local/bin/postgres_exporter --web.listen-address=:9187
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload && sudo systemctl enable --now postgres_exporter
```

</details>

---

### Nginx Reverse Proxy (Manager Server)

The NodePrism manager uses nginx on port 80 to proxy all services. This is set up automatically but the config is at `/etc/nginx/sites-available/nodeprism`:

| Path | Proxied To | Purpose |
|------|-----------|---------|
| `/agent-install.sh` | `localhost:4000` | Agent installer script |
| `/api/*` | `localhost:4000` | REST API |
| `/socket.io/*` | `localhost:4000` | WebSocket (real-time updates) |
| `/health` | `localhost:4000` | Health check endpoint |
| `/*` (everything else) | `localhost:3000` | Next.js Web UI |

### Firewall Configuration

**Automatic (via installer script):** The agent installer auto-detects CSF, UFW, firewalld, or iptables and opens the required port. No manual action needed.

**Manual (if needed):**

```bash
# CSF (cPanel/WHM) — edit TCP_IN to add the port
vi /etc/csf/csf.conf   # Add 9100 to TCP_IN
csf -r                  # Restart CSF

# UFW (Ubuntu)
sudo ufw allow from MANAGER_IP to any port 9100

# firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=9100/tcp
sudo firewall-cmd --reload

# iptables
sudo iptables -I INPUT -p tcp --dport 9100 -j ACCEPT
```

## Troubleshooting

### Ports in Use

```bash
# Kill processes on NodePrism ports
lsof -ti:3000,4000,4001,4002,4003 | xargs kill -9
```

### Database Connection

```bash
# Check PostgreSQL
docker exec -it nodeprism-postgres psql -U nodeprism -d nodeprism
```

### Prometheus Targets

```bash
# Check targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets'
```
