# LSP-SIET in one container (design)

Date: 2026-11-14 · Status: agreed in conversation (3 sections), implemented on `feat/single-container`

## Goal and constraints

Production (`lsp-siet.site`, a 3.3 GB server behind Cloudflare Tunnel) runs 7
containers today: Traefik, MariaDB, SurrealDB, Redis, open-notebook (uvicorn +
worker + SIET Space Next), AI Quiz (Next 16) and AI Roadmap (Next 13). Building
on the server is slow enough that the type-check had to be switched off.

Agreed with the owner:

| Decision | Choice |
|---|---|
| Containers | **one**, databases included |
| Domains | one domain, routed by path (`/`, `/api`, `/quiz`, `/roadmap`) - no subdomains (already the case) |
| Application code | **unchanged** (AI Quiz and AI Roadmap keep their own Node servers) |
| RAM budget | idle <= ~900 MB, busy <= ~1.5 GB |
| Router | nginx inside the container |
| Where images are built | GitHub Actions -> GHCR (private); the server only pulls |

Assumptions: Cloudflare Tunnel keeps running outside the container and points
at port 80; about 100 users at a time; a deploy may take the site down for
about a minute; the server is linux/amd64. **Open:** the copy of the stack on
the owner's Mac runs on arm64 (OrbStack). If production is that machine, CI
must build `linux/arm64` (the workflow takes `platforms` as an input).

## 1. Inside the container

Image `ghcr.io/phuwishpk/lsp-siet` on `python:3.12-slim-trixie`, with
**s6-overlay** (~2 MB) as PID 1: it reaps processes, forwards stop signals, and
starts services in dependency order *after readiness*. supervisord (the current
choice) costs ~20 MB more and only orders by priority.

| Process | Settings that save memory | Idle | Busy |
|---|---|---|---|
| nginx | 1 worker, no access log, no cache | 5 MB | 10 MB |
| MariaDB 11.8 | `innodb_buffer_pool_size=64M`, `performance_schema=OFF`, `max_connections=40`, small aria/key/tmp buffers, 127.0.0.1 | 90 | 150 |
| SurrealDB 2.6.5 | RocksDB block cache 64 MB, write buffer 16 MB x 2, 2 threads/jobs, 256 open files, 127.0.0.1 | 90 | 250 |
| Redis | `maxmemory 64mb` (was 256mb), no RDB/AOF: only TTL caches and login-lockout counters live there (rate limits are in MariaDB) | 5 | 40 |
| uvicorn (API) | 1 worker, run directly (no `uv run` parent), `MALLOC_ARENA_MAX=2` | 170 | 450 |
| surreal-commands-worker | run directly, `MALLOC_ARENA_MAX=2` | 110 | 250 |
| SIET Space Next 16 | `--max-old-space-size=256` | 120 | 280 |
| AI Quiz Next 16 | `--max-old-space-size=128` | 70 | 140 |
| AI Roadmap Next 13 | `node .../next start` (no npm/npx parent), `--max-old-space-size=128` | 70 | 140 |
| **Total** | | **~730 MB** | **~1.3-1.5 GB** (not all busy at once) |

Every process listens on 127.0.0.1; only nginx publishes port 80. The
container runs with `mem_limit: 1600m`; `oom_score_adj` makes the kernel kill
a Next app (+300) before the worker (+100), the API (0) or a database (0), and
s6 restarts what was killed. The figures above are estimates until measured
(section 3).

## 2. Build, routing, data

**Image** - `docker/allinone/Dockerfile`, multi-stage:

- `py`: uv builds `/app/.venv` (open-notebook + siet-platform + kmitl-rag +
  community), bytecode compiled in CI.
- `web`: `node:22-slim` builds SIET Space (standalone) with
  `INTERNAL_API_URL=http://127.0.0.1:5055` **at build time** - Next bakes the
  `/api` rewrite target into the build.
- `quiz`, `roadmap`: the same steps as their own Dockerfiles, on `node:22-slim`
  (glibc, like the final image); roadmap's devDependencies are pruned.
- final: `apt` mariadb-server, redis-server, nginx-light, ffmpeg (kept from the
  current image); `node` copied from `node:22-slim`, `surreal` from
  `surrealdb/surrealdb:v2.6.5`, s6-overlay 3.2.0.2.

