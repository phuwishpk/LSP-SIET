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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import text
import os
from datetime import date, datetime, timedelta, timezone
from loguru import logger
from pydantic import BaseModel, Field

from siet_platform.auth_jwt import get_current_user
from siet_platform.http import _audit, _require_admin, _viewer_window
from siet_platform.routers.admin import (
    CsvImport,
    _parse_csv,
    _suspend,
    _suspension_until,
    _target_or_404,
)
from siet_platform.login_guard import clear_login_failures
from siet_community import moderation
from siet_platform import audit, library, notifications, points, pricing, ratelimit, throttle
from siet_community import repository as repo
from siet_platform.users import (
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


class ReportResolve(BaseModel):
    status: Literal["dismissed", "actioned"]
    action: Literal["none", "hide_post", "restore_post", "delete_comment", "suspend_user", "delete_document"] = "none"
    note: Optional[str] = Field(default=None, max_length=255)
    suspend_reason: Optional[str] = Field(default=None, max_length=255)
    suspended_until: Optional[date] = None


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    name_en: Optional[str] = Field(default=None, max_length=128)
    slug: Optional[str] = Field(default=None, min_length=2, max_length=64)
    sort_order: int = Field(default=0, ge=0, le=9999)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=128)
    name_en: Optional[str] = Field(default=None, max_length=128)
    sort_order: Optional[int] = Field(default=None, ge=0, le=9999)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


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
    await _audit(user, "post.hide", target_type="post", target_id=post_id)
    return {"ok": True, "deleted": post_id}


