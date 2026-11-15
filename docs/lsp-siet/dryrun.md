# Codemod dry run on the teammates' open branches

Task 17 of the restructure, 2026-11-15. The codemod (`scripts/lsp-siet/codemod.py`, commit `87f70425` of
`refactor/lsp-siet`; the final tool commit is `0b73c398`, which only narrows one `check by hand` report) was run on a throw-away worktree of every open branch, followed by
`git merge --no-commit --no-ff refactor/lsp-siet`; the conflicts git reported were recorded and the merge aborted.
Nothing was pushed. Worktrees were removed afterwards (`git worktree list` shows none of them, `git branch` has
no new branch; the runs used detached heads). The hand-off for the teammates is `docs/handoff/lsp-siet.md`.

Disk: macOS (APFS, case-insensitive), so the `My-ai-quiz` -> `my-ai-quiz/app` case-only rename (R22) was exercised for real.
The literal commands of the handoff (`git merge main`, `git checkout $R -- scripts/lsp-siet`, `codemod.py --since $R`, `git add -A && git commit`,
`git merge $R`) were also run once end to end on the synthetic Poh branch with the final tool: merge exit 0, clean status, `codemod.py --check`
afterwards says nothing to do.

## Procedure per branch

1. `git worktree add --detach <dir> <branch>`; for the synthetic ones, commit the edits first.
2. If behind `main` (`8efc391`): `git merge main` (clean for all of them).
3. **No codemod:** `git merge --no-commit --no-ff refactor/lsp-siet`, record `git status --porcelain` conflict codes, abort.
4. **Whole-tree codemod** (`codemod.py` without `--since`), commit, merge as in 3, abort, drop the commit.
5. **Handoff flow:** copy `scripts/lsp-siet/` from `refactor/lsp-siet`, `codemod.py --since refactor/lsp-siet`, commit
   (`git add -A`, the tool included), merge as in 3, abort.

Conflict codes are `git status --porcelain`: `UU` both modified, `AA` both added, `UD` modified by us / deleted by them,
`AU` added by us (git suggests another path: "file location"), `DU`, `UA`, `DD`.

## The five branches that exist today

All five are (almost) merged into `main` already; none carries code of its own, so they test that the codemod leaves a
branch that has nothing to convert alone.

| Branch | Tip | Behind / ahead of `main` | Own files | Conflicts, no codemod | Conflicts, whole-tree codemod | Conflicts, handoff flow (`--since`) |
|---|---|---|---|---|---|---|
| `origin/feat/quiz-ai` (SpriteUm) | `a0320d7d` | 127 / 0 | 0 | 0 | 299 | **0** |
| `origin/dev-poh` (Poh) | `0ddc83df` | 110 / 0 | 0 | 0 | 299 | **0** |
| `origin/dev-poh-edit01` (Poh) | `e86cb71d` | 94 / 1 | 1 (`docs-thesis/Slide-Presentation/presentation_outline.md`) | 0 | 299 | **0** |
| `origin/feat/auth-rbac-logs-visibility-moderation` (Tanabordi) | `8b3f9751` | 59 / 0 | 0 | 0 | 299 | **0** |
| `feat/rag-community-search` (Phuwish) | `df82cc19` | 59 / 2 | 2 (`docs/superpowers/{specs,plans}/…rag-community-search…md`) | 0 | 299 | **0** |

