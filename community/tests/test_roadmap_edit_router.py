"""POST /roadmaps/mine/{id}/edit and /edit/undo: charging, refunds, feed sync."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from siet_community import repository as repo

from siet_core.exceptions import ExternalServiceError, InvalidInputError
from siet_platform.users import User

SID = "roadmap_session:abc"


def _user(uid: int, role: str) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}")


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
def world(app, monkeypatch):
    from siet_community import roadmap_edit
    from siet_community.routers import community as router

    from siet_platform import points
    from siet_platform.auth_jwt import get_current_user

    session = SimpleNamespace(id=SID, nodes=[{"id": "n1"}], settings={"web": "off"}, title="แผน", description="", edges=[])
    state = SimpleNamespace(session=session, refunds=[], charged_kinds=[], shared={}, synced=AsyncMock())

    async def charge(user, kind, ref_type=None, ref_id=None):
        state.charged_kinds.append(kind)
        return SimpleNamespace(amount=3, charged=True)

    async def refund(charge, reason):
        state.refunds.append(reason)

    monkeypatch.setattr(router, "_my_roadmap_or_404", AsyncMock(return_value=session))
    monkeypatch.setattr(router, "_expansion_scope", AsyncMock(return_value=(["notebook:x"], None)))
    monkeypatch.setattr(points, "charge", charge)
    monkeypatch.setattr(points, "refund", refund)
    monkeypatch.setattr(points, "get_balance", AsyncMock(return_value=10))
    monkeypatch.setattr(router, "_roadmap_detail", AsyncMock(return_value={"id": SID, "can_undo": True}))
    monkeypatch.setattr(router, "_roadmap_snapshot", lambda s: {"title": s.title, "nodes": s.nodes})
    monkeypatch.setattr(repo, "roadmap_posts_for_author", AsyncMock(side_effect=lambda uid, ids: state.shared))
    monkeypatch.setattr(repo, "update_post_snapshot", state.synced)
    state.edit = AsyncMock(return_value={"added": ["n5"], "removed": [], "updated": ["n1"], "summary": "เพิ่ม Docker"})
    state.undo = AsyncMock(return_value=None)
    monkeypatch.setattr(roadmap_edit, "edit_roadmap", state.edit)
    monkeypatch.setattr(roadmap_edit, "undo_edit", state.undo)
    app.dependency_overrides[get_current_user] = lambda: _user(20, "student")
    yield state
    app.dependency_overrides.pop(get_current_user, None)


def _edit(client, instruction="เพิ่ม Docker"):
    return client.post(f"/api/community/roadmaps/mine/{SID}/edit", json={"instruction": instruction})


def test_cost_is_three_points():
    from siet_platform import points

    assert points.COSTS["roadmap_edit"] == 3


def test_edit_charges_and_returns_changes(client, world):
    res = _edit(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert world.charged_kinds == ["roadmap_edit"] and world.refunds == []
    assert body["changes"] == {"added": ["n5"], "removed": [], "updated": ["n1"]}
    assert body["summary"] == "เพิ่ม Docker" and body["charged"] == 3 and body["balance"] == 10
    assert body["synced_post_id"] is None and not world.synced.called
    kwargs = world.edit.call_args.kwargs
    assert kwargs["instruction"] == "เพิ่ม Docker" and kwargs["notebook_ids"] == ["notebook:x"] and kwargs["web_mode"] == "off"


def test_edit_of_a_shared_roadmap_syncs_the_post(client, world):
    world.shared = {SID: 77}
    body = _edit(client).json()
    assert body["synced_post_id"] == 77 and world.synced.call_args.args[0] == 77


@pytest.mark.parametrize(
    "error,status", [(InvalidInputError("ไม่เปลี่ยน"), 400), (ExternalServiceError("AI ล่ม"), 502)]
)
def test_failed_edit_is_refunded(client, world, error, status):
    world.edit.side_effect = error
    res = _edit(client)
    assert res.status_code == status and world.refunds == ["roadmap edit failed"]


@pytest.mark.parametrize("instruction", ["", "ก" * 501])
def test_instruction_length_is_checked(client, world, instruction):
    assert _edit(client, instruction).status_code == 422 and world.charged_kinds == []


def test_undo_restores_and_syncs(client, world):
    world.shared = {SID: 77}
    res = client.post(f"/api/community/roadmaps/mine/{SID}/edit/undo")
    assert res.status_code == 200, res.text
    assert world.undo.called and res.json()["synced_post_id"] == 77 and world.charged_kinds == []


def test_undo_with_nothing_is_409(client, world):
    world.undo.side_effect = InvalidInputError("ไม่มีการแก้ที่ย้อนได้")
    res = client.post(f"/api/community/roadmaps/mine/{SID}/edit/undo")
    assert res.status_code == 409 and "ย้อน" in res.json()["detail"]
