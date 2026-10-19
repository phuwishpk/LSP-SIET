#!/usr/bin/env bash
# =============================================================================
# Restore a bundle produced by deploy/export-data.sh on a FRESH clone, then
# build the images and start the whole stack with all data in place.
#
# Usage:  git clone https://github.com/phuwishpk/LSP-SIET.git kmitlAI
#         cd kmitlAI && deploy/import-data.sh /path/to/kmitlai-data-*.tar.gz
# Env overrides: PROJECT_NAME (default kmitlai), COMPOSE_EXTRA (extra -f flags)
# =============================================================================
set -euo pipefail
BUNDLE="${1:?usage: deploy/import-data.sh <kmitlai-data-*.tar.gz>}"
BUNDLE="$(cd "$(dirname "$BUNDLE")" && pwd)/$(basename "$BUNDLE")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -d open-notebook/surreal_data ] && [ -n "$(ls -A open-notebook/surreal_data 2>/dev/null)" ]; then
  echo "ERROR: open-notebook/surreal_data already has data. Refusing to overwrite an existing installation."
  exit 1
fi

PROJECT_NAME="${PROJECT_NAME:-kmitlai}"

echo "[1/5] Extracting bundle into $ROOT ..."
tar -xzf "$BUNDLE" -C "$ROOT"
[ -f .env ] && [ -f deploy/workspace.sql ] || { echo "ERROR: bundle is missing .env or deploy/workspace.sql"; exit 1; }

# shellcheck disable=SC2206
COMPOSE=(docker compose -p "$PROJECT_NAME" -f docker-compose.yml --env-file .env ${COMPOSE_EXTRA:-})

echo "[2/5] Building images (first time takes several minutes) ..."
"${COMPOSE[@]}" build

echo "[3/5] Starting MariaDB and restoring the dump ..."
"${COMPOSE[@]}" up -d mariadb
CID="$("${COMPOSE[@]}" ps -q mariadb)"
for _ in $(seq 1 90); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$CID")" = "healthy" ] && break
  sleep 2
done
"${COMPOSE[@]}" exec -T mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"' < deploy/workspace.sql
rm -f deploy/workspace.sql

echo "[4/5] Starting the whole stack ..."
"${COMPOSE[@]}" up -d

echo "[5/5] Done. Check:  curl http://localhost:5055/health   then open http://localhost:3000"
