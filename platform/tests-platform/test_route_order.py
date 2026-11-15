"""
Moving routers between packages must not change which route answers a request.

FastAPI tries routes in registration order, so two routes that can match the same
request (same method, same number of path segments, every segment equal or one of the
two a ``{param}``) must stay in the order of the baseline
(docs/lsp-siet/baseline/api-routes-ordered.txt, measured before the restructure).
Routes that cannot match the same request may move freely; routes missing on either
side (deleted features, new ones) are left out.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "docs" / "lsp-siet" / "baseline" / "api-routes-ordered.txt"

Route = tuple[str, str]


def current_routes() -> list[Route]:
    """``(METHOD, path)`` of every APIRoute of ``api.main:app``, in registration order."""
    from fastapi.routing import APIRoute

    from api.main import app

    out: list[Route] = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            out.extend((method, route.path) for method in sorted(route.methods or ()))
    return out


def baseline_routes() -> list[Route]:
    out: list[Route] = []
    for line in BASELINE.read_text(encoding="utf-8").splitlines():
        if line.strip():
            method, path = line.split(" ", 1)
            out.append((method, path))
    return out


def _is_param(segment: str) -> bool:
    return segment.startswith("{") and segment.endswith("}")


def overlap(a: Route, b: Route) -> bool:
    """True when one request could match both routes."""
    if a[0] != b[0]:
        return False
    sa, sb = a[1].strip("/").split("/"), b[1].strip("/").split("/")
    if len(sa) != len(sb):
        return False
    return all(x == y or _is_param(x) or _is_param(y) for x, y in zip(sa, sb))


def order_changes(before: list[Route], after: list[Route]) -> list[str]:
    """Overlapping route pairs present in both lists whose relative order differs."""
    pos_before: dict[Route, int] = {}
    for i, r in enumerate(before):
        pos_before.setdefault(r, i)  # the first registration is the one that answers
    pos_after: dict[Route, int] = {}
    for i, r in enumerate(after):
        pos_after.setdefault(r, i)
    common = [r for r in pos_after if r in pos_before]
    changes = []
    for i, a in enumerate(common):
        for b in common[i + 1:]:
            if not overlap(a, b):
                continue
            if (pos_before[a] < pos_before[b]) != (pos_after[a] < pos_after[b]):
                changes.append(f"{a[0]} {a[1]}  <->  {b[0]} {b[1]}")
    return changes


def test_overlap_rule():
    assert overlap(("GET", "/api/x/{id}"), ("GET", "/api/x/stats"))
    assert overlap(("GET", "/api/{a}/b"), ("GET", "/api/x/{c}"))
    assert not overlap(("GET", "/api/x/{id}"), ("DELETE", "/api/x/stats"))
    assert not overlap(("GET", "/api/x/{id}"), ("GET", "/api/x/{id}/y"))
    assert not overlap(("GET", "/api/x/a"), ("GET", "/api/x/b"))


def test_order_changes_finds_a_swap():
    before = [("GET", "/api/x/stats"), ("GET", "/api/y"), ("GET", "/api/x/{id}")]
    assert order_changes(before, [("GET", "/api/y"), *before[::2]]) == []
    swapped = [("GET", "/api/x/{id}"), ("GET", "/api/y"), ("GET", "/api/x/stats")]
    assert order_changes(before, swapped) == ["GET /api/x/{id}  <->  GET /api/x/stats"]


def test_no_duplicate_routes():
    routes = current_routes()
    dupes = sorted({r for r in routes if routes.count(r) > 1})
    assert not dupes, f"registered twice: {dupes}"


def test_route_order_preserved():
    changes = order_changes(baseline_routes(), current_routes())
    assert not changes, "overlapping routes changed order:\n" + "\n".join(changes)
