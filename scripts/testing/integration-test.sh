#!/bin/bash
#
# NodePrism - Integration Test Suite
# This script tests all components of the monitoring system
#
# Usage: ./integration-test.sh [--quick|--full]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="${API_URL:-http://localhost:3002}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3030}"
TEST_MODE="${1:-quick}"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((TESTS_FAILED++))
}

log_skip() {
  echo -e "${YELLOW}[SKIP]${NC} $1"
  ((TESTS_SKIPPED++))
}

log_section() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

# Check if a service is running
check_service() {
  local name=$1
  local url=$2
  local endpoint="${3:-}"

  if curl -s --max-time 5 "${url}${endpoint}" > /dev/null 2>&1; then
    log_success "$name is running at $url"
    return 0
  else
    log_fail "$name is not accessible at $url"
    return 1
  fi
}

# Check HTTP status code
check_http_status() {
  local name=$1
  local url=$2
  local expected_code=$3

  local status_code
  status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

  if [[ "$status_code" == "$expected_code" ]]; then
    log_success "$name returned HTTP $status_code"
    return 0
  else
    log_fail "$name returned HTTP $status_code (expected $expected_code)"
    return 1
  fi
}

# Check JSON response
check_json_response() {
  local name=$1
  local url=$2
  local jq_filter=$3
  local expected=$4

  local response
  response=$(curl -s --max-time 10 "$url" 2>/dev/null)

  if ! echo "$response" | jq . > /dev/null 2>&1; then
    log_fail "$name did not return valid JSON"
    return 1
  fi

  local actual
  actual=$(echo "$response" | jq -r "$jq_filter" 2>/dev/null)

  if [[ "$actual" == "$expected" ]]; then
    log_success "$name: $jq_filter = $expected"
    return 0
  else
    log_fail "$name: $jq_filter = $actual (expected $expected)"
    return 1
  fi
}

# Test API endpoints
test_api() {
  log_section "Testing API Endpoints"

  # Health check
  check_http_status "API Health" "${API_URL}/health" "200" || true

  # Server endpoints
  check_http_status "GET /api/servers" "${API_URL}/api/servers" "200" || true
  check_json_response "Servers list" "${API_URL}/api/servers" ".success" "true" || true

  # Server stats
  check_http_status "GET /api/servers/stats/overview" "${API_URL}/api/servers/stats/overview" "200" || true

  # Alerts endpoints
  check_http_status "GET /api/alerts" "${API_URL}/api/alerts" "200" || true
  check_json_response "Alerts list" "${API_URL}/api/alerts" ".success" "true" || true

  # Alert rules
  check_http_status "GET /api/alerts/rules" "${API_URL}/api/alerts/rules" "200" || true

  # Alert stats
  check_http_status "GET /api/alerts/stats" "${API_URL}/api/alerts/stats" "200" || true

  # Metrics proxy
  check_http_status "GET /api/metrics/query" "${API_URL}/api/metrics/query?query=up" "200" || true
}

# Test Web UI
test_web() {
  log_section "Testing Web UI"

  check_service "Web UI" "$WEB_URL" "/" || true
  check_http_status "Dashboard page" "${WEB_URL}/dashboard" "200" || true
  check_http_status "Servers page" "${WEB_URL}/servers" "200" || true
  check_http_status "Alerts page" "${WEB_URL}/alerts" "200" || true
}

# Test Docker services
test_docker_services() {
  log_section "Testing Docker Services"

  # Check if Docker is available
  if ! command -v docker &> /dev/null; then
    log_skip "Docker not available, skipping container tests"
    return
  fi

  # PostgreSQL
  if docker ps | grep -q nodeprism-postgres; then
    log_success "PostgreSQL container is running"
  else
    log_fail "PostgreSQL container is not running"
  fi

  # Redis
  if docker ps | grep -q nodeprism-redis; then
    log_success "Redis container is running"
  else
    log_fail "Redis container is not running"
  fi

  # Prometheus
  if docker ps | grep -q nodeprism-prometheus; then
    log_success "Prometheus container is running"
    check_service "Prometheus" "$PROMETHEUS_URL" "/-/healthy" || true
  else
    log_fail "Prometheus container is not running"
  fi

  # Grafana
  if docker ps | grep -q nodeprism-grafana; then
    log_success "Grafana container is running"
    check_service "Grafana" "$GRAFANA_URL" "/api/health" || true
  else
    log_fail "Grafana container is not running"
  fi

  # Loki
  if docker ps | grep -q nodeprism-loki; then
    log_success "Loki container is running"
  else
    log_fail "Loki container is not running"
  fi

  # AlertManager
  if docker ps | grep -q nodeprism-alertmanager; then
    log_success "AlertManager container is running"
  else
    log_fail "AlertManager container is not running"
  fi
}

