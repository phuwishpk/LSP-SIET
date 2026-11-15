#!/usr/bin/env python3
"""Move files and rewrite references to the LSP-SIET layout (``moves.py`` is the table).

    python3 scripts/lsp-siet/codemod.py             # apply, on a clean working tree
    python3 scripts/lsp-siet/codemod.py --check     # list what would change, write nothing
    python3 scripts/lsp-siet/codemod.py --since origin/refactor/lsp-siet   # a teammate's branch

Exit status: ``--check`` returns 1 when anything would change and 0 when the tree is
already converted; applying returns 0 (1 if a conflict blocked some file, see below);
2 means the run was refused (dirty index, not a git repository, bad table).

``--since REF`` converts only what this branch changed since it split from ``REF`` (files that
differ from ``git merge-base HEAD REF``, plus untracked ones). Everything else stays where it
is: the merge of the restructure moves, edits or deletes those files itself, and moving them
first only creates rename/delete conflicts with the restructure's own deletions. Resolution of
imports and aliases still uses the whole tree, so the converted files point at the final paths.
A collision loser that the branch edited is not dropped (the edit would be lost): it stays and a
``check by hand`` line says so, git then reports the conflict with the restructure's version.
Edited files that REF deleted or split (``features/service.py``) are listed too: the merge can
not carry those edits over, they are ported by hand.

Run it from the root of the checkout to convert (``--root`` overrides). It works on the
repository itself and on a teammate's branch that still has the old layout (new files
included), and is safe to repeat: a second run finds nothing to do. An interrupted run
is resumed by running it again.

What it does, in this order
---------------------------

1. **Moves.** Every tracked file and every untracked file that git does not ignore is
   mapped through ``MOVES`` (longest old path wins, repeated until nothing matches, so
   later rules compose with earlier ones) and moved with ``git mv`` (untracked files
   with a plain rename). Ignored files (``node_modules``, ``.venv``, data dirs) stay;
   they are listed so they can be moved by hand. If two files land on the same path,
   ``COLLISION_RULES`` (first glob matching the path where the two files' move chains
   meet, which is the new path unless a later rule moves both on again) names the side
   that keeps its content, ``COLLISION_DEFAULT_WINNER`` otherwise: the ``siet-platform/``
   file under ``platform/frontend/src/`` (route stubs, replaced modules), the ``open-notebook/``
   (host) file everywhere else (``pyproject.toml``, ``package.json``, ``README.md``).
   The other copy is deleted through git (an untracked loser is saved next to it as
   ``<name>.collision-dropped``); every collision is reported with the command that
   shows the loser, and the host-wins ones say ``merge by hand``. When the dropped
   TypeScript module exports something the kept one lacks (``dynamic``, ``revalidate``,
   ``metadata``, ``generateMetadata``, any extra name) a ``check by hand`` line names it.
   On a case-insensitive disk (macOS, Windows) a destination directory that exists under
   another spelling (``My-ai-quiz`` for ``my-ai-quiz``) is first renamed through a temporary
   name, so the spelling on disk is the table's, not the old one. The reverse state (the disk
   already spells ``my-ai-quiz`` while git's index still says ``My-ai-quiz/...``, what
   ``git reset --hard`` leaves after a run) needs no rename: the files are moved as usual and ``git mv``
   writes the new spelling (``check_spellings``). A file that would land
   on a file that is already there, or two files from the same side, are reported as
   ``conflict`` and stay where they are.
2. **Python** (``*.py``, except this tool's own directory). Dotted module names are
   derived from the moved ``.py`` paths (below the first matching ``PY_ROOTS`` directory
   ``a/b/c.py`` is ``b.c`` under root ``a``), from the directory rules of ``MOVES``
   and from ``MODULE_RENAMES``, then rewritten in ``import`` / ``from ... import``
   lines, in ``mock.patch("...")``, ``monkeypatch.setattr("...")`` and
   ``import_module("...")`` strings, and in prose. Rules that keep protecting data:

   * a bare ``open_notebook`` is only touched in import statements and
     ``import_module(...)``; the SurrealDB namespace/database values and the
     ``surreal-commands`` app name (``app="open_notebook"``) stay;
   * ``"open_notebook.process_source"`` (a command name) is not a module, so it stays:
     inside a string a package-level dotted name must name a real child module;
   * the quoted entry-point group ``"open_notebook.extensions"`` becomes
     ``"siet.extensions"``; in ``pyproject.toml`` the entry-point (and script) values
     follow the module renames too; the distribution ``name = "open-notebook"`` does not;
   * path strings (``"open_notebook/database/migrations/1.surrealql"``) follow when the
     path exists below a Python root;
   * relative imports are left alone while their target keeps its relative position,
     otherwise they become absolute;
   * ``from M import A, B`` is split per ``SYMBOL_MOVES`` (and per modules that moved
     to another package), ``"M.A"`` strings follow; attribute uses (``mod.A``) are
     reported as ``check by hand``. ``from . import mod`` where ``mod`` moved to another
     package becomes an absolute import of its new home;
   * a patch string naming a symbol that moved into one of ``SHARED_HELPER_MODULES``
     (``siet_platform.ai_helpers``, ``siet_platform.http``) is not rewritten: the quiz and
     roadmap modules import it by name, so patching the helper intercepts nothing. It is
     reported as ``check by hand: patch target ...`` (patch where the name is used);
   * an import of one of our own packages whose module is not in the converted layout (a
     symbol added to a file the restructure split, say) is reported as ``check by hand``;
   * ``IDENTIFIER_RENAMES`` (``OpenNotebookError`` -> ``SietError`` ...) are renamed whole-word
     in every Python and TypeScript/JavaScript file; the persisted ``open_notebook`` values
     above are values, not identifiers, and are never in that table.
3. **TypeScript/JavaScript** under the frontend directories of the alias tables. The
   specifier of ``import ... from``, ``export ... from``, ``import(...)``,
   ``import '...'``, ``require(...)``, ``vi.mock`` / ``jest.mock`` (and friends) is
   resolved (extension-less names try ``.ts .tsx .js ... /index.*``) against the file's
   *old* location through the old alias table, mapped through the move plan and written
   back in the new alias form. A relative specifier stays as it is while it still
   resolves to the same file from the new location; otherwise it becomes an alias.
4. **Text.** ``ENV_RENAMES`` keys, whole word, in ``*.toml *.json *.yml *.yaml
   Makefile Dockerfile* .env.example *.sh`` (not where the key is the fallback in a
   ``${NEW:-${OLD:-default}}`` expression; Python and TypeScript sources, where the
   ``LEGACY_NAMES`` tables live, are not text files in this sense and are never touched).

Mentions of the old directory names in those file types, and ignored local directories
left under old paths, are listed as ``check by hand`` / ``note`` lines; they never
change the exit status. Text changes are left unstaged; moves are staged by ``git mv``.
"""

from __future__ import annotations

import argparse
import dataclasses
import fnmatch
import os
import posixpath
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

# Never leave __pycache__ behind in scripts/lsp-siet/ (the tool runs inside the tree it converts).
sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import moves as moves_table  # noqa: E402

SELF_DIR = "scripts/lsp-siet/"
MAX_CHAIN = 16
IDENT = re.compile(r"[A-Za-z_]\w*")
TS_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")
ASIDE_SUFFIX = ".collision-dropped"
LINE_LIMIT = 100


# ------------------------------------------------------------------------- configuration


