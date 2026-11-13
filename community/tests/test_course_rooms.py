"""
Course rooms (4.3.1): categories, join codes, archiving, the roster and the
admin purge. Repository tests look at the SQL that is built; router tests run
the FastAPI app with the signed-in user swapped in and the repository mocked.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from siet_community import repository as repo
from siet_platform.users import User


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _room(**over):
    base = {
        "id": 5, "code": "CS101", "name": "Data Structure", "description": None,
        "kind": "course", "created_by": 7, "created_at": None, "notebook_id": None,
        "category_id": None, "term": None, "join_code": None,
        "status": "active", "archived_at": None,
    }
    base.update(over)
    return base


def _user(uid: int, role: str) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}")


class _Result:
    def __init__(self, rows=None, rowcount=1):
        self._rows = rows or []
        self.rowcount = rowcount
        self.lastrowid = 1

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return 0


class _Session:
    """Records every statement; answers with empty results."""

    def __init__(self):
        self.statements = []
        self.params = []

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


@pytest.fixture
def app():
    from api.main import app as fastapi_app

    return fastapi_app


@pytest.fixture
def client(app, monkeypatch):
    """
    The app's two gate middlewares (bearer token, then role-by-path) need a
    real token and a user row; the router tests swap the signed-in user in
    through the dependency instead, so both gates are made to pass through.
    """
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


# ---------------------------------------------------------------------------
# repository
# ---------------------------------------------------------------------------


def test_join_code_matches_is_case_and_space_insensitive():
    assert repo.join_code_matches(_room(join_code=None), None)
    assert repo.join_code_matches(_room(join_code="KMITL1"), " kmitl 1 ")
    assert not repo.join_code_matches(_room(join_code="KMITL1"), "kmitl2")
    assert not repo.join_code_matches(_room(join_code="KMITL1"), None)


def test_term_and_join_code_are_normalised():
    assert repo._clean_term("  1/2569 ") == "1/2569"
    assert repo._clean_term("   ") is None
    assert repo._clean_join_code("ab 12") == "AB12"
    assert repo._clean_join_code("") is None


@pytest.mark.asyncio
async def test_list_courses_hides_archived_rooms_unless_asked(session):
    await repo.list_courses(7)
    assert "c.status = 'active'" in session.statements[-1]
    assert "LEFT JOIN categories cat" in session.statements[-1]

    await repo.list_courses(7, include_archived=True, category_id=3)
    assert "c.status = 'active'" not in session.statements[-1]
    assert "c.category_id = :category_id" in session.statements[-1]
    assert session.params[-1]["category_id"] == 3


@pytest.mark.asyncio
async def test_ensure_course_only_fills_a_missing_category(session):
    await repo.ensure_course("CS101", "DS", None, category_id=2, term="1/2569")
    insert, update = session.statements[-2:]
    assert insert.startswith("INSERT IGNORE INTO rooms")
    assert "category_id = COALESCE(category_id, :category_id)" in update
    assert "term = COALESCE(term, :term)" in update
    assert session.params[-1] == {"code": "CS101", "category_id": 2, "term": "1/2569"}


@pytest.mark.asyncio
async def test_ensure_course_without_category_does_not_update(session):
    await repo.ensure_course("CS101", "DS")
    assert len(session.statements) == 1


@pytest.mark.asyncio
async def test_delete_course_detaches_posts_and_sweeps_library_rows(session):
    await repo.delete_course(5)
    joined = " | ".join(session.statements)
    assert "UPDATE posts SET room_id = NULL" in joined
    assert "DELETE FROM library_documents WHERE room_id = :cid AND scope = 'course'" in joined
    assert "DELETE FROM room_members" in joined
    assert session.statements[-1] == "DELETE FROM rooms WHERE id = :cid"


@pytest.mark.asyncio
async def test_set_course_status_stamps_archived_at(session):
    await repo.set_course_status(5, archived=True)
    assert "archived_at = CASE WHEN :archived THEN UTC_TIMESTAMP() ELSE NULL END" in session.statements[-1]
    assert session.params[-1]["status"] == "archived"
    await repo.set_course_status(5, archived=False)
    assert session.params[-1]["status"] == "active"


@pytest.mark.asyncio
async def test_set_member_role_rejects_unknown_roles(session):
    with pytest.raises(ValueError):
        await repo.set_member_role(5, 9, "owner")


@pytest.mark.asyncio
async def test_delete_category_uncategorises_its_rooms(session):
    await repo.delete_category(3)
    assert session.statements[0] == "UPDATE rooms SET category_id = NULL WHERE category_id = :id"
    assert session.statements[1] == "DELETE FROM categories WHERE id = :id"


# ---------------------------------------------------------------------------
# router: /api/community/courses
# ---------------------------------------------------------------------------


def test_students_cannot_open_course_rooms(client, sign_in):
    sign_in(_user(20, "student"))
    res = client.post("/api/community/courses", json={"name": "Data Structure", "code": "CS101"})
    assert res.status_code == 403


def test_duplicate_course_code_is_refused_before_insert(client, sign_in, monkeypatch):
    sign_in(_user(7, "teacher"))
    monkeypatch.setattr(repo, "find_course_by_code", AsyncMock(return_value=_room()))
    create = AsyncMock()
    monkeypatch.setattr(repo, "create_course", create)
    res = client.post("/api/community/courses", json={"name": "Data Structure", "code": "cs101"})
    assert res.status_code == 409
    create.assert_not_awaited()


def test_join_requires_the_room_code_for_students(client, sign_in, monkeypatch):
    sign_in(_user(20, "student"))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room(join_code="KMITL1")))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value=None))
    joined = AsyncMock()
    monkeypatch.setattr(repo, "set_course_membership", joined)

    res = client.post("/api/community/courses/5/join")
    assert res.status_code == 403
    assert res.headers.get("X-Join-Code-Required") == "1"

    res = client.post("/api/community/courses/5/join", json={"code": "wrong"})
    assert res.status_code == 403
    joined.assert_not_awaited()

    res = client.post("/api/community/courses/5/join", json={"code": "kmitl 1"})
    assert res.status_code == 200
    joined.assert_awaited_once_with(5, 20, True)


def test_room_owner_joins_without_a_code(client, sign_in, monkeypatch):
    sign_in(_user(7, "teacher"))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room(join_code="KMITL1")))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value=None))
    joined = AsyncMock()
    monkeypatch.setattr(repo, "set_course_membership", joined)
    assert client.post("/api/community/courses/5/join").status_code == 200
    joined.assert_awaited_once()


def test_open_rooms_take_anyone(client, sign_in, monkeypatch):
    sign_in(_user(20, "student"))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value=None))
    monkeypatch.setattr(repo, "set_course_membership", AsyncMock())
    assert client.post("/api/community/courses/5/join").status_code == 200


def test_archived_rooms_take_nobody(client, sign_in, monkeypatch):
    sign_in(_user(20, "student"))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room(status="archived")))
    res = client.post("/api/community/courses/5/join")
    assert res.status_code == 400


def test_owner_delete_archives_admin_delete_purges(client, sign_in, monkeypatch):
    from siet_community.routers import community as router

    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    status = AsyncMock()
    purge = AsyncMock(return_value={"documents": 2, "notebooks": 1})
    delete = AsyncMock()
    log = AsyncMock()  # else the test writes a "room.purge" row into the real audit log
    monkeypatch.setattr(repo, "set_course_status", status)
    monkeypatch.setattr(repo, "delete_course", delete)
    monkeypatch.setattr(router.library, "purge_course_library", purge)
    monkeypatch.setattr(router.audit, "log_action", log)

    sign_in(_user(7, "teacher"))
    res = client.delete("/api/community/courses/5")
    assert res.status_code == 200
    assert res.json()["archived"] is True and res.json()["deleted"] is None
    status.assert_awaited_once_with(5, archived=True)
    delete.assert_not_awaited()

    sign_in(_user(1, "admin"))
    res = client.delete("/api/community/courses/5")
    assert res.status_code == 200
    assert res.json()["deleted"] == 5
    assert res.json()["purged"] == {"documents": 2, "notebooks": 1}
    purge.assert_awaited_once()
    delete.assert_awaited_once_with(5)
    assert log.await_args.args[1] == "room.purge" and log.await_args.kwargs["target_id"] == 5


def test_only_owner_edits_but_a_ta_sees_the_roster(client, sign_in, monkeypatch):
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    monkeypatch.setattr(
        repo, "list_course_members",
        AsyncMock(return_value=[
            {"user_id": 7, "role": "member", "username": "user7"},
            {"user_id": 9, "role": "ta", "username": "user9"},
        ]),
    )

    sign_in(_user(20, "student"))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value="member"))
    assert client.get("/api/community/courses/5/members").status_code == 403

    # a TA may be a student account - the owner appointed them
    sign_in(_user(9, "student"))
    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value="ta"))
    res = client.get("/api/community/courses/5/members")
    assert res.status_code == 200
    body = res.json()
    assert body["owner_id"] == 7
    assert body["totals"] == {"members": 2, "assistants": 1}
    assert [m["is_owner"] for m in body["items"]] == [True, False]
    # a TA still may not change the room's settings
    assert client.patch("/api/community/courses/5", json={"name": "Renamed"}).status_code == 403


def test_owner_cannot_be_removed_or_demoted(client, sign_in, monkeypatch):
    sign_in(_user(7, "teacher"))
    monkeypatch.setattr(repo, "get_course", AsyncMock(return_value=_room()))
    assert client.delete("/api/community/courses/5/members/7").status_code == 400
    assert client.patch("/api/community/courses/5/members/7", json={"role": "ta"}).status_code == 400

    monkeypatch.setattr(repo, "member_role", AsyncMock(return_value=None))
    assert client.delete("/api/community/courses/5/members/42").status_code == 404


def test_join_code_is_only_returned_to_managers(client, sign_in, monkeypatch):
    rows = [
        _room(id=5, created_by=7, join_code="KMITL1", membership_role=None),
        _room(id=6, created_by=8, join_code=None, membership_role="ta"),
    ]
    monkeypatch.setattr(repo, "list_courses", AsyncMock(return_value=[dict(r) for r in rows]))

    # a student: no code for a room they merely could join, but as the TA of
    # room 6 they manage that one (and would see its code if it had one)
    sign_in(_user(20, "student"))
    items = client.get("/api/community/courses").json()
    assert [i["requires_code"] for i in items] == [True, False]
    assert "join_code" not in items[0] and items[0]["can_manage"] is False
    assert items[1]["can_manage"] is True and items[1]["join_code"] is None

    # the owner of room 5 gets its code back
    sign_in(_user(7, "teacher"))
    items = client.get("/api/community/courses").json()
    assert items[0]["join_code"] == "KMITL1" and items[0]["can_manage"] is True

    # someone who is neither owner nor TA anywhere sees no codes at all
    sign_in(_user(30, "teacher"))
    monkeypatch.setattr(
        repo, "list_courses",
        AsyncMock(return_value=[dict(_room(id=5, created_by=7, join_code="KMITL1", membership_role="member"))]),
    )
    items = client.get("/api/community/courses").json()
    assert "join_code" not in items[0] and items[0]["can_manage"] is False


def test_list_rows_keep_the_computed_requires_code_flag(client, sign_in, monkeypatch):
    """list_courses selects a requires_code flag instead of the code column itself."""
    row = _room(id=5, created_by=7, membership_role=None)
    del row["join_code"]
    row["requires_code"] = True
    monkeypatch.setattr(repo, "list_courses", AsyncMock(return_value=[row]))

    sign_in(_user(20, "student"))
    items = client.get("/api/community/courses").json()
    assert items[0]["requires_code"] is True and "join_code" not in items[0]

    sign_in(_user(7, "teacher"))
    items = client.get("/api/community/courses").json()
    assert items[0]["requires_code"] is True and "join_code" not in items[0]   # not selected -> not invented


# ---------------------------------------------------------------------------
# router: /api/admin/categories
# ---------------------------------------------------------------------------


def test_slugify_handles_thai_only_names():
    from siet_community.routers.admin import _slugify

    assert _slugify("Computer Education") == "computer-education"
    assert _slugify("ครุศาสตร์วิศวกรรม").startswith("cat-")


def test_admin_creates_categories_teachers_do_not(client, sign_in, monkeypatch):
    monkeypatch.setattr(repo, "find_category_by_slug", AsyncMock(return_value=None))
    created = {"id": 3, "slug": "computer-education", "name": "ครุศาสตร์วิศวกรรม", "name_en": "Computer Education", "sort_order": 0}
    monkeypatch.setattr(repo, "create_category", AsyncMock(return_value=created))

    sign_in(_user(7, "teacher"))
    res = client.post("/api/admin/categories", json={"name": "ครุศาสตร์วิศวกรรม", "name_en": "Computer Education"})
    assert res.status_code == 403

    sign_in(_user(1, "admin"))
    res = client.post("/api/admin/categories", json={"name": "ครุศาสตร์วิศวกรรม", "name_en": "Computer Education"})
    assert res.status_code == 201
    assert res.json()["slug"] == "computer-education"
