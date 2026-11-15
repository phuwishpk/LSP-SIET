"""Tests for codemod.py. Every test builds a throw-away git repository in tmp_path.

    python -m pytest scripts/lsp-siet/test_codemod.py -q
"""

from __future__ import annotations

import dataclasses
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

sys.dont_write_bytecode = True  # keep scripts/lsp-siet/ free of .pyc files

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import codemod  # noqa: E402
import moves  # noqa: E402


# --------------------------------------------------------------------------- helpers


def git(root: Path, *args: str) -> str:
    done = subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True)
    return done.stdout


def dedent(text: str) -> str:
    return textwrap.dedent(text).lstrip("\n")


def write(root: Path, rel: str, content: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def make_repo(root: Path, tracked: dict[str, str], untracked: dict[str, str] | None = None,
              gitignore: str | None = None, ignored: dict[str, str] | None = None) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    git(root, "init", "-q")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    git(root, "config", "commit.gpgsign", "false")
    if gitignore is not None:
        write(root, ".gitignore", gitignore)
    for rel, content in tracked.items():
        write(root, rel, content)
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "initial")
    for rel, content in (untracked or {}).items():
        write(root, rel, content)
    for rel, content in (ignored or {}).items():
        write(root, rel, content)
    return root


def config(**overrides) -> codemod.Config:
    base = codemod.Config.from_moves()
    extra = overrides.pop("extra_moves", ())
    if extra:
        overrides["moves"] = base.moves + tuple(extra)
    return dataclasses.replace(base, **overrides)


def apply(root: Path, cfg: codemod.Config | None = None, **kwargs):
    lines: list[str] = []
    code = codemod.run(root, cfg or codemod.Config.from_moves(), out=lines.append, **kwargs)
    return code, lines


def cli(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HERE / "codemod.py"), *args],
        cwd=root, capture_output=True, text=True,
    )


def read(root: Path, rel: str) -> str:
    return (root / rel).read_text(encoding="utf-8")


def tracked(root: Path) -> set[str]:
    return set(git(root, "ls-files").split("\n")) - {""}


def snapshot(root: Path) -> dict[str, str]:
    return {
        str(p.relative_to(root)): p.read_text(encoding="utf-8", errors="replace")
        for p in sorted(root.rglob("*"))
        if p.is_file() and ".git" not in p.relative_to(root).parts
    }


# ------------------------------------------------------------------ the brief's tests


def test_moves_python_package_and_rewrites_imports(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
        "siet-platform/siet_platform/__init__.py": "",
        "siet-platform/siet_platform/b.py": "from open_notebook.a import x\n\nprint(x)\n",
    })
    code, _ = apply(root)
    assert code == 0
    assert (root / "platform/siet_core/a.py").read_text() == "x = 1\n"
    assert read(root, "platform/siet_platform/b.py") == "from siet_core.a import x\n\nprint(x)\n"
    assert not (root / "open-notebook").exists()
    assert not (root / "siet-platform").exists()
    # moved through git: the index knows the new paths and no longer the old ones
    assert {"platform/siet_core/a.py", "platform/siet_platform/b.py"} <= tracked(root)
    assert not any(p.startswith(("open-notebook/", "siet-platform/")) for p in tracked(root))


def test_patch_strings_rewritten(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
        "open-notebook/open_notebook/domain/__init__.py": "",
        "open-notebook/open_notebook/domain/notebook.py": "class Notebook: ...\n",
        "open-notebook/tests/test_a.py": dedent('''
            import importlib
            from unittest import mock

            def test_a(monkeypatch):
                with mock.patch("open_notebook.a.x"):
                    pass
                with mock.patch("open_notebook.domain.notebook.Notebook.get") as m:
                    pass
                monkeypatch.setattr("open_notebook.a.x", 2)
                importlib.import_module("open_notebook.domain.notebook")
                importlib.import_module("open_notebook")
        '''),
    })
    apply(root)
    text = read(root, "platform/tests/test_a.py")
    assert 'mock.patch("siet_core.a.x")' in text
    assert 'mock.patch("siet_core.domain.notebook.Notebook.get")' in text
    assert 'monkeypatch.setattr("siet_core.a.x", 2)' in text
    assert 'importlib.import_module("siet_core.domain.notebook")' in text
    assert 'importlib.import_module("siet_core")' in text
    assert "open_notebook" not in text


def test_ts_alias_rewrite(tmp_path):
    root = make_repo(tmp_path / "r", {
        "siet-platform/frontend/src/lib/roles.ts": "export const ROLES = []\n",
        "open-notebook/frontend/src/lib/utils.ts": "export const cn = () => ''\n",
        "kmitl-rag/frontend/src/lib/pick.ts": "export const pick = 1\n",
        "community/frontend/src/components/Card.tsx": dedent("""
            import { ROLES } from '@siet/platform/lib/roles'
            import { cn } from '@/lib/utils'
            import { pick } from '@siet/kmitl-rag/lib/pick'
            import type { Role } from "@siet/platform/lib/roles"
            export { ROLES as R } from '@siet/platform/lib/roles'
            const lazy = () => import('@siet/platform/lib/roles')
            vi.mock('@siet/platform/lib/roles', () => ({ ROLES: [] }))
            jest.mock('@/lib/utils')
            const r = require('@siet/platform/lib/roles')
            import '@siet/platform/lib/roles'
            import { other } from '@shared/navbar'
            import React from 'react'
        """),
    })
    apply(root)
    text = read(root, "community/frontend/src/components/Card.tsx")
    assert "from '@/lib/roles'" in text
    assert 'from "@/lib/roles"' in text
    assert "export { ROLES as R } from '@/lib/roles'" in text
    assert "import('@/lib/roles')" in text
    assert "vi.mock('@/lib/roles'" in text
    assert "jest.mock('@/lib/utils')" in text
    assert "require('@/lib/roles')" in text
    assert "import '@/lib/roles'" in text
    # untouched
    assert "from '@/lib/utils'" in text
    assert "from '@siet/kmitl-rag/lib/pick'" in text
    assert "from '@shared/navbar'" in text
    assert "from 'react'" in text
    assert "@siet/platform" not in text
    assert (root / "platform/frontend/src/lib/roles.ts").exists()
    assert (root / "platform/frontend/src/lib/utils.ts").exists()


def test_relative_import_of_split_files(tmp_path):
    """b.tsx leaves its relative sibling a.tsx: the specifier becomes an alias."""
    files = {
        "open-notebook/frontend/src/components/a.tsx": dedent("""
            import { B } from './b'
            import { C } from '../lib/c'
            export const A = () => B + C
        """),
        "open-notebook/frontend/src/components/b.tsx": "export const B = 1\n",
        "open-notebook/frontend/src/lib/c.ts": "export const C = 2\n",
    }
    root = make_repo(tmp_path / "r", files)
    cfg = config(extra_moves=[("open-notebook/frontend/src/components/b.tsx",
                               "community/frontend/src/components/b.tsx")])
    apply(root, cfg)
    text = read(root, "platform/frontend/src/components/a.tsx")
    assert "from '@siet/community/components/b'" in text
    assert "from '../lib/c'" in text  # moved in lock-step, the relative path still holds
    assert (root / "community/frontend/src/components/b.tsx").exists()


def test_relative_import_importer_moves_away(tmp_path):
    files = {
        "open-notebook/frontend/src/components/a.tsx": "import { B } from './b'\nimport { C } from '../lib/c'\n",
        "open-notebook/frontend/src/components/b.tsx": "export const B = 1\n",
        "open-notebook/frontend/src/lib/c.ts": "export const C = 2\n",
    }
    root = make_repo(tmp_path / "r", files)
    cfg = config(extra_moves=[("open-notebook/frontend/src/components/a.tsx",
                               "kmitl-rag/frontend/src/components/a.tsx")])
    apply(root, cfg)
    text = read(root, "kmitl-rag/frontend/src/components/a.tsx")
    assert "from '@/components/b'" in text
    assert "from '@/lib/c'" in text


def test_relative_import_moved_in_lockstep_is_untouched(tmp_path):
    root = make_repo(tmp_path / "r", {
        "kmitl-rag/frontend/src/components/search/AskChatView.tsx": "import { S } from './SettingsDialog'\n",
        "kmitl-rag/frontend/src/components/search/SettingsDialog.tsx": "export const S = 1\n",
        "siet-platform/frontend/src/components/auth/PendingScreen.tsx":
            "import { Denied } from './AccessDeniedScreen'\n",
        "siet-platform/frontend/src/components/auth/AccessDeniedScreen.tsx": "export const Denied = 1\n",
    })
    apply(root)
    assert read(root, "kmitl-rag/frontend/src/components/search/AskChatView.tsx") == \
        "import { S } from './SettingsDialog'\n"
    assert read(root, "platform/frontend/src/components/auth/PendingScreen.tsx") == \
        "import { Denied } from './AccessDeniedScreen'\n"


def test_collision_platform_wins(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/frontend/src/lib/hooks/use-auth.ts": "export const useAuth = 'upstream'\n",
        "siet-platform/frontend/src/lib/hooks/use-auth.ts": "export const useAuth = 'siet'\n",
        "open-notebook/frontend/src/lib/other.ts": "import { useAuth } from '@/lib/hooks/use-auth'\n",
        "kmitl-rag/frontend/src/x.ts": "import { useAuth } from '@siet/platform/lib/hooks/use-auth'\n",
    })
    code, lines = apply(root)
    assert code == 0
    assert read(root, "platform/frontend/src/lib/hooks/use-auth.ts") == "export const useAuth = 'siet'\n"
    assert not (root / "open-notebook").exists()
    assert not (root / "siet-platform").exists()
    out = "\n".join(lines)
    assert "collision" in out
    assert "platform/frontend/src/lib/hooks/use-auth.ts" in out
    assert "open-notebook/frontend/src/lib/hooks/use-auth.ts" in out
    # both import styles of the colliding module point at the survivor
    assert read(root, "platform/frontend/src/lib/other.ts") == "import { useAuth } from '@/lib/hooks/use-auth'\n"
    assert read(root, "kmitl-rag/frontend/src/x.ts") == "import { useAuth } from '@/lib/hooks/use-auth'\n"
    assert git(root, "ls-files", "platform/frontend/src/lib/hooks/use-auth.ts").strip()