@dataclass(frozen=True)
class Config:
    moves: tuple[tuple[str, str], ...]
    py_roots_old: tuple[str, ...]
    py_roots_new: tuple[str, ...]
    ts_aliases_old: dict[str, str]
    ts_aliases_new: dict[str, str]
    module_renames: dict[str, str]
    entry_point_group: tuple[str, str]
    symbol_moves: dict[str, str]
    env_renames: dict[str, str]
    identifier_renames: dict[str, str] = field(default_factory=dict)
    shared_helper_modules: tuple[str, ...] = ()
    collision_rules: tuple[tuple[str, str], ...] = (("platform/frontend/src/*", "siet-platform/"),)
    collision_default_winner: str = "open-notebook/"

    @classmethod
    def from_moves(cls, table=moves_table) -> "Config":
        return cls(
            moves=tuple((old.strip("/"), new.strip("/")) for old, new in table.MOVES),
            py_roots_old=tuple(table.PY_ROOTS_OLD),
            py_roots_new=tuple(table.PY_ROOTS_NEW),
            ts_aliases_old=dict(table.TS_ALIASES_OLD),
            ts_aliases_new=dict(table.TS_ALIASES_NEW),
            module_renames=dict(table.MODULE_RENAMES),
            entry_point_group=tuple(table.ENTRY_POINT_GROUP),  # type: ignore[arg-type]
            symbol_moves=dict(table.SYMBOL_MOVES),
            env_renames=dict(table.ENV_RENAMES),
            identifier_renames=dict(getattr(table, "IDENTIFIER_RENAMES", {})),
            shared_helper_modules=tuple(getattr(table, "SHARED_HELPER_MODULES", ())),
            collision_rules=tuple((glob, prefix) for glob, prefix in table.COLLISION_RULES),
            collision_default_winner=table.COLLISION_DEFAULT_WINNER,
        )

    def validate(self) -> None:
        olds = [old for old, _ in self.moves]
        if len(olds) != len(set(olds)):
            dup = sorted({o for o in olds if olds.count(o) > 1})
            raise ValueError(f"MOVES lists these old paths twice: {', '.join(dup)}")
        plan = Plan(self, [], set())
        for old, new in self.moves:
            if not old or not new or old.startswith("..") or new.startswith(".."):
                raise ValueError(f"MOVES needs repo-relative, non-empty paths, got ({old!r}, {new!r})")
            if old == new:
                raise ValueError(f"MOVES maps {old} to itself")
            plan.final_path(old)
            plan.final_path(new)


# ------------------------------------------------------------------------------ git helpers


class GitError(RuntimeError):
    pass


def git(root: Path, *args: str, check: bool = True) -> str:
    done = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    if check and done.returncode != 0:
        raise GitError(f"git {' '.join(args[:3])} failed: {done.stderr.strip() or done.stdout.strip()}")
    return done.stdout


def git_list(root: Path, *args: str) -> list[str]:
    return [p for p in git(root, *args, "-z").split("\0") if p]


def repo_root(start: Path) -> Path | None:
    done = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=start, capture_output=True, text=True)
    return Path(done.stdout.strip()) if done.returncode == 0 and done.stdout.strip() else None


def is_dirty(root: Path) -> bool:
    """Uncommitted changes to tracked files, not counting this tool's own directory (a teammate
    copies it into the branch with ``git checkout <ref> -- scripts/lsp-siet``, which stages it)."""
    changed = git_list(root, "status", "--porcelain", "--untracked-files=no", "--no-renames")
    return any(not entry[3:].startswith(SELF_DIR) for entry in changed)


def inventory(root: Path) -> tuple[list[str], set[str]]:
    """Tracked files that exist plus untracked files git does not ignore."""
    tracked_all = git_list(root, "ls-files")
    untracked = git_list(root, "ls-files", "--others", "--exclude-standard")
    tracked: set[str] = set()
    files: set[str] = set()
    def is_file(rel: str) -> bool:
        path = root / rel
        return os.path.lexists(path) and (path.is_symlink() or not path.is_dir())

    for rel in tracked_all:
        if is_file(rel):
            tracked.add(rel)
            files.add(rel)
    for rel in untracked:
        if is_file(rel):
            files.add(rel)
    keep = [f for f in sorted(files) if not f.startswith(SELF_DIR) and not f.startswith(".git/")]
    return keep, tracked & set(keep)


def changed_since(root: Path, ref: str, files: list[str], tracked: set[str]) -> tuple[set[str], str]:
    """The files this branch changed since it split from ``ref``, and the split commit."""
    base = git(root, "merge-base", "HEAD", ref, check=False).strip()
    if not base:
        raise GitError(f"--since {ref}: no such revision, or no common ancestor with HEAD")
    changed = set(git_list(root, "diff", "--name-only", "--no-renames", "--diff-filter=d", base))
    return {f for f in files if f in changed or f not in tracked}, base


def vanished_in(root: Path, ref: str, base: str, only: set[str], plan: "Plan") -> dict[str, str]:
    """Edited files that existed at the split but are at neither their old nor their new path in
    ``ref``: the restructure deleted or split them, so the merge can not carry the edits over.
    Maps the old path to the report line."""
    in_ref = set(git_list(root, "ls-tree", "-r", "--name-only", ref))
    in_base = set(git_list(root, "ls-tree", "-r", "--name-only", base))
    found: dict[str, str] = {}
    for f in sorted(only):
        new = plan.resolve.get(f, f)
        new = plan.refused.get(f, new)  # a file that stays (conflict) is still headed for the table's path
        if f in in_base and f not in in_ref and new not in in_ref and f not in plan.drops and f not in plan.stays:
            where = f"neither {f} nor {new}" if new != f else f"no {f}"
            found[f] = (
                f"{new}: {ref} has {where} (the restructure deleted or split it): "
                f"port your edits by hand (git diff {base[:8]} HEAD -- {f}, before committing the codemod's output)"
            )
    return found


# ------------------------------------------------------------------------------------- plan


@dataclass
class Collision:
    dst: str
    winner: str
    losers: list[str]
    by_default: bool = False  # the default side won: the loser's content wants a hand merge
    meeting: str = ""  # where the files' chains meet (the winner is decided there)
    same_content: dict[str, bool] = field(default_factory=dict)


class Plan:
    """Where every file ends up. ``resolve`` covers all files (losers included), ``moves``
    only the ones that really change place."""

    def __init__(self, cfg: Config, files: list[str], tracked: set[str]):
        self.cfg = cfg
        self.files = files
        self.tracked = tracked
        self._rules = sorted(cfg.moves, key=lambda rule: (-len(rule[0]), rule[0]))
        self.resolve: dict[str, str] = {}
        self.moves: dict[str, str] = {}
        self.first_rule: dict[str, tuple[str, str]] = {}
        self.drops: dict[str, str] = {}  # loser -> winner's destination
        self.collisions: list[Collision] = []
        self.conflicts: list[str] = []
        self.refused: dict[str, str] = {}  # file the table wanted to move but that stays -> where the table sends it
        self.stays: dict[str, str] = {}  # edited collision loser left in place (--since) -> message

    # one step of the table: the longest matching old path
    def _step(self, path: str) -> tuple[str, tuple[str, str]] | None:
        for old, new in self._rules:
            if path == old:
                return new, (old, new)
            if path.startswith(old + "/"):
                return new + path[len(old):], (old, new)
        return None

    def walk(self, path: str) -> tuple[list[str], tuple[str, str] | None]:
        """Every path ``path`` goes through (itself first, the final path last) and the first rule used."""
        first: tuple[str, str] | None = None
        chain = [path]
        for _ in range(MAX_CHAIN):
            hit = self._step(path)
            if hit is None:
                return chain, first
            path, rule = hit
            first = first or rule
            if path in chain:
                raise ValueError(f"MOVES has a cycle through {path}")
            chain.append(path)
        raise ValueError(f"MOVES chains more than {MAX_CHAIN} rules at {path}")

    def final_path(self, path: str) -> tuple[str, tuple[str, str] | None]:
        chain, first = self.walk(path)
        return chain[-1], first

    def build(self, root: Path | None, no_moves: bool, only: set[str] | None = None) -> "Plan":
        """``only``: act on these files alone (``--since``); every file still gets its final path."""
        final: dict[str, str] = {}
        chains: dict[str, list[str]] = {}
        for f in self.files:
            if no_moves:
                final[f] = f
                chains[f] = [f]
                continue
            chain, rule = self.walk(f)
            chains[f] = chain
            final[f] = chain[-1]
            if rule:
                self.first_rule[f] = rule
        by_dst: dict[str, list[str]] = defaultdict(list)
        for f, dst in final.items():
            by_dst[dst].append(f)
        present = set(self.files)
        for dst, srcs in sorted(by_dst.items()):
            movers = [s for s in srcs if s != dst]
            if not movers:
                self.resolve[dst] = dst
                continue
            if len(srcs) == 1:
                src = srcs[0]
                if only is not None and src not in only:
                    self.resolve[src] = dst  # its final path is known; the merge moves the file
                    continue
                if root is not None and dst not in present and _occupied(root, src, dst):
                    self._block([src], f"{dst} exists on disk (ignored file?); {src} stays")
                    continue
                self.resolve[src] = dst
                self.moves[src] = dst
                continue
            # The winner is decided where the files meet (a later rule may move both on again,
            # and must not change who wins); a file already sitting there is "in place".
            meeting = _meeting_point([chains[s] for s in srcs])
            winner_prefix, by_default = self.winner_prefix(meeting)
            winners = [s for s in movers if s.startswith(winner_prefix)]
            if meeting not in srcs and len(winners) == 1:
                winner = winners[0]
                losers = [s for s in movers if s != winner]
                self.resolve[winner] = dst
                for loser in losers:
                    self.resolve[loser] = dst
                if only is None or winner in only:
                    self.moves[winner] = dst
                acting = [loser for loser in losers if only is None or loser in only]
                if only is not None and winner not in only:
                    for loser in acting:
                        self.stays[loser] = (
                            f"{loser}: your edits stay in this file; {winner} wins at {dst} in the restructure, "
                            "so the merge reports a conflict there: port the edits by hand"
                        )
                    continue
                if acting:
                    self.collisions.append(Collision(dst, winner, acting, by_default, meeting))
                    for loser in acting:
                        self.drops[loser] = dst
                continue
            self._block(srcs, f"{', '.join(srcs)} all want {dst}; none moved")
        return self

    def winner_prefix(self, path: str) -> tuple[str, bool]:
        """Which side keeps its content when two files meet at ``path`` (prefix, decided by default?)."""
        for glob, prefix in self.cfg.collision_rules:
            if fnmatch.fnmatchcase(path, glob):
                return prefix, False
        return self.cfg.collision_default_winner, True

    def refuse(self, src: str, message: str) -> None:
        """Take a planned move back: the file stays and the message is reported as a conflict."""
        intended = self.moves.pop(src, None)
        if intended:
            self.refused[src] = intended
        self._block([src], message)

    def _block(self, srcs: list[str], message: str) -> None:
        for s in srcs:
            self.resolve[s] = s
        self.conflicts.append(message)


