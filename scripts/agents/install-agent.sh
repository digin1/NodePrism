#!/bin/bash
#
# Universal Agent Installation Script for NodePrism
# This script installs and configures various Prometheus exporters
# and automatically registers them with the NodePrism API
#
# Usage:
#   curl -sL https://your-manager-host/scripts/install-agent.sh | bash -s -- --type node_exporter --api-url http://manager:4000
#   OR
#   ./install-agent.sh [OPTIONS]
#
# Options:
#   --type TYPE          Agent type (node_exporter, mysql_exporter, nginx_exporter, etc.)
#   --version VERSION    Agent version (optional, uses default)
#   --port PORT          Listen port (optional, uses default for type)
#   --hostname NAME      Hostname for labels
#   --api-url URL        NodePrism API URL for auto-registration
#   --api-token TOKEN    Authentication token for API
#   --skip-register      Skip API registration
#   --list-types         List available agent types
#

set -e

# Agent type configurations
declare -A AGENT_VERSIONS=(
  ["node_exporter"]="1.7.0"
  ["mysql_exporter"]="0.15.1"
  ["nginx_exporter"]="1.1.0"
  ["redis_exporter"]="1.56.0"
  ["postgres_exporter"]="0.15.0"
  ["mongodb_exporter"]="0.40.0"
)

declare -A AGENT_PORTS=(
  ["node_exporter"]="9100"
  ["mysql_exporter"]="9104"
  ["nginx_exporter"]="9113"
  ["redis_exporter"]="9121"
  ["postgres_exporter"]="9187"
  ["mongodb_exporter"]="9216"
)

declare -A AGENT_API_TYPES=(
  ["node_exporter"]="NODE_EXPORTER"
  ["mysql_exporter"]="MYSQL_EXPORTER"
  ["nginx_exporter"]="NGINX_EXPORTER"
  ["redis_exporter"]="REDIS_EXPORTER"
  ["postgres_exporter"]="POSTGRES_EXPORTER"
  ["mongodb_exporter"]="MONGODB_EXPORTER"
)

declare -A AGENT_GITHUB_REPOS=(
  ["node_exporter"]="prometheus/node_exporter"
  ["mysql_exporter"]="prometheus/mysqld_exporter"
  ["nginx_exporter"]="nginx/nginx-prometheus-exporter"
  ["redis_exporter"]="oliver006/redis_exporter"
  ["postgres_exporter"]="prometheus-community/postgres_exporter"
  ["mongodb_exporter"]="percona/mongodb_exporter"
)

# Default configuration
AGENT_TYPE=""
AGENT_VERSION=""
LISTEN_PORT=""
HOSTNAME_LABEL="${HOSTNAME_LABEL:-$(hostname)}"
INSTALL_DIR="/usr/local/bin"

# API configuration
API_URL="${API_URL:-}"
API_TOKEN="${API_TOKEN:-}"
SKIP_REGISTER="${SKIP_REGISTER:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

list_agent_types() {
  echo "Available agent types:"
  echo ""
  for agent_type in "${!AGENT_VERSIONS[@]}"; do
    echo "  $agent_type"
    echo "    Default version: ${AGENT_VERSIONS[$agent_type]}"
    echo "    Default port: ${AGENT_PORTS[$agent_type]}"
    echo ""
  done
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --type)
      AGENT_TYPE="$2"
      shift 2
      ;;
    --version)
      AGENT_VERSION="$2"
      shift 2
      ;;
    --port)
      LISTEN_PORT="$2"
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
    --list-types)
      list_agent_types
      exit 0
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --type TYPE          Agent type (required)"
      echo "  --version VERSION    Agent version (optional)"
      echo "  --port PORT          Listen port (optional)"
      echo "  --hostname NAME      Hostname for labels"
      echo "  --api-url URL        NodePrism API URL for auto-registration"
      echo "  --api-token TOKEN    Authentication token for API"
      echo "  --skip-register      Skip API registration"
      echo "  --list-types         List available agent types"
      echo ""
      echo "Example:"
      echo "  $0 --type node_exporter --api-url http://manager:4000"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate agent type
if [[ -z "$AGENT_TYPE" ]]; then
  log_error "Agent type is required. Use --type to specify."
  echo "Use --list-types to see available agent types."
  exit 1
fi

if [[ -z "${AGENT_VERSIONS[$AGENT_TYPE]}" ]]; then
  log_error "Unknown agent type: $AGENT_TYPE"
  echo "Use --list-types to see available agent types."
  exit 1
fi

# Set defaults based on agent type
AGENT_VERSION="${AGENT_VERSION:-${AGENT_VERSIONS[$AGENT_TYPE]}}"
LISTEN_PORT="${LISTEN_PORT:-${AGENT_PORTS[$AGENT_TYPE]}}"
SERVICE_USER="${AGENT_TYPE}"
API_AGENT_TYPE="${AGENT_API_TYPES[$AGENT_TYPE]}"
GITHUB_REPO="${AGENT_GITHUB_REPOS[$AGENT_TYPE]}"

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
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    armv7l) ARCH="armv7" ;;
    i386|i686) ARCH="386" ;;
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

get_download_url() {
  local binary_name="$AGENT_TYPE"

  # Handle different naming conventions
  case $AGENT_TYPE in
    mysql_exporter)
      binary_name="mysqld_exporter"
      echo "https://github.com/${GITHUB_REPO}/releases/download/v${AGENT_VERSION}/${binary_name}-${AGENT_VERSION}.${OS}-${ARCH}.tar.gz"
      ;;
    nginx_exporter)
      echo "https://github.com/${GITHUB_REPO}/releases/download/v${AGENT_VERSION}/${binary_name}-${AGENT_VERSION}-${OS}-${ARCH}.tar.gz"
      ;;
    *)
      echo "https://github.com/${GITHUB_REPO}/releases/download/v${AGENT_VERSION}/${binary_name}-${AGENT_VERSION}.${OS}-${ARCH}.tar.gz"
      ;;
  esac
}

