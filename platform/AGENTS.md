# LSP-SIET platform — Agent Rules

`platform/` is the shared base of LSP-SIET (the KMITL SIET learning space): the Python core (`siet_core`, `api`, `commands`, `prompts`), the SIET platform package (`siet_platform`: accounts, JWT, roles, points, throttling, caches, knowledge library) and the host Next.js app (`frontend/`). The other parts (`kmitl-rag/`, `community/`, `my-ai-quiz/`, `ai-roadmap/`) plug into it.

This file holds the rules every coding session in `platform/` needs. Component rules: [siet_core/AGENTS.md](siet_core/AGENTS.md) (backend — also covers `api/`, `commands/`, `prompts/`) and [frontend/AGENTS.md](frontend/AGENTS.md). Structure, layering and the hook points: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Stack, ports, startup order

Three tiers: Next.js frontend (3000) → FastAPI (5055) → SurrealDB (8000), plus MariaDB (users, points, feed) and Redis (cache).

The supported way to run everything is the compose stack from the repo root:

- `make up` builds and starts it; `make up-dev` is the hot-reload stack; `make logs`, `make ps`, `make down`
- the API container (`lsp_siet_api`) runs three processes under supervisord: the API, the surreal-commands worker (**required**: embeddings and source processing are async jobs that silently queue forever without it) and the frontend
- schema migrations run automatically on API start (check the logs)

## Commands (repo root)

- Backend tests: `make test-backend` (all parts, `ARGS=...` for pytest options) — the known baseline failures are listed in `docs/lsp-siet/known-failures.txt`
- Frontend: `make test-frontend` (links the part packages, regenerates the route stubs, then `tsc` + `vitest`); inside `frontend/`: `npm run lint` · `npm run build`
- After adding or removing a page in a part: `make frontend-routes`
- Repo checks (codemod, infra paths, the guard that no old product name is left): `python -m pytest scripts/lsp-siet -q`
- Python lint/format/typecheck (inside `platform/`): `ruff check . --fix` · `ruff format .` · `uv run python -m mypy .`

## Hard rules

- **Async-first**: every DB query, graph invocation and AI call is `await`-ed. No sync DB access.
- **Never commit secrets.** Provider credentials are encrypted at rest and need `LSP_SIET_ENCRYPTION_KEY` (the same key signs the workspace JWT when `JWT_SECRET` is empty). Never change it on a running installation.
- **Layering** (enforced by `tests-platform/test_layering.py` and `frontend/src/layering.test.ts`): `siet_core`/`api`/`commands` import no SIET package; `siet_platform` imports only the core; each part imports only `siet_platform`, with `community` the one part allowed to import the others. Add behaviour to the core through a hook, never by importing a SIET package into it.
- **Values that must keep the old name**: the SurrealDB namespace/database `open_notebook`, the surreal-commands app name `open_notebook`, `JWT_ISSUER`, `PBKDF2_SALT` and the `OPEN_NOTEBOOK_*` fallbacks of the settings. They are stored in tokens, ciphertext and the database. `scripts/lsp-siet/test_no_open_notebook.py` lists them and fails on any other mention of the old name.
- CORS defaults to the local stack and auth is the workspace JWT with role checks in `siet_platform/auth_roles.py` — deny by default for new routers.
- New settings use the `LSP_SIET_` prefix and are read through `siet_core.env` (backend) or `src/lib/env.ts` (frontend), which keep the old names working.

## Where to look

| Need | Location |
|---|---|
| Layout, layering, hook points, migrations | [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) |
| System overview, roles, points, API map | [docs/SYSTEM-GUIDE.md](../docs/SYSTEM-GUIDE.md) |
| Install and run | [docs/RUNBOOK.md](../docs/RUNBOOK.md) |
| Admin consoles | [docs/admin/README.md](../docs/admin/README.md) |
| Redis caches and the answer cache | [siet_platform/cache/CLAUDE.md](siet_platform/cache/CLAUDE.md) |
| Licence of the code this project includes | [NOTICE](NOTICE) |
