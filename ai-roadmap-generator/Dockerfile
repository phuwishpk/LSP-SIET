# =============================================================================
# ai-roadmap-generator standalone Dockerfile
# =============================================================================
# Multi-stage build: install deps, build the Next.js app, run it with `next start`.
# The companion PocketBase service is wired up via docker-compose.
# =============================================================================

# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /workspace/ai-roadmap-generator
COPY ai-roadmap-generator/package.json ai-roadmap-generator/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /workspace
COPY shared ./shared
COPY ai-roadmap-generator ./ai-roadmap-generator
WORKDIR /workspace/ai-roadmap-generator
COPY --from=deps /workspace/ai-roadmap-generator/node_modules ./node_modules
RUN ln -sfn /workspace/ai-roadmap-generator/node_modules /workspace/shared/node_modules && \
    ln -sfn /workspace/ai-roadmap-generator/node_modules /workspace/node_modules
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

COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap-generator/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap-generator/public ./public
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap-generator/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap-generator/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /workspace/ai-roadmap-generator/next.config.js ./next.config.js

USER nextjs
EXPOSE 3000

CMD ["npx", "next", "start"]
