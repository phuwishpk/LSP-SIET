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

``MOVES`` is keyed by old-layout paths. The host keeps generated route stubs at many new
paths (``platform/frontend/src/app/...``); a rule whose source is such a path would move the
stub again on every later run, so ``test_codemod.py`` fails when any source still exists in
the repository.
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
    # the licence text of the code this project includes is kept as platform/NOTICE (not LICENSE)
    ("open-notebook/LICENSE", "platform/NOTICE"),
    ("docker/open-notebook", "docker/platform"),
    ("My-ai-quiz", "my-ai-quiz/app"),
    ("ai-roadmap-generator", "ai-roadmap/app"),
    # Task 10: the notebooks/sources API is KMITL RAG's (kmitl_rag.extension.finalize mounts it)
    ("platform/api/routers/notebooks.py", "kmitl-rag/kmitl_rag/routers/notebooks.py"),
    ("platform/api/routers/sources.py", "kmitl-rag/kmitl_rag/routers/sources.py"),
    ("platform/api/routers/notes.py", "kmitl-rag/kmitl_rag/routers/notes.py"),
    ("platform/api/routers/chat.py", "kmitl-rag/kmitl_rag/routers/chat.py"),
    ("platform/api/routers/source_chat.py", "kmitl-rag/kmitl_rag/routers/source_chat.py"),
    ("platform/api/routers/_chat_shared.py", "kmitl-rag/kmitl_rag/routers/_chat_shared.py"),
    ("platform/api/routers/embedding.py", "kmitl-rag/kmitl_rag/routers/embedding.py"),
    ("platform/api/routers/embedding_rebuild.py", "kmitl-rag/kmitl_rag/routers/embedding_rebuild.py"),
    ("platform/api/routers/insights.py", "kmitl-rag/kmitl_rag/routers/insights.py"),
    ("platform/api/routers/transformations.py", "kmitl-rag/kmitl_rag/routers/transformations.py"),
    ("platform/api/routers/search.py", "kmitl-rag/kmitl_rag/routers/search.py"),
    # ... with the tests that exercise only those routers
    ("platform/tests/test_chat_routers_characterization.py", "kmitl-rag/tests/test_chat_routers_characterization.py"),
    ("platform/tests/test_clear_description.py", "kmitl-rag/tests/test_clear_description.py"),
    ("platform/tests/test_context_endpoint_characterization.py", "kmitl-rag/tests/test_context_endpoint_characterization.py"),
    ("platform/tests/test_create_insight_empty_source.py", "kmitl-rag/tests/test_create_insight_empty_source.py"),
    ("platform/tests/test_error_message_sanitization.py", "kmitl-rag/tests/test_error_message_sanitization.py"),
    ("platform/tests/test_notes_api.py", "kmitl-rag/tests/test_notes_api.py"),
    ("platform/tests/test_recently_viewed_api.py", "kmitl-rag/tests/test_recently_viewed_api.py"),
    ("platform/tests/test_source_default_transformations.py", "kmitl-rag/tests/test_source_default_transformations.py"),
    ("platform/tests/test_source_path_containment.py", "kmitl-rag/tests/test_source_path_containment.py"),
    ("platform/tests/test_sources_api.py", "kmitl-rag/tests/test_sources_api.py"),
    ("platform/tests/test_transformations_readonly.py", "kmitl-rag/tests/test_transformations_readonly.py"),
    ("platform/tests/test_upload_toctou_race.py", "kmitl-rag/tests/test_upload_toctou_race.py"),
    ("platform/tests/test_upload_type_mitigations.py", "kmitl-rag/tests/test_upload_type_mitigations.py"),
    # Task 10: the quiz tests follow siet_quiz (the shared RAG helper test is split off by hand)
    ("platform/tests-platform/test_quiz_generation.py", "my-ai-quiz/tests/test_quiz_generation.py"),
    # Task 12: community-only UI and its data layer (the shell imports none of them)
    ("platform/frontend/src/components/community/CommunityHeader.tsx", "community/frontend/src/components/community/CommunityHeader.tsx"),
    ("platform/frontend/src/components/community/mobile-nav.test.tsx", "community/frontend/src/components/community/mobile-nav.test.tsx"),
    ("platform/frontend/src/lib/api/community-search.ts", "community/frontend/src/lib/api/community-search.ts"),
    ("platform/frontend/src/lib/api/courses.ts", "community/frontend/src/lib/api/courses.ts"),
    ("platform/frontend/src/lib/hooks/use-courses.ts", "community/frontend/src/lib/hooks/use-courses.ts"),
    ("platform/frontend/src/lib/hooks/use-advanced-search.ts", "community/frontend/src/lib/hooks/use-advanced-search.ts"),
    # Task 12: PostCounts is shared by the community, quiz and roadmap admin panels -> host
    ("community/frontend/src/components/admin/PostCounts.tsx", "platform/frontend/src/components/admin/PostCounts.tsx"),
    # Task 12: /admin/quiz and /admin/roadmap
    ("community/frontend/src/app/(dashboard)/admin/quiz", "my-ai-quiz/frontend/src/app/(dashboard)/admin/quiz"),
    ("community/frontend/src/components/admin/quiz", "my-ai-quiz/frontend/src/components/admin/quiz"),
    ("community/frontend/src/app/(dashboard)/admin/roadmap", "ai-roadmap/frontend/src/app/(dashboard)/admin/roadmap"),
    ("community/frontend/src/components/admin/roadmap", "ai-roadmap/frontend/src/components/admin/roadmap"),
    # Task 12: components only the /notebooks and /sources pages import
    ("platform/frontend/src/components/common/ConfirmDialog.tsx", "kmitl-rag/frontend/src/components/common/ConfirmDialog.tsx"),
    ("platform/frontend/src/components/common/ConfirmDialog.test.tsx", "kmitl-rag/frontend/src/components/common/ConfirmDialog.test.tsx"),
    ("platform/frontend/src/components/notebooks/CollapsibleColumn.tsx", "kmitl-rag/frontend/src/components/notebooks/CollapsibleColumn.tsx"),
    ("platform/frontend/src/components/sources/AddExistingSourceDialog.tsx", "kmitl-rag/frontend/src/components/sources/AddExistingSourceDialog.tsx"),
    ("platform/frontend/src/components/sources/AddExistingSourceDialog.test.tsx", "kmitl-rag/frontend/src/components/sources/AddExistingSourceDialog.test.tsx"),
    # Task 12: the /notebooks, /sources (kmitl-rag) and /go/roadmap (ai-roadmap) route modules.
    # Keyed by their old-layout path, not by platform/frontend/src/app/...: the host keeps a
    # route stub at each of these paths, and a rule keyed there would move the stub onto
    # the page again on every later run. NoteEditorDialog stays (ModalProvider opens it).
    ("siet-platform/frontend/src/app/(dashboard)/go/roadmap", "ai-roadmap/frontend/src/app/(dashboard)/go/roadmap"),
    ("open-notebook/frontend/src/app/(dashboard)/notebooks/page.tsx", "kmitl-rag/frontend/src/app/(dashboard)/notebooks/page.tsx"),
    ("open-notebook/frontend/src/app/(dashboard)/notebooks/[id]", "kmitl-rag/frontend/src/app/(dashboard)/notebooks/[id]"),
    # Every component of the notebook page follows the page, a teammate's new one included;
    # NoteEditorDialog stays (the longer file rules win over the directory rule).
    ("open-notebook/frontend/src/app/(dashboard)/notebooks/components", "kmitl-rag/frontend/src/app/(dashboard)/notebooks/components"),
    ("open-notebook/frontend/src/app/(dashboard)/notebooks/components/NoteEditorDialog.tsx", "platform/frontend/src/app/(dashboard)/notebooks/components/NoteEditorDialog.tsx"),
    ("open-notebook/frontend/src/app/(dashboard)/notebooks/components/NoteEditorDialog.test.tsx", "platform/frontend/src/app/(dashboard)/notebooks/components/NoteEditorDialog.test.tsx"),
    ("open-notebook/frontend/src/app/(dashboard)/sources", "kmitl-rag/frontend/src/app/(dashboard)/sources"),
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

