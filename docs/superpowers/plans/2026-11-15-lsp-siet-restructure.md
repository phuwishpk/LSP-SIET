# LSP-SIET without Open Notebook - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository into LSP-SIET = `platform/` + `community/` + `kmitl-rag/` + `my-ai-quiz/` + `ai-roadmap/`, with Open Notebook's unused features deleted, its name gone, and every remaining behaviour unchanged.

**Architecture:** Approach A from the spec: files move with `git mv` driven by one table (`scripts/lsp-siet/moves.py`); a codemod derives Python module and TypeScript alias rewrites from that table, so the same tool converts teammates' branches. The extension mechanism (`siet.extensions` entry points, frontend `extensions.installed.ts`) stays; each part registers its own routers and pages.

**Tech Stack:** FastAPI + uv (Python 3.12), SurrealDB 2 migrations (`.surrealql`), Next.js 16 + TypeScript + vitest, Docker compose / s6 all-in-one image, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-15-lsp-siet-restructure-design.md` (read it first; this plan argues from it).

## Global Constraints

- Work in the worktree `WT=/private/tmp/claude-501/-Users-phuwish-kmitlAI/9915922e-8543-4b55-a245-36ddb2686866/scratchpad/lsp` on branch `refactor/lsp-siet`. Never touch `/Users/phuwish/kmitlAI` (it runs production from its working tree).
- Commits: the repo's git identity (phuwishpk), conventional messages, **no** `Co-Authored-By` / "Generated with" lines. Do not push. Do not merge. Do not deploy.
- Unchanged: API paths and methods, request/response shapes, JWT/cookies, ports (5055, 3000/8502, 3001, 3002), domains, the SurrealDB namespace/database `open_notebook`, MariaDB schema. The only schema change is k9 (drops podcast tables).
- Python package names: `siet_core` (was `open_notebook`), `api`, `commands`, `siet_platform`, `kmitl_rag`, `siet_community`, `siet_quiz`, `siet_roadmap`. Entry point group: `siet.extensions`.
- Frontend aliases: `@/` = `platform/frontend/src`, `@siet/kmitl-rag/`, `@siet/community/`, `@siet/quiz/` = `my-ai-quiz/frontend/src`, `@siet/roadmap/` = `ai-roadmap/frontend/src`. `@siet/platform/` no longer exists.
- Layering (imports allowed only rightward→leftward): `siet_core/api/commands ← siet_platform ← kmitl_rag ← siet_community`; `siet_platform ← siet_quiz`, `siet_platform ← siet_roadmap`; `siet_community` may import `siet_quiz`/`siet_roadmap`; `kmitl_rag` may not. Same graph for the frontend packages.
- Every task ends with the backend and frontend suites reproducing the baseline failure lists of Task 1 exactly (minus tests deleted with their feature) and `scripts/lsp-siet/routes.py diff` showing only the changes the task names.
- Env rename: `OPEN_NOTEBOOK_*` → `LSP_SIET_*`, `NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL` → `NEXT_PUBLIC_LSP_SIET_API_URL`; old names keep working through the fallback (Task 15).
- Product name in UI/API text: `LSP-SIET`. Prompt label: `[เอกสาร: {title}]`.
- Test environment (repo `.venv` is broken): `export UV_PROJECT_ENVIRONMENT=$WT/../venv-lsp` then `uv sync --frozen --python 3.12` inside the Python project dir (`open-notebook/` until Task 8, `platform/` after); run tests with `make test-backend` / `make test-frontend` (they use `PYTHON_DOTENV_DISABLED=1`).

## Review Focus

1. **Production `.env` has only old variable names** (notably `OPEN_NOTEBOOK_ENCRYPTION_KEY`) — stored provider credentials must still decrypt and every setting must still apply. Pinned in Task 15 (`test_env_fallback_*`, `test_credentials_decrypt_with_old_key_name`) and live in Task 18.
2. **A source created without a `transformations` field** (the add-source dialog after the picker is removed, or any older client) gets the `apply_default` summaries; an explicit empty list still means none. Pinned in Task 3.
3. **A page whose generated route file is missing or stale** would 404 silently. Pinned in Task 13 (`frontend-routes --check` test) and the route-list diff.
4. **A teammate's branch adds a new file under a moved directory** (not listed in `moves.py`) — the codemod must move it with its directory and rewrite its imports, and running it twice changes nothing. Pinned in Task 8 (`test_new_file_under_moved_dir`, `test_idempotent`).
5. **Bookmarks to deleted pages** (`/podcasts`, `/transformations`, `/advanced`) — users land on the dashboard, not a 404. Pinned in Tasks 2, 3, 5 (`next.config` redirect test).

---

## Phase 0 - Baseline

### Task 1: Baseline measurements and the route-list tool

**Files:**
- Create: `scripts/lsp-siet/routes.py`
- Create: `docs/lsp-siet/baseline/{api-routes.txt,frontend-routes.txt,backend-failures.txt,frontend-failures.txt,README.md}`

**Interfaces:**
- Produces: `python scripts/lsp-siet/routes.py api [--ordered]` → stdout lines `METHOD /path` sorted (or, with `--ordered`, in registration order), from `api.main:app.routes` (FastAPI `APIRoute`s only, one line per method); `routes.py frontend` → sorted URL paths of every `page.tsx` / `route.ts` under the host app dir (`open-notebook/frontend/src/app` before Task 11, `platform/frontend/src/app` after; the script picks whichever exists), route groups `(x)` stripped; `routes.py diff <kind>` → unified diff of the current list against `docs/lsp-siet/baseline/<kind>-routes.txt`, exit 0 always.

- [ ] **Step 1:** Install deps in the worktree: `uv sync --frozen --python 3.12` in `open-notebook/`; `npm ci` in `open-notebook/frontend`; `make frontend-links`.
- [ ] **Step 2:** Write `routes.py` (stdlib only; imports `api.main` with `sys.path` set to the Python project dir and `PYTHON_DOTENV_DISABLED=1`).
- [ ] **Step 3:** Run `routes.py api > docs/lsp-siet/baseline/api-routes.txt`, `routes.py api --ordered > …/api-routes-ordered.txt` and `routes.py frontend > …/frontend-routes.txt`. Expected: ~240 API lines, ~30 frontend lines (the spec counted 238 API routes on staging).
- [ ] **Step 4:** Run `make test-backend ARGS="-p no:cacheprovider -rfE --continue-on-collection-errors" 2>&1 | tee /tmp/b.log`; store the sorted `FAILED`/`ERROR` node ids in `backend-failures.txt` and the summary line in `README.md`. Same for `make test-frontend` → `frontend-failures.txt` (tsc errors + vitest failures).
- [ ] **Step 5:** Commit: `chore(lsp-siet): baseline route lists and test results`.

---

## Phase 1 - Delete features in place

### Task 2: Remove podcasts (code, page, tables)

**Files:**
- Delete: `open-notebook/open_notebook/podcasts/`, `open-notebook/api/podcast_service.py`, `open-notebook/api/routers/{podcasts,episode_profiles,speaker_profiles}.py`, podcast command(s) in `open-notebook/commands/`, frontend `app/(dashboard)/podcasts/`, `components/podcasts/`, `lib/api/podcasts.ts`, `lib/hooks/*podcast*`, `lib/types/podcast*`, their tests; podcast entries in `use-create-dialogs.tsx`, `CommandPalette.tsx`, `AppSidebar.tsx`, the `text_to_speech` model type in `open_notebook/ai/models.py` / `config.py` / model settings UI **only if** podcasts were its only user (`speech_to_text` stays: audio sources are transcribed with it).
- Modify: `open-notebook/api/main.py` (router includes), `open-notebook/api/command_service.py`, `open-notebook/frontend/next.config.ts` (redirect).
- Create: `siet-platform/siet_platform/migrations/k9.surrealql`, `k9_down.surrealql`; modify `migrations/__init__.py` (`MIGRATION_IDS = list(range(1, 10))`, docstring line `k9  drop podcast tables again (core 20-22 recreate them)`).
- Test: `siet-platform/tests/test_migrations_k9.py`, `open-notebook/frontend/src/next-config.redirects.test.ts`.

**Interfaces:**
- Produces: `k9.surrealql` = `REMOVE TABLE IF EXISTS episode; REMOVE TABLE IF EXISTS episode_profile; REMOVE TABLE IF EXISTS podcast_config; REMOVE TABLE IF EXISTS speaker_profile;` with a header comment. `k9_down.surrealql` = a comment-only no-op ("podcast code is gone; nothing to restore") — the runner must accept a file with no statements (check `AsyncMigration`; if it rejects empty input, use `RETURN NONE;`).
- Produces: `next.config.ts` `redirects()` returning `{ source, destination: '/', permanent: false }` for each deleted page; Tasks 3 and 5 append to the same list.

- [ ] **Step 1: Failing tests.** `test_k9_registered`: `9 in MIGRATION_IDS` and `migration_path(9).read_text()` contains each of the four `REMOVE TABLE IF EXISTS <t>`. `next-config.redirects.test.ts`: `await nextConfig.redirects()` contains `{source: '/podcasts', destination: '/', permanent: false}`.
- [ ] **Step 2:** Run both; expect FAIL (no k9; no redirect).
- [ ] **Step 3:** Before deleting, `git grep -n -i -E 'podcast|episode_profile|speaker_profile'` across all five codebases and both standalone apps; every hit outside the delete list must be a podcast-only branch that goes too, or the task stops and reports.
- [ ] **Step 4:** Delete the files, remove the includes/nav/command entries, add k9 and the redirect.
- [ ] **Step 5:** Run the two tests (PASS), the full suites (baseline minus deleted podcast tests), `routes.py diff api` (only podcast/episode/speaker routes removed), `routes.py diff frontend` (only `/podcasts` removed).
- [ ] **Step 6:** Commit: `refactor(lsp-siet): remove podcasts; k9 drops the podcast tables`.

### Task 3: Remove the Transformations UI and API; keep summaries

**Files:**
- Modify: `open-notebook/api/routers/transformations.py` (keep only `GET /transformations` and `GET /transformations/{id}`; delete create/update/delete/execute/default-prompt endpoints), `open-notebook/api/routers/sources.py` (default transformations), `open-notebook/api/models.py` (drop request models only the deleted endpoints use), add-source dialog (remove the picker; stop sending `transformations`), `AppSidebar.tsx`/navigation (`/transformations` item, in `siet-platform/frontend/src/lib/navigation.ts:87`), `next.config.ts` redirect.
- Delete: frontend `app/(dashboard)/transformations/`, `components/transformations/` (keep any component the source page's "generate insight" menu uses), transformation mutation hooks.
- Test: `open-notebook/tests/test_source_default_transformations.py`, redirect test (extend).

**Interfaces:**
- Produces: in `sources.py`, `async def resolve_transformations(requested: Optional[List[str]]) -> List[Transformation]` — `None` → every `Transformation` with `apply_default is True`; a list (also `[]`) → exactly those ids, as today. Used by `POST /sources`, `POST /sources/json` and the two internal call sites at lines ~530 and ~609.
- Keeps: `POST /sources/{id}/insights`, `insights.py` routes, `Transformation` domain, `graphs/transformation.py`, the insight step of `graphs/source.py`.

- [ ] **Step 1: Failing tests** (mock `Transformation.get_all` with records `A(apply_default=True)`, `B(False)`): `test_missing_transformations_applies_defaults` → `[A]`; `test_empty_list_applies_none` → `[]`; `test_explicit_ids_kept` → `["B"]` → `[B]`. Redirect test: `/transformations` → `/`.
- [ ] **Step 2:** Run; expect FAIL (`resolve_transformations` undefined).
- [ ] **Step 3:** Implement `resolve_transformations`; make the form field default `None` (not `"[]"`) so a missing field is distinguishable; wire the call sites; trim the router and UI; add the redirect.
- [ ] **Step 4:** Tests PASS; suites at baseline minus deleted transformation tests; `routes.py diff api` shows only the removed transformation write endpoints; `diff frontend` only `/transformations`.
- [ ] **Step 5:** Commit: `refactor(lsp-siet): transformations become internal; sources apply the default summaries`.

### Task 4: Remove the old /search page and the unused ask API; kmitl-rag owns /search

**Files:**
- Modify: `open-notebook/frontend/src/app/(dashboard)/search/page.tsx` → a one-line route stub `export { default } from '@siet/kmitl-rag/components/search/WorkspaceSearchPage'`; `kmitl-rag/frontend/src/extension.tsx` (drop the `search.page` slot); `open-notebook/frontend/src/lib/extensions.ts` (drop the `search.page` slot type if nothing else uses it).
- Delete: `OpenNotebookSearchPage` and components/hooks only it uses (`StreamingResponse`, `AdvancedModelsDialog`, `SaveToNotebooksDialog`, `use-ask.ts`, `app/api/search/ask/route.ts`, the `ask*` part of `lib/api/search.ts`) **after** a grep shows no other importer; their tests; `POST /search/ask` and `POST /search/ask/simple` in `open-notebook/api/routers/search.py`.
- Keep: `POST /search` (used by `AddExistingSourceDialog`), `POST /search/ask/notebooks` (kmitl-rag).

- [ ] **Step 1:** `git grep` each candidate symbol across all codebases (`My-ai-quiz`, `ai-roadmap-generator`, `shared`, all frontends, `deploy/`, `docker/`); write the list of confirmed-unused items in the commit message body. Anything still used stays.
- [ ] **Step 2:** Make the changes. Existing `search/page.test.tsx` is deleted with the old page; kmitl-rag's `WorkspaceSearchPage` tests keep running.
- [ ] **Step 3:** Suites at baseline minus deleted tests; `diff api` = only the two ask routes; `diff frontend` = no change (`/search` still exists; `/api/search/ask` route handler gone).
- [ ] **Step 4:** Commit: `refactor(lsp-siet): /search is kmitl-rag's page; drop the old ask API`.

### Task 5: Remove /advanced; Rebuild embeddings moves to /admin/rag

**Files:**
- Create: `kmitl-rag/frontend/src/components/admin/rag/RebuildEmbeddingsPanel.tsx` (moved from the advanced page's rebuild component; same API calls to `embedding_rebuild` routes).
- Modify: `kmitl-rag/frontend/src/app/(dashboard)/admin/rag/page.tsx` (render the panel), navigation (`/advanced` item), `next.config.ts` redirect.
- Delete: `app/(dashboard)/advanced/`, `lib/hooks/use-version-check.ts` and its call site, the `advanced.*` version keys, the version-check toast suppression in `siet-platform/frontend/src/extension.tsx:35`.
- Test: `kmitl-rag/frontend/src/components/admin/rag/RebuildEmbeddingsPanel.test.tsx`, redirect test (extend).

- [ ] **Step 1: Failing tests.** Panel renders a button labelled as on the old page; clicking it calls the same `embeddingApi` rebuild function (mock) once. Redirect: `/advanced` → `/`.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Move the component, wire it into `/admin/rag`, delete the page and version check.
- [ ] **Step 4:** Tests PASS; suites at baseline; `diff frontend` = only `/advanced`; `diff api` = none (backend `/embeddings/rebuild*` stays).
- [ ] **Step 5:** Commit: `refactor(lsp-siet): rebuild embeddings lives in /admin/rag; drop /advanced`.

### Task 6: en-US only

**Files:**
- Delete: `open-notebook/frontend/src/lib/locales/{bn-IN,ca-ES,de-DE,es-ES,fr-FR,it-IT,ja-JP,pl-PL,pt-BR,ru-RU,tr-TR,zh-CN,zh-TW}/`.
- Modify: `lib/locales/index.ts` (only `en-US`), the language picker component and its settings entry (remove), `siet-platform/frontend/src/lib/translations.ts` (only the `en-US` block), `lib/locales/index.test.ts` (expect one language).

- [ ] **Step 1:** Update `index.test.ts` to assert `Object.keys(resources) == ['en-US']` and no picker in settings; run → FAIL.
- [ ] **Step 2:** Delete and simplify; i18n init keeps `fallbackLng: 'en-US'`; a stored `language` cookie/localStorage value for another locale must fall back to en-US without error (cover with one test: init with `lng: 'th-TH'` resolves to en-US strings).
- [ ] **Step 3:** Suites at baseline (the known `locales/index.test.ts` unused-key failure may disappear — record it).
- [ ] **Step 4:** Commit: `refactor(lsp-siet): keep en-US only`.

### Task 7: Remove upstream tracking

**Files:**
- Delete: `docs/UPSTREAM.md`, `docs/upstream/`, `scripts/upstream/`, `scripts/siet-split/`, `open-notebook/{docs,examples,.maintainer,.codex,.github}/` (`open-notebook/commands/` is the Python package the worker runs — **keep it**), `open-notebook/{CONTRIBUTING,CODE_OF_CONDUCT,MAINTAINER_GUIDE,SECURITY,VISION,CHANGELOG,README.dev,CONFIGURATION}.md`, `open-notebook/cubic.yaml`, `open-notebook/{Dockerfile,docker-compose.yml,docker-compose.override.yml.example,supervisord.conf,supervisord.surrealdb.conf,dev-init.sh}` **only if** nothing in `docker/`, `Makefile`, `deploy/`, `.github/workflows` references them (`docker/open-notebook/Dockerfile` is ours and stays).
- Create: `open-notebook/NOTICE` = the full text of `open-notebook/LICENSE` preceded by `LSP-SIET includes code from Open Notebook (https://github.com/lfnovo/open-notebook), licensed under the MIT License:`; delete `open-notebook/LICENSE` after copying.
- Modify: `CODEOWNERS` (drop upstream lines), `Makefile` (drop `upstream-*` / `migrate-split`-unrelated upstream targets), `docs/ARCHITECTURE.md` references to UPSTREAM.md.
- Git: `git remote remove upstream`; `git branch -D vendor/open-notebook` (local only; record the commit id `22bf9ea` in the commit message).

- [ ] **Step 1:** Grep each file name before deleting (`git grep -n '<name>'`); keep anything referenced by live tooling and list it in the commit body.
- [ ] **Step 2:** Delete, create NOTICE, edit references.
- [ ] **Step 3:** Suites at baseline; `docker build -f docker/open-notebook/Dockerfile .` still succeeds (or `docker build --check` if a full build is too slow; record which).
- [ ] **Step 4:** Commit: `chore(lsp-siet): stop tracking upstream open-notebook; keep its MIT notice`.

---

## Phase 2 - Backend move

### Task 8: The move table and the codemod

**Files:**
- Create: `scripts/lsp-siet/moves.py`, `scripts/lsp-siet/codemod.py`, `scripts/lsp-siet/test_codemod.py`.

**Interfaces:**
- Produces `moves.py`:
  - `MOVES: list[tuple[str, str]]` — `(old_repo_path, new_repo_path)`, file or directory prefix, applied longest-old-path first. Initial content:
    `("open-notebook/open_notebook", "platform/siet_core")`, `("open-notebook/api", "platform/api")`, `("open-notebook/commands", "platform/commands")`, `("open-notebook/prompts", "platform/prompts")`, `("open-notebook/tests", "platform/tests")`, `("open-notebook/frontend", "platform/frontend")`, `("open-notebook", "platform")`, `("siet-platform/siet_platform", "platform/siet_platform")`, `("siet-platform/tests", "platform/tests-platform")`, `("siet-platform/frontend/src", "platform/frontend/src")`, `("siet-platform", "platform")`, `("My-ai-quiz", "my-ai-quiz/app")`, `("ai-roadmap-generator", "ai-roadmap/app")`. Tasks 9-12 append.
  - `PY_ROOTS_OLD` / `PY_ROOTS_NEW: list[str]` — directories whose children are top-level Python packages (`open-notebook`, `siet-platform`, `kmitl-rag`, `community` / `platform`, `kmitl-rag`, `community`, `my-ai-quiz`, `ai-roadmap`).
  - `TS_ALIASES_OLD` / `TS_ALIASES_NEW: dict[str, str]` — source dir → alias prefix (Global Constraints).
  - `MODULE_RENAMES = {"open_notebook": "siet_core"}`, `ENTRY_POINT_GROUP = ("open_notebook.extensions", "siet.extensions")`.
  - `SYMBOL_MOVES: dict[str, str]` — `"old.module.Name": "new.module.Name"` (Task 10 fills).
  - `ENV_RENAMES: dict[str, str]` (Task 15 fills).
- Produces `codemod.py [--check] [--no-moves]`:
  1. for each tracked or untracked-not-ignored file under an old path, `git mv` to the new path (collision: the file coming from `siet-platform/` wins, the other is deleted and reported);
  2. Python: rewrite dotted module names derived from moved `.py` paths and `MODULE_RENAMES` (imports, `mock.patch("…")` / `monkeypatch.setattr("…")` strings, entry-point strings in `pyproject.toml`); split `from X import A, B` per `SYMBOL_MOVES`;
  3. TS/TSX: rewrite import specifiers whose resolved target moved (alias → alias via the two alias tables; relative specifiers resolved against the file's old location, rewritten to the new alias form when the relative path no longer holds);
  4. text in `.toml`, `.json`, `.yml`, `Makefile`, `Dockerfile*`, `.env.example`, `.sh`: rewrite `ENV_RENAMES` keys (whole-word);
  5. `--check` prints planned changes, exit 1 if any; idempotent.

- [ ] **Step 1: Failing tests** in `test_codemod.py`, each building a temp git repo:
  - `test_moves_python_package_and_rewrites_imports`: `open-notebook/open_notebook/a.py` + `siet-platform/siet_platform/b.py` with `from open_notebook.a import x` → `platform/siet_core/a.py`, `platform/siet_platform/b.py` with `from siet_core.a import x`.
  - `test_patch_strings_rewritten`: `mock.patch("open_notebook.a.x")` → `"siet_core.a.x"`.
  - `test_ts_alias_rewrite`: `@siet/platform/lib/roles` → `@/lib/roles`.
  - `test_relative_import_of_split_files`: file moved away from its relative sibling gets an alias specifier.
  - `test_collision_platform_wins`: both `open-notebook/frontend/src/lib/hooks/use-auth.ts` and `siet-platform/frontend/src/lib/hooks/use-auth.ts` → only the latter's content at `platform/frontend/src/lib/hooks/use-auth.ts`.
  - `test_new_file_under_moved_dir`: an extra `open-notebook/open_notebook/new_mod.py` not named anywhere moves to `platform/siet_core/new_mod.py`.
  - `test_symbol_split`: `from siet_platform.features.domain import QuizSession, RoadmapSession` with `SYMBOL_MOVES` → two import lines.
  - `test_entry_point_group`: `[project.entry-points."open_notebook.extensions"]` → `"siet.extensions"`.
  - `test_idempotent`: second run → `--check` exit 0.
- [ ] **Step 2:** `python3 -m pytest scripts/lsp-siet/test_codemod.py` → FAIL.
- [ ] **Step 3:** Implement (stdlib only; reuse the regex helpers of the deleted `scripts/siet-split/codemod.py` from git history `git show HEAD~1:scripts/siet-split/codemod.py` as a reference).
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit: `feat(lsp-siet): move table and codemod`.

### Task 9: Run the codemod on the repo: platform/ exists, one Python project

**Files:**
- Moves: everything in the initial `MOVES` (Task 8).
- Modify: `platform/pyproject.toml` — `name = "lsp-siet-platform"`, description `LSP-SIET platform: API host, core (DB, AI models, embedding, graphs), accounts, auth, points and admin.`, authors = the team, merged `dependencies` of the two old projects, `[tool.setuptools.packages.find] include = ["siet_core*", "api*", "commands*", "siet_platform*"]`, package-data of both, `[project.entry-points."siet.extensions"] siet_platform = "siet_platform.extension"`, `[tool.uv.sources]` path deps `kmitl-rag = "../kmitl-rag"`, `siet-community = "../community"` (Tasks 10 add quiz/roadmap); delete the old `siet-platform/pyproject.toml`; `uv lock`.
- Modify: `siet_core/extensions.py` (`ENTRY_POINT_GROUP = "siet.extensions"`, docstring), `kmitl-rag/pyproject.toml` and `community/pyproject.toml` (`dependencies = ["lsp-siet-platform"]`, sources path `../platform`, entry-point group), `Makefile` (`SIET_TEST_DIRS = tests tests-platform ../kmitl-rag/tests ../community/tests`, `cd platform`), both layering tests (`SOURCES` paths, `core` = `platform/{api,siet_core,commands}`).

- [ ] **Step 1:** `python3 scripts/lsp-siet/codemod.py` at the worktree root; review `git status` (renames only, plus rewritten imports).
- [ ] **Step 2:** Edit the pyproject files and Makefile as above; `uv lock`; `uv sync --frozen`.
- [ ] **Step 3:** `make test-backend` → baseline failure list (node ids re-pathed); `routes.py diff api` → empty.
- [ ] **Step 4:** `git grep -n -E '\bopen_notebook\b' -- '*.py' '*.toml'` → only `SURREAL_NAMESPACE`/`SURREAL_DATABASE` defaults and migration history; nothing else.
- [ ] **Step 5:** Commit: `refactor(lsp-siet): open-notebook + siet-platform become platform/ (siet_core)`.

### Task 10: Notebooks/sources routers to kmitl-rag; quiz and roadmap packages

**Files:**
- Append `MOVES`: `platform/api/routers/{notebooks,sources,notes,chat,source_chat,embedding,embedding_rebuild,insights,transformations,search}.py` → `kmitl-rag/kmitl_rag/routers/<same>.py`; their tests → `kmitl-rag/tests/`.
- Modify: `platform/api/main.py` (drop those includes), `kmitl-rag/kmitl_rag/extension.py` — include them in `finalize(app)` (runs after the remaining core routers, i.e. where `main.py` included them; same `prefix="/api"` and tags, same order as in `main.py`).
- Tests that move with the routers and use fixtures from `platform/tests/conftest.py`: copy those fixtures into `kmitl-rag/tests/conftest.py` (do not import across test dirs).
- Create: `platform/siet_platform/ai_helpers.py` with `_hash_prompt`, `_retrieve_rag_context`, `_format_rag_chunks`, `_extract_json`, `_invoke_chat` (moved, signatures unchanged).
- Create: `my-ai-quiz/pyproject.toml` (`name = "siet-quiz"`, deps `["lsp-siet-platform"]`, entry point `siet_quiz = "siet_quiz.extension"`), `my-ai-quiz/siet_quiz/{__init__,domain,schemas,service,extension}.py`, `my-ai-quiz/siet_quiz/routers/{features,admin}.py`, `my-ai-quiz/tests/`; same shape for `ai-roadmap/` (`siet-roadmap`, `siet_roadmap`).
- `SYMBOL_MOVES`: `siet_platform.features.domain.QuizSession` → `siet_quiz.domain.QuizSession`, `…RoadmapSession` → `siet_roadmap.domain.RoadmapSession`, `siet_platform.features.service._extract_json/_hash_prompt/_invoke_chat` → `siet_platform.ai_helpers.*`, `siet_platform.features.service.generate_quiz` → `siet_quiz.service.generate_quiz`, `…generate_roadmap` → `siet_roadmap.service.generate_roadmap`, schemas likewise by prefix `Quiz*`/`Roadmap*`.
- Modify: `community/siet_community/routers/admin.py` — move the quiz/roadmap session endpoints (the ones importing `QuizSession`/`RoadmapSession`, ~lines 218-426) to `siet_quiz/routers/admin.py` / `siet_roadmap/routers/admin.py` **if** they import nothing from `siet_community`; otherwise leave them and note it.
- Extensions: `siet_quiz.extension.ORDER = 11`, `siet_roadmap.extension.ORDER = 12`; `install(app)` includes `features` (prefix `/api`, tag `features`) then `admin` (prefix `/api`, tag `admin`). Remove `features.router` from `siet_platform/extension.py`.
- Delete: `platform/siet_platform/features/`, `platform/siet_platform/routers/features.py` (after the moves).
- Modify: `platform/pyproject.toml` sources + deps add `siet-quiz = "../my-ai-quiz"`, `siet-roadmap = "../ai-roadmap"`; `Makefile` test dirs add `../my-ai-quiz/tests ../ai-roadmap/tests`; backend layering test → the DAG in Global Constraints (`ALLOWED: dict[str, set[str]]` instead of a linear list).

- [ ] **Step 1: Failing test** — layering: `test_no_imports_against_the_graph[siet_quiz]` and `[siet_roadmap]` with `ALLOWED = {"core": {"core"}, "siet_platform": {"core","siet_platform"}, "kmitl_rag": {…,"kmitl_rag"}, "siet_quiz": {"core","siet_platform","siet_quiz"}, "siet_roadmap": {…}, "siet_community": {all}}` → FAIL (packages missing).
- [ ] **Step 2:** Append MOVES/SYMBOL_MOVES; run the codemod; split `service.py` by function (quiz functions + `_clean_*`, `_question_type`, `_enforce_quiz_invariants`, `_quiz_prompt`, `_persist_quiz` → quiz; `_enforce_roadmap_invariants`, `generate_roadmap`, `_persist_roadmap` → roadmap; helpers → `ai_helpers`); write the extension modules.
- [ ] **Step 3:** `uv lock && uv sync --frozen`; `make test-backend` → baseline; `routes.py diff api` → empty (same set; also assert no duplicate method+path); `test_route_order_preserved` (new, in `platform/tests-platform/test_route_order.py`): the routes common to `api-routes-ordered.txt` and the current `--ordered` list appear in the same relative order.
- [ ] **Step 4:** Commit: `refactor(lsp-siet): notebooks/sources API in kmitl-rag; quiz and roadmap packages`.

---

## Phase 3 - Frontend move

### Task 11: One host app in platform/frontend

**Files:**
- (Moves already done by Task 9: `siet-platform/frontend/src/*` merged into `platform/frontend/src/*`, collisions won by the platform file — the route stubs and the three replaced modules.)
- Modify: `platform/frontend/tsconfig.json` (`paths`: remove `@siet/platform/*`; add `@siet/quiz/*` → `../../my-ai-quiz/frontend/src/*`, `@siet/roadmap/*` → `../../ai-roadmap/frontend/src/*`), `vitest.config.*` aliases and `include` globs (the two new dirs), `app/siet.css` `@source` lines (add the two dirs), `lib/extensions.installed.ts` (`import platform from '@/extension'`), `Makefile` `SIET_FRONTENDS = kmitl-rag community my-ai-quiz ai-roadmap` and link target `../../platform/frontend/node_modules`, `shared/node_modules` link.
- Move: `platform/frontend/src/layering.test.ts` stays in platform; rewrite as the frontend DAG (`host` = `platform/frontend/src`, no `HOST_ALLOWED` exceptions for the three replaced modules any more).

- [ ] **Step 1:** Update `layering.test.ts` to the DAG and the new dirs; run → FAIL (quiz/roadmap dirs missing).
- [ ] **Step 2:** Create empty `my-ai-quiz/frontend/src/extension.tsx` and `ai-roadmap/frontend/src/extension.tsx` (`const extension: FrontendExtension = {}; export default extension`), register both in `extensions.installed.ts`; apply the config edits.
- [ ] **Step 3:** `make test-frontend` → baseline (minus earlier deletions); `next build` in `platform/frontend` succeeds; `routes.py diff frontend` → empty.
- [ ] **Step 4:** Commit: `refactor(lsp-siet): one host frontend in platform/`.

### Task 12: Move pages and UI to their parts

**Files (append to `MOVES`, then run the codemod):**
- community ← platform: `components/community/{CommunityHeader,LibraryPanel,StudyDialog}.tsx`, `lib/api/{community,community-search,moderation,courses,library}.ts`, `lib/hooks/{use-community,use-community-palette,use-moderation,use-courses,use-library,use-advanced-search}.ts`, `lib/utils/community-format.ts` — each **only if** after the move `layering.test.ts` passes (the platform shell must not import it; `NotificationsMenu`, `PointsWallet`, `PointsWalletLink` stay in platform). Files the shell needs stay and are listed in the commit body.
- kmitl-rag ← platform: route modules and page-only components of `/notebooks`, `/notebooks/[id]`, `/sources`, `/sources/[id]` (`app/(dashboard)/notebooks/**`, `app/(dashboard)/sources/**` page/layout files and components imported only by them). The notebooks/sources data layer (`lib/api/{notebooks,sources,notes,chat,…}`, hooks, types) and dialogs the shell opens (create notebook/source) stay in platform.
- my-ai-quiz ← community: `app/(dashboard)/admin/quiz/**`, `components/admin/quiz/**` → `my-ai-quiz/frontend/src/...`.
- ai-roadmap ← community/platform: `app/(dashboard)/admin/roadmap/**`, `components/admin/roadmap/**`, `app/(dashboard)/go/roadmap/**` → `ai-roadmap/frontend/src/...`.
- platform ← community: `app/(dashboard)/features/**` (the AI Features hub) → `platform/frontend/src/app/(dashboard)/features/**`, unless it imports community-only code (then it stays and the commit body says why).
- Host route stubs for the moved pages point at the new package (Task 13 will regenerate them).
- Rename identifiers: `OpenNotebookSearchPage` (gone in Task 4), `openNotebookDialog` → `openCreateNotebookDialog` (all call sites).

- [ ] **Step 1:** Append MOVES; run `codemod.py`; fix the route stubs.
- [ ] **Step 2:** `make test-frontend` → baseline; `layering.test.ts` PASS; `next build` OK; `routes.py diff frontend` → empty.
- [ ] **Step 3:** Commit: `refactor(lsp-siet): pages and UI live in their parts`.

### Task 13: Generated route files

**Files:**
- Create: `scripts/frontend-routes.mjs`, `platform/frontend/src/frontend-routes.test.ts`.
- Modify: every one-line stub in `platform/frontend/src/app/**` that re-exports a package page (regenerated, first line `// generated by scripts/frontend-routes.mjs - edit the page in its part`), `Makefile` (`frontend-routes` target; `dev`, `build`, `test-frontend` depend on it), `.github/workflows/image.yml` and `docker/allinone/Dockerfile` (run it before `next build`).

**Interfaces:**
- `node scripts/frontend-routes.mjs [--check]`: for each part dir in `[kmitl-rag, community, my-ai-quiz, ai-roadmap]`, every `frontend/src/app/**/{page,layout,route,loading,error,not-found}.{ts,tsx}` → `platform/frontend/src/app/<same rel path>` containing the marker line and `export { default } from '@siet/<alias>/app/<rel path without ext>'` (plus `export * from` for `route.ts`, and re-export `metadata`/`dynamic` when the source exports them). Deletes generated files (marker present) with no source. Refuses (exit 2) to overwrite a non-generated host file. `--check`: exit 1 and list paths if anything would change.

- [ ] **Step 1: Failing tests** (`frontend-routes.test.ts`, runs the script with `--check` in a temp copy): `generates_stub_for_new_page` (add `community/frontend/src/app/(dashboard)/community/x/page.tsx` → host stub appears with the exact two lines); `removes_orphan_stub`; `refuses_hand_written_file`; and on the real tree `--check` exits 0.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; regenerate; delete hand-written stubs the script now owns.
- [ ] **Step 4:** Tests PASS; `routes.py diff frontend` → empty; `next build` OK.
- [ ] **Step 5:** Commit: `feat(lsp-siet): page routes are generated from each part`.

---

## Phase 4 - Apps and infra

### Task 14: Apps, Docker, compose, CI, scripts

**Files:**
- (Apps moved in Task 9: `my-ai-quiz/app`, `ai-roadmap/app`.)
- Modify: `my-ai-quiz/app/Dockerfile`, `ai-roadmap/app/Dockerfile` (build contexts/paths, `shared/` copy), `docker/open-notebook/` → `docker/platform/` (`git mv`) and its Dockerfile paths, `docker/allinone/Dockerfile` (all `COPY`/`WORKDIR` paths), `docker/allinone/rootfs/**` s6 run scripts (`quiz/run`, roadmap, api) and `usr/local/bin/lsp-backup`, `docker-compose.yml`, `docker-compose-dev.yml`, `docker-compose.prod.yml` (build contexts, dockerfile paths, data mounts `./platform/{surreal_data,notebook_data,redis_data,prompts}`, service `open_notebook_api` → `lsp_siet_api`, `container_name: lsp_siet_api`, `image: kmitlai/lsp-siet:local`, every `http://open_notebook_api:5055` → `http://lsp_siet_api:5055`), `docker/traefik/dynamic/all.yml` (service URLs), `Makefile`, `dev.sh`, `deploy/{export-data,import-data,migrate-to-allinone}.sh`, `.github/workflows/image.yml` (paths, typecheck steps), `.gitignore` (data dirs under `platform/`), `.dockerignore`.
- Test: `scripts/lsp-siet/test_infra_paths.py`.

- [ ] **Step 1: Failing test** `test_no_old_paths_in_infra`: no occurrence of `open-notebook/`, `open_notebook_api`, `kmitl_open_notebook_api`, `kmitlai/open-notebook`, `My-ai-quiz`, `ai-roadmap-generator`, `siet-platform/` in the infra files listed above; every `COPY <src>` source path in the three Dockerfiles exists in the repo. Run → FAIL.
- [ ] **Step 2:** Edit the files.
- [ ] **Step 3:** Test PASS; `docker compose -f docker-compose.yml config -q` and the other two exit 0; `docker build -f docker/allinone/Dockerfile -t lsp-siet:restructure-test .` succeeds (tag must not be `kmitlai/*:local`); `npm run build` succeeds in `my-ai-quiz/app` and `ai-roadmap/app`.
- [ ] **Step 4:** Commit: `build(lsp-siet): apps, Docker, compose and CI on the new layout`.

---

## Phase 5 - Rebrand

### Task 15: Environment variables with fallback

**Files:**
- Create: `platform/siet_core/env.py`; `platform/frontend/src/lib/env.ts`.
- Modify: every `os.getenv/os.environ` read of an `OPEN_NOTEBOOK_*` name in Python (all parts) → `env()`; every `process.env.OPEN_NOTEBOOK_*` / `NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL` read in the host app and both apps (`my-ai-quiz/app/app/api/**`, `ai-roadmap/app/src/pages/api/**`) → `env()` (each app gets its own 10-line copy, they share no code); `.env.example` (new names only); compose files (new names, values `${LSP_SIET_X:-${OPEN_NOTEBOOK_X:-default}}`); `moves.ENV_RENAMES` filled from the list.
- Test: `platform/tests/test_env_fallback.py`, `platform/frontend/src/lib/env.test.ts`, `platform/tests/test_credentials_old_key.py`.

**Interfaces:**
- `siet_core.env.env(name: str, default: str | None = None) -> str | None` — `name` is the new name (`LSP_SIET_…`); reads `os.environ[name]`, else the old name from `LEGACY_NAMES: dict[str, str]` (logs one `loguru` warning per old name per process), else `default`.
- `env(name: string, fallback?: string): string | undefined` in TS, same rule, `console.warn` once.

- [ ] **Step 1: Failing tests:** `test_env_fallback_new_wins` (both set → new), `test_env_fallback_old_used_and_warns` (only old → old value, one warning across two calls), `test_env_default`; `test_credentials_decrypt_with_old_key_name`: encrypt with `OPEN_NOTEBOOK_ENCRYPTION_KEY=k` set, decrypt with only that old name set → same plaintext (uses `siet_core.utils.encryption`). TS: the same three cases.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; replace the reads (`git grep -n -E 'OPEN_NOTEBOOK_\w+'` must then list only `LEGACY_NAMES`, `.env` fallbacks in compose, and tests).
- [ ] **Step 4:** Tests PASS; full suites at baseline.
- [ ] **Step 5:** Commit: `feat(lsp-siet): LSP_SIET_* settings with fallback to the old names`.

### Task 16: Texts, links, names, docs, ownership; the guard

**Files:**
- Modify: `platform/frontend/src/app/layout.tsx` (`title: "LSP-SIET"`, `description: "LSP-SIET - KMITL SIET learning space: community, KMITL RAG AI, AI Quiz and AI Roadmap"`), en-US locale strings (`appName`, `loginTitle` → `LSP-SIET`; `connectionErrors.apiDesc` → `The LSP-SIET API server could not be reached`; `docLink` key and its link removed from `ConnectionErrorOverlay.tsx`; `settings.filesHelp` → `…Most users should allow LSP-SIET to delete…`; `models.defaultAssignmentsDesc` → `Configure which models to use for different purposes across LSP-SIET`; `models.missingRequiredModels` → `Missing required models: {{models}}. LSP-SIET may not function properly without these.`), `translations.ts` (drop the `appName` override), the three lfnovo links (`settings/models/page.tsx`, `SetupBanner.tsx`, and any left after Task 5) removed with their surrounding "docs" text, `globals.css` header comment, `platform/api/main.py` (`title="LSP-SIET API"`, `description="API for LSP-SIET"`, root message `LSP-SIET API is running`, auth router docstring), `siet_quiz/service.py` + `siet_roadmap/service.py` + `ai_helpers.py` prompt strings (`[เอกสาร: {title}]`, `Use the following retrieved course documents as the …`), comments in `my-ai-quiz/app/app/api/**` and `ai-roadmap/app/src/pages/api/ws/**` ("SIET Space API (Open Notebook)" → "LSP-SIET API"), `ShareMyWorkDialog.tsx:67` comment, logo/favicon if `platform/frontend/public/logo.svg` or `app/icon*`/`favicon*` is Open Notebook's (replace with `shared/mascot` artwork), `README.md`, `docs/ARCHITECTURE.md`, `docs/SYSTEM-GUIDE*`, `docs/RUNBOOK*`, each part's `README.md`, `platform/{AGENTS,CLAUDE}.md` and `siet_core/{AGENTS,CLAUDE}.md` (rewrite for LSP-SIET or delete if they only describe upstream workflow), `.github/CODEOWNERS`:
  ```
  *                       @phuwishpk
  /platform/              @phuwishpk
  (the Tanabordi auth lines, re-pathed to /platform/...)
  /kmitl-rag/             @phuwishpk
  /community/             @pornprompoh @phuwishpk
  /my-ai-quiz/            @SpriteUm @phuwishpk
  /ai-roadmap/            @phuwishpk
  ```
- Create: `scripts/lsp-siet/test_no_open_notebook.py`.

- [ ] **Step 1: Failing test** `test_no_open_notebook_left`: `git grep -n -i -I -E 'open[ _-]?notebook'` over tracked files, excluding `platform/NOTICE`, `platform/siet_core/database/migrations/**`, `platform/siet_platform/migrations/**`, `docs/superpowers/**`, `docs/lsp-siet/**`, `scripts/lsp-siet/**`, `**/uv.lock`, `**/package-lock.json`; allowed remaining matches are exactly lines containing `SURREAL_NAMESPACE`, `SURREAL_DATABASE`, or `LEGACY_NAMES`/`OPEN_NOTEBOOK_` inside `siet_core/env.py`, `lib/env.ts`, the apps' env helpers and compose fallbacks. Run → FAIL (many hits).
- [ ] **Step 2:** Make the edits until the test passes. Thesis folders (`docs-thesis*`) are the owner's writing: if they match, list them in the commit body and exclude them in the test rather than editing.
- [ ] **Step 3:** Suites at baseline; `next build`; open the built `/login` HTML and check `<title>LSP-SIET</title>`.
- [ ] **Step 4:** Commit: `refactor(lsp-siet): LSP-SIET everywhere; codeowners per part`.

---

## Phase 6 - Teammates

### Task 17: Codemod dry-run on open branches; handoff note

**Files:**
- Create: `docs/handoff/lsp-siet.md` (Thai), `docs/lsp-siet/dryrun.md`.

- [ ] **Step 1:** For each of `origin/feat/quiz-ai`, `origin/dev-poh`, `origin/dev-poh-edit01`, `origin/feat/auth-rbac-logs-visibility-moderation`, `feat/rag-community-search`: in a throwaway worktree, check out the branch, merge `main` (8efc391) if behind, copy in `scripts/lsp-siet/`, run `codemod.py`, commit, then `git merge --no-commit refactor/lsp-siet`; record conflict counts by type (`git status --porcelain` codes) and which files, then `git merge --abort`. Never push; delete the worktrees.
- [ ] **Step 2:** For any conflict caused by the codemod (not by real edits on both sides), fix the codemod (with a new test in `test_codemod.py`) and re-run.
- [ ] **Step 3:** Write `dryrun.md` (table: branch, ahead/behind, conflicts before/after codemod, files) and `handoff/lsp-siet.md`: what moved (the layout table), the 3 commands (`git merge main`, `python3 scripts/lsp-siet/codemod.py`, `git merge refactor/lsp-siet`), where each person's code now lives, `make frontend-routes` for new pages, env names.
- [ ] **Step 4:** Commit: `docs(lsp-siet): codemod dry-run results and teammate handoff`.

---

## Phase 7 - Verification

### Task 18: Isolated stack with production data

**Files:**
- Create: `scripts/lsp-siet/get_snapshot.py`, `docs/lsp-siet/verification.md`.

**Interfaces:**
- `get_snapshot.py save <base_url> <out.json> --token <jwt>` GETs the endpoint list (the ~66 admin/staff/student GET endpoints used in earlier snapshots: users/me, community feed/rooms/leaderboard, notebooks, sources, models, settings, admin stats, quiz/roadmap sessions, /config/apps …; list in the script), stores status + normalised JSON (ids kept, timestamps/counters dropped); `diff a.json b.json` prints per-endpoint differences.

- [ ] **Step 1:** Copy production data read-only: `surreal export` inside the running SurrealDB container to a scratch file + `docker cp`; `mariadb-dump --single-transaction` from the MariaDB container; prod env from `docker inspect` of the API container. Do not stop or modify any `kmitlai` container.
- [ ] **Step 2:** Start test containers on network `lsptest-net` (`lsptest-surreal` memory engine, `lsptest-mariadb`, `lsptest-redis`), import the data (rewrite `DEFINE FIELD` → `DEFINE FIELD OVERWRITE` before import, as `lsp-backup` does).
- [ ] **Step 3:** Run the baseline image (build from `git archive main`, tag `lsp-baseline:test`) on ports 25055/28502 with the prod env → `get_snapshot.py save … base.json`.
- [ ] **Step 4:** Swap to `lsp-siet:restructure-test` (Task 14) with the **same, unmodified prod env (old variable names only)** → API logs show k9 applied once and the fallback warnings; `save … new.json`; restart once more → k9 not re-applied.
- [ ] **Step 5:** `diff base.json new.json`: allowed differences only for deleted endpoints and counters. Check: one stored provider credential works (call the models list that needs a key, or decrypt in a shell); upload a small text source without `transformations` → a `source_insight` appears for each `apply_default` transformation; list which transformations have `apply_default = true` on this copy — **if none do, stop and ask the owner** whether to set "Dense Summary" as default (doing nothing means new uploads get no summaries).
- [ ] **Step 6:** Browser pass on the test stack: `/login` title, `/community`, `/notebooks`, `/sources`, `/search`, `/admin/rag` (rebuild button), `/admin/quiz`, `/admin/roadmap`, `/podcasts` → `/`, `/advanced` → `/`, quiz app and roadmap app pages load.
- [ ] **Step 7:** Write `verification.md` (what was compared, results, the apply_default finding, the production deploy steps: backup surreal + mariadb, stop stack, `mv open-notebook/{surreal_data,notebook_data,redis_data} platform/`, compose up with new service names, k9 runs on start, rollback = old image tag + move data dirs back) and stop/remove the `lsptest-*` containers and network.
- [ ] **Step 8:** Commit: `docs(lsp-siet): verification on a copy of production data`.

Merge into `main` and the production deploy happen only when the owner says so.
