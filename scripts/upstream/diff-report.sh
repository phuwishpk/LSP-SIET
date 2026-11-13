#!/usr/bin/env bash
# Print a Markdown report of how open-notebook/ differs from the upstream commit it
# was synced to. Use it to see what the KMITL patch set to upstream files is.
#
#   scripts/upstream/diff-report.sh [ref]   # ref defaults to HEAD
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
. scripts/upstream/lib.sh

REF=${1:-HEAD}
BASE=$(upstream_base)
[ -n "$BASE" ] || { echo "no git-subtree-split found in history" >&2; exit 1; }

diff_tree() { git diff --no-renames "$@" "$BASE^{tree}" "$REF:$PREFIX"; }

added=$(diff_tree --diff-filter=A --name-only | wc -l | tr -d ' ')
deleted=$(diff_tree --diff-filter=D --name-only | wc -l | tr -d ' ')
modified=$(diff_tree --diff-filter=M --name-only | wc -l | tr -d ' ')

echo "# open-notebook/ vs upstream $(git rev-parse --short "$BASE")"
echo
echo "- Upstream base: \`$BASE\` ($(git describe --tags "$BASE" 2>/dev/null || echo untagged))"
echo "- Compared ref: \`$(git rev-parse --short "$REF")\`"
echo "- Upstream files modified: **$modified**, deleted: **$deleted**; KMITL files added: **$added**"
echo
echo "## Modified upstream files (added / removed lines)"
echo
echo "| + | − | file |"
echo "|---:|---:|---|"
diff_tree --diff-filter=M --numstat | sort -k1,1nr | awk -F'\t' '{printf "| %s | %s | `%s` |\n", $1, $2, $3}'
echo
echo "## Deleted upstream files"
echo
diff_tree --diff-filter=D --name-only | sed 's/.*/- `&`/'
echo
echo "## Added files by directory"
echo
echo "| files | lines | directory |"
echo "|---:|---:|---|"
diff_tree --diff-filter=A --numstat \
  | awk -F'\t' '{n=split($3,p,"/"); d=(n>2)?p[1]"/"p[2]:(n>1?p[1]:"."); f[d]++; l[d]+=$1} END {for (d in f) printf "%d\t%d\t%s\n", f[d], l[d], d}' \
  | sort -k2,2nr | awk -F'\t' '{printf "| %s | %s | `%s/` |\n", $1, $2, $3}'
