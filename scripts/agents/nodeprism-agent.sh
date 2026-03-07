#!/bin/bash
#
# NodePrism Agent Manager
# Install, uninstall, and manage monitoring agents on your servers.
#
# Usage:
#   sudo ./nodeprism-agent.sh                    # Interactive main menu
#   sudo ./nodeprism-agent.sh install            # Install an agent
#   sudo ./nodeprism-agent.sh uninstall          # Uninstall an agent
#   sudo ./nodeprism-agent.sh status             # Show agent status
#   sudo ./nodeprism-agent.sh install --non-interactive --type node_exporter
#

set -e

# ─── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Globals ──────────────────────────────────────────────────────────
INSTALL_DIR="/usr/local/bin"
NON_INTERACTIVE=false
COMMAND=""

# API registration
API_URL=""
API_TOKEN=""
SKIP_REGISTER=false

# Pre-set values (for non-interactive mode)
PRESET_TYPE=""
PRESET_PORT=""
PRESET_HOSTNAME=""
PRESET_LOG_DIR=""

# ─── Logging ──────────────────────────────────────────────────────────
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}\n"; }

# ─── Agent Definitions ────────────────────────────────────────────────
declare -A AGENT_DISPLAY_NAMES=(
  ["node_exporter"]="Node Exporter (System Metrics)"
  ["mysql_exporter"]="MySQL Exporter"
  ["postgres_exporter"]="PostgreSQL Exporter"
  ["mongodb_exporter"]="MongoDB Exporter"
  ["nginx_exporter"]="Nginx Exporter"
  ["redis_exporter"]="Redis Exporter"
  ["promtail"]="Promtail (Log Collector)"
)

declare -A AGENT_DEFAULT_PORTS=(
  ["node_exporter"]="9100"
  ["mysql_exporter"]="9104"
  ["postgres_exporter"]="9187"
  ["mongodb_exporter"]="9216"
  ["nginx_exporter"]="9113"
  ["redis_exporter"]="9121"
  ["promtail"]="9080"
)

declare -A AGENT_DEFAULT_VERSIONS=(
  ["node_exporter"]="1.7.0"
  ["mysql_exporter"]="0.15.1"
  ["postgres_exporter"]="0.15.0"
  ["mongodb_exporter"]="0.40.0"
  ["nginx_exporter"]="1.1.0"
  ["redis_exporter"]="1.56.0"
  ["promtail"]="2.9.3"
)

declare -A AGENT_API_TYPES=(
  ["node_exporter"]="NODE_EXPORTER"
  ["mysql_exporter"]="MYSQL_EXPORTER"
  ["postgres_exporter"]="POSTGRES_EXPORTER"
  ["mongodb_exporter"]="MONGODB_EXPORTER"
  ["nginx_exporter"]="NGINX_EXPORTER"
  ["redis_exporter"]="REDIS_EXPORTER"
  ["promtail"]="PROMTAIL"
)

declare -A AGENT_GITHUB_REPOS=(
  ["node_exporter"]="prometheus/node_exporter"
  ["mysql_exporter"]="prometheus/mysqld_exporter"
  ["postgres_exporter"]="prometheus-community/postgres_exporter"
  ["mongodb_exporter"]="percona/mongodb_exporter"
  ["nginx_exporter"]="nginx/nginx-prometheus-exporter"
  ["redis_exporter"]="oliver006/redis_exporter"
  ["promtail"]="grafana/loki"
)

declare -A AGENT_ENV_FILES=(
  ["mysql_exporter"]="/etc/mysql_exporter.env"
  ["postgres_exporter"]="/etc/postgres_exporter.env"
  ["mongodb_exporter"]="/etc/mongodb_exporter.env"
  ["redis_exporter"]="/etc/redis_exporter.env"
)

declare -A AGENT_CONFIG_DIRS=(
  ["promtail"]="/etc/promtail"
)

declare -A AGENT_DATA_DIRS=(
  ["promtail"]="/var/lib/promtail"
  ["node_exporter"]="/var/lib/node_exporter"
)

AGENT_TYPES_ORDERED=(
  "node_exporter"
  "mysql_exporter"
  "postgres_exporter"
  "mongodb_exporter"
  "nginx_exporter"
  "redis_exporter"
  "promtail"
)

# ─── Parse CLI Args ──────────────────────────────────────────────────
parse_args() {
  # First arg can be a command
  if [[ $# -gt 0 && ! "$1" =~ ^-- ]]; then
    COMMAND="$1"
    shift
  fi

  while [[ $# -gt 0 ]]; do
    case $1 in
      --non-interactive) NON_INTERACTIVE=true; shift ;;
      --type)            PRESET_TYPE="$2"; shift 2 ;;
      --port)            PRESET_PORT="$2"; shift 2 ;;
      --hostname)        PRESET_HOSTNAME="$2"; shift 2 ;;
      --log-dir)         PRESET_LOG_DIR="$2"; shift 2 ;;
      --api-url)         API_URL="$2"; shift 2 ;;
      --api-token)       API_TOKEN="$2"; shift 2 ;;
      --skip-register)   SKIP_REGISTER=true; shift ;;
      --help|-h)
        print_help
        exit 0
        ;;
      *) log_error "Unknown option: $1"; exit 1 ;;
    esac
  done
}

print_help() {
  echo "Usage: sudo $0 [COMMAND] [OPTIONS]"
  echo ""
  echo "Commands:"
  echo "  install       Install a monitoring agent"
  echo "  uninstall     Remove an installed agent"
  echo "  status        Show status of installed agents"
  echo "  (none)        Interactive main menu"
  echo ""
  echo "Options (install):"
  echo "  --non-interactive    Skip prompts, use defaults or provided values"
  echo "  --type TYPE          Agent type (node_exporter, mysql_exporter, etc.)"
  echo "  --port PORT          Listen port"
  echo "  --hostname NAME      Hostname label"
  echo "  --log-dir DIR        Custom log directory (for promtail)"
  echo "  --api-url URL        NodePrism manager URL for auto-registration"
  echo "  --api-token TOKEN    Auth token for API"
  echo "  --skip-register      Skip API registration"
  echo ""
  echo "Options (uninstall):"
  echo "  --type TYPE          Agent to remove (or 'all')"
  echo "  --non-interactive    Skip confirmation prompts"
  echo ""
  echo "Examples:"
  echo "  sudo $0                                                # Interactive menu"
  echo "  sudo $0 install                                        # Interactive install"
  echo "  sudo $0 install --non-interactive --type node_exporter # Quick install"
  echo "  sudo $0 install --type mysql_exporter --api-url http://manager:4000"
  echo "  sudo $0 uninstall --type node_exporter                 # Remove specific agent"
  echo "  sudo $0 uninstall --type all                           # Remove all agents"
  echo "  sudo $0 status                                         # Show all agent status"
}

# ─── Helpers ──────────────────────────────────────────────────────────
prompt() {
  local var_name="$1"
  local prompt_text="$2"
  local default_val="$3"

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    eval "$var_name=\"$default_val\""
    return
  fi

  local display_default=""
  [[ -n "$default_val" ]] && display_default=" ${DIM}[${default_val}]${NC}"

  echo -en "  ${prompt_text}${display_default}: "
  local input
  read -r input
  if [[ -z "$input" ]]; then
    eval "$var_name=\"$default_val\""
  else
    eval "$var_name=\"$input\""
  fi
}

prompt_yn() {
  local prompt_text="$1"
  local default="${2:-n}"

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    [[ "$default" == "y" ]] && return 0 || return 1
  fi

  local hint="y/N"
  [[ "$default" == "y" ]] && hint="Y/n"

  echo -en "  ${prompt_text} [${hint}]: "
  local input
  read -r input
  input="${input:-$default}"
  [[ "$input" =~ ^[Yy] ]]
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
    x86_64)        ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    armv7l)        ARCH="armv7" ;;
    i386|i686)     ARCH="386" ;;
    *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
  esac
}

