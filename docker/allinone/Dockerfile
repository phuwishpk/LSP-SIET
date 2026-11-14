# =============================================================================
# LSP-SIET all-in-one image (docs/superpowers/specs/2026-11-14-single-container-deploy-design.md)
#
# One container runs everything, supervised by s6-overlay:
#   nginx :80  ->  /api -> uvicorn 127.0.0.1:5055
#                  /quiz -> AI Quiz (Next 16)       127.0.0.1:3001
#                  /roadmap -> AI Roadmap (Next 13) 127.0.0.1:3002
#                  /    -> SIET Space (Next 16)     127.0.0.1:8502
#   MariaDB 127.0.0.1:3306, SurrealDB 127.0.0.1:8000, Redis 127.0.0.1:6379
#   surreal-commands-worker
# All state lives in /data (one volume). Application code is unchanged: this
# file only changes how the apps are built and started.
#
# Build context: repository root.
#   docker buildx build -f docker/allinone/Dockerfile -t lsp-siet .
# =============================================================================

ARG PYTHON_IMAGE=python:3.12-slim-trixie
ARG NODE_IMAGE=node:22-slim
ARG SURREAL_IMAGE=surrealdb/surrealdb:v2.6.5
ARG S6_OVERLAY_VERSION=3.2.0.2

# ---- SurrealDB binary (same version as the running stack) ----
FROM ${SURREAL_IMAGE} AS surreal

# ---- Python virtualenv: open-notebook + SIET packages ----
FROM ${PYTHON_IMAGE} AS py
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/
# Bytecode is compiled here (CI), not on the 3.3 GB server.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
# Dependency metadata first (same layering as docker/open-notebook/Dockerfile):
# the SIET packages are editable path dependencies, their sources come later.
COPY open-notebook/pyproject.toml open-notebook/uv.lock ./
COPY open-notebook/open_notebook/__init__.py ./open_notebook/__init__.py
COPY siet-platform/pyproject.toml /siet-platform/pyproject.toml
COPY siet-platform/siet_platform/__init__.py /siet-platform/siet_platform/__init__.py
COPY kmitl-rag/pyproject.toml /kmitl-rag/pyproject.toml
COPY kmitl-rag/kmitl_rag/__init__.py /kmitl-rag/kmitl_rag/__init__.py
COPY community/pyproject.toml /community/pyproject.toml
COPY community/siet_community/__init__.py /community/siet_community/__init__.py
RUN uv sync --frozen --no-dev
COPY open-notebook/ /app/
COPY siet-platform/ /siet-platform/
COPY kmitl-rag/ /kmitl-rag/
COPY community/ /community/
# The frontend is built in its own stage; drop its sources from the Python tree.
RUN rm -rf /app/frontend /siet-platform/frontend /kmitl-rag/frontend /community/frontend
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken-cache
RUN mkdir -p /app/tiktoken-cache \
 && .venv/bin/python -c "import tiktoken; tiktoken.get_encoding('o200k_base')"

# ---- SIET Space frontend (Next 16, standalone) ----
FROM ${NODE_IMAGE} AS web
WORKDIR /app/frontend
COPY open-notebook/frontend/package.json open-notebook/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY open-notebook/frontend/ /app/frontend/
COPY siet-platform/frontend/ /siet-platform/frontend/
COPY kmitl-rag/frontend/ /kmitl-rag/frontend/
COPY community/frontend/ /community/frontend/
COPY shared/ /shared/
RUN for d in siet-platform kmitl-rag community; do ln -sfn /app/frontend/node_modules /$d/frontend/node_modules; done \
 && ln -sfn /app/frontend/node_modules /shared/node_modules
# Next bakes the /api rewrite target at build time: point it at the API inside
# this container (127.0.0.1, not "localhost", which Node may resolve to ::1).
ENV NEXT_TELEMETRY_DISABLED=1 INTERNAL_API_URL=http://127.0.0.1:5055
RUN npm run build

# ---- AI Quiz (Next 16, standalone; same steps as My-ai-quiz/Dockerfile) ----
FROM ${NODE_IMAGE} AS quiz
WORKDIR /workspace/My-ai-quiz
COPY My-ai-quiz/package.json My-ai-quiz/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
WORKDIR /workspace
COPY shared ./shared
COPY My-ai-quiz ./My-ai-quiz
WORKDIR /workspace/My-ai-quiz
RUN ln -sfn /workspace/My-ai-quiz/node_modules /workspace/shared/node_modules \
 && ln -sfn /workspace/My-ai-quiz/node_modules /workspace/node_modules
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- AI Roadmap (Next 13, `next start`; same steps as ai-roadmap-generator/Dockerfile) ----
FROM ${NODE_IMAGE} AS roadmap
WORKDIR /workspace/ai-roadmap-generator
COPY ai-roadmap-generator/package.json ai-roadmap-generator/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
WORKDIR /workspace
COPY shared ./shared
COPY ai-roadmap-generator ./ai-roadmap-generator
WORKDIR /workspace/ai-roadmap-generator
RUN ln -sfn /workspace/ai-roadmap-generator/node_modules /workspace/shared/node_modules \
 && ln -sfn /workspace/ai-roadmap-generator/node_modules /workspace/node_modules
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ---- Runtime ----
FROM ${PYTHON_IMAGE} AS runtime
ARG S6_OVERLAY_VERSION
ARG TARGETARCH

