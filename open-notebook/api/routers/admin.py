"""
Admin console API.

Everything an administrator previously had to do by hand in MariaDB: look up an
account, change someone's role, top their wallet up, reset a forgotten password
or suspend an account.

The whole router is admin-only. `RoleAccessMiddleware` already guards the
`/api/admin` prefix, and every route re-checks the caller so the rule survives a
middleware change.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from loguru import logger
from pydantic import BaseModel, Field

from api.auth_jwt import get_current_user
from api.login_guard import clear_login_failures
from open_notebook.community import points
from open_notebook.community import repository as repo
from open_notebook.domain.user import (
    USER_ROLE_ADMIN,
    USER_ROLES,
    InvalidPasswordError,
    InvalidUsernameError,
    User,
    UserAlreadyExists,
    _mariadb_session,
    admin_delete_user,
    admin_list_users,
    count_admins,
    create as create_user,
    get_by_id,
    hash_password,
    set_disabled,
    update_password,
    update_profile,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class UserUpdate(BaseModel):
    role: Optional[Literal["student", "teacher", "admin"]] = None
    display_name: Optional[str] = Field(default=None, max_length=128)
    student_id: Optional[str] = Field(default=None, max_length=32)
    disabled: Optional[bool] = None


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=128)
    role: Literal["student", "teacher", "admin"] = "student"
    student_id: Optional[str] = Field(default=None, max_length=32)


class BulkUserIds(BaseModel):
    ids: List[int] = Field(..., min_length=1, max_length=200)


class CsvImport(BaseModel):
    # Raw CSV text, pasted into the box or read from a file by the browser.
    csv: str = Field(..., min_length=1, max_length=500_000)
    dry_run: bool = False


class PointsAdjust(BaseModel):
    # Positive adds, negative deducts.
    delta: int = Field(..., ge=-10000, le=10000)
    note: Optional[str] = Field(default=None, max_length=200)


class PasswordReset(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_admin(user: User) -> int:
    if (user.role or "") != USER_ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น")
    if user.id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return int(user.id)


def _guard_delete(target: User, admin_id: int) -> None:
    """The same rails as suspension: never strand the workspace without an admin."""
    if int(target.id or 0) == admin_id:
        raise HTTPException(status_code=400, detail="ลบบัญชีของตัวเองไม่ได้")
    if (target.role or "") == USER_ROLE_ADMIN:
        raise HTTPException(
            status_code=400,
            detail="ลดสิทธิ์ผู้ดูแลคนนี้ให้เป็นอาจารย์หรือนักศึกษาก่อน แล้วจึงลบได้",
        )


def _parse_csv(raw: str, *, required: tuple, optional: tuple = ()) -> List[tuple]:
    """
    Read a small CSV into dicts, with or without a header row.

    Teachers export from a spreadsheet, so a header line is likely but not
    guaranteed; when it is missing the columns are taken in the documented order.
    """
    import csv as csv_module
    import io

    columns = list(required) + list(optional)
    reader = csv_module.reader(io.StringIO(raw.strip()))
    rows = [r for r in reader if any((c or "").strip() for c in r)]
    if not rows:
        raise HTTPException(status_code=400, detail="ไฟล์ CSV ว่างเปล่า")

    header = [h.strip().lower().replace(" ", "_") for h in rows[0]]
    has_header = all(h in columns for h in header if h) and any(h in required for h in header)
    if has_header:
        keys, body = header, rows[1:]
    else:
        keys, body = columns, rows
    if not body:
        raise HTTPException(status_code=400, detail="ไม่มีข้อมูลในไฟล์ CSV (มีแต่หัวตาราง)")

    out: List[tuple] = []
    for idx, row in enumerate(body, start=2 if has_header else 1):
        out.append((idx, {k: (row[i].strip() if i < len(row) else "") for i, k in enumerate(keys)}))
    return out


async def _target_or_404(user_id: int) -> User:
    target = await get_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="ไม่พบบัญชีนี้")
    return target


def _public(target: User) -> Dict[str, Any]:
    return {
        "id": target.id,
        "username": target.username,
        "display_name": target.display_name,
        "role": target.role,
        "email": target.email,
        "student_id": target.student_id,
        "avatar_url": target.avatar_url,
        "points_balance": int(target.points_balance or 0),
        "disabled": bool(target.disabled),
        "created_at": target.created_at,
        "last_login_at": target.last_login_at,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/users")
async def list_users(
    q: Optional[str] = Query(default=None, max_length=100),
    role: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Search the user directory."""
    _require_admin(user)
    result = await admin_list_users(query=q, role=role, limit=limit, offset=offset)
    result["me"] = int(user.id or 0)
    return result


