# Deployment Guide

> Auto-generated on 2025-12-02

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

### Option 1: With SSH Access (Automated)

1. Add server in UI (Servers → Add New)
2. Click "Deploy Agent"
3. Agent is automatically installed via SSH

### Option 2: Without SSH Access (Manual)

For each exporter, install on the remote server, then register with NodePrism.

---

#### Node Exporter (System Metrics)

**Port:** 9100 | **Metrics:** CPU, memory, disk, network, load

```bash
# Download and install
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xvfz node_exporter-*.tar.gz
sudo mv node_exporter-*/node_exporter /usr/local/bin/
sudo useradd -rs /bin/false node_exporter

# Create systemd service
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

# Verify
curl http://localhost:9100/metrics | head
```

**Register with NodePrism:**
```bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "NODE_EXPORTER", "port": 9100}'
```

---

#### MySQL Exporter

**Port:** 9104 | **Metrics:** queries, connections, replication, InnoDB

```bash
# Download and install
wget https://github.com/prometheus/mysqld_exporter/releases/download/v0.15.1/mysqld_exporter-0.15.1.linux-amd64.tar.gz
tar xvfz mysqld_exporter-*.tar.gz
sudo mv mysqld_exporter-*/mysqld_exporter /usr/local/bin/
sudo useradd -rs /bin/false mysqld_exporter

# Create MySQL user for exporter
mysql -u root -p <<EOF
CREATE USER 'exporter'@'localhost' IDENTIFIED BY 'your_password';
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'localhost';
FLUSH PRIVILEGES;
EOF

# Create credentials file
sudo tee /etc/.mysqld_exporter.cnf <<EOF
[client]
user=exporter
password=your_password
EOF
sudo chmod 600 /etc/.mysqld_exporter.cnf

# Create systemd service
sudo tee /etc/systemd/system/mysqld_exporter.service <<EOF
[Unit]
Description=Prometheus MySQL Exporter
After=network.target mysql.service

[Service]
User=mysqld_exporter
ExecStart=/usr/local/bin/mysqld_exporter --config.my-cnf=/etc/.mysqld_exporter.cnf --web.listen-address=:9104
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mysqld_exporter
```

**Register with NodePrism:**
```bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "MYSQL_EXPORTER", "port": 9104}'
```

---

#### PostgreSQL Exporter

**Port:** 9187 | **Metrics:** connections, queries, locks, replication

```bash
# Download and install
wget https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
tar xvfz postgres_exporter-*.tar.gz
sudo mv postgres_exporter-*/postgres_exporter /usr/local/bin/
sudo useradd -rs /bin/false postgres_exporter

# Create PostgreSQL user for exporter
sudo -u postgres psql <<EOF
CREATE USER exporter WITH PASSWORD 'your_password';
GRANT pg_monitor TO exporter;
EOF

# Create systemd service
sudo tee /etc/systemd/system/postgres_exporter.service <<EOF
[Unit]
Description=Prometheus PostgreSQL Exporter
After=network.target postgresql.service

[Service]
User=postgres_exporter
Environment="DATA_SOURCE_NAME=postgresql://exporter:your_password@localhost:5432/postgres?sslmode=disable"
ExecStart=/usr/local/bin/postgres_exporter --web.listen-address=:9187
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now postgres_exporter
```

**Register with NodePrism:**
```bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "POSTGRES_EXPORTER", "port": 9187}'
```

---

#### MongoDB Exporter

**Port:** 9216 | **Metrics:** connections, operations, replication, storage

```bash
# Download and install
wget https://github.com/percona/mongodb_exporter/releases/download/v0.40.0/mongodb_exporter-0.40.0.linux-amd64.tar.gz
tar xvfz mongodb_exporter-*.tar.gz
sudo mv mongodb_exporter-*/mongodb_exporter /usr/local/bin/
sudo useradd -rs /bin/false mongodb_exporter

# Create MongoDB user for exporter (in mongo shell)
# use admin
# db.createUser({user: "exporter", pwd: "your_password", roles: [{role: "clusterMonitor", db: "admin"}, {role: "read", db: "local"}]})

# Create systemd service
sudo tee /etc/systemd/system/mongodb_exporter.service <<EOF
[Unit]
Description=Prometheus MongoDB Exporter
After=network.target mongod.service

[Service]
User=mongodb_exporter
Environment="MONGODB_URI=mongodb://exporter:your_password@localhost:27017/admin"
ExecStart=/usr/local/bin/mongodb_exporter --web.listen-address=:9216
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mongodb_exporter
```

**Register with NodePrism:**
```bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "MONGODB_EXPORTER", "port": 9216}'
```

