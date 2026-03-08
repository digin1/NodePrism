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

# ─── curl | bash wrapper ─────────────────────────────────────────────
# When piped (curl | bash), bash reads the script line-by-line from stdin.
# We need to wrap everything in a function so bash reads the entire script
# before executing, then reconnect stdin to the terminal for interactivity.
_nodeprism_main() {

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

# SSL/TLS
SSL_ENABLED=false
MTLS_ENABLED=false
SSL_CERT_DIR="/etc/nodeprism/certs"
CA_CERT_PATH=""
CLIENT_CERT_PATH=""
CLIENT_KEY_PATH=""

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
  ["libvirt_exporter"]="Libvirt Exporter (KVM/QEMU VM Metrics)"
  ["litespeed_exporter"]="LiteSpeed Exporter (Web Server Metrics)"
  ["exim_exporter"]="Exim Exporter (Mail Queue & Delivery Metrics)"
  ["cpanel_exporter"]="cPanel Exporter (Accounts, Domains, Bandwidth)"
  ["promtail"]="Promtail (Log Collector)"
)

declare -A AGENT_DEFAULT_PORTS=(
  ["node_exporter"]="9100"
  ["mysql_exporter"]="9104"
  ["postgres_exporter"]="9187"
  ["mongodb_exporter"]="9216"
  ["nginx_exporter"]="9113"
  ["redis_exporter"]="9121"
  ["libvirt_exporter"]="9177"
  ["litespeed_exporter"]="9122"
  ["exim_exporter"]="9123"
  ["cpanel_exporter"]="9124"
  ["promtail"]="9080"
)

declare -A AGENT_DEFAULT_VERSIONS=(
  ["node_exporter"]="1.7.0"
  ["mysql_exporter"]="0.15.1"
  ["postgres_exporter"]="0.15.0"
  ["mongodb_exporter"]="0.40.0"
  ["nginx_exporter"]="1.1.0"
  ["redis_exporter"]="1.56.0"
  ["libvirt_exporter"]="2.3.2"
  ["litespeed_exporter"]="1.0.0"
  ["exim_exporter"]="1.0.0"
  ["cpanel_exporter"]="1.0.0"
  ["promtail"]="2.9.3"
)

declare -A AGENT_API_TYPES=(
  ["node_exporter"]="NODE_EXPORTER"
  ["mysql_exporter"]="MYSQL_EXPORTER"
  ["postgres_exporter"]="POSTGRES_EXPORTER"
  ["mongodb_exporter"]="MONGODB_EXPORTER"
  ["nginx_exporter"]="NGINX_EXPORTER"
  ["redis_exporter"]="REDIS_EXPORTER"
  ["libvirt_exporter"]="LIBVIRT_EXPORTER"
  ["litespeed_exporter"]="LITESPEED_EXPORTER"
  ["exim_exporter"]="EXIM_EXPORTER"
  ["cpanel_exporter"]="CPANEL_EXPORTER"
  ["promtail"]="PROMTAIL"
)

