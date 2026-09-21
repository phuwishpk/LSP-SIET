#!/usr/bin/env bash
# =============================================================================
# Export EVERYTHING needed to run this workspace on another machine:
#   .env, SurrealDB files, uploaded files, Redis AOF, PocketBase data,
#   and a consistent MariaDB dump  ->  deploy/kmitlai-data-<timestamp>.tar.gz
#
# Usage (from anywhere):  deploy/export-data.sh
# The stack is stopped for ~30 s while files are copied, then started again.
# Env overrides: PROJECT_NAME (default kmitlai), COMPOSE_EXTRA (extra -f flags)
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f .env ] || { echo "ERROR: $ROOT/.env not found"; exit 1; }

PROJECT_NAME="${PROJECT_NAME:-kmitlai}"
# shellcheck disable=SC2206
COMPOSE=(docker compose -p "$PROJECT_NAME" -f docker-compose.yml --env-file .env ${COMPOSE_EXTRA:-})

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="deploy/kmitlai-data-${STAMP}.tar.gz"
SQL="deploy/workspace.sql"

echo "[1/4] MariaDB dump (consistent snapshot, no downtime) ..."
"${COMPOSE[@]}" up -d mariadb >/dev/null
CID="$("${COMPOSE[@]}" ps -q mariadb)"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$CID")" = "healthy" ] && break
  sleep 2
done
"${COMPOSE[@]}" exec -T mariadb sh -c \
  'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines --events --databases workspace' > "$SQL"
echo "      $(du -h "$SQL" | cut -f1) written"

echo "[2/4] Stopping the stack so SurrealDB / Redis / PocketBase files are consistent ..."
"${COMPOSE[@]}" stop
trap '"${COMPOSE[@]}" start >/dev/null; echo "[4/4] Stack started again."' EXIT

echo "[3/4] Archiving ..."
ITEMS=(.env "$SQL")
for d in open-notebook/surreal_data open-notebook/notebook_data open-notebook/redis_data ai-roadmap-generator/pb_data; do
  [ -d "$d" ] && ITEMS+=("$d")
done
COPYFILE_DISABLE=1 tar -czf "$OUT" "${ITEMS[@]}"
rm -f "$SQL"
echo "      -> $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Copy $OUT to the new machine, clone the repo there, then run:"
echo "  deploy/import-data.sh /path/to/$(basename "$OUT")"
