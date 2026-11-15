# =============================================================================
# LSP-SIET platform Dockerfile (the 7-container stack and the dev stack)
# =============================================================================
#
# Build context: workspace root (.)
# Layout assumption:
#   <root>/
#     platform/                     <- Python app (API, core, accounts) + host frontend
#     kmitl-rag/ community/ my-ai-quiz/ ai-roadmap/  <- the SIET parts (copied to /<dir>)
#     shared/                       <- shared UI (copied to /shared)
#     docker/platform/              <- this Dockerfile + supervisord.conf + wait-for-api.sh
#
# Multi-stage build that produces a single image running the FastAPI
# backend (port 5055), Streamlit UI (port 8502), and Next.js
# frontend (port 8502) under supervisord.
# =============================================================================

# ---- Build stage ----
FROM python:3.12-slim-trixie AS builder

# Install uv using the official method
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install build deps + Node.js 22.x LTS
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# UV_COMPILE_BYTECODE=0: on the low-RAM production server uv's bytecode
# compile ran past its 60s per-file limit and failed the build.
ENV MAKEFLAGS="-j$(nproc)" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=0 \
    UV_LINK_MODE=copy

WORKDIR /app

# Copy Python dependency files first for better layer caching. /app is platform/;
# every package gets its __init__.py now because the editable install maps only the
# packages that exist when it is built.
COPY platform/pyproject.toml platform/uv.lock platform/README.md ./
COPY platform/siet_core/__init__.py ./siet_core/__init__.py
COPY platform/api/__init__.py ./api/__init__.py
COPY platform/commands/__init__.py ./commands/__init__.py
COPY platform/siet_platform/__init__.py ./siet_platform/__init__.py
# The SIET parts are editable path dependencies at ../<dir> relative to /app
# (platform/pyproject.toml). Only their metadata here; the sources come later.
COPY kmitl-rag/pyproject.toml /kmitl-rag/pyproject.toml
COPY kmitl-rag/kmitl_rag/__init__.py /kmitl-rag/kmitl_rag/__init__.py
COPY community/pyproject.toml /community/pyproject.toml
COPY community/siet_community/__init__.py /community/siet_community/__init__.py
COPY my-ai-quiz/pyproject.toml /my-ai-quiz/pyproject.toml
COPY my-ai-quiz/siet_quiz/__init__.py /my-ai-quiz/siet_quiz/__init__.py
COPY ai-roadmap/pyproject.toml /ai-roadmap/pyproject.toml
COPY ai-roadmap/siet_roadmap/__init__.py /ai-roadmap/siet_roadmap/__init__.py

RUN uv sync --frozen --no-dev

# Pre-download tiktoken encoding so the app works offline (issue #264).
# /app/tiktoken-cache is intentionally outside /app/data/ so that volume mounts
# of /app/data (for user data persistence) do not hide the pre-baked encoding.
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken-cache
RUN mkdir -p /app/tiktoken-cache && \
    .venv/bin/python -c "import tiktoken; tiktoken.get_encoding('o200k_base')"

# Install frontend dependencies before copying application source so ordinary
# source edits do not invalidate the expensive npm ci layer. The host frontend is
# built at /platform/frontend (the repository layout under /): its tsconfig paths
# reach the parts at ../../<part>/frontend/src.
WORKDIR /platform/frontend
ARG NPM_REGISTRY=https://registry.npmjs.org/
COPY platform/frontend/package.json platform/frontend/package-lock.json ./
RUN npm config set registry ${NPM_REGISTRY} \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000
# Retry npm ci to survive transient registry ECONNRESETs, which are common on
# the QEMU-emulated arm64 leg of the multi-arch build.
RUN (i=0; until npm ci; do \
      i=$((i+1)); \
      if [ "$i" -ge 3 ]; then echo "npm ci failed, falling back to npm install"; npm install --no-audit --no-fund; break; fi; \
      echo "npm ci failed (attempt $i); retrying in 10s"; sleep 10; \
    done)

# Copy the application only after both dependency layers are ready.
WORKDIR /app
COPY platform/ /app/
COPY kmitl-rag/ /kmitl-rag/
COPY community/ /community/
COPY my-ai-quiz/ /my-ai-quiz/
COPY ai-roadmap/ /ai-roadmap/
COPY shared/ /shared/
COPY platform/frontend/ /platform/frontend/
# The host frontend is built at /platform/frontend and the two standalone apps have
# their own Dockerfiles; drop their sources from the Python tree.
RUN rm -rf /app/frontend /my-ai-quiz/app /ai-roadmap/app

# The host app's route files for the parts' pages are generated and committed:
# fail the build if they are stale (never write here).
COPY scripts/frontend-routes.mjs /scripts/frontend-routes.mjs
RUN node /scripts/frontend-routes.mjs --check

# SIET frontend packages are compiled into this app (tsconfig paths @siet/*,
# @shared/*) and resolve their imports through the app's node_modules.
RUN for d in kmitl-rag community my-ai-quiz ai-roadmap; do ln -sfn /platform/frontend/node_modules /$d/frontend/node_modules; done \
 && ln -sfn /platform/frontend/node_modules /shared/node_modules

WORKDIR /platform/frontend
RUN npm run build

WORKDIR /app

# ---- Runtime stage ----
FROM python:3.12-slim-trixie AS runtime

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    ffmpeg \
    supervisor \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app
COPY --from=builder /kmitl-rag /kmitl-rag
COPY --from=builder /community /community
COPY --from=builder /my-ai-quiz /my-ai-quiz
COPY --from=builder /ai-roadmap /ai-roadmap
COPY --from=builder /shared /shared
COPY --from=builder /app/tiktoken-cache /app/tiktoken-cache

ENV UV_NO_SYNC=1 \
    VIRTUAL_ENV=/app/.venv \
    TIKTOKEN_CACHE_DIR=/app/tiktoken-cache \
    HOSTNAME=0.0.0.0 \
    API_HOST=0.0.0.0

# Copy built frontend from builder stage (built at /platform/frontend, run from /app/frontend)
COPY --from=builder /platform/frontend/.next/standalone /app/frontend/
COPY --from=builder /platform/frontend/.next/static /app/frontend/.next/static
COPY --from=builder /platform/frontend/public /app/frontend/public
COPY --from=builder /platform/frontend/start-server.js /app/frontend/start-server.js

# Streamlit config: baseUrlPath=/streamlit for Traefik StripPrefix
RUN mkdir -p /app/streamlit && \
    printf '[server]\nbaseUrlPath = "/streamlit"\nheadless = true\n' > /app/streamlit/config.toml

EXPOSE 8502 5055

RUN mkdir -p /app/data /var/log/supervisor

# Copy and make executable the wait-for-api script + supervisord config
COPY docker/platform/wait-for-api.sh /app/scripts/wait-for-api.sh
RUN chmod +x /app/scripts/wait-for-api.sh
COPY docker/platform/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