declare -A AGENT_GITHUB_REPOS=(
  ["node_exporter"]="prometheus/node_exporter"
  ["mysql_exporter"]="prometheus/mysqld_exporter"
  ["postgres_exporter"]="prometheus-community/postgres_exporter"
  ["mongodb_exporter"]="percona/mongodb_exporter"
  ["nginx_exporter"]="nginx/nginx-prometheus-exporter"
  ["redis_exporter"]="oliver006/redis_exporter"
  ["libvirt_exporter"]="Tinkoff/libvirt-exporter"
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
  ["litespeed_exporter"]="/etc/nodeprism"
  ["exim_exporter"]="/etc/nodeprism"
  ["cpanel_exporter"]="/etc/nodeprism"
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

# Auto-detect available services and add relevant exporters before promtail
{
  local _tmp=()
  local _extras=()

  # KVM/libvirt → libvirt_exporter
  if command -v virsh &>/dev/null || command -v libvirtd &>/dev/null || systemctl is-active libvirtd &>/dev/null 2>&1; then
    _extras+=("libvirt_exporter")
  fi

  # LiteSpeed → litespeed_exporter
  if command -v litespeed &>/dev/null || [[ -d /usr/local/lsws ]] || [[ -f /tmp/lshttpd/.rtreport ]]; then
    _extras+=("litespeed_exporter")
  fi

  # Exim → exim_exporter
  if command -v exim &>/dev/null || command -v exim4 &>/dev/null || [[ -f /var/log/exim_mainlog ]]; then
    _extras+=("exim_exporter")
  fi

  # cPanel → cpanel_exporter
  if [[ -d /usr/local/cpanel ]] || [[ -f /etc/trueuserdomains ]]; then
    _extras+=("cpanel_exporter")
  fi

  if [[ ${#_extras[@]} -gt 0 ]]; then
    for a in "${AGENT_TYPES_ORDERED[@]}"; do
      if [[ "$a" == "promtail" ]]; then
        for e in "${_extras[@]}"; do _tmp+=("$e"); done
      fi
      _tmp+=("$a")
    done
    AGENT_TYPES_ORDERED=("${_tmp[@]}")
  fi
}

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
      --enable-ssl)      SSL_ENABLED=true; shift ;;
      --mtls)            SSL_ENABLED=true; MTLS_ENABLED=true; shift ;;
      --ca-cert)         CA_CERT_PATH="$2"; shift 2 ;;
      --client-cert)     CLIENT_CERT_PATH="$2"; shift 2 ;;
      --client-key)      CLIENT_KEY_PATH="$2"; shift 2 ;;
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
  echo "  reconfigure   Modify an installed agent's configuration"
  echo "  update        Check for and apply agent updates"
  echo "  auto-update   Setup automatic update cron job"
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
  echo "  --enable-ssl         Use HTTPS for API communication (generates certs if needed)"
  echo "  --mtls               Enable mutual TLS (implies --enable-ssl, sends client cert)"
  echo "  --ca-cert PATH       Path to CA certificate for server verification"
  echo "  --client-cert PATH   Path to client certificate (for mTLS)"
  echo "  --client-key PATH    Path to client private key (for mTLS)"
  echo ""
  echo "Options (uninstall):"
  echo "  --type TYPE          Agent to remove (or 'all')"
  echo "  --non-interactive    Skip confirmation prompts"
  echo ""
  echo "Options (reconfigure):"
  echo "  --type TYPE          Agent to reconfigure"
  echo "  --non-interactive    Use provided values without prompts"
  echo ""
  echo "Examples:"
  echo "  sudo $0                                                # Interactive menu"
  echo "  sudo $0 install                                        # Interactive install"
  echo "  sudo $0 install --non-interactive --type node_exporter # Quick install"
  echo "  sudo $0 install --type mysql_exporter --api-url http://manager:4000"
  echo "  sudo $0 reconfigure --type mysql_exporter              # Change MySQL config"
  echo "  sudo $0 update                                         # Check & apply updates"
  echo "  sudo $0 update --type node_exporter                    # Update specific agent"
  echo "  sudo $0 auto-update --api-url http://manager:4000      # Setup weekly cron"
  echo "  sudo $0 uninstall --type node_exporter                 # Remove specific agent"
  echo "  sudo $0 uninstall --type all                           # Remove all agents"
  echo "  sudo $0 status                                         # Show all agent status"
  echo "  sudo $0 install --type node_exporter --enable-ssl --api-url https://manager:4000"
  echo "  sudo $0 install --type node_exporter --mtls --api-url https://manager:4000"
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

        # Try to find a friendly display name
        # If the domain name is a UUID, try to get hostname from metadata/description
        local display_name="$vm_name"
        if [[ "$vm_name" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
          # Domain name is a UUID — try alternatives
          local desc
          desc=$(virsh desc "$vm_name" 2>/dev/null | head -1 | tr -d '\000-\037')
          if [[ -n "$desc" && "$desc" != "--" && ! "$desc" =~ ^No\ description ]]; then
            display_name="$desc"
          else
            # Try metadata title
            local meta_title
            meta_title=$(virsh metadata "$vm_name" --uri "http://libvirt.org/title" 2>/dev/null | head -1 | tr -d '\000-\037')
            [[ -n "$meta_title" ]] && display_name="$meta_title"
          fi
        fi

        # Get IP address
        local vm_ip="" vm_hostname=""
        if [[ "$status" == "running" ]]; then
          # Method 1: guest agent (domifaddr --source agent)
          vm_ip=$(virsh domifaddr "$vm_name" --source agent 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1 || echo "")
          # Method 2: standard domifaddr (DHCP lease from libvirt-managed network)
          [[ -z "$vm_ip" ]] && vm_ip=$(virsh domifaddr "$vm_name" 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1 || echo "")
          # Method 3: ARP table — find IPs associated with the VM's MAC address
          if [[ -z "$vm_ip" ]]; then
            local vm_mac
            vm_mac=$(virsh domiflist "$vm_name" 2>/dev/null | awk 'NR>2 && $1!="" {print $5}' | head -1)
            if [[ -n "$vm_mac" && "$vm_mac" != "-" ]]; then
              vm_ip=$(arp -an 2>/dev/null | grep -i "$vm_mac" | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1 || echo "")
            fi
          fi
          # Method 4: DHCP lease files
          if [[ -z "$vm_ip" && -n "$vm_mac" ]]; then
            vm_ip=$(grep -ril "$vm_mac" /var/lib/libvirt/dnsmasq/*.status 2>/dev/null | head -1 | xargs grep -oP '"ip-address"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || echo "")
          fi
          # Try to get hostname via guest agent
          vm_hostname=$(virsh guestinfo "$vm_name" --hostname 2>/dev/null | awk '/hostname/ {print $3}' || echo "")
          # Use hostname as display name if domain name is UUID and we got a hostname
          if [[ "$display_name" == "$vm_name" && -n "$vm_hostname" ]]; then
            display_name="$vm_hostname"
          fi
        fi

        # Get network stats from host-side interfaces
        local rx_bytes=0 tx_bytes=0
        local iface_lines
        iface_lines=$(virsh domiflist "$vm_name" 2>/dev/null | awk 'NR>2 && $1!=""')
        while IFS= read -r ifline; do
          [[ -z "$ifline" ]] && continue
          local iface
          iface=$(echo "$ifline" | awk '{print $1}')
          [[ -z "$iface" || "$iface" == "-" ]] && continue

          # Method 1: virsh domifstat
          local stats rx tx
          stats=$(virsh domifstat "$vm_name" "$iface" 2>/dev/null || echo "")
          rx=$(echo "$stats" | awk '/rx_bytes/ {print $2}')
          tx=$(echo "$stats" | awk '/tx_bytes/ {print $2}')

          # Method 2: /sys/class/net if domifstat returned nothing
          if [[ -z "$rx" && -d "/sys/class/net/${iface}/statistics" ]]; then
            rx=$(cat "/sys/class/net/${iface}/statistics/rx_bytes" 2>/dev/null || echo "0")
            tx=$(cat "/sys/class/net/${iface}/statistics/tx_bytes" 2>/dev/null || echo "0")
          fi

          rx_bytes=$((rx_bytes + ${rx:-0}))
          tx_bytes=$((tx_bytes + ${tx:-0}))
        done <<< "$iface_lines"

        # Get VM metadata (vCPUs, memory)
        local vcpus mem_kb
        vcpus=$(virsh vcpucount "$vm_name" --current 2>/dev/null || echo "0")
        mem_kb=$(virsh dominfo "$vm_name" 2>/dev/null | awk '/Max memory/ {print $3}' || echo "0")

        local name_escaped hostname_escaped
        name_escaped=$(echo "$display_name" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')
        hostname_escaped=$(echo "$vm_hostname" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')

        json_entries+=("{\"containerId\":\"${vm_uuid}\",\"name\":\"${name_escaped}\",\"type\":\"kvm\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$vm_ip" ] && echo "\"$vm_ip\"" || echo "null"),\"hostname\":$([ -n "$vm_hostname" ] && echo "\"$hostname_escaped\"" || echo "null"),\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{\"vcpus\":${vcpus:-0},\"memoryKB\":${mem_kb:-0}}}")
      done < <(virsh list --all 2>/dev/null | tail -n +3)
      ;;

    openvz)
      # List all OpenVZ / Virtuozzo 7 containers
      # VZ7 detection: check if any CTIDs are UUIDs (VZ7 with vzlist compat layer)
      local is_vz7=false
      local sample_ctid
      sample_ctid=$(vzlist -H -o ctid -a 2>/dev/null | head -1 | tr -d ' ')
      if [[ "$sample_ctid" =~ ^[0-9a-f]{8}-[0-9a-f]{4} ]]; then
        is_vz7=true
      fi

      # Build CTID→VEID mapping for VZ7 (numeric VEID used for veth naming & vestat)
      declare -A _ctid_to_veid
      if $is_vz7; then
        while IFS= read -r mline; do
          local m_ctid m_veid
          m_ctid=$(echo "$mline" | awk '{print $1}')
          m_veid=$(echo "$mline" | awk '{print $2}')
          [[ -n "$m_ctid" && -n "$m_veid" && "$m_veid" =~ ^[0-9]+$ ]] && _ctid_to_veid["$m_ctid"]="$m_veid"
        done < <(vzlist -H -o ctid,veid -a 2>/dev/null)
      fi

      # Gather per-container CPU%
      declare -A _vz_cpu
      if command -v vzstat &>/dev/null; then
        # Classic OpenVZ: vzstat gives CPU% directly
        while IFS= read -r sline; do
          local s_ctid s_cpu
          s_ctid=$(echo "$sline" | awk '{print $1}')
          s_cpu=$(echo "$sline" | awk '{print $3}')
          [[ "$s_ctid" =~ ^[0-9]+$ ]] && _vz_cpu["$s_ctid"]="$s_cpu"
        done < <(vzstat -t 1 -n 1 2>/dev/null | tail -n +2)
      elif [[ -f "/proc/vz/vestat" ]]; then
        # Fallback (VZ7): compute CPU% from /proc/vz/vestat jiffies (two 1s-apart samples)
        declare -A _vs1_user _vs1_sys _vs1_uptime
        while IFS= read -r vsline; do
          local vs_veid
          vs_veid=$(echo "$vsline" | awk '{print $1}')
          [[ "$vs_veid" == "Version:" || "$vs_veid" == "VEID" || -z "$vs_veid" ]] && continue
          _vs1_user["$vs_veid"]=$(echo "$vsline" | awk '{print $2}')
          _vs1_sys["$vs_veid"]=$(echo "$vsline" | awk '{print $4}')
          _vs1_uptime["$vs_veid"]=$(echo "$vsline" | awk '{print $5}')
        done < /proc/vz/vestat
        sleep 1
        while IFS= read -r vsline; do
          local vs_veid vs_user vs_sys vs_uptime
          vs_veid=$(echo "$vsline" | awk '{print $1}')
          [[ "$vs_veid" == "Version:" || "$vs_veid" == "VEID" || -z "$vs_veid" ]] && continue
          vs_user=$(echo "$vsline" | awk '{print $2}')
          vs_sys=$(echo "$vsline" | awk '{print $4}')
          vs_uptime=$(echo "$vsline" | awk '{print $5}')
          local d_cpu=$(( (vs_user - ${_vs1_user[$vs_veid]:-0}) + (vs_sys - ${_vs1_sys[$vs_veid]:-0}) ))
          local d_uptime=$(( vs_uptime - ${_vs1_uptime[$vs_veid]:-0} ))
          if [[ $d_uptime -gt 0 ]]; then
            _vz_cpu["$vs_veid"]=$(awk "BEGIN {printf \"%.1f\", ($d_cpu / $d_uptime) * 100}")
          fi
        done < /proc/vz/vestat
      fi

      # Pre-gather network stats via vznetstat (works for both venet and veth modes on VZ7)
      declare -A _vznet_rx _vznet_tx
      if command -v vznetstat &>/dev/null; then
        while IFS= read -r nsline; do
          local ns_id ns_rx ns_tx
          ns_id=$(echo "$nsline" | awk '{print $1}')
          [[ -z "$ns_id" || "$ns_id" == "UUID" || "$ns_id" == "VEID" || "$ns_id" == "Container" ]] && continue
          ns_rx=$(echo "$nsline" | awk '{print $3}')
          ns_tx=$(echo "$nsline" | awk '{print $5}')
          # Sum across network classes for same container
          _vznet_rx["$ns_id"]=$(( ${_vznet_rx[$ns_id]:-0} + ${ns_rx:-0} ))
          _vznet_tx["$ns_id"]=$(( ${_vznet_tx[$ns_id]:-0} + ${ns_tx:-0} ))
        done < <(vznetstat 2>/dev/null | tail -n +2)
      fi

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

        # Resolve numeric VEID for this container (same as ctid on classic OpenVZ)
        local veid="${_ctid_to_veid[$ctid]:-$ctid}"

        # Get network stats: try vznetstat first (works for venet and veth modes)
        local rx_bytes=0 tx_bytes=0
        if [[ -n "${_vznet_rx[$ctid]:-}" ]]; then
          rx_bytes="${_vznet_rx[$ctid]}"
          tx_bytes="${_vznet_tx[$ctid]:-0}"
        elif [[ "$veid" != "$ctid" && -n "${_vznet_rx[$veid]:-}" ]]; then
          rx_bytes="${_vznet_rx[$veid]}"
          tx_bytes="${_vznet_tx[$veid]:-0}"
        else
          # Fallback: try veth interface stats (bridged mode or classic OpenVZ)
          local veth_if="veth${ctid}.0"
          if [[ -d "/sys/class/net/${veth_if}/statistics" ]]; then
            rx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/rx_bytes" 2>/dev/null || echo "0")
            tx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/tx_bytes" 2>/dev/null || echo "0")
          elif [[ "$veid" != "$ctid" ]]; then
            veth_if="veth${veid}.0"
            if [[ -d "/sys/class/net/${veth_if}/statistics" ]]; then
              rx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/rx_bytes" 2>/dev/null || echo "0")
              tx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/tx_bytes" 2>/dev/null || echo "0")
            fi
          fi
          # Final fallback: scan for veth with short CTID prefix (VZ7 veth naming)
          if [[ $rx_bytes -eq 0 && $tx_bytes -eq 0 ]]; then
            local short_id="${ctid:0:8}"
            for netdir in /sys/class/net/veth*; do
              [[ ! -d "$netdir/statistics" ]] && continue
              local ifname
              ifname=$(basename "$netdir")
              if [[ "$ifname" == *"$short_id"* ]]; then
                rx_bytes=$(( rx_bytes + $(cat "$netdir/statistics/rx_bytes" 2>/dev/null || echo "0") ))
                tx_bytes=$(( tx_bytes + $(cat "$netdir/statistics/tx_bytes" 2>/dev/null || echo "0") ))
              fi
            done
          fi
        fi

        # Get memory from /proc/user_beancounters (physpages: held vs limit)
        local mem_used_bytes=0 mem_max_bytes=0 vcpus=0 cpu_pct=0
        # Try both UUID ctid and numeric veid for /proc/bc/ path
        local bc_path=""
        if [[ -f "/proc/bc/${ctid}/resources" ]]; then
          bc_path="/proc/bc/${ctid}/resources"
        elif [[ "$veid" != "$ctid" && -f "/proc/bc/${veid}/resources" ]]; then
          bc_path="/proc/bc/${veid}/resources"
        fi
        if [[ -n "$bc_path" ]] && [[ "$status" == "running" ]]; then
          local mem_pages mem_limit
          mem_pages=$(awk '/physpages/ {print $2}' "$bc_path" 2>/dev/null || echo "0")
          mem_limit=$(awk '/physpages/ {print $5}' "$bc_path" 2>/dev/null || echo "0")
          mem_used_bytes=$(( ${mem_pages:-0} * 4096 ))
          # Limit of 9223372036854775807 (LONG_MAX) means unlimited — use held as max
          if [[ "${mem_limit:-0}" -gt 0 ]] && [[ "${mem_limit}" != "9223372036854775807" ]]; then
            mem_max_bytes=$(( mem_limit * 4096 ))
          else
            mem_max_bytes=$mem_used_bytes
          fi
        fi

        # Get vCPUs assigned
        if [[ "$status" == "running" ]]; then
          vcpus=$(vzlist -H -o cpus "$ctid" 2>/dev/null | tr -d ' ' || echo "0")
          [[ "$vcpus" == "-" || -z "$vcpus" ]] && vcpus=0
        fi

        # CPU% — try vzstat/vestat result by ctid first, then by numeric veid
        cpu_pct="${_vz_cpu[$ctid]:-0}"
        if [[ "$cpu_pct" == "0" || -z "$cpu_pct" || "$cpu_pct" == "-" ]]; then
          cpu_pct="${_vz_cpu[$veid]:-0}"
        fi
        [[ -z "$cpu_pct" || "$cpu_pct" == "-" ]] && cpu_pct=0

        local hostname_escaped
        hostname_escaped=$(echo "$ct_hostname" | sed 's/"/\\"/g')

        json_entries+=("{\"containerId\":\"${ctid}\",\"name\":\"CT${ctid}\",\"type\":\"openvz\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$ct_ip" ] && echo "\"$ct_ip\"" || echo "null"),\"hostname\":$([ -n "$ct_hostname" ] && echo "\"$hostname_escaped\"" || echo "null"),\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{\"vcpus\":${vcpus},\"cpuPercent\":${cpu_pct},\"memoryUsageBytes\":${mem_used_bytes},\"memoryMaxBytes\":${mem_max_bytes}}}")
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

        # Get resource usage via prlctl
        local mem_used_bytes=0 mem_max_bytes=0 vcpus=0 cpu_pct=0
        if [[ "$status" == "running" ]]; then
          # prlctl statistics for CPU and memory
          local prl_stats
          prl_stats=$(prlctl statistics "$ct_uuid" 2>/dev/null || echo "")
          if [[ -n "$prl_stats" ]]; then
            cpu_pct=$(echo "$prl_stats" | awk '/cpu_usage/ {printf "%.1f", $2/100}' || echo "0")
            mem_used_bytes=$(echo "$prl_stats" | awk '/guest_ram_usage_bytes/ {print $2}' || echo "0")
          fi
          mem_max_bytes=$(prlctl list -i "$ct_uuid" 2>/dev/null | awk -F'[: ]+' '/memsize/ {print $2 * 1048576}' || echo "0")
          vcpus=$(prlctl list -i "$ct_uuid" 2>/dev/null | awk -F'[: ]+' '/cpus/ {print $2}' || echo "0")
        fi

        local name_escaped
        name_escaped=$(echo "$ct_name" | sed 's/"/\\"/g')

        json_entries+=("{\"containerId\":\"${ct_uuid}\",\"name\":\"${name_escaped}\",\"type\":\"virtuozzo\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$ct_ip" ] && echo "\"$ct_ip\"" || echo "null"),\"hostname\":null,\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{\"vcpus\":${vcpus:-0},\"cpuPercent\":${cpu_pct:-0},\"memoryUsageBytes\":${mem_used_bytes:-0},\"memoryMaxBytes\":${mem_max_bytes:-0}}}")
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

generate_agent_certs() {
  if [[ "$SSL_ENABLED" != "true" ]]; then
    return 0
  fi

  if [[ -n "$CA_CERT_PATH" && -f "$CA_CERT_PATH" ]]; then
    log_info "Using provided CA certificate: $CA_CERT_PATH"
    if [[ "$MTLS_ENABLED" == "true" && -n "$CLIENT_CERT_PATH" && -f "$CLIENT_CERT_PATH" ]]; then
      log_info "Using provided client certificate: $CLIENT_CERT_PATH"
      return 0
    elif [[ "$MTLS_ENABLED" != "true" ]]; then
      return 0
    fi
  fi

  if ! command -v openssl &>/dev/null; then
    log_error "openssl is required for SSL certificate generation"
    return 1
  fi

  log_info "Generating SSL certificates in ${SSL_CERT_DIR}..."
  mkdir -p "$SSL_CERT_DIR"

  local hostname_label="${HOSTNAME_LABEL:-$(hostname)}"
  local ip_addr
  ip_addr=$(get_ip_address)

  openssl genrsa -out "${SSL_CERT_DIR}/ca.key" 2048 2>/dev/null
  openssl req -new -x509 \
    -key "${SSL_CERT_DIR}/ca.key" \
    -out "${SSL_CERT_DIR}/ca.crt" \
    -days 365 \
    -subj "/C=US/ST=State/L=City/O=NodePrism/OU=Agent/CN=NodePrism Agent CA" 2>/dev/null

  CA_CERT_PATH="${SSL_CERT_DIR}/ca.crt"

  if [[ "$MTLS_ENABLED" == "true" ]]; then
    openssl genrsa -out "${SSL_CERT_DIR}/client.key" 2048 2>/dev/null
    openssl req -new \
      -key "${SSL_CERT_DIR}/client.key" \
      -out "${SSL_CERT_DIR}/client.csr" \
      -subj "/C=US/ST=State/L=City/O=NodePrism/OU=Agent/CN=${hostname_label}" 2>/dev/null

    cat > "${SSL_CERT_DIR}/client.ext" << EXTEOF
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${hostname_label}
DNS.2 = localhost
IP.1 = ${ip_addr}
IP.2 = 127.0.0.1
EXTEOF

    openssl x509 -req \
      -in "${SSL_CERT_DIR}/client.csr" \
      -CA "${SSL_CERT_DIR}/ca.crt" \
      -CAkey "${SSL_CERT_DIR}/ca.key" \
      -CAcreateserial \
      -out "${SSL_CERT_DIR}/client.crt" \
      -days 365 \
      -extfile "${SSL_CERT_DIR}/client.ext" 2>/dev/null

    rm -f "${SSL_CERT_DIR}/client.csr" "${SSL_CERT_DIR}/client.ext"
    chmod 600 "${SSL_CERT_DIR}/client.key"
    chmod 644 "${SSL_CERT_DIR}/client.crt"

    CLIENT_CERT_PATH="${SSL_CERT_DIR}/client.crt"
    CLIENT_KEY_PATH="${SSL_CERT_DIR}/client.key"
    log_info "Client certificate generated: ${CLIENT_CERT_PATH}"
  fi

  chmod 600 "${SSL_CERT_DIR}/ca.key"
  chmod 644 "${SSL_CERT_DIR}/ca.crt"
  log_info "CA certificate generated: ${CA_CERT_PATH}"
}

build_curl_ssl_opts() {
  local opts=""
  if [[ "$SSL_ENABLED" == "true" ]]; then
    if [[ -n "$CA_CERT_PATH" && -f "$CA_CERT_PATH" ]]; then
      opts="--cacert ${CA_CERT_PATH}"
    else
      opts="--insecure"
    fi
    if [[ "$MTLS_ENABLED" == "true" && -n "$CLIENT_CERT_PATH" && -n "$CLIENT_KEY_PATH" ]]; then
      opts="${opts} --cert ${CLIENT_CERT_PATH} --key ${CLIENT_KEY_PATH}"
    fi
  fi
  echo "$opts"
}

build_wget_ssl_opts() {
  local opts=""
  if [[ "$SSL_ENABLED" == "true" ]]; then
    if [[ -n "$CA_CERT_PATH" && -f "$CA_CERT_PATH" ]]; then
      opts="--ca-certificate=${CA_CERT_PATH}"
    else
      opts="--no-check-certificate"
    fi
    if [[ "$MTLS_ENABLED" == "true" && -n "$CLIENT_CERT_PATH" && -n "$CLIENT_KEY_PATH" ]]; then
      opts="${opts} --certificate=${CLIENT_CERT_PATH} --private-key=${CLIENT_KEY_PATH}"
    fi
  fi
  echo "$opts"
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

# ─── Firewall Management ─────────────────────────────────────────────

# Detect which firewall is active
detect_firewall() {
  if command -v csf &>/dev/null && [[ -f /etc/csf/csf.conf ]]; then
    echo "csf"
  elif command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "active"; then
    echo "ufw"
  elif command -v firewall-cmd &>/dev/null && firewall-cmd --state 2>/dev/null | grep -q "running"; then
    echo "firewalld"
  elif command -v iptables &>/dev/null; then
    # Only count as iptables firewall if there are non-default rules
    local rules
    rules=$(iptables -S INPUT 2>/dev/null | grep -v '^-P ' | wc -l)
    if [[ "$rules" -gt 0 ]]; then
      echo "iptables"
    else
      echo "none"
    fi
  else
    echo "none"
  fi
}

# Open a TCP port in the detected firewall
open_firewall_port() {
  local port="$1"
  local fw
  fw=$(detect_firewall)

  log_step "Firewall Configuration"
  log_info "Detected firewall: ${fw}"

  case "$fw" in
    csf)
      # Check if port is already in TCP_IN
      if grep -q "TCP_IN.*${port}" /etc/csf/csf.conf 2>/dev/null; then
        log_info "Port ${port} already allowed in CSF"
        return 0
      fi

      # Add port to TCP_IN
      local current_tcp_in
      current_tcp_in=$(grep '^TCP_IN' /etc/csf/csf.conf | head -1 | cut -d'"' -f2)
      if [[ -n "$current_tcp_in" ]]; then
        local new_tcp_in="${current_tcp_in},${port}"
        sed -i "s/^TCP_IN = \"${current_tcp_in}\"/TCP_IN = \"${new_tcp_in}\"/" /etc/csf/csf.conf
        csf -r >/dev/null 2>&1
        log_info "Port ${port}/tcp added to CSF TCP_IN and firewall restarted"
      else
        log_warn "Could not parse CSF TCP_IN — add port ${port} manually"
        log_warn "  Edit /etc/csf/csf.conf → TCP_IN, add ${port}, then: csf -r"
      fi
      ;;

    ufw)
      ufw allow "${port}/tcp" >/dev/null 2>&1
      log_info "Port ${port}/tcp allowed in UFW"
      ;;

    firewalld)
      firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null 2>&1
      firewall-cmd --reload >/dev/null 2>&1
      log_info "Port ${port}/tcp allowed in firewalld"
      ;;

    iptables)
      # Insert rule to accept TCP on the port
      iptables -I INPUT -p tcp --dport "${port}" -j ACCEPT 2>/dev/null
      # Try to save rules persistently
      if command -v iptables-save &>/dev/null; then
        if [[ -f /etc/sysconfig/iptables ]]; then
          iptables-save > /etc/sysconfig/iptables
        elif command -v netfilter-persistent &>/dev/null; then
          netfilter-persistent save 2>/dev/null
        fi
      fi
      log_info "Port ${port}/tcp allowed in iptables"
      ;;

    none)
      log_info "No active firewall detected — port ${port} should be accessible"
      ;;
  esac
}

# Close a TCP port in the detected firewall
close_firewall_port() {
  local port="$1"
  local fw
  fw=$(detect_firewall)

  case "$fw" in
    csf)
      local current_tcp_in
      current_tcp_in=$(grep '^TCP_IN' /etc/csf/csf.conf | head -1 | cut -d'"' -f2)
      if [[ -n "$current_tcp_in" ]]; then
        # Remove the port (handle both ",port" and "port," patterns)
        local new_tcp_in
        new_tcp_in=$(echo "$current_tcp_in" | sed "s/,${port}\b//g; s/\b${port},//g; s/^${port}$//g")
        if [[ "$new_tcp_in" != "$current_tcp_in" ]]; then
          sed -i "s/^TCP_IN = \"${current_tcp_in}\"/TCP_IN = \"${new_tcp_in}\"/" /etc/csf/csf.conf
          csf -r >/dev/null 2>&1
          log_info "Port ${port}/tcp removed from CSF"
        fi
      fi
      ;;
    ufw)
      ufw delete allow "${port}/tcp" >/dev/null 2>&1
      log_info "Port ${port}/tcp removed from UFW"
      ;;
    firewalld)
      firewall-cmd --permanent --remove-port="${port}/tcp" >/dev/null 2>&1
      firewall-cmd --reload >/dev/null 2>&1
      log_info "Port ${port}/tcp removed from firewalld"
      ;;
    iptables)
      iptables -D INPUT -p tcp --dport "${port}" -j ACCEPT 2>/dev/null || true
      if command -v iptables-save &>/dev/null; then
        if [[ -f /etc/sysconfig/iptables ]]; then
          iptables-save > /etc/sysconfig/iptables
        elif command -v netfilter-persistent &>/dev/null; then
          netfilter-persistent save 2>/dev/null
        fi
      fi
      log_info "Port ${port}/tcp removed from iptables"
      ;;
  esac
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
  echo -e "    ${BOLD}3)${NC} Reconfigure an agent"
  echo -e "    ${BOLD}4)${NC} Update agents"
  echo -e "    ${BOLD}5)${NC} View agent status"
  echo -e "    ${BOLD}6)${NC} Setup auto-update cron"
  echo -e "    ${BOLD}7)${NC} Exit"
  echo ""

  echo -en "  Select (1-7): "
  local choice
  read -r choice

  case $choice in
    1) do_install ;;
    2) do_uninstall ;;
    3) do_reconfigure ;;
    4) do_update ;;
    5) do_status ;;
    6) setup_auto_update_cron ;;
    7) exit 0 ;;
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
#  UPDATE
# ═══════════════════════════════════════════════════════════════════════

get_installed_version() {
  local agent="$1"
  local binary_path="/usr/local/bin/$agent"

  if [[ ! -f "$binary_path" ]]; then
    echo "not_installed"
    return
  fi

  local version
  version=$("$binary_path" --version 2>&1 | grep -oP '(\d+\.\d+\.\d+)' | head -1)
  if [[ -n "$version" ]]; then
    echo "$version"
  else
    echo "unknown"
  fi
}

get_latest_version_from_api() {
  local agent_type="$1"
  local api_type="${AGENT_API_TYPES[$agent_type]}"

  if [[ -z "$API_URL" ]]; then
    echo ""
    return
  fi

  local curl_ssl_opts wget_ssl_opts
  curl_ssl_opts=$(build_curl_ssl_opts)
  wget_ssl_opts=$(build_wget_ssl_opts)

  local response
  if command -v curl &>/dev/null; then
    response=$(curl -sL $curl_ssl_opts -H "Authorization: Bearer $API_TOKEN" "${API_URL}/api/agents/latest-version/${api_type}" 2>/dev/null)
  elif command -v wget &>/dev/null; then
    response=$(wget -qO- $wget_ssl_opts --header="Authorization: Bearer $API_TOKEN" "${API_URL}/api/agents/latest-version/${api_type}" 2>/dev/null)
  fi

  if [[ -n "$response" ]]; then
    echo "$response" | grep -oP '"latestVersion"\s*:\s*"\K[^"]+' | head -1
  else
    echo ""
  fi
}

version_gt() {
  # Returns 0 (true) if $1 > $2 using version comparison
  [[ "$(printf '%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" && "$1" != "$2" ]]
}

do_update() {
  log_step "Agent Update"

  # Determine which agents to update
  local agents_to_check=()

  if [[ -n "$PRESET_TYPE" ]]; then
    agents_to_check=("$PRESET_TYPE")
  else
    # Find all installed agents
    for agent in "${AGENT_TYPES_ORDERED[@]}"; do
      if systemctl list-unit-files "${agent}.service" 2>/dev/null | grep -q "$agent" || [[ -f "/usr/local/bin/$agent" ]]; then
        agents_to_check+=("$agent")
      fi
    done
  fi

  if [[ ${#agents_to_check[@]} -eq 0 ]]; then
    log_info "No agents installed to update."
    return
  fi

  local updates_available=false

  printf "  ${BOLD}%-25s %-15s %-15s %-12s${NC}\n" "AGENT" "INSTALLED" "LATEST" "STATUS"
  echo "  $(printf '%.0s─' {1..67})"

  for agent in "${agents_to_check[@]}"; do
    local installed_ver latest_ver status_text

    installed_ver=$(get_installed_version "$agent")

    # Try API first, fall back to default versions
    latest_ver=$(get_latest_version_from_api "$agent")
    if [[ -z "$latest_ver" ]]; then
      latest_ver="${AGENT_DEFAULT_VERSIONS[$agent]}"
    fi

    if [[ "$installed_ver" == "not_installed" ]]; then
      status_text="${RED}not installed${NC}"
    elif [[ "$installed_ver" == "unknown" ]]; then
      status_text="${YELLOW}unknown${NC}"
    elif version_gt "$latest_ver" "$installed_ver"; then
      status_text="${YELLOW}update available${NC}"
      updates_available=true
    else
      status_text="${GREEN}up to date${NC}"
    fi

    printf "  %-25s %-15s %-15s %b\n" "$agent" "$installed_ver" "$latest_ver" "$status_text"
  done

  echo ""

  if [[ "$updates_available" != "true" ]]; then
    log_info "All agents are up to date."
    return
  fi

  # Ask to proceed with updates (or auto-proceed in non-interactive)
  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo -en "  Proceed with updates? (y/n): "
    local confirm
    read -r confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      log_info "Update cancelled."
      return
    fi
  fi

  # Perform updates
  for agent in "${agents_to_check[@]}"; do
    local installed_ver latest_ver

    installed_ver=$(get_installed_version "$agent")
    latest_ver=$(get_latest_version_from_api "$agent")
    if [[ -z "$latest_ver" ]]; then
      latest_ver="${AGENT_DEFAULT_VERSIONS[$agent]}"
    fi

    if [[ "$installed_ver" == "not_installed" || "$installed_ver" == "unknown" ]]; then
      continue
    fi

    if ! version_gt "$latest_ver" "$installed_ver"; then
      continue
    fi

    log_info "Updating $agent from $installed_ver to $latest_ver..."

    # Stop service
    systemctl stop "$agent" 2>/dev/null || true

    # Set globals for download_and_install
    AGENT_TYPE="$agent"
    AGENT_VERSION="$latest_ver"

    # Download and install new version
    download_and_install

    # Start service
    systemctl start "$agent" 2>/dev/null || true

    # Verify
    if systemctl is-active --quiet "$agent" 2>/dev/null; then
      log_info "$agent updated successfully to v${latest_ver}"
    else
      log_error "$agent may have failed to start after update"
    fi
  done

  log_info "Update complete."
}

setup_auto_update_cron() {
  log_step "Auto-Update Cron Setup"

  local script_path
  script_path=$(readlink -f "$0")
  local cron_schedule="0 3 * * 0"  # Weekly at 3 AM on Sundays

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo "  This will create a weekly cron job to check for and apply agent updates."
    echo "  Default schedule: Sundays at 3:00 AM"
    echo ""
    echo -en "  Custom cron schedule (or press Enter for default): "
    local custom_schedule
    read -r custom_schedule
    if [[ -n "$custom_schedule" ]]; then
      cron_schedule="$custom_schedule"
    fi
  fi

  local cron_cmd="${cron_schedule} ${script_path} update --non-interactive"
  if [[ -n "$API_URL" ]]; then
    cron_cmd="${cron_cmd} --api-url ${API_URL}"
  fi
  if [[ -n "$API_TOKEN" ]]; then
    cron_cmd="${cron_cmd} --api-token ${API_TOKEN}"
  fi
  if [[ "$SSL_ENABLED" == "true" ]]; then
    cron_cmd="${cron_cmd} --enable-ssl"
    if [[ -n "$CA_CERT_PATH" ]]; then
      cron_cmd="${cron_cmd} --ca-cert ${CA_CERT_PATH}"
    fi
    if [[ "$MTLS_ENABLED" == "true" ]]; then
      cron_cmd="${cron_cmd} --mtls"
      if [[ -n "$CLIENT_CERT_PATH" ]]; then
        cron_cmd="${cron_cmd} --client-cert ${CLIENT_CERT_PATH} --client-key ${CLIENT_KEY_PATH}"
      fi
    fi
  fi
  cron_cmd="${cron_cmd} >> /var/log/nodeprism-agent-update.log 2>&1"

  # Remove existing nodeprism update cron entry and add new one
  (crontab -l 2>/dev/null | grep -v "nodeprism-agent.*update" ; echo "$cron_cmd") | crontab -

  log_info "Auto-update cron job installed: $cron_schedule"
  log_info "Logs: /var/log/nodeprism-agent-update.log"
}

# ═══════════════════════════════════════════════════════════════════════
#  RECONFIGURE
# ═══════════════════════════════════════════════════════════════════════

load_existing_config() {
  local agent="$1"
  local service_file="/etc/systemd/system/${agent}.service"

  if [[ ! -f "$service_file" ]]; then
    return 1
  fi

  # Read port from service file
  LISTEN_PORT=$(grep -oP 'listen-address=:?\K[0-9]+' "$service_file" 2>/dev/null || echo "")
  [[ -z "$LISTEN_PORT" ]] && LISTEN_PORT="${AGENT_DEFAULT_PORTS[$agent]}"

  # Read service user
  SERVICE_USER=$(grep -oP '^User=\K.+' "$service_file" 2>/dev/null || echo "$agent")

  # Read hostname from system
  HOSTNAME_LABEL=$(hostname)

  # Read version from binary
  AGENT_VERSION=$("$INSTALL_DIR/$agent" --version 2>&1 | grep -oP '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
  [[ -z "$AGENT_VERSION" ]] && AGENT_VERSION="${AGENT_DEFAULT_VERSIONS[$agent]}"

  # Read agent-specific config from env files
  case $agent in
    mysql_exporter)
      if [[ -f /etc/mysql_exporter.env ]]; then
        local dsn
        dsn=$(grep -oP '^DATA_SOURCE_NAME=\K.+' /etc/mysql_exporter.env 2>/dev/null || echo "")
        if [[ -n "$dsn" ]]; then
          MYSQL_USER=$(echo "$dsn" | grep -oP '^[^:]+' || echo "exporter")
          MYSQL_PASSWORD=$(echo "$dsn" | grep -oP '(?<=:)[^@]+' || echo "")
          MYSQL_HOST=$(echo "$dsn" | grep -oP '(?<=tcp\()[^:]+' || echo "127.0.0.1")
          MYSQL_PORT=$(echo "$dsn" | grep -oP '(?<=:)[0-9]+(?=\))' || echo "3306")
        fi
      fi
      ;;
    postgres_exporter)
      if [[ -f /etc/postgres_exporter.env ]]; then
        local pg_dsn
        pg_dsn=$(grep -oP '^DATA_SOURCE_NAME=\K.+' /etc/postgres_exporter.env 2>/dev/null || echo "")
        if [[ -n "$pg_dsn" ]]; then
          PG_USER=$(echo "$pg_dsn" | grep -oP '(?<=://)[^:]+' || echo "postgres")
          PG_PASSWORD=$(echo "$pg_dsn" | grep -oP '(?<=://[^:]{0,50}:)[^@]+' || echo "")
          PG_HOST=$(echo "$pg_dsn" | grep -oP '(?<=@)[^:]+' || echo "127.0.0.1")
          PG_PORT=$(echo "$pg_dsn" | grep -oP '(?<=:)[0-9]+(?=/)' || echo "5432")
          PG_DATABASE=$(echo "$pg_dsn" | grep -oP '(?<=/)[^?]+' || echo "postgres")
          PG_SSLMODE=$(echo "$pg_dsn" | grep -oP '(?<=sslmode=)[^&]+' || echo "disable")
        fi
      fi
      ;;
    mongodb_exporter)
      if [[ -f /etc/mongodb_exporter.env ]]; then
        local mongo_uri
        mongo_uri=$(grep -oP '^MONGODB_URI=\K.+' /etc/mongodb_exporter.env 2>/dev/null || echo "")
        if [[ -n "$mongo_uri" ]]; then
          MONGO_HOST=$(echo "$mongo_uri" | grep -oP '(?<=@)[^:/]+' || echo "127.0.0.1")
          MONGO_PORT=$(echo "$mongo_uri" | grep -oP '(?<=:)[0-9]+(?=/)' || echo "27017")
          MONGO_USER=$(echo "$mongo_uri" | grep -oP '(?<=://)[^:@]+(?=:)' || echo "")
          MONGO_PASSWORD=$(echo "$mongo_uri" | grep -oP '(?<=://[^:]{0,50}:)[^@]+' || echo "")
        fi
      fi
      ;;
    redis_exporter)
      if [[ -f /etc/redis_exporter.env ]]; then
        REDIS_ADDR=$(grep -oP '^REDIS_ADDR=\K.+' /etc/redis_exporter.env 2>/dev/null || echo "redis://127.0.0.1:6379")
        REDIS_PASSWORD=$(grep -oP '^REDIS_PASSWORD=\K.+' /etc/redis_exporter.env 2>/dev/null || echo "")
      fi
      ;;
    nginx_exporter)
      NGINX_STATUS_URL=$(grep -oP 'scrape-uri=\K\S+' "$service_file" 2>/dev/null || echo "http://127.0.0.1/nginx_status")
      ;;
    promtail)
      PROMTAIL_CONFIG_DIR="${AGENT_CONFIG_DIRS[promtail]:-/etc/promtail}"
      if [[ -f "${PROMTAIL_CONFIG_DIR}/config.yml" ]]; then
        LOKI_URL=$(grep -oP 'url:\s*\K\S+' "${PROMTAIL_CONFIG_DIR}/config.yml" 2>/dev/null | head -1 || echo "")
      fi
      ;;
  esac

  return 0
}

do_reconfigure() {
  log_step "Reconfigure Agent"

  # Find installed agents
  local installed_agents=()
  for agent in "${AGENT_TYPES_ORDERED[@]}"; do
    if [[ -f "/etc/systemd/system/${agent}.service" ]]; then
      installed_agents+=("$agent")
    fi
  done

  if [[ ${#installed_agents[@]} -eq 0 ]]; then
    log_error "No agents installed to reconfigure."
    return
  fi

  # Select agent (use --type if provided)
  if [[ -n "$PRESET_TYPE" ]]; then
    AGENT_TYPE="$PRESET_TYPE"
    if [[ ! -f "/etc/systemd/system/${AGENT_TYPE}.service" ]]; then
      log_error "${AGENT_TYPE} is not installed."
      return 1
    fi
  elif [[ "$NON_INTERACTIVE" == "true" ]]; then
    log_error "Must provide --type for non-interactive reconfigure"
    return 1
  else
    echo "  Installed agents:"
    echo ""
    local i=1
    for agent in "${installed_agents[@]}"; do
      local status="${RED}stopped${NC}"
      if systemctl is-active --quiet "$agent" 2>/dev/null; then
        status="${GREEN}running${NC}"
      fi
      echo -e "    ${BOLD}${i})${NC} ${AGENT_DISPLAY_NAMES[$agent]}  [${status}]"
      ((i++))
    done
    echo ""
    echo -en "  Select agent to reconfigure (1-${#installed_agents[@]}): "
    local choice
    read -r choice
    if [[ "$choice" -lt 1 || "$choice" -gt ${#installed_agents[@]} ]] 2>/dev/null; then
      log_error "Invalid selection"
      return 1
    fi
    AGENT_TYPE="${installed_agents[$((choice - 1))]}"
  fi

  log_info "Reconfiguring ${AGENT_DISPLAY_NAMES[$AGENT_TYPE]}..."
  echo ""

  # Load current config as defaults
  if ! load_existing_config "$AGENT_TYPE"; then
    log_error "Could not read existing config for ${AGENT_TYPE}"
    return 1
  fi

  log_info "Current configuration loaded. Press Enter to keep existing values."
  echo ""

  # Re-run configuration (prompt uses loaded values as defaults)
  configure_agent
  configure_registration

  # Show changes and confirm
  review_config

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    if ! prompt_yn "Apply this configuration?" "y"; then
      log_info "Reconfiguration cancelled."
      return
    fi
  fi

  # Apply: regenerate env file, systemd service, restart
  log_info "Applying new configuration..."
  create_env_file
  create_systemd_service

  log_info "Restarting ${AGENT_TYPE}..."
  systemctl restart "$AGENT_TYPE"

  sleep 2
  if systemctl is-active --quiet "$AGENT_TYPE"; then
    log_info "${AGENT_TYPE} is running with new configuration"
  else
    log_error "${AGENT_TYPE} failed to start. Check: journalctl -u ${AGENT_TYPE} -f"
    return 1
  fi

  # Re-register with API if configured
  register_with_api

  echo ""
  log_info "Reconfiguration complete!"
}

# ═══════════════════════════════════════════════════════════════════════
#  UNINSTALL
# ═══════════════════════════════════════════════════════════════════════

uninstall_agent() {
  local agent="$1"
  echo ""
  log_info "Uninstalling ${agent}..."

  # Detect port before removing service file (needed for firewall cleanup)
  local agent_port=""
  if [[ -f "/etc/systemd/system/${agent}.service" ]]; then
    agent_port=$(grep -oP 'listen-address=:?\K[0-9]+' "/etc/systemd/system/${agent}.service" 2>/dev/null || echo "")
  fi

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

  # Close firewall port
  if [[ -n "$agent_port" ]]; then
    close_firewall_port "$agent_port"
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
    libvirt_exporter)    configure_libvirt_exporter ;;
    litespeed_exporter)  configure_litespeed_exporter ;;
    exim_exporter)       configure_exim_exporter ;;
    cpanel_exporter)     configure_cpanel_exporter ;;
    promtail)            configure_promtail ;;
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

  # Generate a random password if none provided
  if [[ -z "$MYSQL_PASSWORD" ]]; then
    MYSQL_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
    log_info "Generated random password for MySQL user '${MYSQL_USER}'"
  fi

  # Try to auto-create the MySQL monitoring user
  setup_mysql_user

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
}

setup_mysql_user() {
  # Try to create the MySQL monitoring user automatically
  # Works if: root can access MySQL via socket auth (default on most Linux installs)
  if ! command -v mysql &>/dev/null; then
    log_warn "mysql client not found — skipping automatic user creation"
    echo -e "  ${DIM}Create the user manually:${NC}"
    echo -e "  ${DIM}  mysql -e \"CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '<password>';\"${NC}"
    echo -e "  ${DIM}  mysql -e \"GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO '${MYSQL_USER}'@'localhost'; FLUSH PRIVILEGES;\"${NC}"
    return
  fi

  log_info "Creating MySQL monitoring user '${MYSQL_USER}'..."

  # Try socket auth first (works as root on most systems), then passwordless
  local mysql_cmd=""
  if mysql -e "SELECT 1" &>/dev/null; then
    mysql_cmd="mysql"
  elif mysql -u root -e "SELECT 1" &>/dev/null; then
    mysql_cmd="mysql -u root"
  else
    log_warn "Cannot connect to MySQL as root (socket auth failed)"
    echo -e "  ${DIM}Create the user manually:${NC}"
    echo -e "  ${DIM}  mysql -e \"CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';\"${NC}"
    echo -e "  ${DIM}  mysql -e \"GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO '${MYSQL_USER}'@'localhost'; FLUSH PRIVILEGES;\"${NC}"
    return
  fi

  # Escape single quotes in password for SQL
  local escaped_password="${MYSQL_PASSWORD//\'/\\\'}"

  # Create user and grant read-only permissions
  if $mysql_cmd -e "CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${escaped_password}';" 2>/dev/null && \
     $mysql_cmd -e "ALTER USER '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${escaped_password}';" 2>/dev/null && \
     $mysql_cmd -e "GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO '${MYSQL_USER}'@'localhost';" 2>/dev/null && \
     $mysql_cmd -e "FLUSH PRIVILEGES;" 2>/dev/null; then
    log_ok "MySQL user '${MYSQL_USER}' created with read-only grants (PROCESS, REPLICATION CLIENT, SELECT)"
  else
    log_warn "Failed to create MySQL user automatically"
    echo -e "  ${DIM}Create the user manually:${NC}"
    echo -e "  ${DIM}  mysql -e \"CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${escaped_password}';\"${NC}"
    echo -e "  ${DIM}  mysql -e \"GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO '${MYSQL_USER}'@'localhost'; FLUSH PRIVILEGES;\"${NC}"
  fi
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

  echo ""
  echo -e "  ${DIM}Tip: Create a dedicated read-only MongoDB user:${NC}"
  echo -e "  ${DIM}  db.createUser({user:'exporter',pwd:'password',roles:[{role:'clusterMonitor',db:'admin'},{role:'read',db:'admin'}]})${NC}"
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

  echo ""
  echo -e "  ${DIM}Tip: For Redis 6+ ACLs, create a read-only monitoring user:${NC}"
  echo -e "  ${DIM}  ACL SETUSER exporter on >password ~* &* +info +select +slowlog +latency +config|get${NC}"
}

configure_libvirt_exporter() {
  echo ""
  echo -e "  ${BOLD}Libvirt Exporter Configuration:${NC}"

  # Check if libvirt is available
  if ! command -v virsh &>/dev/null; then
    log_warn "virsh not found. Make sure libvirt is installed (yum install libvirt-client or apt install libvirt-clients)"
  fi

  # Use the read-only socket — exporter only needs to read metrics, not manage VMs
  # The RW socket (libvirt-sock) grants full control equivalent to root access
  LIBVIRT_URI="qemu+unix:///system?socket=/var/run/libvirt/libvirt-sock-ro"
  prompt LIBVIRT_URI "Libvirt connection URI" "$LIBVIRT_URI"

  echo ""
  echo -e "  ${DIM}Tip: The exporter connects via the read-only libvirt socket${NC}"
  echo -e "  ${DIM}  Collects CPU time, memory, disk I/O, and network per VM${NC}"
  echo -e "  ${DIM}  Read-only access — cannot modify or control VMs${NC}"
}

configure_litespeed_exporter() {
  echo ""
  echo -e "  ${BOLD}LiteSpeed Exporter Configuration:${NC}"

  LSWS_RTREPORT_DIR="/tmp/lshttpd"
  if [[ -d /dev/shm/lsws/status ]]; then
    LSWS_RTREPORT_DIR="/dev/shm/lsws/status"
  fi
  prompt LSWS_RTREPORT_DIR "LiteSpeed .rtreport directory" "$LSWS_RTREPORT_DIR"

  LSWS_WORKERS=1
  local detected_workers
  detected_workers=$(ls "$LSWS_RTREPORT_DIR"/.rtreport* 2>/dev/null | wc -l)
  [[ "$detected_workers" -gt 0 ]] && LSWS_WORKERS="$detected_workers"
  prompt LSWS_WORKERS "Number of LiteSpeed workers" "$LSWS_WORKERS"

  echo ""
  echo -e "  ${DIM}Metrics collected: requests/sec, connections, bandwidth,${NC}"
  echo -e "  ${DIM}  per-vhost stats, LSAPI PHP workers, SSL connections${NC}"
  echo -e "  ${DIM}  Read-only — reads .rtreport files every 10s${NC}"
}

configure_exim_exporter() {
  echo ""
  echo -e "  ${BOLD}Exim Exporter Configuration:${NC}"

  EXIM_BIN="exim"
  command -v exim4 &>/dev/null && EXIM_BIN="exim4"
  prompt EXIM_BIN "Exim binary" "$EXIM_BIN"

  EXIM_MAINLOG="/var/log/exim_mainlog"
  [[ -f /var/log/exim4/mainlog ]] && EXIM_MAINLOG="/var/log/exim4/mainlog"
  prompt EXIM_MAINLOG "Exim main log path" "$EXIM_MAINLOG"

  EXIM_COLLECT_DOMAINS=true
  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    prompt_yn "Collect per-domain email stats?" "y" && EXIM_COLLECT_DOMAINS=true || EXIM_COLLECT_DOMAINS=false
  fi

  EXIM_TOP_DOMAINS=50
  if [[ "$EXIM_COLLECT_DOMAINS" == "true" ]]; then
    prompt EXIM_TOP_DOMAINS "Max domains to track" "$EXIM_TOP_DOMAINS"
  fi

  echo ""
  echo -e "  ${DIM}Metrics collected: queue size, frozen messages, deliveries/sec,${NC}"
  echo -e "  ${DIM}  bounces, rejections, per-domain send/receive counts${NC}"
  echo -e "  ${DIM}  Read-only — uses exim -bpc and reads log file${NC}"
}

configure_cpanel_exporter() {
  echo ""
  echo -e "  ${BOLD}cPanel Exporter Configuration:${NC}"

  if [[ ! -d /usr/local/cpanel ]]; then
    log_warn "cPanel not detected at /usr/local/cpanel"
  fi

  CPANEL_COLLECT_BANDWIDTH=true
  CPANEL_COLLECT_DOMAINS=true
  CPANEL_COLLECT_SUSPENDED=true

  if [[ "$NON_INTERACTIVE" != "true" ]]; then
    prompt_yn "Collect per-account bandwidth?" "y" && CPANEL_COLLECT_BANDWIDTH=true || CPANEL_COLLECT_BANDWIDTH=false
    prompt_yn "Collect domain counts per account?" "y" && CPANEL_COLLECT_DOMAINS=true || CPANEL_COLLECT_DOMAINS=false
    prompt_yn "Track suspended accounts?" "y" && CPANEL_COLLECT_SUSPENDED=true || CPANEL_COLLECT_SUSPENDED=false
  fi

  echo ""
  echo -e "  ${DIM}Metrics collected: total accounts, domains, suspended accounts,${NC}"
  echo -e "  ${DIM}  per-account bandwidth, disk usage, addon/parked domain counts${NC}"
  echo -e "  ${DIM}  Read-only — reads /etc/trueuserdomains, /var/cpanel/users/${NC}"
}

configure_promtail() {
  echo ""
  echo -e "  ${BOLD}Promtail Configuration:${NC}"

  # Derive default Loki URL from manager API URL (replace port with 3100)
  local default_loki_url="http://localhost:3100"
  if [[ -n "$API_URL" ]]; then
    default_loki_url=$(echo "$API_URL" | sed 's|:[0-9]*$||'):3100
  fi
  prompt LOKI_URL "Loki URL" "$default_loki_url"

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
    if [[ "$SSL_ENABLED" == "true" ]]; then
      log_info "SSL/TLS: enabled"
      [[ "$MTLS_ENABLED" == "true" ]] && log_info "Mutual TLS: enabled"
    fi
    return
  fi

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    log_info "No API URL provided, skipping registration"
    SKIP_REGISTER=true
    return
  fi

  if prompt_yn "Register this agent with a NodePrism manager?" "y"; then
    prompt API_URL "Manager URL (e.g. https://manager:4000)" ""
    if [[ -z "$API_URL" ]]; then
      log_warn "No URL provided, skipping registration"
      SKIP_REGISTER=true
    else
      if prompt_yn "Use an auth token?" "n"; then
        prompt API_TOKEN "Auth token" ""
      fi
      if [[ "$SSL_ENABLED" != "true" ]]; then
        if prompt_yn "Enable SSL/TLS for API communication?" "n"; then
          SSL_ENABLED=true
          if prompt_yn "Enable mutual TLS (client certificate auth)?" "n"; then
            MTLS_ENABLED=true
          fi
        fi
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
    litespeed_exporter)
      echo -e "  ${BOLD}Reports:${NC}   ${LSWS_RTREPORT_DIR} (${LSWS_WORKERS} workers)" ;;
    exim_exporter)
      echo -e "  ${BOLD}Exim:${NC}      ${EXIM_BIN}, log: ${EXIM_MAINLOG}" ;;
    cpanel_exporter)
      echo -e "  ${BOLD}cPanel:${NC}    bw=${CPANEL_COLLECT_BANDWIDTH} domains=${CPANEL_COLLECT_DOMAINS}" ;;
    promtail)
      echo -e "  ${BOLD}Loki:${NC}      ${LOKI_URL}" ;;
  esac

  if [[ "$SKIP_REGISTER" != "true" && -n "$API_URL" ]]; then
    echo -e "  ${BOLD}Register:${NC}  ${API_URL}"
  else
    echo -e "  ${BOLD}Register:${NC}  Skipped"
  fi

  if [[ "$SSL_ENABLED" == "true" ]]; then
    echo -e "  ${BOLD}SSL/TLS:${NC}   Enabled"
    if [[ "$MTLS_ENABLED" == "true" ]]; then
      echo -e "  ${BOLD}mTLS:${NC}      Enabled"
    fi
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

  # libvirt_exporter: no group changes needed — uses the read-only socket

  # Script-based exporters run as root (need system file access)
  # litespeed_exporter: reads /tmp/lshttpd/.rtreport (owned by lsadm)
  # exim_exporter: runs exim -bpc and reads /var/log/exim_mainlog
  # cpanel_exporter: reads /var/cpanel/users/, /etc/trueuserdomains
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
    libvirt_exporter)
      # libvirt_exporter has no prebuilt binaries — build from source
      binary_name="libvirt_exporter"
      download_url="BUILD_FROM_SOURCE"
      ;;
    litespeed_exporter|exim_exporter|cpanel_exporter)
      # Script-based exporters — no binary download
      download_url="SCRIPT_EXPORTER"
      ;;
    promtail)
      download_url="https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/releases/download/v${AGENT_VERSION}/promtail-${OS}-${ARCH}.zip"
      binary_name="promtail-${OS}-${ARCH}"
      ;;
  esac

  local temp_dir
  temp_dir=$(mktemp -d)

  # Special handling: build from source
  if [[ "$download_url" == "BUILD_FROM_SOURCE" ]]; then
    log_info "Building ${AGENT_TYPE} from source (no prebuilt binaries available)..."

    # Ensure Go is installed
    if ! command -v go &>/dev/null; then
      log_info "Installing Go toolchain..."
      local go_version="1.21.6"
      local go_arch="$ARCH"
      [[ "$go_arch" == "amd64" ]] || [[ "$go_arch" == "arm64" ]] || go_arch="amd64"
      curl -sL "https://go.dev/dl/go${go_version}.linux-${go_arch}.tar.gz" -o "$temp_dir/go.tar.gz"
      tar -C /usr/local -xzf "$temp_dir/go.tar.gz"
      export PATH="/usr/local/go/bin:$PATH"
      if ! command -v go &>/dev/null; then
        log_error "Failed to install Go. Install it manually: https://go.dev/dl/"
        exit 1
      fi
      log_info "Go $(go version | awk '{print $3}') installed"
    fi

    # Ensure libvirt development headers and gcc are available
    local need_deps=false
    pkg-config --exists libvirt 2>/dev/null || need_deps=true
    command -v gcc &>/dev/null || need_deps=true

    if [[ "$need_deps" == "true" ]]; then
      log_info "Installing libvirt development libraries..."
      if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq libvirt-dev pkg-config build-essential
      elif command -v dnf &>/dev/null; then
        dnf install -y -q libvirt-devel pkgconfig gcc make
      elif command -v yum &>/dev/null; then
        yum install -y -q libvirt-devel pkgconfig gcc make
      fi

      # Verify the critical dependency is now available
      if ! pkg-config --exists libvirt 2>/dev/null; then
        # Check if the headers exist even without pkg-config detection
        if [[ ! -f /usr/include/libvirt/libvirt.h ]]; then
          log_error "libvirt-devel is required but could not be installed."
          log_error "Install it manually: yum install libvirt-devel gcc make"
          exit 1
        fi
      fi
    fi

    # Download source tarball (no git required)
    # Try tag formats: without v, with v, then fall back to main/master
    local tarball_url="" dl_ok=false
    for try_url in \
      "https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/archive/refs/tags/${AGENT_VERSION}.tar.gz" \
      "https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/archive/refs/tags/v${AGENT_VERSION}.tar.gz" \
      "https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/archive/refs/heads/main.tar.gz" \
      "https://github.com/${AGENT_GITHUB_REPOS[$AGENT_TYPE]}/archive/refs/heads/master.tar.gz"; do
      if curl -sfL "$try_url" -o "$temp_dir/source.tar.gz" 2>/dev/null; then
        tarball_url="$try_url"
        dl_ok=true
        break
      fi
    done
    if [[ "$dl_ok" != "true" ]]; then
      log_error "Failed to download source code"
      exit 1
    fi
    log_info "Downloaded from ${tarball_url}"
    tar -xzf "$temp_dir/source.tar.gz" -C "$temp_dir"
    # Find the extracted directory
    local src_dir
    src_dir=$(find "$temp_dir" -maxdepth 1 -type d -name "libvirt*" | head -1)
    if [[ -z "$src_dir" ]]; then
      log_error "Could not find source directory after extraction"
      exit 1
    fi
    mv "$src_dir" "$temp_dir/src"

    log_info "Compiling (this may take a minute)..."
    cd "$temp_dir/src"
    CGO_ENABLED=1 go build -o "$temp_dir/libvirt_exporter" . 2>&1 || {
      log_error "Build failed. Check that libvirt-dev is installed."
      cd /
      rm -rf "$temp_dir"
      exit 1
    }
    cd /

    # Stop existing service before replacing binary
    if systemctl is-active --quiet "$AGENT_TYPE" 2>/dev/null; then
      log_info "Stopping existing $AGENT_TYPE service..."
      systemctl stop "$AGENT_TYPE"
    fi

    log_info "Installing to $INSTALL_DIR/$AGENT_TYPE"
    cp "$temp_dir/libvirt_exporter" "$INSTALL_DIR/$AGENT_TYPE"
    chmod +x "$INSTALL_DIR/$AGENT_TYPE"
    chown root:root "$INSTALL_DIR/$AGENT_TYPE"

    rm -rf "$temp_dir"
    log_info "${AGENT_TYPE} built and installed successfully"
    return 0
  fi

  # Script-based exporters — generate Python scripts directly
  if [[ "$download_url" == "SCRIPT_EXPORTER" ]]; then
    log_info "Generating ${AGENT_TYPE} script..."

    # Ensure python3 is available
    if ! command -v python3 &>/dev/null; then
      log_error "python3 is required for ${AGENT_TYPE}. Install it first."
      exit 1
    fi

    # Stop existing service before replacing
    if systemctl is-active --quiet "$AGENT_TYPE" 2>/dev/null; then
      log_info "Stopping existing $AGENT_TYPE service..."
      systemctl stop "$AGENT_TYPE"
    fi

    case $AGENT_TYPE in
      litespeed_exporter) generate_litespeed_exporter ;;
      exim_exporter)      generate_exim_exporter ;;
      cpanel_exporter)    generate_cpanel_exporter ;;
    esac

    chmod +x "$INSTALL_DIR/$AGENT_TYPE"
    chown root:root "$INSTALL_DIR/$AGENT_TYPE"
    log_info "${AGENT_TYPE} script installed"
    return 0
  fi

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
    if command -v unzip &>/dev/null; then
      unzip -q "$temp_dir/agent-archive" -d "$temp_dir"
    elif command -v python3 &>/dev/null; then
      python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$temp_dir/agent-archive" "$temp_dir"
    elif command -v python &>/dev/null; then
      python -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$temp_dir/agent-archive" "$temp_dir"
    else
      log_error "No unzip or python available to extract zip archive"
      exit 1
    fi
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

# ─── Script-based Exporter Generators ──────────────────────────────

generate_litespeed_exporter() {
  cat > "$INSTALL_DIR/$AGENT_TYPE" << 'PYEOF'
#!/usr/bin/env python3
"""NodePrism LiteSpeed Exporter — parses /tmp/lshttpd/.rtreport* for Prometheus metrics.

.rtreport format (one file per worker, updated every 10s):
  VERSION: LiteSpeed Web Server/Enterprise/6.x
  UPTIME: HH:MM:SS
  BPS_IN: N, BPS_OUT: N, SSL_BPS_IN: N, SSL_BPS_OUT: N
  MAXCONN: N, MAXSSL_CONN: N, PLAINCONN: N, AVAILCONN: N, IDLECONN: N, SSLCONN: N, AVAILSSL: N
  REQ_RATE []: REQ_PROCESSING: N, REQ_PER_SEC: N, TOT_REQS: N, PUB_CACHE_HITS_PER_SEC: N, ...
  REQ_RATE [APVH_domain.com]: REQ_PROCESSING: N, REQ_PER_SEC: N, TOT_REQS: N, ...
  EXTAPP [LSAPI] [APVH_domain.com] [lsphp]: POOL_SIZE: N, INUSE_CONN: N, IDLE_CONN: N, WAITQUE_DEPTH: N, ...
"""
import os, re, argparse
from http.server import HTTPServer, BaseHTTPRequestHandler

RTREPORT_DIR = os.environ.get('LSWS_RTREPORT_DIR', '/tmp/lshttpd')

def _num(s):
    s = str(s).strip().rstrip(',')
    try: return float(s) if '.' in s else int(s)
    except: return 0

def _parse_kv(text):
    """Parse 'KEY: VAL, KEY: VAL, ...' into dict."""
    d = {}
    for m in re.finditer(r'(\w+):\s*([\d.]+)', text):
        d[m.group(1)] = _num(m.group(2))
    return d

def parse_rtreport():
    """Parse all .rtreport files (one per worker) and aggregate."""
    conn = {'PLAINCONN': 0, 'IDLECONN': 0, 'SSLCONN': 0, 'MAXCONN': 0, 'MAXSSL_CONN': 0, 'AVAILCONN': 0, 'AVAILSSL': 0}
    bw = {'BPS_IN': 0, 'BPS_OUT': 0, 'SSL_BPS_IN': 0, 'SSL_BPS_OUT': 0}
    # Server-wide totals from REQ_RATE []
    req = {'REQ_PROCESSING': 0, 'REQ_PER_SEC': 0, 'TOT_REQS': 0,
           'PUB_CACHE_HITS_PER_SEC': 0, 'TOTAL_PUB_CACHE_HITS': 0,
           'PRIVATE_CACHE_HITS_PER_SEC': 0, 'TOTAL_PRIVATE_CACHE_HITS': 0,
           'STATIC_HITS_PER_SEC': 0, 'TOTAL_STATIC_HITS': 0}
    vhosts = {}  # domain -> {REQ_PER_SEC, TOT_REQS, ...}
    extapps = {} # (type, vhost, name) -> {POOL_SIZE, INUSE_CONN, IDLE_CONN, WAITQUE_DEPTH, ...}
    found = False
    uptime = ''
    version = ''

    try:
        entries = sorted(os.listdir(RTREPORT_DIR))
    except (PermissionError, FileNotFoundError):
        return conn, bw, req, vhosts, extapps, found, uptime, version

    for fname in entries:
        if not fname.startswith('.rtreport') or fname.endswith('.json'):
            continue
        path = os.path.join(RTREPORT_DIR, fname)
        try:
            with open(path, 'r') as fh:
                content = fh.read()
        except (PermissionError, FileNotFoundError):
            continue
        found = True

        for line in content.splitlines():
            line = line.strip()
            if not line or line == 'EOF':
                continue

            if line.startswith('VERSION:'):
                version = line.split(':', 1)[1].strip()
            elif line.startswith('UPTIME:'):
                uptime = line.split(':', 1)[1].strip()

            # Bandwidth line: BPS_IN: N, BPS_OUT: N, SSL_BPS_IN: N, SSL_BPS_OUT: N
            elif line.startswith('BPS_IN:') or line.startswith('SSL_BPS_IN:'):
                kv = _parse_kv(line)
                for k in bw:
                    bw[k] += kv.get(k, 0)

            # Connection line: MAXCONN: N, MAXSSL_CONN: N, PLAINCONN: N, ...
            elif line.startswith('MAXCONN:'):
                kv = _parse_kv(line)
                for k in conn:
                    conn[k] += kv.get(k, 0)

            # REQ_RATE []: server totals  /  REQ_RATE [APVH_domain]: per-vhost
            elif line.startswith('REQ_RATE'):
                m = re.match(r'REQ_RATE\s*\[([^\]]*)\]:\s*(.*)', line)
                if m:
                    vhost_name = m.group(1).strip()
                    kv = _parse_kv(m.group(2))
                    if not vhost_name:
                        # Server-wide totals
                        for k in req:
                            req[k] += kv.get(k, 0)
                    else:
                        # Per-vhost (strip APVH_ prefix for cleaner domain names)
                        domain = re.sub(r'^APVH_', '', vhost_name)
                        if domain.startswith('_'):
                            continue  # skip _AdminVHost
                        if domain not in vhosts:
                            vhosts[domain] = {}
                        for k, v in kv.items():
                            vhosts[domain][k] = vhosts[domain].get(k, 0) + v

            # EXTAPP [LSAPI] [APVH_domain] [lsphp]: POOL_SIZE: N, ...
            elif line.startswith('EXTAPP'):
                m = re.match(r'EXTAPP\s*\[([^\]]*)\]\s*\[([^\]]*)\]\s*\[([^\]]*)\]:\s*(.*)', line)
                if m:
                    app_type = m.group(1).strip()
                    app_vhost = re.sub(r'^APVH_', '', m.group(2).strip())
                    app_name = m.group(3).strip()
                    kv = _parse_kv(m.group(4))
                    key = (app_type, app_vhost, app_name)
                    if key not in extapps:
                        extapps[key] = {}
                    for k, v in kv.items():
                        extapps[key][k] = extapps[key].get(k, 0) + v

    return conn, bw, req, vhosts, extapps, found, uptime, version

def format_metrics():
    conn, bw, req, vhosts, extapps, found, uptime, version = parse_rtreport()
    L = []

    L.append('# HELP litespeed_up Whether LiteSpeed rtreport is readable')
    L.append('# TYPE litespeed_up gauge')
    L.append(f'litespeed_up {1 if found else 0}')

    if version:
        L.append('# HELP litespeed_info LiteSpeed version info')
        L.append('# TYPE litespeed_info gauge')
        L.append(f'litespeed_info{{version="{version}"}} 1')

    # Connection metrics
    for k, desc in [('PLAINCONN', 'HTTP connections'), ('IDLECONN', 'Idle connections'),
                    ('SSLCONN', 'SSL connections'), ('MAXCONN', 'Max HTTP connections'),
                    ('MAXSSL_CONN', 'Max SSL connections'), ('AVAILCONN', 'Available HTTP slots'),
                    ('AVAILSSL', 'Available SSL slots')]:
        name = f'litespeed_{k.lower()}'
        L.append(f'# HELP {name} {desc}')
        L.append(f'# TYPE {name} gauge')
        L.append(f'{name} {conn[k]}')

    # Bandwidth
    for k, desc in [('BPS_IN', 'Incoming bytes/sec'), ('BPS_OUT', 'Outgoing bytes/sec'),
                    ('SSL_BPS_IN', 'SSL incoming bytes/sec'), ('SSL_BPS_OUT', 'SSL outgoing bytes/sec')]:
        name = f'litespeed_{k.lower()}'
        L.append(f'# HELP {name} {desc}')
        L.append(f'# TYPE {name} gauge')
        L.append(f'{name} {bw[k]}')

    # Request metrics (server-wide)
    for k, desc in [('REQ_PROCESSING', 'Requests currently processing'),
                    ('REQ_PER_SEC', 'Requests per second'),
                    ('TOT_REQS', 'Total requests served'),
                    ('PUB_CACHE_HITS_PER_SEC', 'Public cache hits/sec'),
                    ('TOTAL_PUB_CACHE_HITS', 'Total public cache hits'),
                    ('PRIVATE_CACHE_HITS_PER_SEC', 'Private cache hits/sec'),
                    ('TOTAL_PRIVATE_CACHE_HITS', 'Total private cache hits'),
                    ('STATIC_HITS_PER_SEC', 'Static file hits/sec'),
                    ('TOTAL_STATIC_HITS', 'Total static file hits')]:
        name = f'litespeed_{k.lower()}'
        L.append(f'# HELP {name} {desc}')
        L.append(f'# TYPE {name} gauge')
        L.append(f'{name} {req[k]}')

    # Per-vhost metrics
    if vhosts:
        L.append('# HELP litespeed_vhost_req_per_sec Per-vhost requests/sec')
        L.append('# TYPE litespeed_vhost_req_per_sec gauge')
        for vh in sorted(vhosts):
            L.append(f'litespeed_vhost_req_per_sec{{vhost="{vh}"}} {vhosts[vh].get("REQ_PER_SEC", 0)}')

        L.append('# HELP litespeed_vhost_tot_reqs Per-vhost total requests')
        L.append('# TYPE litespeed_vhost_tot_reqs counter')
        for vh in sorted(vhosts):
            L.append(f'litespeed_vhost_tot_reqs{{vhost="{vh}"}} {vhosts[vh].get("TOT_REQS", 0)}')

        L.append('# HELP litespeed_vhost_req_processing Per-vhost requests processing')
        L.append('# TYPE litespeed_vhost_req_processing gauge')
        for vh in sorted(vhosts):
            L.append(f'litespeed_vhost_req_processing{{vhost="{vh}"}} {vhosts[vh].get("REQ_PROCESSING", 0)}')

    # EXTAPP / PHP worker metrics (aggregate LSAPI stats)
    lsapi_pool = 0; lsapi_busy = 0; lsapi_idle = 0; lsapi_queue = 0; lsapi_reqs = 0
    for (atype, avh, aname), kv in extapps.items():
        if atype == 'LSAPI':
            lsapi_pool += kv.get('POOL_SIZE', 0)
            lsapi_busy += kv.get('INUSE_CONN', 0)
            lsapi_idle += kv.get('IDLE_CONN', 0)
            lsapi_queue += kv.get('WAITQUE_DEPTH', 0)
            lsapi_reqs += kv.get('TOT_REQS', 0)

    L.append('# HELP litespeed_lsapi_pool_size Total LSAPI/PHP worker processes')
    L.append('# TYPE litespeed_lsapi_pool_size gauge')
    L.append(f'litespeed_lsapi_pool_size {lsapi_pool}')
    L.append('# HELP litespeed_lsapi_busy Busy LSAPI/PHP workers')
    L.append('# TYPE litespeed_lsapi_busy gauge')
    L.append(f'litespeed_lsapi_busy {lsapi_busy}')
    L.append('# HELP litespeed_lsapi_idle Idle LSAPI/PHP workers')
    L.append('# TYPE litespeed_lsapi_idle gauge')
    L.append(f'litespeed_lsapi_idle {lsapi_idle}')
    L.append('# HELP litespeed_lsapi_queue_depth Waiting requests in LSAPI queue')
    L.append('# TYPE litespeed_lsapi_queue_depth gauge')
    L.append(f'litespeed_lsapi_queue_depth {lsapi_queue}')
    L.append('# HELP litespeed_lsapi_total_requests Total LSAPI requests')
    L.append('# TYPE litespeed_lsapi_total_requests counter')
    L.append(f'litespeed_lsapi_total_requests {lsapi_reqs}')

    # Per-vhost LSAPI breakdown (if multiple vhosts have PHP pools)
    lsapi_vhosts = {(atype, avh, aname): kv for (atype, avh, aname), kv in extapps.items() if atype == 'LSAPI' and avh}
    if lsapi_vhosts:
        L.append('# HELP litespeed_lsapi_vhost_queue Per-vhost LSAPI queue depth')
        L.append('# TYPE litespeed_lsapi_vhost_queue gauge')
        for (_, avh, _), kv in sorted(lsapi_vhosts.items()):
            L.append(f'litespeed_lsapi_vhost_queue{{vhost="{avh}"}} {kv.get("WAITQUE_DEPTH", 0)}')

        L.append('# HELP litespeed_lsapi_vhost_busy Per-vhost busy PHP workers')
        L.append('# TYPE litespeed_lsapi_vhost_busy gauge')
        for (_, avh, _), kv in sorted(lsapi_vhosts.items()):
            L.append(f'litespeed_lsapi_vhost_busy{{vhost="{avh}"}} {kv.get("INUSE_CONN", 0)}')

    return '\n'.join(L) + '\n'

class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/metrics':
            body = format_metrics().encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(200)
            body = b'LiteSpeed Exporter. /metrics for Prometheus.\n'
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    def log_message(self, fmt, *args): pass

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--web.listen-address', dest='listen', default=':9122')
    p.add_argument('--rtreport-dir', dest='rtdir', default=None)
    args = p.parse_args()
    if args.rtdir:
        RTREPORT_DIR = args.rtdir
    host, port = '', 9122
    if ':' in args.listen:
        parts = args.listen.rsplit(':', 1)
        host = parts[0]
        port = int(parts[1])
    print(f'LiteSpeed Exporter listening on {host or "0.0.0.0"}:{port}')
    HTTPServer((host, port), MetricsHandler).serve_forever()
PYEOF
}

generate_exim_exporter() {
  cat > "$INSTALL_DIR/$AGENT_TYPE" << 'PYEOF'
#!/usr/bin/env python3
"""NodePrism Exim Exporter — mail queue, frozen msgs, per-domain stats for Prometheus."""
import os, sys, re, time, subprocess, argparse, collections
from http.server import HTTPServer, BaseHTTPRequestHandler

EXIM_BIN = os.environ.get('EXIM_BIN', 'exim')
EXIM_MAINLOG = os.environ.get('EXIM_MAINLOG', '/var/log/exim_mainlog')
TOP_DOMAINS = int(os.environ.get('EXIM_TOP_DOMAINS', '50'))
COLLECT_DOMAINS = os.environ.get('EXIM_COLLECT_DOMAINS', 'true') == 'true'

# Cache for log-based stats (re-parsed every 30s)
_cache = {'ts': 0, 'data': None}

def run_cmd(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ''

def get_queue_stats():
    """Get queue size and frozen count from exim."""
    queue_size = 0
    frozen_count = 0
    # exim -bpc gives total queue count
    out = run_cmd([EXIM_BIN, '-bpc'])
    if out.isdigit():
        queue_size = int(out)

    # Count frozen messages from queue listing
    if queue_size > 0:
        out = run_cmd([EXIM_BIN, '-bp'], timeout=30)
        frozen_count = out.count('*** frozen ***')

    return queue_size, frozen_count

def get_log_stats():
    """Parse exim mainlog for delivery/bounce/reject stats and per-domain counts."""
    now = time.time()
    if _cache['data'] and (now - _cache['ts']) < 30:
        return _cache['data']

    stats = {
        'deliveries': 0, 'bounces': 0, 'rejections': 0,
        'received': 0, 'deferred': 0,
        'domain_sent': collections.Counter(),
        'domain_received': collections.Counter(),
    }

    if not os.path.exists(EXIM_MAINLOG):
        _cache['data'] = stats
        _cache['ts'] = now
        return stats

    # Read last 50K lines max for performance
    try:
        with open(EXIM_MAINLOG, 'r', errors='replace') as f:
            # Seek to last ~5MB
            try:
                f.seek(max(0, os.path.getsize(EXIM_MAINLOG) - 5 * 1024 * 1024))
                f.readline()  # skip partial line
            except:
                f.seek(0)
            lines = f.readlines()
    except (PermissionError, FileNotFoundError):
        _cache['data'] = stats
        _cache['ts'] = now
        return stats

    # Parse today's entries
    today_prefix = time.strftime('%Y-%m-%d')
    for line in lines:
        if not line.startswith(today_prefix):
            continue
        if ' => ' in line or ' -> ' in line:
            stats['deliveries'] += 1
            if COLLECT_DOMAINS:
                m = re.search(r'[=>-]>\s+\S+@(\S+)', line)
                if m:
                    stats['domain_sent'][m.group(1).lower().rstrip('>')] += 1
        elif ' <= ' in line:
            stats['received'] += 1
            if COLLECT_DOMAINS:
                m = re.search(r'<=\s+\S+@(\S+)\s', line)
                if m:
                    stats['domain_received'][m.group(1).lower()] += 1
        elif '**' in line or 'bounce' in line.lower():
            stats['bounces'] += 1
        elif 'rejected' in line.lower() or ' R=' in line:
            if 'rejected' in line.lower():
                stats['rejections'] += 1
        elif '== ' in line:
            stats['deferred'] += 1

    _cache['data'] = stats
    _cache['ts'] = now
    return stats

def format_metrics():
    queue_size, frozen = get_queue_stats()
    log_stats = get_log_stats()

    lines = []
    lines.append('# HELP exim_queue_size Number of messages in the mail queue')
    lines.append('# TYPE exim_queue_size gauge')
    lines.append(f'exim_queue_size {queue_size}')

    lines.append('# HELP exim_queue_frozen Number of frozen messages in the queue')
    lines.append('# TYPE exim_queue_frozen gauge')
    lines.append(f'exim_queue_frozen {frozen}')

    lines.append('# HELP exim_deliveries_today Total deliveries today')
    lines.append('# TYPE exim_deliveries_today gauge')
    lines.append(f'exim_deliveries_today {log_stats["deliveries"]}')

    lines.append('# HELP exim_received_today Total messages received today')
    lines.append('# TYPE exim_received_today gauge')
    lines.append(f'exim_received_today {log_stats["received"]}')

    lines.append('# HELP exim_bounces_today Total bounces today')
    lines.append('# TYPE exim_bounces_today gauge')
    lines.append(f'exim_bounces_today {log_stats["bounces"]}')

    lines.append('# HELP exim_rejections_today Total rejections today')
    lines.append('# TYPE exim_rejections_today gauge')
    lines.append(f'exim_rejections_today {log_stats["rejections"]}')

    lines.append('# HELP exim_deferred_today Total deferred deliveries today')
    lines.append('# TYPE exim_deferred_today gauge')
    lines.append(f'exim_deferred_today {log_stats["deferred"]}')

    lines.append('# HELP exim_up Whether exim is responding')
    lines.append('# TYPE exim_up gauge')
    lines.append(f'exim_up {1 if run_cmd([EXIM_BIN, "-bV"]) else 0}')

    if COLLECT_DOMAINS and log_stats['domain_sent']:
        lines.append('# HELP exim_domain_sent_today Emails sent per domain today')
        lines.append('# TYPE exim_domain_sent_today gauge')
        for domain, count in log_stats['domain_sent'].most_common(TOP_DOMAINS):
            lines.append(f'exim_domain_sent_today{{domain="{domain}"}} {count}')

    if COLLECT_DOMAINS and log_stats['domain_received']:
        lines.append('# HELP exim_domain_received_today Emails received per domain today')
        lines.append('# TYPE exim_domain_received_today gauge')
        for domain, count in log_stats['domain_received'].most_common(TOP_DOMAINS):
            lines.append(f'exim_domain_received_today{{domain="{domain}"}} {count}')

    return '\n'.join(lines) + '\n'

class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/metrics':
            body = format_metrics().encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(200)
            body = b'Exim Exporter. /metrics for Prometheus.\n'
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    def log_message(self, fmt, *args): pass

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--web.listen-address', dest='listen', default=':9123')
    p.add_argument('--exim-bin', dest='exim_bin', default=None)
    p.add_argument('--exim-mainlog', dest='mainlog', default=None)
    p.add_argument('--top-domains', dest='top', type=int, default=None)
    p.add_argument('--collect-domains', dest='domains', default=None)
    args = p.parse_args()
    if args.exim_bin: EXIM_BIN = args.exim_bin
    if args.mainlog: EXIM_MAINLOG = args.mainlog
    if args.top: TOP_DOMAINS = args.top
    if args.domains is not None: COLLECT_DOMAINS = args.domains.lower() == 'true'
    host, port = '', 9123
    if ':' in args.listen:
        parts = args.listen.rsplit(':', 1)
        host = parts[0]
        port = int(parts[1])
    print(f'Exim Exporter listening on {host or "0.0.0.0"}:{port}')
    HTTPServer((host, port), MetricsHandler).serve_forever()
PYEOF
}

generate_cpanel_exporter() {
  cat > "$INSTALL_DIR/$AGENT_TYPE" << 'PYEOF'
#!/usr/bin/env python3
"""NodePrism cPanel Exporter — accounts, domains, bandwidth, suspended for Prometheus."""
import os, sys, re, time, argparse, glob
from http.server import HTTPServer, BaseHTTPRequestHandler

COLLECT_BANDWIDTH = os.environ.get('CPANEL_COLLECT_BANDWIDTH', 'true') == 'true'
COLLECT_DOMAINS = os.environ.get('CPANEL_COLLECT_DOMAINS', 'true') == 'true'
COLLECT_SUSPENDED = os.environ.get('CPANEL_COLLECT_SUSPENDED', 'true') == 'true'

_cache = {'ts': 0, 'data': None}

def collect_metrics():
    now = time.time()
    if _cache['data'] and (now - _cache['ts']) < 30:
        return _cache['data']

    m = {}

    # Total accounts from /etc/trueuserdomains
    trueuserdomains = {}
    try:
        with open('/etc/trueuserdomains', 'r') as f:
            for line in f:
                line = line.strip()
                if ':' in line:
                    domain, user = line.split(':', 1)
                    trueuserdomains[domain.strip()] = user.strip()
    except FileNotFoundError:
        pass

    accounts = set(trueuserdomains.values())
    m['accounts_total'] = len(accounts)
    m['domains_total'] = len(trueuserdomains)

    # Suspended accounts
    suspended_count = 0
    suspended_users = set()
    if COLLECT_SUSPENDED:
        susp_dir = '/var/cpanel/suspended'
        if os.path.isdir(susp_dir):
            suspended_users = set(os.listdir(susp_dir))
            suspended_count = len(suspended_users)
    m['accounts_suspended'] = suspended_count
    m['accounts_active'] = m['accounts_total'] - suspended_count

    # Per-account details from /var/cpanel/users/
    account_data = {}
    if COLLECT_DOMAINS or COLLECT_BANDWIDTH:
        users_dir = '/var/cpanel/users'
        if os.path.isdir(users_dir):
            for username in accounts:
                ufile = os.path.join(users_dir, username)
                if not os.path.isfile(ufile):
                    continue
                try:
                    with open(ufile, 'r') as f:
                        content = f.read()
                except PermissionError:
                    continue

                data = {'addon_domains': 0, 'parked_domains': 0, 'subdomains': 0, 'bwlimit': 0}
                for line in content.splitlines():
                    if line.startswith('BWLIMIT='):
                        try: data['bwlimit'] = int(line.split('=', 1)[1])
                        except: pass
                    elif line.startswith('DNS') and '=' in line:
                        data['addon_domains'] += 1
                    elif line.startswith('PARK_') or (line.startswith('DNS') and 'park' in line.lower()):
                        data['parked_domains'] += 1

                account_data[username] = data

    # Bandwidth from /var/cpanel/bandwidth.db or /var/cpanel/bandwidth/
    bw_by_account = {}
    if COLLECT_BANDWIDTH:
        bw_dir = '/var/cpanel/bandwidth'
        if os.path.isdir(bw_dir):
            for username in accounts:
                bw_file = os.path.join(bw_dir, username)
                if os.path.isfile(bw_file):
                    try:
                        # bandwidth file: last line is typically total
                        with open(bw_file, 'r') as f:
                            lines = f.readlines()
                        total = 0
                        for line in lines:
                            parts = line.strip().split('=')
                            if len(parts) == 2:
                                try: total += int(parts[1])
                                except: pass
                        bw_by_account[username] = total
                    except (PermissionError, FileNotFoundError):
                        pass

    # Disk usage from /var/cpanel/repquota.cache or quota
    disk_by_account = {}
    quota_cache = '/var/cpanel/repquota.cache'
    if os.path.isfile(quota_cache):
        try:
            with open(quota_cache, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 3 and parts[0] in accounts:
                        try: disk_by_account[parts[0]] = int(parts[2]) * 1024  # blocks to bytes
                        except: pass
        except (PermissionError, FileNotFoundError):
            pass

    m['account_data'] = account_data
    m['bw_by_account'] = bw_by_account
    m['disk_by_account'] = disk_by_account

    # cPanel version
    cpanel_version = 'unknown'
    try:
        with open('/usr/local/cpanel/version', 'r') as f:
            cpanel_version = f.read().strip()
    except: pass
    m['cpanel_version'] = cpanel_version

    _cache['data'] = m
    _cache['ts'] = now
    return m

def format_metrics():
    m = collect_metrics()
    lines = []

    lines.append('# HELP cpanel_accounts_total Total cPanel accounts')
    lines.append('# TYPE cpanel_accounts_total gauge')
    lines.append(f'cpanel_accounts_total {m["accounts_total"]}')

    lines.append('# HELP cpanel_accounts_active Active (non-suspended) accounts')
    lines.append('# TYPE cpanel_accounts_active gauge')
    lines.append(f'cpanel_accounts_active {m["accounts_active"]}')

    lines.append('# HELP cpanel_accounts_suspended Suspended accounts')
    lines.append('# TYPE cpanel_accounts_suspended gauge')
    lines.append(f'cpanel_accounts_suspended {m["accounts_suspended"]}')

    lines.append('# HELP cpanel_domains_total Total domains across all accounts')
    lines.append('# TYPE cpanel_domains_total gauge')
    lines.append(f'cpanel_domains_total {m["domains_total"]}')

    lines.append('# HELP cpanel_up Whether cPanel data is readable')
    lines.append('# TYPE cpanel_up gauge')
    lines.append(f'cpanel_up {1 if m["accounts_total"] > 0 else 0}')

    lines.append(f'# HELP cpanel_version_info cPanel version')
    lines.append(f'# TYPE cpanel_version_info gauge')
    lines.append(f'cpanel_version_info{{version="{m["cpanel_version"]}"}} 1')

    if COLLECT_DOMAINS and m.get('account_data'):
        lines.append('# HELP cpanel_account_addon_domains Addon domains per account')
        lines.append('# TYPE cpanel_account_addon_domains gauge')
        for user, data in sorted(m['account_data'].items()):
            lines.append(f'cpanel_account_addon_domains{{account="{user}"}} {data["addon_domains"]}')

    if COLLECT_BANDWIDTH and m.get('bw_by_account'):
        lines.append('# HELP cpanel_account_bandwidth_bytes Monthly bandwidth per account')
        lines.append('# TYPE cpanel_account_bandwidth_bytes gauge')
        for user, bw in sorted(m['bw_by_account'].items()):
            lines.append(f'cpanel_account_bandwidth_bytes{{account="{user}"}} {bw}')

    if m.get('disk_by_account'):
        lines.append('# HELP cpanel_account_disk_usage_bytes Disk usage per account')
        lines.append('# TYPE cpanel_account_disk_usage_bytes gauge')
        for user, du in sorted(m['disk_by_account'].items()):
            lines.append(f'cpanel_account_disk_usage_bytes{{account="{user}"}} {du}')

    return '\n'.join(lines) + '\n'

class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/metrics':
            body = format_metrics().encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(200)
            body = b'cPanel Exporter. /metrics for Prometheus.\n'
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    def log_message(self, fmt, *args): pass

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--web.listen-address', dest='listen', default=':9124')
    args = p.parse_args()
    host, port = '', 9124
    if ':' in args.listen:
        parts = args.listen.rsplit(':', 1)
        host = parts[0]
        port = int(parts[1])
    print(f'cPanel Exporter listening on {host or "0.0.0.0"}:{port}')
    HTTPServer((host, port), MetricsHandler).serve_forever()
PYEOF
}

create_env_file() {
  case $AGENT_TYPE in
    mysql_exporter)
      cat > /etc/mysql_exporter.env << EOF
[client]
user=${MYSQL_USER}
password=${MYSQL_PASSWORD}
host=${MYSQL_HOST}
port=${MYSQL_PORT}
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

    litespeed_exporter)
      mkdir -p /etc/nodeprism
      cat > /etc/nodeprism/litespeed_exporter.env << EOF
LSWS_RTREPORT_DIR=${LSWS_RTREPORT_DIR}
EOF
      chmod 600 /etc/nodeprism/litespeed_exporter.env
      log_info "LiteSpeed config written to /etc/nodeprism/litespeed_exporter.env"
      ;;

    exim_exporter)
      mkdir -p /etc/nodeprism
      cat > /etc/nodeprism/exim_exporter.env << EOF
EXIM_BIN=${EXIM_BIN}
EXIM_MAINLOG=${EXIM_MAINLOG}
EXIM_TOP_DOMAINS=${EXIM_TOP_DOMAINS}
EXIM_COLLECT_DOMAINS=${EXIM_COLLECT_DOMAINS}
EOF
      chmod 600 /etc/nodeprism/exim_exporter.env
      log_info "Exim config written to /etc/nodeprism/exim_exporter.env"
      ;;

    cpanel_exporter)
      mkdir -p /etc/nodeprism
      cat > /etc/nodeprism/cpanel_exporter.env << EOF
CPANEL_COLLECT_BANDWIDTH=${CPANEL_COLLECT_BANDWIDTH}
CPANEL_COLLECT_DOMAINS=${CPANEL_COLLECT_DOMAINS}
CPANEL_COLLECT_SUSPENDED=${CPANEL_COLLECT_SUSPENDED}
EOF
      chmod 600 /etc/nodeprism/cpanel_exporter.env
      log_info "cPanel config written to /etc/nodeprism/cpanel_exporter.env"
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
      args="$args --config.my-cnf=/etc/mysql_exporter.env"
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
    libvirt_exporter)
      args="--web.listen-address=:${LISTEN_PORT} --libvirt.uri=${LIBVIRT_URI:-qemu:///system}"
      ;;
    litespeed_exporter)
      args="--web.listen-address=:${LISTEN_PORT} --rtreport-dir=${LSWS_RTREPORT_DIR:-/tmp/lshttpd}"
      ;;
    exim_exporter)
      args="--web.listen-address=:${LISTEN_PORT} --exim-bin=${EXIM_BIN:-exim} --exim-mainlog=${EXIM_MAINLOG:-/var/log/exim_mainlog} --top-domains=${EXIM_TOP_DOMAINS:-50} --collect-domains=${EXIM_COLLECT_DOMAINS:-true}"
      ;;
    cpanel_exporter)
      args="--web.listen-address=:${LISTEN_PORT}"
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

  # Database exporters use --config.my-cnf or env vars in ExecStart, not EnvironmentFile
  # EnvironmentFile is only for exporters that need KEY=VALUE environment variables
  local env_file_line=""
  case $AGENT_TYPE in
    postgres_exporter)   env_file_line="EnvironmentFile=/etc/postgres_exporter.env" ;;
    mongodb_exporter)    env_file_line="EnvironmentFile=/etc/mongodb_exporter.env" ;;
    redis_exporter)      env_file_line="EnvironmentFile=/etc/redis_exporter.env" ;;
    litespeed_exporter)  env_file_line="EnvironmentFile=/etc/nodeprism/litespeed_exporter.env" ;;
    exim_exporter)       env_file_line="EnvironmentFile=/etc/nodeprism/exim_exporter.env" ;;
    cpanel_exporter)     env_file_line="EnvironmentFile=/etc/nodeprism/cpanel_exporter.env" ;;
  esac

  # Script-based exporters need root for reading system files / running commands
  local svc_user="${SERVICE_USER}"
  local svc_group="${SERVICE_USER}"
  local sandbox_lines=""

  case $AGENT_TYPE in
    litespeed_exporter|exim_exporter|cpanel_exporter)
      svc_user="root"
      svc_group="root"
      sandbox_lines="ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes"
      ;;
    libvirt_exporter)
      sandbox_lines="NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadOnlyPaths=/var/run/libvirt"
      ;;
    *)
      sandbox_lines="NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes"
      ;;
  esac

  cat > "/etc/systemd/system/${AGENT_TYPE}.service" << EOF
[Unit]
Description=NodePrism ${AGENT_DISPLAY_NAMES[$AGENT_TYPE]}
Wants=network-online.target
After=network-online.target

[Service]
User=${svc_user}
Group=${svc_group}
Type=simple
Restart=on-failure
RestartSec=5

${sandbox_lines}

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

  # Escape strings for JSON safety (strip control chars, escape quotes and backslashes)
  json_safe() { echo -n "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }
  local cpu_model_escaped
  cpu_model_escaped=$(json_safe "$OS_CPU_MODEL")
  local distro_escaped
  distro_escaped=$(json_safe "$OS_DISTRO")

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
      "distroId": "$(json_safe "$OS_DISTRO_ID")",
      "distroVersion": "$(json_safe "$OS_DISTRO_VERSION")",
      "distroCodename": "$(json_safe "$OS_DISTRO_CODENAME")",
      "kernel": "$(json_safe "$OS_KERNEL")",
      "arch": "$(json_safe "$OS_ARCH_RAW")",
      "platform": "$(json_safe "$OS_VIRT")",
      "controlPanel": "$(json_safe "$OS_PANEL")"
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

  local ssl_opts
  ssl_opts=$(build_curl_ssl_opts)

  local response http_code
  if [[ -n "$API_TOKEN" ]]; then
    response=$(curl -s -w "\n%{http_code}" $ssl_opts -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -d "$payload" \
      "${API_URL}/api/agents/register" 2>&1) || true
  else
    response=$(curl -s -w "\n%{http_code}" $ssl_opts -X POST \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${API_URL}/api/agents/register" 2>&1) || true
  fi

  http_code=$(echo "$response" | tail -n1)

  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    log_info "Registered successfully with NodePrism"
    # Extract serverId for container reporting
    REGISTERED_SERVER_ID=$(echo "$body" | grep -oP '"serverId"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
  else
    # Show the actual error from the API for debugging
    local err_msg
    err_msg=$(echo "$body" | grep -oP '"error"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
    log_error "Registration failed (HTTP ${http_code})${err_msg:+: $err_msg}"

    # Try to extract serverId anyway (server may exist even if agent reg failed)
    REGISTERED_SERVER_ID=$(echo "$body" | grep -oP '"serverId"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
    if [[ -z "$REGISTERED_SERVER_ID" ]]; then
      # Look up existing server by IP
      local lookup
      lookup=$(curl -s $ssl_opts "${API_URL}/api/servers?search=${ip_address}" 2>/dev/null || echo "")
      REGISTERED_SERVER_ID=$(echo "$lookup" | grep -oP '"id"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
    fi
    [[ -n "$REGISTERED_SERVER_ID" ]] && log_info "Server ID found: ${REGISTERED_SERVER_ID}" || log_warn "You can register manually in the NodePrism web UI"
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

  local ssl_opts
  ssl_opts=$(build_curl_ssl_opts)

  local response http_code
  if [[ -n "$API_TOKEN" ]]; then
    response=$(curl -s -w "\n%{http_code}" $ssl_opts -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -d "$payload" \
      "${API_URL}/api/agents/containers" 2>&1) || true
  else
    response=$(curl -s -w "\n%{http_code}" $ssl_opts -X POST \
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
    litespeed_exporter)
      echo -e "    Config:   ${CYAN}/etc/nodeprism/litespeed_exporter.env${NC}" ;;
    exim_exporter)
      echo -e "    Config:   ${CYAN}/etc/nodeprism/exim_exporter.env${NC}" ;;
    cpanel_exporter)
      echo -e "    Config:   ${CYAN}/etc/nodeprism/cpanel_exporter.env${NC}" ;;
    promtail)
      echo -e "    Config:   ${CYAN}${PROMTAIL_CONFIG_DIR}/config.yml${NC}" ;;
  esac

  if [[ "$SSL_ENABLED" == "true" ]]; then
    echo ""
    echo -e "  ${BOLD}SSL/TLS:${NC}"
    echo -e "    CA cert:  ${CYAN}${CA_CERT_PATH}${NC}"
    if [[ "$MTLS_ENABLED" == "true" ]]; then
      echo -e "    Client:   ${CYAN}${CLIENT_CERT_PATH}${NC}"
      echo -e "    Key:      ${CYAN}${CLIENT_KEY_PATH}${NC}"
    fi
  fi

  echo ""
}

setup_container_collector() {
  # Only set up on virtualization host nodes (OpenVZ, Virtuozzo, KVM without libvirt_exporter)
  if [[ "$SKIP_REGISTER" == "true" || -z "$API_URL" ]]; then
    return 0
  fi

  # Skip if no virt tools or if libvirt_exporter is being installed (it has Prometheus)
  if [[ "$AGENT_TYPE" == "libvirt_exporter" ]]; then
    return 0
  fi
  if ! command -v vzlist &>/dev/null && ! command -v prlctl &>/dev/null; then
    return 0
  fi

  local server_id="$REGISTERED_SERVER_ID"
  if [[ -z "$server_id" ]]; then
    return 0
  fi

  log_info "Setting up periodic container metrics collector..."

  # Save config for the collector
  mkdir -p /etc/nodeprism
  cat > /etc/nodeprism/collector.conf <<COLLECTORCONF
API_URL="${API_URL}"
API_TOKEN="${API_TOKEN}"
SERVER_ID="${server_id}"
COLLECTORCONF
  chmod 600 /etc/nodeprism/collector.conf

  # Create the collector script
  cat > /usr/local/bin/nodeprism-container-collector <<'COLLECTORSCRIPT'
#!/bin/bash
# NodePrism Container Metrics Collector
# Periodically gathers per-container CPU/memory/network and reports to the API.

source /etc/nodeprism/collector.conf 2>/dev/null || exit 1
[[ -z "$API_URL" || -z "$SERVER_ID" ]] && exit 1

gather() {
  local json_entries=()

  # Read previous network snapshot for delta-based rate computation
  local PREV_FILE="/tmp/nodeprism-vznet-prev.dat"
  declare -A prev_rx prev_tx
  local prev_ts=0
  if [[ -f "$PREV_FILE" ]]; then
    prev_ts=$(head -1 "$PREV_FILE" 2>/dev/null | awk '{print $2}')
    [[ -z "$prev_ts" ]] && prev_ts=0
    while IFS=' ' read -r p_id p_rx p_tx; do
      [[ "$p_id" == "TS" || -z "$p_id" ]] && continue
      prev_rx["$p_id"]="$p_rx"
      prev_tx["$p_id"]="$p_tx"
    done < "$PREV_FILE"
  fi
  local current_ts
  current_ts=$(date +%s)
  local elapsed=30
  if [[ $prev_ts -gt 0 ]]; then
    elapsed=$(( current_ts - prev_ts ))
    [[ $elapsed -le 0 ]] && elapsed=30
  fi

  if command -v vzlist &>/dev/null; then
    # OpenVZ / Virtuozzo 7: gather containers via vzlist
    # VZ7 detection: check if CTIDs are UUIDs (VZ7 with vzlist compat layer)
    local is_vz7=false
    local sample_ctid
    sample_ctid=$(vzlist -H -o ctid -a 2>/dev/null | head -1 | tr -d ' ')
    if [[ "$sample_ctid" =~ ^[0-9a-f]{8}-[0-9a-f]{4} ]]; then
      is_vz7=true
    fi

    # Build CTID→VEID mapping for VZ7 (numeric VEID used for veth naming & vestat)
    declare -A ctid_to_veid
    if $is_vz7; then
      while IFS= read -r mline; do
        local m_ctid m_veid
        m_ctid=$(echo "$mline" | awk '{print $1}')
        m_veid=$(echo "$mline" | awk '{print $2}')
        [[ -n "$m_ctid" && -n "$m_veid" && "$m_veid" =~ ^[0-9]+$ ]] && ctid_to_veid["$m_ctid"]="$m_veid"
      done < <(vzlist -H -o ctid,veid -a 2>/dev/null)
    fi

    # Gather per-container CPU%
    declare -A vz_cpu
    if command -v vzstat &>/dev/null; then
      # Classic OpenVZ: vzstat gives CPU% directly
      while IFS= read -r sline; do
        local s_ctid s_cpu
        s_ctid=$(echo "$sline" | awk '{print $1}')
        s_cpu=$(echo "$sline" | awk '{print $3}')
        [[ "$s_ctid" =~ ^[0-9]+$ ]] && vz_cpu["$s_ctid"]="$s_cpu"
      done < <(vzstat -t 1 -n 1 2>/dev/null | tail -n +2)
    elif [[ -f "/proc/vz/vestat" ]]; then
      # Fallback (VZ7): compute CPU% from /proc/vz/vestat jiffies (two 1s-apart samples)
      declare -A vs1_user vs1_sys vs1_uptime
      while IFS= read -r vsline; do
        local vs_veid
        vs_veid=$(echo "$vsline" | awk '{print $1}')
        [[ "$vs_veid" == "Version:" || "$vs_veid" == "VEID" || -z "$vs_veid" ]] && continue
        vs1_user["$vs_veid"]=$(echo "$vsline" | awk '{print $2}')
        vs1_sys["$vs_veid"]=$(echo "$vsline" | awk '{print $4}')
        vs1_uptime["$vs_veid"]=$(echo "$vsline" | awk '{print $5}')
      done < /proc/vz/vestat
      sleep 1
      while IFS= read -r vsline; do
        local vs_veid vs_user vs_sys vs_uptime
        vs_veid=$(echo "$vsline" | awk '{print $1}')
        [[ "$vs_veid" == "Version:" || "$vs_veid" == "VEID" || -z "$vs_veid" ]] && continue
        vs_user=$(echo "$vsline" | awk '{print $2}')
        vs_sys=$(echo "$vsline" | awk '{print $4}')
        vs_uptime=$(echo "$vsline" | awk '{print $5}')
        local d_cpu=$(( (vs_user - ${vs1_user[$vs_veid]:-0}) + (vs_sys - ${vs1_sys[$vs_veid]:-0}) ))
        local d_uptime=$(( vs_uptime - ${vs1_uptime[$vs_veid]:-0} ))
        if [[ $d_uptime -gt 0 ]]; then
          vz_cpu["$vs_veid"]=$(awk "BEGIN {printf \"%.1f\", ($d_cpu / $d_uptime) * 100}")
        fi
      done < /proc/vz/vestat
    fi

    # Pre-gather network stats via vznetstat (works for both venet and veth modes on VZ7)
    declare -A vznet_rx vznet_tx
    if command -v vznetstat &>/dev/null; then
      while IFS= read -r nsline; do
        local ns_id ns_rx ns_tx
        ns_id=$(echo "$nsline" | awk '{print $1}')
        [[ -z "$ns_id" || "$ns_id" == "UUID" || "$ns_id" == "VEID" || "$ns_id" == "Container" ]] && continue
        ns_rx=$(echo "$nsline" | awk '{print $3}')
        ns_tx=$(echo "$nsline" | awk '{print $5}')
        # Sum across network classes for same container
        vznet_rx["$ns_id"]=$(( ${vznet_rx[$ns_id]:-0} + ${ns_rx:-0} ))
        vznet_tx["$ns_id"]=$(( ${vznet_tx[$ns_id]:-0} + ${ns_tx:-0} ))
      done < <(vznetstat 2>/dev/null | tail -n +2)
    fi

    # Save current network snapshot for next run's delta computation
    {
      echo "TS $current_ts"
      for snap_id in "${!vznet_rx[@]}"; do
        echo "$snap_id ${vznet_rx[$snap_id]} ${vznet_tx[$snap_id]}"
      done
    } > "$PREV_FILE"

    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local ctid ct_ip ct_hostname ct_status
      ctid=$(echo "$line" | awk '{print $1}')
      ct_ip=$(echo "$line" | awk '{print $2}')
      ct_hostname=$(echo "$line" | awk '{print $3}')
      ct_status=$(echo "$line" | awk '{print $4}')
      [[ -z "$ctid" || "$ctid" == "CTID" ]] && continue

      local status="stopped"
      [[ "$ct_status" == "running" ]] && status="running"
      [[ "$ct_ip" == "-" ]] && ct_ip=""
      [[ "$ct_hostname" == "-" ]] && ct_hostname=""

      # Resolve numeric VEID for this container (same as ctid on classic OpenVZ)
      local veid="${ctid_to_veid[$ctid]:-$ctid}"

      # Get network stats: try vznetstat first (works for venet and veth modes)
      local rx_bytes=0 tx_bytes=0
      if [[ -n "${vznet_rx[$ctid]:-}" ]]; then
        rx_bytes="${vznet_rx[$ctid]}"
        tx_bytes="${vznet_tx[$ctid]:-0}"
      elif [[ "$veid" != "$ctid" && -n "${vznet_rx[$veid]:-}" ]]; then
        rx_bytes="${vznet_rx[$veid]}"
        tx_bytes="${vznet_tx[$veid]:-0}"
      else
        # Fallback: try veth interface stats (bridged mode or classic OpenVZ)
        local veth_if="veth${ctid}.0"
        if [[ -d "/sys/class/net/${veth_if}/statistics" ]]; then
          rx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/rx_bytes" 2>/dev/null || echo "0")
          tx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/tx_bytes" 2>/dev/null || echo "0")
        elif [[ "$veid" != "$ctid" ]]; then
          veth_if="veth${veid}.0"
          if [[ -d "/sys/class/net/${veth_if}/statistics" ]]; then
            rx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/rx_bytes" 2>/dev/null || echo "0")
            tx_bytes=$(cat "/sys/class/net/${veth_if}/statistics/tx_bytes" 2>/dev/null || echo "0")
          fi
        fi
        # Final fallback: scan for veth with short CTID prefix (VZ7 veth naming)
        if [[ $rx_bytes -eq 0 && $tx_bytes -eq 0 ]]; then
          local short_id="${ctid:0:8}"
          for netdir in /sys/class/net/veth*; do
            [[ ! -d "$netdir/statistics" ]] && continue
            local ifname
            ifname=$(basename "$netdir")
            if [[ "$ifname" == *"$short_id"* ]]; then
              rx_bytes=$(( rx_bytes + $(cat "$netdir/statistics/rx_bytes" 2>/dev/null || echo "0") ))
              tx_bytes=$(( tx_bytes + $(cat "$netdir/statistics/tx_bytes" 2>/dev/null || echo "0") ))
            fi
          done
        fi
      fi

      # Compute network rate (bytes/sec) from delta with previous snapshot
      local rx_rate=0 tx_rate=0
      local prev_key="$ctid"
      [[ -z "${prev_rx[$prev_key]:-}" && "$veid" != "$ctid" ]] && prev_key="$veid"
      if [[ -n "${prev_rx[$prev_key]:-}" && $prev_ts -gt 0 ]]; then
        local d_rx=$(( rx_bytes - ${prev_rx[$prev_key]:-0} ))
        local d_tx=$(( tx_bytes - ${prev_tx[$prev_key]:-0} ))
        [[ $d_rx -lt 0 ]] && d_rx=0
        [[ $d_tx -lt 0 ]] && d_tx=0
        rx_rate=$(awk "BEGIN {printf \"%.1f\", $d_rx / $elapsed}")
        tx_rate=$(awk "BEGIN {printf \"%.1f\", $d_tx / $elapsed}")
      fi

      # Get memory from /proc/user_beancounters (physpages: held vs limit)
      local mem_used_bytes=0 mem_max_bytes=0 vcpus=0 cpu_pct=0
      # Try both UUID ctid and numeric veid for /proc/bc/ path
      local bc_path=""
      if [[ -f "/proc/bc/${ctid}/resources" ]]; then
        bc_path="/proc/bc/${ctid}/resources"
      elif [[ "$veid" != "$ctid" && -f "/proc/bc/${veid}/resources" ]]; then
        bc_path="/proc/bc/${veid}/resources"
      fi
      if [[ -n "$bc_path" ]] && [[ "$status" == "running" ]]; then
        local mem_pages mem_limit
        mem_pages=$(awk '/physpages/ {print $2}' "$bc_path" 2>/dev/null || echo "0")
        mem_limit=$(awk '/physpages/ {print $5}' "$bc_path" 2>/dev/null || echo "0")
        mem_used_bytes=$(( ${mem_pages:-0} * 4096 ))
        if [[ "${mem_limit:-0}" -gt 0 ]] && [[ "${mem_limit}" != "9223372036854775807" ]]; then
          mem_max_bytes=$(( mem_limit * 4096 ))
        else
          mem_max_bytes=$mem_used_bytes
        fi
      fi

      if [[ "$status" == "running" ]]; then
        vcpus=$(vzlist -H -o cpus "$ctid" 2>/dev/null | tr -d ' ' || echo "0")
        [[ "$vcpus" == "-" || -z "$vcpus" ]] && vcpus=0
      fi

      # CPU% — try vzstat/vestat result by ctid first, then by numeric veid
      cpu_pct="${vz_cpu[$ctid]:-0}"
      if [[ "$cpu_pct" == "0" || -z "$cpu_pct" || "$cpu_pct" == "-" ]]; then
        cpu_pct="${vz_cpu[$veid]:-0}"
      fi
      [[ -z "$cpu_pct" || "$cpu_pct" == "-" ]] && cpu_pct=0

      local hostname_escaped
      hostname_escaped=$(echo "$ct_hostname" | sed 's/"/\\"/g')

      json_entries+=("{\"containerId\":\"${ctid}\",\"name\":\"CT${ctid}\",\"type\":\"openvz\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$ct_ip" ] && echo "\"$ct_ip\"" || echo "null"),\"hostname\":$([ -n "$ct_hostname" ] && echo "\"$hostname_escaped\"" || echo "null"),\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{\"vcpus\":${vcpus},\"cpuPercent\":${cpu_pct},\"memoryUsageBytes\":${mem_used_bytes},\"memoryMaxBytes\":${mem_max_bytes},\"netRxBytesPerSec\":${rx_rate},\"netTxBytesPerSec\":${tx_rate}}}")
    done < <(vzlist -a -o ctid,ip,hostname,status -H 2>/dev/null)

  elif command -v prlctl &>/dev/null; then
    # Virtuozzo
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

      local rx_bytes=0 tx_bytes=0
      local short_uuid="${ct_uuid:0:8}"
      for netdir in /sys/class/net/veth*; do
        local ifname
        ifname=$(basename "$netdir" 2>/dev/null)
        if [[ "$ifname" == *"$short_uuid"* ]]; then
          rx_bytes=$(( rx_bytes + $(cat "$netdir/statistics/rx_bytes" 2>/dev/null || echo "0") ))
          tx_bytes=$(( tx_bytes + $(cat "$netdir/statistics/tx_bytes" 2>/dev/null || echo "0") ))
        fi
      done

      local mem_used_bytes=0 mem_max_bytes=0 vcpus=0 cpu_pct=0
      if [[ "$status" == "running" ]]; then
        local prl_stats
        prl_stats=$(prlctl statistics "$ct_uuid" 2>/dev/null || echo "")
        if [[ -n "$prl_stats" ]]; then
          cpu_pct=$(echo "$prl_stats" | awk '/cpu_usage/ {printf "%.1f", $2/100}' || echo "0")
          mem_used_bytes=$(echo "$prl_stats" | awk '/guest_ram_usage_bytes/ {print $2}' || echo "0")
        fi
        mem_max_bytes=$(prlctl list -i "$ct_uuid" 2>/dev/null | awk -F'[: ]+' '/memsize/ {print $2 * 1048576}' || echo "0")
        vcpus=$(prlctl list -i "$ct_uuid" 2>/dev/null | awk -F'[: ]+' '/cpus/ {print $2}' || echo "0")
      fi

      local name_escaped
      name_escaped=$(echo "$ct_name" | sed 's/"/\\"/g')

      json_entries+=("{\"containerId\":\"${ct_uuid}\",\"name\":\"${name_escaped}\",\"type\":\"virtuozzo\",\"status\":\"${status}\",\"ipAddress\":$([ -n "$ct_ip" ] && echo "\"$ct_ip\"" || echo "null"),\"hostname\":null,\"networkRxBytes\":${rx_bytes},\"networkTxBytes\":${tx_bytes},\"metadata\":{\"vcpus\":${vcpus:-0},\"cpuPercent\":${cpu_pct:-0},\"memoryUsageBytes\":${mem_used_bytes:-0},\"memoryMaxBytes\":${mem_max_bytes:-0}}}")
    done < <(prlctl list -a -o uuid,status,ip,name --no-header 2>/dev/null)
  fi

  if [[ ${#json_entries[@]} -eq 0 ]]; then
    return
  fi

  local IFS=','
  local payload="{\"serverId\":\"${SERVER_ID}\",\"containers\":[${json_entries[*]}]}"

  local auth_header=""
  [[ -n "$API_TOKEN" ]] && auth_header="-H \"Authorization: Bearer ${API_TOKEN}\""

  curl -s -X POST \
    -H "Content-Type: application/json" \
    ${auth_header} \
    -d "$payload" \
    "${API_URL}/api/agents/containers" >/dev/null 2>&1
}

gather
COLLECTORSCRIPT
  chmod +x /usr/local/bin/nodeprism-container-collector

  # Create systemd service and timer
  cat > /etc/systemd/system/nodeprism-container-collector.service <<SVCEOF
[Unit]
Description=NodePrism Container Metrics Collector
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nodeprism-container-collector
SVCEOF

  cat > /etc/systemd/system/nodeprism-container-collector.timer <<TIMEREOF
[Unit]
Description=Run NodePrism container metrics collector every 30s

[Timer]
OnBootSec=10s
OnUnitActiveSec=30s
AccuracySec=5s

[Install]
WantedBy=timers.target
TIMEREOF

  systemctl daemon-reload
  systemctl enable --now nodeprism-container-collector.timer >/dev/null 2>&1

  log_info "Container collector installed (updates every 30s)"
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
  open_firewall_port "$LISTEN_PORT"
  verify_installation
  generate_agent_certs
  register_with_api
  report_containers
  setup_container_collector
  print_summary
}

# ─── Main ─────────────────────────────────────────────────────────────
main() {
  check_root
  detect_os
  print_banner

  case "$COMMAND" in
    install)     do_install ;;
    uninstall)   do_uninstall ;;
    reconfigure) do_reconfigure ;;
    update)      do_update ;;
    auto-update) setup_auto_update_cron ;;
    status)      do_status ;;
    "")
      if [[ "${NODEPRISM_NO_TTY:-}" == "1" ]]; then
        echo ""
        log_error "No terminal available for interactive mode."
        echo ""
        echo "  Usage:  curl -sL http://<manager>:4000/agent-install.sh | sudo bash -s -- <command>"
        echo ""
        echo "  Commands:"
        echo "    install --non-interactive --type node_exporter    Install node_exporter"
        echo "    install --non-interactive --type promtail         Install promtail"
        echo "    status                                            Show agent status"
        echo "    install                                           Interactive install (needs TTY)"
        echo ""
        echo "  Interactive mode (save script first):"
        echo "    curl -sL http://<manager>:4000/agent-install.sh -o nodeprism-agent.sh"
        echo "    sudo bash nodeprism-agent.sh"
        echo ""
        exit 1
      fi
      main_menu
      ;;
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
}

# Close the wrapper function and run it.
# If piped (curl | bash), reconnect stdin to /dev/tty for interactive prompts.
# Use a subshell test to verify /dev/tty is actually openable (not just present as a node).
if [ -t 0 ]; then
  # Already have a terminal — run directly
  _nodeprism_main "$@"
elif (exec < /dev/tty) 2>/dev/null; then
  # Piped but /dev/tty is available — reconnect for interactive prompts
  _nodeprism_main "$@" < /dev/tty
else
  # No terminal available at all (e.g. cron, certain SSH/sudo contexts)
  # Force non-interactive if no command given, or run the command as-is
  export NODEPRISM_NO_TTY=1
  _nodeprism_main "$@"
fi
