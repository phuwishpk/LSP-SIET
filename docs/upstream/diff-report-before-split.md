# open-notebook/ vs upstream 8889087

- Upstream base: `8889087e317177d7b6e286342ab34e0c9c01d43e` (v1.10.0-31-g8889087)
- Compared ref: `f890a34`
- Upstream files modified: **79**, deleted: **32**; KMITL files added: **192**

## Modified upstream files (added / removed lines)

| + | − | file |
|---:|---:|---|
| 1625 | 1370 | `uv.lock` |
| 1113 | 26 | `api/routers/chat.py` |
| 436 | 3 | `api/routers/search.py` |
| 337 | 0 | `frontend/src/app/globals.css` |
| 307 | 0 | `api/routers/config.py` |
| 199 | 17 | `api/main.py` |
| 197 | 91 | `frontend/src/lib/utils/source-references.tsx` |
| 191 | 125 | `frontend/src/components/auth/LoginForm.tsx` |
| 186 | 0 | `api/models.py` |
| 182 | 4 | `frontend/src/app/(dashboard)/page.tsx` |
| 181 | 5 | `prompts/chat/system.jinja` |
| 174 | 119 | `frontend/src/lib/stores/auth-store.ts` |
| 174 | 256 | `frontend/src/app/(dashboard)/search/page.tsx` |
| 153 | 3 | `open_notebook/domain/notebook.py` |
| 150 | 24 | `api/routers/notebooks.py` |
| 133 | 27 | `api/routers/sources.py` |
| 122 | 6 | `open_notebook/graphs/source_chat.py` |
| 111 | 61 | `frontend/src/components/layout/AppSidebar.tsx` |
| 101 | 13 | `api/auth.py` |
| 98 | 21 | `api/routers/source_chat.py` |
| 94 | 8 | `prompts/source_chat/system.jinja` |
| 91 | 0 | `open_notebook/config.py` |
| 91 | 1 | `open_notebook/utils/embedding.py` |
| 85 | 18 | `frontend/src/components/source/ChatPanel.tsx` |
| 82 | 0 | `open_notebook/database/migrations/9.surrealql` |
| 81 | 0 | `frontend/src/components/layout/AppSidebar.test.tsx` |
| 69 | 0 | `frontend/src/lib/api/chat.ts` |
| 64 | 16 | `api/routers/notes.py` |
| 60 | 2 | `api/routers/models.py` |
| 55 | 1 | `open_notebook/utils/context_builder.py` |
| 45 | 0 | `frontend/src/lib/types/api.ts` |
| 42 | 0 | `open_notebook/database/async_migrate.py` |
| 37 | 25 | `frontend/src/lib/hooks/use-auth.ts` |
| 36 | 1 | `frontend/src/lib/locales/en-US/index.ts` |
| 33 | 9 | `frontend/src/app/(dashboard)/layout.tsx` |
| 31 | 26 | `frontend/src/components/source/SessionManager.tsx` |
| 28 | 13 | `frontend/package-lock.json` |
| 25 | 1 | `open_notebook/graphs/chat.py` |
| 23 | 0 | `frontend/src/app/config/route.ts` |
| 20 | 3 | `frontend/src/app/layout.tsx` |
| 19 | 0 | `commands/source_commands.py` |
| 19 | 0 | `frontend/src/lib/hooks/useNotebookChat.ts` |
| 17 | 1 | `frontend/src/lib/types/search.ts` |
| 16 | 8 | `frontend/src/lib/hooks/use-create-dialogs.tsx` |
| 14 | 0 | `CLAUDE.md` |
| 12 | 2 | `frontend/src/lib/api/client.ts` |
| 11 | 1 | `open_notebook/database/repository.py` |
| 7 | 0 | `.env.example` |
| 7 | 1 | `frontend/src/lib/config.ts` |
| 6 | 40 | `frontend/src/lib/hooks/use-version-check.ts` |
| 5 | 0 | `frontend/src/lib/api/source-chat.ts` |
| 5 | 1 | `frontend/src/components/layout/AppShell.tsx` |
| 5 | 1 | `pyproject.toml` |
| 5 | 3 | `api/command_service.py` |
| 5 | 6 | `frontend/next.config.ts` |
| 3 | 2 | `frontend/src/proxy.ts` |
| 2 | 2 | `frontend/package.json` |
| 2 | 2 | `open_notebook/ai/connection_tester.py` |
| 2 | 4 | `frontend/src/lib/api/query-client.ts` |
| 2 | 6 | `frontend/src/components/common/CommandPalette.tsx` |
| 1 | 0 | `open_notebook/database/migrations/9_down.surrealql` |
| 1 | 0 | `open_notebook/utils/__init__.py` |
| 1 | 1 | `frontend/src/app/page.tsx` |
| 1 | 1 | `frontend/src/lib/locales/bn-IN/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/ca-ES/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/de-DE/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/es-ES/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/fr-FR/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/it-IT/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/ja-JP/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/pl-PL/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/pt-BR/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/ru-RU/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/tr-TR/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/zh-CN/index.ts` |
| 1 | 1 | `frontend/src/lib/locales/zh-TW/index.ts` |
| 0 | 1 | `api/CLAUDE.md` |
| 0 | 1 | `frontend/src/test/setup.ts` |
| 0 | 2 | `commands/__init__.py` |

## Deleted upstream files

- `.dockerignore`
- `Dockerfile`
- `Dockerfile.single`
- `api/episode_profiles_service.py`
- `api/podcast_api_service.py`
- `api/podcast_service.py`
- `api/routers/auth.py`
- `api/routers/episode_profiles.py`
- `api/routers/podcasts.py`
- `api/routers/speaker_profiles.py`
- `commands/podcast_commands.py`
- `docker-compose.yml`
- `frontend/src/app/(dashboard)/podcasts/page.tsx`
- `frontend/src/components/podcasts/EpisodeCard.tsx`
- `frontend/src/components/podcasts/EpisodeProfilesPanel.tsx`
- `frontend/src/components/podcasts/EpisodesTab.tsx`
- `frontend/src/components/podcasts/GeneratePodcastDialog.tsx`
- `frontend/src/components/podcasts/SpeakerProfilesPanel.tsx`
- `frontend/src/components/podcasts/TemplatesTab.tsx`
- `frontend/src/components/podcasts/forms/EpisodeProfileFormDialog.tsx`
- `frontend/src/components/podcasts/forms/SpeakerProfileFormDialog.tsx`
- `frontend/src/components/search/StreamingResponse.tsx`
- `frontend/src/lib/api/podcasts.ts`
- `frontend/src/lib/hooks/use-ask.ts`
- `frontend/src/lib/hooks/use-podcasts.ts`
- `frontend/src/lib/types/podcasts.ts`
- `open_notebook/podcasts/CLAUDE.md`
- `open_notebook/podcasts/__init__.py`
- `open_notebook/podcasts/migration.py`
- `open_notebook/podcasts/models.py`
- `scripts/wait-for-api.sh`
- `supervisord.conf`

## Added files by directory

| files | lines | directory |
|---:|---:|---|
| 110 | 22777 | `frontend/src/` |
| 15 | 8616 | `open_notebook/community/` |
| 5 | 5269 | `api/routers/` |
| 24 | 4223 | `tests/` |
| 11 | 2835 | `open_notebook/cache/` |
| 2 | 1107 | `open_notebook/domain/` |
| 2 | 1031 | `open_notebook/features/` |
| 4 | 641 | `api/` |
| 1 | 377 | `frontend/` |
| 14 | 270 | `open_notebook/database/` |
| 2 | 83 | `./` |
| 2 | 0 | `frontend/public/` |
