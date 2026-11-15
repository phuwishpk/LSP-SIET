# Backend Rules (api/ + siet_core/ + commands/ + prompts/)

Normative rules for working on the platform's Python core: `siet_core` (database, AI, graphs, domain), `api`, `commands` and `prompts`. Where the SIET packages sit and what may import what: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md). This file is only what you must know before changing code. Project-wide rules are in [AGENTS.md](../AGENTS.md).

Nothing in this layer may import `siet_platform`, `kmitl_rag`, `siet_community`, `siet_quiz` or `siet_roadmap` (`tests-platform/test_layering.py` fails if it does). Reach them through the hooks in `siet_core/extensions.py`.

## Commands

All commands run from `platform/` unless noted.

- Run API: `uv run uvicorn api.main:app --port 5055` (Swagger at http://localhost:5055/docs)
- Background jobs need the worker: `uv run surreal-commands-worker --import-modules commands` (the compose image runs it under supervisord)
- Tests: from the repo root `make test-backend` (all parts; `ARGS=...` passes pytest options); one directory: `PYTHON_DOTENV_DISABLED=1 uv run pytest tests/`
- Lint/format/typecheck: `ruff check . --fix`, `ruff format .` and `uv run python -m mypy .` (`mypy.ini` lists the modules still exempt)

## API layer (`api/`)

- Structure is routes → services → models. Routers stay thin; business logic goes in `*_service.py`.
- Provider metadata (env vars, modalities, test models, discovery URLs, docs links) lives in the registry: `siet_core/ai/provider_registry.py` `PROVIDERS`. `TEST_MODELS`, `PROVIDER_ENV_CONFIG`, `PROVIDER_MODALITIES` and `OPENAI_COMPAT_PROVIDERS` are derived from it, and `GET /api/providers` exposes it. Adding a provider = add it to the registry, plus **one** manual copy: the `SupportedProvider` Literal in `api/models.py` (typing can't be derived at runtime) — enforced by `tests/test_credential_provider_validation.py`. The frontend consumes `GET /api/providers` at runtime (`useProviders()`), so it needs no edit; the registry declaration order is the display order.
- NEVER return API key values from any endpoint — metadata only.
- Every user-supplied URL field must go through `validate_url()` (`siet_core/utils/url_validation.py`, async) for SSRF protection. Private IPs/localhost are intentionally allowed (self-hosted Ollama, LM Studio).
- Errors: raise typed exceptions from `siet_core.exceptions` — global handlers map them to HTTP status codes (`NotFoundError`→404, `InvalidInputError`→400, `AuthenticationError`→401, `RateLimitError`→429, `ConfigurationError`→422, `NetworkError`/`ExternalServiceError`→502, `SietError`→500). Don't raise bare `HTTPException` for domain errors.
- Requests over `LSP_SIET_MAX_UPLOAD_SIZE_MB` (default 100) are rejected by `MaxBodySizeMiddleware` before auth/routing.
- CORS is open by default (`CORS_ORIGINS`); `allow_credentials` flips to `True` only when origins are explicit. No rate limiting built in.

## AI / model provisioning (`siet_core/ai/`)

- All LLM calls in graph nodes go through `provision_langchain_model()` — never instantiate provider clients directly. It auto-upgrades to `large_context_model` above 105,000 tokens (hard-coded threshold).
- Missing/unconfigured model → raise `ConfigurationError` (not `ValueError`) so the API returns 422.
- Credential-linked models are preferred; `provision_provider_keys()` is the env-var fallback and **mutates `os.environ`** — be aware in tests.
- `DefaultModels.get_instance()` intentionally bypasses the singleton cache (fresh DB fetch each call).

## Graphs (`siet_core/graphs/`)

- Sync nodes that need async calls use the `asyncio.new_event_loop()` / ThreadPool workaround (see `chat.py`) — fragile, follow the existing pattern exactly.
- Every node wraps LLM calls with `classify_error()`:
  ```python
  except Exception as e:
      exc_class, message = classify_error(e)
      raise exc_class(message) from e
  ```
- Strip extended-thinking output with `clean_thinking_content()` before using model responses.
- Chat checkpoints (SqliteSaver) live at the path in `LANGGRAPH_CHECKPOINT_FILE`.

## Domain (`siet_core/domain/`)

- `Source.save()` does **NOT** auto-embed — call `source.vectorize()` explicitly (fire-and-forget, returns a command id). `Note.save()` DOES auto-submit `embed_note`.
- `ObjectModel.get()` is polymorphic via ID prefix — the subclass must be imported first or resolution fails.
- `RecordModel` subclasses are singletons — call `clear_instance()` in tests.
- Relationship strings passed to `relate()` must match the schema (`reference`, `artifact`, `refers_to`).

## Database (`siet_core/database/`)

- New migration = new file `siet_core/database/migrations/N.surrealql` (+ `N_down.surrealql`) **and** an edit to `AsyncMigrationManager` — migrations are hard-coded, not auto-discovered. They run automatically on API startup.
- No connection pooling — each `repo_*` call opens/closes a connection.
- Transaction-conflict `RuntimeError`s are retriable and logged at DEBUG (don't "fix" the missing stack trace).
- SIET's own tables are migrated by the `k` track in `siet_platform/migrations/` (see `docs/ARCHITECTURE.md` section 5), never by adding a number here.
- Read the SurrealDB docs before writing SurrealQL.

## Background commands (`commands/`)

- Retry config uses a blocklist: `stop_on: [ValueError]` — raise `ValueError` for permanent failures (no retry, job marked `failed`); any other exception auto-retries.
- Submission is fire-and-forget via `submit_command()`; commands must be idempotent-ish under retry.

## Prompts (`prompts/`)

- Template path syntax: `Prompter(prompt_template="ask/entry")` → `prompts/ask/entry.jinja` (forward slashes, no extension).
- Data is passed as `data=dict`; dict keys must match template variable names exactly.
- With a `PydanticOutputParser`, Prompter auto-injects `format_instructions` — the template must contain `{{ format_instructions }}` or the parser is silently ignored.
- No template inheritance/composition; templates are flat by design.
- Templates are cached — restart the app after editing.

## Environment knobs to know

| Variable | Meaning |
|---|---|
| `LSP_SIET_ENCRYPTION_KEY` (or `_FILE`) | Required for credential storage; any string, no default |
| `LSP_SIET_CHUNK_SIZE` / `_CHUNK_OVERLAP` | Token-based (default 400 / 15%); restart required |
| `LSP_SIET_MAX_UPLOAD_SIZE_MB` | Upload cap (default 100) |
| `LANGGRAPH_CHECKPOINT_FILE` | Chat history SQLite path |
| `SURREAL_NAMESPACE` / `SURREAL_DATABASE` | Both `open_notebook` in every deployed database: never rename (it would point the API at an empty database) |
| `CORS_ORIGINS` | Restrict before production |