# Gather detailed OS/system information for registration
gather_system_info() {
  # Kernel
  OS_KERNEL=$(uname -r 2>/dev/null || echo "unknown")
  OS_ARCH_RAW=$(uname -m 2>/dev/null || echo "unknown")

  # Distribution detection
  OS_DISTRO="unknown"
  OS_DISTRO_VERSION=""
  OS_DISTRO_CODENAME=""
  OS_DISTRO_ID=""

  if [[ -f /etc/os-release ]]; then
    # Parse rather than source to avoid executing arbitrary code
    OS_DISTRO=$(grep -m1 '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"')
    [[ -z "$OS_DISTRO" ]] && OS_DISTRO=$(grep -m1 '^NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"')
    OS_DISTRO_VERSION=$(grep -m1 '^VERSION_ID=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"')
    OS_DISTRO_CODENAME=$(grep -m1 '^VERSION_CODENAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"')
    OS_DISTRO_ID=$(grep -m1 '^ID=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"')
  elif [[ -f /etc/redhat-release ]]; then
    OS_DISTRO=$(cat /etc/redhat-release)
  elif [[ -f /etc/debian_version ]]; then
    OS_DISTRO="Debian $(cat /etc/debian_version)"
    OS_DISTRO_ID="debian"
  elif command -v lsb_release &>/dev/null; then
    OS_DISTRO=$(lsb_release -ds 2>/dev/null || echo "unknown")
  fi

  # CPU info
  OS_CPU_MODEL=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ //' || echo "unknown")
  OS_CPU_CORES=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "0")

  # Memory (total in bytes)
  OS_MEMORY_TOTAL=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2 * 1024}' || echo "0")

  # Uptime
  OS_UPTIME=$(cat /proc/uptime 2>/dev/null | awk '{print int($1)}' || echo "0")

  # Virtualization
  OS_VIRT="physical"
  if [[ -f /sys/class/dmi/id/product_name ]]; then
    local product
    product=$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo "")
    case "$product" in
      *Virtual*|*VMware*) OS_VIRT="vmware" ;;
      *KVM*)              OS_VIRT="kvm" ;;
      *VirtualBox*)       OS_VIRT="virtualbox" ;;
      *Xen*)              OS_VIRT="xen" ;;
      *Droplet*)          OS_VIRT="digitalocean" ;;
    esac
  fi
  if [[ -d /proc/xen ]] && [[ "$OS_VIRT" == "physical" ]]; then
    OS_VIRT="xen"
  fi
  # OpenVZ/Virtuozzo: /proc/vz exists in containers, /proc/bc only on host node
  if [[ -d /proc/vz ]] && [[ ! -d /proc/bc ]]; then
    OS_VIRT="openvz"
  fi
  # LXC/LXD containers
  if grep -q 'lxc\|lxd' /proc/1/cgroup 2>/dev/null || [[ -f /dev/lxd/sock ]]; then
    OS_VIRT="lxc"
  fi
  if grep -q docker /proc/1/cgroup 2>/dev/null || [[ -f /.dockerenv ]]; then
    OS_VIRT="docker"
  fi
  # systemd-detect-virt covers Virtuozzo 7+, Hyper-V, and others
  if command -v systemd-detect-virt &>/dev/null && [[ "$OS_VIRT" == "physical" ]]; then
    local sdv
    sdv=$(systemd-detect-virt 2>/dev/null || echo "none")
    case "$sdv" in
      openvz)       OS_VIRT="openvz" ;;
      virtuozzo)    OS_VIRT="virtuozzo" ;;
      lxc|lxc-libvirt) OS_VIRT="lxc" ;;
      microsoft)    OS_VIRT="hyperv" ;;
      oracle)       OS_VIRT="virtualbox" ;;
      none)         ;; # keep physical
      *)            [[ "$sdv" != "none" ]] && OS_VIRT="$sdv" ;;
    esac
  fi
  # Cloud detection
  if command -v dmidecode &>/dev/null; then
    local sys_vendor
    sys_vendor=$(dmidecode -s system-manufacturer 2>/dev/null || echo "")
    case "$sys_vendor" in
      *Amazon*)    OS_VIRT="aws" ;;
      *Google*)    OS_VIRT="gcp" ;;
      *Microsoft*) OS_VIRT="azure" ;;
    esac
  fi

  # Control panel detection
  OS_PANEL=""
  if [[ -d /usr/local/cpanel ]]; then
    OS_PANEL="cpanel"
    local cpanel_ver
    cpanel_ver=$(cat /usr/local/cpanel/version 2>/dev/null || echo "")
    [[ -n "$cpanel_ver" ]] && OS_PANEL="cpanel/$cpanel_ver"
  elif [[ -d /usr/local/psa ]]; then
    OS_PANEL="plesk"
    local plesk_ver
    plesk_ver=$(cat /usr/local/psa/version 2>/dev/null | awk '{print $1}' || echo "")
    [[ -n "$plesk_ver" ]] && OS_PANEL="plesk/$plesk_ver"
  elif [[ -d /usr/local/directadmin ]]; then
    OS_PANEL="directadmin"
  elif [[ -d /usr/share/webmin ]]; then
    OS_PANEL="webmin"
  elif [[ -d /usr/local/cwpsrv ]]; then
    OS_PANEL="cwp"
  elif [[ -d /usr/local/hestiacp ]]; then
    OS_PANEL="hestiacp"
  elif [[ -d /usr/local/vesta ]]; then
    OS_PANEL="vestacp"
  elif [[ -d /usr/local/cyberpanel ]]; then
    OS_PANEL="cyberpanel"
  elif command -v aapanel &>/dev/null || [[ -d /www/server/panel ]]; then
    OS_PANEL="aapanel"
  fi
}

