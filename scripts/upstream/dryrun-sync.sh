#!/usr/bin/env bash
# Try `git subtree merge` of an upstream ref in a throwaway worktree and report the
# conflicts, without touching the current branch. Measures how hard a real sync is.
#
#   scripts/upstream/dryrun-sync.sh v1.15.0      # needs: git fetch upstream tag v1.15.0
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
. scripts/upstream/lib.sh

TARGET=${1:?usage: dryrun-sync.sh <upstream ref>}
git rev-parse --verify -q "$TARGET^{commit}" >/dev/null || { echo "unknown ref $TARGET (git fetch upstream?)" >&2; exit 1; }

WT=$(mktemp -d "${TMPDIR:-/tmp}/on-dryrun.XXXXXX")
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"' EXIT
git worktree add -q --detach "$WT" HEAD

(cd "$WT" && git subtree merge --prefix="$PREFIX" --squash "$TARGET" -m "dry-run" >/dev/null 2>&1) || true

conflicts=$(cd "$WT" && git status --porcelain | grep -E '^(AA|AU|UA|DU|UD|DD|UU) ' | sed "s#$PREFIX/##" | sort || true)
echo "# Dry-run sync: $(git rev-parse --short "$(upstream_base)") -> $TARGET on $(git rev-parse --short HEAD)"
echo
echo "Conflicted files: **$(printf '%s' "$conflicts" | grep -c . || true)**"
echo
echo "| type | count |"
echo "|---|---:|"
printf '%s\n' "$conflicts" | awk 'NF {c[$1]++} END {for (t in c) printf "| %s | %d |\n", t, c[t]}' | sort
echo
echo "AA = both added, DU = deleted here / changed upstream, UU = both changed."
echo
printf '%s\n' "$conflicts" | awk 'NF {printf "- %s `%s`\n", $1, $2}'
