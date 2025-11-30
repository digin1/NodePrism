#!/bin/bash

# Veeble Node Vitals - Manager Node Setup Script
# This script sets up the manager node with all required services

set -e

echo "🚀 Veeble Node Vitals - Manager Node Setup"
echo "==========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker is installed"
echo ""

# Check if PNPM is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ PNPM is not installed. Installing PNPM..."
    npm install -g pnpm
fi

echo "✅ PNPM is installed"
echo ""

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
pnpm install
echo ""

# Create necessary directories
echo "📁 Creating required directories..."
mkdir -p infrastructure/docker/prometheus/targets/node-exporter
mkdir -p infrastructure/docker/prometheus/targets/app-agent
mkdir -p infrastructure/docker/prometheus/targets/mysql-exporter
mkdir -p infrastructure/docker/prometheus/targets/postgres-exporter
mkdir -p infrastructure/docker/prometheus/targets/mongodb-exporter
mkdir -p infrastructure/docker/prometheus/targets/nginx-exporter
mkdir -p infrastructure/docker/prometheus/targets/apache-exporter
mkdir -p agents/downloads
echo "✅ Directories created"
echo ""

# Copy environment files
echo "📝 Setting up environment files..."
if [ ! -f packages/api/.env ]; then
    cp packages/api/.env.example packages/api/.env
    echo "✅ Created packages/api/.env"
fi

if [ ! -f packages/web/.env.local ]; then
    cp packages/web/.env.example packages/web/.env.local
    echo "✅ Created packages/web/.env.local"
fi
echo ""

# Start Docker services
echo "🐳 Starting Docker services..."
cd infrastructure/docker
docker-compose up -d
cd ../..
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10
echo ""

# Check service health
echo "🏥 Checking service health..."
echo "- PostgreSQL: $(docker inspect --format='{{.State.Health.Status}}' veeble-postgres 2>/dev/null || echo 'not running')"
echo "- Redis: $(docker inspect --format='{{.State.Health.Status}}' veeble-redis 2>/dev/null || echo 'not running')"
echo "- RabbitMQ: $(docker inspect --format='{{.State.Health.Status}}' veeble-rabbitmq 2>/dev/null || echo 'not running')"
echo "- Prometheus: $(docker inspect --format='{{.State.Status}}' veeble-prometheus 2>/dev/null || echo 'not running')"
echo "- Grafana: $(docker inspect --format='{{.State.Status}}' veeble-grafana 2>/dev/null || echo 'not running')"
echo "- Loki: $(docker inspect --format='{{.State.Status}}' veeble-loki 2>/dev/null || echo 'not running')"
echo "- AlertManager: $(docker inspect --format='{{.State.Status}}' veeble-alertmanager 2>/dev/null || echo 'not running')"
echo ""

echo "✅ Setup complete!"
echo ""
echo "📊 Access the services:"
echo "- Next.js UI: http://localhost:3000 (run 'pnpm dev' to start)"
echo "- API Gateway: http://localhost:4000 (run 'pnpm dev' to start)"
echo "- Grafana: http://localhost:3001 (admin/admin)"
echo "- Prometheus: http://localhost:9090"
echo "- AlertManager: http://localhost:9093"
echo "- RabbitMQ Management: http://localhost:15672 (veeble/${RABBITMQ_PASSWORD})"
echo ""
echo "🚀 Next steps:"
echo "1. Run 'pnpm dev' to start development servers"
echo "2. Visit http://localhost:3000 to access the UI"
echo "3. Check the README.md for more information"
