# =============================================================================
# My-ai-quiz standalone Dockerfile
# =============================================================================
# Multi-stage build: install deps, build the Next.js app, run it with `next start`.
# =============================================================================

# ---- Dependencies ----
FROM node:22-slim AS deps
WORKDIR /workspace/My-ai-quiz
COPY My-ai-quiz/package.json My-ai-quiz/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- Build ----
FROM node:22-slim AS builder
WORKDIR /workspace
COPY shared ./shared
COPY My-ai-quiz ./My-ai-quiz
WORKDIR /workspace/My-ai-quiz
COPY --from=deps /workspace/My-ai-quiz/node_modules ./node_modules
RUN ln -sfn /workspace/My-ai-quiz/node_modules /workspace/shared/node_modules && \
    ln -sfn /workspace/My-ai-quiz/node_modules /workspace/node_modules
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

COPY --from=builder /workspace/My-ai-quiz/public ./public
COPY --from=builder /workspace/My-ai-quiz/public ./My-ai-quiz/public
RUN mkdir -p .next ./My-ai-quiz/.next
COPY --from=builder --chown=nextjs:nodejs /workspace/My-ai-quiz/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/My-ai-quiz/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/My-ai-quiz/.next/static ./My-ai-quiz/.next/static

USER nextjs
EXPOSE 3000

CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f My-ai-quiz/server.js ]; then cd My-ai-quiz && node server.js; else npx next start; fi"]
