#!/bin/bash
#
# Agent Uninstall Script for Veeble Node Vitals
# This script removes monitoring agents from the system
#
# Usage:
#   ./uninstall-agent.sh [AGENT_TYPE]
#
# Agent Types:
#   node_exporter - Remove Node Exporter
#   promtail      - Remove Promtail
#   all           - Remove all agents
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

AGENT_TYPE="${1:-all}"

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

uninstall_node_exporter() {
  log_info "Uninstalling Node Exporter..."

  # Stop and disable service
  if systemctl is-active --quiet node_exporter 2>/dev/null; then
    log_info "Stopping node_exporter service"
    systemctl stop node_exporter
  fi

  if systemctl is-enabled --quiet node_exporter 2>/dev/null; then
    log_info "Disabling node_exporter service"
    systemctl disable node_exporter
  fi

  # Remove files
  if [[ -f /etc/systemd/system/node_exporter.service ]]; then
    log_info "Removing systemd service file"
    rm -f /etc/systemd/system/node_exporter.service
    systemctl daemon-reload
  fi

  if [[ -f /usr/local/bin/node_exporter ]]; then
    log_info "Removing binary"
    rm -f /usr/local/bin/node_exporter
  fi

  # Remove user (optional, may want to keep for audit purposes)
  if id "node_exporter" &>/dev/null; then
    read -p "Remove node_exporter user? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      userdel node_exporter
      log_info "User node_exporter removed"
    fi
  fi

  log_info "Node Exporter uninstalled successfully"
}

uninstall_promtail() {
  log_info "Uninstalling Promtail..."

  # Stop and disable service
  if systemctl is-active --quiet promtail 2>/dev/null; then
    log_info "Stopping promtail service"
    systemctl stop promtail
  fi

  if systemctl is-enabled --quiet promtail 2>/dev/null; then
    log_info "Disabling promtail service"
    systemctl disable promtail
  fi

  # Remove files
  if [[ -f /etc/systemd/system/promtail.service ]]; then
    log_info "Removing systemd service file"
    rm -f /etc/systemd/system/promtail.service
    systemctl daemon-reload
  fi

  if [[ -f /usr/local/bin/promtail ]]; then
    log_info "Removing binary"
    rm -f /usr/local/bin/promtail
  fi

  if [[ -d /etc/promtail ]]; then
    log_info "Removing configuration directory"
    rm -rf /etc/promtail
  fi

  if [[ -d /var/lib/promtail ]]; then
    log_info "Removing data directory"
    rm -rf /var/lib/promtail
  fi

  # Remove user (optional)
  if id "promtail" &>/dev/null; then
    read -p "Remove promtail user? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      userdel promtail
      log_info "User promtail removed"
    fi
  fi

  log_info "Promtail uninstalled successfully"
}

main() {
  echo ""
  log_info "============================================"
  log_info "Veeble Node Vitals - Agent Uninstaller"
  log_info "============================================"
  echo ""

  check_root

  case "$AGENT_TYPE" in
    node_exporter)
      uninstall_node_exporter
      ;;
    promtail)
      uninstall_promtail
      ;;
    all)
      uninstall_node_exporter
      uninstall_promtail
      ;;
    *)
      log_error "Unknown agent type: $AGENT_TYPE"
      log_info "Valid types: node_exporter, promtail, all"
      exit 1
      ;;
  esac

  echo ""
  log_info "============================================"
  log_info "Uninstallation Complete!"
  log_info "============================================"
}

main "$@"
