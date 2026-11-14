# LSP-SIET without Open Notebook (design)

Date: 2026-11-15 · Status: sections 1-2 agreed in conversation; section 3 (how we get
there) awaits review in this document · Branch: `refactor/lsp-siet` (from `main` 8efc391)

## Goal and constraints

The product is **LSP-SIET**. Open Notebook stops being a separate, upstream-tracked
part of the repository: its code that we use becomes ours, its features we do not use
are deleted, and nothing a user, a teammate or an operator sees carries its name.

Agreed with the owner:

| Decision | Choice |
|---|---|
| Depth | rebrand + delete unused Open Notebook features; keep the core we use (DB, AI models, embedding, ask/chat graphs) as our own code; **stop tracking upstream** (lfnovo/open-notebook) |
| Parts | **platform** (shared base) + **community** + **kmitl-rag** + **my-ai-quiz** + **ai-roadmap** |
| community | owns every community page |
| Deleted features | Podcasts, Transformations (UI/API only, see 2.1), the old `/search` page, `/advanced` |
| SurrealDB namespace/database | stays `open_notebook` (no data move; set through env, invisible to users) |
| Everything else named Open Notebook | renamed (packages, env vars, containers, image, texts, links) |
| Approach | **A**: move + rename with a codemod, keep the extension mechanism; behaviour unchanged |
| Timing | now, on a new branch from `main`, with a codemod teammates run on their own branches |
| Separation | each part writes only in its own folder; page route files in the host app are generated |
| Locales | en-US only; the language picker goes |
| "Without touching the rest" | API paths, request/response shapes, JWT/cookies, DB schema (except the podcast tables), ports and domains stay as they are |

Non-goals: removing the extension/hook indirection (approach B, possible later); moving
migrations k1-k8 per part (they stay in platform); renaming the SurrealDB namespace;
any change to quiz/roadmap/community behaviour.

## 1. Layout, names, ownership

```
kmitlAI/
├── platform/              shared base                    owner phuwishpk (auth: Tanabordi)
│   ├── siet_core/         ← open-notebook/open_notebook  DB, AI models, embedding, ask/chat graphs, sources pipeline
│   ├── api/               ← open-notebook/api            FastAPI host :5055 (main.py, auth, config, models, credentials ...)
│   ├── siet_platform/     ← siet-platform/siet_platform  auth, users, points, throttle, usage, cache, admin, library, retrieval
│   ├── prompts/  tests/   merged tests of open-notebook + siet-platform
│   ├── pyproject.toml     ONE uv project (merged), path deps on the other parts
│   ├── NOTICE             Open Notebook MIT licence text (required by the licence; not user-visible)
│   └── frontend/          ← open-notebook/frontend + siet-platform/frontend merged: the host Next.js app
├── kmitl-rag/             owner phuwishpk
│   ├── kmitl_rag/         as today + routers moved in: notebooks, sources, notes, chat, source_chat,
│   │                      embedding, embedding_rebuild, insights, transformations (read-only)
│   └── frontend/          as today + /notebooks, /sources, /search pages and their components
├── community/             owner pornprompoh
│   ├── siet_community/    as today
│   └── frontend/          as today + community-only UI/data from siet-platform/frontend
├── my-ai-quiz/            owner SpriteUm
│   ├── app/               ← My-ai-quiz (Next.js :3001, code unchanged)
│   ├── siet_quiz/         ← the quiz half of siet_platform/features + its router
│   └── frontend/          ← /admin/quiz (from community/frontend)
└── ai-roadmap/            owner phuwishpk
    ├── app/               ← ai-roadmap-generator (Next.js :3002, code unchanged)
    ├── siet_roadmap/      ← the roadmap half of siet_platform/features + its router
    └── frontend/          ← /admin/roadmap, /go/roadmap
```

Names:

| Old | New |
|---|---|
| Python `open_notebook` | `siet_core` |
| entry point group `open_notebook.extensions` | `siet.extensions` |
| `siet_platform`, `kmitl_rag`, `siet_community` | unchanged |
| — | `siet_quiz`, `siet_roadmap` (new packages, each an extension with `install(app)`) |
| frontend `@siet/platform/*` | `@/*` (merged into the host app) |
| `@siet/kmitl-rag`, `@siet/community` | unchanged |
| — | `@siet/quiz`, `@siet/roadmap` |
| folders `My-ai-quiz`, `ai-roadmap-generator` | `my-ai-quiz/app`, `ai-roadmap/app` |

Rules for where things go:

- `siet_platform/features/service.py` mixes quiz and roadmap. Shared helpers
  (`_retrieve_rag_context`, `_invoke_chat`, `_extract_json`, `_hash_prompt`, RAG chunk
  formatting) move to `siet_platform/ai_helpers.py`; the rest splits into `siet_quiz` and
  `siet_roadmap`. Routes keep their paths (`/api/features/quiz/...`, `/api/features/roadmap/...`).
- `/features` (the "AI Features" hub that creates either) stays in **platform**.
- Code that mixes community with quiz/roadmap stays in **community** (StudyDialog, QuizEmbed,
  RoadmapEmbed, `roadmap_plan.py`, `routers/features.py`), as the layering rule already says.
