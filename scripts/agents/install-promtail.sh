#!/bin/bash
#
# Promtail Installation Script for Veeble Node Vitals
# This script installs and configures Grafana Promtail for log collection
#
# Usage:
#   curl -sL https://your-manager-host/scripts/install-promtail.sh | bash -s -- --loki-url http://manager:3100
#   OR
#   ./install-promtail.sh [OPTIONS]
#
# Options:
#   --version VERSION    Promtail version (default: 2.9.3)
#   --loki-url URL       Loki push URL (required)
#   --server-id ID       Server ID for labels
#   --hostname NAME      Hostname for labels
#   --http-port PORT     HTTP listen port (default: 9080)
#

set -e

# Default configuration
PROMTAIL_VERSION="${PROMTAIL_VERSION:-2.9.3}"
LOKI_URL="${LOKI_URL:-}"
SERVER_ID="${SERVER_ID:-}"
HOSTNAME_LABEL="${HOSTNAME_LABEL:-$(hostname)}"
HTTP_PORT="${HTTP_PORT:-9080}"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/promtail"
DATA_DIR="/var/lib/promtail"
SERVICE_USER="promtail"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --version)
      PROMTAIL_VERSION="$2"
      shift 2
      ;;
    --loki-url)
      LOKI_URL="$2"
      shift 2
      ;;
    --server-id)
      SERVER_ID="$2"
      shift 2
      ;;
    --hostname)
      HOSTNAME_LABEL="$2"
      shift 2
      ;;
    --http-port)
      HTTP_PORT="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
  if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root or with sudo"
    exit 1
  fi
}

check_requirements() {
  if [[ -z "$LOKI_URL" ]]; then
    log_error "Loki URL is required. Use --loki-url to specify."
    log_error "Example: ./install-promtail.sh --loki-url http://manager-host:3100/loki/api/v1/push"
    exit 1
  fi
}

detect_os() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case $ARCH in
    x86_64)
      ARCH="amd64"
      ;;
    aarch64|arm64)
      ARCH="arm64"
      ;;
    armv7l)
      ARCH="arm"
      ;;
    *)
      log_error "Unsupported architecture: $ARCH"
      exit 1
      ;;
  esac

  log_info "Detected OS: $OS, Architecture: $ARCH"
}

create_user() {
  if id "$SERVICE_USER" &>/dev/null; then
    log_info "User $SERVICE_USER already exists"
  else
    log_info "Creating user $SERVICE_USER"
    useradd --no-create-home --shell /bin/false "$SERVICE_USER"
  fi

  # Add promtail to groups for log access
  usermod -a -G adm "$SERVICE_USER" 2>/dev/null || true
  usermod -a -G systemd-journal "$SERVICE_USER" 2>/dev/null || true
}

create_directories() {
  log_info "Creating directories"
  mkdir -p "$CONFIG_DIR" "$DATA_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR" "$DATA_DIR"
}

download_and_install() {
  local download_url="https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-${OS}-${ARCH}.zip"
  local temp_dir
  temp_dir=$(mktemp -d)

  log_info "Downloading promtail v${PROMTAIL_VERSION} from $download_url"

  if command -v curl &>/dev/null; then
    curl -sL "$download_url" -o "$temp_dir/promtail.zip"
  elif command -v wget &>/dev/null; then
    wget -q "$download_url" -O "$temp_dir/promtail.zip"
  else
    log_error "Neither curl nor wget found. Please install one of them."
    exit 1
  fi

  # Check if unzip is available
  if ! command -v unzip &>/dev/null; then
    log_info "Installing unzip..."
    if command -v apt-get &>/dev/null; then
      apt-get update -qq && apt-get install -y -qq unzip
    elif command -v yum &>/dev/null; then
      yum install -y -q unzip
    elif command -v dnf &>/dev/null; then
      dnf install -y -q unzip
    else
      log_error "Cannot install unzip automatically. Please install it manually."
      exit 1
    fi
  fi

  log_info "Extracting archive"
  unzip -q "$temp_dir/promtail.zip" -d "$temp_dir"

  log_info "Installing binary to $INSTALL_DIR"
  cp "$temp_dir/promtail-${OS}-${ARCH}" "$INSTALL_DIR/promtail"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/promtail"
  chmod +x "$INSTALL_DIR/promtail"

  # Cleanup
  rm -rf "$temp_dir"

  log_info "promtail installed to $INSTALL_DIR/promtail"
}

