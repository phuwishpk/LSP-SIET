"""
HTTP helpers shared by the SIET routers (community, KMITL RAG, admin): the
caller's id, error envelopes that never leak internals, the spam gate, and
turning a knowledge scope / dropdown pick into notebook ids.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import HTTPException, status
from loguru import logger

from siet_platform import audit, library, points, ratelimit
from siet_platform.users import USER_ROLE_ADMIN, User


def _uid(user: User) -> int:
    if user.id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return int(user.id)


def _owner(user: User) -> str:
    return str(_uid(user))


def _insufficient(exc: points.InsufficientPoints) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail=f"แต้มไม่พอ: ต้องใช้ {exc.required} แต้ม แต่คุณมี {exc.balance} แต้ม",
        headers={
            "X-Points-Required": str(exc.required),
            "X-Points-Balance": str(exc.balance),
            "X-Points-Kind": exc.kind,
        },
    )


def _internal_error(exc: Exception, what: str) -> HTTPException:
    """
    An unexpected failure: log the traceback with a short reference and give
    the client that reference instead of the exception text, which can carry
    provider responses, file paths or SQL.
    """
    ref = uuid.uuid4().hex[:8]
    logger.exception(f"{what} [ref {ref}]")
    return HTTPException(
        status_code=500,
        detail=f"เกิดข้อผิดพลาดภายในระบบ (รหัสอ้างอิง {ref}) ลองใหม่อีกครั้ง หรือแจ้งผู้ดูแลพร้อมรหัสนี้",
    )


async def _guard_spam(user: User, action: str) -> None:
    """Stop rapid-fire / bulk submissions before any work is done."""
    try:
        await ratelimit.check_rate(user, action)
    except ratelimit.RateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=exc.message,
            headers={"Retry-After": str(exc.retry_after)},
        )


def _library_error(exc: library.LibraryError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


async def _resolve_pick(
    user: User,
    document_ids: List[int],
    notebook_ids: List[str],
    source_ids: List[str],
) -> Optional[tuple[List[str], Optional[List[str]], str]]:
    """
    Explicit dropdown picks → ``(notebook_ids, source_ids, label)``, else None.

    A single document means *that document*: the search is narrowed to its
    source instead of the whole notebook that happens to hold it.
    """
    try:
        if source_ids or notebook_ids:
            pick = await library.resolve_knowledge_pick(
                user, notebook_ids=notebook_ids, source_ids=source_ids
            )
            return pick["notebook_ids"], pick["source_ids"], pick["label"]
        if document_ids:
            docs = await library.scope_for_documents(user, document_ids)
            return docs["notebook_ids"], docs["source_ids"], "เอกสารที่เลือก"
    except library.LibraryError as exc:
        raise _library_error(exc)
    return None


async def _resolve_scope(
    user: User,
    scope: str,
    course_id: Optional[int],
    document_ids: List[int],
) -> tuple[List[str], str, bool]:
    """
    Resolve a request scope into ``(notebook_ids, label, allow_global_fallback)``.

    "auto" may widen to the whole workspace when the caller has no documents
    yet; an explicit course/personal/document scope must never do that.
    """
    try:
        notebook_ids = await library.notebook_ids_for_scope(
            user,
            scope=scope,
            course_id=course_id,
            document_ids=document_ids or None,
        )
    except library.LibraryError as exc:
        raise _library_error(exc)

    if document_ids:
        label = "เอกสารที่เลือก"
    elif scope == library.SCOPE_COURSE and course_id:
        course = await library.get_course(course_id)
        label = f"คลังความรู้วิชา {course['code']} {course['name']}" if course else "รายวิชา"
    elif scope == library.SCOPE_PERSONAL:
        label = "เอกสารส่วนตัวของฉัน"
    else:
        label = (
            "ทุกแหล่งในระบบ (สิทธิ์ผู้ดูแล)"
            if library.is_admin(user)
            else "คลังความรู้วิชาที่ลงเรียน + เอกสารของฉัน + Notebook ของอาจารย์/ผู้ดูแล"
        )
    explicit = bool(document_ids) or scope in (library.SCOPE_COURSE, library.SCOPE_PERSONAL)
    return notebook_ids, label, not explicit


def _require_admin(user: User) -> int:
    if (user.role or "") != USER_ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น")
    if user.id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return int(user.id)


async def _audit(user: User, action: str, *, target_type: Optional[str] = None,
                 target_id: Optional[Any] = None, **detail: Any) -> None:
    """One line in admin_audit_log for every change an admin makes."""
    await audit.log_action(
        int(user.id or 0), action, target_type=target_type, target_id=target_id,
        detail={k: v for k, v in detail.items() if v is not None} or None,
    )


def _viewer_window(days: int, tz_offset: int) -> tuple[datetime, timezone]:
    """
    ``days`` whole calendar days ending today *for the viewer*, as the UTC
    instant it starts at, plus the viewer's zone. The server runs in UTC, and
    something done at 00:30 in Bangkok would otherwise land on the day before.
    """
    viewer_zone = timezone(timedelta(minutes=tz_offset))
    today = datetime.now(viewer_zone).replace(hour=0, minute=0, second=0, microsecond=0)
    return (today - timedelta(days=days - 1)).astimezone(timezone.utc), viewer_zone
