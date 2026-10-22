"""
Moderation (4.3.5): content reports, the room owner's and the admin's queues,
timed suspensions and the audit log.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from open_notebook.community import moderation
from siet_platform import audit as audit_log, notifications
from open_notebook.community import repository as repo
from siet_platform import users
from siet_platform.users import User


def _user(uid: int, role: str, **over) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}", **over)


class _Result:
    def __init__(self, rows=None, rowcount=1, scalar=0):
        self._rows, self.rowcount, self._scalar, self.lastrowid = rows or [], rowcount, scalar, 7

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows

    def scalar(self):
        return self._scalar


class _Session:
    def __init__(self, results=None, fail=False):
        self.statements, self.params, self._results, self.fail = [], [], list(results or []), fail

    async def execute(self, statement, params=None):
        if self.fail:
            raise RuntimeError("db down")
        self.statements.append(" ".join(str(statement).split()))
        self.params.append(params or {})
        return self._results.pop(0) if self._results else _Result()


def _patch(monkeypatch, module, fake):
    @asynccontextmanager
    async def fake_session():
        yield fake

    monkeypatch.setattr(module, "_mariadb_session", fake_session)


# ---------------------------------------------------------------------------
# reports
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_report_rejects_self_unknown_and_duplicates(monkeypatch):
    monkeypatch.setattr(moderation, "resolve_target", AsyncMock(return_value=None))
    with pytest.raises(moderation.ReportError):
        await moderation.create_report(20, "post", 11, "spam")

    monkeypatch.setattr(moderation, "resolve_target", AsyncMock(return_value={"owner_id": 20, "room_id": 5, "title": "t"}))
    with pytest.raises(moderation.ReportError):
        await moderation.create_report(20, "post", 11, "spam")          # own post

    fake = _Session([_Result(rowcount=0)])                                # INSERT IGNORE hit the unique key
    _patch(monkeypatch, moderation, fake)
    monkeypatch.setattr(moderation, "resolve_target", AsyncMock(return_value={"owner_id": 7, "room_id": 5, "title": "t"}))
    with pytest.raises(moderation.DuplicateReport):
        await moderation.create_report(20, "post", 11, "spam")

    fake = _Session([_Result(rowcount=1)])
    _patch(monkeypatch, moderation, fake)
    created = await moderation.create_report(20, "post", 11, "harassment", detail="  rude   words ")
    assert created["id"] == 7 and created["room_id"] == 5
    assert fake.params[-1]["detail"] == "rude words" and fake.params[-1]["room"] == 5

    with pytest.raises(moderation.ReportError):
        await moderation.create_report(20, "post", 11, "because")        # unknown reason


@pytest.mark.asyncio
async def test_list_reports_filters_and_orders_open_first(monkeypatch):
    fake = _Session([_Result(scalar=3), _Result(rows=[])])
    _patch(monkeypatch, moderation, fake)
    out = await moderation.list_reports(status="open", target_type="post", room_id=5, limit=10, offset=20)
    assert out["total"] == 3
    sql = fake.statements[-1]
    assert "r.status = :status" in sql and "r.target_type = :ttype" in sql and "r.room_id = :room_id" in sql
    assert "ORDER BY r.status = 'open' DESC, r.id DESC" in sql
    assert "AS report_count" in sql and "AS target_owner_id" in sql
    await moderation.list_reports(status="all")
    assert "r.status = :status" not in fake.statements[-1]


@pytest.mark.asyncio
async def test_resolve_validates_and_closes_siblings(monkeypatch):
    with pytest.raises(moderation.ReportError):
        await moderation.resolve_report(1, status="open", action="none", reviewer_id=1)
    with pytest.raises(moderation.ReportError):
        await moderation.resolve_report(1, status="actioned", action="ban_forever", reviewer_id=1)
    fake = _Session([_Result(), _Result(rowcount=2)])
    _patch(monkeypatch, moderation, fake)
    await moderation.resolve_report(1, status="actioned", action="hide_post", reviewer_id=1, note="  spam  ")
    assert fake.params[0]["note"] == "spam" and "reviewed_at = UTC_TIMESTAMP()" in fake.statements[0]
    assert await moderation.resolve_sibling_reports("post", 11, status="actioned", action="hide_post", reviewer_id=1) == 2
    assert "status = 'open'" in fake.statements[1]


@pytest.mark.asyncio
async def test_audit_never_raises_and_lists(monkeypatch):
    _patch(monkeypatch, audit_log, _Session(fail=True))
    await audit_log.log_action(1, "user.update", target_type="user", target_id=5, detail={"role": "teacher"})

    fake = _Session([_Result()])
    _patch(monkeypatch, audit_log, fake)
    await audit_log.log_action(1, "x" * 100, target_type="user", target_id=5, detail={"a": 1})
    assert len(fake.params[-1]["action"]) == 64 and fake.params[-1]["detail"] == '{"a": 1}'

    fake = _Session([_Result(scalar=1), _Result(rows=[])])
    _patch(monkeypatch, audit_log, fake)
    out = await audit_log.list_audit(action="user.", actor_id=1)
    assert out["total"] == 1 and fake.params[-1]["action"] == "user.%" and "a.actor_id = :actor" in fake.statements[-1]


# ---------------------------------------------------------------------------
# timed suspension
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_suspension_lifts_itself(monkeypatch):
    lifted = AsyncMock()
    monkeypatch.setattr(users, "set_disabled", lifted)
    past = (datetime.utcnow() - timedelta(minutes=1)).isoformat()
    u = _user(20, "student", disabled=True, suspended_until=past, suspend_reason="spam")
    assert await users.suspension_lifted(u) is True
    lifted.assert_awaited_once_with(20, False)
    assert u.disabled is False and u.suspend_reason is None

    future = (datetime.utcnow() + timedelta(days=1)).isoformat()
    u2 = _user(21, "student", disabled=True, suspended_until=future)
    assert await users.suspension_lifted(u2) is False and u2.disabled is True
    assert await users.suspension_lifted(_user(22, "student", disabled=True)) is False   # indefinite


def test_suspension_text_mentions_reason_and_date():
    u = _user(20, "student", disabled=True, suspended_until="2026-11-01T00:00:00", suspend_reason="สแปม")
    text = users.suspension_text(u)
    assert "สแปม" in text and "2026-11-01" in text


# ---------------------------------------------------------------------------
# routes
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


def _report(**over):
    base = {"id": 3, "reporter_id": 20, "target_type": "post", "target_id": 11, "room_id": 5, "reason": "spam",
            "reason_label": "สแปม / โฆษณา", "detail": None, "status": "open", "action": None, "note": None,
            "report_count": 2, "target_owner_id": 9, "target_title": "t", "target_gone": False}
    base.update(over)
    return base


def test_members_report_what_they_can_see(client, sign_in, monkeypatch):
    from api.routers import community as router

    monkeypatch.setattr(router, "_visible_post_or_404", AsyncMock(return_value={"id": 11}))
    created = AsyncMock(return_value={"id": 3, "room_id": 5, "title": "t"})
    monkeypatch.setattr(moderation, "create_report", created)
    sign_in(_user(20, "student"))
    res = client.post("/api/community/reports", json={"target_type": "post", "target_id": 11, "reason": "spam"})
    assert res.status_code == 201 and res.json()["report_id"] == 3

    monkeypatch.setattr(moderation, "create_report", AsyncMock(side_effect=moderation.DuplicateReport("dup")))
    assert client.post("/api/community/reports", json={"target_type": "post", "target_id": 11, "reason": "spam"}).status_code == 409
    assert client.post("/api/community/reports", json={"target_type": "post", "target_id": 11, "reason": "meh"}).status_code == 422


def test_room_owner_settles_reports_in_own_room_only(client, sign_in, monkeypatch):
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value={"id": 5, "created_by": 7, "status": "active"}))
    monkeypatch.setattr(moderation, "get_report", AsyncMock(return_value=_report()))
    hide = AsyncMock(); monkeypatch.setattr(repo, "soft_delete_post", hide)
    resolve = AsyncMock(); monkeypatch.setattr(moderation, "resolve_report", resolve)
    siblings = AsyncMock(return_value=1); monkeypatch.setattr(moderation, "resolve_sibling_reports", siblings)
    audit = AsyncMock(); monkeypatch.setattr(audit_log, "log_action", audit)

    sign_in(_user(7, "teacher"))
    res = client.post("/api/community/courses/5/reports/3", json={"status": "actioned", "action": "hide_post"})
    assert res.status_code == 200
    hide.assert_awaited_once_with(11)
    assert resolve.await_args.kwargs["status"] == "actioned" and audit.await_args.args[1] == "room.report.hide_post"

    # a report from another room, or a non-owner, is refused
    monkeypatch.setattr(moderation, "get_report", AsyncMock(return_value=_report(room_id=6)))
    assert client.post("/api/community/courses/5/reports/3", json={"status": "dismissed"}).status_code == 404
    sign_in(_user(20, "student"))
    assert client.post("/api/community/courses/5/reports/3", json={"status": "dismissed"}).status_code == 403
    assert client.get("/api/community/courses/5/reports").status_code == 403


def test_admin_resolves_with_suspension_and_audit(client, sign_in, monkeypatch):
    from api.routers import admin as admin_router

    monkeypatch.setattr(moderation, "get_report", AsyncMock(return_value=_report(target_type="comment", target_id=44)))
    monkeypatch.setattr(moderation, "resolve_report", AsyncMock())
    monkeypatch.setattr(moderation, "resolve_sibling_reports", AsyncMock(return_value=0))
    audit = AsyncMock(); monkeypatch.setattr(audit_log, "log_action", audit)
    target = _user(9, "student")
    monkeypatch.setattr(admin_router, "_target_or_404", AsyncMock(return_value=target))
    suspended = AsyncMock(); monkeypatch.setattr(admin_router, "set_disabled", suspended)
    notified = AsyncMock(); monkeypatch.setattr(notifications, "add_notification", notified)

    sign_in(_user(7, "teacher"))
    assert client.post("/api/admin/reports/3", json={"status": "actioned"}).status_code == 403
    assert client.get("/api/admin/reports").status_code == 403
    assert client.get("/api/admin/audit").status_code == 403

    sign_in(_user(1, "admin"))
    # wrong action for the target type
    assert client.post("/api/admin/reports/3", json={"status": "actioned", "action": "hide_post"}).status_code == 400
    res = client.post("/api/admin/reports/3", json={
        "status": "actioned", "action": "suspend_user", "suspend_reason": "spam", "suspended_until": "2026-12-01",
    })
    assert res.status_code == 200
    assert suspended.await_args.args[:2] == (9, True)
    assert suspended.await_args.kwargs["reason"] == "spam"
    assert suspended.await_args.kwargs["until"] == datetime(2026, 12, 1)
    assert "2026-12-01" in notified.await_args.args[2]
    assert audit.await_args.args[1] == "report.suspend_user"


def test_admin_user_update_carries_suspension_fields_and_is_audited(client, sign_in, monkeypatch):
    from api.routers import admin as admin_router

    target = _user(9, "student")
    monkeypatch.setattr(admin_router, "_target_or_404", AsyncMock(return_value=target))
    suspended = AsyncMock(); monkeypatch.setattr(admin_router, "set_disabled", suspended)
    monkeypatch.setattr(notifications, "add_notification", AsyncMock())
    audit = AsyncMock(); monkeypatch.setattr(audit_log, "log_action", audit)
    sign_in(_user(1, "admin"))
    res = client.patch("/api/admin/users/9", json={"disabled": True, "suspend_reason": "harassment", "suspended_until": "2026-11-15"})
    assert res.status_code == 200
    assert suspended.await_args.kwargs == {"reason": "harassment", "until": datetime(2026, 11, 15)}
    assert audit.await_args.args[1] == "user.update" and audit.await_args.kwargs["detail"]["disabled"] is True

    res = client.patch("/api/admin/users/9", json={"disabled": False})
    assert suspended.await_args.args == (9, False)
