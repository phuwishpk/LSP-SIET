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
# attribute. (package, name) -> new package that provides `name`, or
# "package:newname" when the module was renamed too.
FROM_PACKAGE_MAP: dict[tuple[str, str], str] = {
    ("open_notebook.domain", "user"): "siet_platform:users",
    ("open_notebook.domain", "features"): "siet_platform.features:domain",
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
TS_MAP: dict[str, str] = {
    "@/app/(auth)/auth/google/callback/page": "@siet/platform/app/(auth)/auth/google/callback/page",
    "@/app/(auth)/auth/google/mock/page": "@siet/platform/app/(auth)/auth/google/mock/page",
    "@/app/(auth)/pending/page": "@siet/platform/app/(auth)/pending/page",
    "@/app/(auth)/register/page": "@siet/platform/app/(auth)/register/page",
    "@/app/(dashboard)/admin/community/page": "@siet/community/app/(dashboard)/admin/community/page",
    "@/app/(dashboard)/admin/layout": "@siet/platform/app/(dashboard)/admin/layout",
    "@/app/(dashboard)/admin/page": "@siet/platform/app/(dashboard)/admin/page",
    "@/app/(dashboard)/admin/quiz/page": "@siet/community/app/(dashboard)/admin/quiz/page",
    "@/app/(dashboard)/admin/rag/page": "@siet/kmitl-rag/app/(dashboard)/admin/rag/page",
    "@/app/(dashboard)/admin/roadmap/page": "@siet/community/app/(dashboard)/admin/roadmap/page",
    "@/app/(dashboard)/community/ask/page": "@siet/kmitl-rag/app/(dashboard)/community/ask/page",
    "@/app/(dashboard)/community/page": "@siet/community/app/(dashboard)/community/page",
    "@/app/(dashboard)/community/profile/[userId]/page": "@siet/community/app/(dashboard)/community/profile/[userId]/page",
    "@/app/(dashboard)/community/search/page": "@siet/community/app/(dashboard)/community/search/page",
    "@/app/(dashboard)/features/components/QuizRunner": "@siet/community/app/(dashboard)/features/components/QuizRunner",
    "@/app/(dashboard)/features/components/RoadmapGraph": "@siet/community/app/(dashboard)/features/components/RoadmapGraph",
    "@/app/(dashboard)/features/page": "@siet/community/app/(dashboard)/features/page",
    "@/app/(dashboard)/go/roadmap/page": "@siet/platform/app/(dashboard)/go/roadmap/page",
    "@/app/(dashboard)/teacher/courses/[id]/page": "@siet/community/app/(dashboard)/teacher/courses/[id]/page",
    "@/app/(dashboard)/teacher/page": "@siet/community/app/(dashboard)/teacher/page",
    "@/components/admin/AdminPageHeader": "@siet/platform/components/admin/AdminPageHeader",
    "@/components/admin/AuditPanel": "@siet/platform/components/admin/AuditPanel",
    "@/components/admin/CreateUserDialog": "@siet/platform/components/admin/CreateUserDialog",
    "@/components/admin/HealthPanel": "@siet/platform/components/admin/HealthPanel",
    "@/components/admin/ImportPanel": "@siet/platform/components/admin/ImportPanel",
    "@/components/admin/ModerationPanel": "@siet/community/components/admin/ModerationPanel",
    "@/components/admin/PointsLogPanel": "@siet/platform/components/admin/PointsLogPanel",
    "@/components/admin/PostCounts": "@siet/community/components/admin/PostCounts",
    "@/components/admin/RoomsPanel": "@siet/community/components/admin/RoomsPanel",
    "@/components/admin/StatCharts": "@siet/platform/components/admin/StatCharts",
    "@/components/admin/StatTile": "@siet/platform/components/admin/StatTile",
    "@/components/admin/UsagePanel": "@siet/platform/components/admin/UsagePanel",
    "@/components/admin/community/CategoriesPanel": "@siet/community/components/admin/community/CategoriesPanel",
    "@/components/admin/community/CommentsPanel": "@siet/community/components/admin/community/CommentsPanel",
    "@/components/admin/community/CommunityStatsPanel": "@siet/community/components/admin/community/CommunityStatsPanel",
    "@/components/admin/community/ReportsPanel": "@siet/community/components/admin/community/ReportsPanel",
    "@/components/admin/controls": "@siet/platform/components/admin/controls",
    "@/components/admin/quiz/QuizListPanel": "@siet/community/components/admin/quiz/QuizListPanel",
    "@/components/admin/quiz/QuizStatsPanel": "@siet/community/components/admin/quiz/QuizStatsPanel",
    "@/components/admin/quiz/SharedQuizzesPanel": "@siet/community/components/admin/quiz/SharedQuizzesPanel",
    "@/components/admin/rag/RagDocumentsPanel": "@siet/kmitl-rag/components/admin/rag/RagDocumentsPanel",
    "@/components/admin/rag/RagKnowledgePanel": "@siet/kmitl-rag/components/admin/rag/RagKnowledgePanel",
    "@/components/admin/rag/RagStatsPanel": "@siet/kmitl-rag/components/admin/rag/RagStatsPanel",
    "@/components/admin/roadmap/RoadmapListPanel": "@siet/community/components/admin/roadmap/RoadmapListPanel",
    "@/components/admin/roadmap/RoadmapStatsPanel": "@siet/community/components/admin/roadmap/RoadmapStatsPanel",
    "@/components/admin/roadmap/SharedRoadmapsPanel": "@siet/community/components/admin/roadmap/SharedRoadmapsPanel",
    "@/components/auth/PendingScreen": "@siet/platform/components/auth/PendingScreen",
    "@/components/auth/RegisterForm": "@siet/platform/components/auth/RegisterForm",
    "@/components/common/OwlMascot": "@siet/kmitl-rag/components/common/OwlMascot",
    "@/components/common/OwlMascot.test": "@siet/kmitl-rag/components/common/OwlMascot.test",
    "@/components/common/ReferencesList": "@siet/kmitl-rag/components/common/ReferencesList",
    "@/components/common/ReportButton": "@siet/community/components/common/ReportButton",
    "@/components/community/AiQuickWidget": "@siet/kmitl-rag/components/community/AiQuickWidget",
    "@/components/community/AnswerReferences": "@siet/kmitl-rag/components/community/AnswerReferences",
    "@/components/community/AnswerReferences.test": "@siet/kmitl-rag/components/community/AnswerReferences.test",
    "@/components/community/AskHistoryPanel": "@siet/kmitl-rag/components/community/AskHistoryPanel",
    "@/components/community/AskHistoryPanel.test": "@siet/kmitl-rag/components/community/AskHistoryPanel.test",
    "@/components/community/CommunityHeader": "@siet/platform/components/community/CommunityHeader",
    "@/components/community/CommunityRulesView": "@siet/community/components/community/CommunityRulesView",
    "@/components/community/CourseSidebar": "@siet/community/components/community/CourseSidebar",
    "@/components/community/CreatorBox": "@siet/community/components/community/CreatorBox",
    "@/components/community/InstructorMediaView": "@siet/community/components/community/InstructorMediaView",
    "@/components/community/Leaderboard": "@siet/community/components/community/Leaderboard",
    "@/components/community/LibraryPanel": "@siet/platform/components/community/LibraryPanel",
    "@/components/community/NotificationsMenu": "@siet/platform/components/community/NotificationsMenu",
    "@/components/community/PointsWallet": "@siet/platform/components/community/PointsWallet",
    "@/components/community/PostCard": "@siet/community/components/community/PostCard",
    "@/components/community/PostDetailModal": "@siet/community/components/community/PostDetailModal",
    "@/components/community/QuizEmbed": "@siet/community/components/community/QuizEmbed",
    "@/components/community/RoadmapEmbed": "@siet/community/components/community/RoadmapEmbed",
    "@/components/community/RoadmapPlanView": "@siet/community/components/community/RoadmapPlanView",
    "@/components/community/SavedSummariesView": "@siet/community/components/community/SavedSummariesView",
    "@/components/community/ShareMyWorkDialog": "@siet/community/components/community/ShareMyWorkDialog",
    "@/components/community/SharePostModal": "@siet/community/components/community/SharePostModal",
    "@/components/community/ShareToFeedButton": "@siet/community/components/community/ShareToFeedButton",
    "@/components/community/StudyDialog": "@siet/platform/components/community/StudyDialog",
    "@/components/community/mobile-nav.test": "@siet/platform/components/community/mobile-nav.test",
    "@/components/search/AskChatView": "@siet/kmitl-rag/components/search/AskChatView",
    "@/components/search/NotebookScopePicker": "@siet/kmitl-rag/components/search/NotebookScopePicker",
    "@/components/search/SessionSidebar": "@siet/kmitl-rag/components/search/SessionSidebar",
    "@/components/search/SettingsDialog": "@siet/kmitl-rag/components/search/SettingsDialog",
    "@/components/ui/avatar": "@siet/platform/components/ui/avatar",
    "@/components/ui/sheet": "@siet/platform/components/ui/sheet",
    "@/components/ui/skeleton": "@siet/platform/components/ui/skeleton",
    "@/lib/api/admin": "@siet/platform/lib/api/admin",
    "@/lib/api/auth": "@siet/platform/lib/api/auth",
    "@/lib/api/community": "@siet/platform/lib/api/community",
    "@/lib/api/community-search": "@siet/platform/lib/api/community-search",
    "@/lib/api/courses": "@siet/platform/lib/api/courses",
    "@/lib/api/features": "@siet/platform/lib/api/features",
    "@/lib/api/library": "@siet/platform/lib/api/library",
    "@/lib/api/moderation": "@siet/platform/lib/api/moderation",
    "@/lib/auth-redirect": "@siet/platform/lib/auth-redirect",
    "@/lib/cross-app": "@siet/platform/lib/cross-app",
    "@/lib/external-apps": "@siet/platform/lib/external-apps",
    "@/lib/hooks/use-admin": "@siet/platform/lib/hooks/use-admin",
    "@/lib/hooks/use-advanced-search": "@siet/platform/lib/hooks/use-advanced-search",
    "@/lib/hooks/use-community": "@siet/platform/lib/hooks/use-community",
    "@/lib/hooks/use-courses": "@siet/platform/lib/hooks/use-courses",
    "@/lib/hooks/use-features": "@siet/platform/lib/hooks/use-features",
    "@/lib/hooks/use-forced-light-theme": "@siet/platform/lib/hooks/use-forced-light-theme",
    "@/lib/hooks/use-library": "@siet/platform/lib/hooks/use-library",
    "@/lib/hooks/use-moderation": "@siet/platform/lib/hooks/use-moderation",
    "@/lib/hooks/useGlobalChat": "@siet/kmitl-rag/lib/hooks/useGlobalChat",
    "@/lib/roles": "@siet/platform/lib/roles",
    "@/lib/utils/community-format": "@siet/platform/lib/utils/community-format",
    "@/lib/utils/knowledge-pick": "@siet/kmitl-rag/lib/utils/knowledge-pick",
    "@/lib/utils/knowledge-pick.test": "@siet/kmitl-rag/lib/utils/knowledge-pick.test",
}

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
            target, _, new_name = new_pkg.partition(":")
            if new_name:
                # keep the name the importing code uses: `user` -> `users as user`
                aliases = [m.split(" as ")[1].strip() if " as " in m else name for m in moved]
                moved = [new_name if a == new_name else f"{new_name} as {a}" for a in aliases]
            lines = [f"{indent}from {target} import {m}" for m in moved]
            if kept:
                lines.insert(0, f"{indent}from {pkg} import {', '.join(kept)}")
            return "\n".join(lines)

        text = pattern.sub(_split, text)
    for old in sorted(MODULE_MAP, key=len, reverse=True):
        text = _module_pattern(old).sub(MODULE_MAP[old], text)
    return _merge_adjacent_imports(text)


_SIMPLE_FROM = re.compile(r"^(?P<indent>[ \t]*)from (?P<module>[\w.]+) import (?P<names>[^\n()#\\]+)$")


def _merge_adjacent_imports(text: str) -> str:
    """`from m import a` + `from m import b` on consecutive lines -> `from m import a, b`."""
    out: list[str] = []
    for line in text.split("\n"):
        current = _SIMPLE_FROM.match(line)
        previous = _SIMPLE_FROM.match(out[-1]) if out else None
        if (
            current
            and previous
            and current.group("module") == previous.group("module")
            and current.group("indent") == previous.group("indent")
            and current.group("module").startswith(("siet_platform", "kmitl_rag", "siet_community"))
        ):
            names = [n.strip() for n in (previous.group("names") + "," + current.group("names")).split(",")]
            names = sorted(dict.fromkeys(n for n in names if n), key=lambda n: n.split(" as ")[0].lower())
            out[-1] = f"{current.group('indent')}from {current.group('module')} import {', '.join(names)}"
        else:
            out.append(line)
    return "\n".join(out)


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
