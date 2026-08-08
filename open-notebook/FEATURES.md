# AI Features (Quiz + Roadmap)

Bundled add-on modules that fold the standalone **My-ai-quiz** and
**ai-roadmap-generator** projects into Open Notebook.

## What was added

- **SurrealDB migration** `19.surrealql` (and `19_down.surrealql`)
  adds two tables: `quiz_session` and `roadmap_session`. Every row is
  keyed by `owner_id` so multi-user deployments keep data isolated.
- **Domain models** in `open_notebook/domain/features.py`:
  - `QuizSession`
  - `RoadmapSession`
- **Service layer** in `open_notebook/features/service.py`:
  - `generate_quiz`
  - `generate_roadmap`
  - `generate_quiz` and `generate_roadmap` both:
    - Use the existing `model_manager` (Esperanto) so any provider the
      user has configured in **Settings → Models** works out of the box
    - Cache the result in Redis, keyed by `(owner_id, prompt_hash)` so
      user A can never read user B's cache entry
    - Enforce structural invariants on the LLM output (exactly 4
      options per question, the correct answer must be one of the
      options, descriptive explanations, no orphan edges) to keep
      hallucinations from sneaking through
- **API router** at `api/routers/features.py` (mounted under
  `/api/features`):
  - `POST /api/features/quiz/generate`
  - `GET /api/features/quiz/sessions`
  - `GET /api/features/quiz/sessions/{id}`
  - `DELETE /api/features/quiz/sessions/{id}`
  - `POST /api/features/roadmap/generate`
  - `GET /api/features/roadmap/sessions`
  - `GET /api/features/roadmap/sessions/{id}`
  - `DELETE /api/features/roadmap/sessions/{id}`
- **Frontend** (`/features` route):
  - `frontend/src/app/(dashboard)/features/page.tsx` – tabbed UI for
    Quiz and Roadmap
  - `frontend/src/app/(dashboard)/features/components/QuizRunner.tsx` –
    interactive quiz taking flow with auto-grading
  - `frontend/src/app/(dashboard)/features/components/RoadmapGraph.tsx`
    – lightweight DAG visualizer (no extra dependencies)
  - `frontend/src/lib/api/features.ts` + `use-features.ts` – API client
    and React Query hooks
  - Sidebar entry added in `components/layout/AppSidebar.tsx`
  - English translations added in `lib/locales/en-US/index.ts`

## How multi-user isolation works

Open Notebook ships with a single password middleware. To keep the
existing auth model intact, each feature request reads an additional
`X-Owner-Id` header. The header is opaque to the server: it's the
client's responsibility to attribute the request to the right user.
If the header is absent the request is attributed to a `default`
owner so single-user deployments keep working without configuration.

Every database read/write includes `WHERE owner_id = $owner` and the
cache key is namespaced with the same id, so:

- User A can never see user B's sessions
- Cache entries from one user cannot be served to another
- `delete()` operations fail fast when the owner doesn't match

## How to use

1. Start the API. The migration runs automatically on first startup.
2. Pick a default chat model in **Settings → Models**.
3. Open `/features` in the UI and generate a quiz or roadmap.
4. Each session is saved to SurrealDB and can be re-opened from the
   sidebar history.

## Hallucination guardrails

- Quiz: every question must have exactly 4 options, the correct answer
  must match one of them, and an explanation is required.
- Roadmap: nodes must have unique IDs, edges must reference existing
  nodes, and the visualiser falls back to a sequential order if the
  LLM produces an inconsistent DAG.
- Both services extract JSON defensively and raise a clear
  `ExternalServiceError` if the LLM drifts too far from the schema.