# "final.module.Name": "new.module.Name".
SYMBOL_MOVES: dict[str, str] = {
    # Task 10: siet_platform/features splits into siet_quiz, siet_roadmap and
    # siet_platform.ai_helpers; its router into siet_quiz/siet_roadmap routers.features and
    # the shared request helpers of siet_platform.http.
    "siet_platform.features.domain.QuizSession": "siet_quiz.domain.QuizSession",
    "siet_platform.features.domain.RoadmapSession": "siet_roadmap.domain.RoadmapSession",
    "siet_platform.features.service.MAX_RAG_CONTEXT_CHARS": "siet_platform.ai_helpers.MAX_RAG_CONTEXT_CHARS",
    "siet_platform.features.service._hash_prompt": "siet_platform.ai_helpers._hash_prompt",
    "siet_platform.features.service._retrieve_rag_context": "siet_platform.ai_helpers._retrieve_rag_context",
    "siet_platform.features.service._format_rag_chunks": "siet_platform.ai_helpers._format_rag_chunks",
    "siet_platform.features.service._extract_json": "siet_platform.ai_helpers._extract_json",
    "siet_platform.features.service._invoke_chat": "siet_platform.ai_helpers._invoke_chat",
    "siet_platform.features.service.model_manager": "siet_platform.ai_helpers.model_manager",
    "siet_platform.features.service.text_search": "siet_platform.ai_helpers.text_search",
    "siet_platform.features.service.QUIZ_TYPES": "siet_quiz.service.QUIZ_TYPES",
    "siet_platform.features.service.QUESTION_TYPES": "siet_quiz.service.QUESTION_TYPES",
    "siet_platform.features.service.DIFFICULTIES": "siet_quiz.service.DIFFICULTIES",
    "siet_platform.features.service.QuizOption": "siet_quiz.service.QuizOption",
    "siet_platform.features.service.QuizQuestion": "siet_quiz.service.QuizQuestion",
    "siet_platform.features.service.QuizResponse": "siet_quiz.service.QuizResponse",
    "siet_platform.features.service._BLANK_RE": "siet_quiz.service._BLANK_RE",
    "siet_platform.features.service._TYPE_ALIASES": "siet_quiz.service._TYPE_ALIASES",
    "siet_platform.features.service._question_type": "siet_quiz.service._question_type",
    "siet_platform.features.service._text": "siet_quiz.service._text",
    "siet_platform.features.service._explanation": "siet_quiz.service._explanation",
    "siet_platform.features.service._clean_mcq": "siet_quiz.service._clean_mcq",
    "siet_platform.features.service._clean_fill": "siet_quiz.service._clean_fill",
    "siet_platform.features.service._clean_matching": "siet_quiz.service._clean_matching",
    "siet_platform.features.service._CLEANERS": "siet_quiz.service._CLEANERS",
    "siet_platform.features.service._enforce_quiz_invariants": "siet_quiz.service._enforce_quiz_invariants",
    "siet_platform.features.service._DIFFICULTY_TEXT": "siet_quiz.service._DIFFICULTY_TEXT",
    "siet_platform.features.service._TYPE_TEXT": "siet_quiz.service._TYPE_TEXT",
    "siet_platform.features.service._QUIZ_SYSTEM_PROMPT": "siet_quiz.service._QUIZ_SYSTEM_PROMPT",
    "siet_platform.features.service._quiz_prompt": "siet_quiz.service._quiz_prompt",
    "siet_platform.features.service.generate_quiz": "siet_quiz.service.generate_quiz",
    "siet_platform.features.service._persist_quiz": "siet_quiz.service._persist_quiz",
    "siet_platform.features.service.RoadmapNode": "siet_roadmap.service.RoadmapNode",
    "siet_platform.features.service.RoadmapEdge": "siet_roadmap.service.RoadmapEdge",
    "siet_platform.features.service.RoadmapResponse": "siet_roadmap.service.RoadmapResponse",
    "siet_platform.features.service._enforce_roadmap_invariants": "siet_roadmap.service._enforce_roadmap_invariants",
    "siet_platform.features.service.generate_roadmap": "siet_roadmap.service.generate_roadmap",
    "siet_platform.features.service._persist_roadmap": "siet_roadmap.service._persist_roadmap",
    "siet_platform.features.schemas.QuizOptionPayload": "siet_quiz.schemas.QuizOptionPayload",
    "siet_platform.features.schemas.QuizQuestionPayload": "siet_quiz.schemas.QuizQuestionPayload",
    "siet_platform.features.schemas.QuizGenerateRequest": "siet_quiz.schemas.QuizGenerateRequest",
    "siet_platform.features.schemas.QuizSessionResponse": "siet_quiz.schemas.QuizSessionResponse",
    "siet_platform.features.schemas.QuizSessionSummary": "siet_quiz.schemas.QuizSessionSummary",
    "siet_platform.features.schemas.QuizGenerateResponse": "siet_quiz.schemas.QuizGenerateResponse",
    "siet_platform.features.schemas.RoadmapNodePayload": "siet_roadmap.schemas.RoadmapNodePayload",
    "siet_platform.features.schemas.RoadmapEdgePayload": "siet_roadmap.schemas.RoadmapEdgePayload",
    "siet_platform.features.schemas.RoadmapGenerateRequest": "siet_roadmap.schemas.RoadmapGenerateRequest",
    "siet_platform.features.schemas.RoadmapSessionResponse": "siet_roadmap.schemas.RoadmapSessionResponse",
    "siet_platform.features.schemas.RoadmapSessionSummary": "siet_roadmap.schemas.RoadmapSessionSummary",
    "siet_platform.features.schemas.RoadmapGenerateResponse": "siet_roadmap.schemas.RoadmapGenerateResponse",
    "siet_platform.routers.features.DEFAULT_OWNER_ID": "siet_platform.http.DEFAULT_OWNER_ID",
    "siet_platform.routers.features._insufficient": "siet_platform.http._insufficient",
    "siet_platform.routers.features._charge": "siet_platform.http._charge",
    "siet_platform.routers.features._resolve_owner_id": "siet_platform.http._resolve_owner_id",
    "siet_platform.routers.features._session_to_quiz_response": "siet_quiz.routers.features._session_to_quiz_response",
    "siet_platform.routers.features.list_quiz_sessions": "siet_quiz.routers.features.list_quiz_sessions",
    "siet_platform.routers.features.get_quiz_session": "siet_quiz.routers.features.get_quiz_session",
    "siet_platform.routers.features.delete_quiz_session": "siet_quiz.routers.features.delete_quiz_session",
    "siet_platform.routers.features._session_to_roadmap_response": "siet_roadmap.routers.features._session_to_roadmap_response",
    "siet_platform.routers.features.generate_roadmap": "siet_roadmap.routers.features.generate_roadmap",
    "siet_platform.routers.features.list_roadmap_sessions": "siet_roadmap.routers.features.list_roadmap_sessions",
    "siet_platform.routers.features.get_roadmap_session": "siet_roadmap.routers.features.get_roadmap_session",
    "siet_platform.routers.features.delete_roadmap_session": "siet_roadmap.routers.features.delete_roadmap_session",
}

