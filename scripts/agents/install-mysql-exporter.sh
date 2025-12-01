#!/bin/bash
#
# MySQL Exporter Installation Script for NodePrism
# This script installs and configures Prometheus MySQL Exporter
# and automatically registers with the NodePrism API
#
# Usage:
#   curl -sL https://your-manager-host/scripts/install-mysql-exporter.sh | bash -s -- --api-url https://your-manager-host
#   OR
#   ./install-mysql-exporter.sh [OPTIONS]
#
# Options:
#   --version VERSION    MySQL Exporter version (default: 0.15.0)
#   --port PORT          Listen port (default: 9104)
#   --mysql-host HOST    MySQL host (default: localhost)
#   --mysql-port PORT    MySQL port (default: 3306)
#   --mysql-user USER    MySQL username (default: root)
#   --mysql-password PASS MySQL password (prompt if not provided)
#   --server-id ID       Server ID for identification
#   --hostname NAME      Hostname for labels
#   --api-url URL        NodePrism API URL for auto-registration (e.g., http://manager:4000)
#   --api-token TOKEN    Authentication token for API (optional)
#   --skip-register      Skip API registration
#

set -e

# Default configuration
MYSQL_EXPORTER_VERSION="${MYSQL_EXPORTER_VERSION:-0.15.0}"
LISTEN_PORT="${LISTEN_PORT:-9104}"
MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
SERVER_ID="${SERVER_ID:-}"
HOSTNAME_LABEL="${HOSTNAME_LABEL:-$(hostname)}"
INSTALL_DIR="/usr/local/bin"
SERVICE_USER="mysql_exporter"

# API configuration for auto-registration
API_URL="${API_URL:-}"
API_TOKEN="${API_TOKEN:-}"
SKIP_REGISTER="${SKIP_REGISTER:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --version)
      MYSQL_EXPORTER_VERSION="$2"
      shift 2
      ;;
    --port)
      LISTEN_PORT="$2"
      shift 2
      ;;
    --mysql-host)
      MYSQL_HOST="$2"
      shift 2
      ;;
    --mysql-port)
      MYSQL_PORT="$2"
      shift 2
      ;;
    --mysql-user)
      MYSQL_USER="$2"
      shift 2
      ;;
    --mysql-password)
      MYSQL_PASSWORD="$2"
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
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --api-token)
      API_TOKEN="$2"
      shift 2
      ;;
    --skip-register)
      SKIP_REGISTER="true"
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --version VERSION      MySQL Exporter version (default: 0.15.0)"
      echo "  --port PORT            Listen port (default: 9104)"
      echo "  --mysql-host HOST      MySQL host (default: localhost)"
      echo "  --mysql-port PORT      MySQL port (default: 3306)"
      echo "  --mysql-user USER      MySQL username (default: root)"
      echo "  --mysql-password PASS  MySQL password"
      echo "  --hostname NAME        Hostname for labels"
      echo "  --api-url URL          NodePrism API URL for auto-registration"
      echo "  --api-token TOKEN      Authentication token for API"
      echo "  --skip-register        Skip API registration"
      echo ""
      echo "Example:"
      echo "  $0 --api-url http://manager.example.com:4000 --mysql-password mypass"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
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
  local download_url="https://github.com/prometheus/mysqld_exporter/releases/download/v${MYSQL_EXPORTER_VERSION}/mysqld_exporter-${MYSQL_EXPORTER_VERSION}.${OS}-${ARCH}.tar.gz"
  local temp_dir
  temp_dir=$(mktemp -d)

  log_info "Downloading mysqld_exporter v${MYSQL_EXPORTER_VERSION} from $download_url"

  if command -v curl &>/dev/null; then
    curl -sL "$download_url" -o "$temp_dir/mysqld_exporter.tar.gz"
  elif command -v wget &>/dev/null; then
    wget -q "$download_url" -O "$temp_dir/mysqld_exporter.tar.gz"
  else
    log_error "Neither curl nor wget found. Please install one of them."
    exit 1
  fi

  log_info "Extracting archive"
  tar -xzf "$temp_dir/mysqld_exporter.tar.gz" -C "$temp_dir"

  log_info "Installing binary to $INSTALL_DIR"
  cp "$temp_dir/mysqld_exporter-${MYSQL_EXPORTER_VERSION}.${OS}-${ARCH}/mysqld_exporter" "$INSTALL_DIR/"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/mysqld_exporter"
  chmod +x "$INSTALL_DIR/mysqld_exporter"

  # Cleanup
  rm -rf "$temp_dir"

  log_info "mysqld_exporter installed to $INSTALL_DIR/mysqld_exporter"
}

create_config() {
  log_info "Creating MySQL exporter configuration"

  # Create data source name
  local dsn="${MYSQL_USER}:${MYSQL_PASSWORD}@tcp(${MYSQL_HOST}:${MYSQL_PORT})/"

  # Create systemd environment file
  cat > /etc/mysql_exporter.env << EOF
DATA_SOURCE_NAME=${dsn}
EOF

  chmod 600 /etc/mysql_exporter.env
  chown "$SERVICE_USER:$SERVICE_USER" /etc/mysql_exporter.env

  log_info "Configuration created at /etc/mysql_exporter.env"
}

