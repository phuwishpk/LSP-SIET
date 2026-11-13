"""
Posting into a room (PR #37): members, the room's creator and staff only.

One helper, ``_require_room_post_access``, holds the rule; POST /posts and the
"share to feed" path of POST /library both go through it.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from siet_community import repository as repo
from siet_community.routers import community as routes
from siet_platform.users import User


def _room(**over):
    base = {"id": 5, "code": "CS101", "name": "DS", "kind": "course", "created_by": 7,
            "is_private": 0, "status": "active"}
    base.update(over)
    return base


def _user(uid: int, role: str) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}")


@pytest.fixture
def room_repo(monkeypatch):
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value=None))
    return repo


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "user, member, allowed",
    [
        (_user(20, "student"), None, False),      # outsider
        (_user(20, "student"), "member", True),   # joined
        (_user(20, "student"), "ta", True),
        (_user(7, "student"), None, True),        # created the room
        (_user(30, "teacher"), None, True),       # staff
        (_user(1, "admin"), None, True),
    ],
)
async def test_who_may_post_in_a_room(room_repo, user, member, allowed):
    room_repo.member_role.return_value = member
    if allowed:
        assert (await routes._require_room_post_access(5, user))["id"] == 5
    else:
        with pytest.raises(HTTPException) as err:
            await routes._require_room_post_access(5, user)
        assert err.value.status_code == 403


@pytest.mark.asyncio
async def test_missing_and_archived_rooms(room_repo):
    room_repo.get_course.return_value = None
    with pytest.raises(HTTPException) as err:
        await routes._require_room_post_access(5, _user(1, "admin"))
    assert err.value.status_code == 404
    room_repo.get_course.return_value = _room(status="archived")
    with pytest.raises(HTTPException) as err:
        await routes._require_room_post_access(5, _user(1, "admin"))
    assert err.value.status_code == 400


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------


@pytest.fixture
def client(monkeypatch):
    from api.auth import PasswordAuthMiddleware
    from api.main import app
    from siet_platform.auth_roles import RoleAccessMiddleware

    async def passthrough(self, request, call_next):
        return await call_next(request)

    monkeypatch.setattr(PasswordAuthMiddleware, "dispatch", passthrough)
    monkeypatch.setattr(RoleAccessMiddleware, "dispatch", passthrough)
    yield TestClient(app)
    from siet_platform.auth_jwt import get_current_user

    app.dependency_overrides.pop(get_current_user, None)


def _sign_in(user: User) -> None:
    from api.main import app
    from siet_platform.auth_jwt import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user


def test_outsider_post_into_room_is_403_not_500(client, room_repo, monkeypatch):
    created = AsyncMock()
    monkeypatch.setattr(repo, "create_post", created)
    _sign_in(_user(20, "student"))
    res = client.post("/api/community/posts", data={"type": "summary", "content": "hi", "course_id": "5"})
    assert res.status_code == 403
    assert "เข้าร่วมชั้นเรียน" in res.json()["detail"]
    created.assert_not_awaited()


def test_library_share_to_feed_cannot_bypass_the_room_rule(client, room_repo, monkeypatch):
    from siet_platform import library

    monkeypatch.setattr(routes, "_guard_spam", AsyncMock())
    monkeypatch.setattr(library, "ensure_personal_notebook", AsyncMock(return_value="notebook:me"))
    stored = AsyncMock(return_value=1)
    monkeypatch.setattr(library, "create_document", stored)
    _sign_in(_user(20, "student"))
    res = client.post(
        "/api/community/library",
        data={"scope": "personal", "course_id": "5", "share_to_feed": "true", "content": "x" * 400},
    )
    assert res.status_code == 403
    stored.assert_not_awaited()
