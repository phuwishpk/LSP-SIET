#!/usr/bin/env python3
"""Rewrite imports from the pre-split layout to the SIET packages.

Before the split all KMITL code lived inside open-notebook/ (open_notebook.community,
api.routers.community, ...). It now lives in siet-platform/, kmitl-rag/ and
community/. Run this on a branch that still uses the old paths:

    python3 scripts/siet-split/codemod.py            # rewrite in place
    python3 scripts/siet-split/codemod.py --check    # list what would change

Python: dotted module names are rewritten everywhere (imports, monkeypatch strings).
TypeScript: "@/..." import specifiers of moved frontend files are rewritten.
Symbols that moved out of a split module (e.g. the RAG routes of the community
router) are listed in SYMBOL_MOVES; the script reports them instead of guessing.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Old dotted module -> new dotted module. Longest keys are applied first.
MODULE_MAP: dict[str, str] = {
    # platform: accounts, auth, points, throttling, usage, cache, schema
    "open_notebook.domain.user": "siet_platform.users",
    "api.auth_jwt": "siet_platform.auth_jwt",
    "api.auth_roles": "siet_platform.auth_roles",
    "api.login_guard": "siet_platform.login_guard",
    "api.routers.users": "siet_platform.routers.users",
    "api.routers.google_auth": "siet_platform.routers.google_auth",
    "open_notebook.cache": "siet_platform.cache",
    "open_notebook.community.points": "siet_platform.points",
    "open_notebook.community.throttle": "siet_platform.throttle",
    "open_notebook.community.usage": "siet_platform.usage",
    "open_notebook.community.pricing": "siet_platform.pricing",
    "open_notebook.community.ratelimit": "siet_platform.ratelimit",
    "open_notebook.community.schema": "siet_platform.schema",
    # platform: course library and retrieval over it
    "open_notebook.community.library": "siet_platform.library",
    "open_notebook.community.retrieval": "siet_platform.retrieval",
    # platform: AI quiz / roadmap
    "open_notebook.domain.features": "siet_platform.features.domain",
    "open_notebook.features.service": "siet_platform.features.service",
    "open_notebook.features": "siet_platform.features",
    "api.routers.features": "siet_platform.routers.features",
    # KMITL RAG
    "open_notebook.community.ask": "kmitl_rag.ask",
    "open_notebook.community.grounding": "kmitl_rag.grounding",
    # community
    "open_notebook.community.repository": "siet_community.repository",
    "open_notebook.community.moderation": "siet_community.moderation",
    "open_notebook.community.catalog": "siet_community.catalog",
    "open_notebook.community.roadmap_plan": "siet_community.roadmap_plan",
    "api.routers.community": "siet_community.routers.community",
    "api.routers.admin": "siet_community.routers.admin",
}

# `from open_notebook.community import points` style imports of a package
# attribute. (package, name) -> new module that provides `name`.
FROM_PACKAGE_MAP: dict[tuple[str, str], str] = {
    ("open_notebook.community", "points"): "siet_platform",
    ("open_notebook.community", "throttle"): "siet_platform",
    ("open_notebook.community", "usage"): "siet_platform",
    ("open_notebook.community", "pricing"): "siet_platform",
    ("open_notebook.community", "ratelimit"): "siet_platform",
    ("open_notebook.community", "schema"): "siet_platform",
    ("open_notebook.community", "library"): "siet_platform",
    ("open_notebook.community", "retrieval"): "siet_platform",
    ("open_notebook.community", "ask"): "kmitl_rag",
    ("open_notebook.community", "grounding"): "kmitl_rag",
    ("open_notebook.community", "repository"): "siet_community",
    ("open_notebook.community", "moderation"): "siet_community",
    ("open_notebook.community", "catalog"): "siet_community",
    ("open_notebook.community", "roadmap_plan"): "siet_community",
    ("open_notebook.features", "service"): "siet_platform.features",
    ("api.routers", "users"): "siet_platform.routers",
    ("api.routers", "google_auth"): "siet_platform.routers",
    ("api.routers", "features"): "siet_platform.routers",
    ("api.routers", "community"): "siet_community.routers",
    ("api.routers", "admin"): "siet_community.routers",
}

# Symbols that left a module which still exists under its new name. The codemod
# only reports uses of these; fix them by hand with the hint.
SYMBOL_MOVES: dict[str, str] = {
    # community repository -> RAG history / platform notifications
    "siet_community.repository.create_rag_session": "kmitl_rag.history",
    "siet_community.repository.get_rag_session": "kmitl_rag.history",
    "siet_community.repository.reserve_rag_credit": "kmitl_rag.history",
    "siet_community.repository.release_rag_credit": "kmitl_rag.history",
    "siet_community.repository.save_rag_messages": "kmitl_rag.history",
    "siet_community.repository.update_rag_session": "kmitl_rag.history",
    "siet_community.repository.conversation_title": "kmitl_rag.history",
    "siet_community.repository.create_conversation": "kmitl_rag.history",
    "siet_community.repository.get_conversation": "kmitl_rag.history",
    "siet_community.repository.list_conversations": "kmitl_rag.history",
    "siet_community.repository.list_messages": "kmitl_rag.history",
    "siet_community.repository.append_messages": "kmitl_rag.history",
    "siet_community.repository.rename_conversation": "kmitl_rag.history",
    "siet_community.repository.delete_conversation": "kmitl_rag.history",
    "siet_community.repository.rag_stats": "kmitl_rag.history",
    "siet_community.repository.add_notification": "siet_platform.notifications",
    "siet_community.repository.list_notifications": "siet_platform.notifications",
    "siet_community.repository.mark_notifications_read": "siet_platform.notifications",
    "siet_community.moderation.log_action": "siet_platform.audit",
    "siet_community.moderation.list_audit": "siet_platform.audit",
    # routers split by owner
    "siet_community.routers.community.ask": "kmitl_rag.routers.ask",
    "siet_community.routers.community.list_knowledge": "kmitl_rag.routers.ask",
    "siet_community.routers.community.AskBody": "kmitl_rag.routers.ask",
    "siet_community.routers.community._INFLIGHT": "kmitl_rag.routers.ask",
    "siet_community.routers.community._resolve_scope": "siet_platform.http",
    "siet_community.routers.community._resolve_pick": "siet_platform.http",
    "siet_community.routers.admin.rag_stats": "kmitl_rag.routers.admin",
    "siet_platform.features.service.notebook_ask": "kmitl_rag.notebook_ask",
    "api.routers.chat._filter_url_citations": "kmitl_rag.chat_filters",
    "api.routers.chat._verify_course_codes": "kmitl_rag.chat_filters",
    "api.routers.chat._pin_relevant_excerpts": "kmitl_rag.chat_filters",
    "open_notebook.domain.notebook.GlobalChatSession": "kmitl_rag.global_chat",
    "open_notebook.domain.notebook.vector_search_in_notebook": "siet_platform.retrieval",
    "open_notebook.utils.embedding.cached_generate_embeddings": "siet_platform.cache.embeddings",
}

# Frontend: "@/old/path" (without extension) -> "@siet/<pkg>/new/path".
TS_MAP: dict[str, str] = {}

PY_GLOBS = ["open-notebook/**/*.py", "siet-platform/**/*.py", "kmitl-rag/**/*.py", "community/**/*.py"]
TS_GLOBS = [
    "open-notebook/frontend/src/**/*.ts",
    "open-notebook/frontend/src/**/*.tsx",
    "siet-platform/frontend/src/**/*.ts",
    "siet-platform/frontend/src/**/*.tsx",
    "kmitl-rag/frontend/src/**/*.ts",
    "kmitl-rag/frontend/src/**/*.tsx",
    "community/frontend/src/**/*.ts",
    "community/frontend/src/**/*.tsx",
]
SKIP_PARTS = {".venv", "node_modules", ".next", "__pycache__"}


def _module_pattern(old: str) -> re.Pattern[str]:
    return re.compile(r"(?<![\w.])" + re.escape(old) + r"(?![\w])")


def rewrite_python(text: str) -> str:
    for (pkg, name), new_pkg in FROM_PACKAGE_MAP.items():
        # from pkg import a, name, b  ->  split `name` onto its own line
        pattern = re.compile(
            r"^(?P<indent>[ \t]*)from " + re.escape(pkg) + r" import (?P<names>[^\n()]+)$",
            re.M,
        )

        def _split(match: re.Match[str], pkg=pkg, name=name, new_pkg=new_pkg) -> str:
            parts = [p.strip() for p in match.group("names").split(",") if p.strip()]
            moved = [p for p in parts if p.split(" as ")[0].strip() == name]
            if not moved:
                return match.group(0)
            kept = [p for p in parts if p not in moved]
            indent = match.group("indent")
            lines = [f"{indent}from {new_pkg} import {m}" for m in moved]
            if kept:
                lines.insert(0, f"{indent}from {pkg} import {', '.join(kept)}")
            return "\n".join(lines)

        text = pattern.sub(_split, text)
    for old in sorted(MODULE_MAP, key=len, reverse=True):
        text = _module_pattern(old).sub(MODULE_MAP[old], text)
    return text


def rewrite_ts(text: str) -> str:
    for old in sorted(TS_MAP, key=len, reverse=True):
        text = re.sub(
            r"""(['"])""" + re.escape(old) + r"""(['"/])""",
            lambda m, new=TS_MAP[old]: m.group(1) + new + m.group(2),
            text,
        )
    return text


def files(globs: list[str]) -> list[Path]:
    out: list[Path] = []
    for pattern in globs:
        for path in ROOT.glob(pattern):
            if path.is_file() and not SKIP_PARTS.intersection(path.parts):
                out.append(path)
    return sorted(set(out))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="report only, write nothing")
    parser.add_argument(
        "--targets",
        help="comma-separated new-module prefixes to apply (default: all), e.g. siet_platform",
    )
    parser.add_argument("paths", nargs="*", help="limit to these files")
    args = parser.parse_args()
    if args.targets:
        keep = tuple(t.strip() for t in args.targets.split(",") if t.strip())
        for mapping in (MODULE_MAP, FROM_PACKAGE_MAP):
            for key in [k for k, v in mapping.items() if not v.startswith(keep)]:
                del mapping[key]

    py_files = [Path(p).resolve() for p in args.paths if p.endswith(".py")] or files(PY_GLOBS)
    ts_files = [Path(p).resolve() for p in args.paths if p.endswith((".ts", ".tsx"))]
    if not args.paths:
        ts_files = files(TS_GLOBS)

    changed: list[Path] = []
    for path, rewrite in [(p, rewrite_python) for p in py_files] + [(p, rewrite_ts) for p in ts_files]:
        before = path.read_text(encoding="utf-8")
        after = rewrite(before)
        if after != before:
            changed.append(path)
            if not args.check:
                path.write_text(after, encoding="utf-8")

    leftovers: list[str] = []
    for path in py_files:
        text = path.read_text(encoding="utf-8")
        for symbol, home in SYMBOL_MOVES.items():
            module, _, name = symbol.rpartition(".")
            alias = module.rpartition(".")[2]
            if re.search(rf"\b{re.escape(alias)}\.{re.escape(name)}\b", text) or re.search(
                rf"from {re.escape(module)} import [^\n]*\b{re.escape(name)}\b", text
            ):
                leftovers.append(f"{path.relative_to(ROOT)}: {name} now lives in {home}")

    verb = "would change" if args.check else "changed"
    for path in changed:
        print(f"{verb}: {path.relative_to(ROOT)}")
    for line in leftovers:
        print(f"check by hand: {line}")
    return 1 if args.check and changed else 0


if __name__ == "__main__":
    sys.exit(main())
