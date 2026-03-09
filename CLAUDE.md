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

## Starting the App (Production Mode with PM2)

The app uses **PM2 for production process management**. Build first, then start:
```bash
pnpm run build && pnpm run start:pm2
```

PM2 commands:
```bash
pnpm run status:pm2    # Check service status
pnpm run logs:pm2      # Tail all logs
pnpm run stop:pm2      # Stop all services
pnpm run restart:pm2   # Restart all services
```

For development/debugging only (uses turborepo, not PM2):
```bash
lsof -ti:3000,4000,4002,4003,9101 2>/dev/null | xargs kill -9 2>/dev/null; pnpm run dev
```

**PM2 benefits over turborepo start:**
- Each service is independently managed (one crash doesn't cascade)
- Auto-restart on failure with memory limits
- Persistent across server reboots (systemd integration)
- Log files in `logs/` directory
- Process monitoring via `pm2 monit`