create_config() {
  log_info "Creating promtail configuration"

  # Ensure LOKI_URL ends with /loki/api/v1/push
  if [[ "$LOKI_URL" != */loki/api/v1/push ]]; then
    LOKI_URL="${LOKI_URL%/}/loki/api/v1/push"
  fi

  cat > "$CONFIG_DIR/config.yml" << EOF
server:
  http_listen_port: ${HTTP_PORT}
  grpc_listen_port: 0

positions:
  filename: ${DATA_DIR}/positions.yaml

clients:
  - url: ${LOKI_URL}
    tenant_id: default
    batchwait: 1s
    batchsize: 1048576
    timeout: 10s

scrape_configs:
  # System logs
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          hostname: ${HOSTNAME_LABEL}
          server_id: "${SERVER_ID}"
          __path__: /var/log/*.log

  # Auth logs
  - job_name: auth
    static_configs:
      - targets:
          - localhost
        labels:
          job: auth
          hostname: ${HOSTNAME_LABEL}
          server_id: "${SERVER_ID}"
          __path__: /var/log/auth.log

  # Syslog
  - job_name: syslog
    static_configs:
      - targets:
          - localhost
        labels:
          job: syslog
          hostname: ${HOSTNAME_LABEL}
          server_id: "${SERVER_ID}"
          __path__: /var/log/syslog

  # Systemd journal
  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
        hostname: ${HOSTNAME_LABEL}
        server_id: "${SERVER_ID}"
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: 'unit'
      - source_labels: ['__journal_priority_keyword']
        target_label: 'level'
EOF

  chown "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR/config.yml"
  log_info "Configuration created at $CONFIG_DIR/config.yml"
}

create_systemd_service() {
  log_info "Creating systemd service"

  cat > /etc/systemd/system/promtail.service << EOF
[Unit]
Description=Grafana Promtail - Log Collector
Documentation=https://grafana.com/docs/loki/latest/clients/promtail/
Wants=network-online.target
After=network-online.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
Type=simple
Restart=on-failure
RestartSec=5

ExecStart=${INSTALL_DIR}/promtail -config.file=${CONFIG_DIR}/config.yml

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  log_info "Systemd service created"
}

stop_existing_service() {
  if systemctl is-active --quiet promtail 2>/dev/null; then
    log_info "Stopping existing promtail service"
    systemctl stop promtail
  fi
}

start_service() {
  log_info "Starting promtail service"
  systemctl enable promtail
  systemctl start promtail

  sleep 2

  if systemctl is-active --quiet promtail; then
    log_info "promtail is running successfully"
  else
    log_error "promtail failed to start"
    journalctl -u promtail --no-pager -n 20
    exit 1
  fi
}

verify_installation() {
  log_info "Verifying installation..."

  if command -v curl &>/dev/null; then
    local ready
    ready=$(curl -s "http://localhost:${HTTP_PORT}/ready" 2>/dev/null || echo "")
    if [[ "$ready" == "Ready" ]]; then
      log_info "Promtail is ready and accepting connections"
    else
      log_warn "Promtail may not be fully ready yet. Check logs if issues persist."
    fi
  fi

  echo ""
  log_info "============================================"
  log_info "Promtail Installation Complete!"
  log_info "============================================"
  log_info "Version: ${PROMTAIL_VERSION}"
  log_info "Config: ${CONFIG_DIR}/config.yml"
  log_info "Loki URL: ${LOKI_URL}"
  log_info "HTTP Port: ${HTTP_PORT}"
  log_info ""
  log_info "Useful commands:"
  log_info "  Check status:  systemctl status promtail"
  log_info "  View logs:     journalctl -u promtail -f"
  log_info "  Restart:       systemctl restart promtail"
  log_info "  Edit config:   nano ${CONFIG_DIR}/config.yml"
  log_info "============================================"
}

main() {
  echo ""
  log_info "============================================"
  log_info "Veeble Node Vitals - Promtail Installer"
  log_info "============================================"
  echo ""

  check_root
  check_requirements
  detect_os
  stop_existing_service
  create_user
  create_directories
  download_and_install
  create_config
  create_systemd_service
  start_service
  verify_installation
}

main "$@"
