"""The LSP-SIET move table: data only, read by ``codemod.py``.

Tasks 9-12 of the restructure append to ``MOVES`` / ``SYMBOL_MOVES`` and re-run the
codemod; teammates run the finished table on their own branches (old layout, so every
rule applies in sequence). Keep this file free of logic.

How the table is read
---------------------

``MOVES`` pairs are ``(old_repo_path, new_repo_path)`` with repo-relative POSIX paths.
Each is a file or a directory prefix. For one file the longest matching old path wins;
the new path is then looked up again, so a later rule can move something an earlier
rule put in place (a branch on the old layout gets the final path in one run, the
repository itself gets only the new rules). Matching is by whole path component and
case sensitive. A rule whose result matches itself again is a cycle and is refused.

``SYMBOL_MOVES`` keys and values are dotted names in the *final* namespace, i.e. after
``MOVES`` / ``MODULE_RENAMES`` were applied (``siet_platform.features.service.Name``,
not ``open_notebook...``). The codemod splits ``from M import A, B`` accordingly and
rewrites ``"M.A"`` strings (``mock.patch`` and friends); a changed last component is
imported under the old name (``from siet_quiz.x import new_name as old_name``).
"""

from __future__ import annotations

# (old repo path, new repo path); longest old path first is applied by the codemod, the
# order here is only for reading. Tasks 9-12 append.
MOVES: list[tuple[str, str]] = [
    ("open-notebook/open_notebook", "platform/siet_core"),
    ("open-notebook/api", "platform/api"),
    ("open-notebook/commands", "platform/commands"),
    ("open-notebook/prompts", "platform/prompts"),
    ("open-notebook/tests", "platform/tests"),
    ("open-notebook/frontend", "platform/frontend"),
    ("open-notebook", "platform"),
    ("siet-platform/siet_platform", "platform/siet_platform"),
    ("siet-platform/tests", "platform/tests-platform"),
    ("siet-platform/frontend/src", "platform/frontend/src"),
    ("siet-platform", "platform"),
    ("My-ai-quiz", "my-ai-quiz/app"),
    ("ai-roadmap-generator", "ai-roadmap/app"),
]

# When two files land on the same new path, the first (glob, winner_prefix) whose glob
# matches the path where the two files' move chains meet (the new path, unless a later rule
# moves both on again) says whose file keeps its content (fnmatch, "*" also crosses "/");
# the other is deleted through git and reported. No match: COLLISION_DEFAULT_WINNER.
# siet-platform wins under the host frontend's src (route stubs and the three replaced
# modules); every other collision (pyproject.toml, package.json, README.md, .gitignore)
# keeps the open-notebook (host) file and the siet-platform copy is merged by hand.
COLLISION_RULES: list[tuple[str, str]] = [
    ("platform/frontend/src/*", "siet-platform/"),
]
COLLISION_DEFAULT_WINNER: str = "open-notebook/"

# Directories whose children are top-level Python packages (module name = path below it).
PY_ROOTS_OLD: list[str] = ["open-notebook", "siet-platform", "kmitl-rag", "community"]
PY_ROOTS_NEW: list[str] = ["platform", "kmitl-rag", "community", "my-ai-quiz", "ai-roadmap"]

# Frontend source dir -> import alias prefix (with the trailing slash).
TS_ALIASES_OLD: dict[str, str] = {
    "open-notebook/frontend/src": "@/",
    "siet-platform/frontend/src": "@siet/platform/",
    "kmitl-rag/frontend/src": "@siet/kmitl-rag/",
    "community/frontend/src": "@siet/community/",
}
TS_ALIASES_NEW: dict[str, str] = {
    "platform/frontend/src": "@/",
    "kmitl-rag/frontend/src": "@siet/kmitl-rag/",
    "community/frontend/src": "@siet/community/",
    "my-ai-quiz/frontend/src": "@siet/quiz/",
    "ai-roadmap/frontend/src": "@siet/roadmap/",
}

# Python package renames not implied by a move. Only module references change
# (imports, patch/import strings, entry points); the bare word ``open_notebook`` as a
# SurrealDB namespace or command app name is never touched.
MODULE_RENAMES: dict[str, str] = {"open_notebook": "siet_core"}

# pyproject.toml entry-point group (old, new).
ENTRY_POINT_GROUP: tuple[str, str] = ("open_notebook.extensions", "siet.extensions")

# "final.module.Name": "new.module.Name"  (Task 10 fills).
SYMBOL_MOVES: dict[str, str] = {}

# Whole-word renames in .toml/.json/.yml/Makefile/Dockerfile*/.env.example/.sh (Task 15 fills).
ENV_RENAMES: dict[str, str] = {}
