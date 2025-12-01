#!/bin/bash
# ============================================
# NodePrism - Simulation Script
# ============================================
# Demonstrates the full monitoring workflow with Docker containers
# Updated for server: 66.85.173.55
# ============================================

set -e

# Load environment variables from root .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# Configuration
SERVER_IP="${SERVER_IP:-66.85.173.55}"
API_URL="${API_URL:-http://localhost:4000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
TARGETS_DIR="$PROJECT_ROOT/infrastructure/docker/prometheus/targets"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_info() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
  echo -e "${RED}[X]${NC} $1"
}

# Check if nodeprism-network exists
check_network() {
  if ! docker network ls | grep -q "docker_nodeprism-network"; then
    log_error "NodePrism network not found. Start the main infrastructure first:"
    echo "  cd $PROJECT_ROOT/infrastructure/docker && docker compose up -d"
    exit 1
  fi
  log_info "NodePrism network found"
}

# Start simulation containers
start_containers() {
  log_step "Starting Simulation Containers"

  cd "$SCRIPT_DIR"
  docker compose up -d

  sleep 3

  log_info "Started containers:"
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
}

# Stop simulation containers
stop_containers() {
  log_step "Stopping Simulation Containers"

  cd "$SCRIPT_DIR"
  docker compose down

  log_info "Simulation containers stopped"
}

