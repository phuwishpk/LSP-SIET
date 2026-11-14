#!/usr/bin/env python3
"""List the API and frontend routes of the repo, and diff them against the baseline.

    python scripts/lsp-siet/routes.py api              # METHOD /path, sorted
    python scripts/lsp-siet/routes.py api --ordered    # METHOD /path, in registration order
    python scripts/lsp-siet/routes.py frontend         # URL path of every page/route file, sorted
    python scripts/lsp-siet/routes.py diff api         # unified diff against docs/lsp-siet/baseline/api-routes.txt
    python scripts/lsp-siet/routes.py diff frontend    # ... against .../frontend-routes.txt

``api`` imports ``api.main:app`` and lists its FastAPI ``APIRoute`` objects, one line per
method. It must run with the Python project's virtualenv (the one the backend tests
use), for example:

    export UV_PROJECT_ENVIRONMENT=$WT/../venv-lsp
    $UV_PROJECT_ENVIRONMENT/bin/python scripts/lsp-siet/routes.py api

Importing the app loads the installed ``siet.extensions`` / ``open_notebook.extensions``
entry points, so the SIET routers are part of the list. ``.env`` loading is switched
off (``PYTHON_DOTENV_DISABLED=1``) and nothing is written to disk. The one environment
variable that changes which routes exist, ``SIET_ENABLE_PODCASTS`` (it keeps the
podcast routers instead of dropping them), is removed first, so the list is always the
default build's, whatever the caller's shell has set.

``frontend`` walks the host app directory (``platform/frontend/src/app`` when it exists,
else ``open-notebook/frontend/src/app``) and turns every ``page.*`` / ``route.*`` file
into its URL path: route groups ``(x)`` are dropped, dynamic segments like ``[id]`` are
kept, the root is ``/``. One line per file, so two files that resolve to the same URL
show up as two identical lines.

``diff`` always exits 0; an empty output means "no change from the baseline".
"""

from __future__ import annotations

import contextlib
import difflib
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "docs" / "lsp-siet" / "baseline"

ROUTE_FILE = re.compile(r"^(page|route)\.(tsx|ts|jsx|js)$")
GROUP = re.compile(r"^\(.*\)$")


def _first_existing(*candidates: Path) -> Path:
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    raise SystemExit("none of these directories exist: " + ", ".join(str(c) for c in candidates))


def python_project() -> Path:
    """The Python project that holds ``api/`` (``open-notebook/`` before the move, ``platform/`` after)."""
    return _first_existing(ROOT / "platform", ROOT / "open-notebook")


def frontend_app_dir() -> Path:
    return _first_existing(
        ROOT / "platform" / "frontend" / "src" / "app",
        ROOT / "open-notebook" / "frontend" / "src" / "app",
    )


def api_routes(ordered: bool = False) -> list[str]:
    project = python_project()
    os.environ["PYTHON_DOTENV_DISABLED"] = "1"
    os.environ.pop("SIET_ENABLE_PODCASTS", None)
    sys.path.insert(0, str(project))
    os.chdir(project)
    try:
        from loguru import logger

        logger.remove()
        logger.add(sys.stderr, level="ERROR")
    except ImportError:
        pass
    # Anything the app prints while it is imported must not end up in the route list.
    with contextlib.redirect_stdout(sys.stderr):
        from fastapi.routing import APIRoute

        from api.main import app

    lines: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted(route.methods or ()):
            lines.append(f"{method} {route.path}")
    return lines if ordered else sorted(lines)


def frontend_routes() -> list[str]:
    app_dir = frontend_app_dir()
    urls: list[str] = []
    for path in app_dir.rglob("*"):
        if not path.is_file() or not ROUTE_FILE.match(path.name):
            continue
        segments = [s for s in path.relative_to(app_dir).parent.parts if not GROUP.match(s)]
        urls.append("/" + "/".join(segments))
    return sorted(urls)


def current(kind: str, ordered: bool = False) -> list[str]:
    if kind == "api":
        return api_routes(ordered)
    if kind == "frontend":
        return frontend_routes()
    raise SystemExit(f"unknown kind {kind!r}: use api or frontend")


def emit(lines: list[str]) -> None:
    sys.stdout.write("".join(line + "\n" for line in lines))


def diff(kind: str) -> None:
    baseline_file = BASELINE / f"{kind}-routes.txt"
    if not baseline_file.is_file():
        raise SystemExit(f"missing baseline {baseline_file}")
    old = baseline_file.read_text().splitlines()
    new = current(kind)
    sys.stdout.writelines(
        line + "\n"
        for line in difflib.unified_diff(
            old,
            new,
            fromfile=str(baseline_file.relative_to(ROOT)),
            tofile=f"current {kind} routes",
            lineterm="",
        )
    )


def main(argv: list[str]) -> int:
    args = argv[1:]
    usage = "usage: routes.py api [--ordered] | frontend | diff api|frontend"
    if args[:1] == ["api"] and args[1:] in ([], ["--ordered"]):
        emit(api_routes(ordered=bool(args[1:])))
    elif args == ["frontend"]:
        emit(frontend_routes())
    elif len(args) == 2 and args[0] == "diff":
        diff(args[1])
    else:
        print(usage, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