def _vanishing_top_dirs(cfg: Config) -> set[str]:
    """Top-level directories that only exist in the old layout (``platform`` is not one of them)."""
    first = lambda path: path.split("/")[0]  # noqa: E731
    kept = {first(new) for _, new in cfg.moves} | {first(r) for r in cfg.py_roots_new}
    kept |= {first(d) for d in cfg.ts_aliases_new}
    return {first(old) for old, _ in cfg.moves} - kept


def _meeting_point(chains: list[list[str]]) -> str:
    """The first path of the first chain that every other chain also goes through (chains only
    ever join, never split, so this is where the files first sit on the same path)."""
    others = [set(chain) for chain in chains[1:]]
    for path in chains[0]:
        if all(path in other for other in others):
            return path
    return chains[0][-1]


def _occupied(root: Path, src: str, dst: str) -> bool:
    """dst exists on disk and is not just another spelling of src (case-insensitive disks)."""
    if not os.path.lexists(root / dst):
        return False
    try:
        return not os.path.samefile(root / src, root / dst)
    except OSError:
        return True


def disk_spelling(root: Path, rel: str, listings: dict[str, list[str] | None]) -> str | None:
    """``rel`` as the disk spells it (a case-insensitive disk answers for any case); None when absent."""
    parts, found = rel.split("/"), []
    for comp in parts:
        here = "/".join(found)
        if here not in listings:
            listings[here] = _disk_names(root / here if here else root)
        names = listings[here]
        if names is None:
            return None
        if comp in names:
            found.append(comp)
            continue
        other = next((n for n in names if n.lower() == comp.lower()), None)
        if other is None:
            return None
        found.append(other)
    return "/".join(found)


def _disk_names(path: Path) -> list[str] | None:
    try:
        return os.listdir(path)
    except OSError:
        return None


def case_renames(
    root: Path,
    dirs: Iterable[str],
    *,
    names: Callable[[Path], list[str] | None] = _disk_names,
    exists: Callable[[Path], bool] = os.path.lexists,
) -> list[tuple[str, str]]:
    """Directories on the way to a destination that exist on disk under another spelling.

    A case-insensitive disk (macOS, Windows) answers ``My-ai-quiz`` when asked for
    ``my-ai-quiz``, so ``mkdir -p my-ai-quiz/app`` would create the new directory *inside* the old
    one and the on-disk spelling would stay ``My-ai-quiz`` while the index says ``my-ai-quiz``.
    Returns ``(path as spelled on disk, wanted path)`` pairs, shallowest first (the parent part of
    both is already the wanted spelling); ``_rename_dirs`` applies them in two steps. A
    case-sensitive disk has nothing to report: there the other spelling is another directory.
    """
    prefixes: set[str] = set()
    for d in dirs:
        parts = d.split("/") if d else []
        prefixes.update("/".join(parts[:i]) for i in range(1, len(parts) + 1))
    found: list[tuple[str, str]] = []
    for prefix in sorted(prefixes, key=lambda p: (p.count("/"), p)):
        parent, _, comp = prefix.rpartition("/")
        if not exists(root / prefix):
            continue
        listing = names(root / parent if parent else root)
        if listing is None or comp in listing:
            continue
        actual = next((n for n in listing if n.lower() == comp.lower()), None)
        if actual is not None:
            found.append((f"{parent}/{actual}" if parent else actual, prefix))
    return found


def _first_difference(src: str, on_disk: str) -> tuple[str, str]:
    """``src`` and ``on_disk`` (same path, spelled differently) cut after the first component that differs."""
    mine, theirs = src.split("/"), on_disk.split("/")
    for i, (a, b) in enumerate(zip(mine, theirs)):
        if a != b:
            return "/".join(mine[:i + 1]), "/".join(theirs[:i + 1])
    return src, on_disk


def check_spellings(
    root: Path,
    plan: "Plan",
    tracked: set[str],
    listings: dict[str, list[str] | None] | None = None,
) -> list[str]:
    """Tracked files whose directory the disk spells with another case than git's index.

    On a case-insensitive disk (macOS) the index can say ``My-ai-quiz/app/page.tsx`` while the
    disk says ``my-ai-quiz/app/page.tsx``. Two histories lead there and the path alone does not tell
    them apart; what git's index holds does:

    * **The index spells that directory only the old way.** This is what ``git reset --hard`` (the
      undo of a run) or an interrupted run leaves: the disk directory already carries the new
      spelling, the files in it are still where the old layout has them. They are moved as usual;
      ``git mv`` writes the table's spelling into the index. Nothing to rename on disk.
    * **The index also holds files of the same directory in the disk's spelling**, so this file is
      the odd one out: a new-layout file that ``git add`` recorded with the old case. The table
      would move it one level too deep, so it stays, reported as a conflict with both remedies.

    ``listings`` (directory -> names, "" is the root) answers instead of the disk where given.
    Returns the notes to print; refused files are recorded in ``plan``.
    """
    listings = {} if listings is None else listings
    notes: list[str] = []
    noted: set[str] = set()
    new_spelled_dirs: dict[str, set[str]] = {}
    for src in sorted(plan.moves):
        if src not in tracked or (on_disk := disk_spelling(root, src, listings)) in (None, src):
            continue
        old_way, disk_way = _first_difference(src, on_disk)
        if disk_way not in new_spelled_dirs:
            new_spelled_dirs[disk_way] = {
                posixpath.dirname(t) for t in tracked if t.startswith(disk_way + "/")
            }
        if posixpath.dirname(on_disk) not in new_spelled_dirs[disk_way]:
            if old_way not in noted:
                noted.add(old_way)
                notes.append(
                    f"note: {old_way} is spelled {disk_way} on this disk but git's index has the old spelling: "
                    "moved as usual (git mv writes the new one)"
                )
            continue
        dst = plan.moves[src]
        plan.refuse(
            src,
            f"{src} is spelled {on_disk} on this disk and git's index holds files of that directory "
            f"under both spellings (case-insensitive disk): not moved. Still in the old layout? "
            f"`git mv {src} {dst}`. Already in the new layout (added after the codemod)? "
            f"`git mv {src} {src}.tmp && git mv {src}.tmp {on_disk}`",
        )
    return notes


def _rename_dirs(root: Path, renames: list[tuple[str, str]]) -> None:
    """Rename through a temporary name: a case-only rename in one step is a no-op on such disks."""
    for disk, wanted in renames:
        temporary = root / f"{disk}.case-rename"
        os.rename(root / disk, temporary)
        os.rename(temporary, root / wanted)