# Gather container/VM list from host (KVM, OpenVZ, Virtuozzo)
# Outputs JSON array to stdout
gather_containers() {
  local containers="[]"
  local virt_type=""

  # Detect what virtualization host tools are available
  if command -v virsh &>/dev/null; then
    virt_type="kvm"
  elif command -v prlctl &>/dev/null; then
    virt_type="virtuozzo"
  elif command -v vzlist &>/dev/null; then
    virt_type="openvz"
  fi

  [[ -z "$virt_type" ]] && echo "$containers" && return

  local json_entries=()

  case "$virt_type" in
    kvm)
      # List all KVM domains
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local vm_id vm_name vm_state
        vm_id=$(echo "$line" | awk '{print $1}')
        vm_name=$(echo "$line" | awk '{print $2}')
        vm_state=$(echo "$line" | awk '{$1=""; $2=""; print}' | sed 's/^ *//')

        [[ -z "$vm_name" || "$vm_name" == "Name" ]] && continue

        local status="stopped"
        case "$vm_state" in
          *running*)  status="running" ;;
          *paused*)   status="paused" ;;
          *shut*)     status="stopped" ;;
          *crashed*)  status="crashed" ;;
        esac

        # Get VM UUID as containerId
        local vm_uuid
        vm_uuid=$(virsh domuuid "$vm_name" 2>/dev/null || echo "$vm_id")

        # Get IP address (requires guest agent or DHCP lease)
        local vm_ip=""
        if [[ "$status" == "running" ]]; then
          vm_ip=$(virsh domifaddr "$vm_name" 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1 || echo "")
        fi

        # Get network stats from host-side interfaces
        local rx_bytes=0 tx_bytes=0
        local ifaces
        ifaces=$(virsh domiflist "$vm_name" 2>/dev/null | awk 'NR>2 && $1!="" {print $1}')
        for iface in $ifaces; do
          local stats
          stats=$(virsh domifstat "$vm_name" "$iface" 2>/dev/null || echo "")
          local rx tx
          rx=$(echo "$stats" | grep 'rx_bytes' | awk '{print $2}')
          tx=$(echo "$stats" | grep 'tx_bytes' | awk '{print $2}')
          rx_bytes=$((rx_bytes + ${rx:-0}))
          tx_bytes=$((tx_bytes + ${tx:-0}))
        done

        # Get VM metadata (vCPUs, memory)
        local vcpus mem_kb
        vcpus=$(virsh vcpucount "$vm_name" --current 2>/dev/null || echo "0")
        mem_kb=$(virsh dominfo "$vm_name" 2>/dev/null | grep 'Max memory' | awk '{print $3}' || echo "0")

        local name_escaped
        name_escaped=$(echo "$vm_name" | sed 's/"/\\"/g')

        json_entries+=("{\"containerId\":\"${vm_uuid}\",\"name\":\"${name_escaped}\",\"type\":\"kvm\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$vm_ip" ] && echo "\"$vm_ip\"" || echo "null"),\"hostname\":null,\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{\"vcpus\":${vcpus:-0},\"memoryKB\":${mem_kb:-0}}}")
      done < <(virsh list --all 2>/dev/null | tail -n +3)
      ;;

    openvz)
      # List all OpenVZ containers
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local ctid ct_hostname ct_ip ct_status
        ctid=$(echo "$line" | awk '{print $1}')
        ct_ip=$(echo "$line" | awk '{print $2}')
        ct_hostname=$(echo "$line" | awk '{print $3}')
        ct_status=$(echo "$line" | awk '{print $4}')

        [[ -z "$ctid" || "$ctid" == "CTID" ]] && continue

        local status="stopped"
        [[ "$ct_status" == "running" ]] && status="running"

        [[ "$ct_ip" == "-" ]] && ct_ip=""
        [[ "$ct_hostname" == "-" ]] && ct_hostname=""

        # Get network stats from host-side veth interface
        local rx_bytes=0 tx_bytes=0
        local veth_if="veth${ctid}.0"
        if [[ -d "/sys/class/net/${veth_if}/statistics" ]]; then
          rx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/rx_bytes" 2>/dev/null || echo "0")
          tx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/tx_bytes" 2>/dev/null || echo "0")
        fi

        local hostname_escaped
        hostname_escaped=$(echo "$ct_hostname" | sed 's/"/\\"/g')

        json_entries+=("{\"containerId\":\"${ctid}\",\"name\":\"CT${ctid}\",\"type\":\"openvz\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$ct_ip" ] && echo "\"$ct_ip\"" || echo "null"),\"hostname\":$([ -n "$ct_hostname" ] && echo "\"$hostname_escaped\"" || echo "null"),\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{}}")
      done < <(vzlist -a -o ctid,ip,hostname,status -H 2>/dev/null)
      ;;

    virtuozzo)
      # List all Virtuozzo containers/VMs
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local ct_uuid ct_status ct_ip ct_name
        ct_uuid=$(echo "$line" | awk '{print $1}')
        ct_status=$(echo "$line" | awk '{print $2}')
        ct_ip=$(echo "$line" | awk '{print $3}')
        ct_name=$(echo "$line" | awk '{$1=""; $2=""; $3=""; print}' | sed 's/^ *//')

        [[ -z "$ct_uuid" || "$ct_uuid" == "UUID" ]] && continue

        local status="stopped"
        [[ "$ct_status" == "running" ]] && status="running"
        [[ "$ct_status" == "suspended" ]] && status="paused"

        [[ "$ct_ip" == "-" ]] && ct_ip=""
        [[ "$ct_name" == "-" ]] && ct_name="$ct_uuid"

        # Get network stats from host-side veth
        local rx_bytes=0 tx_bytes=0
        local short_uuid="${ct_uuid:0:8}"
        for netdir in /sys/class/net/veth*; do
          local ifname
          ifname=$(basename "$netdir" 2>/dev/null)
          if [[ "$ifname" == *"$short_uuid"* ]]; then
            local rx tx
            rx=$(cat "$netdir/statistics/rx_bytes" 2>/dev/null || echo "0")
            tx=$(cat "$netdir/statistics/tx_bytes" 2>/dev/null || echo "0")
            rx_bytes=$((rx_bytes + rx))
            tx_bytes=$((tx_bytes + tx))
          fi
        done

        local name_escaped
        name_escaped=$(echo "$ct_name" | sed 's/"/\\"/g')

        json_entries+=("{\"containerId\":\"${ct_uuid}\",\"name\":\"${name_escaped}\",\"type\":\"virtuozzo\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$ct_ip" ] && echo "\"$ct_ip\"" || echo "null"),\"hostname\":null,\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{}}")
      done < <(prlctl list -a -o uuid,status,ip,name --no-header 2>/dev/null)
      ;;
  esac

  # Build JSON array
  if [[ ${#json_entries[@]} -gt 0 ]]; then
    local IFS=','
    containers="[${json_entries[*]}]"
  fi

  echo "$containers"
}

get_ip_address() {
  local ip=""
  if command -v hostname &>/dev/null; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  if [[ -z "$ip" ]] && command -v ip &>/dev/null; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
  fi
  echo "${ip:-127.0.0.1}"
}

detect_installed() {
  local installed=()
  for agent in "${AGENT_TYPES_ORDERED[@]}"; do
    if systemctl list-unit-files "${agent}.service" &>/dev/null && \
       systemctl list-unit-files "${agent}.service" 2>/dev/null | grep -q "$agent"; then
      installed+=("$agent")
    elif [[ -f "/usr/local/bin/$agent" ]]; then
      installed+=("$agent")
    fi
  done
  echo "${installed[@]}"
}

# ─── Banner ───────────────────────────────────────────────────────────
print_banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║       NodePrism Agent Manager            ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${DIM}OS: ${OS} | Arch: ${ARCH} | Host: $(hostname)${NC}"
  echo -e "  ${DIM}IP: $(get_ip_address)${NC}"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════
#  MAIN MENU
# ═══════════════════════════════════════════════════════════════════════

main_menu() {
  echo "  What would you like to do?"
  echo ""
  echo -e "    ${BOLD}1)${NC} Install a new agent"
  echo -e "    ${BOLD}2)${NC} Uninstall an agent"
  echo -e "    ${BOLD}3)${NC} View agent status"
  echo -e "    ${BOLD}4)${NC} Exit"
  echo ""

  echo -en "  Select (1-4): "
  local choice
  read -r choice

  case $choice in
    1) do_install ;;
    2) do_uninstall ;;
    3) do_status ;;
    4) exit 0 ;;
    *) log_error "Invalid choice"; exit 1 ;;
  esac
}

# ═══════════════════════════════════════════════════════════════════════
#  STATUS
# ═══════════════════════════════════════════════════════════════════════

do_status() {
  log_step "Agent Status"

  local found=false

  printf "  ${BOLD}%-25s %-12s %-8s %-30s${NC}\n" "AGENT" "STATUS" "PORT" "ENDPOINT"
  echo "  $(printf '%.0s─' {1..75})"

  for agent in "${AGENT_TYPES_ORDERED[@]}"; do
    local installed=false
    local status="${RED}not installed${NC}"
    local port="-"
    local endpoint="-"

    if systemctl list-unit-files "${agent}.service" 2>/dev/null | grep -q "$agent"; then
      installed=true
    elif [[ -f "/usr/local/bin/$agent" ]]; then
      installed=true
    fi

    if [[ "$installed" == "true" ]]; then
      found=true
      if systemctl is-active --quiet "$agent" 2>/dev/null; then
        status="${GREEN}running${NC}"
      else
        status="${YELLOW}stopped${NC}"
      fi

      # Try to detect the port from the service file
      if [[ -f "/etc/systemd/system/${agent}.service" ]]; then
        port=$(grep -oP 'listen-address=:?\K[0-9]+' "/etc/systemd/system/${agent}.service" 2>/dev/null || echo "-")
        if [[ "$port" != "-" ]]; then
          endpoint="http://$(get_ip_address):${port}/metrics"
        fi
      fi
    fi

    printf "  %-25s %b  %-8s %-30s\n" "$agent" "$status" "$port" "$endpoint"
  done

  echo ""

  if [[ "$found" == "false" ]]; then
    log_info "No agents installed on this system."
  fi
}

