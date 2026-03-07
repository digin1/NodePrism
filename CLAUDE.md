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
- Port 4002: Config Sync
- Port 4003: Anomaly Detector
- Port 9101: Agent App

## Starting the App (Production Mode)

The app runs in **production mode by default**. Build first, then start:
```bash
lsof -ti:3000,4000,4002,4003,9101 2>/dev/null | xargs kill -9 2>/dev/null; pnpm run build && pnpm run start
```

For development/debugging only:
```bash
lsof -ti:3000,4000,4002,4003,9101 2>/dev/null | xargs kill -9 2>/dev/null; pnpm run dev
```

**Production mode benefits:**
- Next.js serves pre-built pages (instant loads vs 1-2s dev compilation)
- Backend runs compiled JS (faster startup, lower memory)
- No file watchers consuming resources
- React Strict Mode double-renders disabled