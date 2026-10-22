"""
RAG hardening (4.5.1): atomic session credits, no raw exception text to
clients, and a complete clean-up when an account is deleted.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest

from open_notebook.community import library
from open_notebook.community import repository as repo
from open_notebook.domain import user as users


class _Result:
    def __init__(self, rows=None, rowcount=1):
        self._rows, self.rowcount = rows or [], rowcount

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows


class _Session:
    def __init__(self, results=None):
        self.statements, self.params, self._results = [], [], list(results or [])

    async def execute(self, statement, params=None):
        self.statements.append(" ".join(str(statement).split()))
        self.params.append(params or {})
        return self._results.pop(0) if self._results else _Result()


def _patch(monkeypatch, module, fake):
    @asynccontextmanager
    async def fake_session():
        yield fake

    monkeypatch.setattr(module, "_mariadb_session", fake_session)


# ---------------------------------------------------------------------------
# session credits
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reserve_credit_is_one_guarded_update(monkeypatch):
    fake = _Session([_Result(rowcount=1), _Result(rows=[(3,)])])
    _patch(monkeypatch, repo, fake)
    assert await repo.reserve_rag_credit("s1", 20) == 3
    sql = fake.statements[0]
    assert "SET credits_left = credits_left - 1" in sql
    assert "WHERE id = :id AND user_id = :uid AND credits_left > 0" in sql

    exhausted = _Session([_Result(rowcount=0)])
    _patch(monkeypatch, repo, exhausted)
    assert await repo.reserve_rag_credit("s1", 20) is None
    assert len(exhausted.statements) == 1          # no SELECT when nothing was reserved


@pytest.mark.asyncio
async def test_release_and_save_do_not_touch_each_other(monkeypatch):
    fake = _Session()
    _patch(monkeypatch, repo, fake)
    await repo.release_rag_credit("s1")
    assert "credits_left = credits_left + 1" in fake.statements[-1]
    await repo.save_rag_messages("s1", [{"role": "user", "content": "q"}] * 30)
    assert "SET messages = :messages WHERE id = :id" in fake.statements[-1]
    assert "credits_left" not in fake.statements[-1]
    assert fake.params[-1]["messages"].count('"role"') == 20        # window kept at 20


# ---------------------------------------------------------------------------
# error text
# ---------------------------------------------------------------------------


def test_internal_error_hides_the_exception_but_keeps_a_reference():
    from api.routers.community import _internal_error

    exc = _internal_error(RuntimeError("sk-live-SECRET /app/data/x.pdf"), "quick ask failed")
    assert exc.status_code == 500
    assert "SECRET" not in exc.detail and "/app/data" not in exc.detail
    assert "รหัสอ้างอิง" in exc.detail


def test_no_route_returns_raw_500_text():
    import inspect

    from api.routers import community

    source = inspect.getsource(community)
    assert "status_code=500, detail=str(exc)" not in source


# ---------------------------------------------------------------------------
# account deletion
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_delete_user_removes_rag_history_collections_and_reports(monkeypatch):
    fake = _Session()
    _patch(monkeypatch, users, fake)
    removed = await users.admin_delete_user(9)
    joined = " | ".join(fake.statements)
    assert "DELETE m FROM rag_messages m JOIN rag_conversations c" in joined
    assert "DELETE FROM rag_conversations WHERE user_id = :uid" in joined
    assert "DELETE FROM saved_collections WHERE user_id = :uid" in joined
    assert "DELETE FROM content_reports WHERE reporter_id = :uid" in joined
    assert fake.statements[-1] == "DELETE FROM users WHERE id = :uid"
    assert {"rag_messages", "rag_conversations", "collections", "reports_filed"} <= set(removed)


@pytest.mark.asyncio
async def test_purge_user_library_reassigns_course_docs_and_deletes_personal(monkeypatch):
    class _Row:
        def __init__(self, m):
            self._mapping = m

    personal = {"id": 1, "owner_id": 9, "scope": "personal", "course_id": None, "room_owner_id": None, "kind": "file", "file_path": "/tmp/none", "source_id": None}
    course_with_owner = {"id": 2, "owner_id": 9, "scope": "course", "course_id": 5, "room_owner_id": 7, "kind": "file", "file_path": "/tmp/none", "source_id": None}
    course_orphan = {"id": 3, "owner_id": 9, "scope": "course", "course_id": 6, "room_owner_id": None, "kind": "url", "file_path": "https://x", "source_id": None}
    fake = _Session([
        _Result(rows=[_Row(personal), _Row(course_with_owner), _Row(course_orphan)]),
        _Result(rows=[("notebook:p",)]),
    ])
    _patch(monkeypatch, library, fake)
    deleted = AsyncMock()
    monkeypatch.setattr(library, "delete_document", deleted)
    notebook = AsyncMock()
    monkeypatch.setattr(library.Notebook, "get", AsyncMock(return_value=notebook))

    removed = await library.purge_user_library(9)
    assert removed == {"personal_documents": 1, "course_documents_reassigned": 1, "course_documents_deleted": 1, "notebooks": 1}
    assert [c.args[0]["id"] for c in deleted.await_args_list] == [1, 3]
    assert any("SET owner_id = :owner" in s for s in fake.statements) and fake.params[-1] == {"owner": 7, "id": 2}
    notebook.delete.assert_awaited_once_with(delete_exclusive_sources=True)
