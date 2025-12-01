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

# Install dependencies with shamefully-hoist for easier copying
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Build shared package first, then deployment-worker
RUN pnpm --filter @nodeprism/shared build
RUN pnpm --filter @nodeprism/deployment-worker build

# Create a production bundle - copy from root node_modules (shamefully-hoisted)
RUN mkdir -p /app/prod-deps/node_modules && \
    cp -rL /app/node_modules/* /app/prod-deps/node_modules/ 2>/dev/null || \
    cp -r /app/node_modules/* /app/prod-deps/node_modules/

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy built files
COPY --from=builder /app/packages/deployment-worker/dist ./dist
COPY --from=builder /app/packages/deployment-worker/package.json ./

# Copy resolved node_modules from builder
COPY --from=builder /app/prod-deps/node_modules ./node_modules

# Copy built shared package
COPY --from=builder /app/packages/shared/dist ./node_modules/@nodeprism/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@nodeprism/shared/

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