- UI the platform shell renders (navbar, notifications menu, points wallet) stays in platform;
  only community-only UI and its data layer (`lib/api/community*.ts`, moderation, courses,
  library hooks used only by community pages) moves. The layering test decides each file.
- The "replaced modules" (1-line re-exports of auth-store, use-auth, LoginForm) disappear: the
  real file takes the host path.
- Dependency direction: `platform ← kmitl-rag ← community`, `platform ← siet_quiz`,
  `platform ← siet_roadmap`; enforced by the existing layering tests (backend + frontend),
  extended to the two new packages.
- `.github/CODEOWNERS` maps each folder to its owner (table above); `area:*` labels unchanged.

Route files: every page lives in its part's `frontend/src/app/...`. `make frontend-routes`
(`scripts/frontend-routes.mjs`) writes the one-line `export { default } from '@siet/<part>/app/...'`
files into `platform/frontend/src/app`, marked `// generated`, and deletes generated files whose
source is gone. It runs in `make dev`, `make build`, CI and the image build; a test fails if the
committed generated files are stale. A page owner never edits `platform/`.

## 2. What is deleted, what is renamed

### 2.1 Transformations: the UI goes, document summaries stay

KMITL RAG reads `source_insight` (summaries such as "Dense Summary"): `siet_platform/retrieval.py`
searches it, `kmitl_rag/ask.py` and `chat_filters.py` have an "insights only" mode. Insights are
written by the source pipeline (`graphs/source.py` → `transform_content`) from `transformation`
records. Therefore:

- deleted: `/transformations` page and nav item, the create/update/delete/execute endpoints of
  `api/routers/transformations.py` (the playground), the transformation picker in the add-source
  dialog, the frontend editing UI and its hooks;
- kept: the `transformation` table and its rows, `siet_core/domain/transformation.py`,
  `graphs/transformation.py`, the insight step of the source pipeline, read-only
  `GET /transformations` and `POST /sources/{id}/insights` (staff can re-run a summary on one
  source from the source page, choosing among the existing records), the `insights` router
  (get / delete / save-as-note) — all moved to kmitl-rag;
- change: when a source is created without a `transformations` list, the backend applies every
  transformation with `apply_default = true` (today the dialog sends that list). Records can no
  longer be edited through the UI; changing a summary prompt becomes a migration.

### 2.2 Deleted

| What | Code | Data |
|---|---|---|
| Podcasts | `siet_core/podcasts/`, `api/podcast_service.py`, routers `podcasts`, `episode_profiles`, `speaker_profiles`, podcast commands, `/podcasts` page, podcast types/hooks/locales | migration **k9** removes the podcast tables (`episode`, `episode_profile`, `speaker_profile`) with a `k9_down`; backup first |
| Old `/search` | `OpenNotebookSearchPage` and the components only it uses; the `search.page` slot is replaced by kmitl-rag owning `/search` (`WorkspaceSearchPage`) directly | — |
| Old search API | `POST /search`, `/search/ask`, `/search/ask/simple` **only if** nothing calls them (checked in the plan; `/search/ask/notebooks` is kmitl-rag's and stays) | — |
| `/advanced` | page, nav item, version check against GitHub, `use-version-check`; "Rebuild embeddings" moves to `/admin/rag` first | — |
| Upstream tracking | `docs/UPSTREAM.md`, `docs/upstream/`, `scripts/upstream/`, `scripts/siet-split/`, Open Notebook's own docs (81 files), CONTRIBUTING, CODE_OF_CONDUCT, MAINTAINER_GUIDE, SECURITY, VISION, CHANGELOG, `.maintainer/`, `.codex/`, `cubic.yaml`, `examples/`, `commands/`, unused Docker/compose/supervisord files inside `open-notebook/`, its `.github/`; git remote `upstream` and branch `vendor/open-notebook` (local; remote branches untouched) | — |
| Locales | all but en-US, language picker | — |

Untouched: upstream PRs lfnovo/open-notebook#1521 and #1522 (our contributions), branches
`upstream-pr/*`, the `fork` remote.

### 2.3 Renamed

- Browser tab title "LSP-SIET" and a new description; logo/favicon checked and replaced if still Open Notebook's.
- Every en-US string naming Open Notebook rewritten (connection error, settings files help,
  model assignment texts); `common.appName` = "LSP-SIET" in the locale itself (the override goes).
- All links to github.com/lfnovo removed (connection error, settings/models, setup banner).
- FastAPI `title="LSP-SIET API"`, root message, docstrings.
- Quiz/roadmap prompts: `[Open Notebook: {title}]` → `[เอกสาร: {title}]`, "retrieved Open Notebook
  knowledge" → "retrieved course documents".
- Env vars `OPEN_NOTEBOOK_*` → `LSP_SIET_*` and `NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL` →
  `NEXT_PUBLIC_LSP_SIET_API_URL`. One helper (`siet_core.config.env()` / a TS equivalent) reads
  the new name first and falls back to the old one with a one-time warning, so production `.env`
  files keep working; `.env.example` lists only new names.
  `OPEN_NOTEBOOK_ENCRYPTION_KEY` keeps working through the fallback (stored credentials depend on it).
- Compose: service `open_notebook_api` → `lsp_siet_api`, container `kmitl_open_notebook_api` →
  `lsp_siet_api`, image `kmitlai/open-notebook:local` → `kmitlai/lsp-siet:local`,
  `docker/open-notebook/` → `docker/platform/`. Data dirs move with the folder
  (`platform/surreal_data`, `notebook_data`, `redis_data`); `docker-compose*.yml` mounts follow.
  The GHCR image is already `lsp-siet`.
- Internal identifiers (`openNotebookDialog` → `openCreateNotebookDialog` etc.), CSS comments,
  README/ARCHITECTURE/SYSTEM-GUIDE/RUNBOOK and package `README`s.
- Guard test: `rg -i 'open[ _-]?notebook'` over tracked files finds only `platform/NOTICE`, the
  `SURREAL_NAMESPACE/DATABASE=open_notebook` values, the env fallback list, migration history
  files and this spec.

## 3. How we get there (for review)

### 3.1 Phases on `refactor/lsp-siet`

Each phase is one or a few commits in the owner's name (no Claude attribution, per
the repo convention), ends green, and is reported before the next one starts.

