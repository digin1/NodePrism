#!/bin/bash

# Download pre-built agent binaries
# This script will be used in Phase 3 to download Node Exporter and other exporters

set -e

echo "📥 Downloading agent binaries..."
echo "================================"
echo ""

AGENTS_DIR="agents/downloads"
mkdir -p "$AGENTS_DIR"

# Node Exporter version
NODE_EXPORTER_VERSION="1.7.0"
ARCH="linux-amd64"

echo "⬇️  Downloading Node Exporter v${NODE_EXPORTER_VERSION}..."
curl -L "https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/node_exporter-${NODE_EXPORTER_VERSION}.${ARCH}.tar.gz" \
    -o "$AGENTS_DIR/node_exporter.tar.gz"

echo "📦 Extracting Node Exporter..."
tar -xzf "$AGENTS_DIR/node_exporter.tar.gz" -C "$AGENTS_DIR"
mv "$AGENTS_DIR/node_exporter-${NODE_EXPORTER_VERSION}.${ARCH}/node_exporter" "$AGENTS_DIR/"
rm -rf "$AGENTS_DIR/node_exporter-${NODE_EXPORTER_VERSION}.${ARCH}" "$AGENTS_DIR/node_exporter.tar.gz"

echo "✅ Node Exporter downloaded"
echo ""

# TODO: Download other exporters in Phase 3
# - MySQL Exporter
# - PostgreSQL Exporter
# - MongoDB Exporter
# - Nginx Exporter
# - Apache Exporter
# - Promtail

echo "✅ All agents downloaded successfully!"
echo ""
echo "📁 Agents location: $AGENTS_DIR/"