# Modules whose names the quiz/roadmap modules import by name (``from siet_platform.ai_helpers
# import _invoke_chat``). A ``mock.patch("...")`` string that named one of the SYMBOL_MOVES
# symbols moved into these has no single new home: patching it in the helper changes nothing
# for the modules that already hold their own reference, so the codemod leaves the string alone
# and reports it ("check by hand"): patch the name in the module that uses it.
SHARED_HELPER_MODULES: tuple[str, ...] = ("siet_platform.ai_helpers", "siet_platform.http")

# Identifiers (functions, classes, properties) renamed by the restructure, rewritten whole-word
# in every Python and TypeScript/JavaScript file, strings and comments included. Only code
# identifiers belong here: the persisted names that keep ``open_notebook`` (SurrealDB namespace,
# surreal-commands app/command names, JWT issuer, PBKDF2 salt) are values, not identifiers.
# Task 12 (use-create-dialogs) and Task 16 (siet_core.exceptions, api.main).
IDENTIFIER_RENAMES: dict[str, str] = {
    "OpenNotebookError": "SietError",
    "open_notebook_error_handler": "siet_error_handler",
    "openNotebookDialog": "openCreateNotebookDialog",
}

# Whole-word renames in .toml/.json/.yml/Makefile/Dockerfile*/.env.example/.sh: the old
# OPEN_NOTEBOOK_* setting names to the LSP_SIET_* ones. This is the inverse of LEGACY_NAMES in
# platform/siet_core/env.py (platform/tests/test_env_fallback.py keeps the two in step).
# The codemod leaves a name alone where it is the fallback inside `${NEW:-${OLD:-default}}`.
ENV_RENAMES: dict[str, str] = {
    "OPEN_NOTEBOOK_ENCRYPTION_KEY": "LSP_SIET_ENCRYPTION_KEY",
    "OPEN_NOTEBOOK_ENCRYPTION_KEY_FILE": "LSP_SIET_ENCRYPTION_KEY_FILE",
    "OPEN_NOTEBOOK_PASSWORD": "LSP_SIET_PASSWORD",
    "OPEN_NOTEBOOK_PASSWORD_FILE": "LSP_SIET_PASSWORD_FILE",
    "OPEN_NOTEBOOK_API_URL": "LSP_SIET_API_URL",
    "OPEN_NOTEBOOK_API_KEY": "LSP_SIET_API_KEY",
    "OPEN_NOTEBOOK_MAX_UPLOAD_SIZE_MB": "LSP_SIET_MAX_UPLOAD_SIZE_MB",
    "OPEN_NOTEBOOK_ENABLE_CRAWL4AI": "LSP_SIET_ENABLE_CRAWL4AI",
    "OPEN_NOTEBOOK_ENABLE_DOCLING": "LSP_SIET_ENABLE_DOCLING",
    "OPEN_NOTEBOOK_CHUNK_SIZE": "LSP_SIET_CHUNK_SIZE",
    "OPEN_NOTEBOOK_CHUNK_OVERLAP": "LSP_SIET_CHUNK_OVERLAP",
    "OPEN_NOTEBOOK_MIN_CHUNK_SIZE": "LSP_SIET_MIN_CHUNK_SIZE",
    "OPEN_NOTEBOOK_EMBEDDING_BATCH_SIZE": "LSP_SIET_EMBEDDING_BATCH_SIZE",
    "OPEN_NOTEBOOK_WORKER_MAX_TASKS": "LSP_SIET_WORKER_MAX_TASKS",
    "OPEN_NOTEBOOK_CACHE_TTL": "LSP_SIET_CACHE_TTL",
    "OPEN_NOTEBOOK_VECTOR_SEARCH_CACHE_TTL": "LSP_SIET_VECTOR_SEARCH_CACHE_TTL",
    "OPEN_NOTEBOOK_CONTEXT_CACHE_TTL": "LSP_SIET_CONTEXT_CACHE_TTL",
    "OPEN_NOTEBOOK_EMBEDDING_CACHE_TTL": "LSP_SIET_EMBEDDING_CACHE_TTL",
    "OPEN_NOTEBOOK_NOTEBOOK_CACHE_TTL": "LSP_SIET_NOTEBOOK_CACHE_TTL",
    "OPEN_NOTEBOOK_PROVIDER_CACHE_TTL": "LSP_SIET_PROVIDER_CACHE_TTL",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TTL": "LSP_SIET_ANSWER_CACHE_TTL",
    "OPEN_NOTEBOOK_ANSWER_CACHE_SIMILARITY": "LSP_SIET_ANSWER_CACHE_SIMILARITY",
    "OPEN_NOTEBOOK_ANSWER_CACHE_MAX_ENTRIES": "LSP_SIET_ANSWER_CACHE_MAX_ENTRIES",
    "OPEN_NOTEBOOK_ANSWER_CACHE_HIGH_SIMILARITY": "LSP_SIET_ANSWER_CACHE_HIGH_SIMILARITY",
    "OPEN_NOTEBOOK_ANSWER_CACHE_MID_SIMILARITY": "LSP_SIET_ANSWER_CACHE_MID_SIMILARITY",
    "OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_VALIDATION": "LSP_SIET_ANSWER_CACHE_INTENT_VALIDATION",
    "OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_TIMEOUT_MS": "LSP_SIET_ANSWER_CACHE_INTENT_TIMEOUT_MS",
    "OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_MIN_SIM": "LSP_SIET_ANSWER_CACHE_INTENT_MIN_SIM",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_ENABLED": "LSP_SIET_ANSWER_CACHE_TUNER_ENABLED",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_INTERVAL": "LSP_SIET_ANSWER_CACHE_TUNER_INTERVAL",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_HIGH_MIN": "LSP_SIET_ANSWER_CACHE_TUNER_HIGH_MIN",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_HIGH_MAX": "LSP_SIET_ANSWER_CACHE_TUNER_HIGH_MAX",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_MIN": "LSP_SIET_ANSWER_CACHE_TUNER_MID_MIN",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_MAX": "LSP_SIET_ANSWER_CACHE_TUNER_MID_MAX",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_FAIL_RATE_INCREASE": "LSP_SIET_ANSWER_CACHE_TUNER_MID_FAIL_RATE_INCREASE",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_FAIL_RATE_DECREASE": "LSP_SIET_ANSWER_CACHE_TUNER_MID_FAIL_RATE_DECREASE",
    "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_ADJUST_STEP": "LSP_SIET_ANSWER_CACHE_TUNER_MID_ADJUST_STEP",
    "OPEN_NOTEBOOK_TUNER_HISTORY_LIMIT": "LSP_SIET_TUNER_HISTORY_LIMIT",
    "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER": "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER",
    "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD": "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD",
    "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT": "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT",
    "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS": "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS",
    "NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL": "NEXT_PUBLIC_LSP_SIET_API_URL",
}
