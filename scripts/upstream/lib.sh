# Shared helpers for the upstream scripts. Source it; do not run it.

PREFIX=open-notebook

# Upstream commit that open-notebook/ was last synced to: the newest
# "git-subtree-split:" line written by `git subtree` (or by phase 0 of the split).
upstream_base() {
  git log --grep="^git-subtree-dir: $PREFIX/*\$" --format=%B HEAD \
    | sed -n 's/^git-subtree-split: *//p' | head -1
}
