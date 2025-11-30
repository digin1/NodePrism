#!/bin/bash
#
# Veeble Node Vitals - Quick Health Check
# A fast way to verify all services are running
#
# Usage: ./health-check.sh
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Service URLs
declare -A SERVICES=(
  ["PostgreSQL"]="localhost:5432"
  ["Redis"]="localhost:6379"
  ["RabbitMQ"]="localhost:5672"
  ["RabbitMQ Management"]="localhost:15672"
  ["Prometheus"]="localhost:9090"
  ["Grafana"]="localhost:3030"
  ["Loki"]="localhost:3100"
  ["AlertManager"]="localhost:9093"
  ["API"]="localhost:3002"
  ["Web"]="localhost:3000"
)

echo ""
echo "========================================"
echo "  Veeble Node Vitals - Health Check"
echo "========================================"
echo ""

all_healthy=true

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
  echo -e "${YELLOW}Some services are not running.${NC}"
  echo "Run 'pnpm docker:up' to start Docker services"
  echo "Run 'pnpm dev' to start development servers"
  exit 1
fi
