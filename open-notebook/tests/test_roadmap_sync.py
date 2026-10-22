"""4.5.2: expanding a shared roadmap updates the feed post's copy by itself."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from open_notebook.community import repository as repo
from open_notebook.domain.user import User


def _user(uid: int, role: str) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}")


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


class _Session:
    id = "roadmap_session:abc"
    nodes = [{"id": "n1", "title": "t", "depth": 0}]
    settings = {"web": "off"}
    title = "แผน"
    description = ""
    edges = []


@pytest.mark.parametrize("shared_post", [None, 77])
def test_expand_syncs_the_feed_post_when_one_exists(client, sign_in, monkeypatch, shared_post):
    from api.routers import community as router
    from open_notebook.community import points, roadmap_plan

    session = _Session()
    monkeypatch.setattr(router, "_my_roadmap_or_404", AsyncMock(return_value=session))
    monkeypatch.setattr(roadmap_plan, "expansion_block", lambda nodes, node_id: None)
    monkeypatch.setattr(router, "_expansion_scope", AsyncMock(return_value=([], None)))
    charge = type("C", (), {"amount": 2, "charged": True})()
    monkeypatch.setattr(points, "charge", AsyncMock(return_value=charge))
    monkeypatch.setattr(points, "get_balance", AsyncMock(return_value=10))
    monkeypatch.setattr(roadmap_plan, "expand_node", AsyncMock(return_value=[{"id": "n1.1"}]))
    monkeypatch.setattr(router, "_roadmap_detail", AsyncMock(return_value={"id": session.id}))
    monkeypatch.setattr(router, "_roadmap_snapshot", lambda s: {"title": s.title, "nodes": s.nodes})
    monkeypatch.setattr(repo, "roadmap_posts_for_author", AsyncMock(return_value={session.id: shared_post} if shared_post else {}))
    synced = AsyncMock()
    monkeypatch.setattr(repo, "update_post_snapshot", synced)

    sign_in(_user(20, "student"))
    res = client.post(f"/api/community/roadmaps/mine/{session.id}/expand", json={"node_id": "n1"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["added"] == ["n1.1"]
    if shared_post:
        synced.assert_awaited_once_with(77, {"title": "แผน", "nodes": session.nodes})
        assert body["synced_post_id"] == 77
    else:
        synced.assert_not_awaited()
        assert body["synced_post_id"] is None
