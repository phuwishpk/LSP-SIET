"""GET /community/knowledge/preview (peek into a file before ticking it) and /knowledge/auto (what "อัตโนมัติ" reads)."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from siet_platform.users import User

ME = User(id=20, username="s20", role="student", display_name="S20")


@pytest.fixture
def client(monkeypatch):
    from api.auth import PasswordAuthMiddleware
    from api.main import app
    from siet_platform.auth_jwt import get_current_user
    from siet_platform.auth_roles import RoleAccessMiddleware

    async def passthrough(self, request, call_next):
        return await call_next(request)

    monkeypatch.setattr(PasswordAuthMiddleware, "dispatch", passthrough)
    monkeypatch.setattr(RoleAccessMiddleware, "dispatch", passthrough)
    app.dependency_overrides[get_current_user] = lambda: ME
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def lib(monkeypatch):
    from siet_platform import library

    doc = {"id": 7, "title": "สรุป OS", "kind": "file", "source_id": "source:a", "scope": "personal", "owner_id": 20}
    monkeypatch.setattr(library, "get_document", AsyncMock(return_value=doc))
    monkeypatch.setattr(library, "can_read_document", AsyncMock(return_value=True))
    monkeypatch.setattr(
        library, "source_text_preview", AsyncMock(return_value={"title": "สรุป OS", "text": "บทที่ 1 …", "chars": 5000, "truncated": True})
    )
    monkeypatch.setattr(
        library, "resolve_knowledge_pick",
        AsyncMock(return_value={"notebook_ids": ["notebook:s"], "source_ids": ["source:s1"], "label": "x"}),
    )
    return library


def test_preview_a_library_file(client, lib):
    res = client.get("/api/community/knowledge/preview", params={"doc_id": 7})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["title"] == "สรุป OS" and body["text"] == "บทที่ 1 …" and body["truncated"] is True
    assert body["download_url"] == "/api/community/library/7/download"
    lib.source_text_preview.assert_awaited_with("source:a")


def test_a_file_i_cannot_read_is_404(client, lib):
    lib.can_read_document.return_value = False
    assert client.get("/api/community/knowledge/preview", params={"doc_id": 7}).status_code == 404
    assert not lib.source_text_preview.called


def test_preview_a_notebook_source_checks_access(client, lib):
    res = client.get("/api/community/knowledge/preview", params={"source_id": "source:s1"})
    assert res.status_code == 200 and res.json()["download_url"] is None
    lib.resolve_knowledge_pick.assert_awaited_with(ME, source_ids=["source:s1"])

    lib.resolve_knowledge_pick.side_effect = lib.LibraryError("no")
    assert client.get("/api/community/knowledge/preview", params={"source_id": "source:zz"}).status_code == 404


@pytest.mark.parametrize("params", [{}, {"doc_id": 7, "source_id": "source:s1"}])
def test_preview_needs_exactly_one_id(client, lib, params):
    assert client.get("/api/community/knowledge/preview", params=params).status_code == 400


def test_what_auto_reads(client, lib, monkeypatch):
    monkeypatch.setattr(lib, "notebook_ids_for_scope", AsyncMock(return_value=["notebook:me", "notebook:c1", "notebook:s"]))
    items = [
        {"id": "notebook:me", "kind": "personal", "label": "ไฟล์ของฉัน"},
        {"id": "notebook:c1", "kind": "course", "label": "CS301 OS"},
        {"id": "notebook:s", "kind": "staff", "label": "คู่มือ"},
    ]
    monkeypatch.setattr(lib, "describe_notebooks", AsyncMock(return_value=items))
    res = client.get("/api/community/knowledge/auto")
    assert res.status_code == 200, res.text
    assert res.json() == {"items": items, "total": 3}
    lib.notebook_ids_for_scope.assert_awaited_with(ME, scope="auto", course_id=None)
