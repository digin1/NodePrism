#!/bin/bash
#
# NodePrism - Simulation Script
# Demonstrates the full monitoring workflow with Docker containers
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

API_URL="${API_URL:-http://localhost:4000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log_step() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_info() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
}

# Check if nodeprism-network exists
check_network() {
  if ! docker network ls | grep -q nodeprism-network; then
    log_warn "Creating nodeprism-network..."
    docker network create --subnet=172.28.0.0/16 nodeprism-network
  fi
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

# Register servers with API
register_servers() {
  log_step "Registering Servers with API"

  # Get host IP for Docker containers
  HOST_IP=$(hostname -I | awk '{print $1}')

  # Server definitions
  declare -A SERVERS=(
    ["web-server-01"]="172.28.0.10:9101:PRODUCTION:web,nginx"
    ["web-server-02"]="172.28.0.11:9102:PRODUCTION:web,nginx"
    ["db-server-01"]="172.28.0.20:9103:PRODUCTION:database,postgres"
    ["cache-server-01"]="172.28.0.30:9104:PRODUCTION:cache,redis"
    ["staging-server-01"]="172.28.0.40:9105:STAGING:web,staging"
  )

  for hostname in "${!SERVERS[@]}"; do
    IFS=':' read -r ip port env tags <<< "${SERVERS[$hostname]}"

    # Use localhost with mapped port for API
    api_ip="127.0.0.1"

    log_info "Registering $hostname ($api_ip:$port)..."

    response=$(curl -s -X POST "${API_URL}/api/servers" \
      -H "Content-Type: application/json" \
      -d "{
        \"hostname\": \"$hostname\",
        \"ipAddress\": \"$api_ip\",
        \"sshPort\": $port,
        \"environment\": \"$env\",
        \"tags\": [\"$(echo $tags | sed 's/,/","/g')\"],
        \"metadata\": {\"simulation\": true, \"docker_ip\": \"$ip\"}
      }" 2>/dev/null)

    if echo "$response" | grep -q '"success":true'; then
      server_id=$(echo "$response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
      log_info "  → Created with ID: $server_id"
    elif echo "$response" | grep -q 'already exists'; then
      log_warn "  → Already exists, skipping"
    else
      log_error "  → Failed: $response"
    fi
  done
}

# Create Prometheus targets
create_prometheus_targets() {
  log_step "Creating Prometheus Targets"

  TARGETS_DIR="/home/digin/nodeprism-node-vitals/infrastructure/docker/prometheus/targets/node-exporter"
  mkdir -p "$TARGETS_DIR"

  cat > "$TARGETS_DIR/simulation.json" << 'EOF'
[
  {
    "targets": ["host.docker.internal:9101"],
    "labels": {
      "hostname": "web-server-01",
      "environment": "production",
      "server_type": "web",
      "simulation": "true"
    }
  },
  {
    "targets": ["host.docker.internal:9102"],
    "labels": {
      "hostname": "web-server-02",
      "environment": "production",
      "server_type": "web",
      "simulation": "true"
    }
  },
  {
    "targets": ["host.docker.internal:9103"],
    "labels": {
      "hostname": "db-server-01",
      "environment": "production",
      "server_type": "database",
      "simulation": "true"
    }
  },
  {
    "targets": ["host.docker.internal:9104"],
    "labels": {
      "hostname": "cache-server-01",
      "environment": "production",
      "server_type": "cache",
      "simulation": "true"
    }
  },
  {
    "targets": ["host.docker.internal:9105"],
    "labels": {
      "hostname": "staging-server-01",
      "environment": "staging",
      "server_type": "web",
      "simulation": "true"
    }
  }
]
EOF

  log_info "Created Prometheus targets at $TARGETS_DIR/simulation.json"

  # Try to reload Prometheus
  if curl -s -X POST "http://localhost:9090/-/reload" > /dev/null 2>&1; then
    log_info "Prometheus configuration reloaded"
  else
    log_warn "Could not reload Prometheus (may need manual restart)"
  fi
}

# Verify metrics are being collected
verify_metrics() {
  log_step "Verifying Metrics Collection"

  echo ""
  echo "Testing node_exporter endpoints directly:"

  for port in 9101 9102 9103 9104 9105; do
    if curl -s "http://localhost:$port/metrics" > /dev/null 2>&1; then
      log_info "Port $port: ✓ Responding"
    else
      log_error "Port $port: ✗ Not responding"
    fi
  done

  echo ""
  echo "Checking Prometheus targets:"

  targets=$(curl -s "http://localhost:9090/api/v1/targets" 2>/dev/null)
  active=$(echo "$targets" | grep -o '"health":"up"' | wc -l)
  total=$(echo "$targets" | grep -o '"health":' | wc -l)

  log_info "Prometheus targets: $active/$total up"
}

# Show sample metrics
show_metrics() {
  log_step "Sample Metrics"

  echo ""
  echo -e "${CYAN}CPU Usage (all servers):${NC}"
  curl -s "http://localhost:9090/api/v1/query?query=100-(avg%20by(hostname)(rate(node_cpu_seconds_total{mode=\"idle\"}[1m]))*100)" 2>/dev/null | \
    jq -r '.data.result[] | "  \(.metric.hostname): \(.value[1])%"' 2>/dev/null || echo "  (waiting for data...)"

  echo ""
  echo -e "${CYAN}Memory Usage (all servers):${NC}"
  curl -s "http://localhost:9090/api/v1/query?query=(1-node_memory_MemAvailable_bytes/node_memory_MemTotal_bytes)*100" 2>/dev/null | \
    jq -r '.data.result[] | "  \(.metric.instance): \(.value[1])%"' 2>/dev/null || echo "  (waiting for data...)"

  echo ""
  echo -e "${CYAN}Disk Usage (all servers):${NC}"
  curl -s "http://localhost:9090/api/v1/query?query=(1-node_filesystem_avail_bytes{fstype!~\"tmpfs|overlay\"}/node_filesystem_size_bytes)*100" 2>/dev/null | \
    jq -r '.data.result[] | "  \(.metric.instance) [\(.metric.mountpoint)]: \(.value[1])%"' 2>/dev/null | head -10 || echo "  (waiting for data...)"
}

# Print summary
print_summary() {
  log_step "Simulation Summary"

  echo ""
  echo -e "${GREEN}Simulation is running!${NC}"
  echo ""
  echo "Access Points:"
  echo -e "  ${CYAN}Web Dashboard:${NC}    http://localhost:3000/dashboard"
  echo -e "  ${CYAN}Servers List:${NC}     http://localhost:3000/servers"
  echo -e "  ${CYAN}API:${NC}              http://localhost:4000/api/servers"
  echo -e "  ${CYAN}Prometheus:${NC}       http://localhost:9090"
  echo -e "  ${CYAN}Grafana:${NC}          http://localhost:3030 (admin/admin)"
  echo ""
  echo "Simulated Servers:"
  echo "  • web-server-01    (localhost:9101)"
  echo "  • web-server-02    (localhost:9102)"
  echo "  • db-server-01     (localhost:9103)"
  echo "  • cache-server-01  (localhost:9104)"
  echo "  • staging-server-01 (localhost:9105)"
  echo ""
  echo "Commands:"
  echo "  Stop simulation:   cd simulation && docker compose down"
  echo "  View logs:         cd simulation && docker compose logs -f"
  echo ""
}

# Cleanup function
cleanup() {
  log_step "Cleaning Up Simulation"

  cd "$SCRIPT_DIR"
  docker compose down

  # Remove simulation targets
  rm -f /home/digin/nodeprism-node-vitals/infrastructure/docker/prometheus/targets/node-exporter/simulation.json

  log_info "Simulation stopped and cleaned up"
}

# Main
main() {
  case "${1:-start}" in
    start)
      echo ""
      echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
      echo -e "${BLUE}║   ${CYAN}NodePrism - Monitoring Simulation${BLUE}     ║${NC}"
      echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"

      check_network
      start_containers
      register_servers
      create_prometheus_targets
      sleep 5
      verify_metrics
      show_metrics
      print_summary
      ;;
    stop)
      cleanup
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
    *)
      echo "Usage: $0 {start|stop|status|metrics}"
      exit 1
      ;;
  esac
}

main "$@"
