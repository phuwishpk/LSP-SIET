# =============================================================================
# open-notebook Dockerfile
# =============================================================================
#
# Build context: workspace root (.)
# Layout assumption:
#   <root>/
#     open-notebook/                <- Python app + frontend source
#     docker/open-notebook/         <- this Dockerfile + supervisord.conf + wait-for-api.sh
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

ENV MAKEFLAGS="-j$(nproc)" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Copy Python dependency files first for better layer caching
COPY open-notebook/pyproject.toml open-notebook/uv.lock ./
COPY open-notebook/open_notebook/__init__.py ./open_notebook/__init__.py

RUN uv sync --frozen --no-dev

# Pre-download tiktoken encoding so the app works offline (issue #264).
# /app/tiktoken-cache is intentionally outside /app/data/ so that volume mounts
# of /app/data (for user data persistence) do not hide the pre-baked encoding.
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken-cache
RUN mkdir -p /app/tiktoken-cache && \
    .venv/bin/python -c "import tiktoken; tiktoken.get_encoding('o200k_base')"

# Copy the rest of the open-notebook source
COPY open-notebook/ /app/

# Build the embedded Next.js frontend
WORKDIR /app/frontend
ARG NPM_REGISTRY=https://registry.npmjs.org/
COPY open-notebook/frontend/package.json open-notebook/frontend/package-lock.json ./
RUN npm config set registry ${NPM_REGISTRY} \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000
# Retry npm ci to survive transient registry ECONNRESETs, which are common on
# the QEMU-emulated arm64 leg of the multi-arch build.
RUN i=0; until npm ci; do \
      i=$((i+1)); \
      if [ "$i" -ge 5 ]; then echo "npm ci failed after $i attempts"; exit 1; fi; \
      echo "npm ci failed (attempt $i); retrying in 15s"; sleep 15; \
    done
COPY open-notebook/frontend/ ./
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
COPY --from=builder /app/tiktoken-cache /app/tiktoken-cache

ENV UV_NO_SYNC=1 \
    VIRTUAL_ENV=/app/.venv \
    TIKTOKEN_CACHE_DIR=/app/tiktoken-cache \
    HOSTNAME=0.0.0.0 \
    API_HOST=0.0.0.0

# Copy built frontend from builder stage
COPY --from=builder /app/frontend/.next/standalone /app/frontend/
COPY --from=builder /app/frontend/.next/static /app/frontend/.next/static
COPY --from=builder /app/frontend/public /app/frontend/public
COPY --from=builder /app/frontend/start-server.js /app/frontend/start-server.js

# Streamlit config: baseUrlPath=/streamlit for Traefik StripPrefix
RUN mkdir -p /app/streamlit && \
    printf '[server]\nbaseUrlPath = "/streamlit"\nheadless = true\n' > /app/streamlit/config.toml

EXPOSE 8502 5055

RUN mkdir -p /app/data /var/log/supervisor

# Copy and make executable the wait-for-api script + supervisord config
COPY docker/open-notebook/wait-for-api.sh /app/scripts/wait-for-api.sh
RUN chmod +x /app/scripts/wait-for-api.sh
COPY docker/open-notebook/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