# ═══════════════════════════════════════════════════════════════════════
#  UNINSTALL
# ═══════════════════════════════════════════════════════════════════════

uninstall_agent() {
  local agent="$1"
  echo ""
  log_info "Uninstalling ${agent}..."

  # Stop and disable service
  if systemctl is-active --quiet "$agent" 2>/dev/null; then
    log_info "  Stopping service..."
    systemctl stop "$agent"
  fi

  if systemctl is-enabled --quiet "$agent" 2>/dev/null; then
    log_info "  Disabling service..."
    systemctl disable "$agent"
  fi

  # Remove service file
  if [[ -f "/etc/systemd/system/${agent}.service" ]]; then
    log_info "  Removing service file..."
    rm -f "/etc/systemd/system/${agent}.service"
    systemctl daemon-reload
  fi

  # Remove binary
  if [[ -f "/usr/local/bin/$agent" ]]; then
    log_info "  Removing binary..."
    rm -f "/usr/local/bin/$agent"
  fi

  # Remove env file
  local env_file="${AGENT_ENV_FILES[$agent]}"
  if [[ -n "$env_file" && -f "$env_file" ]]; then
    log_info "  Removing config: $env_file"
    rm -f "$env_file"
  fi

  # Remove config directory
  local config_dir="${AGENT_CONFIG_DIRS[$agent]}"
  if [[ -n "$config_dir" && -d "$config_dir" ]]; then
    log_info "  Removing config dir: $config_dir"
    rm -rf "$config_dir"
  fi

  # Remove data directory
  local data_dir="${AGENT_DATA_DIRS[$agent]}"
  if [[ -n "$data_dir" && -d "$data_dir" ]]; then
    log_info "  Removing data dir: $data_dir"
    rm -rf "$data_dir"
  fi

  # Remove user (ask in interactive mode)
  if id "$agent" &>/dev/null; then
    if [[ "$NON_INTERACTIVE" != "true" && -t 0 ]]; then
      echo -en "  Remove user '${agent}'? [y/N]: "
      local reply
      read -r reply
      if [[ "$reply" =~ ^[Yy] ]]; then
        userdel "$agent" 2>/dev/null || true
        log_info "  User removed"
      fi
    fi
  fi

  log_info "${agent} uninstalled"
}

do_uninstall() {
  # Non-interactive with --type
  if [[ -n "$PRESET_TYPE" ]]; then
    if [[ "$PRESET_TYPE" == "all" ]]; then
      for agent in "${AGENT_TYPES_ORDERED[@]}"; do
        if [[ -f "/usr/local/bin/$agent" ]] || systemctl list-unit-files "${agent}.service" 2>/dev/null | grep -q "$agent"; then
          uninstall_agent "$agent"
        fi
      done
      return
    fi

    # Validate agent type
    local valid=false
    for agent in "${AGENT_TYPES_ORDERED[@]}"; do
      [[ "$agent" == "$PRESET_TYPE" ]] && valid=true
    done
    if [[ "$valid" != "true" ]]; then
      log_error "Unknown agent: $PRESET_TYPE"
      echo "Valid agents: ${AGENT_TYPES_ORDERED[*]}"
      exit 1
    fi
    uninstall_agent "$PRESET_TYPE"
    return
  fi

  # Interactive uninstall menu
  log_step "Uninstall Agent"

  local installed
  installed=($(detect_installed))

  if [[ ${#installed[@]} -eq 0 ]]; then
    log_info "No agents found on this system."
    return
  fi

  echo "  Installed agents:"
  echo ""
  local i=1
  for agent in "${installed[@]}"; do
    local status
    if systemctl is-active --quiet "$agent" 2>/dev/null; then
      status="${GREEN}running${NC}"
    else
      status="${RED}stopped${NC}"
    fi
    printf "    ${BOLD}%d)${NC} %-25s [%b]\n" "$i" "$agent" "$status"
    ((i++))
  done
  echo ""
  printf "    ${BOLD}%d)${NC} %-25s\n" "$i" "All of the above"
  printf "    ${BOLD}%d)${NC} %-25s\n" "$((i+1))" "Cancel"
  echo ""

  echo -en "  Select agent to remove (1-$((i+1))): "
  local choice
  read -r choice

  if [[ "$choice" == "$((i+1))" ]]; then
    log_info "Cancelled"
    return
  elif [[ "$choice" == "$i" ]]; then
    echo ""
    echo -en "  ${YELLOW}Remove ALL agents? This cannot be undone. [y/N]:${NC} "
    local confirm
    read -r confirm
    if [[ "$confirm" =~ ^[Yy] ]]; then
      for agent in "${installed[@]}"; do
        uninstall_agent "$agent"
      done
    else
      log_info "Cancelled"
      return
    fi
  elif [[ "$choice" -ge 1 && "$choice" -lt "$i" ]] 2>/dev/null; then
    local selected="${installed[$((choice-1))]}"
    uninstall_agent "$selected"
  else
    log_error "Invalid choice"
    exit 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════
#  INSTALL
# ═══════════════════════════════════════════════════════════════════════

choose_agent_type() {
  log_step "Step 1: Choose Agent Type"

  if [[ -n "$PRESET_TYPE" ]]; then
    AGENT_TYPE="$PRESET_TYPE"
    log_info "Agent type: ${AGENT_DISPLAY_NAMES[$AGENT_TYPE]}"
    return
  fi

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    log_error "Agent type is required in non-interactive mode. Use --type"
    exit 1
  fi

  echo "  Available agents:"
  echo ""
  local i=1
  for agent in "${AGENT_TYPES_ORDERED[@]}"; do
    local port="${AGENT_DEFAULT_PORTS[$agent]}"
    printf "    ${BOLD}%d)${NC} %-40s ${DIM}(port %s)${NC}\n" "$i" "${AGENT_DISPLAY_NAMES[$agent]}" "$port"
    ((i++))
  done

  echo ""
  local choice
  prompt choice "Select agent (1-${#AGENT_TYPES_ORDERED[@]})" "1"

  if [[ "$choice" -ge 1 && "$choice" -le "${#AGENT_TYPES_ORDERED[@]}" ]] 2>/dev/null; then
    AGENT_TYPE="${AGENT_TYPES_ORDERED[$((choice-1))]}"
  else
    log_error "Invalid choice: $choice"
    exit 1
  fi

  echo ""
  log_info "Selected: ${AGENT_DISPLAY_NAMES[$AGENT_TYPE]}"
}

configure_agent() {
  log_step "Step 2: Configuration"

  local default_port="${AGENT_DEFAULT_PORTS[$AGENT_TYPE]}"
  local default_version="${AGENT_DEFAULT_VERSIONS[$AGENT_TYPE]}"
  local default_hostname
  default_hostname=$(hostname)

  # Port
  if [[ -n "$PRESET_PORT" ]]; then
    LISTEN_PORT="$PRESET_PORT"
  else
    prompt LISTEN_PORT "Listen port" "$default_port"
  fi

  # Version
  prompt AGENT_VERSION "Version" "$default_version"

  # Hostname label
  if [[ -n "$PRESET_HOSTNAME" ]]; then
    HOSTNAME_LABEL="$PRESET_HOSTNAME"
  else
    prompt HOSTNAME_LABEL "Hostname label" "$default_hostname"
  fi

  # Service user
  SERVICE_USER="${AGENT_TYPE}"
  prompt SERVICE_USER "Service user" "$SERVICE_USER"

  # Agent-specific config
  case $AGENT_TYPE in
    node_exporter)     configure_node_exporter ;;
    mysql_exporter)    configure_mysql_exporter ;;
    postgres_exporter) configure_postgres_exporter ;;
    mongodb_exporter)  configure_mongodb_exporter ;;
    nginx_exporter)    configure_nginx_exporter ;;
    redis_exporter)    configure_redis_exporter ;;
    promtail)          configure_promtail ;;
  esac

  echo ""
  log_info "Configuration complete"
}

