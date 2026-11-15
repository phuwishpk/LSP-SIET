# =============================================================================
# my-ai-quiz standalone Dockerfile
# =============================================================================
# Build context: the repository root (the app imports shared/, a sibling of my-ai-quiz/).
#   docker build -f my-ai-quiz/app/Dockerfile -t my-ai-quiz .
# Multi-stage build: install deps, build the Next.js app, run its standalone server.
# The image mirrors the repository layout (/workspace/my-ai-quiz/app, /workspace/shared):
# the tracing root is the repository root, so server.js lands at my-ai-quiz/app/server.js.
# =============================================================================

# ---- Dependencies ----
FROM node:22-slim AS deps
WORKDIR /workspace/my-ai-quiz/app
COPY my-ai-quiz/app/package.json my-ai-quiz/app/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- Build ----
FROM node:22-slim AS builder
WORKDIR /workspace
COPY shared ./shared
COPY my-ai-quiz/app ./my-ai-quiz/app
WORKDIR /workspace/my-ai-quiz/app
COPY --from=deps /workspace/my-ai-quiz/app/node_modules ./node_modules
RUN ln -sfn /workspace/my-ai-quiz/app/node_modules /workspace/shared/node_modules && \
    ln -sfn /workspace/my-ai-quiz/app/node_modules /workspace/node_modules
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runtime ----
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /workspace/my-ai-quiz/app/public ./public
COPY --from=builder /workspace/my-ai-quiz/app/public ./my-ai-quiz/app/public
RUN mkdir -p .next ./my-ai-quiz/app/.next
COPY --from=builder --chown=nextjs:nodejs /workspace/my-ai-quiz/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/my-ai-quiz/app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/my-ai-quiz/app/.next/static ./my-ai-quiz/app/.next/static

USER nextjs
EXPOSE 3000

CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f my-ai-quiz/app/server.js ]; then cd my-ai-quiz/app && node server.js; else npx next start; fi"]
