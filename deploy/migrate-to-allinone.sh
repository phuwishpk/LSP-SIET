#!/usr/bin/env bash
# One-time move from the 7-container docker-compose.yml to the all-in-one
# container (docker-compose.prod.yml). The old volumes and folders are only
# read and COPIED: going back is `docker compose down` of the new one and
# `docker compose up -d` of the old one.
#
#   ./deploy/migrate-to-allinone.sh sha-1a2b3c4
#
# MariaDB goes through a dump (the new image's 11.8.x may be older than the
# old container's), SurrealDB is copied as files (same 2.6.5 binary), and the
# uploads folder is copied as is.
#
# The names below are the production ones; a rehearsal on a copy overrides
# them (OLD_* for the copy of the old stack, LSP_PROJECT / LSP_SIET_CONTAINER /
# LSP_SIET_HTTP_BIND for a new container that does not clash with production).
set -euo pipefail
cd "$(dirname "$0")/.."
TAG=${1:?usage: migrate-to-allinone.sh <image tag>}
set -a; . ./.env; set +a

OLD_COMPOSE_FILE=${OLD_COMPOSE_FILE:-docker-compose.yml}
OLD_MARIADB=${OLD_MARIADB:-kmitl_mariadb}
OLD_SURREAL=${OLD_SURREAL:-kmitlai-surrealdb-1}
OLD_SURREAL_DIR=${OLD_SURREAL_DIR:-open-notebook/surreal_data}
OLD_APP_DIR=${OLD_APP_DIR:-open-notebook/notebook_data}
LSP_PROJECT=${LSP_PROJECT:-lsp-siet}
export LSP_SIET_CONTAINER=${LSP_SIET_CONTAINER:-lsp-siet}
VOLUME=${LSP_PROJECT}_lsp_data
NS=${SURREAL_NAMESPACE:-open_notebook}
DB=${SURREAL_DATABASE:-open_notebook}

# A volume left over from an earlier try already holds a MariaDB, so the new
# container would skip loading the dump and come up with old data.
if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "volume $VOLUME already exists - remove it first (docker volume rm $VOLUME) or pick another LSP_PROJECT" >&2
  exit 1
fi
for c in "$OLD_MARIADB" "$OLD_SURREAL"; do
  [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = true ] || { echo "$c is not running" >&2; exit 1; }
done
[ -d "$OLD_SURREAL_DIR" ] && [ -d "$OLD_APP_DIR" ] || { echo "missing $OLD_SURREAL_DIR or $OLD_APP_DIR" >&2; exit 1; }

ts=$(date +%Y%m%d-%H%M%S)
bk=backups/pre-allinone-$ts
mkdir -p "$bk"

echo "1/5 dump MariaDB and SurrealDB from the running old stack -> $bk"
docker exec -e MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-root_password}" "$OLD_MARIADB" \
  mariadb-dump -uroot --single-transaction --routines --triggers --databases "${MARIADB_DATABASE:-workspace}" > "$bk/mariadb.sql"
docker exec "$OLD_SURREAL" /surreal export --conn http://localhost:8000 \
  --user "${SURREAL_USER:-root}" --pass "${SURREAL_PASSWORD:-root}" --ns "$NS" --db "$DB" /tmp/export.surql
docker cp "$OLD_SURREAL:/tmp/export.surql" "$bk/surreal.surql"
[ -s "$bk/mariadb.sql" ] && [ -s "$bk/surreal.surql" ] || { echo "a dump is empty - stopping before anything is changed" >&2; exit 1; }

echo "2/5 stop the old stack (its volumes and folders stay)"
docker compose -f "$OLD_COMPOSE_FILE" down

echo "3/5 copy SurrealDB files, uploads and the MariaDB dump into the new volume $VOLUME"
docker volume create "$VOLUME" >/dev/null
docker run --rm -v "$PWD/$OLD_SURREAL_DIR:/src/surreal:ro" -v "$PWD/$OLD_APP_DIR:/src/app:ro" \
  -v "$PWD/$bk:/src/dump:ro" -v "$VOLUME:/data" alpine sh -c \
  'mkdir -p /data/surreal /data/app /data/import && cp -a /src/surreal/. /data/surreal/ && cp -a /src/app/. /data/app/ && cp /src/dump/mariadb.sql /data/import/mariadb.sql'
cp -a "$OLD_SURREAL_DIR" "$bk/surreal_data-files"

echo "4/5 start the new container: first boot creates MariaDB and loads the dump before the API starts"
LSP_SIET_TAG=$TAG docker compose -p "$LSP_PROJECT" -f docker-compose.prod.yml up -d

echo "5/5 wait for health (first boot loads the dump: up to 10 min)"
status=starting
for _ in $(seq 1 120); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$LSP_SIET_CONTAINER" 2>/dev/null || echo missing)
  [ "$status" = healthy ] && break
  [ "$(docker inspect -f '{{.State.Running}}' "$LSP_SIET_CONTAINER" 2>/dev/null)" = true ] || { status=stopped; break; }
  sleep 5
done
echo "health: $status"
if [ "$status" != healthy ]; then
  echo "Not healthy. Logs: docker logs $LSP_SIET_CONTAINER" >&2
  echo "Rollback: docker compose -p $LSP_PROJECT -f docker-compose.prod.yml down && docker compose -f $OLD_COMPOSE_FILE up -d" >&2
  exit 1
fi
[ "$LSP_PROJECT" = lsp-siet ] && echo "$TAG" > deploy/.current-tag
echo "Backups of the old stack: $bk"
echo "Now: API_BASE=http://localhost:${LSP_SIET_HTTP_BIND:-80} python3 deploy/smoke-test.py --no-ai   and   docker exec $LSP_SIET_CONTAINER lsp-memcheck"
echo "Rollback: docker compose -p $LSP_PROJECT -f docker-compose.prod.yml down && docker compose -f $OLD_COMPOSE_FILE up -d"