configure_node_exporter() {
  echo ""
  echo -e "  ${BOLD}Node Exporter Options:${NC}"

  COLLECTOR_SYSTEMD=true
  COLLECTOR_PROCESSES=true
  COLLECTOR_TEXTFILE=false
  TEXTFILE_DIR="/var/lib/node_exporter/textfile"

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    prompt_yn "Enable systemd collector?" "y" && COLLECTOR_SYSTEMD=true || COLLECTOR_SYSTEMD=false
    prompt_yn "Enable process collector?" "y" && COLLECTOR_PROCESSES=true || COLLECTOR_PROCESSES=false
    if prompt_yn "Enable textfile collector? (for custom metrics)" "n"; then
      COLLECTOR_TEXTFILE=true
      prompt TEXTFILE_DIR "Textfile directory" "$TEXTFILE_DIR"
    fi
  fi

  FILESYSTEM_EXCLUDE="^/(sys|proc|dev|host|etc|run|snap|var/lib/docker)($|/)"
  prompt FILESYSTEM_EXCLUDE "Filesystem mount exclude regex" "$FILESYSTEM_EXCLUDE"
}

configure_mysql_exporter() {
  echo ""
  echo -e "  ${BOLD}MySQL Connection:${NC}"

  prompt MYSQL_HOST "MySQL host" "localhost"
  prompt MYSQL_PORT "MySQL port" "3306"
  prompt MYSQL_USER "MySQL user" "exporter"

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo -en "  MySQL password: "
    read -rs MYSQL_PASSWORD
    echo ""
  else
    MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
  fi

  if [[ -z "$MYSQL_PASSWORD" ]]; then
    log_warn "No password set. You can edit /etc/mysql_exporter.env later."
    MYSQL_PASSWORD=""
  fi

  MYSQL_INNODB_METRICS=true
  MYSQL_PROCESSLIST=true
  MYSQL_SLOW_QUERIES=false

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo ""
    echo -e "  ${BOLD}MySQL Collectors:${NC}"
    prompt_yn "Collect InnoDB metrics?" "y" && MYSQL_INNODB_METRICS=true || MYSQL_INNODB_METRICS=false
    prompt_yn "Collect processlist?" "y" && MYSQL_PROCESSLIST=true || MYSQL_PROCESSLIST=false
    prompt_yn "Collect slow query log stats?" "n" && MYSQL_SLOW_QUERIES=true || MYSQL_SLOW_QUERIES=false
  fi

  echo ""
  echo -e "  ${DIM}Tip: Create a dedicated MySQL user for the exporter:${NC}"
  echo -e "  ${DIM}  CREATE USER 'exporter'@'localhost' IDENTIFIED BY 'password';${NC}"
  echo -e "  ${DIM}  GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'localhost';${NC}"
}

configure_postgres_exporter() {
  echo ""
  echo -e "  ${BOLD}PostgreSQL Connection:${NC}"

  prompt PG_HOST "PostgreSQL host" "localhost"
  prompt PG_PORT "PostgreSQL port" "5432"
  prompt PG_USER "PostgreSQL user" "postgres_exporter"
  prompt PG_DATABASE "PostgreSQL database" "postgres"

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo -en "  PostgreSQL password: "
    read -rs PG_PASSWORD
    echo ""
  else
    PG_PASSWORD="${PG_PASSWORD:-}"
  fi

  PG_SSLMODE="disable"
  prompt PG_SSLMODE "SSL mode (disable/require/verify-ca/verify-full)" "disable"

  echo ""
  echo -e "  ${DIM}Tip: Create a dedicated PostgreSQL user:${NC}"
  echo -e "  ${DIM}  CREATE USER postgres_exporter WITH PASSWORD 'password';${NC}"
  echo -e "  ${DIM}  GRANT pg_monitor TO postgres_exporter;${NC}"
}

configure_mongodb_exporter() {
  echo ""
  echo -e "  ${BOLD}MongoDB Connection:${NC}"

  prompt MONGO_HOST "MongoDB host" "localhost"
  prompt MONGO_PORT "MongoDB port" "27017"
  prompt MONGO_USER "MongoDB user (leave empty for no auth)" ""

  MONGO_PASSWORD=""
  if [[ -n "$MONGO_USER" && "$NON_INTERACTIVE" != "true" ]]; then
    echo -en "  MongoDB password: "
    read -rs MONGO_PASSWORD
    echo ""
  fi

  prompt MONGO_AUTH_DB "Auth database" "admin"

  MONGO_COLLECT_DB=true
  MONGO_COLLECT_COLLECTIONS=false
  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo ""
    echo -e "  ${BOLD}MongoDB Collectors:${NC}"
    prompt_yn "Collect database stats?" "y" && MONGO_COLLECT_DB=true || MONGO_COLLECT_DB=false
    prompt_yn "Collect collection stats? (can be expensive)" "n" && MONGO_COLLECT_COLLECTIONS=true || MONGO_COLLECT_COLLECTIONS=false
  fi
}

configure_nginx_exporter() {
  echo ""
  echo -e "  ${BOLD}Nginx Configuration:${NC}"

  prompt NGINX_STATUS_URL "Nginx stub_status URL" "http://localhost:8080/stub_status"
  prompt NGINX_SSL_VERIFY "Verify SSL (true/false)" "false"

  echo ""
  echo -e "  ${DIM}Tip: Enable stub_status in your nginx config:${NC}"
  echo -e "  ${DIM}  server {${NC}"
  echo -e "  ${DIM}    listen 8080;${NC}"
  echo -e "  ${DIM}    location /stub_status {${NC}"
  echo -e "  ${DIM}      stub_status on;${NC}"
  echo -e "  ${DIM}      allow 127.0.0.1;${NC}"
  echo -e "  ${DIM}      deny all;${NC}"
  echo -e "  ${DIM}    }${NC}"
  echo -e "  ${DIM}  }${NC}"
}

configure_redis_exporter() {
  echo ""
  echo -e "  ${BOLD}Redis Configuration:${NC}"

  prompt REDIS_ADDR "Redis address" "redis://localhost:6379"

  REDIS_PASSWORD=""
  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo -en "  Redis password (leave empty if none): "
    read -rs REDIS_PASSWORD
    echo ""
  fi

  REDIS_EXPORT_KEYS=false
  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    prompt_yn "Export key-level metrics? (can be expensive)" "n" && REDIS_EXPORT_KEYS=true || REDIS_EXPORT_KEYS=false
  fi
}