def test_collision_non_source_host_wins(tmp_path):
    """Outside frontend/src the open-notebook (host) file keeps its content (R20)."""
    root = make_repo(tmp_path / "r", {
        "open-notebook/pyproject.toml": '[project]\nname = "open-notebook"\n',
        "siet-platform/pyproject.toml": dedent("""
            [project]
            name = "siet-platform"

            [project.entry-points."open_notebook.extensions"]
            siet_platform = "siet_platform.extension"
        """),
        "open-notebook/frontend/package.json": '{"name": "frontend", "dependencies": {"next": "1"}}\n',
        "siet-platform/frontend/package.json": '{"name": "@siet/platform"}\n',
        "open-notebook/README.md": "host readme\n",
        "siet-platform/README.md": "siet readme\n",
        "open-notebook/.gitignore": "host\n",
        "siet-platform/.gitignore": "siet\n",
        # under frontend/src the siet-platform file still wins
        "open-notebook/frontend/src/lib/hooks/use-auth.ts": "export const u = 'host'\n",
        "siet-platform/frontend/src/lib/hooks/use-auth.ts": "export const u = 'siet'\n",
    })
    code, lines = apply(root)
    assert code == 0
    assert read(root, "platform/pyproject.toml") == '[project]\nname = "open-notebook"\n'
    assert read(root, "platform/frontend/package.json") == '{"name": "frontend", "dependencies": {"next": "1"}}\n'
    assert read(root, "platform/README.md") == "host readme\n"
    assert read(root, "platform/.gitignore") == "host\n"
    assert read(root, "platform/frontend/src/lib/hooks/use-auth.ts") == "export const u = 'siet'\n"
    # the siet-platform copies are gone from disk and from the index
    assert not (root / "siet-platform").exists()
    assert not (root / "open-notebook").exists()
    assert not any(p.startswith(("siet-platform/", "open-notebook/")) for p in tracked(root))
    assert {"platform/pyproject.toml", "platform/frontend/package.json"} <= tracked(root)
    # each one is reported, with the command that shows the dropped side
    out = "\n".join(lines)
    for dst, loser in [
        ("platform/pyproject.toml", "siet-platform/pyproject.toml"),
        ("platform/frontend/package.json", "siet-platform/frontend/package.json"),
        ("platform/README.md", "siet-platform/README.md"),
        ("platform/.gitignore", "siet-platform/.gitignore"),
    ]:
        line = next(line for line in lines if line.startswith(f"collision: {dst}:"))
        assert f"kept {dst.replace('platform/', 'open-notebook/', 1)}" in line
        assert "merge by hand" in line and f"git show HEAD:{loser}" in line
    # the frontend/src collision is reported the old way: the host copy is the dropped side
    use_auth = next(line for line in lines if "use-auth.ts" in line and line.startswith("collision"))
    assert "kept siet-platform/frontend/src/lib/hooks/use-auth.ts" in use_auth
    assert "merge by hand" not in use_auth
    assert "5 collisions" in out
    # nothing left to do afterwards
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "codemod")
    assert apply(root, check=True)[0] == 0