**CI** - `.github/workflows/image.yml` on push to main: type-check SIET Space and
AI Quiz (`tsc --noEmit`, replacing the build-time check that was switched off),
pytest of the SIET packages, then build linux/amd64 with the GHA cache and push
`:sha-<7>` and `:main`.

**nginx** (`docker/allinone/rootfs/etc/nginx/nginx.conf`) - `server_name
lsp-siet.site localhost 127.0.0.1`; any other Host gets 444 (as Traefik's
`Host()` did).

| Path | To | Notes |
|---|---|---|
| `/api/` | 127.0.0.1:5055 | `proxy_buffering off` (streamed answers), 300 s timeouts, `client_max_body_size 210m` |
| `/quiz` | 127.0.0.1:3001 | no prefix stripping (`basePath`) |
| `/roadmap` | 127.0.0.1:3002 | no prefix stripping |
| `/` | 127.0.0.1:8502 | SIET Space |

`/docs` and `/openapi.json` stay unpublished. `CF-Connecting-IP` becomes
`X-Forwarded-For`; gzip for text.

**Data** - one volume `lsp_data:/data`: `/data/mariadb`, `/data/surreal`,
`/data/app` (the app's `./data`: uploads, library files; `/app/data` is a
symlink to it), `/data/backups`. Redis keeps nothing. `prompts/` is baked into
the image. On first boot an empty `/data/mariadb` is initialised from
`MARIADB_*` and `docker/mariadb-init.sql`, as the official image did.

**Compose** - `docker-compose.prod.yml`: one service, image from GHCR,
`.env` variables with the same names as today, port 80, `mem_limit 1600m`,
`stop_grace_period 30s`, json-file logs 10 MB x 3. The 7-container
`docker-compose.yml` stays until the move is done.

**Migration** - `deploy/migrate-to-allinone.sh <tag>`, once:

1. dump MariaDB (`mariadb-dump --single-transaction`) and SurrealDB
   (`surreal export`) from the running old stack into `backups/`;
2. stop the old stack (volumes stay);
3. **copy** SurrealDB files and uploads into the new volume, and the MariaDB
   dump into `/data/import`. MariaDB goes through the dump because Debian
   trixie ships 11.8.6 and the old container runs 11.8.9; SurrealDB files are
   copied because the binary is the same 2.6.5;
4. start the new container: first boot creates MariaDB and loads the dump
   *before* the API starts;
5. wait for health, run `deploy/smoke-test.py`.

Rollback: stop the new one, `docker compose up -d` the old one - nothing of
the old stack was moved.

## 3. Running it

**Start order** (s6-rc dependencies, each waits for the previous to be
*ready*): `init-dirs` -> `init-mariadb` (first boot only) -> MariaDB
(`mariadb-admin ping`), SurrealDB (`/health`), Redis (`PING`) -> API (runs the
core and KMITL migrations; ready on `/health`) -> worker, SIET Space, AI Quiz,
AI Roadmap -> nginx last, so Cloudflare does not see 502s while it boots.

**Stop** - `docker stop` stops services in reverse order; MariaDB gets 15 s to
flush (`S6_SERVICES_GRACETIME`), the container 30 s.

**Failures** - s6 restarts any process that exits. A database that exits
abnormally 5 times within 60 s halts the container (`lsp-crash-guard`) so
Docker restarts it whole. A start-up step that fails stops the container
(`S6_BEHAVIOUR_IF_STAGE2_FAILS=2`); start-up may take up to 10 min.

**Health** - `HEALTHCHECK curl /api/config` through nginx every 30 s,
start period 120 s.

**Logs** - every service writes to stdout: `docker logs lsp-siet` as before;
no separate log process.

**Deploy** - `deploy/deploy.sh <tag>`: pull while the old one runs, `up -d`
(downtime about 20 s measured, the databases restart too), wait up to 180 s for
health, otherwise go back to the previous tag automatically; keep the two
newest images. One-time `docker login ghcr.io` with a read-only token.

**Backup** - host cron, nightly: `docker exec lsp-siet lsp-backup`
(`mariadb-dump`, `surreal export`, tar of `/data/app`) into `/data/backups`,
7 kept. Copying backups off the server is out of scope.

**Acceptance**

