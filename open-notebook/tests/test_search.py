"""
Advanced search (4.3.3): escaped LIKE, the feed filters the search page adds,
a keyset cursor for "popular", user search without contact details for
students, course search by category, document search scoped to readable
libraries, and the search route itself.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from open_notebook.community import library
from open_notebook.community import repository as repo
from open_notebook.domain.user import User


def _user(uid: int, role: str) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}")


class _Result:
    def __init__(self, rows=None):
        self._rows = rows or []

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


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
# repository
# ---------------------------------------------------------------------------


def test_like_escapes_the_users_wildcards():
    assert repo._like("50%") == "%50\\%%"
    assert repo._like("a_b") == "%a\\_b%"
    assert repo._like("  plain ") == "%plain%"


@pytest.mark.asyncio
async def test_feed_filters_for_the_search_page(monkeypatch):
    from datetime import datetime

    fake = _Session()
    _patch(monkeypatch, repo, fake)
    await repo.list_posts(
        20, query="deadlock", tag="#OS", author_username="@Demo.Teacher1",
        since=datetime(2026, 10, 1), until=datetime(2026, 10, 31), category_id=4,
    )
    sql = fake.statements[-1]
    p = fake.params[-1]
    assert "LIKE :tag" in sql and p["tag"] == "%,OS,%"
    assert "u.username = :author_username" in sql and p["author_username"] == "demo.teacher1"
    assert "p.created_at >= :since" in sql and "p.created_at < :until" in sql
    assert "c.category_id = :category_id" in sql and p["category_id"] == 4
    assert p["q"] == "%deadlock%"


@pytest.mark.asyncio
async def test_popular_cursor_pages_on_score_then_id(monkeypatch):
    fake = _Session()
    _patch(monkeypatch, repo, fake)
    await repo.list_posts(20, order="popular", before_id=99)
    sql = fake.statements[-1]
    assert "FROM posts cur WHERE cur.id = :before_id" in sql
    assert "AND p.id < :before_id" in sql
    assert "ORDER BY (p.like_count * 2" in sql
    # the newest order keeps the plain id cursor
    await repo.list_posts(20, order="newest", before_id=99)
    assert "cur.id" not in fake.statements[-1] and "p.id < :before_id" in fake.statements[-1]


@pytest.mark.asyncio
async def test_students_search_people_by_name_only(monkeypatch):
    fake = _Session()
    _patch(monkeypatch, repo, fake)
    await repo.search_users("6599", include_contact=False)
    assert "email" not in fake.statements[-1] and "student_code LIKE" not in fake.statements[-1]
    assert "NULL AS student_id" in fake.statements[-1]
    await repo.search_users("6599", include_contact=True)
    assert "email LIKE :q" in fake.statements[-1] and "student_code AS student_id" in fake.statements[-1]


@pytest.mark.asyncio
async def test_course_search_filters_active_rooms_and_category(monkeypatch):
    fake = _Session()
    _patch(monkeypatch, repo, fake)
    await repo.search_courses("data", category_id=4, viewer_id=20)
    sql = fake.statements[-1]
    assert "c.status = 'active'" in sql and "c.category_id = :category_id" in sql
    assert "cat.name LIKE :q" in sql and fake.params[-1]["viewer"] == 20


# ---------------------------------------------------------------------------
# library.search_documents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_document_search_stays_inside_readable_notebooks(monkeypatch):
    monkeypatch.setattr(library, "room_ids_readable_by", AsyncMock(return_value={5}))
    fake = _Session([
        _Result(rows=[(5, "notebook:a"), (6, "notebook:b")]),   # rooms: 6 is private & not joined
        _Result(rows=[]),                                        # document rows
    ])
    _patch(monkeypatch, library, fake)
    searched = AsyncMock(return_value=[{"id": "source:x", "similarity": 0.8, "content": "chunk"}])
    monkeypatch.setattr("open_notebook.community.retrieval.search_in_notebooks", searched)
    monkeypatch.setattr("open_notebook.cache.service.cache_service.get_json", AsyncMock(return_value=None))
    monkeypatch.setattr("open_notebook.cache.service.cache_service.set_json", AsyncMock())

    await library.search_documents(_user(20, "student"), "deadlock", limit=5)
    assert searched.await_args.args[1] == ["notebook:a"]          # notebook:b never searched
    sql = fake.statements[-1]
    assert "d.source_id IN (:s0)" in sql and "d.title LIKE :q" in sql and "COALESCE(c.is_private, 0) = 0" in sql


@pytest.mark.asyncio
async def test_document_search_serves_the_cache(monkeypatch):
    monkeypatch.setattr(library, "room_ids_readable_by", AsyncMock(return_value=set()))
    fake = _Session([_Result(rows=[])])
    _patch(monkeypatch, library, fake)
    monkeypatch.setattr("open_notebook.cache.service.cache_service.get_json", AsyncMock(return_value=[{"id": 1, "cached": True}]))
    searched = AsyncMock()
    monkeypatch.setattr("open_notebook.community.retrieval.search_in_notebooks", searched)
    out = await library.search_documents(_user(20, "student"), "x")
    assert out == [{"id": 1, "cached": True}]
    searched.assert_not_awaited()


# ---------------------------------------------------------------------------
# router
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    from api.main import app as fastapi_app

    return fastapi_app


@pytest.fixture
def client(app, monkeypatch):
    from api.auth import PasswordAuthMiddleware
    from api.auth_roles import RoleAccessMiddleware

    async def passthrough(self, request, call_next):
        return await call_next(request)

    monkeypatch.setattr(PasswordAuthMiddleware, "dispatch", passthrough)
    monkeypatch.setattr(RoleAccessMiddleware, "dispatch", passthrough)
    return TestClient(app)


@pytest.fixture
def sign_in(app):
    from api.auth_jwt import get_current_user

    def _as(user: User) -> User:
        app.dependency_overrides[get_current_user] = lambda: user
        return user

    yield _as
    app.dependency_overrides.pop(get_current_user, None)


def test_search_route_fans_out_with_filters(client, sign_in, monkeypatch):
    posts = AsyncMock(return_value=[{"id": 3}, {"id": 2}])
    courses = AsyncMock(return_value=[])
    users = AsyncMock(return_value=[])
    docs = AsyncMock(return_value=[])
    monkeypatch.setattr(repo, "list_posts", posts)
    monkeypatch.setattr(repo, "search_courses", courses)
    monkeypatch.setattr(repo, "search_users", users)
    monkeypatch.setattr(library, "search_documents", docs)
    monkeypatch.setattr(library, "managed_room_ids", AsyncMock(return_value=set()))

    sign_in(_user(20, "student"))
    res = client.get("/api/community/search", params={
        "q": "deadlock", "kind": "all", "course_id": 5, "type": "summary", "tag": "OS",
        "since": "2026-10-01", "until": "2026-10-31", "order": "popular",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["kind"] == "all" and body["next_before_id"] is None     # previews do not page
    kw = posts.await_args.kwargs
    assert kw["course_id"] == 5 and kw["post_type"] == "summary" and kw["tag"] == "OS" and kw["order"] == "popular"
    assert kw["since"].isoformat().startswith("2026-10-01") and kw["until"].isoformat().startswith("2026-11-01")
    assert kw["viewer_is_admin"] is False and kw["limit"] == 5
    assert users.await_args.kwargs["include_contact"] is False
    docs.assert_awaited_once()


def test_posts_kind_pages_and_staff_get_contact_matching(client, sign_in, monkeypatch):
    rows = [{"id": i} for i in range(20, 0, -1)]
    monkeypatch.setattr(repo, "list_posts", AsyncMock(return_value=rows))
    users = AsyncMock(return_value=[])
    monkeypatch.setattr(repo, "search_users", users)
    sign_in(_user(7, "teacher"))
    body = client.get("/api/community/search", params={"q": "x", "kind": "posts", "limit": 20}).json()
    assert body["next_before_id"] == 1 and len(body["posts"]) == 20
    assert body["courses"] == [] and body["documents"] == []
    client.get("/api/community/search", params={"q": "x", "kind": "users"})
    assert users.await_args.kwargs["include_contact"] is True


def test_document_search_is_rate_limited(client, sign_in, monkeypatch):
    from api.routers import community as router

    monkeypatch.setattr(library, "search_documents", AsyncMock(return_value=[]))
    monkeypatch.setattr(library, "managed_room_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(router, "SEARCH_DOCS_PER_MINUTE", 2)
    router._SEARCH_WINDOW.clear()
    sign_in(_user(21, "student"))
    assert client.get("/api/community/search", params={"q": "a", "kind": "documents"}).status_code == 200
    assert client.get("/api/community/search", params={"q": "a", "kind": "documents"}).status_code == 200
    res = client.get("/api/community/search", params={"q": "a", "kind": "documents"})
    assert res.status_code == 429 and "Retry-After" in res.headers
    # posts are plain SQL and never throttled
    monkeypatch.setattr(repo, "list_posts", AsyncMock(return_value=[]))
    assert client.get("/api/community/search", params={"q": "a", "kind": "posts"}).status_code == 200
