# =============================================================================
# ai-roadmap standalone Dockerfile
# =============================================================================
# Build context: the repository root (the app imports shared/, a sibling of ai-roadmap/).
#   docker build -f ai-roadmap/app/Dockerfile -t ai-roadmap .
# The image mirrors the repository layout (/workspace/ai-roadmap/app, /workspace/shared).
# Multi-stage build: install deps, build the Next.js app, run it with `next start`.
# The companion PocketBase service is wired up via docker-compose.
# =============================================================================

# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /workspace/ai-roadmap/app
COPY ai-roadmap/app/package.json ai-roadmap/app/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /workspace
COPY shared ./shared
COPY ai-roadmap/app ./ai-roadmap/app
WORKDIR /workspace/ai-roadmap/app
COPY --from=deps /workspace/ai-roadmap/app/node_modules ./node_modules
RUN ln -sfn /workspace/ai-roadmap/app/node_modules /workspace/shared/node_modules && \
    ln -sfn /workspace/ai-roadmap/app/node_modules /workspace/node_modules
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap/app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap/app/public ./public
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap/app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap/app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap/app/next.config.js ./next.config.js

USER nextjs
EXPOSE 3000

CMD ["npx", "next", "start"]