configure_promtail() {
  echo ""
  echo -e "  ${BOLD}Promtail Configuration:${NC}"

  prompt LOKI_URL "Loki URL" "http://localhost:3100"

  # Ensure it ends with the push path
  if [[ "$LOKI_URL" != */loki/api/v1/push ]]; then
    LOKI_URL="${LOKI_URL%/}/loki/api/v1/push"
  fi

  PROMTAIL_CONFIG_DIR="/etc/promtail"
  prompt PROMTAIL_CONFIG_DIR "Config directory" "$PROMTAIL_CONFIG_DIR"

  PROMTAIL_DATA_DIR="/var/lib/promtail"
  prompt PROMTAIL_DATA_DIR "Data directory (positions file)" "$PROMTAIL_DATA_DIR"

  # Log paths
  echo ""
  echo -e "  ${BOLD}Log Paths to Monitor:${NC}"

  SCRAPE_SYSLOG=true
  SCRAPE_AUTH=true
  SCRAPE_JOURNAL=true
  SCRAPE_VARLOG=true
  SCRAPE_CUSTOM=false
  CUSTOM_LOG_PATHS=""

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    prompt_yn "Monitor /var/log/*.log?" "y" && SCRAPE_VARLOG=true || SCRAPE_VARLOG=false
    prompt_yn "Monitor /var/log/syslog?" "y" && SCRAPE_SYSLOG=true || SCRAPE_SYSLOG=false
    prompt_yn "Monitor /var/log/auth.log?" "y" && SCRAPE_AUTH=true || SCRAPE_AUTH=false
    prompt_yn "Monitor systemd journal?" "y" && SCRAPE_JOURNAL=true || SCRAPE_JOURNAL=false
    if prompt_yn "Add custom log paths?" "n"; then
      SCRAPE_CUSTOM=true
      prompt CUSTOM_LOG_PATHS "Custom paths (comma-separated)" "/var/log/myapp/*.log"
    fi
  fi

  if [[ -n "$PRESET_LOG_DIR" ]]; then
    SCRAPE_CUSTOM=true
    CUSTOM_LOG_PATHS="$PRESET_LOG_DIR"
  fi
}

configure_registration() {
  log_step "Step 3: API Registration"

  if [[ "$SKIP_REGISTER" == "true" ]]; then
    log_info "Registration will be skipped (--skip-register)"
    return
  fi

  if [[ -n "$API_URL" ]]; then
    log_info "Manager URL: $API_URL"
    return
  fi

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    log_info "No API URL provided, skipping registration"
    SKIP_REGISTER=true
    return
  fi

  if prompt_yn "Register this agent with a NodePrism manager?" "y"; then
    prompt API_URL "Manager URL (e.g. http://manager:4000)" ""
    if [[ -z "$API_URL" ]]; then
      log_warn "No URL provided, skipping registration"
      SKIP_REGISTER=true
    else
      if prompt_yn "Use an auth token?" "n"; then
        prompt API_TOKEN "Auth token" ""
      fi
    fi
  else
    SKIP_REGISTER=true
  fi
}

review_config() {
  log_step "Step 4: Review"

  echo -e "  ${BOLD}Agent:${NC}     ${AGENT_DISPLAY_NAMES[$AGENT_TYPE]}"
  echo -e "  ${BOLD}Version:${NC}   ${AGENT_VERSION}"
  echo -e "  ${BOLD}Port:${NC}      ${LISTEN_PORT}"
  echo -e "  ${BOLD}Hostname:${NC}  ${HOSTNAME_LABEL}"
  echo -e "  ${BOLD}User:${NC}      ${SERVICE_USER}"
  echo -e "  ${BOLD}IP:${NC}        $(get_ip_address)"

  case $AGENT_TYPE in
    mysql_exporter)
      echo -e "  ${BOLD}MySQL:${NC}     ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}" ;;
    postgres_exporter)
      echo -e "  ${BOLD}PG:${NC}        ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}" ;;
    mongodb_exporter)
      echo -e "  ${BOLD}MongoDB:${NC}   ${MONGO_HOST}:${MONGO_PORT}" ;;
    nginx_exporter)
      echo -e "  ${BOLD}Nginx:${NC}     ${NGINX_STATUS_URL}" ;;
    redis_exporter)
      echo -e "  ${BOLD}Redis:${NC}     ${REDIS_ADDR}" ;;
    promtail)
      echo -e "  ${BOLD}Loki:${NC}      ${LOKI_URL}" ;;
  esac

  if [[ "$SKIP_REGISTER" != "true" && -n "$API_URL" ]]; then
    echo -e "  ${BOLD}Register:${NC}  ${API_URL}"
  else
    echo -e "  ${BOLD}Register:${NC}  Skipped"
  fi

  echo ""

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    if ! prompt_yn "Proceed with installation?" "y"; then
      log_info "Installation cancelled"
      exit 0
    fi
  fi
}

create_user() {
  if id "$SERVICE_USER" &>/dev/null; then
    log_info "User $SERVICE_USER already exists"
  else
    log_info "Creating user $SERVICE_USER"
    useradd --no-create-home --shell /bin/false "$SERVICE_USER"
  fi

  # Promtail needs log access
  if [[ "$AGENT_TYPE" == "promtail" ]]; then
    usermod -a -G adm "$SERVICE_USER" 2>/dev/null || true
    usermod -a -G systemd-journal "$SERVICE_USER" 2>/dev/null || true
  fi
}

download_and_install() {
  log_step "Installing"

  local download_url binary_name
  binary_name="$AGENT_TYPE"

  case $AGENT_TYPE in
    node_exporter)
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/node_exporter-${AGENT_VERSION}.${OS}-${ARCH}.tar.gz"
      ;;
    mysql_exporter)
      binary_name="mysqld_exporter"
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/mysqld_exporter-${AGENT_VERSION}.${OS}-${ARCH}.tar.gz"
      ;;
    postgres_exporter)
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/postgres_exporter-${AGENT_VERSION}.${OS}-${ARCH}.tar.gz"
      ;;
    mongodb_exporter)
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/mongodb_exporter-${AGENT_VERSION}.${OS}-${ARCH}.tar.gz"
      ;;
    nginx_exporter)
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/nginx-prometheus-exporter_${AGENT_VERSION}_${OS}_${ARCH}.tar.gz"
      binary_name="nginx-prometheus-exporter"
      ;;
    redis_exporter)
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/redis_exporter-v${AGENT_VERSION}.${OS}-${ARCH}.tar.gz"
      ;;
    promtail)
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/promtail-${OS}-${ARCH}.zip"
      binary_name="promtail-${OS}-${ARCH}"
      ;;
  esac

  local temp_dir
  temp_dir=$(mktemp -d)

  log_info "Downloading ${AGENT_TYPE} v${AGENT_VERSION}..."
  log_info "URL: $download_url"

  if command -v curl &>/dev/null; then
    curl -sL "$download_url" -o "$temp_dir/agent-archive" || { log_error "Download failed"; exit 1; }
  elif command -v wget &>/dev/null; then
    wget -q "$download_url" -O "$temp_dir/agent-archive" || { log_error "Download failed"; exit 1; }
  else
    log_error "Neither curl nor wget found"
    exit 1
  fi

  log_info "Extracting..."

  if [[ "$AGENT_TYPE" == "promtail" ]]; then
    if ! command -v unzip &>/dev/null; then
      log_info "Installing unzip..."
      if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq unzip
      elif command -v yum &>/dev/null; then
        yum install -y -q unzip
      elif command -v dnf &>/dev/null; then
        dnf install -y -q unzip
      fi
    fi
    unzip -q "$temp_dir/agent-archive" -d "$temp_dir"
  else
    tar -xzf "$temp_dir/agent-archive" -C "$temp_dir"
  fi

  # Find the binary
  local binary_path
  binary_path=$(find "$temp_dir" -name "$binary_name" -type f 2>/dev/null | head -1)

  if [[ -z "$binary_path" ]]; then
    binary_path=$(find "$temp_dir" -type f -executable 2>/dev/null | grep -v '\.txt\|\.md\|LICENSE\|NOTICE' | head -1)
  fi

  if [[ -z "$binary_path" ]]; then
    log_error "Could not find binary in downloaded archive"
    log_error "Contents of temp dir:"
    find "$temp_dir" -type f
    rm -rf "$temp_dir"
    exit 1
  fi

  # Stop existing service before replacing binary
  if systemctl is-active --quiet "$AGENT_TYPE" 2>/dev/null; then
    log_info "Stopping existing $AGENT_TYPE service..."
    systemctl stop "$AGENT_TYPE"
  fi

  log_info "Installing to $INSTALL_DIR/$AGENT_TYPE"
  cp "$binary_path" "$INSTALL_DIR/$AGENT_TYPE"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/$AGENT_TYPE"
  chmod +x "$INSTALL_DIR/$AGENT_TYPE"

  rm -rf "$temp_dir"
  log_info "Binary installed"
}

