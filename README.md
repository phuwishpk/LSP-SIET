# KMITL AI Workspace

Unified project that runs three repos together via a single command.
Every piece of docker plumbing lives at the workspace root so the
individual repos stay clean.

| Repo | Role | Port (host) |
|---|---|---|
| [`open-notebook/`](open-notebook) | FastAPI + Streamlit + Next.js + SurrealDB + Redis | API `:5055`, Streamlit `:8502`, Next.js `:3000` |
| [`My-ai-quiz/`](My-ai-quiz) | Standalone Next.js quiz app | `:3001` |
| [`ai-roadmap-generator/`](ai-roadmap-generator) | Next.js roadmap app + PocketBase | App `:3002`, PocketBase `:8090` |

The new **AI Features** (`/features`) page inside open-notebook folds in the
generation logic from both standalone apps and is wired to whichever language
model you configure in **Settings → Models**.

## Quick start

```bash
make up
```

That target will:
1. Copy `.env.example` to `.env` if missing
2. Build all images
3. Start the entire stack in detached mode

Then open:

- <http://localhost:8502> – Open Notebook (Streamlit)
- <http://localhost:3000> – Open Notebook (Next.js)
- <http://localhost:3001> – My AI Quiz
- <http://localhost:3002> – AI Roadmap Generator
- <http://localhost:8090> – PocketBase admin

## Project layout

```
kmitlAI/
├── docker-compose.yml              ← single source of truth for the stack
├── Makefile                        ← convenience targets (make up / down / logs ...)
├── .env.example                    ← template for secrets
├── open-notebook/                  ← Python app + Next.js (no docker files inside)
├── My-ai-quiz/                     ← Next.js standalone (only Dockerfile)
├── ai-roadmap-generator/           ← Next.js standalone (only Dockerfile)
└── docker/
    └── open-notebook/              ← Dockerfile + supervisord.conf + wait-for-api.sh
        ├── Dockerfile
        ├── supervisord.conf
        ├── wait-for-api.sh
        └── dockerignore
```

> The `open-notebook/` sub-directory no longer contains any docker files.
> Everything docker-related for it lives in `docker/open-notebook/`.

## How the apps communicate

```
┌────────────────────┐      ┌─────────────────────┐
│  My-ai-quiz (3001) │─────▶│ open_notebook_api   │
└────────────────────┘      │   :5055             │
                            │  (FastAPI +         │
┌────────────────────┐      │   Esperanto +       │     ┌──────────────┐
│ ai-roadmap-gen     │─────▶│   Redis cache +     │────▶│  SurrealDB   │
│   (3002 + 8090)    │      │   SurrealDB ORM)    │     └──────────────┘
└────────────────────┘      └─────────────────────┘             ▲
                                                                  │
                                                          ┌───────┴────────┐
                                                          │ open-notebook  │
                                                          │   Next.js UI   │
                                                          │   (:3000)      │
                                                          └────────────────┘
```

`open_notebook_api` is the single source of truth for AI generation – the two
standalone apps talk to it through `OPEN_NOTEBOOK_API_URL`. PocketBase stays
local to the roadmap app because the existing UI persists roadmap data
directly there.

## Make targets

```bash
make help        # list every target
make up          # build + start (the one-shot command)
make logs        # follow logs from all services
make ps          # list running services
make down        # stop the stack (keeps volumes)
make nuke        # stop + delete volumes (destroys data)
make rebuild     # rebuild images from scratch
```

## Manual docker compose (still works)

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
docker compose down
```

## Adding new AI providers

Open Notebook handles provider configuration in **Settings → Models** – add
the credential once and the new `/features` page, plus every other workflow in
the app, can use it immediately. The same key also feeds the standalone apps
through `OPEN_NOTEBOOK_API_URL`.