@router.post("/posts/{post_id}/restore")
async def moderate_restore_post(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Undo a deletion - posts are flagged, never actually dropped."""
    _require_admin(user)
    if not await repo.post_exists(post_id):
        raise HTTPException(status_code=404, detail="ไม่พบโพสต์นี้")
    await repo.restore_post(post_id)
    await _audit(user, "post.restore", target_type="post", target_id=post_id)
    return {"ok": True, "restored": post_id}


# ---------------------------------------------------------------------------
# AI Roadmaps
#
# The console shows who made which roadmap and how it was grounded, never the
# nodes of a plan its owner has not shared - the same line the RAG chat history
# draws. A shared roadmap is a post, readable like any other post.
# ---------------------------------------------------------------------------


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if hasattr(value, "isoformat") else (str(value) if value else None)


def _roadmap_origin(prompt_hash: Any) -> tuple[str, Optional[int]]:
    marker = str(prompt_hash or "")
    if marker.startswith("follow:"):
        try:
            return "followed", int(marker.split(":", 1)[1])
        except ValueError:
            return "followed", None
    return "own", None


def _quiz_origin(prompt_hash: Any) -> tuple[str, Optional[int]]:
    """A quiz copied out of the feed carries ``import:<post id>`` instead of a hash."""
    marker = str(prompt_hash or "")
    if marker.startswith("import:"):
        try:
            return "imported", int(marker.split(":", 1)[1])
        except ValueError:
            return "imported", None
    return "own", None


async def _session_owners(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    ``{owner_id: account}`` for quiz / roadmap sessions. owner_id is the MariaDB
    user id as text (older rows may hold something else); a missing key means
    the account no longer exists.
    """
    owner_ids = sorted({int(r["owner_id"]) for r in rows if str(r.get("owner_id") or "").isdigit()})
    if not owner_ids:
        return {}
    placeholders = ", ".join(f":u{i}" for i in range(len(owner_ids)))
    async with _mariadb_session() as session:
        found = (
            await session.execute(
                text(f"SELECT id, username, display_name, role FROM users WHERE id IN ({placeholders})"),
                {f"u{i}": value for i, value in enumerate(owner_ids)},
            )
        ).all()
    return {str(r.id): {"id": r.id, "username": r.username, "display_name": r.display_name, "role": r.role} for r in found}


def _viewer_day(created: Any, viewer_zone: timezone) -> Optional[str]:
    """The viewer's calendar day of a SurrealDB timestamp (naive ones are UTC)."""
    if not hasattr(created, "astimezone"):
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(viewer_zone).strftime("%Y-%m-%d")


@router.get("/roadmaps")
async def list_all_roadmaps(
    q: Optional[str] = Query(default=None, max_length=200),
    origin: Literal["all", "own", "followed"] = "all",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Every roadmap in the workspace as a summary (no nodes), newest first."""
    _require_admin(user)
    from siet_platform.features.domain import RoadmapSession

    page = await RoadmapSession.admin_list(query=q, origin=origin, limit=limit, offset=offset)
    rows = page["items"]

    owners = await _session_owners(rows)
    posts = await repo.roadmap_posts_by_session([str(r["id"]) for r in rows])

    items = []
    for r in rows:
        kind, source_post_id = _roadmap_origin(r.get("prompt_hash"))
        grounding_info = r.get("grounding") or {}
        items.append(
            {
                "id": str(r["id"]),
                "title": r.get("title"),
                "node_count": int(r.get("node_count") or 0),
                "origin": kind,
                "source_post_id": source_post_id,
                # None = the account no longer exists.
                "owner": owners.get(str(r.get("owner_id"))),
                "owner_id": str(r.get("owner_id") or ""),
                "grounding_label": grounding_info.get("label"),
                "scope": (r.get("settings") or {}).get("scope"),
                "shared_post": posts.get(str(r["id"])),
                "created_at": _iso(r.get("created_at")),
            }
        )
    return {"items": items, "total": page["total"], "offset": offset}


@router.delete("/roadmaps/{session_id}")
async def delete_any_roadmap(session_id: str, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Delete a roadmap for good. A post made from it keeps its own copy."""
    _require_admin(user)
    from siet_platform.features.domain import RoadmapSession

    if not session_id.startswith("roadmap_session:"):
        raise HTTPException(status_code=404, detail="ไม่พบ Roadmap นี้")
    try:
        session = await RoadmapSession.get(session_id)
    except Exception:
        raise HTTPException(status_code=404, detail="ไม่พบ Roadmap นี้")
    await session.delete()
    logger.info(f"admin {user.username} deleted roadmap {session_id} of owner {session.owner_id}")
    await _audit(user, "roadmap.delete", target_type="roadmap", target_id=session_id, owner_id=session.owner_id)
    return {"ok": True, "deleted": session_id}


@router.get("/roadmaps/shared")
async def list_shared_roadmaps(
    state: Literal["visible", "deleted", "all"] = "visible",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Roadmap posts, most followed first. Hide/restore with the /posts routes."""
    _require_admin(user)
    return await repo.admin_roadmap_posts(state=state, limit=limit, offset=offset)


@router.get("/roadmaps/stats")
async def roadmap_stats(
    days: int = Query(default=30, ge=1, le=180),
    tz_offset: int = Query(default=0, ge=-840, le=840, description="Viewer's offset from UTC in minutes"),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    How much the roadmap feature is used: per day, by grounding, and what it cost.

    The window is ``days`` whole calendar days ending today *for the viewer*:
    the server runs in UTC, and a roadmap made at 00:30 in Bangkok would
    otherwise be counted on the day before.
    """
    _require_admin(user)
    from datetime import datetime, timedelta, timezone

    from siet_platform.features.domain import RoadmapSession

    viewer_zone = timezone(timedelta(minutes=tz_offset))
    today = datetime.now(viewer_zone).replace(hour=0, minute=0, second=0, microsecond=0)
    since = (today - timedelta(days=days - 1)).astimezone(timezone.utc)
    rows = await RoadmapSession.created_since(since)
    per_day: Dict[str, int] = {}
    grounding_counts = {"library": 0, "library_web": 0, "web": 0, "none": 0}
    generated = followed = 0
    for r in rows:
        if _roadmap_origin(r.get("prompt_hash"))[0] == "followed":
            followed += 1
            continue
        generated += 1
        created = r.get("created_at")
        if hasattr(created, "astimezone"):
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            day = created.astimezone(viewer_zone).strftime("%Y-%m-%d")
            per_day[day] = per_day.get(day, 0) + 1
        info = r.get("grounding") or {}
        key = (
            "library_web" if info.get("library") and info.get("web")
            else "library" if info.get("library")
            else "web" if info.get("web")
            else "none"
        )
        grounding_counts[key] += 1

    total = (await RoadmapSession.admin_list(limit=1))["total"]
    top = (await repo.admin_roadmap_posts(state="visible", limit=5))["items"]
    return {
        "days": days,
        "total": total,
        "generated": generated,
        "followed": followed,
        "per_day": [{"day": day, "count": per_day[day]} for day in sorted(per_day)],
        "grounding": grounding_counts,
        **await repo.roadmap_point_stats(since),
        "top_followed": [
            {"id": p["id"], "title": p["title"], "author": p["author"], "counts": p["counts"], "node_count": p["node_count"]}
            for p in top
        ],
    }


# ---------------------------------------------------------------------------
# AI Quizzes
#
# Same line as the roadmaps: who made which quiz and how it is doing, never the
# questions and answers of a quiz its owner has not shared.
# ---------------------------------------------------------------------------


@router.get("/quizzes")
async def list_all_quizzes(
    q: Optional[str] = Query(default=None, max_length=200),
    origin: Literal["all", "own", "imported"] = "all",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Every quiz in the workspace as a summary (no questions), newest first."""
    _require_admin(user)
    from siet_platform.features.domain import QuizSession

    page = await QuizSession.admin_list(query=q, origin=origin, limit=limit, offset=offset)
    rows = page["items"]
    owners = await _session_owners(rows)
    posts = await repo.quiz_posts_by_session([str(r["id"]) for r in rows])

    items = []
    for r in rows:
        kind, source_post_id = _quiz_origin(r.get("prompt_hash"))
        items.append(
            {
                "id": str(r["id"]),
                "topic": r.get("topic"),
                "language": r.get("language"),
                "question_count": int(r.get("question_count") or 0),
                "origin": kind,
                "source_post_id": source_post_id,
                # None = the account no longer exists.
                "owner": owners.get(str(r.get("owner_id"))),
                "owner_id": str(r.get("owner_id") or ""),
                "from_library": bool(r.get("notebook_id")),
                "shared_post": posts.get(str(r["id"])),
                "created_at": _iso(r.get("created_at")),
            }
        )
    return {"items": items, "total": page["total"], "offset": offset}


@router.delete("/quizzes/{session_id}")
async def delete_any_quiz(session_id: str, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Delete a quiz for good. A post made from it keeps its own copy."""
    _require_admin(user)
    from siet_platform.features.domain import QuizSession

    if not session_id.startswith("quiz_session:"):
        raise HTTPException(status_code=404, detail="ไม่พบ Quiz นี้")
    try:
        session = await QuizSession.get(session_id)
    except Exception:
        raise HTTPException(status_code=404, detail="ไม่พบ Quiz นี้")
    await session.delete()
    logger.info(f"admin {user.username} deleted quiz {session_id} of owner {session.owner_id}")
    await _audit(user, "quiz.delete", target_type="quiz", target_id=session_id, owner_id=session.owner_id)
    return {"ok": True, "deleted": session_id}


@router.get("/quizzes/shared")
async def list_shared_quizzes(
    state: Literal["visible", "deleted", "all"] = "visible",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Quiz posts, most played first. Hide/restore with the /posts routes."""
    _require_admin(user)
    return await repo.admin_quiz_posts(state=state, limit=limit, offset=offset)


@router.get("/quizzes/stats")
async def quiz_stats(
    days: int = Query(default=30, ge=1, le=180),
    tz_offset: int = Query(default=0, ge=-840, le=840, description="Viewer's offset from UTC in minutes"),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """How much the quiz feature is used: made per day, played, scored, and what it cost."""
    _require_admin(user)
    from siet_platform.features.domain import QuizSession

    since, viewer_zone = _viewer_window(days, tz_offset)
    per_day: Dict[str, int] = {}
    generated = imported = from_library = 0
    for r in await QuizSession.created_since(since):
        if _quiz_origin(r.get("prompt_hash"))[0] == "imported":
            imported += 1
            continue
        generated += 1
        if r.get("notebook_id"):
            from_library += 1
        day = _viewer_day(r.get("created_at"), viewer_zone)
        if day:
            per_day[day] = per_day.get(day, 0) + 1

    total = (await QuizSession.admin_list(limit=1))["total"]
    top = (await repo.admin_quiz_posts(state="visible", limit=5))["items"]
    return {
        "days": days,
        "total": total,
        "generated": generated,
        "imported": imported,
        "per_day": [{"day": day, "count": per_day[day]} for day in sorted(per_day)],
        "grounding": {"library": from_library, "none": generated - from_library},
        **await repo.quiz_stats(since),
        "top_played": [
            {
                "id": p["id"],
                "title": p["title"],
                "author": p["author"],
                "counts": p["counts"],
                "attempts": p["attempts"],
                "question_count": p["question_count"],
            }
            for p in top
        ],
    }


# ---------------------------------------------------------------------------
# Community
# ---------------------------------------------------------------------------


@router.get("/community/stats")
async def community_stats(
    days: int = Query(default=30, ge=1, le=180),
    tz_offset: int = Query(default=0, ge=-840, le=840, description="Viewer's offset from UTC in minutes"),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Feed activity: posts per day, by type, who takes part and what draws a response."""
    _require_admin(user)
    since, _zone = _viewer_window(days, tz_offset)
    return {"days": days, **await repo.community_stats(since, tz_offset)}


@router.get("/comments")
async def list_all_comments(
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Every comment in the workspace, newest first - the feed only shows them post by post."""
    _require_admin(user)
    return await repo.admin_list_comments(query=q, limit=limit, offset=offset)


@router.delete("/comments/{comment_id}")
async def moderate_delete_comment(comment_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Remove a comment for good (comments are not flagged like posts). Unlike the
    feed's own route this also reaches comments under a hidden post.
    """
    _require_admin(user)
    comment = await repo.get_comment(comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="ไม่พบความคิดเห็นนี้")
    await repo.delete_comment(comment_id, int(comment["post_id"]))
    logger.info(f"admin {user.username} deleted comment {comment_id} on post {comment['post_id']}")
    await _audit(user, "comment.delete", target_type="comment", target_id=comment_id, post_id=comment["post_id"])
    return {"ok": True, "deleted": comment_id}


# ---------------------------------------------------------------------------
# Reports (รายงานเนื้อหา) + audit log
# ---------------------------------------------------------------------------


@router.get("/reports")
async def list_reports(
    status: Literal["open", "dismissed", "actioned", "all"] = "open",
    target_type: Optional[Literal["post", "comment", "user", "document"]] = None,
    room_id: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """The moderation queue: every report with what it points at and how many people agree."""
    _require_admin(user)
    out = await moderation.list_reports(status=status, target_type=target_type, room_id=room_id, limit=limit, offset=offset)
    out["stats"] = await moderation.report_stats()
    return out


@router.post("/reports/{report_id}")
async def resolve_report(report_id: int, body: ReportResolve, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Settle a report, optionally acting on its target in the same step: hide or
    restore the post, delete the comment, suspend the person, delete the
    document. Other open reports about the same target close with it, and the
    whole thing is written to the audit log.
    """
    admin_id = _require_admin(user)
    report = await moderation.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="ไม่พบรายงานนี้")
    if report["status"] != "open":
        raise HTTPException(status_code=400, detail="รายงานนี้ถูกจัดการไปแล้ว")
    ttype, tid = report["target_type"], int(report["target_id"])
    expects = {"hide_post": "post", "restore_post": "post", "delete_comment": "comment", "delete_document": "document"}
    if body.action in expects and ttype != expects[body.action]:
        raise HTTPException(status_code=400, detail=f"การดำเนินการ {body.action} ใช้กับ {expects[body.action]} เท่านั้น")

    if body.action == "hide_post":
        await repo.soft_delete_post(tid)
    elif body.action == "restore_post":
        await repo.restore_post(tid)
    elif body.action == "delete_comment":
        comment = await repo.get_comment(tid)
        if comment:
            await repo.delete_comment(int(comment["id"]), int(comment["post_id"]))
    elif body.action == "delete_document":
        doc = await library.get_document(tid)
        if doc:
            await library.delete_document(doc)
    elif body.action == "suspend_user":
        owner_id = int(report.get("target_owner_id") or 0)
        if not owner_id:
            raise HTTPException(status_code=400, detail="ไม่พบเจ้าของเนื้อหาที่จะระงับ")
        if owner_id == admin_id:
            raise HTTPException(status_code=400, detail="ระงับบัญชีตัวเองไม่ได้")
        target = await _target_or_404(owner_id)
        if target.role == USER_ROLE_ADMIN and await count_admins(exclude_user_id=owner_id) == 0:
            raise HTTPException(status_code=400, detail="ต้องเหลือผู้ดูแลระบบอย่างน้อยหนึ่งคน")
        await _suspend(target, user, reason=body.suspend_reason or report.get("reason_label"), until=body.suspended_until)

    await moderation.resolve_report(report_id, status=body.status, action=body.action, reviewer_id=admin_id, note=body.note)
    siblings = 0
    if body.status == "actioned":
        siblings = await moderation.resolve_sibling_reports(ttype, tid, status="actioned", action=body.action, reviewer_id=admin_id)
    await _audit(
        user, f"report.{body.action}", target_type=ttype, target_id=tid,
        report_id=report_id, status=body.status, note=body.note, siblings_closed=siblings,
        suspend_reason=body.suspend_reason, suspended_until=body.suspended_until,
    )
    return {"ok": True, "report": await moderation.get_report(report_id), "siblings_closed": siblings}


@router.get("/audit")
async def audit_log(
    action: Optional[str] = Query(default=None, max_length=64),
    actor_id: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Who changed what, newest first. ``action`` matches a prefix such as ``user.`` or ``report.``."""
    _require_admin(user)
    return await audit.list_audit(action=action, actor_id=actor_id, limit=limit, offset=offset)


# ---------------------------------------------------------------------------
# Categories (หมวดหมู่รายวิชา)
# ---------------------------------------------------------------------------


def _slugify(value: str) -> str:
    """ASCII handle for a category; Thai-only names fall back to a random one."""
    import re as _re
    import uuid as _uuid

    slug = _re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")[:64]
    return slug or f"cat-{_uuid.uuid4().hex[:6]}"


@router.get("/categories")
async def list_categories(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _require_admin(user)
    items = await repo.list_categories()
    return {"items": items, "total": len(items)}


@router.post("/categories", status_code=201)
async def create_category(body: CategoryCreate, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _require_admin(user)
    slug = _slugify(body.slug or body.name_en or body.name)
    if await repo.find_category_by_slug(slug):
        raise HTTPException(status_code=409, detail=f"มีหมวดหมู่ที่ใช้รหัส {slug} อยู่แล้ว")
    category = await repo.create_category(slug, body.name, body.name_en, body.sort_order)
    logger.info(f"admin {user.username} created category {slug}")
    await _audit(user, "category.create", target_type="category", target_id=category["id"], slug=slug, name=body.name)
    return category


@router.patch("/categories/{category_id}")
async def update_category(
    category_id: int, body: CategoryUpdate, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    _require_admin(user)
    if not await repo.get_category(category_id):
        raise HTTPException(status_code=404, detail="ไม่พบหมวดหมู่นี้")
    updated = await repo.update_category(
        category_id, name=body.name, name_en=body.name_en, sort_order=body.sort_order
    )
    return updated or {}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Remove a category; the rooms filed under it simply become uncategorised."""
    _require_admin(user)
    if not await repo.get_category(category_id):
        raise HTTPException(status_code=404, detail="ไม่พบหมวดหมู่นี้")
    moved = await repo.delete_category(category_id)
    logger.info(f"admin {user.username} deleted category {category_id} ({moved} rooms uncategorised)")
    await _audit(user, "category.delete", target_type="category", target_id=category_id, rooms_uncategorised=moved)
    return {"ok": True, "deleted": category_id, "rooms_uncategorised": moved}


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


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------


@router.post("/import/courses")
async def import_courses(body: CsvImport, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Bulk-create course rooms from ``code,name,description,category,term``.

    ``category`` is a category slug or its exact name; ``term`` looks like
    ``1/2569``. A header row is optional and rows whose code already exists are
    reported as skipped rather than failing the whole import.
    """
    admin_id = _require_admin(user)
    rows = _parse_csv(
        body.csv, required=("code", "name"), optional=("description", "category", "term")
    )
    categories = await repo.list_categories()
    by_key = {c["slug"].lower(): c for c in categories}
    by_key.update({c["name"].strip().lower(): c for c in categories})
    by_key.update({(c.get("name_en") or "").strip().lower(): c for c in categories if c.get("name_en")})
    created, skipped, errors = [], [], []
    for line_no, row in rows:
        code = (row.get("code") or "").strip().upper()[:32]
        name = (row.get("name") or "").strip()[:128]
        if not code or len(name) < 2:
            errors.append({"line": line_no, "reason": "ต้องมีรหัสวิชาและชื่อวิชา"})
            continue
        category_id = None
        wanted = (row.get("category") or "").strip().lower()
        if wanted:
            category = by_key.get(wanted)
            if not category:
                errors.append({"line": line_no, "code": code, "reason": f"ไม่พบหมวดหมู่ '{row.get('category')}'"})
                continue
            category_id = int(category["id"])
        existing = await repo.find_course_by_code(code)
        if existing:
            skipped.append({"line": line_no, "code": code, "reason": "มีรหัสนี้อยู่แล้ว"})
            continue
        if body.dry_run:
            created.append({"line": line_no, "code": code, "name": name})
            continue
        course = await repo.create_course(
            code, name, row.get("description"), admin_id,
            category_id=category_id, term=row.get("term"),
        )
        created.append({"line": line_no, "code": course["code"], "name": course["name"],
                        "id": course["id"]})
    return {"created": created, "skipped": skipped, "errors": errors, "dry_run": body.dry_run}