@router.get("/users/{user_id}")
async def get_user(user_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _require_admin(user)
    target = await _target_or_404(user_id)
    history = await points.history(user_id, 20)
    return {"user": _public(target), "points_history": history}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int, body: UserUpdate, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Change a role, rename an account, or suspend/restore it."""
    admin_id = _require_admin(user)
    target = await _target_or_404(user_id)

    # Guard rails: never let an admin lock themselves (or everyone) out.
    if user_id == admin_id and body.role is not None and body.role != USER_ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="เปลี่ยนสิทธิ์ของตัวเองไม่ได้")
    if user_id == admin_id and body.disabled:
        raise HTTPException(status_code=400, detail="ระงับบัญชีตัวเองไม่ได้")
    removing_admin = target.role == USER_ROLE_ADMIN and (
        (body.role is not None and body.role != USER_ROLE_ADMIN) or body.disabled is True
    )
    if removing_admin and await count_admins(exclude_user_id=user_id) == 0:
        raise HTTPException(
            status_code=400, detail="ต้องเหลือผู้ดูแลระบบอย่างน้อยหนึ่งคน"
        )
    if body.role is not None and body.role not in USER_ROLES:
        raise HTTPException(status_code=400, detail="สิทธิ์ไม่ถูกต้อง")

    if body.role is not None or body.display_name is not None or body.student_id is not None:
        await update_profile(
            user_id,
            role=body.role,
            display_name=body.display_name,
            student_id=body.student_id,
        )
    if body.disabled is not None:
        await set_disabled(user_id, body.disabled)

    logger.info(
        f"admin {user.username} updated user {target.username}: "
        f"role={body.role} disabled={body.disabled}"
    )
    return {"user": _public(await _target_or_404(user_id))}


@router.post("/users/{user_id}/points")
async def adjust_points(
    user_id: int, body: PointsAdjust, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Add or remove points by hand, recorded in the wallet history like any other change."""
    _require_admin(user)
    target = await _target_or_404(user_id)
    if body.delta == 0:
        raise HTTPException(status_code=400, detail="ระบุจำนวนแต้มที่ต้องการปรับ")

    note = (body.note or f"ปรับโดยผู้ดูแล ({user.username})")[:200]
    if body.delta > 0:
        balance = await points.grant(
            user_id, body.delta, "admin_grant", ref_type="admin", ref_id=str(user.id), note=note
        )
    else:
        current = await points.get_balance(user_id)
        amount = min(-body.delta, current)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="บัญชีนี้ไม่มีแต้มให้หักแล้ว")
        charge = await points.charge(
            User(
                id=target.id,
                username=target.username,
                role="student",  # force a charge even for exempt roles
            ),
            "admin_deduct",
            amount=amount,
            ref_type="admin",
            ref_id=str(user.id),
            note=note,
        )
        balance = charge.balance_after or 0

    logger.info(f"admin {user.username} adjusted points of {target.username} by {body.delta}")
    return {"user": _public(await _target_or_404(user_id)), "balance": balance}


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: int, body: PasswordReset, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Set a new password for an account that signs in with username/password."""
    _require_admin(user)
    target = await _target_or_404(user_id)
    try:
        hash_password(body.password)  # validate before writing
        await update_password(user_id, body.password)
    except InvalidPasswordError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    # Someone locked out by the sign-in throttle needs a way back in, and a new
    # password from an admin is exactly that moment.
    await clear_login_failures(target.username)
    logger.info(f"admin {user.username} reset the password of {target.username}")
    return {"ok": True, "unlocked": True}


@router.post("/users", status_code=201)
async def create_account(body: UserCreate, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Create an account by hand.

    Needed because self-registration is turned off in production and Google
    sign-in only ever produces the role its e-mail implies - so without this an
    admin could not give a new teacher an account at all.
    """
    _require_admin(user)
    try:
        created = await create_user(
            username=body.username,
            password=body.password,
            display_name=body.display_name,
            role=body.role,
        )
    except UserAlreadyExists:
        raise HTTPException(status_code=409, detail="ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว")
    except (InvalidUsernameError, InvalidPasswordError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if body.student_id:
        await update_profile(created.id, student_id=body.student_id)
        created = await get_by_id(int(created.id))
    # Same welcome allowance a self-registered account gets. Teachers and admins
    # are points-exempt, so `ensure_welcome` is a no-op for them by design.
    if created is not None:
        await points.ensure_welcome(created)
        created = await get_by_id(int(created.id))
    logger.info(f"admin {user.username} created account {body.username} ({body.role})")
    return {"user": _public(created)} if created else {}


@router.delete("/users/{user_id}")
async def delete_account(user_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Delete one account for good. Suspend instead if you only want it off."""
    admin_id = _require_admin(user)
    target = await _target_or_404(user_id)
    _guard_delete(target, admin_id)
    removed = await admin_delete_user(user_id)
    return {"ok": True, "deleted": user_id, "removed": removed}


@router.post("/users/bulk-delete")
async def bulk_delete_accounts(
    body: BulkUserIds, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Delete several accounts in one go - what clearing out test data needs."""
    admin_id = _require_admin(user)
    deleted: List[int] = []
    skipped: List[Dict[str, Any]] = []
    for uid in dict.fromkeys(body.ids):
        target = await get_by_id(uid)
        if target is None:
            skipped.append({"id": uid, "reason": "ไม่พบบัญชีนี้"})
            continue
        try:
            _guard_delete(target, admin_id)
        except HTTPException as exc:
            skipped.append({"id": uid, "username": target.username, "reason": exc.detail})
            continue
        await admin_delete_user(uid)
        deleted.append(uid)
    logger.info(f"admin {user.username} bulk-deleted {len(deleted)} accounts")
    return {"deleted": deleted, "skipped": skipped}


# ---------------------------------------------------------------------------
# Content moderation
# ---------------------------------------------------------------------------


@router.get("/posts")
async def list_all_posts(
    q: Optional[str] = Query(default=None, max_length=200),
    type: Optional[str] = Query(default=None, pattern="^(summary|quiz|roadmap|question|material)$"),
    course_id: Optional[int] = None,
    author_id: Optional[int] = None,
    state: Literal["visible", "deleted", "all"] = "visible",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Every post in the workspace, deleted ones included - the moderation view."""
    _require_admin(user)
    return await repo.admin_list_posts(
        query=q,
        post_type=type,
        course_id=course_id,
        author_id=author_id,
        state=state,
        limit=limit,
        offset=offset,
    )


@router.delete("/posts/{post_id}")
async def moderate_delete_post(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _require_admin(user)
    if not await repo.post_exists(post_id):
        raise HTTPException(status_code=404, detail="ไม่พบโพสต์นี้")
    await repo.soft_delete_post(post_id)
    return {"ok": True, "deleted": post_id}


@router.post("/posts/{post_id}/restore")
async def moderate_restore_post(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Undo a deletion - posts are flagged, never actually dropped."""
    _require_admin(user)
    if not await repo.post_exists(post_id):
        raise HTTPException(status_code=404, detail="ไม่พบโพสต์นี้")
    await repo.restore_post(post_id)
    return {"ok": True, "restored": post_id}


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


@router.get("/courses")
async def list_all_courses(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Every room with its owner and size - including the abandoned ones."""
    _require_admin(user)
    items = await repo.admin_list_courses()
    return {
        "items": items,
        "totals": {
            "courses": sum(1 for c in items if c["kind"] != repo.KIND_CLUB),
            "clubs": sum(1 for c in items if c["kind"] == repo.KIND_CLUB),
            "empty": sum(1 for c in items if c["post_count"] == 0),
            "ownerless": sum(1 for c in items if not c.get("owner_username")),
        },
    }


# ---------------------------------------------------------------------------
# Points ledger
# ---------------------------------------------------------------------------


@router.get("/points/log")
async def points_log(
    user_id: Optional[int] = None,
    kind: Optional[str] = Query(default=None, max_length=32),
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Where points went: the raw ledger plus the day's totals per kind."""
    _require_admin(user)
    return await repo.admin_points_log(user_id=user_id, kind=kind, days=days, limit=limit)


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------


@router.post("/import/courses")
async def import_courses(body: CsvImport, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Bulk-create course rooms from ``code,name,description``.

    A header row is optional and rows whose code already exists are reported as
    skipped rather than failing the whole import.
    """
    admin_id = _require_admin(user)
    rows = _parse_csv(body.csv, required=("code", "name"), optional=("description",))
    created, skipped, errors = [], [], []
    for line_no, row in rows:
        code = (row.get("code") or "").strip().upper()[:32]
        name = (row.get("name") or "").strip()[:128]
        if not code or len(name) < 2:
            errors.append({"line": line_no, "reason": "ต้องมีรหัสวิชาและชื่อวิชา"})
            continue
        existing = await repo.find_course_by_code(code)
        if existing:
            skipped.append({"line": line_no, "code": code, "reason": "มีรหัสนี้อยู่แล้ว"})
            continue
        if body.dry_run:
            created.append({"line": line_no, "code": code, "name": name})
            continue
        course = await repo.create_course(code, name, row.get("description"), admin_id)
        created.append({"line": line_no, "code": course["code"], "name": course["name"],
                        "id": course["id"]})
    return {"created": created, "skipped": skipped, "errors": errors, "dry_run": body.dry_run}


@router.post("/import/users")
async def import_users(body: CsvImport, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Bulk-create accounts from ``username,password,display_name,role,student_id``."""
    _require_admin(user)
    rows = _parse_csv(
        body.csv,
        required=("username", "password"),
        optional=("display_name", "role", "student_id"),
    )
    created, skipped, errors = [], [], []
    for line_no, row in rows:
        username = (row.get("username") or "").strip().lower()
        password = (row.get("password") or "").strip()
        role = (row.get("role") or "student").strip().lower()
        if role not in USER_ROLES:
            errors.append({"line": line_no, "username": username, "reason": f"สิทธิ์ '{role}' ไม่ถูกต้อง"})
            continue
        if body.dry_run:
            created.append({"line": line_no, "username": username, "role": role})
            continue
        try:
            account = await create_user(
                username=username, password=password,
                display_name=(row.get("display_name") or "").strip() or None, role=role,
            )
        except UserAlreadyExists:
            skipped.append({"line": line_no, "username": username, "reason": "มีชื่อผู้ใช้นี้แล้ว"})
            continue
        except (InvalidUsernameError, InvalidPasswordError) as exc:
            errors.append({"line": line_no, "username": username, "reason": str(exc)})
            continue
        if row.get("student_id"):
            await update_profile(account.id, student_id=row["student_id"].strip()[:32])
        fresh = await get_by_id(int(account.id))
        if fresh is not None:
            await points.ensure_welcome(fresh)
        created.append({"line": line_no, "username": username, "role": role, "id": int(account.id)})
    return {"created": created, "skipped": skipped, "errors": errors, "dry_run": body.dry_run}


# ---------------------------------------------------------------------------
# System health
# ---------------------------------------------------------------------------


@router.get("/health")
async def system_health(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Is the workspace actually able to work?

    Counting rows says nothing about why "the AI does not answer" - that is
    almost always a missing default model or a dead dependency, so check those.
    """
    _require_admin(user)
    checks: List[Dict[str, Any]] = []

    async def probe(name: str, label: str, fn) -> None:
        try:
            detail = await fn()
            checks.append({"name": name, "label": label, "ok": True, "detail": detail})
        except Exception as exc:  # noqa: BLE001 - a health probe reports, never raises
            checks.append({"name": name, "label": label, "ok": False, "detail": str(exc)[:200]})

    async def mariadb() -> str:
        async with _mariadb_session() as session:
            row = (await session.execute(text("SELECT VERSION() AS v"))).first()
        return f"MariaDB {row.v}" if row else "connected"

    async def surreal() -> str:
        from open_notebook.database.repository import repo_query

        rows = await repo_query("SELECT count() AS n FROM notebook GROUP ALL")
        return f"{(rows[0].get('n') if rows else 0) or 0} notebooks"

    async def redis_check() -> str:
        import os

        from redis.asyncio import from_url

        client = from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
        try:
            await client.ping()
            return "ping ok"
        finally:
            await client.aclose()

    async def models() -> str:
        from open_notebook.ai.models import DefaultModels

        defaults = await DefaultModels.get_instance()
        missing = [
            label
            for label, value in (
                ("โมเดลสนทนา (chat)", defaults.default_chat_model),
                ("โมเดล embedding", defaults.default_embedding_model),
            )
            if not value
        ]
        if missing:
            raise RuntimeError("ยังไม่ได้ตั้ง " + " และ ".join(missing))
        return "ตั้งค่าโมเดลครบแล้ว"

    await probe("mariadb", "ฐานข้อมูลผู้ใช้ (MariaDB)", mariadb)
    await probe("surrealdb", "ฐานข้อมูลเนื้อหา (SurrealDB)", surreal)
    await probe("redis", "แคช (Redis)", redis_check)
    await probe("models", "โมเดล AI เริ่มต้น", models)

    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM library_documents WHERE status = 'failed') AS failed_docs,
                      (SELECT COUNT(*) FROM library_documents WHERE status = 'processing') AS processing_docs,
                      (SELECT COUNT(*) FROM posts WHERE is_deleted = 1) AS deleted_posts,
                      (SELECT COUNT(*) FROM rooms WHERE created_by IS NULL) AS ownerless_rooms
                    """
                )
            )
        ).first()

    return {
        "checks": checks,
        "healthy": all(c["ok"] for c in checks),
        "content": {
            "failed_documents": int(row.failed_docs or 0) if row else 0,
            "processing_documents": int(row.processing_docs or 0) if row else 0,
            "deleted_posts": int(row.deleted_posts or 0) if row else 0,
            "ownerless_rooms": int(row.ownerless_rooms or 0) if row else 0,
        },
    }


@router.get("/overview")
async def overview(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Headline numbers for the admin dashboard."""
    _require_admin(user)
    from sqlalchemy import text

    from open_notebook.domain.user import _mariadb_session

    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM users) AS users,
                      (SELECT COUNT(*) FROM users WHERE disabled = 1) AS suspended,
                      (SELECT COUNT(*) FROM users WHERE last_login_at >= NOW() - INTERVAL 7 DAY) AS active_week,
                      (SELECT COUNT(*) FROM posts WHERE is_deleted = 0) AS posts,
                      (SELECT COUNT(*) FROM rooms) AS courses,
                      (SELECT COUNT(*) FROM library_documents WHERE status = 'ready') AS documents,
                      (SELECT COALESCE(SUM(points_balance), 0) FROM users) AS points_outstanding,
                      (SELECT COALESCE(SUM(-delta), 0) FROM point_transactions
                        WHERE delta < 0 AND created_at >= NOW() - INTERVAL 7 DAY) AS points_spent_week
                    """
                )
            )
        ).first()
    if not row:
        return {}
    return {
        "users": int(row.users or 0),
        "suspended": int(row.suspended or 0),
        "active_week": int(row.active_week or 0),
        "posts": int(row.posts or 0),
        "courses": int(row.courses or 0),
        "documents": int(row.documents or 0),
        "points_outstanding": int(row.points_outstanding or 0),
        "points_spent_week": int(row.points_spent_week or 0),
    }