# -------------------------------------------------------------------- Python module index


def module_of(path: str, roots: tuple[str, ...]) -> tuple[str, bool] | None:
    """(dotted module, is_package) of a path below a Python root, or None."""
    for root in roots:
        if path.startswith(root + "/"):
            rest = path[len(root) + 1:]
            break
    else:
        return None
    parts = rest.split("/")
    is_package = True
    if parts[-1].endswith(".py"):
        name = parts[-1][:-3]
        is_package = name == "__init__"
        parts = parts[:-1] + ([] if is_package else [name])
    if not parts or not all(IDENT.fullmatch(p) for p in parts):
        return None
    return ".".join(parts), is_package


class ModuleIndex:
    """Which dotted modules exist (old and new names), and what each is renamed to."""

    def __init__(self, cfg: Config, plan: Plan):
        self.cfg = cfg
        self.roots = tuple(sorted(set(cfg.py_roots_old) | set(cfg.py_roots_new), key=len, reverse=True))
        self.renames: dict[str, str] = {k: v for k, v in cfg.module_renames.items() if k != v}
        self.known: set[str] = set()
        self.packages: set[str] = set()
        self.conflicts: list[str] = []
        file_level: dict[str, str] = {}
        for f in plan.files:
            if not f.endswith(".py"):
                continue
            old = module_of(f, self.roots)
            new = module_of(plan.resolve.get(f, f), self.roots)
            for item in (old, new):
                if item:
                    self._remember(*item)
            if old and new and old[0] != new[0]:
                if file_level.setdefault(old[0], new[0]) != new[0]:
                    self.conflicts.append(f"module {old[0]} maps to both {file_level[old[0]]} and {new[0]}")
        for key, value in file_level.items():
            self.renames.setdefault(key, value)
        for old_path, new_path in cfg.moves:
            old, new = module_of(old_path, self.roots), module_of(new_path, self.roots)
            if old and new and old[0] != new[0]:
                self.renames.setdefault(old[0], new[0])

    def _remember(self, module: str, is_package: bool) -> None:
        parts = module.split(".")
        for i in range(1, len(parts) + 1):
            self.known.add(".".join(parts[:i]))
        for i in range(1, len(parts) + (1 if is_package else 0)):
            self.packages.add(".".join(parts[:i]))

    def match(self, parts: list[str]) -> tuple[int, str] | None:
        for k in range(len(parts), 0, -1):
            key = ".".join(parts[:k])
            if key in self.renames:
                return k, key
        return None

    def rename_module(self, dotted: str) -> str:
        """Rename a dotted module name through the table (no validation: use for modules)."""
        for _ in range(8):
            parts = dotted.split(".")
            hit = self.match(parts)
            if hit is None:
                return dotted
            k, key = hit
            new = ".".join([self.renames[key], *parts[k:]])
            if new == dotted:
                return dotted
            dotted = new
        return dotted

    def rename_token(self, token: str, in_string: bool) -> str | None:
        """Rename a dotted token found in code or prose; None when it is not a module reference."""
        current = token
        changed = False
        for _ in range(8):
            parts = current.split(".")
            hit = self.match(parts)
            if hit is None:
                break
            k, key = hit
            value = self.renames[key]
            rest = parts[k:]
            if rest and (key in self.packages or "." not in key):
                child, child_new = f"{key}.{rest[0]}", f"{value}.{rest[0]}"
                if child not in self.known and child_new not in self.known and in_string:
                    # "open_notebook.process_source": a command name, not a module
                    break
            new = ".".join([value, *rest])
            if new == current:
                break
            current, changed = new, True
        return current if changed else None


# ---------------------------------------------------------------------------- Python edits

IMPORTED_MODULE = re.compile(
    r"^[ \t]*(?:from[ \t]+(?P<from>[A-Za-z_][\w.]*)[ \t]+import\b"
    r"|import[ \t]+(?P<plain>[A-Za-z_][\w.]*(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[A-Za-z_][\w.]*(?:[ \t]+as[ \t]+\w+)?)*))",
    re.M,
)


def module_set(paths: Iterable[str], roots: tuple[str, ...]) -> set[str]:
    """Dotted modules (and their parent packages) of the Python files among ``paths``."""
    found: set[str] = set()
    for path in paths:
        item = module_of(path, roots) if path.endswith(".py") else None
        if item:
            parts = item[0].split(".")
            found.update(".".join(parts[:i]) for i in range(1, len(parts) + 1))
    return found


def missing_imports(text: str, modules: set[str], tops: set[str]) -> list[str]:
    """Imported modules of our own packages that exist nowhere in the final layout."""
    found: list[str] = []
    for m in IMPORTED_MODULE.finditer(text):
        names = [m.group("from")] if m.group("from") else [
            part.strip().split()[0] for part in m.group("plain").split(",")
        ]
        for name in names:
            if name and name.split(".")[0] in tops and name not in modules and name not in found:
                found.append(name)
    return found



@dataclass
class Item:
    name: str
    alias: str | None
    comment: str | None = None

    def text(self) -> str:
        return f"{self.name} as {self.alias}" if self.alias else self.name


_ITEM = re.compile(r"^(\*|[A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$")


def parse_items(body: str) -> list[Item] | None:
    items: list[Item] = []
    for line in body.split("\n"):
        code, _, comment = line.partition("#")
        last: Item | None = None
        for chunk in code.replace("\\", " ").split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            m = _ITEM.match(chunk)
            if not m:
                return None
            last = Item(m.group(1), m.group(2))
            items.append(last)
        if comment.strip() and last is not None:
            last.comment = "#" + comment.rstrip()
    return items or None


def emit_from(indent: str, module: str, items: list[Item], trailing: str = "") -> str:
    one = f"{indent}from {module} import {', '.join(i.text() for i in items)}"
    if not any(i.comment for i in items) and len(one) + len(trailing) <= LINE_LIMIT:
        return one + trailing
    body = "".join(
        f"{indent}    {i.text()},{'  ' + i.comment if i.comment else ''}\n" for i in items
    )
    return f"{indent}from {module} import (\n{body}{indent}){trailing}"


FROM_IMPORT = re.compile(
    r"^(?P<ind>[ \t]*)from[ \t]+(?P<mod>[A-Za-z_][\w.]*)[ \t]+import[ \t]+"
    r"(?:\((?P<paren>[^)]*)\)|(?P<plain>[^\n#\\()]*?))[ \t]*(?P<comment>#[^\n\r]*)?(?=\r?$)",
    re.M,
)
RELATIVE_FROM = re.compile(
    r"^(?P<ind>[ \t]*)from[ \t]+(?P<dots>\.+)(?P<mod>[A-Za-z_][\w.]*)?(?P<gap>[ \t]+)import\b", re.M
)
RELATIVE_IMPORT = re.compile(
    r"^(?P<ind>[ \t]*)from[ \t]+(?P<dots>\.+)(?P<mod>[A-Za-z_][\w.]*)?[ \t]+import[ \t]+(?P<at>)"
    r"(?:\((?P<paren>[^)]*)\)|(?P<plain>[^\n#\\()]*?))[ \t]*(?P<comment>#[^\n\r]*)?(?=\r?$)",
    re.M,
)
PLAIN_IMPORT = re.compile(
    r"^(?P<ind>[ \t]*)import[ \t]+(?P<body>[A-Za-z_][\w.]*[^\n#;\\]*?)(?P<gap>[ \t]*)(?=#|;|\r?$)", re.M
)
DYNAMIC_IMPORT = re.compile(r"""(\b(?:import_module|__import__|find_spec)\s*\(\s*)(['"])([A-Za-z_][\w.]*)\2""")
DOTTED = re.compile(r"(?<![\w.\\/-])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)(?![\w])")
SLASHED = re.compile(r"(?<![\w./\\-])([A-Za-z_]\w*(?:/[\w.\-]+)+)")


