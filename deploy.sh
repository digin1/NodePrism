#!/bin/bash
set -euo pipefail

# ============================================
# NodePrism - One-Time Deployment Script
# ============================================
# Installs all dependencies and deploys NodePrism
# Tested on Ubuntu 22.04/24.04 and Debian 12
# Usage: curl -sL https://raw.githubusercontent.com/digin1/NodePrism/main/deploy.sh | sudo bash
# ============================================

NODEPRISM_DIR="/opt/nodeprism"
NODEPRISM_USER="nodeprism"
NODE_VERSION="20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[NodePrism]${NC} $1"; }
warn() { echo -e "${YELLOW}[NodePrism]${NC} $1"; }
err()  { echo -e "${RED}[NodePrism]${NC} $1" >&2; }

# Must run as root
if [ "$(id -u)" -ne 0 ]; then
  err "This script must be run as root (use sudo)"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="$ID"
else
  err "Unsupported OS — /etc/os-release not found"
  exit 1
fi

if [[ "$OS_ID" != "ubuntu" && "$OS_ID" != "debian" ]]; then
  warn "This script is designed for Ubuntu/Debian. Proceeding anyway..."
fi

# ============================================
# 1. System packages
# ============================================
log "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl wget git ca-certificates gnupg lsb-release jq > /dev/null

# ============================================
# 2. Docker Engine
# ============================================
if command -v docker &> /dev/null; then
  log "Docker already installed: $(docker --version)"
else
  log "Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} \
    $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin > /dev/null
  systemctl enable docker
  systemctl start docker
  log "Docker installed: $(docker --version)"
fi

# ============================================
# 3. Node.js 20
# ============================================
if command -v node &> /dev/null && node -v | grep -q "v${NODE_VERSION}"; then
  log "Node.js already installed: $(node -v)"
else
  log "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
  log "Node.js installed: $(node -v)"
fi

# ============================================
# 4. pnpm
# ============================================
if command -v pnpm &> /dev/null; then
  log "pnpm already installed: $(pnpm -v)"
else
  log "Installing pnpm..."
  npm install -g pnpm@8 > /dev/null 2>&1
  log "pnpm installed: $(pnpm -v)"
fi

# ============================================
# 5. PM2
# ============================================
if command -v pm2 &> /dev/null; then
  log "PM2 already installed: $(pm2 -v)"
else
  log "Installing PM2..."
  npm install -g pm2 > /dev/null 2>&1
  log "PM2 installed: $(pm2 -v)"
fi

# ============================================
# 6. Create nodeprism user (if needed)
# ============================================
if id "$NODEPRISM_USER" &>/dev/null; then
  log "User '$NODEPRISM_USER' already exists"
else
  log "Creating user '$NODEPRISM_USER'..."
  useradd -r -m -s /bin/bash "$NODEPRISM_USER"
  usermod -aG docker "$NODEPRISM_USER"
fi

# ============================================
# 7. Clone repository
# ============================================
if [ -d "$NODEPRISM_DIR" ]; then
  log "Directory $NODEPRISM_DIR already exists — pulling latest..."
  cd "$NODEPRISM_DIR"
  sudo -u "$NODEPRISM_USER" git pull --ff-only || warn "Git pull failed — using existing code"
else
  log "Cloning NodePrism to $NODEPRISM_DIR..."
  git clone https://github.com/digin1/NodePrism.git "$NODEPRISM_DIR"
  chown -R "$NODEPRISM_USER":"$NODEPRISM_USER" "$NODEPRISM_DIR"
fi

cd "$NODEPRISM_DIR"

# ============================================
# 8. Environment configuration
# ============================================
if [ ! -f .env ]; then
  log "Creating .env from .env.example..."
  cp .env.example .env

  # Auto-detect server IP
  SERVER_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  if [ -n "$SERVER_IP" ]; then
    sed -i "s/^SERVER_IP=.*/SERVER_IP=${SERVER_IP}/" .env
    sed -i "s|^APP_URL=.*|APP_URL=http://${SERVER_IP}:3000|" .env
    log "Auto-detected server IP: $SERVER_IP"
  else
    warn "Could not detect server IP — edit .env and set SERVER_IP manually"
  fi

  # Generate a random JWT secret
  JWT_SECRET=$(openssl rand -hex 32)
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env

  chown "$NODEPRISM_USER":"$NODEPRISM_USER" .env
else
  log ".env already exists — skipping"
fi

# Symlink .env for Docker Compose
ln -sf "$NODEPRISM_DIR/.env" "$NODEPRISM_DIR/infrastructure/docker/.env"

# ============================================
# 9. Initialize Prometheus configs
# ============================================
log "Initializing Prometheus configuration..."
bash infrastructure/docker/init-prometheus.sh

# ============================================
# 10. Create logs directory
# ============================================
mkdir -p logs
chown "$NODEPRISM_USER":"$NODEPRISM_USER" logs

# ============================================
# 11. Install Node.js dependencies
# ============================================
log "Installing Node.js dependencies (this may take a few minutes)..."
sudo -u "$NODEPRISM_USER" pnpm install --frozen-lockfile 2>/dev/null || sudo -u "$NODEPRISM_USER" pnpm install

# ============================================
# 12. Start Docker infrastructure
# ============================================
log "Starting Docker infrastructure..."
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Wait for PostgreSQL to be healthy
log "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
  if docker exec nodeprism-postgres pg_isready -U nodeprism &>/dev/null; then
    break
  fi
  sleep 2
done

# ============================================
# 13. Build and generate Prisma client
# ============================================
log "Building application..."
sudo -u "$NODEPRISM_USER" pnpm run build

# Push database schema
log "Pushing database schema..."
cd packages/api
sudo -u "$NODEPRISM_USER" npx prisma db push --skip-generate 2>/dev/null || true
cd "$NODEPRISM_DIR"

# ============================================
# 14. Start with PM2
# ============================================
log "Starting NodePrism with PM2..."
sudo -u "$NODEPRISM_USER" pm2 start ecosystem.config.js
sudo -u "$NODEPRISM_USER" pm2 save

# Set up PM2 to start on boot
env PATH="$PATH" pm2 startup systemd -u "$NODEPRISM_USER" --hp "/home/$NODEPRISM_USER" > /dev/null 2>&1 || true

# ============================================
# 15. Summary
# ============================================
SERVER_IP=$(grep '^SERVER_IP=' .env 2>/dev/null | cut -d= -f2 || echo "localhost")

echo ""
echo "============================================"
log "NodePrism deployed successfully!"
echo "============================================"
echo ""
echo "  Web UI:       http://${SERVER_IP}:3000"
echo "  Grafana:      http://${SERVER_IP}:3000/grafana/"
echo "  Prometheus:   http://${SERVER_IP}:3000/prometheus/"
echo "  AlertManager: http://${SERVER_IP}:3000/alertmanager/"
echo ""
echo "  Register your first admin account at the Web UI."
echo ""
echo "  To monitor remote servers, run on each server:"
echo "    curl -sL http://${SERVER_IP}:3000/agent-install.sh | sudo bash"
echo ""
echo "  PM2 commands:"
echo "    pm2 status          # Check service status"
echo "    pm2 logs            # View logs"
echo "    pm2 restart all     # Restart all services"
echo ""
echo "  Documentation: https://digin1.github.io/NodePrism/"
echo ""
echo "============================================"
