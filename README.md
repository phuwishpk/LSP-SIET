# KMITL AI Workspace

Unified project that runs three repos together via a single command.
Every piece of docker plumbing lives at the workspace root so the
individual repos stay clean.

| Repo | Role | Port (host) |
|---|---|---|
| [`open-notebook/`](open-notebook) | FastAPI + Next.js + Streamlit + SurrealDB + MariaDB + Redis | API `:5055`, Next.js `:3000` (Streamlit at `/streamlit`) |
| [`My-ai-quiz/`](My-ai-quiz) | Standalone Next.js quiz app | `:3001` |
| [`ai-roadmap-generator/`](ai-roadmap-generator) | Next.js roadmap app + PocketBase | App `:3002`, PocketBase `:8090` |

The new **AI Features** (`/features`) page inside open-notebook folds in the
generation logic from both standalone apps and is wired to whichever language
model you configure in **Settings → Models**.

> **คู่มือโครงสร้างระบบฉบับเต็ม (ภาษาไทย): [`docs/SYSTEM-GUIDE.md`](docs/SYSTEM-GUIDE.md)**
> — สถาปัตยกรรม, tech stack, วิธีรัน, โครงสร้างเนื้อหา และสิทธิ์ของแต่ละบทบาท

## Quick start

```bash
make up
```

That target will:
1. Copy `.env.example` to `.env` if missing
2. Build all images
3. Start the entire stack in detached mode

Then open:

- <http://localhost:3000> – Open Notebook (Next.js) — sign-in, `/community`, `/admin`
- <http://localhost:5055/docs> – API reference (Swagger)
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

Students earn the points back by contributing to the community. Every earning
kind is capped per day, pays at most once per (post, person), and never pays for
your own action, so a small group cannot farm points:

| Earn by | Points | Daily cap |
|---|---|---|
| Posting content to the feed | +2 | 6 |
| Sharing a lecture summary | +2 | 6 |
| Someone likes your post | +1 | 10 |
| Someone marks your post Helpful | +1 | 10 |
| Someone shares your post | +2 | 10 (one share per person per post) |
| Improving one of your posts (edit) | +1 | 2 |
| A friend finishes a quiz you shared | +1 | 15 per quiz |

Teachers and admins are never charged and never need to earn.

Rates and caps are `POINTS_*` environment variables (see `.env.example`).

### Knowledge library (teachers publish, students apply)

| Who | Can add | Visible to | Used by |
|---|---|---|---|
| Teacher / admin | course material (`scope=course`, needs a course) | everyone | RAG answers, quizzes, roadmaps of that course |
| Any student | their own PDF / link / pasted text (`scope=personal`) | only themselves | their own RAG answers, quizzes, roadmaps |

Each course gets its own Open Notebook notebook (`courses.notebook_id`) and each
user a private one (`users.library_notebook_id`); uploads become embedded
`Source` records there, tracked in `library_documents`. Extraction + embedding
run in a FastAPI background task (no surreal-commands worker needed).

Endpoints: `GET/POST /api/community/library`, `GET/DELETE /api/community/library/{id}`,
`POST /api/community/library/{id}/retry`, plus `POST /api/community/study/quiz`
and `POST /api/community/study/roadmap` for generating grounded study material.
`POST /api/community/ask` accepts `scope` = `auto | course | personal | document`.

### Teacher console

`/teacher` (teachers + admins, menu "จัดการการสอน") is the teaching side, kept
separate from `/admin` which is about accounts:

| Tab | What it shows |
|---|---|
| ห้องของฉัน | rooms this person opened, with member / post / document counts — **rename, re-code and close them here** |
| เอกสารแยกตามวิชา | the course library grouped per course, with embedding status |
| ผลการเล่นควิซ | every student attempt at a quiz posted in their rooms: score, %, average, filterable by course |
| สื่อการสอนของฉัน | their own `material` posts |

Endpoints: `GET /api/community/teacher/overview`,
`GET /api/community/teacher/quiz-results`, plus
`PATCH /api/community/courses/{id}` for renaming a room. A teacher may edit or
close only the rooms they created; admins may manage any room.

### Admin console

`/admin` (admins only) replaces going into MariaDB by hand: search the user
directory, change a role, top a wallet up or deduct from it (recorded in the
points history as `admin_grant` / `admin_deduct`), reset a password, and suspend
or restore an account. A suspended account cannot sign in and its existing token
is rejected on the next request. Guard rails stop an admin demoting or
suspending themselves, or removing the last remaining admin.