def test_collision_warns_when_the_dropped_page_exports_what_the_kept_one_lacks(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/frontend/src/app/(dashboard)/a/page.tsx": dedent("""
            export const dynamic = 'force-dynamic'
            export const revalidate = 0
            export async function generateMetadata() { return {} }
            export const metadata = { title: 'A' }
            export default function Page() { return null }
        """),
        "siet-platform/frontend/src/app/(dashboard)/a/page.tsx": "export { default } from '@siet/kmitl-rag/app/a/page'\n",
        # same exports on both sides (default re-export vs default function): nothing to say
        "open-notebook/frontend/src/app/(dashboard)/b/page.tsx": "export default function B() { return null }\n",
        "siet-platform/frontend/src/app/(dashboard)/b/page.tsx": "export { default } from '@siet/x/b'\n",
        # an extra named export that is not route config
        "open-notebook/frontend/src/lib/util.ts": "export const keep = 1\nexport function extraHelper() {}\n",
        "siet-platform/frontend/src/lib/util.ts": "export const keep = 2\n",
        # a replaced-module shim (`export * from`) re-exports the very module that wins: no news
        "open-notebook/frontend/src/lib/hooks/use-shim.ts": "export * from '@siet/platform/lib/hooks/use-shim'\n",
        "siet-platform/frontend/src/lib/hooks/use-shim.ts": "export const useShim = 1\n",
        # a loser that is not a TS module is not read for exports
        "open-notebook/frontend/src/lib/data.json": '{"export": 1}\n',
        "siet-platform/frontend/src/lib/data.json": '{"export": 2}\n',
    })
    code, lines = apply(root)
    assert code == 0
    page = next(line for line in lines if line.startswith("check by hand: ") and "a/page.tsx" in line)
    assert page == (
        "check by hand: platform/frontend/src/app/(dashboard)/a/page.tsx: dropped "
        "open-notebook/frontend/src/app/(dashboard)/a/page.tsx exports dynamic, generateMetadata, "
        "metadata, revalidate that the kept siet-platform/frontend/src/app/(dashboard)/a/page.tsx lacks"
    )
    util = next(line for line in lines if line.startswith("check by hand: ") and "util.ts" in line)
    assert "exports extraHelper that the kept" in util
    assert not any("b/page.tsx" in line and line.startswith("check by hand") for line in lines)
    assert not any("data.json" in line and line.startswith("check by hand") for line in lines)
    assert not any("use-shim" in line and line.startswith("check by hand") for line in lines)


def test_collision_winner_stable_under_chained_move(tmp_path):
    """A later rule that moves a collided file again must not change who wins (Task 12 / Task 17).

    The route is made up: the real table keys its Task 12 route rules by old-layout paths,
    so a real route here would test the table instead of the mechanism.
    """
    files = {
        "open-notebook/frontend/src/app/(dashboard)/chained/route/page.tsx": "export default () => 'host'\n",
        "siet-platform/frontend/src/app/(dashboard)/chained/route/page.tsx": "export default () => 'siet'\n",
        "open-notebook/frontend/src/lib/keep.ts": "export const k = 'host'\n",
        "siet-platform/frontend/src/lib/keep.ts": "export const k = 'siet'\n",
        "open-notebook/pyproject.toml": "host\n",
        "siet-platform/pyproject.toml": "siet\n",
    }
    later = ("platform/frontend/src/app/(dashboard)/chained/route",
             "ai-roadmap/frontend/src/app/(dashboard)/chained/route")
    moved = "ai-roadmap/frontend/src/app/(dashboard)/chained/route/page.tsx"
    # a branch on the old layout, the whole table at once
    one_shot = make_repo(tmp_path / "one-shot", files)
    code, lines = apply(one_shot, config(extra_moves=[later]))
    assert code == 0
    assert read(one_shot, moved) == "export default () => 'siet'\n"
    line = next(line for line in lines if line.startswith("collision:") and "chained/route" in line)
    assert "kept siet-platform/frontend/src/app/(dashboard)/chained/route/page.tsx" in line
    assert "merge by hand" not in line
    assert read(one_shot, "platform/frontend/src/lib/keep.ts") == "export const k = 'siet'\n"
    assert read(one_shot, "platform/pyproject.toml") == "host\n"
    # the repository itself: first the original table, commit, then the appended rule
    step = make_repo(tmp_path / "step", files)
    assert apply(step)[0] == 0
    git(step, "add", "-A")
    git(step, "commit", "-q", "-m", "task 9")
    assert apply(step, config(extra_moves=[later]))[0] == 0
    assert read(step, moved) == read(one_shot, moved)


def test_file_already_at_the_meeting_point_is_a_conflict(tmp_path):
    """A file sitting where the chains meet is 'already in place', even if a later rule moves it on."""
    root = make_repo(tmp_path / "r", {
        "platform/frontend/src/lib/x.ts": "export const x = 'in place'\n",
        "siet-platform/frontend/src/lib/x.ts": "export const x = 'incoming'\n",
    })
    cfg = config(extra_moves=[("platform/frontend/src/lib/x.ts", "community/frontend/src/lib/x.ts")])
    code, lines = apply(root, cfg)
    assert code == 1
    assert any(line.startswith("conflict") for line in lines)
    assert read(root, "platform/frontend/src/lib/x.ts") == "export const x = 'in place'\n"
    assert read(root, "siet-platform/frontend/src/lib/x.ts") == "export const x = 'incoming'\n"


def test_collision_non_source_untracked_siet_copy_is_kept_aside(tmp_path):
    root = make_repo(
        tmp_path / "r",
        {"open-notebook/pyproject.toml": "host\n"},
        untracked={"siet-platform/pyproject.toml": "siet, not committed yet\n"},
    )
    code, lines = apply(root)
    assert code == 0
    assert read(root, "platform/pyproject.toml") == "host\n"
    assert read(root, "platform/pyproject.toml.collision-dropped") == "siet, not committed yet\n"
    assert any("merge by hand" in line and "collision-dropped" in line for line in lines)


def test_collision_rules_are_data(tmp_path):
    files = {
        "open-notebook/frontend/src/a.ts": "host\n",
        "siet-platform/frontend/src/a.ts": "siet\n",
        "open-notebook/frontend/b.json": "host\n",
        "siet-platform/frontend/b.json": "siet\n",
    }
    root = make_repo(tmp_path / "flipped", files)
    apply(root, config(collision_rules=(("platform/frontend/src/*", "open-notebook/"),),
                       collision_default_winner="siet-platform/"))
    assert read(root, "platform/frontend/src/a.ts") == "host\n"
    assert read(root, "platform/frontend/b.json") == "siet\n"
    cfg = codemod.Config.from_moves()
    plan = codemod.Plan(cfg, [], set())
    assert plan.winner_prefix("platform/frontend/src/lib/x.ts") == ("siet-platform/", False)
    assert plan.winner_prefix("platform/pyproject.toml") == ("open-notebook/", True)
    assert plan.winner_prefix("platform/frontend/package.json") == ("open-notebook/", True)


def test_collision_untracked_loser_is_kept_aside(tmp_path):
    root = make_repo(
        tmp_path / "r",
        {"siet-platform/frontend/src/app/x/page.tsx": "export default function P() {}\n"},
        untracked={"open-notebook/frontend/src/app/x/page.tsx": "// my unsaved work\n"},
    )
    code, lines = apply(root)
    assert code == 0
    assert read(root, "platform/frontend/src/app/x/page.tsx") == "export default function P() {}\n"
    aside = [p for p in snapshot(root) if p.startswith("platform/frontend/src/app/x/page.tsx.")]
    assert len(aside) == 1
    assert read(root, aside[0]) == "// my unsaved work\n"
    assert any("collision" in line for line in lines)


def test_new_file_under_moved_dir(tmp_path):
    root = make_repo(
        tmp_path / "r",
        {
            "open-notebook/open_notebook/__init__.py": "",
            "open-notebook/open_notebook/a.py": "x = 1\n",
        },
        untracked={"open-notebook/open_notebook/new_mod.py": "from open_notebook.a import x\n"},
    )
    apply(root)
    assert read(root, "platform/siet_core/new_mod.py") == "from siet_core.a import x\n"
    assert not (root / "open-notebook/open_notebook/new_mod.py").exists()
    # it was not tracked before and still is not (the codemod only stages what git knew)
    assert "platform/siet_core/new_mod.py" not in tracked(root)


def test_ignored_files_are_never_moved(tmp_path):
    root = make_repo(
        tmp_path / "r",
        {"open-notebook/frontend/src/a.ts": "export const a = 1\n", "open-notebook/api/m.py": ""},
        gitignore="node_modules/\nsurreal_data/\n.venv/\n__pycache__/\n",
        ignored={
            "open-notebook/frontend/node_modules/pkg/index.js": "module.exports = 1\n",
            "open-notebook/surreal_data/db": "x",
            "open-notebook/.venv/bin/python": "x",
            "open-notebook/api/__pycache__/m.pyc": "x",
        },
    )
    code, lines = apply(root)
    assert code == 0
    assert (root / "platform/frontend/src/a.ts").exists()
    assert (root / "open-notebook/frontend/node_modules/pkg/index.js").exists()
    assert (root / "open-notebook/surreal_data/db").exists()
    assert (root / "open-notebook/.venv/bin/python").exists()
    assert not (root / "platform/frontend/node_modules").exists()
    # the leftovers are listed so they can be moved by hand
    out = "\n".join(lines)
    assert "open-notebook/frontend/node_modules" in out
    assert "__pycache__" not in out  # caches are not worth a line


def test_ignored_file_at_the_destination_blocks_that_move(tmp_path):
    root = make_repo(
        tmp_path / "r",
        {"open-notebook/api/x.py": "tracked\n", "open-notebook/api/y.py": "y\n"},
        gitignore="platform/api/x.py\n",
        ignored={"platform/api/x.py": "mine, ignored\n"},
    )
    code, lines = apply(root)
    assert code == 1
    assert any(line.startswith("conflict") and "platform/api/x.py" in line for line in lines)
    assert read(root, "platform/api/x.py") == "mine, ignored\n"
    assert read(root, "open-notebook/api/x.py") == "tracked\n"
    assert read(root, "platform/api/y.py") == "y\n"


def test_collision_with_a_file_already_in_place_is_a_conflict_not_a_win(tmp_path):
    root = make_repo(tmp_path / "r", {
        "platform/frontend/src/lib/x.ts": "export const x = 'in place'\n",
        "siet-platform/frontend/src/lib/x.ts": "export const x = 'incoming'\n",
    })
    code, lines = apply(root)
    assert code == 1
    assert any(line.startswith("conflict") for line in lines)
    assert read(root, "platform/frontend/src/lib/x.ts") == "export const x = 'in place'\n"
    assert read(root, "siet-platform/frontend/src/lib/x.ts") == "export const x = 'incoming'\n"


def test_two_files_from_the_same_side_never_win_over_each_other(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/frontend/src/a.ts": "one\n",
        "extra/a.ts": "two\n",
    })
    cfg = config(extra_moves=[("extra", "platform/frontend/src")])
    code, lines = apply(root, cfg)
    assert code == 1
    assert any(line.startswith("conflict") for line in lines)
    assert read(root, "open-notebook/frontend/src/a.ts") == "one\n"
    assert read(root, "extra/a.ts") == "two\n"


# ------------------------------------------------- case-only renames (R22, macOS disks)


class FakeCaseInsensitiveDisk:
    """The two questions ``case_renames`` asks of a disk, answered like APFS/NTFS would."""

    def __init__(self, tree: dict[str, list[str]]):
        self.tree = {path.lower(): (path, names) for path, names in tree.items()}

    def names(self, path: Path):
        hit = self.tree.get(str(path).lower())
        return list(hit[1]) if hit else None

    def lexists(self, path: Path) -> bool:
        return str(path).lower() in self.tree or any(
            str(path).lower() == f"{parent}/{n.lower()}"
            for parent, (_, names) in self.tree.items() for n in names
        )


def test_case_renames_plans_a_two_step_rename_for_a_differently_spelled_directory():
    disk = FakeCaseInsensitiveDisk({"/r": ["My-ai-quiz", "docs"], "/r/My-ai-quiz": ["src"]})
    plan = codemod.case_renames(Path("/r"), ["my-ai-quiz/app/src", "docs/x"], names=disk.names, exists=disk.lexists)
    assert plan == [("My-ai-quiz", "my-ai-quiz")]


def test_case_renames_follow_the_wanted_spelling_down_the_path():
    disk = FakeCaseInsensitiveDisk({
        "/r": ["My-ai-quiz"], "/r/My-ai-quiz": ["App"], "/r/My-ai-quiz/App": ["src"],
    })
    plan = codemod.case_renames(Path("/r"), ["my-ai-quiz/app/src/x"], names=disk.names, exists=disk.lexists)
    assert plan == [("My-ai-quiz", "my-ai-quiz"), ("my-ai-quiz/App", "my-ai-quiz/app")]


def test_case_renames_ignores_a_case_sensitive_disk_where_both_spellings_coexist():
    """On Linux ``My-ai-quiz`` and ``my-ai-quiz`` are two directories: nothing to fix."""
    listing = {"/r": ["My-ai-quiz"], "/r/My-ai-quiz": ["src"]}
    plan = codemod.case_renames(
        Path("/r"), ["my-ai-quiz/app/src"],
        names=lambda p: listing.get(str(p)), exists=lambda p: str(p) in listing,
    )
    assert plan == []


def test_case_renames_leaves_a_correctly_spelled_tree_and_a_missing_one_alone():
    disk = FakeCaseInsensitiveDisk({"/r": ["my-ai-quiz"], "/r/my-ai-quiz": ["app"]})
    assert codemod.case_renames(Path("/r"), ["my-ai-quiz/app", "ai-roadmap/app"],
                                names=disk.names, exists=disk.lexists) == []


def test_old_directory_spelled_with_other_case_ends_up_spelled_like_the_table(tmp_path):
    """My-ai-quiz -> my-ai-quiz/app: on a case-insensitive disk the new directory used to be
    created *inside* the old one and kept its spelling (checked on whatever disk runs the suite)."""
    root = make_repo(tmp_path / "r", {
        "My-ai-quiz/src/app/page.tsx": "export default 1\n",
        "My-ai-quiz/package.json": "{}\n",
    })
    code, _ = apply(root)
    assert code == 0
    assert sorted(os.listdir(root)) == [".git", "my-ai-quiz"], os.listdir(root)
    assert os.listdir(root / "my-ai-quiz") == ["app"]
    assert sorted(os.listdir(root / "my-ai-quiz/app")) == ["package.json", "src"]
    assert tracked(root) == {"my-ai-quiz/app/package.json", "my-ai-quiz/app/src/app/page.tsx"}
    assert git(root, "status", "--porcelain").count("D ") == 0  # renames only, nothing deleted
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "codemod")
    assert apply(root, check=True)[0] == 0


def test_symbol_split(tmp_path):
    root = make_repo(tmp_path / "r", {
        "siet-platform/siet_platform/__init__.py": "",
        "siet-platform/siet_platform/features/__init__.py": "",
        "siet-platform/siet_platform/features/domain.py": "class QuizSession: ...\nclass RoadmapSession: ...\n",
        "community/siet_community/routers.py": dedent("""
            from siet_platform.features.domain import QuizSession, RoadmapSession
            from siet_platform.features.domain import (
                QuizSession as QS,
                RoadmapSession,  # noqa: F401
            )
            from siet_platform.features.domain import Other
        """),
    })
    cfg = config(symbol_moves={
        "siet_platform.features.domain.QuizSession": "siet_quiz.domain.QuizSession",
        "siet_platform.features.domain.RoadmapSession": "siet_roadmap.domain.RoadmapSession",
    })
    apply(root, cfg)
    text = read(root, "community/siet_community/routers.py")
    assert text.startswith(
        "from siet_quiz.domain import QuizSession\n"
        "from siet_roadmap.domain import RoadmapSession\n"
    )
    assert "from siet_quiz.domain import QuizSession as QS\n" in text
    assert "from siet_roadmap.domain import (\n    RoadmapSession,  # noqa: F401\n)\n" in text
    assert text.rstrip().endswith("from siet_platform.features.domain import Other")


def test_symbol_split_keeps_unmoved_names_and_renames(tmp_path):
    root = make_repo(tmp_path / "r", {
        "kmitl-rag/kmitl_rag/a.py": dedent("""
            from siet_platform.features.service import _invoke_chat, generate_quiz, notebook_ask
            from unittest import mock

            def test(monkeypatch):
                monkeypatch.setattr("siet_platform.features.service.generate_quiz", None)
                mock.patch("siet_platform.features.service.generate_quiz.helper")
        """),
    })
    cfg = config(symbol_moves={
        "siet_platform.features.service.generate_quiz": "siet_quiz.service.make_quiz",
        "siet_platform.features.service._invoke_chat": "siet_platform.ai_helpers._invoke_chat",
    })
    apply(root, cfg)
    text = read(root, "kmitl-rag/kmitl_rag/a.py")
    assert "from siet_platform.features.service import notebook_ask\n" in text
    assert "from siet_quiz.service import make_quiz as generate_quiz\n" in text
    assert "from siet_platform.ai_helpers import _invoke_chat\n" in text
    assert 'monkeypatch.setattr("siet_quiz.service.make_quiz", None)' in text
    assert 'mock.patch("siet_quiz.service.make_quiz.helper")' in text


def test_task10_table_on_an_old_layout_branch(tmp_path):
    """The real table: a community file and a router test from before the restructure."""
    root = make_repo(tmp_path / "r", {
        "community/siet_community/x.py": dedent("""
            from siet_platform.features.domain import QuizSession, RoadmapSession
            from siet_platform.features.service import _extract_json, generate_quiz
            from siet_platform.features.schemas import QuizGenerateRequest, RoadmapGenerateResponse
            from siet_platform.routers.features import _charge, _resolve_owner_id, _session_to_quiz_response
        """),
        "open-notebook/api/__init__.py": "",
        "open-notebook/api/routers/__init__.py": "",
        "open-notebook/api/routers/sources.py": "x = 1\n",
        "open-notebook/tests/test_sources_api.py": dedent("""
            from api.routers.sources import x
            from unittest.mock import patch
            p = patch("api.routers.sources.repo_query")
        """),
    })
    apply(root)
    text = read(root, "community/siet_community/x.py")
    for line in (
        "from siet_quiz.domain import QuizSession\n",
        "from siet_roadmap.domain import RoadmapSession\n",
        "from siet_platform.ai_helpers import _extract_json\n",
        "from siet_quiz.service import generate_quiz\n",
        "from siet_quiz.schemas import QuizGenerateRequest\n",
        "from siet_roadmap.schemas import RoadmapGenerateResponse\n",
        "from siet_platform.http import _charge, _resolve_owner_id\n",
        "from siet_quiz.routers.features import _session_to_quiz_response\n",
    ):
        assert line in text, line
    assert "siet_platform.features" not in text and "siet_platform.routers.features" not in text
    assert read(root, "kmitl-rag/kmitl_rag/routers/sources.py") == "x = 1\n"
    moved_test = read(root, "kmitl-rag/tests/test_sources_api.py")
    assert "from kmitl_rag.routers.sources import x\n" in moved_test
    assert 'patch("kmitl_rag.routers.sources.repo_query")' in moved_test


def test_patch_targets_that_moved_into_a_shared_helper_are_reported_not_rewritten(tmp_path):
    """The quiz and roadmap services from-import ``_invoke_chat`` & co from ai_helpers, so
    ``patch("siet_platform.ai_helpers._invoke_chat")`` would silently intercept nothing."""
    root = make_repo(tmp_path / "r", {
        "community/tests/test_x.py": dedent("""
            from unittest import mock
            from siet_platform.features.service import _invoke_chat, generate_quiz
            from siet_platform.routers.features import _charge

            def test_x(monkeypatch):
                with mock.patch("siet_platform.features.service._invoke_chat") as chat:
                    pass
                monkeypatch.setattr("siet_platform.features.service._retrieve_rag_context", None)
                with mock.patch("siet_platform.routers.features._charge"):
                    pass
                with mock.patch("siet_platform.features.service.generate_quiz"):
                    pass
        """),
    })
    code, lines = apply(root)
    assert code == 0
    text = read(root, "community/tests/test_x.py")
    # imports are split to the new homes as before ...
    assert "from siet_platform.ai_helpers import _invoke_chat\n" in text
    assert "from siet_platform.http import _charge\n" in text
    # ... a patch target that has a single new home still follows ...
    assert 'mock.patch("siet_quiz.service.generate_quiz")' in text
    # ... and one that moved into a shared helper is left as it was and reported
    assert 'mock.patch("siet_platform.features.service._invoke_chat")' in text
    assert 'setattr("siet_platform.features.service._retrieve_rag_context", None)' in text
    assert 'mock.patch("siet_platform.routers.features._charge")' in text
    hand = [line for line in lines if line.startswith("check by hand: community/tests/test_x.py: patch target")]
    assert len(hand) == 3, hand
    assert any('"siet_platform.features.service._invoke_chat"' in line
               and "now lives in siet_platform.ai_helpers._invoke_chat" in line
               and "patch it where it is used" in line for line in hand)
    assert any('"siet_platform.routers.features._charge"' in line and "siet_platform.http._charge" in line for line in hand)
    # the second run still reports them (the check has to stay visible until they are fixed)
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "codemod")
    code, lines = apply(root, check=True)
    assert code == 0
    assert sum(1 for line in lines if "patch target" in line) == 3


def test_entry_point_group(tmp_path):
    root = make_repo(tmp_path / "r", {
        "kmitl-rag/pyproject.toml": dedent("""
            [project]
            name = "kmitl-rag"

            [project.entry-points."open_notebook.extensions"]
            kmitl_rag = "kmitl_rag.extension"
            legacy = "open_notebook.legacy:setup"

            [project.scripts]
            tool = "open_notebook.cli:main"
        """),
        "kmitl-rag/kmitl_rag/__init__.py": "",
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/legacy.py": "def setup(): ...\n",
        "open-notebook/open_notebook/cli.py": "def main(): ...\n",
        "open-notebook/open_notebook/extensions.py": 'ENTRY_POINT_GROUP = "open_notebook.extensions"\n',
        "kmitl-rag/kmitl_rag/extension.py": dedent('''
            """Hooks (``open_notebook.extensions``)."""
            from open_notebook import extensions
            from importlib.metadata import entry_points
            eps = entry_points(group="open_notebook.extensions")
        '''),
    })
    apply(root)
    toml = read(root, "kmitl-rag/pyproject.toml")
    assert '[project.entry-points."siet.extensions"]' in toml
    assert 'kmitl_rag = "kmitl_rag.extension"' in toml
    assert 'legacy = "siet_core.legacy:setup"' in toml
    assert 'tool = "siet_core.cli:main"' in toml
    assert 'name = "kmitl-rag"' in toml
    assert "open_notebook" not in toml
    assert read(root, "platform/siet_core/extensions.py") == 'ENTRY_POINT_GROUP = "siet.extensions"\n'
    ext = read(root, "kmitl-rag/kmitl_rag/extension.py")
    assert "from siet_core import extensions\n" in ext
    assert 'entry_points(group="siet.extensions")' in ext
    assert "``siet.extensions``" in ext


def test_pyproject_distribution_name_untouched(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/pyproject.toml": dedent("""
            [project]
            name = "open-notebook"
            dependencies = ["open_notebook_core>=1"]

            [tool.setuptools]
            packages = ["open_notebook", "api"]
        """),
    })
    apply(root)
    assert read(root, "platform/pyproject.toml") == dedent("""
        [project]
        name = "open-notebook"
        dependencies = ["open_notebook_core>=1"]

        [tool.setuptools]
        packages = ["open_notebook", "api"]
    """)


def test_surreal_namespace_untouched(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/config.py": dedent('''
            import os
            NS = os.environ.get("SURREAL_NAMESPACE", "open_notebook")
            DB = os.getenv("SURREAL_DATABASE", "open_notebook")
            QUERY = "USE NS open_notebook DB open_notebook"
            RECORD = "open_notebook:default_models"
            from open_notebook.utils import helper
        '''),
        "open-notebook/open_notebook/utils.py": "def helper(): ...\n",
        "open-notebook/.env.example": "SURREAL_NAMESPACE=open_notebook\nSURREAL_DATABASE=open_notebook\n",
        "docker-compose.yml": "services:\n  s:\n    environment:\n      - SURREAL_NAMESPACE=open_notebook\n",
        "open-notebook/api/main.py": dedent('''
            from commands import cmd
            @cmd("embed_note", app="open_notebook")
            def f(): ...
            submit("open_notebook", "embed_source", {})
            NAMES = ["open_notebook.process_source", "open_notebook.run_transformation"]
            def open_notebook_helper(): ...
            open_notebook_root = Path(__file__)
        '''),
    })
    apply(root)
    config_py = read(root, "platform/siet_core/config.py")
    assert 'os.environ.get("SURREAL_NAMESPACE", "open_notebook")' in config_py
    assert 'os.getenv("SURREAL_DATABASE", "open_notebook")' in config_py
    assert '"USE NS open_notebook DB open_notebook"' in config_py
    assert '"open_notebook:default_models"' in config_py
    assert "from siet_core.utils import helper" in config_py  # ...but the import moved
    assert read(root, "platform/.env.example") == \
        "SURREAL_NAMESPACE=open_notebook\nSURREAL_DATABASE=open_notebook\n"
    assert "SURREAL_NAMESPACE=open_notebook" in read(root, "docker-compose.yml")
    api = read(root, "platform/api/main.py")
    assert 'app="open_notebook"' in api  # the surreal-commands app name
    assert 'submit("open_notebook", "embed_source", {})' in api
    assert '"open_notebook.process_source"' in api  # a command name, not a module
    assert '"open_notebook.run_transformation"' in api
    assert "def open_notebook_helper" in api  # an identifier that is not in IDENTIFIER_RENAMES
    assert "open_notebook_root = Path" in api


def test_python_path_strings_follow_the_package(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/database/__init__.py": "",
        "open-notebook/open_notebook/database/migrations/1.surrealql": "DEFINE TABLE x;\n",
        "open-notebook/open_notebook/database/migrate.py": dedent('''
            """Reads open_notebook/database/migrations/ (see open_notebook/database/migrate.py)."""
            M = AsyncMigration.from_file("open_notebook/database/migrations/1.surrealql")
            NOT_A_PATH = "docs/open_notebook/x"
            MISSING = "open_notebook/does/not/exist.txt"
        '''),
    })
    apply(root)
    text = read(root, "platform/siet_core/database/migrate.py")
    assert '"siet_core/database/migrations/1.surrealql"' in text
    assert "Reads siet_core/database/migrations/ (see siet_core/database/migrate.py)" in text
    assert '"docs/open_notebook/x"' in text
    assert '"open_notebook/does/not/exist.txt"' in text


def test_python_relative_imports(tmp_path):
    files = {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/utils/__init__.py": "from .chunking import chunk\nfrom . import helpers\n",
        "open-notebook/open_notebook/utils/chunking.py": "def chunk(): ...\n",
        "open-notebook/open_notebook/utils/helpers.py": "from ..config import X\nfrom .chunking import chunk\n",
        "open-notebook/open_notebook/config.py": "X = 1\n",
    }
    root = make_repo(tmp_path / "r", files)
    apply(root)
    # moved together: relative imports are left alone
    assert read(root, "platform/siet_core/utils/__init__.py") == "from .chunking import chunk\nfrom . import helpers\n"
    assert read(root, "platform/siet_core/utils/helpers.py") == "from ..config import X\nfrom .chunking import chunk\n"


def test_plain_import_keeps_the_whitespace_before_a_trailing_comment(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/graphs/__init__.py": "",
        "open-notebook/open_notebook/graphs/source.py": "x = 1\n",
        "open-notebook/tests/test_a.py": dedent("""
            def test_a():
                import open_notebook.graphs.source  # noqa: F401  (enables logs)
                import open_notebook.graphs.source, os  # noqa
                import open_notebook.graphs.source\t# tab
                import open_notebook.graphs.source;import os
                import open_notebook.graphs.source
        """),
    })
    apply(root)
    assert read(root, "platform/tests/test_a.py") == dedent("""
        def test_a():
            import siet_core.graphs.source  # noqa: F401  (enables logs)
            import siet_core.graphs.source, os  # noqa
            import siet_core.graphs.source\t# tab
            import siet_core.graphs.source;import os
            import siet_core.graphs.source
    """)


def test_relative_import_of_a_module_that_moved_to_another_package(tmp_path):
    """``from . import notes`` where notes.py went to kmitl_rag: the sibling is not a sibling any more."""
    root = make_repo(tmp_path / "r", {
        "open-notebook/api/__init__.py": "",
        "open-notebook/api/routers/__init__.py": "",
        "open-notebook/api/routers/notes.py": "x = 1\n",
        "open-notebook/api/routers/health.py": dedent("""
            from . import notes
            from . import health as me, notes as n  # keep this
            from .notes import x
            from .. import routers
        """),
        "open-notebook/api/main.py": dedent("""
            from .routers import (
                health,
                notes,  # the notes API
            )
            from .routers import health as h
        """),
    })
    code, lines = apply(root)
    assert code == 0
    assert read(root, "platform/api/routers/health.py") == dedent("""
        from kmitl_rag.routers import notes
        from api.routers import health as me  # keep this
        from kmitl_rag.routers import notes as n
        from kmitl_rag.routers.notes import x
        from .. import routers
    """)
    assert read(root, "platform/api/main.py") == dedent("""
        from api.routers import health
        from kmitl_rag.routers import (
            notes,  # the notes API
        )
        from .routers import health as h
    """)
    assert (root / "kmitl-rag/kmitl_rag/routers/notes.py").exists()


def test_python_relative_import_of_split_files(tmp_path):
    files = {
        "siet-platform/siet_platform/__init__.py": "",
        "siet-platform/siet_platform/features/__init__.py": "",
        "siet-platform/siet_platform/features/quiz.py": "from .domain import QuizSession\nfrom ..cache import c\n",
        "siet-platform/siet_platform/features/domain.py": "class QuizSession: ...\n",
        "siet-platform/siet_platform/cache.py": "c = 1\n",
    }
    root = make_repo(tmp_path / "r", files)
    # Relative imports only: the real SYMBOL_MOVES would also send QuizSession to siet_quiz.
    cfg = config(
        extra_moves=[("siet-platform/siet_platform/features/quiz.py", "my-ai-quiz/siet_quiz/quiz.py")],
        symbol_moves={},
    )
    apply(root, cfg)
    text = read(root, "my-ai-quiz/siet_quiz/quiz.py")
    assert "from siet_platform.features.domain import QuizSession\n" in text
    assert "from siet_platform.cache import c\n" in text


def test_idempotent(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
        "open-notebook/frontend/src/lib/hooks/use-auth.ts": "export const u = 1\n",
        "siet-platform/frontend/src/lib/hooks/use-auth.ts": "export const u = 2\n",
        "siet-platform/frontend/src/lib/roles.ts": "export const r = 1\n",
        "siet-platform/siet_platform/b.py": "from open_notebook.a import x\n",
        "community/frontend/src/c.tsx": "import { r } from '@siet/platform/lib/roles'\nimport { x } from './d'\n",
        "community/frontend/src/d.tsx": "export const x = 1\n",
        "kmitl-rag/pyproject.toml": '[project.entry-points."open_notebook.extensions"]\nk = "kmitl_rag.extension"\n',
        "My-ai-quiz/app/page.tsx": "export default function P() {}\n",
    })
    code, _ = apply(root)
    assert code == 0
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "codemod")
    before = snapshot(root)
    done = cli(root, "--check")
    assert done.returncode == 0, done.stdout + done.stderr
    code, lines = apply(root)
    assert code == 0
    assert snapshot(root) == before
    assert git(root, "status", "--porcelain") == ""


def test_idempotent_with_stale_old_specifiers_in_new_layout(tmp_path):
    """A file that still carries an old alias after the move is fixed by a second run."""
    root = make_repo(tmp_path / "r", {
        "platform/frontend/src/lib/roles.ts": "export const r = 1\n",
        "platform/frontend/src/lib/x.ts": "import { r } from '@siet/platform/lib/roles'\n",
        "community/frontend/src/c.ts": "import { r } from '@/lib/roles'\n",
    })
    code, _ = apply(root)
    assert code == 0
    assert read(root, "platform/frontend/src/lib/x.ts") == "import { r } from '@/lib/roles'\n"
    assert read(root, "community/frontend/src/c.ts") == "import { r } from '@/lib/roles'\n"


# ----------------------------------------------- --since: convert only the branch's own changes


def lines_of(prefix: str, n: int = 12) -> str:
    return "".join(f"{prefix}_{i} = {i}\n" for i in range(n))


def run_git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)


def make_old_layout_repo(tmp_path: Path) -> Path:
    return make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": lines_of("a"),
        "open-notebook/open_notebook/b.py": "from open_notebook.a import a_1\n" + lines_of("b"),
        "open-notebook/api/__init__.py": "",
        "open-notebook/api/m.py": "from open_notebook.b import b_1\n" + lines_of("m"),
        "open-notebook/README.md": "the upstream readme\n" + lines_of("r"),
        "open-notebook/.github/RELEASE.md": "upstream only, the restructure deletes it\n" + lines_of("g"),
    })


def test_since_converts_only_what_the_branch_changed_and_the_merge_is_clean(tmp_path):
    """The flow handed to teammates: merge main, run the codemod, merge the restructure."""
    root = make_old_layout_repo(tmp_path)
    git(root, "branch", "-M", "main")
    # the restructure branch: converted, then edited by hand, upstream-only files deleted
    git(root, "checkout", "-q", "-b", "R")
    apply(root)
    git(root, "rm", "-q", "-r", "-f", "platform/.github")
    write(root, "platform/siet_core/b.py", read(root, "platform/siet_core/b.py").replace("b_3 = 3", "b_3 = 333"))
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "restructure")
    # a teammate's branch on the old layout: one edit to an old file, one new file
    git(root, "checkout", "-q", "main")
    git(root, "checkout", "-q", "-b", "mate")
    write(root, "open-notebook/open_notebook/a.py", read(root, "open-notebook/open_notebook/a.py").replace("a_5 = 5", "a_5 = 555"))
    write(root, "open-notebook/api/new.py", "from open_notebook.a import a_5\nfrom open_notebook.exceptions import OpenNotebookError\n")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "teammate work")

    code, lines = apply(root, since="R")
    assert code == 0, lines
    out = "\n".join(lines)
    assert "only the 2 files this branch changed" in out
    # own files are converted ...
    assert "a_5 = 555" in read(root, "platform/siet_core/a.py")
    assert read(root, "platform/api/new.py") == \
        "from siet_core.a import a_5\nfrom siet_core.exceptions import SietError\n"
    # ... everything else is left for the merge to move, delete or edit
    assert (root / "open-notebook/README.md").exists()
    assert (root / "open-notebook/open_notebook/b.py").exists()
    assert (root / "open-notebook/.github/RELEASE.md").exists()
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "codemod")
    assert apply(root, since="R", check=True)[0] == 0  # idempotent
    merged = run_git(root, "merge", "--no-edit", "R")
    assert merged.returncode == 0, merged.stdout + merged.stderr
    assert run_git(root, "status", "--porcelain").stdout == ""
    assert "a_5 = 555" in read(root, "platform/siet_core/a.py")      # the teammate's edit
    assert "b_3 = 333" in read(root, "platform/siet_core/b.py")      # the restructure's edit
    assert not (root / "open-notebook").exists()                       # old layout is gone
    assert not (root / "platform/.github").exists()                    # ... and what it deleted too


def test_since_reports_edited_files_the_restructure_deleted_or_split(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/api/__init__.py": "",
        "open-notebook/api/gone.py": lines_of("gone"),
        "open-notebook/api/stay.py": lines_of("stay"),
        "open-notebook/api/untouched.py": lines_of("untouched"),
    })
    git(root, "branch", "-M", "main")
    git(root, "checkout", "-q", "-b", "R")
    apply(root)
    git(root, "rm", "-q", "-f", "platform/api/gone.py")  # the restructure split / deleted it
    git(root, "commit", "-q", "-m", "restructure")
    git(root, "checkout", "-q", "main")
    git(root, "checkout", "-q", "-b", "mate")
    write(root, "open-notebook/api/gone.py", lines_of("gone") + "mine = 1\n")
    write(root, "open-notebook/api/stay.py", lines_of("stay") + "mine = 2\n")
    write(root, "open-notebook/api/brand_new.py", lines_of("brand_new"))
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "work")
    code, lines = apply(root, since="R")
    assert code == 0, lines
    hand = [line for line in lines if line.startswith("check by hand: ")]
    assert len(hand) == 1, hand
    assert "open-notebook/api/gone.py" in hand[0] and "deleted or split" in hand[0]
    assert "port your edits by hand" in hand[0] and "git diff " in hand[0]
    # it is only a report: the file is converted like the others, git shows the modify/delete conflict
    assert "mine = 1" in read(root, "platform/api/gone.py")


def test_since_reports_imports_of_modules_the_restructure_removed(tmp_path):
    """A new file importing from a module R split away (a symbol SYMBOL_MOVES never heard of)."""
    root = make_repo(tmp_path / "r", {
        "open-notebook/api/__init__.py": "",
        "open-notebook/api/gone.py": lines_of("gone"),
        "open-notebook/api/stay.py": lines_of("stay"),
        # already imported the module at the split: the restructure fixes that line itself
        "open-notebook/api/old_user.py": "from api.gone import gone_1\n" + lines_of("old_user"),
    })
    git(root, "branch", "-M", "main")
    git(root, "checkout", "-q", "-b", "R")
    apply(root)
    git(root, "rm", "-q", "-f", "platform/api/gone.py")
    git(root, "commit", "-q", "-m", "restructure")
    git(root, "checkout", "-q", "main")
    git(root, "checkout", "-q", "-b", "mate")
    write(root, "open-notebook/api/old_user.py", "from api.gone import gone_1\n" + lines_of("old_user") + "mine = 1\n")
    write(root, "open-notebook/api/consumer.py", dedent("""
        import json, os
        from api.stay import stay_1
        from api.gone import gone_1
        import api.gone as g
        from api import stay
        from pathlib import Path
    """))
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "work")
    code, lines = apply(root, since="R")
    assert code == 0, lines
    hand = [line for line in lines if line.startswith("check by hand: ") and "does not exist" in line]
    assert [h.split(": imports ")[1].split(",")[0] for h in hand] == ["api.gone"], hand
    assert all(h.startswith("check by hand: platform/api/consumer.py:") for h in hand)
    assert all("api.stay" not in h and "json" not in h for h in hand)
    assert not any("old_user.py" in h for h in hand), hand  # only what the branch introduced


def test_modules_that_symbol_moves_create_are_not_reported_missing(tmp_path):
    """siet_platform.ai_helpers is made by hand, the table only says where names go."""
    root = make_repo(tmp_path / "r", {
        "community/siet_community/x.py": "from siet_platform.features.service import _invoke_chat\nimport os\n",
        "siet-platform/siet_platform/features/service.py": "def _invoke_chat(): ...\n",
    })
    code, lines = apply(root)
    assert code == 0
    assert "from siet_platform.ai_helpers import _invoke_chat" in read(root, "community/siet_community/x.py")
    assert not any("does not exist" in line for line in lines), lines


def test_since_without_the_option_converts_the_whole_tree(tmp_path):
    root = make_old_layout_repo(tmp_path)
    apply(root)
    assert (root / "platform/README.md").exists() and not (root / "open-notebook").exists()


def test_since_leaves_an_edited_collision_loser_in_place_and_says_so(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/frontend/src/lib/hooks/use-auth.ts": lines_of("host"),
        "siet-platform/frontend/src/lib/hooks/use-auth.ts": lines_of("siet"),
        "open-notebook/frontend/src/lib/other.ts": lines_of("other"),
        "siet-platform/frontend/src/lib/other.ts": lines_of("other_siet"),
    })
    git(root, "branch", "-M", "main")
    git(root, "checkout", "-q", "-b", "mate")
    # the teammate edited the copy that would lose, and the one that would win
    write(root, "open-notebook/frontend/src/lib/hooks/use-auth.ts", lines_of("host") + "edited = 1\n")
    write(root, "siet-platform/frontend/src/lib/other.ts", lines_of("other_siet") + "edited = 2\n")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "work")
    code, lines = apply(root, since="main")
    assert code == 0, lines
    out = "\n".join(lines)
    # the edited loser stays where it is (git will show the modify/delete conflict with the restructure)
    assert "edited = 1" in read(root, "open-notebook/frontend/src/lib/hooks/use-auth.ts")
    assert not (root / "platform/frontend/src/lib/hooks/use-auth.ts").exists()
    assert any(line.startswith("check by hand: ") and "use-auth.ts" in line and "edits stay" in line for line in lines), out
    # the edited winner moves; the untouched loser is not deleted by us
    assert "edited = 2" in read(root, "platform/frontend/src/lib/other.ts")
    assert (root / "open-notebook/frontend/src/lib/other.ts").exists()
    assert not (root / "siet-platform/frontend/src/lib/other.ts").exists()
    # the unedited winner of the other collision is the merge's to move
    assert (root / "siet-platform/frontend/src/lib/hooks/use-auth.ts").exists()


def test_since_with_an_unknown_ref_is_refused(tmp_path):
    root = make_old_layout_repo(tmp_path)
    code, lines = apply(root, since="no-such-ref")
    assert code == 2
    assert lines[0].startswith("error:") and "no-such-ref" in lines[0]
    assert (root / "open-notebook").exists()


def test_cli_since_option(tmp_path):
    root = make_old_layout_repo(tmp_path)
    git(root, "branch", "-M", "main")
    git(root, "checkout", "-q", "-b", "mate")
    write(root, "open-notebook/open_notebook/a.py", lines_of("a") + "more = 1\n")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "edit")
    done = cli(root, "--since", "main")
    assert done.returncode == 0, done.stdout + done.stderr
    assert (root / "platform/siet_core/a.py").exists()
    assert (root / "open-notebook/README.md").exists()


# ------------------------------------------------------------------------ CLI / safety


def test_check_reports_and_changes_nothing(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
        "siet-platform/siet_platform/b.py": "from open_notebook.a import x\n",
    })
    before = snapshot(root)
    done = cli(root, "--check")
    assert done.returncode == 1, done.stdout + done.stderr
    assert "open-notebook/open_notebook" in done.stdout
    assert "platform/siet_core" in done.stdout
    assert snapshot(root) == before
    assert git(root, "status", "--porcelain") == ""
    # a real run, then the check is quiet
    assert cli(root, "--allow-dirty").returncode == 0
    assert cli(root, "--check").returncode == 0


def test_check_exit_zero_when_nothing_to_do(tmp_path):
    root = make_repo(tmp_path / "r", {"platform/siet_core/a.py": "x = 1\n"})
    done = cli(root, "--check")
    assert done.returncode == 0, done.stdout + done.stderr


def test_refuses_dirty_index(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
    })
    write(root, "open-notebook/open_notebook/a.py", "x = 2\n")
    git(root, "add", "open-notebook/open_notebook/a.py")
    before = snapshot(root)
    done = cli(root)
    assert done.returncode == 2
    assert "--allow-dirty" in done.stdout + done.stderr
    assert snapshot(root) == before
    # an unstaged edit to a tracked file is dirty too
    git(root, "reset", "-q", "--hard")
    write(root, "open-notebook/open_notebook/a.py", "x = 3\n")
    assert cli(root).returncode == 2
    # --check does not care
    assert cli(root, "--check").returncode == 1
    # --allow-dirty goes ahead and keeps the edit
    assert cli(root, "--allow-dirty").returncode == 0
    assert read(root, "platform/siet_core/a.py") == "x = 3\n"


def test_staged_copy_of_the_tool_does_not_make_the_tree_dirty(tmp_path):
    """`git checkout origin/refactor/lsp-siet -- scripts/lsp-siet` stages the tool in the branch
    it is about to convert; that must not trip the clean-tree check."""
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
    })
    write(root, "scripts/lsp-siet/codemod.py", "# the tool\n")
    git(root, "add", "scripts/lsp-siet/codemod.py")
    code, lines = apply(root)
    assert code == 0, lines
    assert (root / "platform/siet_core/a.py").exists()
    assert git(root, "status", "--porcelain", "scripts/lsp-siet").startswith("A  scripts/lsp-siet/codemod.py")


def test_untracked_files_do_not_make_the_tree_dirty(tmp_path):
    root = make_repo(
        tmp_path / "r",
        {"open-notebook/open_notebook/__init__.py": ""},
        untracked={"notes.txt": "mine\n"},
    )
    assert cli(root).returncode == 0
    assert read(root, "notes.txt") == "mine\n"


def test_no_moves_flag_only_rewrites_text(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
        "open-notebook/api/b.py": "from open_notebook.a import x\n",
        "community/frontend/src/c.ts": "import { r } from '@siet/platform/lib/roles'\n",
    })
    code, _ = apply(root, no_moves=True)
    assert code == 0
    assert (root / "open-notebook/open_notebook/a.py").exists()
    assert not (root / "platform").exists()
    assert read(root, "open-notebook/api/b.py") == "from siet_core.a import x\n"
    assert read(root, "community/frontend/src/c.ts") == "import { r } from '@/lib/roles'\n"


def test_scripts_dir_of_the_tool_is_left_alone(tmp_path):
    body = 'from open_notebook.a import x\nOLD = "open-notebook/frontend"\n'
    root = make_repo(tmp_path / "r", {
        "scripts/lsp-siet/moves.py": body,
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
    })
    apply(root)
    assert read(root, "scripts/lsp-siet/moves.py") == body


def test_identifier_renames_python_and_typescript_whole_word(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/exceptions.py": "class OpenNotebookError(Exception): ...\n",
        "open-notebook/api/__init__.py": "",
        "open-notebook/api/main.py": dedent("""
            from open_notebook.exceptions import OpenNotebookError as E, OpenNotebookError
            from open_notebook import exceptions

            @app.exception_handler(OpenNotebookError)
            async def open_notebook_error_handler(request, exc): ...

            app.add_exception_handler(OpenNotebookError, open_notebook_error_handler)
            raise exceptions.OpenNotebookError("x")
            class MyOpenNotebookError(Exception): ...
            name = "OpenNotebookError"
            # R21: persisted names and the surreal-commands app are not identifiers to rename
            ns = "open_notebook"
            submit_command("open_notebook", "open_notebook.process_source")
            @command("embed", app="open_notebook")
            def f(): ...
        """),
        "open-notebook/frontend/src/lib/hooks/use-create-dialogs.tsx": dedent("""
            export interface Dialogs { openNotebookDialog: () => void }
            const openNotebookDialog = useCallback(() => setOpen(true), [])
            const notopenNotebookDialog2 = 1, $openNotebookDialog = 2
        """),
        "community/frontend/src/x.tsx": "const { openNotebookDialog } = useCreateDialogs()\n",
        "open-notebook/README.md": "OpenNotebookError stays in prose\n",
    })
    apply(root)
    main = read(root, "platform/api/main.py")
    assert "from siet_core.exceptions import SietError as E, SietError\n" in main
    assert "@app.exception_handler(SietError)\nasync def siet_error_handler(request, exc)" in main
    assert "app.add_exception_handler(SietError, siet_error_handler)" in main
    assert 'raise exceptions.SietError("x")' in main
    assert 'name = "SietError"' in main
    assert "class MyOpenNotebookError(Exception)" in main  # not a whole word
    assert 'ns = "open_notebook"' in main
    assert 'submit_command("open_notebook", "open_notebook.process_source")' in main
    assert '@command("embed", app="open_notebook")' in main
    tsx = read(root, "platform/frontend/src/lib/hooks/use-create-dialogs.tsx")
    assert "openCreateNotebookDialog: () => void" in tsx
    assert "const openCreateNotebookDialog = useCallback" in tsx
    assert "notopenNotebookDialog2" in tsx and "$openNotebookDialog" in tsx  # other identifiers
    assert read(root, "community/frontend/src/x.tsx") == "const { openCreateNotebookDialog } = useCreateDialogs()\n"
    assert read(root, "platform/README.md") == "OpenNotebookError stays in prose\n"
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "codemod")
    assert apply(root, check=True)[0] == 0  # idempotent


def test_identifier_table_names_the_renames_of_the_restructure():
    assert moves.IDENTIFIER_RENAMES == {
        "OpenNotebookError": "SietError",
        "open_notebook_error_handler": "siet_error_handler",
        "openNotebookDialog": "openCreateNotebookDialog",
    }


def test_env_renames(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/.env.example": "OPEN_NOTEBOOK_PASSWORD=x\nNEXT_PUBLIC_OPEN_NOTEBOOK_API_URL=y\nOPEN_NOTEBOOK_PASSWORD_2=z\nXOPEN_NOTEBOOK_PASSWORD=w\n",
        "docker-compose.yml": "environment:\n  - OPEN_NOTEBOOK_PASSWORD=${OPEN_NOTEBOOK_PASSWORD}\n",
        "Makefile": "run:\n\tOPEN_NOTEBOOK_PASSWORD=1 uv run x\n",
        "docker/Dockerfile.api": "ENV OPEN_NOTEBOOK_PASSWORD=1\n",
        "deploy/up.sh": "export OPEN_NOTEBOOK_PASSWORD=1\n",
        "a/b/package.json": '{"env": "OPEN_NOTEBOOK_PASSWORD"}\n',
        "a/c/pyproject.toml": 'env = "OPEN_NOTEBOOK_PASSWORD"\n',
        "readme.md": "OPEN_NOTEBOOK_PASSWORD stays in prose\n",
    })
    cfg = config(env_renames={
        "OPEN_NOTEBOOK_PASSWORD": "LSP_SIET_PASSWORD",
        "NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL": "NEXT_PUBLIC_LSP_SIET_API_URL",
    })
    apply(root, cfg)
    assert read(root, "platform/.env.example") == \
        "LSP_SIET_PASSWORD=x\nNEXT_PUBLIC_LSP_SIET_API_URL=y\nOPEN_NOTEBOOK_PASSWORD_2=z\nXOPEN_NOTEBOOK_PASSWORD=w\n"
    assert read(root, "docker-compose.yml") == "environment:\n  - LSP_SIET_PASSWORD=${LSP_SIET_PASSWORD}\n"
    assert "LSP_SIET_PASSWORD=1 uv run x" in read(root, "Makefile")
    assert read(root, "docker/Dockerfile.api") == "ENV LSP_SIET_PASSWORD=1\n"
    assert read(root, "deploy/up.sh") == "export LSP_SIET_PASSWORD=1\n"
    assert read(root, "a/b/package.json") == '{"env": "LSP_SIET_PASSWORD"}\n'
    assert read(root, "a/c/pyproject.toml") == 'env = "LSP_SIET_PASSWORD"\n'
    assert read(root, "readme.md") == "OPEN_NOTEBOOK_PASSWORD stays in prose\n"


def test_env_renames_keep_the_fallback_names_of_a_converted_tree(tmp_path):
    """A tree that already has LSP_SIET_* names mentions the old ones only as fallbacks."""
    compose = (
        "environment:\n"
        "  - LSP_SIET_PASSWORD=${LSP_SIET_PASSWORD:-${OPEN_NOTEBOOK_PASSWORD:-}}\n"
        "  - LSP_SIET_API_KEY=${LSP_SIET_PASSWORD:-${OPEN_NOTEBOOK_PASSWORD}}\n"
    )
    tables = {
        "platform/siet_core/env.py": 'LEGACY_NAMES = {\n    "LSP_SIET_PASSWORD": "OPEN_NOTEBOOK_PASSWORD",\n}\n',
        "platform/frontend/src/lib/env.ts": "export const LEGACY_NAMES = {\n  LSP_SIET_PASSWORD: 'OPEN_NOTEBOOK_PASSWORD',\n}\n",
        "ai-roadmap/app/src/lib/env.js": "export const LEGACY_NAMES = {\n  LSP_SIET_PASSWORD: 'OPEN_NOTEBOOK_PASSWORD',\n}\n",
    }
    root = make_repo(tmp_path / "r", {"docker-compose.yml": compose, **tables})
    apply(root, config(env_renames={"OPEN_NOTEBOOK_PASSWORD": "LSP_SIET_PASSWORD"}))
    assert read(root, "docker-compose.yml") == compose
    for path, body in tables.items():
        assert read(root, path) == body


def test_env_renames_still_rewrite_a_plain_reference_next_to_a_fallback(tmp_path):
    root = make_repo(tmp_path / "r", {
        "docker-compose.yml": (
            "  - A=${OPEN_NOTEBOOK_PASSWORD:-x}\n"
            "  - B=${LSP_SIET_PASSWORD:-${OPEN_NOTEBOOK_PASSWORD:-x}} ${OPEN_NOTEBOOK_PASSWORD}\n"
        ),
    })
    apply(root, config(env_renames={"OPEN_NOTEBOOK_PASSWORD": "LSP_SIET_PASSWORD"}))
    assert read(root, "docker-compose.yml") == (
        "  - A=${LSP_SIET_PASSWORD:-x}\n"
        "  - B=${LSP_SIET_PASSWORD:-${OPEN_NOTEBOOK_PASSWORD:-x}} ${LSP_SIET_PASSWORD}\n"
    )


def test_chained_moves_reach_the_final_path_in_one_run(tmp_path):
    """Rules added by later tasks apply to branches that still have the old layout."""
    root = make_repo(tmp_path / "r", {
        "siet-platform/siet_platform/__init__.py": "",
        "siet-platform/siet_platform/features/__init__.py": "",
        "siet-platform/siet_platform/features/quiz.py": "x = 1\n",
        "siet-platform/frontend/src/components/Dialog.tsx": "export const D = 1\n",
        "community/frontend/src/use.tsx": "import { D } from '@siet/platform/components/Dialog'\n",
        "community/siet_community/a.py": "from siet_platform.features.quiz import x\n",
    })
    cfg = config(extra_moves=[
        ("platform/siet_platform/features/quiz.py", "my-ai-quiz/siet_quiz/quiz.py"),
        ("platform/frontend/src/components/Dialog.tsx", "community/frontend/src/components/Dialog.tsx"),
    ])
    apply(root, cfg)
    assert (root / "my-ai-quiz/siet_quiz/quiz.py").exists()
    assert (root / "community/frontend/src/components/Dialog.tsx").exists()
    assert not (root / "platform/siet_platform/features/quiz.py").exists()
    assert read(root, "community/siet_community/a.py") == "from siet_quiz.quiz import x\n"
    assert read(root, "community/frontend/src/use.tsx") == \
        "import { D } from '@siet/community/components/Dialog'\n"


def test_later_rule_on_already_converted_tree(tmp_path):
    """Tasks 10-12: the repository is on the new layout, only the new rule applies."""
    root = make_repo(tmp_path / "r", {
        "platform/siet_platform/__init__.py": "",
        "platform/siet_platform/features/__init__.py": "",
        "platform/siet_platform/features/quiz.py": "x = 1\n",
        "community/siet_community/a.py": "from siet_platform.features.quiz import x\nfrom siet_platform.features import quiz\n",
        "community/siet_community/b.py": 'import siet_platform.features.quiz as q\nP = "siet_platform.features.quiz.x"\n',
    })
    cfg = config(extra_moves=[("platform/siet_platform/features/quiz.py", "my-ai-quiz/siet_quiz/quiz.py")])
    code, _ = apply(root, cfg)
    assert code == 0
    assert (root / "my-ai-quiz/siet_quiz/quiz.py").exists()
    assert read(root, "community/siet_community/a.py") == \
        "from siet_quiz.quiz import x\nfrom siet_quiz import quiz\n"
    assert read(root, "community/siet_community/b.py") == \
        'import siet_quiz.quiz as q\nP = "siet_quiz.quiz.x"\n'
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "second pass")
    code, lines = apply(root, cfg, check=True)
    assert code == 0, lines


def test_resumes_after_an_interrupted_run(tmp_path):
    """A half-moved tree (some files already at the new path) converges with one more run."""
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
        "open-notebook/open_notebook/b.py": "from open_notebook.a import x\n",
    })
    (root / "platform/siet_core").mkdir(parents=True)
    git(root, "mv", "open-notebook/open_notebook/__init__.py", "platform/siet_core/__init__.py")
    git(root, "commit", "-q", "-am", "interrupted")
    code, _ = apply(root)
    assert code == 0
    assert sorted(p for p in tracked(root) if p.startswith("platform/")) == [
        "platform/siet_core/__init__.py", "platform/siet_core/a.py", "platform/siet_core/b.py"]
    assert read(root, "platform/siet_core/b.py") == "from siet_core.a import x\n"


def test_conflict_with_existing_file_blocks_that_file_only(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 'old'\n",
        "open-notebook/open_notebook/b.py": "y = 1\n",
        "platform/siet_core/a.py": "x = 'already there'\n",
    })
    code, lines = apply(root)
    assert code == 1
    assert any(line.startswith("conflict") and "platform/siet_core/a.py" in line for line in lines)
    assert read(root, "platform/siet_core/a.py") == "x = 'already there'\n"
    assert read(root, "open-notebook/open_notebook/a.py") == "x = 'old'\n"
    assert (root / "platform/siet_core/b.py").exists()


def test_crlf_line_endings_survive(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\r\ny = 2\r\n",
        "community/siet_community/c.py": "from open_notebook.a import x\r\nfrom open_notebook.a import (\r\n    y,\r\n)\r\n",
        "community/frontend/src/c.ts": "import { r } from '@siet/platform/lib/roles'\r\nexport const z = 1\r\n",
        "siet-platform/frontend/src/lib/roles.ts": "export const r = 1\r\n",
    })
    apply(root, config(symbol_moves={"siet_core.a.y": "siet_platform.other.y"}))
    assert (root / "community/siet_community/c.py").read_bytes() == (
        b"from siet_core.a import x\r\nfrom siet_platform.other import y\r\n"
    )
    assert (root / "community/frontend/src/c.ts").read_bytes() == (
        b"import { r } from '@/lib/roles'\r\nexport const z = 1\r\n"
    )
    assert (root / "platform/siet_core/a.py").read_bytes() == b"x = 1\r\ny = 2\r\n"


def test_ts_multiline_and_type_imports(tmp_path):
    root = make_repo(tmp_path / "r", {
        "siet-platform/frontend/src/lib/api/community.ts": "export const a = 1\nexport type T = number\n",
        "community/frontend/src/x.tsx": dedent("""
            import {
              a,
              b,
            } from '@siet/platform/lib/api/community'
            import type { T } from '@siet/platform/lib/api/community'
            import * as api from "@siet/platform/lib/api/community"
            // a comment that mentions '@siet/platform/nothing' is not an import
            const note = 'plain string @siet/platform/lib/api/community'
        """),
    })
    apply(root)
    text = read(root, "community/frontend/src/x.tsx")
    assert "} from '@/lib/api/community'" in text
    assert "import type { T } from '@/lib/api/community'" in text
    assert 'import * as api from "@/lib/api/community"' in text
    assert "const note = 'plain string @siet/platform/lib/api/community'" in text


def test_module_rename_keeps_a_multiline_import_as_it_was(tmp_path):
    body = dedent("""
        from open_notebook.a import (  # keep me
            x,
            y,  # why
        )
    """)
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = y = 1\n",
        "open-notebook/api/m.py": body,
    })
    apply(root)
    assert read(root, "platform/api/m.py") == body.replace("open_notebook", "siet_core")


def test_import_lists_and_aliases(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/open_notebook/__init__.py": "",
        "open-notebook/open_notebook/a.py": "x = 1\n",
        "open-notebook/api/m.py": dedent("""
            import os, open_notebook.a, json
            import open_notebook
            import open_notebook as on
            import open_notebook.a as a
            from open_notebook import a as aa, config
            from open_notebook.a import *
            x = open_notebook.a.x
        """),
    })
    apply(root)
    assert read(root, "platform/api/m.py") == dedent("""
        import os, siet_core.a, json
        import siet_core
        import siet_core as on
        import siet_core.a as a
        from siet_core import a as aa, config
        from siet_core.a import *
        x = siet_core.a.x
    """)


def test_hand_check_report(tmp_path):
    root = make_repo(tmp_path / "r", {
        "siet-platform/siet_platform/__init__.py": "",
        "siet-platform/siet_platform/features/__init__.py": "",
        "siet-platform/siet_platform/features/domain.py": "class QuizSession: ...\n",
        "community/siet_community/u.py": dedent("""
            from siet_platform.features import domain
            s = domain.QuizSession()
        """),
        "Makefile": "run:\n\tcd open-notebook && uv run x\n\tcd My-ai-quiz && npm start\n",
        "community/tests/conftest.py": 'ROOT = Path(__file__).parents[2] / "open-notebook"\n',
    })
    cfg = config(symbol_moves={"siet_platform.features.domain.QuizSession": "siet_quiz.domain.QuizSession"})
    code, lines = apply(root, cfg)
    assert code == 0
    out = "\n".join(lines)
    assert "check by hand: community/siet_community/u.py: QuizSession now lives in siet_quiz.domain.QuizSession" in out
    assert "check by hand: Makefile: still mentions My-ai-quiz/open-notebook (2x)" in out
    assert "check by hand: community/tests/conftest.py: still mentions open-notebook (1x)" in out
    # the report never changes the verdict: the second run is clean
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "x")
    assert apply(root, cfg, check=True)[0] == 0


def test_hand_check_does_not_flag_words_that_are_new_directories(tmp_path):
    root = make_repo(tmp_path / "r", {
        "platform/siet_platform/features/quiz.py": "x = 1\n",
        "Makefile": "# the platform layer\nrun:\n\tcd platform && uv run x\n",
    })
    cfg = config(extra_moves=[("platform/siet_platform/features/quiz.py", "my-ai-quiz/siet_quiz/quiz.py")])
    code, lines = apply(root, cfg)
    assert code == 0
    assert not any(line.startswith("check by hand") for line in lines), lines


def test_ts_index_extension_and_asset_specifiers(tmp_path):
    root = make_repo(tmp_path / "r", {
        "open-notebook/frontend/src/components/ui/index.ts": "export const ui = 1\n",
        "open-notebook/frontend/src/styles/x.css": "a {}\n",
        "siet-platform/frontend/src/styles/siet.css": "b {}\n",
        "siet-platform/frontend/src/data.json": "{}\n",
        "community/frontend/src/c.tsx": dedent("""
            import { ui } from '@/components/ui'
            import { ui as ui2 } from '@siet/platform/components/ui'
            import '@/styles/x.css'
            import '@siet/platform/styles/siet.css'
            import data from '@siet/platform/data.json'
            import missing from '@siet/platform/does/not/exist'
        """),
    })
    apply(root)
    assert read(root, "community/frontend/src/c.tsx") == dedent("""
        import { ui } from '@/components/ui'
        import { ui as ui2 } from '@/components/ui'
        import '@/styles/x.css'
        import '@/styles/siet.css'
        import data from '@/data.json'
        import missing from '@/does/not/exist'
    """)
    assert (root / "platform/frontend/src/components/ui/index.ts").exists()
    assert (root / "platform/frontend/src/data.json").exists()


def test_tracked_symlink_moves_with_its_directory(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    (root / "open-notebook/frontend").mkdir(parents=True)
    (root / "shared").mkdir()
    (root / "shared/a.ts").write_text("export const a = 1\n")
    os.symlink("../../shared", root / "open-notebook/frontend/shared")
    make_repo(root, {"open-notebook/frontend/src/a.ts": "export const a = 1\n"})
    assert apply(root)[0] == 0
    assert (root / "platform/frontend/shared").is_symlink()
    assert not (root / "open-notebook/frontend/shared").is_symlink()
    assert "platform/frontend/shared" in tracked(root)


def test_move_into_the_repo_root(tmp_path):
    root = make_repo(tmp_path / "r", {"sub/a.txt": "a\n", "sub/b.txt": "b\n"})
    code, _ = apply(root, config(extra_moves=[("sub/a.txt", "a.txt")]))
    assert code == 0
    assert read(root, "a.txt") == "a\n"
    assert (root / "sub/b.txt").exists()
    assert "a.txt" in tracked(root)


def test_verbose_lists_every_move(tmp_path):
    root = make_repo(tmp_path / "r", {"open-notebook/api/a.py": "", "open-notebook/api/b.py": ""})
    done = cli(root, "--check", "-v")
    assert done.returncode == 1
    assert "open-notebook/api/a.py -> platform/api/a.py" in done.stdout
    assert "open-notebook/api/b.py -> platform/api/b.py" in done.stdout


# ---------------------------------------------------------------- the real move table


def test_move_table_is_consistent():
    cfg = codemod.Config.from_moves()
    cfg.validate()
    olds = [old for old, _ in cfg.moves]
    assert len(olds) == len(set(olds)), "duplicate old path"
    plan = codemod.Plan(cfg, [], set())
    samples = {
        "open-notebook/open_notebook/domain/notebook.py": "platform/siet_core/domain/notebook.py",
        "open-notebook/api/routers/x.py": "platform/api/routers/x.py",
        "open-notebook/commands/a.py": "platform/commands/a.py",
        "open-notebook/prompts/ask/entry.jinja": "platform/prompts/ask/entry.jinja",
        "open-notebook/tests/test_a.py": "platform/tests/test_a.py",
        "open-notebook/frontend/src/app/page.tsx": "platform/frontend/src/app/page.tsx",
        "open-notebook/pyproject.toml": "platform/pyproject.toml",
        "siet-platform/siet_platform/auth.py": "platform/siet_platform/auth.py",
        "siet-platform/tests/test_b.py": "platform/tests-platform/test_b.py",
        "siet-platform/frontend/src/lib/roles.ts": "platform/frontend/src/lib/roles.ts",
        "siet-platform/frontend/package.json": "platform/frontend/package.json",
        "My-ai-quiz/src/app/page.tsx": "my-ai-quiz/app/src/app/page.tsx",
        "ai-roadmap-generator/src/a.ts": "ai-roadmap/app/src/a.ts",
        "kmitl-rag/kmitl_rag/ask.py": "kmitl-rag/kmitl_rag/ask.py",
        "community/siet_community/a.py": "community/siet_community/a.py",
        "docs/README.md": "docs/README.md",
    }
    for old, new in samples.items():
        assert plan.final_path(old)[0] == new, old
        assert plan.final_path(new)[0] == new, f"not a fixed point: {new}"
    # a path component is not a string prefix
    assert plan.final_path("open-notebook-extra/x.py")[0] == "open-notebook-extra/x.py"
    # the alias tables line up with the global constraints
    assert cfg.ts_aliases_new["platform/frontend/src"] == "@/"
    assert "@siet/platform/" not in cfg.ts_aliases_new.values()
    assert cfg.module_renames == {"open_notebook": "siet_core"}
    assert cfg.entry_point_group == ("open_notebook.extensions", "siet.extensions")


NOTEBOOK_COMPONENTS_OLD = "open-notebook/frontend/src/app/(dashboard)/notebooks/components"


def test_notebook_page_components_are_one_directory_rule_with_two_exceptions():
    cfg = codemod.Config.from_moves()
    plan = codemod.Plan(cfg, [], set())
    rules = [(old, new) for old, new in cfg.moves if old.startswith(NOTEBOOK_COMPONENTS_OLD)]
    assert len(rules) == 3, rules  # the directory and the two NoteEditorDialog files
    # a file nobody listed (a teammate's new component) follows the directory
    for name in ("BrandNew.tsx", "BrandNew.test.tsx", "hooks/useThing.ts"):
        assert plan.final_path(f"{NOTEBOOK_COMPONENTS_OLD}/{name}")[0] == \
            f"kmitl-rag/frontend/src/app/(dashboard)/notebooks/components/{name}"
    # ModalProvider (host) opens NoteEditorDialog, so it stays in the host
    for name in ("NoteEditorDialog.tsx", "NoteEditorDialog.test.tsx"):
        assert plan.final_path(f"{NOTEBOOK_COMPONENTS_OLD}/{name}")[0] == \
            f"platform/frontend/src/app/(dashboard)/notebooks/components/{name}"
    # the table lists nothing per component any more
    for name in ("ChatColumn", "NotebookCard", "NotesColumn", "SourcesColumn"):
        assert not any(name in old for old, _ in cfg.moves), name


def test_no_move_source_is_a_path_that_still_exists():
    """MOVES is keyed by old-layout paths: the host keeps a route stub at several new paths
    (platform/frontend/src/app/...), and a rule keyed at a stub would move the stub on every run."""
    done = subprocess.run(["git", "ls-files", "-z"], cwd=HERE.parents[1], capture_output=True, text=True)
    if done.returncode != 0:
        pytest.skip("not a git checkout")
    present = [p for p in done.stdout.split("\0") if p]
    clashes = [
        f"{old} -> {new}: {p}"
        for old, new in moves.MOVES
        for p in present
        if p == old.strip("/") or p.startswith(old.strip("/") + "/")
    ]
    assert not clashes, "\n".join(clashes[:10])


def test_malformed_rules_are_refused():
    for bad in [("a", ""), ("", "a"), ("a", "a"), ("../a", "b")]:
        with pytest.raises(ValueError):
            config(extra_moves=[bad]).validate()
    with pytest.raises(ValueError):
        config(extra_moves=[("open-notebook/api", "elsewhere")]).validate()  # duplicate old path
    lines: list[str] = []
    assert codemod.run(".", config(extra_moves=[("a", "a")]), check=True, out=lines.append) == 2
    assert lines and lines[0].startswith("error:")


def test_cycle_in_the_table_is_refused():
    cfg = config(extra_moves=[("a/x", "b/x"), ("b/x", "a/x")])
    with pytest.raises(ValueError):
        cfg.validate()
    cfg = config(extra_moves=[("a/x", "a/x/y")])
    with pytest.raises(ValueError):
        codemod.Plan(cfg, [], set()).final_path("a/x/z")


def test_cli_exit_two_outside_a_repo(tmp_path):
    env = {**os.environ, "GIT_CEILING_DIRECTORIES": str(tmp_path.parent)}
    done = subprocess.run([sys.executable, str(HERE / "codemod.py"), "--check"],
                          cwd=tmp_path, capture_output=True, text=True, env=env)
    assert done.returncode == 2