create_systemd_service() {
  log_info "Creating systemd service"

  cat > /etc/systemd/system/mysql_exporter.service << EOF
[Unit]
Description=Prometheus MySQL Exporter
Documentation=https://github.com/prometheus/mysqld_exporter
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

EnvironmentFile=/etc/mysql_exporter.env

ExecStart=${INSTALL_DIR}/mysql_exporter \\
  --web.listen-address=:${LISTEN_PORT} \\
  --collect.info_schema.innodb_metrics \\
  --collect.info_schema.processlist \\
  --collect.info_schema.query_response_time \\
  --collect.info_schema.userstats \\
  --collect.engine_innodb_status

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  log_info "Systemd service created"
}

stop_existing_service() {
  if systemctl is-active --quiet mysql_exporter 2>/dev/null; then
    log_info "Stopping existing mysql_exporter service"
    systemctl stop mysql_exporter
  fi
}

start_service() {
  log_info "Starting mysql_exporter service"
  systemctl enable mysql_exporter
  systemctl start mysql_exporter

  sleep 2

  if systemctl is-active --quiet mysql_exporter; then
    log_info "mysql_exporter is running successfully"
  else
    log_error "mysql_exporter failed to start"
    journalctl -u mysql_exporter --no-pager -n 20
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
}

get_ip_address() {
  # Try various methods to get the primary IP address
  local ip=""

  # Method 1: hostname -I (Linux)
  if command -v hostname &>/dev/null; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi

  # Method 2: ip route
  if [[ -z "$ip" ]] && command -v ip &>/dev/null; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
  fi

  # Method 3: ifconfig
  if [[ -z "$ip" ]] && command -v ifconfig &>/dev/null; then
    ip=$(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n1)
  fi

  # Fallback
  if [[ -z "$ip" ]]; then
    ip="127.0.0.1"
  fi

  echo "$ip"
}

register_with_api() {
  if [[ "$SKIP_REGISTER" == "true" ]]; then
    log_info "Skipping API registration (--skip-register flag set)"
    return 0
  fi

  if [[ -z "$API_URL" ]]; then
    log_warn "No API URL provided. Skipping auto-registration."
    log_info "To enable auto-registration, run with: --api-url http://your-manager:4000"
    return 0
  fi

  log_info "Registering agent with NodePrism API..."

  local ip_address
  ip_address=$(get_ip_address)

  local hostname
  hostname="${HOSTNAME_LABEL:-$(hostname)}"

  # Prepare JSON payload
  local payload
  payload=$(cat <<EOF
{
  "hostname": "${hostname}",
  "ipAddress": "${ip_address}",
  "agentType": "MYSQL_EXPORTER",
  "port": ${LISTEN_PORT},
  "version": "${MYSQL_EXPORTER_VERSION}",
  "config": {
    "mysqlHost": "${MYSQL_HOST}",
    "mysqlPort": ${MYSQL_PORT},
    "mysqlUser": "${MYSQL_USER}"
  }
}
EOF
)

  log_info "Registration details:"
  log_info "  Hostname: ${hostname}"
  log_info "  IP Address: ${ip_address}"
  log_info "  Port: ${LISTEN_PORT}"
  log_info "  MySQL Host: ${MYSQL_HOST}:${MYSQL_PORT}"

  # Build curl command with optional auth header
  local auth_header=""
  if [[ -n "$API_TOKEN" ]]; then
    auth_header="-H \"Authorization: Bearer ${API_TOKEN}\""
  fi

  local response
  local http_code

  # Make the API call
  if [[ -n "$API_TOKEN" ]]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -d "$payload" \
      "${API_URL}/api/agents/register" 2>&1) || true
  else
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${API_URL}/api/agents/register" 2>&1) || true
  fi

  # Extract HTTP code from response
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
    log_info "Successfully registered with NodePrism!"
    echo -e "${BLUE}API Response:${NC} $body"
  elif [[ "$http_code" == "409" ]]; then
    log_warn "Agent already registered (HTTP 409). This is OK if updating."
    echo -e "${BLUE}API Response:${NC} $body"
  else
    log_error "Failed to register with API (HTTP $http_code)"
    log_error "Response: $body"
    log_warn "You can manually register the agent in the web UI"
    return 1
  fi

  return 0
}

print_summary() {
  echo ""
  log_info "============================================"
  log_info "MySQL Exporter Installation Complete!"
  log_info "============================================"
  log_info "Version: ${MYSQL_EXPORTER_VERSION}"
  log_info "Metrics URL: http://$(get_ip_address):${LISTEN_PORT}/metrics"
  log_info "MySQL Connection: ${MYSQL_HOST}:${MYSQL_PORT}"
  echo ""
  log_info "Useful commands:"
  log_info "  Check status:  systemctl status mysql_exporter"
  log_info "  View logs:     journalctl -u mysql_exporter -f"
  log_info "  Restart:       systemctl restart mysql_exporter"

  if [[ -n "$API_URL" ]] && [[ "$SKIP_REGISTER" != "true" ]]; then
    log_info ""
    log_info "API Registration: Enabled"
    log_info "Manager URL: ${API_URL}"
  fi

  log_info "============================================"
}

main() {
  echo ""
  log_info "============================================"
  log_info "NodePrism - MySQL Exporter Installer"
  log_info "============================================"
  echo ""

  check_root
  detect_os
  stop_existing_service
  create_user
  download_and_install
  create_config
  create_systemd_service
  start_service
  verify_installation
  register_with_api
  print_summary
}

main "$@"