---

#### Nginx Exporter

**Port:** 9113 | **Metrics:** connections, requests, response codes

```bash
# Enable Nginx stub_status module (add to nginx.conf)
# server {
#     listen 127.0.0.1:8080;
#     location /nginx_status {
#         stub_status on;
#         allow 127.0.0.1;
#         deny all;
#     }
# }
sudo nginx -t && sudo systemctl reload nginx

# Download and install exporter
wget https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v1.1.0/nginx-prometheus-exporter_1.1.0_linux_amd64.tar.gz
tar xvfz nginx-prometheus-exporter_*.tar.gz
sudo mv nginx-prometheus-exporter /usr/local/bin/
sudo useradd -rs /bin/false nginx_exporter

# Create systemd service
sudo tee /etc/systemd/system/nginx_exporter.service <<EOF
[Unit]
Description=Prometheus Nginx Exporter
After=network.target nginx.service

[Service]
User=nginx_exporter
ExecStart=/usr/local/bin/nginx-prometheus-exporter -nginx.scrape-uri=http://127.0.0.1:8080/nginx_status -web.listen-address=:9113
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now nginx_exporter
```

**Register with NodePrism:**
```bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "NGINX_EXPORTER", "port": 9113}'
```

---

#### Apache Exporter

**Port:** 9117 | **Metrics:** requests, workers, scoreboard, bytes

```bash
# Enable Apache mod_status (add to apache config)
# <Location "/server-status">
#     SetHandler server-status
#     Require local
# </Location>
sudo a2enmod status
sudo systemctl reload apache2

# Download and install exporter
wget https://github.com/Lusitaniae/apache_exporter/releases/download/v1.0.3/apache_exporter-1.0.3.linux-amd64.tar.gz
tar xvfz apache_exporter-*.tar.gz
sudo mv apache_exporter-*/apache_exporter /usr/local/bin/
sudo useradd -rs /bin/false apache_exporter

# Create systemd service
sudo tee /etc/systemd/system/apache_exporter.service <<EOF
[Unit]
Description=Prometheus Apache Exporter
After=network.target apache2.service

[Service]
User=apache_exporter
ExecStart=/usr/local/bin/apache_exporter --scrape_uri=http://127.0.0.1/server-status?auto --web.listen-address=:9117
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now apache_exporter
```

**Register with NodePrism:**
```bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "APACHE_EXPORTER", "port": 9117}'
```

---

#### Promtail (Log Shipping)

**Port:** 9080 | **Purpose:** Ships logs to Loki

```bash
# Download and install
wget https://github.com/grafana/loki/releases/download/v2.9.4/promtail-linux-amd64.zip
unzip promtail-linux-amd64.zip
sudo mv promtail-linux-amd64 /usr/local/bin/promtail
sudo useradd -rs /bin/false promtail
sudo usermod -aG adm promtail  # For log access

# Create config
sudo mkdir -p /etc/promtail
sudo tee /etc/promtail/config.yml <<EOF
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://MANAGER_IP:3100/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          host: $(hostname)
          __path__: /var/log/*.log
  - job_name: syslog
    static_configs:
      - targets:
          - localhost
        labels:
          job: syslog
          host: $(hostname)
          __path__: /var/log/syslog
EOF

sudo mkdir -p /var/lib/promtail
sudo chown promtail:promtail /var/lib/promtail

# Create systemd service
sudo tee /etc/systemd/system/promtail.service <<EOF
[Unit]
Description=Promtail Log Agent
After=network.target

[Service]
User=promtail
ExecStart=/usr/local/bin/promtail -config.file=/etc/promtail/config.yml
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now promtail
```

**Register with NodePrism:**
```bash
curl -X POST http://MANAGER_IP:4000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"hostname": "my-server", "ipAddress": "SERVER_IP", "agentType": "PROMTAIL", "port": 9080}'
```

---

### Firewall Configuration

Ensure the manager can reach the exporter ports:

```bash
# UFW (Ubuntu)
sudo ufw allow from MANAGER_IP to any port 9100  # node_exporter
sudo ufw allow from MANAGER_IP to any port 9104  # mysqld_exporter
sudo ufw allow from MANAGER_IP to any port 9187  # postgres_exporter
sudo ufw allow from MANAGER_IP to any port 9216  # mongodb_exporter
sudo ufw allow from MANAGER_IP to any port 9113  # nginx_exporter
sudo ufw allow from MANAGER_IP to any port 9117  # apache_exporter

# firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="MANAGER_IP" port port="9100" protocol="tcp" accept'
sudo firewall-cmd --reload
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