The merged result equals `refactor/lsp-siet` plus the branch's own files in every case (`git diff --cached --name-only
refactor/lsp-siet` after the merge lists only those). Other remote or local branches (`origin/dev`, `origin/feat/llm-burst-resilience`,
`staging`, `integrate/prs-37-39-38`, `fix/roadmap-usable`, `feat/single-container`, `fix/navbar-same-everywhere`) are 0 commits ahead of `main`.

The whole-tree column is the finding that produced `--since` (next section): 299 conflicts on a branch that changed nothing.

## Synthetic work in progress

Because the real branches have no code to convert, three throw-away branches were made on `main` with the kind of edits each
person makes (the edit scripts were scratch files, not committed). Each touches old-layout files that the restructure moved,
split or deleted, adds a new file in a moved directory and a new test that patches/imports old names.

| Branch (synthetic) | Own files | No codemod | Whole-tree codemod | `--since` | What is left |
|---|---|---|---|---|---|
| SpriteUm: `My-ai-quiz` component + helper + new component, `features/service.py` and `routers/features.py` edited, new `siet-platform/tests/test_quiz_timer.py` | 6 | 4: `AU` `my-ai-quiz/app/app/components/TimerBadge.tsx`, `AU` `platform/tests-platform/test_quiz_timer.py`, `UD` `siet-platform/…/features/service.py`, `UD` `siet-platform/…/routers/features.py` | 299 | **2** | the two `UD`: the restructure split those two files (`siet_quiz`, `siet_roadmap`, `ai_helpers`, `http`), so edits to them are ported by hand. The codemod said so in advance (`check by hand: … the restructure deleted or split it`) and flagged the two patch targets of `ai_helpers` it will not rewrite |
| Poh: `community.py` router (imports `OpenNotebookError`, `features.service` names), `PostCard.tsx` (`@siet/platform/…` imports), new component and new page, new file in `notebooks/components/`, `openNotebookDialog` use, new test patching `Notebook.get` | 6 | 1: `AU` `kmitl-rag/…/notebooks/components/NotebookTags.tsx` | 299 | **0** | nothing. Imports of the merged `siet_community.routers.community` were checked in the converted tree (imports fine). New page needs `make frontend-routes` (handoff note) |
| Tanabordi: `auth_roles.py`, `siet-platform/frontend/…/use-auth.ts` (collision winner) and `open-notebook/…/use-auth.ts` (loser), pending page, `roles.ts`, new component, `api/main.py` handler line, new test | 8 | 4: `UD` `open-notebook/…/use-auth.ts`, `UU` `platform/api/main.py`, `AU` ×2 (new component, new test) | 299 | **1** | `UU platform/api/main.py`: both sides edited the handler line (his edit, the restructure's `siet_error_handler` rename). Genuine. The dropped loser's extra exports were reported (`dropped … exports *, isModerator that the kept … lacks`) |

Net effect of `--since`: 4 -> 2, 1 -> 0, 4 -> 1 conflicts, every remaining one a genuine edit-on-both-sides or a file the restructure split.

## Codemod-caused conflicts found and fixed

* **299 conflicts on an untouched branch** (`UD` 223, `UU` 31, `AA` 29, `AU` 5, `UA` 5, `DD` 5, `DU` 1; by git's message 249
  `rename/delete`, 32 `modify/delete`, 31 `content`, 29 `add/add`, 5 `rename/rename`). Cause: the codemod converted the whole tree, including ~220 files the restructure deleted on purpose (the upstream
  project's `.github/`, `.maintainer/`, docs) and the collision losers, and rewrote lines that the restructure's own hand edits sit next to.
  Fix: `codemod.py --since REF` converts only the files the branch changed since `git merge-base HEAD REF` (and untracked ones); the
  merge brings everything else. Tests: `test_since_*` in `scripts/lsp-siet/test_codemod.py`, including an end-to-end merge that must be
  clean and keep the teammate's edit and the restructure's edit.
* The check `is_dirty` refused a tree where `git checkout $R -- scripts/lsp-siet` had staged the tool; the tool's own directory no longer counts.
* `--since` reports (never changes the verdict): edited files that `REF` deleted or split, an edited collision loser that stays in place,
  imports of one of our own packages whose module is not in the converted layout (a symbol added to a file the restructure split).

## Other codemod fixes of this task (each with a test; RED/GREEN in the Task 17 report)

R22 case-only directory rename through a temporary name; `import a.b  # c` keeps the whitespace before `#`; a collision loser's extra exports
are reported; `notebooks/components` is one directory rule (new files follow the page) with `NoteEditorDialog` kept in the host, and a test that no
`MOVES` source still exists in the tree; `from . import mod` where `mod` moved to another package; `IDENTIFIER_RENAMES`
(`OpenNotebookError`, `open_notebook_error_handler`, `openNotebookDialog`); patch strings of symbols moved into `siet_platform.ai_helpers` /
`siet_platform.http` are reported, not rewritten (the quiz/roadmap modules import those names, so patching the helper intercepts nothing).
CI runs `scripts/lsp-siet` (codemod, infra paths, guard) in the `checks` job of `.github/workflows/image.yml`.

## Limits of this dry run

* No real teammate work was available: the five branches are merged. Re-run `codemod.py --since … --check` on the real work before relying on it.
* macOS only. On a case-sensitive disk (Linux) the case-only rename is a no-op by design (covered by the unit test with a simulated disk).
* TypeScript was converted and read, not compiled (no `tsc` of the synthetic trees); Python was import-checked for the clean Poh case only.
* The codemod does not know the symbols a teammate adds to a file the restructure split; it reports the missing module but cannot say where
  the symbol should go.
