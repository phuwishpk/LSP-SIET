#!/usr/bin/env bash
# Deploy an LSP-SIET all-in-one image on the server and roll back on failure.
#
#   ./deploy/deploy.sh sha-1a2b3c4      # a tag built by .github/workflows/image.yml
#
# Once per server: docker login ghcr.io -u <user>  (a token with read:packages).
set -euo pipefail
cd "$(dirname "$0")/.."
TAG=${1:?usage: deploy.sh <image tag, e.g. sha-1a2b3c4>}
IMAGE=ghcr.io/phuwishpk/lsp-siet
COMPOSE="docker compose -f docker-compose.prod.yml"
STATE=deploy/.current-tag

prev=$(cat "$STATE" 2>/dev/null || true)
echo "deploy: $IMAGE:$TAG (previous: ${prev:-none})"
docker pull "$IMAGE:$TAG"                 # download while the old one still runs

up() { LSP_SIET_TAG=$1 $COMPOSE up -d --remove-orphans; }
healthy() {
  for _ in $(seq 1 36); do                # up to 180 s: databases + migrations + apps
    s=$(docker inspect -f '{{.State.Health.Status}}' lsp-siet 2>/dev/null || echo none)
    [ "$s" = healthy ] && return 0
    sleep 5
  done
  return 1
}

up "$TAG"
if healthy; then
  echo "$TAG" > "$STATE"
  echo "deploy: $TAG is healthy"
  # keep the current and the previous image only
  docker images "$IMAGE" --format '{{.Tag}}' | grep -vxE "$TAG|${prev:-none}|main" | xargs -r -I{} docker rmi "$IMAGE:{}" || true
  docker exec lsp-siet lsp-memcheck || true
else
  echo "deploy: $TAG did not become healthy - last logs:"
  docker logs --tail 80 lsp-siet || true
  if [ -n "$prev" ]; then
    echo "deploy: rolling back to $prev"
    up "$prev"
    healthy && echo "deploy: back on $prev" || echo "deploy: rollback is not healthy either - check docker logs lsp-siet"
  fi
  exit 1
fi