download_and_install() {
  local download_url
  download_url=$(get_download_url)
  local temp_dir
  temp_dir=$(mktemp -d)

  log_info "Downloading ${AGENT_TYPE} v${AGENT_VERSION}"
  log_info "URL: $download_url"

  if command -v curl &>/dev/null; then
    curl -sL "$download_url" -o "$temp_dir/agent.tar.gz"
  elif command -v wget &>/dev/null; then
    wget -q "$download_url" -O "$temp_dir/agent.tar.gz"
  else
    log_error "Neither curl nor wget found"
    exit 1
  fi

  log_info "Extracting archive"
  tar -xzf "$temp_dir/agent.tar.gz" -C "$temp_dir"

  # Find and install the binary
  local binary_name="$AGENT_TYPE"
  [[ "$AGENT_TYPE" == "mysql_exporter" ]] && binary_name="mysqld_exporter"

  local binary_path
  binary_path=$(find "$temp_dir" -name "$binary_name" -type f | head -1)

  if [[ -z "$binary_path" ]]; then
    log_error "Binary not found in archive"
    exit 1
  fi

  log_info "Installing binary to $INSTALL_DIR"
  cp "$binary_path" "$INSTALL_DIR/$AGENT_TYPE"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/$AGENT_TYPE"
  chmod +x "$INSTALL_DIR/$AGENT_TYPE"

  rm -rf "$temp_dir"
  log_info "${AGENT_TYPE} installed to $INSTALL_DIR/$AGENT_TYPE"
}

create_systemd_service() {
  log_info "Creating systemd service"

  local exec_args="--web.listen-address=:${LISTEN_PORT}"

  # Add agent-specific arguments
  case $AGENT_TYPE in
    node_exporter)
      exec_args="$exec_args --collector.systemd --collector.processes"
      ;;
    mysql_exporter)
      exec_args="$exec_args"
      ;;
  esac

  cat > "/etc/systemd/system/${AGENT_TYPE}.service" << EOF
[Unit]
Description=Prometheus ${AGENT_TYPE}
Wants=network-online.target
After=network-online.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
Type=simple
Restart=on-failure
RestartSec=5

NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

ExecStart=${INSTALL_DIR}/${AGENT_TYPE} ${exec_args}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  log_info "Systemd service created"
}

stop_existing_service() {
  if systemctl is-active --quiet "$AGENT_TYPE" 2>/dev/null; then
    log_info "Stopping existing $AGENT_TYPE service"
    systemctl stop "$AGENT_TYPE"
  fi
}

start_service() {
  log_info "Starting $AGENT_TYPE service"
  systemctl enable "$AGENT_TYPE"
  systemctl start "$AGENT_TYPE"

  sleep 2

  if systemctl is-active --quiet "$AGENT_TYPE"; then
    log_info "$AGENT_TYPE is running successfully"
  else
    log_error "$AGENT_TYPE failed to start"
    journalctl -u "$AGENT_TYPE" --no-pager -n 20
    exit 1
  fi
}

get_ip_address() {
  local ip=""
  if command -v hostname &>/dev/null; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  if [[ -z "$ip" ]] && command -v ip &>/dev/null; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
  fi
  [[ -z "$ip" ]] && ip="127.0.0.1"
  echo "$ip"
}

register_with_api() {
  if [[ "$SKIP_REGISTER" == "true" ]]; then
    log_info "Skipping API registration"
    return 0
  fi

  if [[ -z "$API_URL" ]]; then
    log_warn "No API URL provided. Skipping auto-registration."
    return 0
  fi

  log_info "Registering agent with NodePrism API..."

  local ip_address
  ip_address=$(get_ip_address)

  local payload
  payload=$(cat <<EOF
{
  "hostname": "${HOSTNAME_LABEL}",
  "ipAddress": "${ip_address}",
  "agentType": "${API_AGENT_TYPE}",
  "port": ${LISTEN_PORT},
  "version": "${AGENT_VERSION}"
}
EOF
)

  log_info "Registration: ${HOSTNAME_LABEL} (${ip_address}:${LISTEN_PORT})"

  local response http_code

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

  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
    log_info "Successfully registered with NodePrism!"
  elif [[ "$http_code" == "409" ]]; then
    log_warn "Agent already registered (updating existing)"
  else
    log_error "Failed to register with API (HTTP $http_code)"
    log_warn "You can manually register in the web UI"
  fi
}

main() {
  echo ""
  log_info "============================================"
  log_info "NodePrism - Agent Installer"
  log_info "============================================"
  log_info "Agent Type: ${AGENT_TYPE}"
  log_info "Version: ${AGENT_VERSION}"
  log_info "Port: ${LISTEN_PORT}"
  echo ""

  check_root
  detect_os
  stop_existing_service
  create_user
  download_and_install
  create_systemd_service
  start_service
  register_with_api

  echo ""
  log_info "============================================"
  log_info "Installation Complete!"
  log_info "============================================"
  log_info "Metrics URL: http://$(get_ip_address):${LISTEN_PORT}/metrics"
  log_info ""
  log_info "Useful commands:"
  log_info "  Status:   systemctl status $AGENT_TYPE"
  log_info "  Logs:     journalctl -u $AGENT_TYPE -f"
  log_info "  Restart:  systemctl restart $AGENT_TYPE"
  log_info "============================================"
}

main "$@"