create_env_file() {
  case $AGENT_TYPE in
    mysql_exporter)
      local dsn="${MYSQL_USER}:${MYSQL_PASSWORD}@tcp(${MYSQL_HOST}:${MYSQL_PORT})/"
      cat > /etc/mysql_exporter.env << EOF
DATA_SOURCE_NAME=${dsn}
EOF
      chmod 600 /etc/mysql_exporter.env
      chown "$SERVICE_USER:$SERVICE_USER" /etc/mysql_exporter.env
      log_info "MySQL config written to /etc/mysql_exporter.env"
      ;;

    postgres_exporter)
      local pg_dsn="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}?sslmode=${PG_SSLMODE}"
      cat > /etc/postgres_exporter.env << EOF
DATA_SOURCE_NAME=${pg_dsn}
EOF
      chmod 600 /etc/postgres_exporter.env
      chown "$SERVICE_USER:$SERVICE_USER" /etc/postgres_exporter.env
      log_info "PostgreSQL config written to /etc/postgres_exporter.env"
      ;;

    mongodb_exporter)
      local mongo_uri
      if [[ -n "$MONGO_USER" ]]; then
        mongo_uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_AUTH_DB}"
      else
        mongo_uri="mongodb://${MONGO_HOST}:${MONGO_PORT}"
      fi
      cat > /etc/mongodb_exporter.env << EOF
MONGODB_URI=${mongo_uri}
EOF
      chmod 600 /etc/mongodb_exporter.env
      chown "$SERVICE_USER:$SERVICE_USER" /etc/mongodb_exporter.env
      log_info "MongoDB config written to /etc/mongodb_exporter.env"
      ;;

    redis_exporter)
      cat > /etc/redis_exporter.env << EOF
REDIS_ADDR=${REDIS_ADDR}
REDIS_PASSWORD=${REDIS_PASSWORD}
EOF
      chmod 600 /etc/redis_exporter.env
      chown "$SERVICE_USER:$SERVICE_USER" /etc/redis_exporter.env
      log_info "Redis config written to /etc/redis_exporter.env"
      ;;

    promtail)
      mkdir -p "$PROMTAIL_CONFIG_DIR" "$PROMTAIL_DATA_DIR"
      chown -R "$SERVICE_USER:$SERVICE_USER" "$PROMTAIL_CONFIG_DIR" "$PROMTAIL_DATA_DIR"
      create_promtail_config
      ;;
  esac
}

