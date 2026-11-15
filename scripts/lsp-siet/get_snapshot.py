#!/usr/bin/env python3
"""Snapshot the API's GET responses and diff two snapshots.

    python scripts/lsp-siet/get_snapshot.py save <base_url> <out.json> --token <jwt> \
        [--frontend-url URL] [--params-from other.json] [--param name=value ...]
    python scripts/lsp-siet/get_snapshot.py diff <a.json> <b.json> [--lines N]

``save`` GETs every path in ``ENDPOINTS`` from ``base_url`` (the FastAPI port, e.g.
``http://127.0.0.1:25055``) with ``Authorization: Bearer <jwt>`` and stores, per path,
the status code and the normalised body: JSON keeps every id and value except
timestamps and request counters (``DROP_KEY``/``COUNTER_KEY`` below), ISO-8601
date strings become ``"<ts>"`` and signed one-time tokens ``"<jwt>"``; a non-JSON body is kept as content type, length and
sha256; a redirect keeps its ``Location``. Redirects are not followed.

Paths with ``{placeholders}`` take their ids from the data: ``RESOLVERS`` reads a list
endpoint and picks one row, in order, so a later placeholder can use an earlier one
(``{source_id}`` then ``/api/sources/{source_id}/insights``). Two stacks loaded from
the same data resolve the same ids; ``--params-from`` reuses the ids another snapshot
resolved, ``--param`` sets one by hand. A placeholder that cannot be resolved (empty
list) skips its paths and is listed under ``unresolved``.

``--frontend-url`` (the Next.js port) adds ``FRONTEND_ENDPOINTS`` (``/config``,
``/config/apps``).

Run ``save`` once per role (admin / teacher / student token) to cover the
role-dependent responses. Only GETs are sent, but a GET may still write (e.g. a
"recently viewed" row), so point it at a test stack, never at production.

``/api/recently-viewed`` is stateful: every GET of a source or notebook (this script's
own included) reorders it, so a difference there is expected between two runs.

``diff`` prints, for every path, a missing side, a status change or a unified diff of
the bodies (first ``--lines`` lines, default 40), then a one-line summary. It always
exits 0.

Standard library only.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Optional

# --------------------------------------------------------------------------------------
# What to fetch
# --------------------------------------------------------------------------------------

# Every GET route of the API (scripts/lsp-siet/routes.py api) that is safe to call
# repeatedly: no outbound network call to a model provider (/api/models/discover/* is
# left out) and no OAuth redirect to Google (/api/auth/google/start is kept: the
# redirect itself is recorded, not followed). Query strings are part of the key.
ENDPOINTS: list[str] = [
    "/",
    "/health",
    # auth / users / config
    "/api/auth/status",
    "/api/auth/legacy-status",
    "/api/auth/google/start",
    "/api/users/me",
    "/api/config",
    "/api/config/redis",
    "/api/config/answer-cache/analytics",
    "/api/config/answer-cache/circuit-breaker/status",
    "/api/config/answer-cache/thresholds/history",
    "/api/capabilities",
    "/api/languages",
    "/api/settings",
    "/api/system/admin-info",
    "/api/recently-viewed",
    # models / credentials / providers
    "/api/models",
    "/api/models/defaults",
    "/api/models/providers",
    "/api/models/by-provider/{provider}",
    "/api/models/count/{provider}",
    "/api/providers",
    "/api/credentials",
    "/api/credentials/status",
    "/api/credentials/env-status",
    "/api/credentials/by-provider/{provider}",
    "/api/credentials/{credential_id}",
    # notebooks / sources / notes / insights / chat
    "/api/notebooks",
    "/api/notebooks/{notebook_id}",
    "/api/notebooks/{notebook_id}/delete-preview",
    "/api/sources",
    "/api/sources?notebook_id={notebook_id}",
    "/api/sources/{source_id}",
    "/api/sources/{source_id}/status",
    "/api/sources/{source_id}/insights",
    "/api/sources/{source_id}/download",
    "/api/sources/{source_id}/chat/sessions",
    "/api/sources/{source_id}/chat/sessions/{source_chat_session_id}",
    "/api/insights/{insight_id}",
    "/api/notes",
    "/api/notes?notebook_id={notebook_id}",
    "/api/notes/{note_id}",
    "/api/chat/sessions?notebook_id={notebook_id}",
    "/api/chat/sessions/{chat_session_id}",
    "/api/chat/global/sessions",
    "/api/chat/global/sessions/{global_session_id}",
    "/api/transformations",
    "/api/transformations/{transformation_id}",
    "/api/transformations/default-prompt",
    "/api/commands/jobs",
    "/api/commands/jobs/{job_id}",
    "/api/commands/registry/debug",
    # quiz / roadmap features
    "/api/features/quiz/sessions",
    "/api/features/quiz/sessions/{quiz_session_id}",
    "/api/features/roadmap/sessions",
    "/api/features/roadmap/sessions/{roadmap_session_id}",
    # community
    "/api/community/me",
    "/api/community/wallet",
    "/api/community/notifications",
    "/api/community/categories",
    "/api/community/courses",
    "/api/community/courses/{course_id}",
    "/api/community/courses/{course_id}/members",
    "/api/community/courses/{course_id}/reports",
    "/api/community/posts",
    "/api/community/posts/{post_id}",
    "/api/community/posts/{post_id}/comments",
    "/api/community/leaderboard",
    "/api/community/knowledge",
    "/api/community/materials",
    "/api/community/library",
    "/api/community/library/{doc_id}",
    "/api/community/search?q=a",
    "/api/community/saved-collections",
    "/api/community/reports/mine",
    "/api/community/roadmaps/mine",
    "/api/community/roadmaps/mine/{community_roadmap_id}",
    "/api/community/roadmaps/popular",
    "/api/community/ask/history",
    "/api/community/ask/history/{conversation_id}",
    "/api/community/teacher/overview",
    "/api/community/teacher/quiz-results",
    # admin
    "/api/admin/overview",
    "/api/admin/health",
    "/api/admin/users",
    "/api/admin/users/{user_id}",
    "/api/admin/audit",
    "/api/admin/usage",
    "/api/admin/llm-throttle",
    "/api/admin/categories",
    "/api/admin/courses",
    "/api/admin/posts",
    "/api/admin/comments",
    "/api/admin/reports",
    "/api/admin/points/log",
    "/api/admin/community/stats",
    "/api/admin/quizzes",
    "/api/admin/quizzes/shared",
    "/api/admin/quizzes/stats",
    "/api/admin/roadmaps",
    "/api/admin/roadmaps/shared",
    "/api/admin/roadmaps/stats",
    "/api/admin/rag/stats",
    "/api/admin/rag/documents",
]

FRONTEND_ENDPOINTS: list[str] = ["/config", "/config/apps"]


def _first(rows: list[dict]) -> Optional[dict]:
    return rows[0] if rows else None


def _most(key: str) -> Callable[[list[dict]], Optional[dict]]:
    def pick(rows: list[dict]) -> Optional[dict]:
        return max(rows, key=lambda r: r.get(key) or 0) if rows else None

    return pick


# (placeholder, list path, row picker, field of the row) -- resolved in this order.
RESOLVERS: list[tuple[str, str, Callable[[list[dict]], Optional[dict]], str]] = [
    ("notebook_id", "/api/notebooks", _most("source_count"), "id"),
    ("source_id", "/api/sources?notebook_id={notebook_id}", _first, "id"),
    ("source_id", "/api/sources", _first, "id"),
    ("insight_id", "/api/sources/{source_id}/insights", _first, "id"),
    ("source_chat_session_id", "/api/sources/{source_id}/chat/sessions", _first, "id"),
    ("note_id", "/api/notes?notebook_id={notebook_id}", _first, "id"),
    ("chat_session_id", "/api/chat/sessions?notebook_id={notebook_id}", _first, "id"),
    ("global_session_id", "/api/chat/global/sessions", _first, "id"),
    ("credential_id", "/api/credentials", _first, "id"),
    ("provider", "/api/credentials", _first, "provider"),
    ("transformation_id", "/api/transformations", _first, "id"),
    ("job_id", "/api/commands/jobs", _first, "job_id"),
    ("quiz_session_id", "/api/features/quiz/sessions", _first, "id"),
    ("roadmap_session_id", "/api/features/roadmap/sessions", _first, "id"),
    ("course_id", "/api/community/courses", _first, "id"),
    ("post_id", "/api/community/posts", _first, "id"),
    ("doc_id", "/api/community/library", _first, "id"),
    ("community_roadmap_id", "/api/community/roadmaps/mine", _first, "id"),
    ("conversation_id", "/api/community/ask/history", _first, "id"),
    ("user_id", "/api/admin/users", _first, "id"),
]

# --------------------------------------------------------------------------------------
# Normalisation
# --------------------------------------------------------------------------------------

DROP_KEY = re.compile(
    r"(^|_)(created|updated|modified|timestamp|ts|at|time|date|expires|expiry|uptime"
    r"|last_seen|last_login|last_active|checked|generated)$|^(iat|exp|now)$",
    re.IGNORECASE,
)
COUNTER_KEY = re.compile(
    r"(^|_)(views?|view_count|hits|misses|sets|hit_rate|calls|requests|connected_clients|memory"
    r"|latency\w*|duration\w*|elapsed\w*|uptime\w*|\w+_ms)$",
    re.IGNORECASE,
)
# Signed one-time values (OAuth state, nonces) change on every request.
JWT_LIKE = re.compile(r"eyJ[\w-]+\.[\w-]+\.[\w-]+")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$")


def normalise(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: normalise(v)
            for k, v in value.items()
            if not DROP_KEY.search(k) and not COUNTER_KEY.search(k)
        }
    if isinstance(value, list):
        return [normalise(v) for v in value]
    if isinstance(value, str):
        if ISO_DATE.match(value):
            return "<ts>"
        return JWT_LIKE.sub("<jwt>", value)
    return value


# --------------------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------------------


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: D401 - keep the 3xx
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch(url: str, token: Optional[str], timeout: float = 60.0) -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            status, ctype, body, location = (
                response.status,
                response.headers.get("Content-Type", ""),
                response.read(),
                response.headers.get("Location"),
            )
    except urllib.error.HTTPError as exc:
        status, ctype, body, location = (
            exc.code,
            exc.headers.get("Content-Type", ""),
            exc.read(),
            exc.headers.get("Location"),
        )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"status": None, "error": f"{type(exc).__name__}: {exc}"}
    entry: dict[str, Any] = {"status": status}
    if location:
        entry["location"] = location
    if "json" in ctype:
        try:
            entry["json"] = json.loads(body.decode("utf-8") or "null")
            return entry
        except ValueError:
            pass
    entry["content_type"] = ctype.split(";")[0]
    entry["length"] = len(body)
    entry["sha256"] = hashlib.sha256(body).hexdigest()
    return entry


def _rows(payload: Any) -> list[dict]:
    """The first list of objects in a response (a bare list, or a dict's first list value)."""
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value
    return []


def _fill(template: str, params: dict[str, str]) -> Optional[str]:
    names = re.findall(r"{(\w+)}", template)
    if any(n not in params for n in names):
        return None
    return template.format(**{n: urllib.parse.quote(str(params[n]), safe="") for n in names})


def resolve(base_url: str, token: str, params: dict[str, str]) -> dict[str, str]:
    for name, list_path, pick, field in RESOLVERS:
        if name in params:
            continue
        path = _fill(list_path, params)
        if path is None:
            continue
        entry = fetch(base_url + path, token)
        row = pick(_rows(entry.get("json")))
        if row is not None and row.get(field) not in (None, ""):
            params[name] = str(row[field])
    return params


def save(args: argparse.Namespace) -> int:
    base_url = args.base_url.rstrip("/")
    params: dict[str, str] = {}
    if args.params_from:
        with open(args.params_from, encoding="utf-8") as fh:
            params.update(json.load(fh).get("params", {}))
    for item in args.param or []:
        name, _, value = item.partition("=")
        params[name] = value
    params = resolve(base_url, args.token, params)

    endpoints: dict[str, Any] = {}
    unresolved: set[str] = set()
    for template in ENDPOINTS:
        path = _fill(template, params)
        if path is None:
            unresolved.update(n for n in re.findall(r"{(\w+)}", template) if n not in params)
            continue
        entry = fetch(base_url + path, args.token)
        if "json" in entry:
            entry["json"] = normalise(entry["json"])
        endpoints[template] = entry
    if args.frontend_url:
        for path in FRONTEND_ENDPOINTS:
            entry = fetch(args.frontend_url.rstrip("/") + path, args.token)
            if "json" in entry:
                entry["json"] = normalise(entry["json"])
            endpoints["frontend:" + path] = entry

    snapshot = {"params": params, "unresolved": sorted(unresolved), "endpoints": endpoints}
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=1, sort_keys=True, ensure_ascii=False)
    statuses: dict[Any, int] = {}
    for entry in endpoints.values():
        statuses[entry.get("status")] = statuses.get(entry.get("status"), 0) + 1
    print(f"{len(endpoints)} endpoints saved to {args.out}; statuses {statuses}")
    if unresolved:
        print("unresolved placeholders: " + ", ".join(sorted(unresolved)))
    return 0