1. CI green: type-checks, SIET pytest, image build.
2. The image runs on a *copy* of production data with its own `JWT_SECRET`
   (tokens must never work against production - see the 2026-11-13 incident):
   `deploy/smoke-test.py` (65 checks) and the 45 feature checks pass.
3. `lsp-memcheck` (RSS per service + cgroup `memory.current`/`memory.peak`):
   idle 10 min after start <= 900 MB; during 50 users on the feed + 10 RAG
   questions + 2 uploads + 1 roadmap <= 1.5 GB; no OOM kill; feed p95 at most
   20 % slower than today.
4. A full migration rehearsal on a copy, then the real move with the rollback
   steps at hand.

**Out of scope** - application code, Cloudflare Tunnel settings, the local
development compose (`docker-compose-dev.yml`).

## 4. Results (2026-11-14, local arm64 build, test secrets, no AI keys)

| Check | Result |
|---|---|
| Image | 3.36 GB (arm64) |
| First boot, empty volume -> healthy | 22-26 s |
| Restart on existing data (deploy) | stop 7 s (MariaDB "Shutdown complete"), healthy 11 s later |
| `smoke-test.py --no-ai` | 62/65. The 3 failures are not the container: 2 need an embedding model (no key in the test), and "search finds users by student number" runs as a student, who may no longer search by student code (privacy rule in `search_users`; a teacher finds them) - the check is out of date |
| Pages through nginx | `/login`, `/community`, `/quiz`, `/roadmap` 200, their `_next/static` 200, `/docs` 404, unknown Host closed (444) |
| Idle ~9 min after start | cgroup 669 MB (RSS: api 245, worker 106, surrealdb 97, mariadb 65, roadmap 64, web 56, quiz 40, redis 6, nginx 4) |
| 50 users x 60 s (feed, notifications, me, courses, 3 pages) | 4,937 requests, 0 errors, p95 13 ms, container max 800 MB; peak over the whole run (first boot + seeding) 1,008 MB; no OOM, no restarts |
| Migration rehearsal | copy of the old stack on the production images (MariaDB 11.8.9, SurrealDB 2.6.5) -> new container in 26 s; MariaDB rows (users 14, rooms 71, posts 8, notifications 33) and SurrealDB records (source 2, notebook 3, reference 2) identical; smoke test as on a fresh volume |
| `lsp-backup` | dump + export + tar written, files mode 600 |

The sum of RSS over-counts shared libraries (three Node processes share one
binary); the cgroup figure is the container's real use.

Not measured here: RAG questions, uploads with embedding and roadmap
generation (they need model keys - mostly waiting on the provider), and feed
latency on production-sized data.

Found and fixed while testing:

- The MariaDB client prefers `MARIADB_HOST` (set for the app) over
  `--protocol=socket` and connects as `root@127.0.0.1`, which does not exist.
  Every root-level call unsets it: `init-mariadb`, `lsp-backup`, and by hand
  `docker exec lsp-siet env -u MARIADB_HOST mariadb -uroot -p`.
- SurrealDB 2.6 cannot import its own export: it re-defines fields the import
  has already created (`in`/`out` of RELATION tables, `embedding[*]`).
  `lsp-backup` rewrites `DEFINE FIELD` to `DEFINE FIELD OVERWRITE`; a restore
  of such a file was checked record for record. The migration copies the
  RocksDB files instead, so it does not depend on this.
- First-boot MariaDB is built in `/data/mariadb.new` and moved into place at
  the end, so a failed dump load is retried on the next boot instead of
  leaving a half-made database that later boots skip.
- Files copied in by the migration keep their old owner; `init-dirs` hands
  anything not owned by `mysql`/`lsp` over to them.
- `migrate-to-allinone.sh` refuses to run when the target volume already
  exists (it would hold a MariaDB, so the dump would not load), and every name
  in it can be overridden for a rehearsal.
- Next 16 renames its process to `next-server`, and root in the container
  cannot read another user's `/proc/<pid>/cwd`: `lsp-memcheck` groups
  processes by their `s6-supervise <service>` ancestor instead.
- The SurrealDB root password moved from argv (visible in `ps`) to
  `SURREAL_PASS`.
- A leftover `kmitl_ai_roadmap_pocketbase` container still runs next to the
  old stack; PocketBase left the code on 2026-11-11 (e1694bb), so the image
  does not include it.
