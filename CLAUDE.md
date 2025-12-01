# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

THE MOST IMPORTANT RULES ARE:

1. You MUST ALWAYS find the root cause of a problem, before giving a solution.
2. Patching without understanding the problem IS NOT ALLOWED.
3. Before patching code, we MUST understand the code base and the potential implications of our changes.
4. We do not duplicate code. We first check if similar code already exists and to reuse it.

## Port Management

**IMPORTANT**: When starting the app, ALWAYS kill any processes using the designated ports first:
- Port 3000: Web UI (Next.js)
- Port 4000: API Server
- Port 4001: Deployment Worker
- Port 4002: Config Sync
- Port 4003: Anomaly Detector

Run this command before starting the app:
```bash
lsof -ti:3000,4000,4001,4002,4003 2>/dev/null | xargs kill -9 2>/dev/null; pnpm run dev
```

## Dev Performance

The Next.js dev server compiles pages on-demand, causing slow first loads (1-2s). After the first visit, pages load quickly (30-60ms).

**To pre-warm all pages after startup** (improves subsequent navigation):
```bash
sleep 30 && for p in / /dashboard /servers /alerts /logs /metrics /settings; do curl -s http://localhost:3000$p > /dev/null; done
```

**Optimizations applied:**
- Using `tsx` instead of `ts-node` for backend services (faster compilation)
- Turbopack enabled for Next.js (`next dev --turbo`)
- React Strict Mode disabled (prevents double renders)