class PythonRewriter:
    def __init__(self, cfg: Config, plan: Plan, index: ModuleIndex):
        self.cfg, self.plan, self.index = cfg, plan, index
        old_group, new_group = cfg.entry_point_group
        self._group = re.compile(r"(?<=['\"`])" + re.escape(old_group) + r"(?=['\"`])")
        self._new_group = new_group
        self._symbols = sorted(cfg.symbol_moves, key=len, reverse=True)
        self._paths: set[str] = set()
        for f in list(plan.files) + list(plan.resolve.values()):
            parts = f.split("/")
            for i in range(1, len(parts) + 1):
                self._paths.add("/".join(parts[:i]))

    # entry points -------------------------------------------------------------------
    def entry_group(self, text: str) -> str:
        return self._group.sub(self._new_group, text)

    # relative imports ---------------------------------------------------------------
    @staticmethod
    def _package(module: tuple[str, bool]) -> list[str]:
        name, is_package = module
        parts = name.split(".")
        return parts if is_package else parts[:-1]

    @staticmethod
    def _resolve_relative(package: list[str], dots: int, mod: str | None) -> str | None:
        up = dots - 1
        if up > len(package) or (not package and up >= 0 and dots > 1):
            return None
        base = package[: len(package) - up]
        parts = base + (mod.split(".") if mod else [])
        return ".".join(parts) if parts else None

    def relative_imports(self, text: str, cur: str, new: str) -> str:
        old_mod, new_mod = module_of(cur, self.index.roots), module_of(new, self.index.roots)
        if not old_mod or not new_mod:
            return text
        old_pkg, new_pkg = self._package(old_mod), self._package(new_mod)

        def away(m: re.Match[str]) -> str:
            """``from . import notes`` where notes.py now lives in another package: write the
            statement with the old absolute module and let ``from_imports`` split and rename it."""
            target_old = self._resolve_relative(old_pkg, len(m.group("dots")), m.group("mod"))
            body = m.group("paren") if m.group("paren") is not None else m.group("plain")
            items = parse_items(body) if body is not None else None
            if target_old is None or not items or any(i.name == "*" for i in items):
                return m.group(0)
            target_new = self.index.rename_module(target_old)
            for item in items:
                child = f"{target_old}.{item.name}"
                if child in self.index.known and self.index.rename_module(child) != f"{target_new}.{item.name}":
                    return f"{m.group('ind')}from {target_old} import {m.group(0)[m.start('at') - m.start():]}"
            return m.group(0)

        text = RELATIVE_IMPORT.sub(away, text)

        def sub(m: re.Match[str]) -> str:
            dots, mod = len(m.group("dots")), m.group("mod")
            target_old = self._resolve_relative(old_pkg, dots, mod)
            if target_old is None:
                return m.group(0)
            target_new = self.index.rename_module(target_old)
            if self._resolve_relative(new_pkg, dots, mod) == target_new:
                return m.group(0)
            return f"{m.group('ind')}from {target_new}{m.group('gap')}import"

        return RELATIVE_FROM.sub(sub, text)

    # import statements --------------------------------------------------------------
    def _destination(self, old_module: str, new_module: str, name: str) -> tuple[str, str] | None:
        key = f"{new_module}.{name}"
        if key in self.cfg.symbol_moves:
            module, _, last = self.cfg.symbol_moves[key].rpartition(".")
            return module, last
        old_child = f"{old_module}.{name}"
        if old_child in self.index.known:
            renamed = self.index.rename_module(old_child)
            if renamed != key:
                module, _, last = renamed.rpartition(".")
                return module, last
        return None

    def from_imports(self, text: str) -> str:
        newline = "\r\n" if "\r\n" in text else "\n"

        def sub(m: re.Match[str]) -> str:
            old_module = m.group("mod")
            new_module = self.index.rename_module(old_module)
            body = m.group("paren") if m.group("paren") is not None else m.group("plain")
            items = parse_items(body) if body is not None else None
            moved: list[tuple[Item, str, str]] = []
            if items and not any(i.name == "*" for i in items):
                for item in items:
                    dest = self._destination(old_module, new_module, item.name)
                    if dest:
                        moved.append((item, *dest))
            if not moved:
                if new_module == old_module:
                    return m.group(0)
                start, end = m.span("mod")
                s = m.start()
                return m.group(0)[: start - s] + new_module + m.group(0)[end - s:]
            indent = m.group("ind")
            moved_items = {id(item) for item, _, _ in moved}
            kept = [i for i in items if id(i) not in moved_items]
            grouped: dict[str, list[Item]] = {}
            for item, module, last in moved:
                alias = item.alias or (item.name if last != item.name else None)
                grouped.setdefault(module, []).append(Item(last, alias, item.comment))
            trailing = f"  {m.group('comment')}" if m.group("comment") else ""
            lines: list[str] = []
            if kept:
                lines.append(emit_from(indent, new_module, kept, trailing))
                trailing = ""
            for module, group in grouped.items():
                lines.append(emit_from(indent, module, group, trailing))
                trailing = ""
            return "\n".join(lines).replace("\n", newline)

        return FROM_IMPORT.sub(sub, text)

    def plain_imports(self, text: str) -> str:
        def sub(m: re.Match[str]) -> str:
            changed = False
            out: list[str] = []
            for chunk in m.group("body").split(","):
                im = re.match(r"^(\s*)([A-Za-z_][\w.]*)(.*)$", chunk, re.S)
                if not im:
                    out.append(chunk)
                    continue
                new = self.index.rename_module(im.group(2))
                changed |= new != im.group(2)
                out.append(f"{im.group(1)}{new}{im.group(3)}")
            if not changed:
                return m.group(0)
            return f"{m.group('ind')}import {','.join(out)}{m.group('gap')}"

        return PLAIN_IMPORT.sub(sub, text)

    def dynamic_imports(self, text: str) -> str:
        def sub(m: re.Match[str]) -> str:
            new = self.index.rename_module(m.group(3))
            return f"{m.group(1)}{m.group(2)}{new}{m.group(2)}"

        return DYNAMIC_IMPORT.sub(sub, text)

    # dotted names in code, strings and prose ------------------------------------------
    def dotted_names(self, text: str) -> str:
        def sub(m: re.Match[str]) -> str:
            token = m.group(1)
            before = text[m.start() - 1] if m.start() else ""
            after = text[m.end()] if m.end() < len(text) else ""
            if after in "-/":
                return token
            in_string = before in "'\""
            renamed = self.index.rename_token(token, in_string) or token
            if in_string:
                renamed = self._symbol_string(renamed)
            return renamed

        return DOTTED.sub(sub, text)

    def _symbol_string(self, token: str) -> str:
        for key in self._symbols:
            if token == key or token.startswith(key + "."):
                if self._is_shared(key):
                    return token  # reported by ``leftovers``: patch it where it is used
                return self.cfg.symbol_moves[key] + token[len(key):]
        return token

    def _is_shared(self, key: str) -> bool:
        return self.cfg.symbol_moves[key].rpartition(".")[0] in self.cfg.shared_helper_modules

    def slash_paths(self, text: str) -> str:
        def sub(m: re.Match[str]) -> str:
            token = m.group(1)
            core = token.rstrip(".-")
            trail = token[len(core):]
            comps = core.split("/")
            lead: list[str] = []
            for c in comps:
                base = c[:-3] if c.endswith(".py") else c
                if not IDENT.fullmatch(base):
                    break
                lead.append(base)
                if c.endswith(".py"):
                    break
            if not lead or self.index.match(lead) is None:
                return token
            if not any(f"{root}/{core}" in self._paths for root in self.index.roots):
                return token
            renamed = self.index.rename_module(".".join(lead)).split(".")
            suffix = ".py" if comps[len(lead) - 1].endswith(".py") else ""
            tail = comps[len(lead):]
            return "/".join(renamed) + suffix + ("/" + "/".join(tail) if tail else "") + trail

        return SLASHED.sub(sub, text)

    def rewrite(self, text: str, cur: str, new: str) -> str:
        text = self.entry_group(text)
        text = self.relative_imports(text, cur, new)
        text = self.from_imports(text)
        text = self.plain_imports(text)
        text = self.dynamic_imports(text)
        text = self.dotted_names(text)
        text = self.slash_paths(text)
        return text

    # attribute-style uses of moved symbols can not be rewritten safely --------------------
    def leftovers(self, text: str) -> list[str]:
        found: list[str] = []
        for key, home in self.cfg.symbol_moves.items():
            module, _, name = key.rpartition(".")
            alias = module.rpartition(".")[2]
            attr = re.search(rf"(?<![\w.]){re.escape(alias)}\.{re.escape(name)}\b", text)
            full = re.search(rf"(?<![\w.'\"]){re.escape(key)}\b", text)
            if attr or full:
                found.append(f"{name} now lives in {home}")
            if self._is_shared(key):
                for target in sorted(set(re.findall(rf"(?<=['\"])({re.escape(key)}(?:\.\w+)*)(?=['\"])", text))):
                    found.append(
                        f'patch target "{target}" was not rewritten: {name} now lives in {home} and '
                        "is imported by name into the modules that use it, so patch it where it is used"
                    )
        return found