# Create Prometheus targets for simulation servers
create_prometheus_targets() {
  log_step "Creating Prometheus Targets"

  mkdir -p "$TARGETS_DIR/simulation"

  cat > "$TARGETS_DIR/simulation/servers.json" << EOF
[
  {
    "targets": ["${SERVER_IP}:9200"],
    "labels": {
      "hostname": "web-server-01",
      "environment": "production",
      "server_type": "web",
      "region": "us-east-1",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9201"],
    "labels": {
      "hostname": "web-server-02",
      "environment": "production",
      "server_type": "web",
      "region": "us-east-1",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9202"],
    "labels": {
      "hostname": "db-server-01",
      "environment": "production",
      "server_type": "database",
      "region": "us-east-1",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9203"],
    "labels": {
      "hostname": "db-server-02",
      "environment": "production",
      "server_type": "database",
      "region": "us-west-2",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9204"],
    "labels": {
      "hostname": "cache-server-01",
      "environment": "production",
      "server_type": "cache",
      "region": "us-east-1",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9205"],
    "labels": {
      "hostname": "api-server-01",
      "environment": "production",
      "server_type": "api",
      "region": "us-east-1",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9206"],
    "labels": {
      "hostname": "worker-server-01",
      "environment": "production",
      "server_type": "worker",
      "region": "us-west-2",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9207"],
    "labels": {
      "hostname": "staging-server-01",
      "environment": "staging",
      "server_type": "web",
      "region": "us-east-1",
      "simulation": "true"
    }
  },
  {
    "targets": ["${SERVER_IP}:9208"],
    "labels": {
      "hostname": "dev-server-01",
      "environment": "development",
      "server_type": "web",
      "region": "us-east-1",
      "simulation": "true"
    }
  }
]
EOF

  log_info "Created Prometheus targets at $TARGETS_DIR/simulation/servers.json"

  # Try to reload Prometheus
  if curl -s -X POST "${PROMETHEUS_URL}/-/reload" > /dev/null 2>&1; then
    log_info "Prometheus configuration reloaded"
  else
    log_warn "Could not reload Prometheus (lifecycle API may be disabled)"
  fi
}

# Remove Prometheus targets
remove_prometheus_targets() {
  log_step "Removing Prometheus Targets"

  rm -rf "$TARGETS_DIR/simulation"

  # Try to reload Prometheus
  if curl -s -X POST "${PROMETHEUS_URL}/-/reload" > /dev/null 2>&1; then
    log_info "Prometheus configuration reloaded"
  fi

  log_info "Simulation targets removed"
}

# Verify metrics are being collected
verify_metrics() {
  log_step "Verifying Metrics Collection"

  echo ""
  echo "Testing node_exporter endpoints:"

  declare -A SERVERS=(
    ["web-server-01"]="9200"
    ["web-server-02"]="9201"
    ["db-server-01"]="9202"
    ["db-server-02"]="9203"
    ["cache-server-01"]="9204"
    ["api-server-01"]="9205"
    ["worker-server-01"]="9206"
    ["staging-server-01"]="9207"
    ["dev-server-01"]="9208"
  )

  for name in "${!SERVERS[@]}"; do
    port="${SERVERS[$name]}"
    if curl -s "http://localhost:$port/metrics" > /dev/null 2>&1; then
      log_info "$name (port $port): Responding"
    else
      log_error "$name (port $port): Not responding"
    fi
  done

  echo ""
  echo "Checking Prometheus targets:"

  targets=$(curl -s "${PROMETHEUS_URL}/api/v1/targets" 2>/dev/null)
  if [ -n "$targets" ]; then
    active=$(echo "$targets" | grep -o '"health":"up"' | wc -l)
    total=$(echo "$targets" | grep -o '"health":' | wc -l)
    log_info "Prometheus targets: $active/$total up"
  else
    log_warn "Could not query Prometheus"
  fi
}

# Show sample metrics
show_metrics() {
  log_step "Sample Metrics"

  echo ""
  echo -e "${CYAN}CPU Usage (simulation servers):${NC}"
  curl -s "${PROMETHEUS_URL}/api/v1/query?query=100-(avg%20by(hostname)(rate(node_cpu_seconds_total{mode=\"idle\",simulation=\"true\"}[1m]))*100)" 2>/dev/null | \
    jq -r '.data.result[] | "  \(.metric.hostname): \(.value[1] | tonumber | . * 100 | round / 100)%"' 2>/dev/null || echo "  (waiting for data...)"

  echo ""
  echo -e "${CYAN}Memory Usage (simulation servers):${NC}"
  curl -s "${PROMETHEUS_URL}/api/v1/query?query=(1-node_memory_MemAvailable_bytes{simulation=\"true\"}/node_memory_MemTotal_bytes{simulation=\"true\"})*100" 2>/dev/null | \
    jq -r '.data.result[] | "  \(.metric.hostname): \(.value[1] | tonumber | . * 100 | round / 100)%"' 2>/dev/null || echo "  (waiting for data...)"
}

# Print summary
print_summary() {
  log_step "Simulation Summary"

  echo ""
  echo -e "${GREEN}Simulation is running!${NC}"
  echo ""
  echo "Server IP: ${SERVER_IP}"
  echo ""
  echo "Access Points:"
  echo -e "  ${CYAN}Web Dashboard:${NC}    http://${SERVER_IP}:3000/dashboard"
  echo -e "  ${CYAN}Servers List:${NC}     http://${SERVER_IP}:3000/servers"
  echo -e "  ${CYAN}API:${NC}              http://${SERVER_IP}:4000/api/servers"
  echo -e "  ${CYAN}Prometheus:${NC}       http://${SERVER_IP}:9090"
  echo -e "  ${CYAN}Grafana:${NC}          http://${SERVER_IP}:3030 (admin/admin123)"
  echo ""
  echo "Simulated Servers (ports 9200-9208):"
  echo "  Production:"
  echo "    - web-server-01     (${SERVER_IP}:9200) - Web"
  echo "    - web-server-02     (${SERVER_IP}:9201) - Web"
  echo "    - db-server-01      (${SERVER_IP}:9202) - Database"
  echo "    - db-server-02      (${SERVER_IP}:9203) - Database"
  echo "    - cache-server-01   (${SERVER_IP}:9204) - Cache"
  echo "    - api-server-01     (${SERVER_IP}:9205) - API"
  echo "    - worker-server-01  (${SERVER_IP}:9206) - Worker"
  echo "  Staging:"
  echo "    - staging-server-01 (${SERVER_IP}:9207) - Web"
  echo "  Development:"
  echo "    - dev-server-01     (${SERVER_IP}:9208) - Web"
  echo ""
  echo "Commands:"
  echo "  Stop simulation:   $0 stop"
  echo "  View status:       $0 status"
  echo "  Show metrics:      $0 metrics"
  echo ""
}

# Main
main() {
  case "${1:-start}" in
    start)
      echo ""
      echo -e "${BLUE}================================================${NC}"
      echo -e "${BLUE}   ${CYAN}NodePrism - Monitoring Simulation${BLUE}          ${NC}"
      echo -e "${BLUE}================================================${NC}"

      check_network
      start_containers
      create_prometheus_targets
      sleep 5
      verify_metrics
      print_summary
      ;;
    stop)
      stop_containers
      remove_prometheus_targets
      log_info "Simulation stopped and cleaned up"
      ;;
    status)
      log_step "Simulation Status"
      cd "$SCRIPT_DIR"
      docker compose ps
      verify_metrics
      ;;
    metrics)
      show_metrics
      ;;
    restart)
      $0 stop
      sleep 2
      $0 start
      ;;
    *)
      echo "Usage: $0 {start|stop|status|metrics|restart}"
      echo ""
      echo "Commands:"
      echo "  start   - Start simulation containers and configure Prometheus"
      echo "  stop    - Stop simulation and remove Prometheus targets"
      echo "  status  - Show container status and verify metrics"
      echo "  metrics - Display sample metrics from Prometheus"
      echo "  restart - Stop and start simulation"
      exit 1
      ;;
  esac
}

main "$@"