### Who can do what

Enforced in middleware (`api/auth_roles.py`) so a newly added router is locked
down by default rather than accidentally public. The frontend hides the matching
navigation, but the API is the enforcement point.

| Area | Student | Teacher | Admin |
|---|---|---|---|
| Community feed, points, knowledge library, quiz/roadmap generation | yes | yes | yes |
| Open a discussion room (ห้องพูดคุย) and close the ones they opened | yes | yes | yes |
| Upload into a course library, create course rooms, publish teaching material | no | yes | yes |
| Open Notebook research surface (notebooks, sources, notes, chat, search, podcasts, transformations) | no | yes | yes |
| AI models, API credentials, workspace settings | no | no | yes |

Blocked requests return `403` with `X-Required-Role`.

### Two kinds of room

The sidebar holds two lists, both stored in `courses` and told apart by `kind`:

| | ห้องวิชา (`kind='course'`) | ห้องพูดคุย (`kind='club'`) |
|---|---|---|
| Who opens it | teachers and admins | anyone signed in |
| Handle | the real course code (`CS101`) | generated (`TALK-9F2C1B`) |
| Shared knowledge library | yes — feeds KMITL RAG AI | none, by design |
| Who can close it | admins | its creator, or an admin |

Closing a room detaches its posts instead of deleting them: they return to the
main feed, so nobody loses work when a room is cleaned up. Opening a room whose
name already exists returns `409` with `X-Existing-Room`, pointing at the room to
join instead.

### Anti-spam on content creation

Everything that adds content is guarded three ways (all `SPAM_*` env vars):

| Guard | Post | Comment | Library upload | Discussion room |
|---|---|---|---|---|
| Cooldown between submissions | 20 s | 5 s | 15 s | 60 s |
| Per hour | 10 | 30 | 10 | 2 |
| Per day | 40 | 150 | 30 | 5 |

Reactions and shares are recorded per (post, person) — `post_reactions` and
`post_shares` — so a like or share counts once no matter how often the button is
pressed, and sharing your own post never pays you.

Plus a duplicate fingerprint (`content_hash`, MD5 of the payload) that rejects
re-posting the same text or re-uploading the same file for 24 h, and a minimum
length so one-character posts cannot be used to farm points. Teachers and admins
get `SPAM_STAFF_MULTIPLIER` (default 4x) the quotas. Rejections return
`429 Too Many Requests` with `Retry-After`, or `409 Conflict` with
`X-Duplicate-Of` pointing at the original.

### Deploying to a real domain

The browser-facing URLs of the two standalone apps are read at **runtime** from
the frontend's `/config` endpoint, so moving to a domain needs only
`MY_AI_QUIZ_URL` and `AI_ROADMAP_URL` on the `open_notebook_api` container plus a
restart — no frontend rebuild. (`NEXT_PUBLIC_*` equivalents remain as a
build-time fallback.)

An explicit scope never silently widens: if a course has no documents yet the
answer says so instead of quietly searching the whole workspace. Scoped
retrieval lives in `open_notebook/community/retrieval.py` because the upstream
`fn::vector_search_in_notebook` SurrealQL function is missing in this
deployment.

### Quiz / roadmap persistence fix

SurrealDB migration `23.surrealql` marks `quiz_session.questions` and
`roadmap_session.nodes/edges` as `FLEXIBLE` – without it SCHEMAFULL tables
silently stored `[{}, {}]`, so previously generated quizzes/roadmaps have no
content and must be regenerated.


### Standalone app durability

* **AI Roadmap** – a plan generated while signed in is stored as a
  `roadmap_session` in Open Notebook, and `/roadmap/{code}` reads it back from
  there (the code is the record id with `:` replaced by `-`). It therefore
  survives a restart, and only the owner's token can open it. PocketBase is no
  longer needed for the workspace flow; anonymous plans still live in an
  in-process cache and are explicitly reported as temporary.
* **AI Quiz** – the standalone fallback model is `QUIZ_FALLBACK_MODEL`
  (default `gemini-2.5-flash`) instead of an empty string. Without a workspace
  token *and* without a Gemini key it now returns a clear 503 telling the user
  to come in through SIET Space.
