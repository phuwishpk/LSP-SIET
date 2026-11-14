# Baseline before the LSP-SIET restructure

Measured on branch `refactor/lsp-siet` at `b4418fb` (no code changes yet), 2026-11-15.
Every later task of the restructure must reproduce the failure lists below exactly
(minus tests deleted together with their feature) and show only the route changes it
names in `routes.py diff`.

Environment: macOS arm64, Python 3.12.13 (`uv sync --frozen --python 3.12` in
`open-notebook/`, virtualenv outside the repo through `UV_PROJECT_ENVIRONMENT`),
pytest 9.0.3, Node v26.3.0 (`npm ci` in `open-notebook/frontend`), vitest 4.1.9,
tsc 5.8.3. No `.env`, no SurrealDB, no MariaDB.

| File | Content |
| --- | --- |
| `api-routes.txt` | `METHOD /path` of every FastAPI route of `api.main:app`, sorted (C order): 242 lines |
| `api-routes-ordered.txt` | the same 242 lines in registration order (used by the route-order check) |
| `frontend-routes.txt` | URL path of every `page.tsx` / `route.ts` under the host app dir, sorted (C order): 37 lines |
| `backend-failures.txt` | the 78 failing backend tests, `FAILED <node id>` lines in C order |
| `frontend-failures.txt` | the 4 failing frontend tests, `FAIL <file> > <suite> > <test>` lines in C order |

## Reproduce

```bash
WT=<worktree>; export UV_PROJECT_ENVIRONMENT=$WT/../venv-lsp
cd $WT/open-notebook && uv sync --frozen --python 3.12      # Python project (platform/ after Task 8)
cd $WT/open-notebook/frontend && npm ci && cd $WT && make frontend-links

$UV_PROJECT_ENVIRONMENT/bin/python scripts/lsp-siet/routes.py api              > docs/lsp-siet/baseline/api-routes.txt
$UV_PROJECT_ENVIRONMENT/bin/python scripts/lsp-siet/routes.py api --ordered    > docs/lsp-siet/baseline/api-routes-ordered.txt
$UV_PROJECT_ENVIRONMENT/bin/python scripts/lsp-siet/routes.py frontend         > docs/lsp-siet/baseline/frontend-routes.txt
$UV_PROJECT_ENVIRONMENT/bin/python scripts/lsp-siet/routes.py diff api         # empty output = unchanged
$UV_PROJECT_ENVIRONMENT/bin/python scripts/lsp-siet/routes.py diff frontend

make test-backend ARGS="-p no:cacheprovider -rfE --continue-on-collection-errors" > backend.log 2>&1
grep -E '^(FAILED|ERROR) ' backend.log | sed -E 's/ - .*$//' | LC_ALL=C sort \
  | diff - docs/lsp-siet/baseline/backend-failures.txt                     # empty output = same failures
make test-frontend > frontend.log 2>&1
grep -E '^ *FAIL ' frontend.log | sed -E 's/^ *//; s/ +[0-9]+ms$//' | LC_ALL=C sort -u \
  | diff - docs/lsp-siet/baseline/frontend-failures.txt                    # empty output = same failures
```

All baseline files are in C (byte) order, not in the order of the shell's locale: under
`en_US.UTF-8` a plain `sort` reorders lines that differ only in punctuation (`]`, `)`,
`{`, space), which shows up as a spurious diff. Always sort with `LC_ALL=C sort` (the
recipe above does). `routes.py` sorts in Python, whose string order is the same for
ASCII, so its output needs no `LC_ALL`.

## Results

Backend (`make test-backend`, 15 s):

```
78 failed, 1336 passed, 6 warnings in 15.13s
```

No collection errors, no `ERROR` lines. Three runs gave the identical failure list. The
failures are in `open-notebook/tests/` only (notebooks, notes, sources, chat,
recently-viewed, typed-exception handlers, upload and path containment); none in
`siet-platform`, `kmitl-rag` or `community`. Most assertions see `401 Unauthorized`
from the role/owner gate that the extensions install in front of the upstream test
client; 10 of the failing test ids mention podcasts (their routes are dropped, so some
see `404`).

Frontend (`make test-frontend`, 31 s):

```
tsc --noEmit: 0 errors
 Test Files  2 failed | 46 passed (48)
      Tests  4 failed | 241 passed (245)
```

Three runs gave the identical failure list. The three `markdown-editor.test.tsx` tests
fail with `Cannot read properties of undefined (reading 'setItem')`: Node 26 exposes an
experimental `localStorage` that is unusable without `--localstorage-file`, which breaks
the zustand persist store under jsdom. The `locales/index.test.ts` failure lists 16
i18n keys (`common.connectionError`, `auth.loginTitle`, ... `chat.sessionTitlePlaceholder`)
that no source file references any more. None of the four is touched by the restructure.

## Notes on the route lists

- `api-routes*.txt` is the default build: `routes.py` removes `SIET_ENABLE_PODCASTS`
  from the environment, so the podcast, episode-profile and speaker-profile routers are
  dropped by `siet_platform.extension.finalize`. With the flag set the app serves
  261 routes (19 more, all podcast related).
- The list comes from importing `api.main`, which loads the three installed extensions
  (`siet_platform`, `kmitl_rag`, `siet_community`). 246 routes are registered; 4 are
  Starlette `Route`s (`/openapi.json`, `/docs`, `/docs/oauth2-redirect`, `/redoc`) and
  are not listed.
- `frontend-routes.txt` has one line per file: `/` appears twice because both
  `src/app/page.tsx` (redirect to `/login`) and `src/app/(dashboard)/page.tsx`
  (redirect to `/notebooks`) resolve to it.