# ------------------------------------------------------------------------- pyproject.toml

_SECTION = re.compile(r"^\s*\[+\s*([^\]]+?)\s*\]+\s*(?:#.*)?$")
_ENTRY_VALUE = re.compile(r"""^(?P<head>\s*[\w."'\-]+\s*=\s*)(?P<q>["'])(?P<mod>[A-Za-z_][\w.]*)(?P<rest>(?::[^"']*)?)(?P=q)""")


def rewrite_pyproject(text: str, py: PythonRewriter) -> str:
    text = py.entry_group(text)
    out: list[str] = []
    in_entry_section = False
    for line in text.split("\n"):
        section = _SECTION.match(line)
        if section:
            name = section.group(1)
            in_entry_section = name.startswith("project.entry-points") or name in (
                "project.scripts", "project.gui-scripts")
        elif in_entry_section:
            m = _ENTRY_VALUE.match(line)
            if m:
                new = py.index.rename_module(m.group("mod"))
                if new != m.group("mod"):
                    line = (
                        m.group("head") + m.group("q") + new + m.group("rest") + m.group("q")
                        + line[m.end():]
                    )
        out.append(line)
    return "\n".join(out)


# --------------------------------------------------------------------------- TypeScript

PROBE_EXTS = (".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")
INDEX_EXTS = (".ts", ".tsx", ".js", ".jsx")
TS_SPEC = re.compile(
    r"""(?P<pre>\bfrom\s*|\bimport\s*\(?\s*"""
    r"""|\b(?:vi|jest)\.(?:mock|doMock|unmock|doUnmock|importActual|importMock|requireActual|requireMock)\s*\(\s*"""
    r"""|\brequire(?:\.resolve)?\s*\(\s*)(?P<q>['"])(?P<spec>[^'"\n]+)(?P=q)"""
)


def strip_ts_ext(path: str) -> str:
    for ext in (".d.ts",) + TS_SUFFIXES:
        if path.endswith(ext):
            return path[: -len(ext)]
    return path


class TsRewriter:
    def __init__(self, cfg: Config, plan: Plan):
        self.cfg, self.plan = cfg, plan
        self.files = set(plan.files)
        self.frontend_roots = tuple(
            sorted({posixpath.dirname(d) for d in (*cfg.ts_aliases_old, *cfg.ts_aliases_new)})
        )
        prefixes = {*cfg.ts_aliases_old.values(), *cfg.ts_aliases_new.values()}
        self.alias_prefixes = sorted(prefixes, key=len, reverse=True)
        self.new_aliases = sorted(cfg.ts_aliases_new.items(), key=lambda kv: -len(kv[0]))
        old_only = [d for d in cfg.ts_aliases_old if d not in cfg.ts_aliases_new]
        new_only = [d for d in cfg.ts_aliases_new if d not in cfg.ts_aliases_old]
        has = lambda dirs: any(f.startswith(d + "/") for d in dirs for f in plan.files)  # noqa: E731
        self.new_first = has(new_only) and not has(old_only)
        self.unresolved: list[str] = []

    def handles(self, path: str) -> bool:
        return path.endswith(TS_SUFFIXES) and path.startswith(tuple(r + "/" for r in self.frontend_roots))

    def _probe(self, base: str) -> tuple[str, str, str] | None:
        for ext in PROBE_EXTS:
            if base + ext in self.files:
                return base + ext, "ext", ext
        if base in self.files:
            return base, "exact", ""
        for ext in INDEX_EXTS:
            if f"{base}/index{ext}" in self.files:
                return f"{base}/index{ext}", "index", ext
        return None

    def _alias_candidates(self, spec: str) -> list[str]:
        tables = [self.cfg.ts_aliases_old, self.cfg.ts_aliases_new]
        if self.new_first:
            tables.reverse()
        out: list[str] = []
        for table in tables:
            for directory, prefix in table.items():
                if spec.startswith(prefix):
                    cand = f"{directory}/{spec[len(prefix):]}".rstrip("/")
                    if cand not in out:
                        out.append(cand)
        return out

    def _target_final(self, target: str) -> str:
        if target in self.plan.resolve:
            return self.plan.resolve[target]
        return self.plan.final_path(target)[0]

    def convert(self, spec: str, cur_dir: str, new_dir: str) -> str | None:
        relative = spec.startswith(("./", "../"))
        if relative:
            base = posixpath.normpath(posixpath.join(cur_dir, spec))
            if base.startswith(".."):
                return None
            candidates = [base]
        else:
            if not spec.startswith(tuple(self.alias_prefixes)):
                return None
            candidates = self._alias_candidates(spec)
            if not candidates:
                return None
        hit = None
        for cand in candidates:
            hit = self._probe(cand)
            if hit:
                break
        if hit:
            target, kind, ext = hit
        else:
            target, kind, ext = candidates[0], "none", ""
            if not relative:
                self.unresolved.append(spec)
        final = self._target_final(target)
        if kind == "ext":
            tail = final[: -len(ext)] if final.endswith(ext) else strip_ts_ext(final)
        elif kind == "index":
            tail = posixpath.dirname(final) if posixpath.basename(final).startswith("index.") else strip_ts_ext(final)
        else:
            tail = final
        if relative and posixpath.normpath(posixpath.join(new_dir, spec)) == tail:
            return None
        for directory, prefix in self.new_aliases:
            if tail.startswith(directory + "/"):
                new_spec = prefix + tail[len(directory) + 1:]
                return None if new_spec == spec else new_spec
        rel = posixpath.relpath(tail, new_dir or ".")
        new_spec = rel if rel.startswith(".") else "./" + rel
        return None if new_spec == spec else new_spec

    def rewrite(self, text: str, cur: str, new: str) -> str:
        cur_dir, new_dir = posixpath.dirname(cur), posixpath.dirname(new)

        def sub(m: re.Match[str]) -> str:
            spec = self.convert(m.group("spec"), cur_dir, new_dir)
            if spec is None:
                return m.group(0)
            q = m.group("q")
            return f"{m.group('pre')}{q}{spec}{q}"

        return TS_SPEC.sub(sub, text)


# ------------------------------------------------------------------------ module exports

_COMMENTS = re.compile(r"/\*.*?\*/|(?<![:\"'`\\])//[^\n]*", re.S)
_EXPORT_DECL = re.compile(
    r"^[ \t]*export[ \t]+(?:declare[ \t]+)?(?:abstract[ \t]+)?(?:async[ \t]+)?"
    r"(?:function\*?|const|let|var|class|enum|interface|type)[ \t]+([A-Za-z_$][\w$]*)", re.M
)
_EXPORT_LIST = re.compile(r"^[ \t]*export[ \t]+(?:type[ \t]+)?\{([^}]*)\}", re.M)
_EXPORT_DEFAULT = re.compile(r"^[ \t]*export[ \t]+default\b", re.M)
_EXPORT_STAR = re.compile(r"^[ \t]*export[ \t]+\*(?:[ \t]+as[ \t]+([A-Za-z_$][\w$]*))?[ \t]+from\b", re.M)


def exports_of(text: str) -> set[str]:
    """Names a TypeScript/JavaScript module exports (``default`` for the default export)."""
    text = _COMMENTS.sub("", text)
    names = set(_EXPORT_DECL.findall(text))
    if _EXPORT_DEFAULT.search(text):
        names.add("default")
    for body in _EXPORT_LIST.findall(text):
        for item in body.split(","):
            item = re.sub(r"^\s*type\s+", "", item.strip())
            if item:
                names.add(re.split(r"\s+as\s+", item)[-1].strip())
    for alias in _EXPORT_STAR.findall(text):
        names.add(alias or "*")
    return names


# ------------------------------------------------------------------------------ env text

ENV_NAMES = (".toml", ".json", ".yml", ".yaml", ".sh")


