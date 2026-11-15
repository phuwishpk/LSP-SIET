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

# ---- Python virtualenv: platform + the SIET parts ----
FROM ${PYTHON_IMAGE} AS py
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/
# Bytecode is compiled here (CI), not on the 3.3 GB server.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
# /app is platform/; the parts are its editable path dependencies at ../<part>
# (platform/pyproject.toml), so they sit at /<part>. Dependency metadata first
# (same layering as docker/platform/Dockerfile): the sources come later. Every
# package gets its __init__.py now because the editable install maps only the
# packages that exist when it is built.
COPY platform/pyproject.toml platform/uv.lock platform/README.md ./
COPY platform/siet_core/__init__.py ./siet_core/__init__.py
COPY platform/api/__init__.py ./api/__init__.py
COPY platform/commands/__init__.py ./commands/__init__.py
COPY platform/siet_platform/__init__.py ./siet_platform/__init__.py
COPY kmitl-rag/pyproject.toml /kmitl-rag/pyproject.toml
COPY kmitl-rag/kmitl_rag/__init__.py /kmitl-rag/kmitl_rag/__init__.py
COPY community/pyproject.toml /community/pyproject.toml
COPY community/siet_community/__init__.py /community/siet_community/__init__.py
COPY my-ai-quiz/pyproject.toml /my-ai-quiz/pyproject.toml
COPY my-ai-quiz/siet_quiz/__init__.py /my-ai-quiz/siet_quiz/__init__.py
COPY ai-roadmap/pyproject.toml /ai-roadmap/pyproject.toml
COPY ai-roadmap/siet_roadmap/__init__.py /ai-roadmap/siet_roadmap/__init__.py
RUN uv sync --frozen --no-dev
COPY platform/ /app/
COPY kmitl-rag/ /kmitl-rag/
COPY community/ /community/
COPY my-ai-quiz/ /my-ai-quiz/
COPY ai-roadmap/ /ai-roadmap/
# The frontends and the two standalone apps are built in their own stages; drop
# their sources from the Python tree.
RUN rm -rf /app/frontend /kmitl-rag/frontend /community/frontend \
           /my-ai-quiz/frontend /my-ai-quiz/app /ai-roadmap/frontend /ai-roadmap/app
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken-cache
RUN mkdir -p /app/tiktoken-cache \
 && .venv/bin/python -c "import tiktoken; tiktoken.get_encoding('o200k_base')"

# ---- SIET Space frontend (Next 16, standalone) ----
# This stage mirrors the repository layout under / (platform/frontend, <part>/frontend,
# shared/, scripts/): the host app's tsconfig paths (../../<part>/frontend/src) and the
# route generator (<its own dir>/../platform/frontend/src/app) both depend on it.
FROM ${NODE_IMAGE} AS web
WORKDIR /platform/frontend
COPY platform/frontend/package.json platform/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY platform/frontend/ /platform/frontend/
COPY kmitl-rag/frontend/ /kmitl-rag/frontend/
COPY community/frontend/ /community/frontend/
COPY my-ai-quiz/frontend/ /my-ai-quiz/frontend/
COPY ai-roadmap/frontend/ /ai-roadmap/frontend/
COPY shared/ /shared/
# The host app's route files for the parts' pages are generated and committed. Only
# check them here (never write): with a part missing from this stage the generator
# would prune that part's stubs and the build would ship without its pages.
COPY scripts/frontend-routes.mjs /scripts/frontend-routes.mjs
RUN node /scripts/frontend-routes.mjs --check
RUN for d in kmitl-rag community my-ai-quiz ai-roadmap; do ln -sfn /platform/frontend/node_modules /$d/frontend/node_modules; done \
 && ln -sfn /platform/frontend/node_modules /shared/node_modules
# Next bakes the /api rewrite target at build time: point it at the API inside
# this container (127.0.0.1, not "localhost", which Node may resolve to ::1).
ENV NEXT_TELEMETRY_DISABLED=1 INTERNAL_API_URL=http://127.0.0.1:5055
RUN npm run build

# ---- AI Quiz (Next 16, standalone; same steps as my-ai-quiz/app/Dockerfile) ----
FROM ${NODE_IMAGE} AS quiz
WORKDIR /workspace/my-ai-quiz/app
COPY my-ai-quiz/app/package.json my-ai-quiz/app/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
WORKDIR /workspace
COPY shared ./shared
COPY my-ai-quiz/app ./my-ai-quiz/app
WORKDIR /workspace/my-ai-quiz/app
RUN ln -sfn /workspace/my-ai-quiz/app/node_modules /workspace/shared/node_modules \
 && ln -sfn /workspace/my-ai-quiz/app/node_modules /workspace/node_modules
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- AI Roadmap (Next 13, `next start`; same steps as ai-roadmap/app/Dockerfile) ----
FROM ${NODE_IMAGE} AS roadmap
WORKDIR /workspace/ai-roadmap/app
COPY ai-roadmap/app/package.json ai-roadmap/app/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
WORKDIR /workspace
COPY shared ./shared
COPY ai-roadmap/app ./ai-roadmap/app
WORKDIR /workspace/ai-roadmap/app
RUN ln -sfn /workspace/ai-roadmap/app/node_modules /workspace/shared/node_modules \
 && ln -sfn /workspace/ai-roadmap/app/node_modules /workspace/node_modules
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

# Python app (code + venv: /app is platform/), the SIET parts, prompts, tiktoken cache.
COPY --from=py --chown=lsp:lsp /app /app
COPY --from=py --chown=lsp:lsp /kmitl-rag /kmitl-rag
COPY --from=py --chown=lsp:lsp /community /community
COPY --from=py --chown=lsp:lsp /my-ai-quiz /my-ai-quiz
COPY --from=py --chown=lsp:lsp /ai-roadmap /ai-roadmap
COPY --chown=lsp:lsp shared /shared

# SIET Space frontend (standalone server.js, as in docker/platform/Dockerfile).
# Built at /platform/frontend, run from /app/frontend: the run script reads that path.
COPY --from=web --chown=lsp:lsp /platform/frontend/.next/standalone /app/frontend/
COPY --from=web --chown=lsp:lsp /platform/frontend/.next/static /app/frontend/.next/static
COPY --from=web --chown=lsp:lsp /platform/frontend/public /app/frontend/public

# AI Quiz standalone (server.js lives under my-ai-quiz/app/ because the tracing root is the repo)
COPY --from=quiz --chown=lsp:lsp /workspace/my-ai-quiz/app/.next/standalone /opt/quiz/
COPY --from=quiz --chown=lsp:lsp /workspace/my-ai-quiz/app/.next/static /opt/quiz/my-ai-quiz/app/.next/static
COPY --from=quiz --chown=lsp:lsp /workspace/my-ai-quiz/app/public /opt/quiz/my-ai-quiz/app/public

# AI Roadmap (`next start` needs .next + production node_modules)
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap/app/.next /opt/roadmap/.next
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap/app/public /opt/roadmap/public
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap/app/node_modules /opt/roadmap/node_modules
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap/app/package.json /opt/roadmap/package.json
COPY --from=roadmap --chown=lsp:lsp /workspace/ai-roadmap/app/next.config.js /opt/roadmap/next.config.js

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
