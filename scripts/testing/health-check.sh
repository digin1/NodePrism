#!/bin/bash
#
# NodePrism - Quick Health Check
# A fast way to verify all services are running
#
# Usage: ./health-check.sh
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "========================================"
echo "  NodePrism - Health Check"
echo "========================================"
echo ""

all_healthy=true

# First, try the enriched health endpoint
API_URL="${API_URL:-http://localhost:4000}"
echo -e "${CYAN}Checking API health endpoint...${NC}"
health_response=$(curl -s --max-time 5 "${API_URL}/health" 2>/dev/null)

if [ -n "$health_response" ] && echo "$health_response" | jq -e '.status' >/dev/null 2>&1; then
  status=$(echo "$health_response" | jq -r '.status')
  uptime=$(echo "$health_response" | jq -r '.uptime // "N/A"')

  if [ "$status" = "ok" ]; then
    echo -e "${GREEN}[OK]${NC}  API Status: $status (uptime: ${uptime}s)"
  else
    echo -e "${YELLOW}[DEGRADED]${NC}  API Status: $status"
    all_healthy=false
  fi

  # Show dependency details
  for dep in database redis prometheus; do
    dep_status=$(echo "$health_response" | jq -r ".dependencies.${dep}.status // \"unknown\"")
    dep_time=$(echo "$health_response" | jq -r ".dependencies.${dep}.responseTime // \"N/A\"")
    dep_error=$(echo "$health_response" | jq -r ".dependencies.${dep}.error // empty")

    if [ "$dep_status" = "ok" ]; then
      echo -e "${GREEN}[OK]${NC}  $dep (${dep_time}ms)"
    elif [ "$dep_status" = "down" ]; then
      echo -e "${RED}[FAIL]${NC} $dep (${dep_error})"
      all_healthy=false
    else
      echo -e "${YELLOW}[?]${NC}   $dep (unknown)"
    fi
  done
else
  echo -e "${RED}[FAIL]${NC} API (${API_URL}) - not responding"
  all_healthy=false
fi

echo ""

# Check additional services via port
declare -A SERVICES=(
  ["Web UI"]="localhost:3000"
  ["Grafana"]="localhost:3030"
  ["AlertManager"]="localhost:9093"
  ["Loki"]="localhost:3100"
  ["Pushgateway"]="localhost:9091"
)

for service in "${!SERVICES[@]}"; do
  address="${SERVICES[$service]}"
  host="${address%:*}"
  port="${address#*:}"

  if nc -z -w 2 "$host" "$port" 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC}  $service ($address)"
  else
    echo -e "${RED}[FAIL]${NC} $service ($address)"
    all_healthy=false
  fi
done

echo ""
echo "========================================"

if $all_healthy; then
  echo -e "${GREEN}All services are healthy!${NC}"
  exit 0
else
  echo -e "${YELLOW}Some services are not running or degraded.${NC}"
  echo "Run 'pnpm docker:up' to start Docker services"
  echo "Run 'pnpm run build && pnpm run start' to start application"
  exit 1
fi
