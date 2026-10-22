"""
Post visibility and private rooms (4.3.4).

One rule - ``repository._VISIBLE_SQL`` for feed queries, ``post_visible_to``
for single-post routes - decides who may read a post:

* admin: everything; author: their own posts
* ``private``: nobody else
* ``course``: members of the post's room (and the room's owner)
* ``public``: everyone, unless the room is private - then members only

The router tests run the FastAPI app with the signed-in user swapped in and the
repository mocked, exactly like ``test_course_rooms.py``.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from siet_community import repository as repo
from siet_platform.users import User


def _post(**over):
    base = {
        "id": 11, "author_id": 7, "course_id": 5, "type": "summary", "title": "t",
        "content": "c", "visibility": "public", "is_deleted": 0,
        "attachment_path": None, "attachment_name": None, "attachment_mime": None,
        "embed_type": None, "embed_id": None, "embed_snapshot": None,
    }
    base.update(over)
    return base


def _room(**over):
    base = {"id": 5, "code": "CS101", "name": "DS", "kind": "course", "created_by": 7,
            "is_private": 0, "status": "active", "join_code": None}
    base.update(over)
    return base


def _user(uid: int, role: str) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}")


# ---------------------------------------------------------------------------
# the rule itself
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "visibility, room_private, viewer, is_member, expected",
    [
        ("public", 0, 20, False, True),     # public post in a public room: anyone
        ("public", 1, 20, False, False),    # ...but a private room hides it from outsiders
        ("public", 1, 20, True, True),      # members of the private room still see it
        ("course", 0, 20, False, False),    # course-only post: outsiders no
        ("course", 0, 20, True, True),      # members yes
        ("course", 1, 20, True, True),
        ("private", 0, 20, True, False),    # private: not even members
        ("private", 0, 7, False, True),     # ...only the author
        ("course", 1, 7, False, True),      # the author always
        ("course", 1, 8, False, True),      # the room owner always (created_by)
    ],
)
def test_post_visible_to_matrix(visibility, room_private, viewer, is_member, expected):
    room = _room(created_by=8 if viewer == 8 else 7, is_private=room_private)
    post = _post(visibility=visibility, author_id=7)
    assert repo.post_visible_to(post, viewer, room=room, is_member=is_member) is expected


def test_admin_sees_everything_and_roomless_posts_follow_visibility():
    assert repo.post_visible_to(_post(visibility="private"), 99, is_admin=True)
    assert repo.post_visible_to(_post(course_id=None, visibility="public"), 20)
    assert not repo.post_visible_to(_post(course_id=None, visibility="private"), 20)
    # "course" without a room cannot be satisfied by anyone but the author
    assert not repo.post_visible_to(_post(course_id=None, visibility="course"), 20)


# ---------------------------------------------------------------------------
# SQL shape
# ---------------------------------------------------------------------------


class _Result:
    def all(self):
        return []

    def first(self):
        return None


class _Session:
    def __init__(self):
        self.statements, self.params = [], []

    async def execute(self, statement, params=None):
        self.statements.append(" ".join(str(statement).split()))
        self.params.append(params or {})
        return _Result()


@pytest.fixture
def session(monkeypatch):
    fake = _Session()

    @asynccontextmanager
    async def fake_session():
        yield fake

    monkeypatch.setattr(repo, "_mariadb_session", fake_session)
    return fake


@pytest.mark.asyncio
async def test_feed_query_always_carries_the_visibility_rule(session):
    await repo.list_posts(20)
    sql = session.statements[-1]
    assert ":viewer_is_admin = 1" in sql
    assert "p.visibility = 'public' AND (ISNULL(p.room_id) OR COALESCE(c.is_private, 0) = 0)" in sql
    assert "p.visibility IN ('public', 'course')" in sql
    assert session.params[-1]["viewer_is_admin"] == 0

    await repo.list_posts(1, viewer_is_admin=True, course_id=5, query="x")
    assert session.params[-1]["viewer_is_admin"] == 1
    assert "p.room_id = :course_id" in session.statements[-1]


@pytest.mark.asyncio
async def test_single_post_query_is_gated_too(session):
    await repo.get_post(11, 20)
    assert ":viewer_is_admin = 1" in session.statements[-1]
    assert "p.id = :pid" in session.statements[-1]


@pytest.mark.asyncio
async def test_create_and_update_validate_visibility(session):
    with pytest.raises(ValueError):
        await repo.create_post(author_id=7, post_type="summary", title="t", content="c",
                               course_id=None, tags=[], visibility="friends")
    await repo.update_post(11, visibility="private")
    assert "visibility = :visibility" in session.statements[-1]
    assert session.params[-1]["visibility"] == "private"
    with pytest.raises(ValueError):
        await repo.update_post(11, visibility="everyone")


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
    from siet_platform.auth_roles import RoleAccessMiddleware

    async def passthrough(self, request, call_next):
        return await call_next(request)

    monkeypatch.setattr(PasswordAuthMiddleware, "dispatch", passthrough)
    monkeypatch.setattr(RoleAccessMiddleware, "dispatch", passthrough)
    return TestClient(app)


@pytest.fixture
def sign_in(app):
    from siet_platform.auth_jwt import get_current_user

    def _as(user: User) -> User:
        app.dependency_overrides[get_current_user] = lambda: user
        return user

    yield _as
    app.dependency_overrides.pop(get_current_user, None)


def test_hidden_post_is_a_404_on_every_post_route(client, sign_in, monkeypatch):
    """Attachment, comments, reactions, save, share: all behave as if the post did not exist."""
    monkeypatch.setattr(repo, "get_post_raw", AsyncMock(return_value=_post(visibility="course", attachment_path="/x")))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value=None))
    monkeypatch.setattr(repo, "get_post", AsyncMock(return_value=None))
    touched = AsyncMock()
    for name in ("toggle_reaction", "toggle_saved", "record_share", "list_comments", "add_comment"):
        monkeypatch.setattr(repo, name, touched)

    sign_in(_user(20, "student"))
    assert client.get("/api/community/posts/11").status_code == 404
    assert client.get("/api/community/posts/11/attachment").status_code == 404
    assert client.get("/api/community/posts/11/comments").status_code == 404
    assert client.post("/api/community/posts/11/comments", json={"content": "hi there friend"}).status_code == 404
    assert client.post("/api/community/posts/11/reactions", json={"kind": "like"}).status_code == 404
    assert client.post("/api/community/posts/11/save").status_code == 404
    assert client.post("/api/community/posts/11/share").status_code == 404
    touched.assert_not_awaited()


def test_member_reads_a_course_post(client, sign_in, monkeypatch):
    monkeypatch.setattr(repo, "get_post_raw", AsyncMock(return_value=_post(visibility="course")))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value="member"))
    monkeypatch.setattr(repo, "list_comments", AsyncMock(return_value=[]))
    sign_in(_user(20, "student"))
    assert client.get("/api/community/posts/11/comments").status_code == 200


def test_author_hides_a_post_by_making_it_private(client, sign_in, monkeypatch):
    monkeypatch.setattr(repo, "get_post_raw", AsyncMock(return_value=_post(author_id=7)))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value=None))
    monkeypatch.setattr(repo, "get_post", AsyncMock(return_value={"id": 11, "visibility": "private"}))
    update = AsyncMock()
    monkeypatch.setattr(repo, "update_post", update)
    monkeypatch.setattr("siet_community.routers.community.points.get_balance", AsyncMock(return_value=0))

    sign_in(_user(7, "teacher"))
    res = client.put("/api/community/posts/11", json={"visibility": "private"})
    assert res.status_code == 200
    assert update.await_args.kwargs["visibility"] == "private"


def test_course_visibility_outside_a_room_falls_back_to_public(client, sign_in, monkeypatch):
    monkeypatch.setattr(repo, "get_post_raw", AsyncMock(return_value=_post(author_id=7, course_id=None)))
    monkeypatch.setattr(repo, "get_post", AsyncMock(return_value={"id": 11}))
    update = AsyncMock()
    monkeypatch.setattr(repo, "update_post", update)
    monkeypatch.setattr("siet_community.routers.community.points.get_balance", AsyncMock(return_value=0))

    sign_in(_user(7, "teacher"))
    assert client.put("/api/community/posts/11", json={"visibility": "course"}).status_code == 200
    assert update.await_args.kwargs["visibility"] == "public"


def test_feed_passes_the_admin_flag(client, sign_in, monkeypatch):
    listing = AsyncMock(return_value=[])
    monkeypatch.setattr(repo, "list_posts", listing)
    sign_in(_user(1, "admin"))
    assert client.get("/api/community/posts").status_code == 200
    assert listing.await_args.kwargs["viewer_is_admin"] is True
    sign_in(_user(20, "student"))
    client.get("/api/community/posts")
    assert listing.await_args.kwargs["viewer_is_admin"] is False


def test_private_room_flag_round_trips_through_course_settings(client, sign_in, monkeypatch):
    room = _room(is_private=1)
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=room))
    update = AsyncMock(return_value=room)
    monkeypatch.setattr(repo, "update_course", update)
    sign_in(_user(7, "teacher"))
    res = client.patch("/api/community/courses/5", json={"is_private": True})
    assert res.status_code == 200
    assert update.await_args.kwargs["is_private"] is True
    assert res.json()["is_private"] is True


# ---------------------------------------------------------------------------
# library reads follow room privacy
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_library_lists_use_the_readable_rule(monkeypatch):
    from siet_platform import library

    fake = _Session()

    @asynccontextmanager
    async def fake_session():
        yield fake

    monkeypatch.setattr(library, "_mariadb_session", fake_session)
    await library.list_documents(_user(20, "student"), scope="course")
    sql = fake.statements[-1]
    assert "COALESCE(c.is_private, 0) = 0" in sql and "vm.user_id = :uid" in sql
    assert fake.params[-1]["is_admin"] == 0

    await library.list_documents_by_ids(_user(1, "admin"), [1, 2])
    assert fake.params[-1]["is_admin"] == 1
    assert "LEFT JOIN rooms c ON c.id = d.room_id" in fake.statements[-1]


@pytest.mark.asyncio
async def test_can_read_document_private_room_needs_membership(monkeypatch):
    from siet_platform import library

    monkeypatch.setattr(library, "get_course", AsyncMock(return_value=_room(is_private=1)))
    checks = AsyncMock(side_effect=[False, True])
    monkeypatch.setattr(library, "can_read_room", checks)
    doc = {"id": 3, "scope": "course", "owner_id": 7, "room_id": 5}
    assert await library.can_read_document(_user(20, "student"), doc) is False
    assert await library.can_read_document(_user(20, "student"), doc) is True
    assert await library.can_read_document(_user(7, "teacher"), doc) is True    # owner, no lookup
    assert await library.can_read_document(_user(1, "admin"), doc) is True
    assert checks.await_count == 2
