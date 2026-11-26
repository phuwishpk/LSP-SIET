"""The knowledge list tells the KMITL RAG AI picker which course a library belongs to."""

import asyncio
from types import SimpleNamespace

from siet_platform import library

STUDENT = SimpleNamespace(id=5, role="student")


def _fake_db(monkeypatch):
    async def sharing_context():
        return {
            "staff": {},
            "courses": {7: {"id": 7, "code": "03206107"}},
            "personal_notebooks": set(),
            "course_notebooks": {"notebook:c"},
        }

    async def course_ids_for_viewer(ctx, viewer):
        return {7}

    async def repo_query(query, params=None):
        if "FROM notebook" in query:
            return [
                {"id": "notebook:c", "name": "Prog", "owner_id": "course:7"},
                {"id": "notebook:s", "name": "Staff", "owner_id": "default"},
            ]
        if "FROM reference" in query:
            return [
                {"source": "source:a", "notebook": "notebook:c"},
                {"source": "source:b", "notebook": "notebook:s"},
            ]
        return []

    monkeypatch.setattr(library, "_sharing_context", sharing_context)
    monkeypatch.setattr(library, "_course_ids_for_viewer", course_ids_for_viewer)
    monkeypatch.setattr(library, "repo_query", repo_query)


def test_course_library_carries_its_course_id(monkeypatch):
    _fake_db(monkeypatch)
    notebooks = asyncio.run(library.list_shared_notebooks(with_sources=False, viewer=STUDENT))
    by_id = {nb["id"]: nb for nb in notebooks}
    assert by_id["notebook:c"]["kind"] == "course"
    assert by_id["notebook:c"]["course_id"] == 7
    assert by_id["notebook:s"]["course_id"] is None