create_promtail_config() {
  local config_file="${PROMTAIL_CONFIG_DIR}/config.yml"

  cat > "$config_file" << EOF
server:
  http_listen_port: ${LISTEN_PORT}
  grpc_listen_port: 0

positions:
  filename: ${PROMTAIL_DATA_DIR}/positions.yaml

clients:
  - url: ${LOKI_URL}
    tenant_id: default
    batchwait: 1s
    batchsize: 1048576
    timeout: 10s

scrape_configs:
EOF

  if [[ "$SCRAPE_VARLOG" == "true" ]]; then
    cat >> "$config_file" << EOF
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          hostname: ${HOSTNAME_LABEL}
          __path__: /var/log/*.log

EOF
  fi

  if [[ "$SCRAPE_SYSLOG" == "true" ]]; then
    cat >> "$config_file" << EOF
  - job_name: syslog
    static_configs:
      - targets: [localhost]
        labels:
          job: syslog
          hostname: ${HOSTNAME_LABEL}
          __path__: /var/log/syslog

EOF
  fi

  if [[ "$SCRAPE_AUTH" == "true" ]]; then
    cat >> "$config_file" << EOF
  - job_name: auth
    static_configs:
      - targets: [localhost]
        labels:
          job: auth
          hostname: ${HOSTNAME_LABEL}
          __path__: /var/log/auth.log

EOF
  fi

  if [[ "$SCRAPE_JOURNAL" == "true" ]]; then
    cat >> "$config_file" << EOF
  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
        hostname: ${HOSTNAME_LABEL}
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: 'unit'
      - source_labels: ['__journal_priority_keyword']
        target_label: 'level'

EOF
  fi

  if [[ "$SCRAPE_CUSTOM" == "true" && -n "$CUSTOM_LOG_PATHS" ]]; then
    IFS=',' read -ra PATHS <<< "$CUSTOM_LOG_PATHS"
    local i=0
    for path in "${PATHS[@]}"; do
      path=$(echo "$path" | xargs) # trim whitespace
      cat >> "$config_file" << EOF
  - job_name: custom_${i}
    static_configs:
      - targets: [localhost]
        labels:
          job: custom
          hostname: ${HOSTNAME_LABEL}
          __path__: ${path}

EOF
      ((i++))
    done
  fi

  chown "$SERVICE_USER:$SERVICE_USER" "$config_file"
  log_info "Promtail config written to $config_file"
}

build_exec_args() {
  local args="--web.listen-address=:${LISTEN_PORT}"

  case $AGENT_TYPE in
    node_exporter)
      [[ "$COLLECTOR_SYSTEMD" == "true" ]] && args="$args --collector.systemd"
      [[ "$COLLECTOR_PROCESSES" == "true" ]] && args="$args --collector.processes"
      if [[ "$COLLECTOR_TEXTFILE" == "true" ]]; then
        args="$args --collector.textfile --collector.textfile.directory=$TEXTFILE_DIR"
        mkdir -p "$TEXTFILE_DIR"
        chown "$SERVICE_USER:$SERVICE_USER" "$TEXTFILE_DIR"
      fi
      args="$args --collector.filesystem.mount-points-exclude=\"${FILESYSTEM_EXCLUDE}\""
      ;;
    mysql_exporter)
      [[ "$MYSQL_INNODB_METRICS" == "true" ]] && args="$args --collect.info_schema.innodb_metrics"
      [[ "$MYSQL_PROCESSLIST" == "true" ]] && args="$args --collect.info_schema.processlist"
      [[ "$MYSQL_SLOW_QUERIES" == "true" ]] && args="$args --collect.info_schema.query_response_time"
      ;;
    postgres_exporter)
      args="--web.listen-address=:${LISTEN_PORT}"
      ;;
    mongodb_exporter)
      args="--web.listen-address=:${LISTEN_PORT}"
      [[ "$MONGO_COLLECT_DB" == "true" ]] && args="$args --collect-all"
      ;;
    nginx_exporter)
      args="-web.listen-address=:${LISTEN_PORT} -nginx.scrape-uri=${NGINX_STATUS_URL}"
      [[ "$NGINX_SSL_VERIFY" == "false" ]] && args="$args -nginx.ssl-verify=false"
      ;;
    redis_exporter)
      args="--web.listen-address=:${LISTEN_PORT}"
      [[ "$REDIS_EXPORT_KEYS" == "true" ]] && args="$args --include-system-metrics"
      ;;
    promtail)
      args="-config.file=${PROMTAIL_CONFIG_DIR}/config.yml"
      ;;
  esac

  echo "$args"
}

create_systemd_service() {
  log_info "Creating systemd service..."

  local exec_args
  exec_args=$(build_exec_args)

  local env_file_line=""
  case $AGENT_TYPE in
    mysql_exporter)    env_file_line="EnvironmentFile=/etc/mysql_exporter.env" ;;
    postgres_exporter) env_file_line="EnvironmentFile=/etc/postgres_exporter.env" ;;
    mongodb_exporter)  env_file_line="EnvironmentFile=/etc/mongodb_exporter.env" ;;
    redis_exporter)    env_file_line="EnvironmentFile=/etc/redis_exporter.env" ;;
  esac

  cat > "/etc/systemd/system/${AGENT_TYPE}.service" << EOF
[Unit]
Description=NodePrism ${AGENT_DISPLAY_NAMES[$AGENT_TYPE]}
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
PrivateDevices=yes

${env_file_line}

ExecStart=${INSTALL_DIR}/${AGENT_TYPE} ${exec_args}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  log_info "Systemd service created: ${AGENT_TYPE}.service"
}

start_service() {
  log_info "Starting ${AGENT_TYPE}..."
  systemctl enable "$AGENT_TYPE"
  systemctl start "$AGENT_TYPE"

  sleep 2

  if systemctl is-active --quiet "$AGENT_TYPE"; then
    log_info "${AGENT_TYPE} is running"
  else
    log_error "${AGENT_TYPE} failed to start. Checking logs..."
    journalctl -u "$AGENT_TYPE" --no-pager -n 20
    exit 1
  fi
}

verify_installation() {
  if [[ "$AGENT_TYPE" == "promtail" ]]; then
    if command -v curl &>/dev/null; then
      local ready
      ready=$(curl -s "http://localhost:${LISTEN_PORT}/ready" 2>/dev/null || echo "")
      if [[ "$ready" == "Ready" ]]; then
        log_info "Promtail is ready"
      else
        log_warn "Promtail may still be starting up"
      fi
    fi
  else
    if command -v curl &>/dev/null; then
      local metrics
      metrics=$(curl -s "http://localhost:${LISTEN_PORT}/metrics" 2>/dev/null | head -3)
      if [[ -n "$metrics" ]]; then
        log_info "Metrics endpoint is accessible at :${LISTEN_PORT}/metrics"
      else
        log_warn "Could not reach metrics endpoint yet"
      fi
    fi
  fi
}

register_with_api() {
  if [[ "$SKIP_REGISTER" == "true" || -z "$API_URL" ]]; then
    return 0
  fi

  log_info "Registering with NodePrism..."

  # Gather OS/system info before registration
  gather_system_info

  local ip_address
  ip_address=$(get_ip_address)

  # Escape strings for JSON safety
  local cpu_model_escaped
  cpu_model_escaped=$(echo "$OS_CPU_MODEL" | sed 's/"/\\"/g')
  local distro_escaped
  distro_escaped=$(echo "$OS_DISTRO" | sed 's/"/\\"/g')

  local payload
  payload=$(cat <<EOF
{
  "hostname": "${HOSTNAME_LABEL}",
  "ipAddress": "${ip_address}",
  "agentType": "${AGENT_API_TYPES[$AGENT_TYPE]}",
  "port": ${LISTEN_PORT},
  "version": "${AGENT_VERSION}",
  "metadata": {
    "os": {
      "distro": "${distro_escaped}",
      "distroId": "${OS_DISTRO_ID}",
      "distroVersion": "${OS_DISTRO_VERSION}",
      "distroCodename": "${OS_DISTRO_CODENAME}",
      "kernel": "${OS_KERNEL}",
      "arch": "${OS_ARCH_RAW}",
      "platform": "${OS_VIRT}",
      "controlPanel": "${OS_PANEL}"
    },
    "hardware": {
      "cpuModel": "${cpu_model_escaped}",
      "cpuCores": ${OS_CPU_CORES},
      "memoryTotal": ${OS_MEMORY_TOTAL}
    },
    "uptime": ${OS_UPTIME}
  }
}
EOF
)

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

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    log_info "Registered successfully with NodePrism"
    # Extract serverId for container reporting
    local body
    body=$(echo "$response" | sed '$d')
    REGISTERED_SERVER_ID=$(echo "$body" | grep -oP '"serverId"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
  elif [[ "$http_code" == "409" ]]; then
    log_warn "Agent already registered (updating)"
  else
    log_error "Registration failed (HTTP $http_code)"
    log_warn "You can register manually in the NodePrism web UI"
  fi
}

report_containers() {
  if [[ "$SKIP_REGISTER" == "true" || -z "$API_URL" ]]; then
    return 0
  fi

  # Only report if virtualization tools are available
  if ! command -v virsh &>/dev/null && ! command -v vzlist &>/dev/null && ! command -v prlctl &>/dev/null; then
    return 0
  fi

  log_info "Gathering container/VM inventory..."

  # Extract serverId from registration response
  local server_id="$REGISTERED_SERVER_ID"
  if [[ -z "$server_id" ]]; then
    log_warn "No server ID available, skipping container report"
    return 0
  fi

  local container_json
  container_json=$(gather_containers)

  if [[ "$container_json" == "[]" ]]; then
    log_info "No containers/VMs found on this host"
    return 0
  fi

  local count
  count=$(echo "$container_json" | grep -o '"containerId"' | wc -l)
  log_info "Found ${count} container(s)/VM(s), reporting to NodePrism..."

  local payload
  payload="{\"serverId\":\"${server_id}\",\"containers\":${container_json}}"

  local response http_code
  if [[ -n "$API_TOKEN" ]]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -d "$payload" \
      "${API_URL}/api/agents/containers" 2>&1) || true
  else
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${API_URL}/api/agents/containers" 2>&1) || true
  fi

  http_code=$(echo "$response" | tail -n1)

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    log_info "Container report sent successfully (${count} containers)"
  else
    log_warn "Container report failed (HTTP $http_code)"
  fi
}

print_summary() {
  local ip
  ip=$(get_ip_address)

  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║        Installation Complete!            ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Agent:${NC}     ${AGENT_DISPLAY_NAMES[$AGENT_TYPE]}"
  echo -e "  ${BOLD}Version:${NC}   ${AGENT_VERSION}"
  echo -e "  ${BOLD}Endpoint:${NC}  http://${ip}:${LISTEN_PORT}/metrics"
  echo ""
  echo -e "  ${BOLD}Commands:${NC}"
  echo -e "    Status:   ${CYAN}systemctl status ${AGENT_TYPE}${NC}"
  echo -e "    Logs:     ${CYAN}journalctl -u ${AGENT_TYPE} -f${NC}"
  echo -e "    Restart:  ${CYAN}systemctl restart ${AGENT_TYPE}${NC}"
  echo -e "    Stop:     ${CYAN}systemctl stop ${AGENT_TYPE}${NC}"

  case $AGENT_TYPE in
    mysql_exporter)
      echo -e "    Config:   ${CYAN}/etc/mysql_exporter.env${NC}" ;;
    postgres_exporter)
      echo -e "    Config:   ${CYAN}/etc/postgres_exporter.env${NC}" ;;
    mongodb_exporter)
      echo -e "    Config:   ${CYAN}/etc/mongodb_exporter.env${NC}" ;;
    redis_exporter)
      echo -e "    Config:   ${CYAN}/etc/redis_exporter.env${NC}" ;;
    promtail)
      echo -e "    Config:   ${CYAN}${PROMTAIL_CONFIG_DIR}/config.yml${NC}" ;;
  esac

  echo ""
}

do_install() {
  choose_agent_type
  configure_agent
  configure_registration
  review_config
  create_user
  download_and_install
  create_env_file
  create_systemd_service
  start_service
  verify_installation
  register_with_api
  report_containers
  print_summary
}

# ─── Main ─────────────────────────────────────────────────────────────
main() {
  check_root
  detect_os
  print_banner

  case "$COMMAND" in
    install)   do_install ;;
    uninstall) do_uninstall ;;
    status)    do_status ;;
    "")        main_menu ;;
    *)
      log_error "Unknown command: $COMMAND"
      echo "Run '$0 --help' for usage."
      exit 1
      ;;
  esac

  echo ""
  log_info "Done."
}

parse_args "$@"
main
