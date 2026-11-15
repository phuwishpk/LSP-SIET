"""Guard: nothing a user, teammate or operator reads says "Open Notebook".

The repo started as a fork of Open Notebook and is now LSP-SIET. This test greps every
tracked text file for ``open[ _-]?notebook`` (any case: ``Open Notebook``, ``open-notebook``,
``open_notebook``, ``OPEN_NOTEBOOK_*``, ``OpenNotebookError``, ``openNotebook``) and fails on
any match that is not either

* in a path that is excluded as a whole (``EXCLUDED``: licence text, migration history, the
  owner's thesis writing, historical hand-off notes, this restructure's own plan/spec/tooling), or
* a line that has to keep the old name for compatibility (``ALLOWED``: one entry per kind, each
  scoped to the files it can occur in and to the exact text, with the reason it must stay).

Adding to either list is a decision: put the reason next to the entry. A second test fails on
an ``ALLOWED`` entry that no longer matches anything, so the list cannot rot.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PATTERN = r"open[ _-]?notebook"

# Whole paths (git pathspecs) that are not scanned, each with the reason.
EXCLUDED: list[tuple[str, str]] = [
    ("platform/NOTICE", "MIT licence text of the Open Notebook code this project includes; legally required"),
    (
        "platform/siet_core/database/migrations/",
        "SurrealDB migration history; files are applied by number and the record ids in them are live data",
    ),
    (
        "platform/siet_platform/migrations/",
        "SIET migration history (k-track) and the one-time split from the old migration table",
    ),
    ("docs/superpowers/", "specs and plans of this restructure; they describe the rename itself"),
    ("docs/lsp-siet/", "baseline measurements taken before the rename"),
    ("scripts/lsp-siet/", "the codemod, its tests and this guard: they name the old names on purpose"),
    ("docs/report/", "the thesis report and its evaluation results (written and measured under the old name; test_stack.py there still names the old image and container)"),
    (
        "docs-thesis*/**",
        "the thesis chapters (docs-thesis/, docs-thesis-*/): the authors' own writing, not edited by the restructure",
    ),
    ("reportfix.md", "progress note of 2026-10-23 about the earlier code split and the upstream PRs; history only"),
    (
        "docs/handoff/pr-drafts/",
        "PR descriptions of merged work (before the restructure), listing the paths as they were then",
    ),
    ("docs/handoff/after-community-merge.md", "merge checklist of 2026-10, with the pre-restructure paths"),
    ("docs/handoff/siet-split.md", "hand-off of the 2026-10-23 code split, with the pre-restructure paths"),
    (
        "docs/handoff/lsp-siet.md",
        "the teammates' conversion guide: its job is to name the old layout, env names and identifiers next to the new ones",
    ),
    ("**/uv.lock", "generated lock file"),
    ("**/package-lock.json", "generated lock file"),
]

# (path regex, line regex, reason). A hit is allowed when both match; paths are matched in full.
ALLOWED: list[tuple[str, str, str]] = [
    # --- settings: the old OPEN_NOTEBOOK_* names are still read when the new one is unset ---
    (
        r"platform/siet_core/env\.py|platform/frontend/src/lib/env(\.test)?\.ts"
        r"|my-ai-quiz/app/app/lib/env\.ts|ai-roadmap/app/src/lib/env\.js",
        r"OPEN_NOTEBOOK_",
        "env fallback: the LEGACY_NAMES / ENV_RENAMES tables and the code around them. A production "
        ".env that still uses the old names must keep working (stored credentials depend on "
        "OPEN_NOTEBOOK_ENCRYPTION_KEY)",
    ),
    (
        r"docker-compose(-dev|\.prod)?\.yml",
        r"\$\{OPEN_NOTEBOOK_[A-Z0-9_]+(:-[^}]*)?\}",
        "compose fallback: LSP_SIET_X=${LSP_SIET_X:-${OPEN_NOTEBOOK_X:-default}} so an old .env still reaches the container",
    ),
    (
        r"docker/allinone/rootfs/etc/s6-overlay/s6-rc\.d/quiz/run",
        r"OPEN_NOTEBOOK_PASSWORD",
        "env fallback in the all-in-one quiz service (old .env password still reaches the quiz app)",
    ),
    (
        r"(community|kmitl-rag|my-ai-quiz|ai-roadmap)/tests/conftest\.py|platform/tests(-platform)?/conftest\.py",
        r'os\.environ\["OPEN_NOTEBOOK_PASSWORD"\]',
        "tests blank the old password name too: it is a fallback for LSP_SIET_PASSWORD",
    ),
    (
        r"platform/tests/test_(env_fallback|credentials_old_key|encryption|auth|max_body_size_middleware)\.py",
        r"OPEN_NOTEBOOK_",
        "tests of the fallback itself (and tests that must clear the old name so a developer's shell cannot leak in)",
    ),
    # --- SurrealDB: the namespace and database are called open_notebook in every deployed database ---
    (
        r".*",
        r"SURREAL_(NAMESPACE|DATABASE)",
        "SurrealDB namespace/database default and settings (compose, Dockerfile, .env.example, backup and "
        "migration scripts, docs). Renaming them would point the API at an empty database",
    ),
    (
        r"platform/tests/test_repository_config\.py",
        r'get_database_(namespace|name)\(\) == "open_notebook"',
        "test of the namespace/database default",
    ),
    (
        r"docker/allinone/rootfs/usr/local/bin/lsp-backup",
        r"--ns open_notebook --db open_notebook",
        "usage example of the surreal export flags (namespace/database)",
    ),
    (
        r"docs/SYSTEM-GUIDE\.md",
        r"namespace/database `open_notebook`",
        "heading of the SurrealDB section: names the namespace/database",
    ),
    # --- persisted record ids and table: the single-record table `open_notebook` lives in the database ---
    (
        r".*",
        r"open_notebook:(default_models|content_settings|provider_configs|default_prompts)",
        "record ids of the settings table `open_notebook` (SurrealDB data and migrations); a rename would orphan the rows",
    ),
    (
        r"platform/siet_core/domain/provider_config\.py|platform/siet_core/domain/notebook\.py",
        r'"open_notebook"',
        "table name `open_notebook` passed to repo_upsert, and the surreal-commands app name passed to submit_command",
    ),
    # --- surreal-commands: jobs are queued in the database as '<app>.<command>' ---
    (
        r"platform/commands/(embedding_commands|source_commands|__init__)\.py",
        r"open_notebook",
        "surreal-commands app name (@command(..., app=\"open_notebook\"), the submit_command calls and the note "
        "in commands/__init__): queued jobs are stored as open_notebook.<command>; renaming strands them and "
        "the worker would not find the commands",
    ),
    (
        r"platform/api/(command_service|credentials_service)\.py|platform/api/routers/commands\.py"
        r"|kmitl-rag/kmitl_rag/routers/(embedding|embedding_rebuild|sources)\.py",
        r"open_notebook",
        "surreal-commands app name used when submitting or querying jobs (and its docstrings)",
    ),
    (
        r"platform/tests/test_[a-z_]+\.py|kmitl-rag/tests/test_[a-z_]+\.py",
        r'"open_notebook",|"open_notebook\.(process_source|run_transformation|embed_note|embed_insight|embed_source|create_insight)"',
        "tests that look up or submit the surreal-commands jobs by their stored name",
    ),
    # --- tokens and encryption: values baked into issued tokens and stored ciphertext ---
    (
        r"platform/siet_platform/auth_jwt\.py",
        r'JWT_ISSUER = "open-notebook-workspace"',
        "JWT issuer claim: tokens already issued carry it, changing it logs everybody out",
    ),
    (
        r"platform/siet_core/utils/encryption\.py",
        r'PBKDF2_SALT: bytes = b"open-notebook-credential-v1"',
        "key-derivation salt of the stored provider credentials: changing it makes them undecryptable",
    ),
    (
        r"platform/siet_core/env\.py",
        r"JWT_ISSUER, PBKDF2_SALT",
        "comment explaining the two values above and the namespace that must not be renamed",
    ),
    (
        r"platform/AGENTS\.md",
        r"Values that must keep the old name",
        "maintainer rule that lists exactly the values this guard allows (and why)",
    ),
]


def _exclude_spec(path: str) -> str:
    return f":(exclude,glob){path}" if "*" in path else f":(exclude){path}"


def _git_grep(pattern: str = PATTERN) -> list[tuple[str, int, str]]:
    args = ["git", "grep", "-z", "-n", "-i", "-I", "-E", pattern, "--", "."]
    args += [_exclude_spec(path) for path, _reason in EXCLUDED]
    done = subprocess.run(args, cwd=REPO, capture_output=True, check=False)
    assert done.returncode in (0, 1), done.stderr.decode()
    hits: list[tuple[str, int, str]] = []
    # with -z every record is  path NUL lineno NUL text NEWLINE
    for record in done.stdout.decode("utf-8", "replace").split("\n"):
        if record:
            path, lineno, text = record.split("\0", 2)
            hits.append((path, int(lineno), text))
    return hits


def _is_allowed(path: str, text: str) -> bool:
    return any(re.fullmatch(p, path) and re.search(t, text) for p, t, _reason in ALLOWED)


def test_no_open_notebook_left() -> None:
    left = [f"{p}:{n}: {t.strip()[:140]}" for p, n, t in _git_grep() if not _is_allowed(p, t)]
    assert not left, (
        f"{len(left)} place(s) still say Open Notebook (rename them, or add an ALLOWED entry with the reason):\n"
        + "\n".join(left[:80])
    )


def test_every_allowed_entry_still_matches_something() -> None:
    hits = _git_grep()
    stale = [
        f"{p!r} / {t!r}"
        for p, t, _reason in ALLOWED
        if not any(re.fullmatch(p, path) and re.search(t, text) for path, _n, text in hits)
    ]
    assert not stale, "ALLOWED entries that match nothing any more (delete them):\n" + "\n".join(stale)


def test_excluded_paths_exist() -> None:
    tracked = subprocess.run(
        ["git", "ls-files", "-z"], cwd=REPO, capture_output=True, check=True
    ).stdout.decode("utf-8", "replace").split("\0")
    for path, _reason in EXCLUDED:
        prefix = path.split("*", 1)[0]
        if prefix:  # "**/uv.lock" has no fixed prefix: it is a pattern, not a place
            assert any(f.startswith(prefix) for f in tracked), f"excluded path {path!r} matches no tracked file"


def test_no_link_to_the_upstream_repository() -> None:
    """The product no longer points at (or tracks) the project it was forked from."""
    links = [f"{p}:{n}: {t.strip()[:140]}" for p, n, t in _git_grep(r"github\.com/lfnovo")]
    assert not links, "links to the upstream repository:\n" + "\n".join(links)