def is_env_text(path: str) -> bool:
    name = posixpath.basename(path)
    if name in ("package-lock.json", "uv.lock"):
        return False
    return name.endswith(ENV_NAMES) or name == "Makefile" or name.startswith("Dockerfile") or name == ".env.example"


OLD_SETTING = re.compile(r"(?<![A-Za-z0-9_])(?:NEXT_PUBLIC_)?OPEN_NOTEBOOK_[A-Z0-9_]+")


def env_rewriter(renames: dict[str, str]) -> Callable[[str], str] | None:
    """Whole-word rewriter for the setting names, or None when there is nothing to rename.

    A name right after ``-${`` is left alone: that is the old name as the fallback in a
    converted file's ``${NEW:-${OLD:-default}}`` (compose reads the new name, then the old
    one), and renaming it would turn the fallback into a second copy of the new name.
    """
    if not renames:
        return None
    pattern = re.compile(
        r"(?<![A-Za-z0-9_])(?<!-\$\{)(" + "|".join(re.escape(k) for k in sorted(renames, key=len, reverse=True)) + r")(?![A-Za-z0-9_])"
    )
    return lambda text: pattern.sub(lambda m: renames[m.group(1)], text)


def identifier_rewriter(renames: dict[str, str]) -> Callable[[str], str] | None:
    """Whole-word rewriter for renamed identifiers (``$`` counts as a word character for TS), or None."""
    if not renames:
        return None
    pattern = re.compile(r"(?<![\w$])(" + "|".join(re.escape(k) for k in sorted(renames, key=len, reverse=True)) + r")(?![\w$])")
    return lambda text: pattern.sub(lambda m: renames[m.group(1)], text)


# ------------------------------------------------------------------------------- the run


