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

## SIET Space – community feed, Google SSO and the point wallet

The Next.js frontend of `open-notebook/` now ships a Facebook-style community
(`/community`) on top of the existing notebook / quiz / roadmap features.

| Piece | Where |
|---|---|
| Google Workspace sign-in (`@kmitl.ac.th`) | `open-notebook/api/routers/google_auth.py`, frontend `/auth/google/callback` |
| Point wallet (charge / refund / cashback / leaderboard) | `open-notebook/open_notebook/community/points.py` |
| Feed, courses, comments, reactions, quiz plays, notifications | `open-notebook/api/routers/community.py` + `open_notebook/community/repository.py` |
| MariaDB schema (idempotent, runs on API start) | `open-notebook/open_notebook/community/schema.py` |
| 3-column UI | `open-notebook/frontend/src/app/(dashboard)/community/` + `src/components/community/` |

### Sign-in

* Students/teachers sign in with **Google Workspace**. The e-mail domain must be
  in `GOOGLE_OAUTH_ALLOWED_DOMAINS` (default `kmitl.ac.th`). An 8-digit local
  part (e.g. `67030123@kmitl.ac.th`) becomes a **student** (student id is stored),
  anything else becomes a **teacher**; e-mails listed in
  `WORKSPACE_ADMIN_EMAILS` become **admin**.
* First sign-in grants the **20-point welcome allowance**.
* Set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` in `.env` and
  register `${FRONTEND_URL}/auth/google/callback` as an authorised redirect URI
  in Google Cloud Console. Until then `GOOGLE_OAUTH_MOCK=1` shows a local mock
  account picker (development only – anyone can pick any e-mail).
* The username/password form (seeded `admin1`, `student1..5`) is still
  available under "เข้าสู่ระบบด้วยชื่อผู้ใช้" on the login page.

### Point economy (defaults, override with `POINTS_*` env vars)

| Action | Cost |
|---|---|
| KMITL RAG AI – single question | 1 pt |
| KMITL RAG AI – 5-message session | 4 pt |
| Generate an AI Quiz | 8 pt (refunded when served from cache) |
| Generate an AI Roadmap | 15 pt (refunded when served from cache) |
| Import a friend's shared quiz into your library | 1 pt |
| Play a friend's shared quiz inline / follow a friend's roadmap | free (1 play per quiz) |

Rewards: +1 pt cashback per friend that finishes your shared quiz (max 15 per
quiz), +2 pt for sharing a summary, +1 pt per "Helpful" reaction received.
Teachers and admins are never charged.

### Quiz / roadmap persistence fix

SurrealDB migration `23.surrealql` marks `quiz_session.questions` and
`roadmap_session.nodes/edges` as `FLEXIBLE` – without it SCHEMAFULL tables
silently stored `[{}, {}]`, so previously generated quizzes/roadmaps have no
content and must be regenerated.
