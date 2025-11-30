FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/shared ./packages/shared
COPY packages/deployment-worker ./packages/deployment-worker

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package first, then deployment-worker
RUN pnpm --filter @veeble/shared build
RUN pnpm --filter @veeble/deployment-worker build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy built files
COPY --from=builder /app/packages/deployment-worker/dist ./dist
COPY --from=builder /app/packages/deployment-worker/package.json ./

# Copy scripts for deployment
COPY --from=builder /app/packages/deployment-worker/node_modules ./node_modules

# Create directory for SSH keys
RUN mkdir -p /app/ssh && chown worker:nodejs /app/ssh

# Create directory for scripts
RUN mkdir -p /app/scripts && chown worker:nodejs /app/scripts

USER worker

# Environment variables
ENV NODE_ENV=production
ENV RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
ENV API_URL=http://api:3001
ENV SSH_PRIVATE_KEY_PATH=/app/ssh/id_rsa
ENV AGENT_SCRIPTS_PATH=/app/scripts

CMD ["node", "dist/index.js"]
