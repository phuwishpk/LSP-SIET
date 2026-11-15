"""siet_quiz as an extension: its routes, and the paths they had before the split."""

from fastapi import FastAPI
from fastapi.routing import APIRoute

from siet_quiz import extension


def _routes(app):
    return [(m, r.path) for r in app.routes if isinstance(r, APIRoute) for m in sorted(r.methods)]


def test_install_mounts_the_quiz_routes_under_api():
    app = FastAPI()
    extension.install(app)
    assert _routes(app) == [
        ("GET", "/api/features/quiz/sessions"),
        ("GET", "/api/features/quiz/sessions/{session_id}"),
        ("DELETE", "/api/features/quiz/sessions/{session_id}"),
        ("DELETE", "/api/admin/quizzes/{session_id}"),
    ]


def test_loads_after_siet_platform_and_before_kmitl_rag():
    from kmitl_rag import extension as kmitl_rag
    from siet_platform import extension as platform

    assert platform.ORDER < extension.ORDER < kmitl_rag.ORDER
