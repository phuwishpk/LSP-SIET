# Codemod dry run on the teammates' open branches

Task 17 of the restructure, 2026-11-15. The codemod (`scripts/lsp-siet/codemod.py`, tool commit `610791bf` of
`refactor/lsp-siet`, after the review round described at the end; the first run used `87f70425`, the numbers in the tables are the same for both) was run on a throw-away worktree of every open branch, followed by
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

## Review round 1: three defects found by following the handoff literally

A reviewer ran the handoff commands in a clone of `origin/feat/quiz-ai` with synthetic WIP (macOS) and found three defects my runs had
missed. All three are fixed in `610791bf`, each with a test that failed first (`test_codemod.py`):

1. **A new file under `My-ai-quiz/` ended up tracked as `My-ai-quiz/app/app/lib/timer.ts`** (critical). With `--since` the unmoved files keep their
   `My-ai-quiz/*` index entries, the directory on disk is renamed to `my-ai-quiz`, and `git add -A` (the handoff's step 2) gives a new path the directory case
   the index already has. The merge looked clean, but Linux/CI/Docker got a stray `My-ai-quiz/` and the quiz app lacked the file; the final `--check` then planned
   `… -> my-ai-quiz/app/app/app/lib/timer.ts` (one level too deep). Fix: the codemod stages the untracked files it moved below a case-renamed directory itself,
   with `git -c core.ignorecase=false add`, so the index has the table's spelling; and a tracked path that the disk spells differently is refused with a
   `conflict:` line instead of being moved one level too deep. (Moving every tracked file under the directory, the other option, would have created
   `rename/delete` and `add/add` conflicts for the three `My-ai-quiz` files the restructure replaced: Dockerfile, README.md, favicon.ico.) Tests:
   `test_since_new_file_under_a_case_renamed_dir_is_indexed_with_the_new_spelling` (real disk; passes on Linux too),
   `test_a_tracked_path_the_disk_spells_differently_is_not_moved_one_level_too_deep` (skipped on case-sensitive disks).
2. **Settings and imports rewritten in files the restructure also changed made conflicts the teammate did not cause** (important). One edited line in
   `docker-compose.yml` gave 4 hunks instead of 1 (the codemod wrote `LSP_SIET_X:-default`, the restructure has `LSP_SIET_X:-${OPEN_NOTEBOOK_X:-default}`, and
   the losing side dropped the old-name fallback). Looking for the same effect elsewhere, an appended line in `community/siet_community/extension.py` conflicted
   because the codemod had rewritten a docstring line next to the one the restructure rebranded. Fix: in a file that `REF` already has at the final path, `--since`
   converts only the lines the branch changed (`git merge-file` of the original, the converted original and the converted branch version) and renames no
   settings; new `OPEN_NOTEBOOK_*` names the branch wrote are reported. New files and files the restructure removed are still converted whole. Tests:
   `test_since_does_not_rewrite_settings_in_a_file_the_restructure_has_at_that_path` (merge with an edited compose file: conflicts with the codemod <= without),
   `test_since_converts_only_the_lines_the_branch_changed_in_a_file_the_restructure_has` (clean merge, branch lines converted),
   `test_since_still_rewrites_settings_in_a_new_text_file`. Experiment on `main` with one edit in each of nine config/source files the restructure also
   changed: 4 conflicts without the codemod (my appends collide with the restructure's own appends), 4 with it (was 5).
3. **The missing-import report missed its own example** (important): the branch's edited copy of a split file counted as a module that will exist. Now
   files reported as deleted/split (and edited collision losers) make no module, so `from siet_platform.features.service import _timer_hint` in a new test is
   reported. Test: `test_since_reports_a_new_symbol_imported_from_a_split_file_the_branch_also_edited`. The synthetic SpriteUm run now prints
   `imports siet_platform.features.service, which does not exist …` for its test.

Re-run with `610791bf` (all eight branches): conflicts unchanged: 0 for the five real branches, 2 / 0 / 1 for the synthetic SpriteUm / Poh / Tanabordi ones
(whole-tree codemod still 299 everywhere). The reviewer's scenario was re-run literally (`git merge main`, a tracked edit and an untracked new file under
`My-ai-quiz/`, `git checkout $R -- scripts/lsp-siet`, `codemod.py --since $R`, `git add -A && git commit`, `git merge $R`): merge exit 0, clean status,
`git ls-files | grep '^My-ai-quiz'` prints nothing, `timer.ts` tracked as `my-ai-quiz/app/app/lib/timer.ts`, `--check` afterwards nothing to do.
With the tool of `124e9d90` the same run leaves 53 tracked paths under `My-ai-quiz/` and `timer.ts` as `My-ai-quiz/app/app/lib/timer.ts`.

## Limits of this dry run

* No real teammate work was available: the five branches are merged. Re-run `codemod.py --since … --check` on the real work before relying on it.
* macOS only. On a case-sensitive disk (Linux) the case-only rename is a no-op by design (covered by the unit test with a simulated disk).
* TypeScript was converted and read, not compiled (no `tsc` of the synthetic trees); Python was import-checked for the clean Poh case only.
* The codemod does not know the symbols a teammate adds to a file the restructure split; it reports the missing module but cannot say where
  the symbol should go.
