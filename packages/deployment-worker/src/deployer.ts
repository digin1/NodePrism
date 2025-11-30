import { Client, ConnectConfig } from 'ssh2';
import { logger } from './utils/logger';
import { DeploymentJob } from './worker';

export interface DeploymentResult {
  success: boolean;
  error?: string;
  output?: string;
}

interface SSHCredentials {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
}

const SSH_PRIVATE_KEY_PATH = process.env.SSH_PRIVATE_KEY_PATH || '/app/ssh/id_rsa';
const AGENT_SCRIPTS_PATH = process.env.AGENT_SCRIPTS_PATH || '/app/scripts';

export class SSHDeployer {
  private getSSHConfig(job: DeploymentJob): ConnectConfig {
    const config: ConnectConfig = {
      host: job.ipAddress,
      port: job.sshPort,
      username: job.sshUsername,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
    };

    // Try to use SSH key first, fall back to password if needed
    const fs = require('fs');
    if (fs.existsSync(SSH_PRIVATE_KEY_PATH)) {
      config.privateKey = fs.readFileSync(SSH_PRIVATE_KEY_PATH, 'utf8');
    }

    return config;
  }

  async deploy(job: DeploymentJob): Promise<DeploymentResult> {
    const client = new Client();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.end();
        resolve({
          success: false,
          error: 'SSH connection timeout',
        });
      }, 120000); // 2 minute timeout

      client.on('ready', async () => {
        logger.info('SSH connection established', {
          host: job.ipAddress,
          jobId: job.id,
        });

        try {
          // Execute deployment based on agent type
          const result = await this.executeDeployment(client, job);
          clearTimeout(timeout);
          client.end();
          resolve(result);
        } catch (error) {
          clearTimeout(timeout);
          client.end();
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during deployment',
          });
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('SSH connection error', {
          error: err.message,
          host: job.ipAddress,
          jobId: job.id,
        });
        resolve({
          success: false,
          error: `SSH connection failed: ${err.message}`,
        });
      });

      try {
        const config = this.getSSHConfig(job);
        client.connect(config);
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to initiate SSH connection',
        });
      }
    });
  }

  private async executeDeployment(client: Client, job: DeploymentJob): Promise<DeploymentResult> {
    switch (job.agentType) {
      case 'node_exporter':
        return this.deployNodeExporter(client, job);
      case 'promtail':
        return this.deployPromtail(client, job);
      default:
        return {
          success: false,
          error: `Unknown agent type: ${job.agentType}`,
        };
    }
  }

  private async deployNodeExporter(client: Client, job: DeploymentJob): Promise<DeploymentResult> {
    const script = this.getNodeExporterScript(job);
    return this.executeScript(client, script);
  }

  private async deployPromtail(client: Client, job: DeploymentJob): Promise<DeploymentResult> {
    const script = this.getPromtailScript(job);
    return this.executeScript(client, script);
  }

  private executeScript(client: Client, script: string): Promise<DeploymentResult> {
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';

      client.exec(script, (err, stream) => {
        if (err) {
          resolve({
            success: false,
            error: `Failed to execute script: ${err.message}`,
          });
          return;
        }

        stream.on('close', (code: number) => {
          if (code === 0) {
            resolve({
              success: true,
              output,
            });
          } else {
            resolve({
              success: false,
              error: errorOutput || `Script exited with code ${code}`,
              output,
            });
          }
        });

        stream.on('data', (data: Buffer) => {
          output += data.toString();
          logger.debug('SSH stdout', { data: data.toString() });
        });

        stream.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
          logger.debug('SSH stderr', { data: data.toString() });
        });
      });
    });
  }

  private getNodeExporterScript(job: DeploymentJob): string {
    const managerHost = process.env.MANAGER_HOST || 'localhost';
    const nodeExporterVersion = process.env.NODE_EXPORTER_VERSION || '1.7.0';

    return `#!/bin/bash
set -e

echo "=== Starting node_exporter deployment ==="
echo "Server: ${job.hostname}"
echo "Deployment ID: ${job.deploymentId}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case $ARCH in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l) ARCH="armv7" ;;
esac

echo "Detected: $OS $ARCH"

# Check if node_exporter is already running
if systemctl is-active --quiet node_exporter 2>/dev/null; then
  echo "node_exporter is already running, updating..."
  sudo systemctl stop node_exporter
fi

# Create node_exporter user if it doesn't exist
if ! id -u node_exporter &>/dev/null; then
  sudo useradd --no-create-home --shell /bin/false node_exporter
fi

# Download and install node_exporter
DOWNLOAD_URL="https://github.com/prometheus/node_exporter/releases/download/v${nodeExporterVersion}/node_exporter-${nodeExporterVersion}.\${OS}-\${ARCH}.tar.gz"
TEMP_DIR=$(mktemp -d)

echo "Downloading node_exporter from $DOWNLOAD_URL"
curl -sL "$DOWNLOAD_URL" -o "$TEMP_DIR/node_exporter.tar.gz"
tar -xzf "$TEMP_DIR/node_exporter.tar.gz" -C "$TEMP_DIR"

# Install binary
sudo cp "$TEMP_DIR/node_exporter-${nodeExporterVersion}.\${OS}-\${ARCH}/node_exporter" /usr/local/bin/
sudo chown node_exporter:node_exporter /usr/local/bin/node_exporter
sudo chmod +x /usr/local/bin/node_exporter

# Create systemd service
cat << 'SERVICEFILE' | sudo tee /etc/systemd/system/node_exporter.service
[Unit]
Description=Prometheus Node Exporter
Documentation=https://prometheus.io/docs/guides/node-exporter/
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
Restart=on-failure
RestartSec=5
ExecStart=/usr/local/bin/node_exporter \\
  --web.listen-address=:9100 \\
  --collector.systemd \\
  --collector.processes

[Install]
WantedBy=multi-user.target
SERVICEFILE

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter

# Clean up
rm -rf "$TEMP_DIR"

# Verify installation
sleep 2
if systemctl is-active --quiet node_exporter; then
  echo "=== node_exporter installed and running successfully ==="
  curl -s http://localhost:9100/metrics | head -5
  exit 0
else
  echo "ERROR: node_exporter failed to start"
  sudo journalctl -u node_exporter --no-pager -n 20
  exit 1
fi
`;
  }

  private getPromtailScript(job: DeploymentJob): string {
    const managerHost = process.env.MANAGER_HOST || 'localhost';
    const lokiPort = process.env.LOKI_PORT || '3100';
    const promtailVersion = process.env.PROMTAIL_VERSION || '2.9.3';

    return `#!/bin/bash
set -e

echo "=== Starting Promtail deployment ==="
echo "Server: ${job.hostname}"
echo "Deployment ID: ${job.deploymentId}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case $ARCH in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l) ARCH="armv7" ;;
esac

echo "Detected: $OS $ARCH"

# Check if promtail is already running
if systemctl is-active --quiet promtail 2>/dev/null; then
  echo "promtail is already running, updating..."
  sudo systemctl stop promtail
fi

# Create promtail user if it doesn't exist
if ! id -u promtail &>/dev/null; then
  sudo useradd --no-create-home --shell /bin/false promtail
fi

# Create directories
sudo mkdir -p /etc/promtail /var/lib/promtail

# Download and install promtail
DOWNLOAD_URL="https://github.com/grafana/loki/releases/download/v${promtailVersion}/promtail-\${OS}-\${ARCH}.zip"
TEMP_DIR=$(mktemp -d)

echo "Downloading promtail from $DOWNLOAD_URL"
curl -sL "$DOWNLOAD_URL" -o "$TEMP_DIR/promtail.zip"
unzip -q "$TEMP_DIR/promtail.zip" -d "$TEMP_DIR"

# Install binary
sudo cp "$TEMP_DIR/promtail-\${OS}-\${ARCH}" /usr/local/bin/promtail
sudo chown promtail:promtail /usr/local/bin/promtail
sudo chmod +x /usr/local/bin/promtail

# Create promtail config
cat << CONFIGFILE | sudo tee /etc/promtail/config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://${managerHost}:${lokiPort}/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          hostname: ${job.hostname}
          server_id: ${job.serverId}
          __path__: /var/log/*.log

  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
        hostname: ${job.hostname}
        server_id: ${job.serverId}
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: 'unit'
CONFIGFILE

sudo chown -R promtail:promtail /etc/promtail /var/lib/promtail

# Create systemd service
cat << 'SERVICEFILE' | sudo tee /etc/systemd/system/promtail.service
[Unit]
Description=Promtail Log Collector
Documentation=https://grafana.com/docs/loki/latest/clients/promtail/
Wants=network-online.target
After=network-online.target

[Service]
User=promtail
Group=promtail
Type=simple
Restart=on-failure
RestartSec=5
ExecStart=/usr/local/bin/promtail -config.file=/etc/promtail/config.yml

[Install]
WantedBy=multi-user.target
SERVICEFILE

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable promtail
sudo systemctl start promtail

# Clean up
rm -rf "$TEMP_DIR"

# Verify installation
sleep 2
if systemctl is-active --quiet promtail; then
  echo "=== promtail installed and running successfully ==="
  exit 0
else
  echo "ERROR: promtail failed to start"
  sudo journalctl -u promtail --no-pager -n 20
  exit 1
fi
`;
  }
}