0. **Baseline.** Measure on `main`: backend tests (pass/fail lists), frontend tsc + vitest,
   API route list (method+path), frontend route list, built CSS selector set, a GET snapshot of
   ~66 endpoints on an isolated stack. Saved under `docs/lsp-siet/baseline/`.
1. **Delete features in place** (2.1, 2.2) while paths are still familiar. Expected diffs
   vs baseline: only the deleted routes/pages and tests.
2. **Backend move**: `open-notebook/` → `platform/` (`git mv`), `open_notebook` → `siet_core`,
   merge `siet-platform/` into `platform/`, one `pyproject.toml`; routers listed in section 1 move
   into `kmitl_rag` and are registered by its `install(app)` with the same prefixes; split
   `features` into `siet_quiz` / `siet_roadmap` / `ai_helpers`. Expected diff: none in the API
   route list.
3. **Frontend move**: merge `siet-platform/frontend` into `platform/frontend`, move pages and
   components per section 1, add `@siet/quiz` / `@siet/roadmap`, `make frontend-routes` + its
   staleness test. Expected diff: none in the frontend route list (minus 2.2) or CSS selectors.
4. **Apps and infra**: `My-ai-quiz` → `my-ai-quiz/app`, `ai-roadmap-generator` → `ai-roadmap/app`;
   update Dockerfiles, `docker/allinone`, s6 run scripts, compose files, Makefile, `dev.sh`,
   `deploy/*.sh`, `lsp-backup`, CI workflow, Traefik config.
5. **Rebrand** (2.3) + env fallback + guard test + docs + CODEOWNERS + NOTICE.
6. **Codemod and handoff**: `scripts/lsp-siet/codemod.py` rewrites paths, imports, aliases,
   env names on any branch; `docs/handoff/lsp-siet.md` (Thai) tells each teammate the 3 commands
   to run. Dry-run it on `origin/feat/quiz-ai`, `origin/dev-poh`, `origin/dev-poh-edit01`,
   `origin/feat/auth-rbac-logs-visibility-moderation` and `feat/rag-community-search`
   (merge into a throwaway copy, count conflicts, do not push).
7. **Verification on an isolated stack** with a copy of production data (the siettest recipe):
   compare against the baseline, run k9, run the codemod-converted branches' tests.

Merging into `main` and deploying to production are **not** part of these phases: both wait for
the owner's go after phase 7 (deploy = backup, rename data dirs/containers, `make up`, k9).

### 3.2 Testing

- Every phase: backend and frontend suites reproduce the baseline failure lists exactly,
  except tests deleted with their feature; layering tests pass with the new packages.
- Route lists (API and frontend) equal the baseline minus the deleted routes.
- GET snapshot on the isolated stack equal to baseline except deleted endpoints and counters.
- New tests: env fallback (new name wins, old name works and warns), `apply_default`
  transformations applied when the request lists none, generated route files not stale, the
  Open Notebook guard grep, k9 up/down on a throwaway SurrealDB.

### 3.3 Risks

| Risk | Handling |
|---|---|
| Teammates' open branches conflict | codemod + dry-run counts in phase 6; teammates told before merge |
| Prod `.env` uses old env names | read-fallback, no prod `.env` edit required |
| Data dirs/containers renamed on prod | deploy step in the runbook with backup; old names checked by a preflight |
| `ENCRYPTION_KEY` lost → stored API keys unreadable | fallback keeps `OPEN_NOTEBOOK_ENCRYPTION_KEY`; a test decrypts a credential after the rename on the isolated stack |
| Python name clash | `platform` is a folder only, never an import name (stdlib `platform`) |
| Something depends on a deleted API | phase 1 greps all five codebases + both standalone apps before deleting |
