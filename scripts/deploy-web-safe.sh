#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PM2_BIN="$ROOT_DIR/node_modules/.bin/pm2"

if [[ ! -x "$PM2_BIN" ]]; then
  echo "Local PM2 binary not found at $PM2_BIN" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "[deploy-web-safe] Stopping nodeprism-web"
"$PM2_BIN" stop nodeprism-web || true

echo "[deploy-web-safe] Cleaning previous Next.js artifacts"
pnpm --filter @nodeprism/web clean

echo "[deploy-web-safe] Building web app"
pnpm --filter @nodeprism/web build

echo "[deploy-web-safe] Starting nodeprism-web with updated environment"
"$PM2_BIN" start ecosystem.config.js --only nodeprism-web --update-env

echo "[deploy-web-safe] nodeprism-web deployed successfully"
