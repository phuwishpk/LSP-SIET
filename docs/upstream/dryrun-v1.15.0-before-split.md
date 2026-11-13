# Dry-run sync: 8889087 -> v1.15.0 on f890a34

Conflicted files: **72**

| type | count |
|---|---:|
| AA | 14 |
| DU | 24 |
| UU | 34 |

AA = both added, DU = deleted here / changed upstream, UU = both changed.

- AA `open_notebook/database/migrations/19.surrealql`
- AA `open_notebook/database/migrations/19_down.surrealql`
- AA `open_notebook/database/migrations/20.surrealql`
- AA `open_notebook/database/migrations/20_down.surrealql`
- AA `open_notebook/database/migrations/21.surrealql`
- AA `open_notebook/database/migrations/21_down.surrealql`
- AA `open_notebook/database/migrations/22.surrealql`
- AA `open_notebook/database/migrations/22_down.surrealql`
- AA `open_notebook/database/migrations/23.surrealql`
- AA `open_notebook/database/migrations/23_down.surrealql`
- AA `open_notebook/database/migrations/24.surrealql`
- AA `open_notebook/database/migrations/24_down.surrealql`
- AA `open_notebook/database/migrations/25.surrealql`
- AA `open_notebook/database/migrations/25_down.surrealql`
- DU `.dockerignore`
- DU `Dockerfile`
- DU `api/podcast_service.py`
- DU `api/routers/auth.py`
- DU `api/routers/episode_profiles.py`
- DU `api/routers/podcasts.py`
- DU `api/routers/speaker_profiles.py`
- DU `commands/podcast_commands.py`
- DU `docker-compose.yml`
- DU `frontend/src/app/(dashboard)/podcasts/page.tsx`
- DU `frontend/src/components/podcasts/EpisodeCard.tsx`
- DU `frontend/src/components/podcasts/EpisodeProfilesPanel.tsx`
- DU `frontend/src/components/podcasts/EpisodesTab.tsx`
- DU `frontend/src/components/podcasts/GeneratePodcastDialog.tsx`
- DU `frontend/src/components/podcasts/SpeakerProfilesPanel.tsx`
- DU `frontend/src/components/podcasts/TemplatesTab.tsx`
- DU `frontend/src/components/podcasts/forms/EpisodeProfileFormDialog.tsx`
- DU `frontend/src/components/podcasts/forms/SpeakerProfileFormDialog.tsx`
- DU `frontend/src/components/search/StreamingResponse.tsx`
- DU `frontend/src/lib/hooks/use-ask.ts`
- DU `frontend/src/lib/hooks/use-podcasts.ts`
- DU `frontend/src/lib/types/podcasts.ts`
- DU `open_notebook/podcasts/models.py`
- DU `supervisord.conf`
- UU `CLAUDE.md`
- UU `api/CLAUDE.md`
- UU `api/auth.py`
- UU `api/main.py`
- UU `api/models.py`
- UU `api/routers/chat.py`
- UU `api/routers/models.py`
- UU `api/routers/search.py`
- UU `api/routers/source_chat.py`
- UU `api/routers/sources.py`
- UU `commands/__init__.py`
- UU `commands/source_commands.py`
- UU `frontend/package-lock.json`
- UU `frontend/src/app/(dashboard)/search/page.tsx`
- UU `frontend/src/app/config/route.ts`
- UU `frontend/src/app/globals.css`
- UU `frontend/src/app/layout.tsx`
- UU `frontend/src/components/auth/LoginForm.tsx`
- UU `frontend/src/components/common/CommandPalette.tsx`
- UU `frontend/src/components/layout/AppSidebar.test.tsx`
- UU `frontend/src/components/layout/AppSidebar.tsx`
- UU `frontend/src/components/sources/ChatPanel.tsx`
- UU `frontend/src/lib/api/client.ts`
- UU `frontend/src/lib/hooks/use-version-check.ts`
- UU `frontend/src/lib/stores/auth-store.ts`
- UU `open_notebook/ai/connection_tester.py`
- UU `open_notebook/config.py`
- UU `open_notebook/database/async_migrate.py`
- UU `open_notebook/domain/notebook.py`
- UU `open_notebook/graphs/source_chat.py`
- UU `open_notebook/utils/context_builder.py`
- UU `prompts/source_chat/system.jinja`
- UU `pyproject.toml`
- UU `uv.lock`