def read_text(path: Path) -> str | None:
    try:
        return path.read_bytes().decode("utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def merge_theirs(current: str, base: str, other: str) -> str | None:
    """``current`` plus the changes from ``base`` to ``other`` (``git merge-file``); a hunk both
    sides touched takes ``other``. None when git can not do it."""
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for name, text in (("current", current), ("base", base), ("other", other)):
            path = Path(tmp) / name
            path.write_bytes(text.encode("utf-8"))
            paths.append(str(path))
        done = subprocess.run(["git", "merge-file", "-p", "--theirs", *paths], capture_output=True)
    if done.returncode > 127:  # a negative exit status is an error, a small positive one counts conflicts
        return None
    try:
        return done.stdout.decode("utf-8")
    except UnicodeDecodeError:
        return None


def mkdirs(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def run(root: Path | str, cfg: Config | None = None, *, check: bool = False, no_moves: bool = False,
        allow_dirty: bool = False, verbose: bool = False, since: str | None = None,
        out: Callable[[str], None] = print) -> int:
    root = Path(root)
    cfg = cfg or Config.from_moves()
    try:
        cfg.validate()
    except ValueError as exc:
        out(f"error: {exc}")
        return 2
    try:
        if not check and not allow_dirty and is_dirty(root):
            out("error: the working tree has uncommitted changes to tracked files.")
            out("Commit or stash them first (the codemod rewrites files in place), or pass --allow-dirty.")
            return 2
        files, tracked = inventory(root)
        only, base = None, ""
        if since:
            only, base = changed_since(root, since, files, tracked)
            out(f"note: --since {since}: only the {len(only)} files this branch changed since {base[:8]} are converted")
    except GitError as exc:
        out(f"error: {exc}")
        return 2

    plan = Plan(cfg, files, tracked).build(root, no_moves, only)
    # A tracked path that the disk spells differently (case-insensitive disk, index spelled My-ai-quiz/...
    # but the directory is my-ai-quiz/ now): usually an undone or interrupted run, see check_spellings.
    spelling_notes = check_spellings(root, plan, tracked)
    index = ModuleIndex(cfg, plan)
    # modules of our own packages as the merged tree will have them: the restructure's (--since) plus
    # the converted files, or just the converted tree
    vanished = vanished_in(root, since, base, only, plan) if since and only is not None else {}
    # the converted files the merge will not keep (a split file the branch edited) make no module
    final_paths = {
        plan.resolve.get(f, f) for f in (only if only is not None else files)
        if f not in vanished and f not in plan.stays
    }
    ref_files: set[str] = set()
    base_files: set[str] = set()
    if only is not None:
        ref_files = set(git_list(root, "ls-tree", "-r", "--name-only", since))
        base_files = set(git_list(root, "ls-tree", "-r", "--name-only", base))
        final_paths |= ref_files
    final_modules = module_set(final_paths, index.roots)
    for home in cfg.symbol_moves.values():  # made by hand, the table only says where names go
        parts = home.split(".")[:-1]
        final_modules.update(".".join(parts[:i]) for i in range(1, len(parts) + 1))
    own_tops = {m.split(".")[0] for m in module_set(
        (p for p in final_paths if any(p.startswith(r + "/") for r in cfg.py_roots_new)), tuple(cfg.py_roots_new))}
    py = PythonRewriter(cfg, plan, index)
    ts = TsRewriter(cfg, plan)
    env = env_rewriter(cfg.env_renames)
    ident = identifier_rewriter(cfg.identifier_renames)
    verb = "would change" if check else "changed"

    # --- text rewrites, computed against the old locations before anything moves -------
    changes: dict[str, tuple[str, str]] = {}  # new path -> (old path, new text)
    hand: list[str] = []
    old_dirs = sorted(_vanishing_top_dirs(cfg))
    mention = re.compile(r"(?<![\w./-])(" + "|".join(re.escape(d) for d in old_dirs) + r")(?![\w-])") if old_dirs else None
    for f in files:
        if f in plan.drops or f in plan.stays or (only is not None and f not in only):
            continue
        new = plan.resolve.get(f, f)
        name = posixpath.basename(f)
        is_py, is_ts, is_text = f.endswith(".py"), ts.handles(f), is_env_text(f)
        is_pyproject = name == "pyproject.toml"
        is_script = f.endswith(TS_SUFFIXES)
        if not (is_py or is_ts or is_pyproject or is_text or (is_script and ident is not None)):
            continue
        if (root / f).is_symlink():
            continue
        before = read_text(root / f)
        if before is None:
            out(f"warning: {f} is not UTF-8, skipped")
            continue
        # The restructure already has this file (its lines win in the merge): convert only what the
        # branch changed. Rewriting the lines it did not touch makes conflicts with the restructure's
        # own edits of those lines (a docstring next to a rebranded one) that the branch did not cause.
        held = only is not None and new in ref_files

        def convert(text: str) -> tuple[str, list[str]]:
            reports: list[str] = []
            if is_py:
                text = py.rewrite(text, f, new)
                reports += [f"{new}: {line}" for line in py.leftovers(text)]
            if is_pyproject:
                text = rewrite_pyproject(text, py)
            if is_ts:
                text = ts.rewrite(text, f, new)
            # a compose file reads the new name with the old one as its fallback, which a plain
            # rename would not write: the restructure's lines are the ones to keep
            if env is not None and is_text and not held:
                text = env(text)
            if ident is not None and (is_py or is_script):
                text = ident(text)
            return text, reports

        after, reports = convert(before)
        was_there = held and f in base_files
        old_text = git(root, "show", f"{base}:{f}", check=False) if was_there else ""
        old_after, old_reports = convert(old_text) if was_there else ("", [])
        # what the file's version at the split already had is the restructure's to fix
        hand += [line for line in reports if line not in old_reports]
        if is_py:
            hand += [
                f"{new}: imports {name}, which does not exist in the converted layout "
                "(a module the restructure split or removed?)"
                for name in missing_imports(after, final_modules, own_tops)
                if name not in missing_imports(old_after, final_modules, own_tops)
            ]
        if held and env is not None and is_text:
            introduced = sorted(set(OLD_SETTING.findall(after)) - set(OLD_SETTING.findall(old_text)))
            if introduced:
                hand.append(
                    f"{new}: your lines name {', '.join(introduced)}: the restructure reads settings as "
                    "LSP_SIET_* (compose files: ${LSP_SIET_X:-${OPEN_NOTEBOOK_X:-default}}); the old names "
                    "still work, rename them when you resolve the merge"
                )
        shown = after
        if was_there and old_text != before:
            merged = merge_theirs(old_text, old_after, after)
            if merged is not None:
                after = merged
        if after != before:
            changes[new] = (f, after)
        if mention:
            seen = Counter(mention.findall(shown)) - Counter(mention.findall(old_after))
            if seen:
                hand.append(f"{new}: still mentions {'/'.join(sorted(seen))} ({sum(seen.values())}x)")

    # --- report -----------------------------------------------------------------------------
    per_rule: dict[tuple[str, str], int] = defaultdict(int)
    for src in plan.moves:
        per_rule[plan.first_rule.get(src, ("?", "?"))] += 1
    for rule, count in sorted(per_rule.items()):
        out(f"move {count:5d} files: {rule[0]} -> {rule[1]}")
    if verbose:
        for src, dst in sorted(plan.moves.items()):
            out(f"  {src} -> {dst}")
    for c in plan.collisions:
        same = []
        for loser in c.losers:
            a, b = read_text(root / c.winner), read_text(root / loser)
            c.same_content[loser] = a is not None and a == b
            hint = f"git show HEAD:{loser}" if loser in tracked else f"saved as {c.dst}{ASIDE_SUFFIX}"
            if c.by_default and not c.same_content[loser]:
                hint = f"merge by hand: {hint}"
            same.append(f"{loser} ({'identical' if c.same_content[loser] else 'different'}; {hint})")
        where = f" [decided at {c.meeting}]" if c.meeting and c.meeting != c.dst else ""
        out(f"collision: {c.dst}: kept {c.winner}, dropped {'; '.join(same)}{where}")
        if c.winner.endswith(TS_SUFFIXES):
            kept_exports = exports_of(read_text(root / c.winner) or "")
            for loser in c.losers:
                if loser.endswith(TS_SUFFIXES):
                    # `export *` (a replaced-module shim) names nothing that could be missing
                    extra = sorted(exports_of(read_text(root / loser) or "") - kept_exports - {"*"})
                    if extra:
                        hand.append(
                            f"{c.dst}: dropped {loser} exports {', '.join(extra)} that the kept {c.winner} lacks"
                        )
    for message in plan.conflicts:
        out(f"conflict: {message}")
    hand += list(plan.stays.values())
    if since and only is not None:
        hand += list(vanished.values())
    for message in index.conflicts:
        out(f"warning: {message}")
    for new in sorted(changes):
        out(f"{verb}: {new}")
    for line in sorted(set(hand)):
        out(f"check by hand: {line}")
    if ts.unresolved:
        out(f"note: {len(set(ts.unresolved))} alias specifier(s) did not resolve to a file (kept by prefix)")
    for line in spelling_notes:
        out(line)
    dir_renames = case_renames(root, {posixpath.dirname(dst) for dst in plan.moves.values()})
    for disk, wanted in dir_renames:
        out(f"note: {disk} is spelled {wanted} in the new layout (case-insensitive disk): "
            f"{'would be ' if check else ''}renamed in two steps")
    ignored_left = _ignored_under_old_paths(root, cfg)
    for rel in ignored_left:
        out(f"note: ignored, not moved: {rel}")
    pending = bool(plan.moves or plan.drops or changes or plan.conflicts)
    out(
        f"summary: {len(plan.moves)} files to move, {len(plan.collisions)} collisions, "
        f"{len(changes)} files rewritten, {len(plan.conflicts)} conflicts"
        + ("" if pending else " (nothing to do)")
    )
    if check:
        return 1 if pending else 0

    # --- apply ------------------------------------------------------------------------------
    try:
        _apply(root, plan, tracked, changes, dir_renames)
    except (GitError, OSError) as exc:
        out(f"error: {exc}")
        out("The tree may be half converted. Running the codemod again finishes the job; "
            "`git reset --hard` (and removing untracked files) undoes it.")
        return 2
    return 1 if plan.conflicts else 0


CACHE_NAMES = {"__pycache__", ".pytest_cache", ".ruff_cache", ".mypy_cache", ".turbo", ".DS_Store"}


def _ignored_under_old_paths(root: Path, cfg: Config) -> list[str]:
    """Ignored local directories/files below old paths (node_modules, data dirs ...), without caches."""
    try:
        listed = git_list(root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory")
    except GitError:
        return []
    olds = tuple(old for old, _ in cfg.moves)
    kept: list[str] = []
    for rel in sorted(listed):
        bare = rel.rstrip("/")
        if not (bare in olds or bare.startswith(tuple(o + "/" for o in olds))):
            continue
        if CACHE_NAMES.intersection(bare.split("/")) or bare.endswith((".egg-info", ".tsbuildinfo")):
            continue
        if any(rel.startswith(k) for k in kept if k.endswith("/")):
            continue
        kept.append(rel)
    return kept


def _apply(root: Path, plan: Plan, tracked: set[str], changes: dict[str, tuple[str, str]],
           renames: list[tuple[str, str]] | None = None) -> None:
    # 0. a destination directory that exists under another spelling gets the table's spelling
    _rename_dirs(root, renames or [])
    # 1. losers of a collision
    for loser, dst in plan.drops.items():
        if loser in tracked:
            git(root, "rm", "-q", "-f", "--", loser)
        else:
            aside = root / (dst + ASIDE_SUFFIX)
            mkdirs(aside.parent)
            os.replace(root / loser, aside)
    # 2. moves: tracked files through git mv, grouped by directory pair
    groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    singles: list[tuple[str, str]] = []
    plain: list[tuple[str, str]] = []
    for src, dst in sorted(plan.moves.items()):
        if src not in tracked:
            plain.append((src, dst))
        elif posixpath.basename(src) == posixpath.basename(dst):
            groups[(posixpath.dirname(src), posixpath.dirname(dst))].append(src)
        else:
            singles.append((src, dst))
    for (_, dst_dir), srcs in groups.items():
        mkdirs(root / dst_dir if dst_dir else root)
        for i in range(0, len(srcs), 100):
            git(root, "mv", "--", *srcs[i:i + 100], dst_dir + "/" if dst_dir else ".")
    for src, dst in singles:
        mkdirs((root / dst).parent)
        git(root, "mv", "--", src, dst)
    for src, dst in plain:
        mkdirs((root / dst).parent)
        os.replace(root / src, root / dst)
    # 3. empty directories the moves left behind
    dirs = {posixpath.dirname(s) for s in [*plan.moves, *plan.drops]}
    for d in sorted(dirs, key=lambda p: -p.count("/")):
        parts = d.split("/") if d else []
        while parts:
            try:
                (root / "/".join(parts)).rmdir()
            except OSError:
                break
            parts.pop()
    # 4. text
    for new, (_, text) in changes.items():
        (root / new).write_bytes(text.encode("utf-8"))
    # 5. a new (untracked) file moved below a directory that was spelled differently: `git add` would
    #    give it the directory case the index already has (My-ai-quiz/...) on a case-insensitive disk,
    #    so the merge would look clean but track the file under the old spelling. Stage it now with
    #    the spelling of the table; everything else the codemod moved stays as git mv left it.
    wanted = [w for _, w in renames or []]
    spelled = [dst for _, dst in plain if any(dst.startswith(w + "/") for w in wanted)]
    for i in range(0, len(spelled), 100):
        git(root, "-c", "core.ignorecase=false", "add", "--", *spelled[i:i + 100])


# ------------------------------------------------------------------------------------ CLI


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Move files and rewrite references to the LSP-SIET layout.",
        epilog="Exit: --check 1 = changes pending, 0 = converted; 2 = refused or failed.",
    )
    parser.add_argument("--check", action="store_true", help="report what would change, write nothing")
    parser.add_argument("--no-moves", action="store_true", help="skip step 1: rewrite text in place")
    parser.add_argument("--allow-dirty", action="store_true", help="run although tracked files have uncommitted changes")
    parser.add_argument("--since", metavar="REF", help="convert only the files this branch changed since it "
                        "split from REF (default: every file); the merge of REF handles the rest")
    parser.add_argument("--root", help="repository to convert (default: the git root of the current directory)")
    parser.add_argument("-v", "--verbose", action="store_true", help="list every single move")
    args = parser.parse_args(argv)
    root = repo_root(Path(args.root).resolve() if args.root else Path.cwd())
    if root is None:
        print("error: not inside a git repository", file=sys.stderr)
        return 2
    return run(root, check=args.check, no_moves=args.no_moves, allow_dirty=args.allow_dirty,
               verbose=args.verbose, since=args.since)


if __name__ == "__main__":
    sys.exit(main())