# ffmpeg is kept from the previous image (content extraction); mariadb, redis
# and nginx replace their own containers; xz-utils unpacks s6-overlay.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils ffmpeg \
        mariadb-server redis-server nginx-light \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

RUN case "${TARGETARCH:-amd64}" in amd64) S6_ARCH=x86_64 ;; arm64) S6_ARCH=aarch64 ;; *) echo "unsupported arch ${TARGETARCH}"; exit 1 ;; esac \
 && curl -fsSL -o /tmp/s6-noarch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" \
 && curl -fsSL -o /tmp/s6-arch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" \
 && tar -C / -Jxpf /tmp/s6-noarch.tar.xz \
 && tar -C / -Jxpf /tmp/s6-arch.tar.xz \
 && rm /tmp/s6-noarch.tar.xz /tmp/s6-arch.tar.xz

# Node runtime only (no npm/nodesource apt repo needed at runtime).
COPY --from=web /usr/local/bin/node /usr/local/bin/node
COPY --from=surreal /surreal /usr/local/bin/surreal

RUN useradd --system --uid 1000 --home-dir /app --shell /usr/sbin/nologin lsp

# Python app (code + venv), SIET packages, prompts, tiktoken cache.
COPY --from=py --chown=lsp:lsp /app /app
COPY --from=py --chown=lsp:lsp /siet-platform /siet-platform
COPY --from=py --chown=lsp:lsp /kmitl-rag /kmitl-rag
COPY --from=py --chown=lsp:lsp /community /community
COPY --chown=lsp:lsp shared /shared

# SIET Space frontend (standalone server.js, as in docker/open-notebook/Dockerfile)
COPY --from=web --chown=lsp:lsp /app/frontend/.next/standalone /app/frontend/
COPY --from=web --chown=lsp:lsp /app/frontend/.next/static /app/frontend/.next/static
COPY --from=web --chown=lsp:lsp /app/frontend/public /app/frontend/public

# AI Quiz standalone (server.js lives under My-ai-quiz/ because the tracing root is the repo)
COPY --from=quiz --chown=lsp:lsp /workspace/My-ai-quiz/.next/standalone /opt/quiz/
COPY --from=quiz --chown=lsp:lsp /workspace/My-ai-quiz/.next/static /opt/quiz/My-ai-quiz/.next/static
COPY --from=quiz --chown=lsp:lsp /workspace/My-ai-quiz/public /opt/quiz/My-ai-quiz/public

# AI Roadmap (`next start` needs .next + production node_modules)
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap-generator/.next /opt/roadmap/.next
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap-generator/public /opt/roadmap/public
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap-generator/node_modules /opt/roadmap/node_modules
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap-generator/package.json /opt/roadmap/package.json
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap-generator/next.config.js /opt/roadmap/next.config.js

# Service definitions, configs, helper scripts.
COPY docker/allinone/rootfs/ /
COPY docker/mariadb-init.sql /etc/lsp/mariadb-init.sql
RUN chmod +x /usr/local/bin/lsp-* /etc/s6-overlay/scripts/* \
 && find /etc/s6-overlay/s6-rc.d -name run -o -name finish | xargs chmod +x \
 # /app/data is the app's DATA_FOLDER (./data): keep it on the volume.
 && rm -rf /app/data && ln -s /data/app /app/data

ENV PATH="/app/.venv/bin:${PATH}" \
    VIRTUAL_ENV=/app/.venv \
    TIKTOKEN_CACHE_DIR=/app/tiktoken-cache \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # internal addresses: everything is on loopback inside this container
    SURREAL_URL=ws://127.0.0.1:8000/rpc \
    SURREAL_NAMESPACE=open_notebook \
    SURREAL_DATABASE=open_notebook \
    REDIS_URL=redis://127.0.0.1:6379/0 \
    MARIADB_HOST=127.0.0.1 \
    MARIADB_PORT=3306 \
    MARIADB_DATABASE=workspace \
    MARIADB_USER=workspace \
    INTERNAL_API_URL=http://127.0.0.1:5055 \
    OPEN_NOTEBOOK_API_URL=http://127.0.0.1:5055 \
    # AI Quiz / AI Roadmap live on this same origin (nginx): SIET Space links to them by path.
    MY_AI_QUIZ_URL=/quiz \
    AI_ROADMAP_URL=/roadmap \
    NO_PROXY=127.0.0.1,localhost,::1 \
    no_proxy=127.0.0.1,localhost,::1 \
    # s6-overlay: wait up to 10 min for start-up (migrations), stop the
    # container if a start-up step fails, give MariaDB time to flush on stop.
    S6_CMD_WAIT_FOR_SERVICES_MAXTIME=600000 \
    S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
    S6_SERVICES_GRACETIME=15000 \
    S6_KILL_GRACETIME=5000 \
    S6_VERBOSITY=1

VOLUME ["/data"]
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS -H "Host: localhost" http://127.0.0.1/api/config >/dev/null || exit 1

ENTRYPOINT ["/init"]
