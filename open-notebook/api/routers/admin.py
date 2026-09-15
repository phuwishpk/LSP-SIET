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
from loguru import logger
from pydantic import BaseModel, Field

from api.auth_jwt import get_current_user
from open_notebook.community import points
from open_notebook.domain.user import (
    USER_ROLE_ADMIN,
    USER_ROLES,
    InvalidPasswordError,
    User,
    admin_list_users,
    count_admins,
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
    logger.info(f"admin {user.username} reset the password of {target.username}")
    return {"ok": True}


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
                      (SELECT COUNT(*) FROM courses) AS courses,
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