# Test database connectivity
test_database() {
  log_section "Testing Database Connectivity"

  if ! command -v docker &> /dev/null; then
    log_skip "Docker not available, skipping database tests"
    return
  fi

  # Test PostgreSQL connection
  if docker exec nodeprism-postgres pg_isready -U nodeprism > /dev/null 2>&1; then
    log_success "PostgreSQL is accepting connections"
  else
    log_fail "PostgreSQL is not accepting connections"
  fi

  # Test Redis connection
  if docker exec nodeprism-redis redis-cli ping | grep -q PONG; then
    log_success "Redis is responding to PING"
  else
    log_fail "Redis is not responding"
  fi
}

# Test Prometheus metrics
test_prometheus() {
  log_section "Testing Prometheus Metrics"

  # Check if Prometheus is up
  if ! check_service "Prometheus API" "$PROMETHEUS_URL" "/api/v1/status/config" 2>/dev/null; then
    log_skip "Prometheus not available, skipping metrics tests"
    return
  fi

  # Check targets
  local targets_response
  targets_response=$(curl -s "${PROMETHEUS_URL}/api/v1/targets" 2>/dev/null)

  if echo "$targets_response" | jq -e '.status == "success"' > /dev/null 2>&1; then
    local active_targets
    active_targets=$(echo "$targets_response" | jq '.data.activeTargets | length')
    log_success "Prometheus has $active_targets active targets"
  else
    log_fail "Could not get Prometheus targets"
  fi

  # Test a basic query
  local query_response
  query_response=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=up" 2>/dev/null)

  if echo "$query_response" | jq -e '.status == "success"' > /dev/null 2>&1; then
    log_success "Prometheus query 'up' executed successfully"
  else
    log_fail "Prometheus query failed"
  fi
}

# Test CRUD operations (full mode only)
test_crud_operations() {
  log_section "Testing CRUD Operations"

  if [[ "$TEST_MODE" != "full" ]]; then
    log_skip "CRUD tests skipped in quick mode (use --full)"
    return
  fi

  local test_server_id=""

  # Create a test server
  log_info "Creating test server..."
  local create_response
  create_response=$(curl -s -X POST "${API_URL}/api/servers" \
    -H "Content-Type: application/json" \
    -d '{
      "hostname": "test-server-integration",
      "ipAddress": "10.255.255.1",
      "sshPort": 22,
      "environment": "DEVELOPMENT",
      "tags": ["test", "integration"]
    }' 2>/dev/null)

  if echo "$create_response" | jq -e '.success == true' > /dev/null 2>&1; then
    test_server_id=$(echo "$create_response" | jq -r '.data.id')
    log_success "Created test server with ID: $test_server_id"
  else
    log_fail "Failed to create test server"
    return
  fi

  # Read the server
  log_info "Reading test server..."
  if check_json_response "Get server" "${API_URL}/api/servers/${test_server_id}" ".success" "true"; then
    log_success "Successfully read test server"
  fi

  # Update the server
  log_info "Updating test server..."
  local update_response
  update_response=$(curl -s -X PUT "${API_URL}/api/servers/${test_server_id}" \
    -H "Content-Type: application/json" \
    -d '{"region": "test-region"}' 2>/dev/null)

  if echo "$update_response" | jq -e '.success == true' > /dev/null 2>&1; then
    log_success "Updated test server"
  else
    log_fail "Failed to update test server"
  fi

  # Delete the server
  log_info "Deleting test server..."
  local delete_response
  delete_response=$(curl -s -X DELETE "${API_URL}/api/servers/${test_server_id}" 2>/dev/null)

  if echo "$delete_response" | jq -e '.success == true' > /dev/null 2>&1; then
    log_success "Deleted test server"
  else
    log_fail "Failed to delete test server"
  fi
}

# Print summary
print_summary() {
  log_section "Test Summary"

  local total=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))

  echo -e "Total tests: $total"
  echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
  echo -e "${RED}Failed: $TESTS_FAILED${NC}"
  echo -e "${YELLOW}Skipped: $TESTS_SKIPPED${NC}"
  echo ""

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}Some tests failed!${NC}"
    return 1
  fi
}

# Main
main() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  NodePrism - Integration Tests${NC}"
  echo -e "${BLUE}  Mode: $TEST_MODE${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""

  # Run tests
  test_docker_services
  test_database
  test_api
  test_web
  test_prometheus
  test_crud_operations

  # Print summary
  print_summary
}

main "$@"
