#!/bin/bash
#
# Node Exporter Installation Script for Veeble Node Vitals
# This script installs and configures Prometheus Node Exporter
#
# Usage:
#   curl -sL https://your-manager-host/scripts/install-node-exporter.sh | bash
#   OR
#   ./install-node-exporter.sh [OPTIONS]
#
# Options:
#   --version VERSION    Node Exporter version (default: 1.7.0)
#   --port PORT          Listen port (default: 9100)
#   --server-id ID       Server ID for identification
#   --hostname NAME      Hostname for labels
#

set -e

# Default configuration
NODE_EXPORTER_VERSION="${NODE_EXPORTER_VERSION:-1.7.0}"
LISTEN_PORT="${LISTEN_PORT:-9100}"
SERVER_ID="${SERVER_ID:-}"
HOSTNAME_LABEL="${HOSTNAME_LABEL:-$(hostname)}"
INSTALL_DIR="/usr/local/bin"
SERVICE_USER="node_exporter"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --version)
      NODE_EXPORTER_VERSION="$2"
      shift 2
      ;;
    --port)
      LISTEN_PORT="$2"
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
      ARCH="armv7"
      ;;
    i386|i686)
      ARCH="386"
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
}

download_and_install() {
  local download_url="https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/node_exporter-${NODE_EXPORTER_VERSION}.${OS}-${ARCH}.tar.gz"
  local temp_dir
  temp_dir=$(mktemp -d)

  log_info "Downloading node_exporter v${NODE_EXPORTER_VERSION} from $download_url"

  if command -v curl &>/dev/null; then
    curl -sL "$download_url" -o "$temp_dir/node_exporter.tar.gz"
  elif command -v wget &>/dev/null; then
    wget -q "$download_url" -O "$temp_dir/node_exporter.tar.gz"
  else
    log_error "Neither curl nor wget found. Please install one of them."
    exit 1
  fi

  log_info "Extracting archive"
  tar -xzf "$temp_dir/node_exporter.tar.gz" -C "$temp_dir"

  log_info "Installing binary to $INSTALL_DIR"
  cp "$temp_dir/node_exporter-${NODE_EXPORTER_VERSION}.${OS}-${ARCH}/node_exporter" "$INSTALL_DIR/"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/node_exporter"
  chmod +x "$INSTALL_DIR/node_exporter"

  # Cleanup
  rm -rf "$temp_dir"

  log_info "node_exporter installed to $INSTALL_DIR/node_exporter"
}

create_systemd_service() {
  log_info "Creating systemd service"

  cat > /etc/systemd/system/node_exporter.service << EOF
[Unit]
Description=Prometheus Node Exporter
Documentation=https://prometheus.io/docs/guides/node-exporter/
Wants=network-online.target
After=network-online.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
Type=simple
Restart=on-failure
RestartSec=5

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes

ExecStart=${INSTALL_DIR}/node_exporter \\
  --web.listen-address=:${LISTEN_PORT} \\
  --collector.systemd \\
  --collector.processes \\
  --collector.filesystem.mount-points-exclude="^/(sys|proc|dev|host|etc)($|/)"

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  log_info "Systemd service created"
}

stop_existing_service() {
  if systemctl is-active --quiet node_exporter 2>/dev/null; then
    log_info "Stopping existing node_exporter service"
    systemctl stop node_exporter
  fi
}

start_service() {
  log_info "Starting node_exporter service"
  systemctl enable node_exporter
  systemctl start node_exporter

  sleep 2

  if systemctl is-active --quiet node_exporter; then
    log_info "node_exporter is running successfully"
  else
    log_error "node_exporter failed to start"
    journalctl -u node_exporter --no-pager -n 20
    exit 1
  fi
}

verify_installation() {
  log_info "Verifying installation..."

  if command -v curl &>/dev/null; then
    local metrics
    metrics=$(curl -s "http://localhost:${LISTEN_PORT}/metrics" | head -5)
    if [[ -n "$metrics" ]]; then
      log_info "Metrics endpoint is accessible"
      echo "$metrics"
    else
      log_warn "Could not fetch metrics from localhost:${LISTEN_PORT}"
    fi
  fi

  echo ""
  log_info "============================================"
  log_info "Node Exporter Installation Complete!"
  log_info "============================================"
  log_info "Version: ${NODE_EXPORTER_VERSION}"
  log_info "Metrics URL: http://$(hostname -I | awk '{print $1}'):${LISTEN_PORT}/metrics"
  log_info ""
  log_info "Useful commands:"
  log_info "  Check status:  systemctl status node_exporter"
  log_info "  View logs:     journalctl -u node_exporter -f"
  log_info "  Restart:       systemctl restart node_exporter"
  log_info "============================================"
}

main() {
  echo ""
  log_info "============================================"
  log_info "Veeble Node Vitals - Node Exporter Installer"
  log_info "============================================"
  echo ""

  check_root
  detect_os
  stop_existing_service
  create_user
  download_and_install
  create_systemd_service
  start_service
  verify_installation
}

main "$@"