def _pretty(entry: dict) -> list[str]:
    body = {k: v for k, v in entry.items() if k != "status"}
    return json.dumps(body, indent=1, sort_keys=True, ensure_ascii=False).splitlines()


def diff(args: argparse.Namespace) -> int:
    with open(args.a, encoding="utf-8") as fh:
        a = json.load(fh)
    with open(args.b, encoding="utf-8") as fh:
        b = json.load(fh)
    if a.get("params") != b.get("params"):
        print("params differ:")
        for key in sorted(set(a.get("params", {})) | set(b.get("params", {}))):
            if a["params"].get(key) != b["params"].get(key):
                print(f"  {key}: {a['params'].get(key)!r} -> {b['params'].get(key)!r}")
    ea, eb = a.get("endpoints", {}), b.get("endpoints", {})
    same = changed = only_a = only_b = 0
    for path in sorted(set(ea) | set(eb)):
        if path not in eb:
            only_a += 1
            print(f"- {path}  (only in {args.a}: status {ea[path].get('status')})")
            continue
        if path not in ea:
            only_b += 1
            print(f"+ {path}  (only in {args.b}: status {eb[path].get('status')})")
            continue
        if ea[path] == eb[path]:
            same += 1
            continue
        changed += 1
        sa, sb = ea[path].get("status"), eb[path].get("status")
        print(f"~ {path}  status {sa} -> {sb}" if sa != sb else f"~ {path}  status {sa}, body differs")
        lines = list(difflib.unified_diff(_pretty(ea[path]), _pretty(eb[path]), "a", "b", n=1, lineterm=""))[2:]
        for line in lines[: args.lines]:
            print("    " + line)
        if len(lines) > args.lines:
            print(f"    ... {len(lines) - args.lines} more diff lines")
    print(f"summary: {same} same, {changed} changed, {only_a} only in a, {only_b} only in b")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_save = sub.add_parser("save", help="snapshot GET responses")
    p_save.add_argument("base_url")
    p_save.add_argument("out")
    p_save.add_argument("--token", required=True)
    p_save.add_argument("--frontend-url")
    p_save.add_argument("--params-from")
    p_save.add_argument("--param", action="append", metavar="NAME=VALUE")
    p_save.set_defaults(func=save)
    p_diff = sub.add_parser("diff", help="compare two snapshots")
    p_diff.add_argument("a")
    p_diff.add_argument("b")
    p_diff.add_argument("--lines", type=int, default=40)
    p_diff.set_defaults(func=diff)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
