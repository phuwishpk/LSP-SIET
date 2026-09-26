"""
SIET Space community API (Facebook-style feed + point wallet).

All routes require a workspace JWT (``get_current_user``) because every
action is attributed to a MariaDB user id.
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel, Field

from api.auth_jwt import get_current_user
from open_notebook.community import library, points, ratelimit
from open_notebook.community import repository as repo
from open_notebook.community.ask import quick_ask
from open_notebook.config import DATA_FOLDER
from open_notebook.domain.features import QuizSession, RoadmapSession
from open_notebook.domain.user import USER_ROLE_ADMIN, USER_ROLE_TEACHER, User
from open_notebook.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)

router = APIRouter(prefix="/community", tags=["community"])

UPLOAD_DIR = os.path.join(DATA_FOLDER, "community")
MAX_UPLOAD_MB = int(os.getenv("COMMUNITY_MAX_UPLOAD_MB", "50"))
ALLOWED_UPLOAD_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".md", ".txt", ".docx", ".pptx", ".zip"}
# Minimum substance before something counts as a post / knowledge document.
MIN_POST_CHARS = int(os.getenv("SPAM_MIN_POST_CHARS", "15"))
MIN_DOCUMENT_CHARS = int(os.getenv("SPAM_MIN_DOCUMENT_CHARS", "80"))
MIN_ROOM_NAME_CHARS = int(os.getenv("SPAM_MIN_ROOM_NAME_CHARS", "3"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uid(user: User) -> int:
    if user.id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return int(user.id)


def _owner(user: User) -> str:
    return str(_uid(user))


def _generate_room_code() -> str:
    """Discussion rooms have no course code, so give them a stable handle."""
    return f"TALK-{uuid.uuid4().hex[:6].upper()}"


def _is_staff(user: User) -> bool:
    return (user.role or "") in {USER_ROLE_ADMIN, USER_ROLE_TEACHER}


def _display(user: User) -> str:
    return user.display_name or user.username


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


def _duplicate(exc: ratelimit.DuplicateContent) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=exc.message,
        headers={"X-Duplicate-Of": str(exc.existing_id or "")},
    )


async def _post_or_404(post_id: int) -> Dict[str, Any]:
    post = await repo.get_post_raw(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CourseCreate(BaseModel):
    """
    A room. ``kind="course"`` is an official course room (staff only, needs a
    course code); ``kind="club"`` is a discussion room any student may open,
    where the code is generated for them.
    """

    name: str = Field(..., min_length=2, max_length=128)
    code: Optional[str] = Field(default=None, max_length=32)
    description: Optional[str] = Field(default=None, max_length=255)
    kind: Literal["course", "club"] = "course"


class CourseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=128)
    code: Optional[str] = Field(default=None, min_length=2, max_length=32)
    description: Optional[str] = Field(default=None, max_length=255)


class ReactionBody(BaseModel):
    kind: Literal["like", "helpful"]


class PostEditBody(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    content: Optional[str] = Field(default=None, max_length=20000)
    tags: Optional[str] = Field(default=None, max_length=255)
    # 0 or negative clears the course link
    course_id: Optional[int] = None


class CommentBody(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class QuizSubmitBody(BaseModel):
    play_id: int
    answers: Dict[str, Optional[str]] = Field(default_factory=dict)


class AskBody(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None
    mode: Literal["single", "session"] = "single"
    language: str = "th"
    model_id: Optional[str] = None
    # Knowledge scope: auto = my courses + my uploads + shared staff notebooks
    scope: Literal["auto", "course", "personal", "document", "notebook"] = "auto"
    course_id: Optional[int] = None
    document_ids: List[int] = Field(default_factory=list)
    # Picks from GET /community/knowledge (validated server-side, never trusted):
    # whole shared notebooks, or single sources inside a readable notebook.
    notebook_ids: List[str] = Field(default_factory=list, max_length=20)
    source_ids: List[str] = Field(default_factory=list, max_length=20)
    # Google Search grounding: "auto" = only when the library does not cover the
    # question, "always" = also to support the answer, "off" = library only.
    web: Literal["auto", "always", "off"] = "auto"
    # Stored chat history: append to this conversation (must be the caller's);
    # omitted = a new conversation titled after the question.
    conversation_id: Optional[str] = Field(default=None, max_length=64)


class RenameConversationBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class StudyQuizBody(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    question_count: int = Field(default=10, ge=1, le=20)
    language: str = "th"
    scope: Literal["auto", "course", "personal", "document"] = "auto"
    course_id: Optional[int] = None
    document_ids: List[int] = Field(default_factory=list)


class StudyRoadmapBody(BaseModel):
    description: str = Field(..., min_length=1, max_length=2000)
    title: Optional[str] = Field(default=None, max_length=200)
    node_count: int = Field(default=12, ge=3, le=50)
    language: str = "th"
    scope: Literal["auto", "course", "personal", "document"] = "auto"
    course_id: Optional[int] = None
    document_ids: List[int] = Field(default_factory=list)


class NotificationsRead(BaseModel):
    ids: Optional[List[int]] = None


# ---------------------------------------------------------------------------
# Profile / wallet
# ---------------------------------------------------------------------------


@router.get("/me")
async def community_me(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    return {
        "user": {
            "id": str(uid),
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "role": user.role,
            "student_id": user.student_id,
        },
        "balance": await points.get_balance(uid),
        "exempt": user.is_points_exempt,
        "stats": await repo.user_stats(uid),
    }


@router.get("/wallet")
async def wallet(
    limit: int = Query(default=30, ge=1, le=200),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    uid = _uid(user)
    return {
        "balance": await points.get_balance(uid),
        "exempt": user.is_points_exempt,
        "role": user.role,
        "rules": points.rules_summary(),
        "history": await points.history(uid, limit),
        "stats": await repo.user_stats(uid),
    }


# ---------------------------------------------------------------------------
# Courses ("ห้องวิชา")
# ---------------------------------------------------------------------------


@router.get("/courses")
async def list_courses(user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return await repo.list_courses(_uid(user))


@router.post("/courses", status_code=201)
async def create_course(body: CourseCreate, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Open a room.

    Official course rooms stay staff-only. Discussion rooms are open to every
    signed-in user, rate-limited so the sidebar cannot be flooded, and refused
    when a room with the same name already exists (the caller is pointed at it
    instead through ``X-Existing-Room``).
    """
    name = " ".join(body.name.split())
    if body.kind == repo.KIND_CLUB:
        if len(name) < MIN_ROOM_NAME_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"ตั้งชื่อห้องให้ยาวอย่างน้อย {MIN_ROOM_NAME_CHARS} ตัวอักษร",
            )
        await _guard_spam(user, "room")
        existing = await repo.find_room_by_name(name)
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f'มีห้อง "{existing["name"]}" อยู่แล้ว เข้าร่วมห้องเดิมได้เลย',
                headers={"X-Existing-Room": str(existing["id"])},
            )
        code = _generate_room_code()
    else:
        if not _is_staff(user):
            raise HTTPException(
                status_code=403,
                detail="เฉพาะอาจารย์หรือผู้ดูแลเท่านั้นที่สร้างห้องวิชาได้ — นักศึกษาสร้างห้องพูดคุยได้",
            )
        if not body.code or len(body.code.strip()) < 2:
            raise HTTPException(status_code=400, detail="กรุณากรอกรหัสวิชา")
        code = body.code.strip()

    try:
        return await repo.create_course(code, name, body.description, _uid(user), kind=body.kind)
    except Exception as exc:
        if "Duplicate" in str(exc):
            raise HTTPException(status_code=409, detail="รหัสนี้ถูกใช้ไปแล้ว")
        raise


async def _room_or_403(course_id: int, user: User) -> Dict[str, Any]:
    """
    Fetch a room the caller is allowed to manage.

    Admins manage every room; everyone else manages only the rooms they opened —
    which now includes the course rooms a teacher created, so a typo in a course
    code no longer needs an admin to fix.
    """
    course = await repo.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="ไม่พบห้องนี้")
    if user.role == USER_ROLE_ADMIN:
        return course
    if int(course.get("created_by") or 0) == _uid(user):
        return course
    raise HTTPException(status_code=403, detail="แก้ไขได้เฉพาะห้องที่คุณสร้างเอง")


@router.patch("/courses/{course_id}")
async def update_course(
    course_id: int, body: CourseUpdate, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Rename a room, fix its code, or reword its description."""
    course = await _room_or_403(course_id, user)
    code = body.code
    if code is not None and course.get("kind") == repo.KIND_CLUB:
        # Discussion-room handles are generated; there is nothing to edit.
        code = None
    name = " ".join(body.name.split()) if body.name else None
    if name and course.get("kind") == repo.KIND_CLUB:
        clash = await repo.find_room_by_name(name)
        if clash and int(clash["id"]) != course_id:
            raise HTTPException(
                status_code=409,
                detail=f'มีห้อง "{clash["name"]}" อยู่แล้ว',
                headers={"X-Existing-Room": str(clash["id"])},
            )
    try:
        updated = await repo.update_course(
            course_id, name=name, description=body.description, code=code
        )
    except Exception as exc:
        if "Duplicate" in str(exc):
            raise HTTPException(status_code=409, detail="รหัสนี้ถูกใช้ไปแล้ว")
        raise
    return updated or {}


@router.delete("/courses/{course_id}")
async def delete_course(course_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Close a room. Its posts survive — they simply return to the main feed."""
    await _room_or_403(course_id, user)
    await repo.delete_course(course_id)
    return {"ok": True, "deleted": course_id}


@router.post("/courses/{course_id}/join")
async def join_course(course_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    if not await repo.get_course(course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    await repo.set_course_membership(course_id, _uid(user), True)
    return {"ok": True, "joined": True}


@router.delete("/courses/{course_id}/join")
async def leave_course(course_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    await repo.set_course_membership(course_id, _uid(user), False)
    return {"ok": True, "joined": False}


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


@router.get("/posts")
async def list_posts(
    course_id: Optional[int] = None,
    type: Optional[str] = Query(default=None, pattern="^(summary|quiz|roadmap|question|material)$"),
    author_id: Optional[int] = None,
    q: Optional[str] = Query(default=None, max_length=200),
    saved: bool = False,
    my_courses: bool = False,
    embed: Optional[str] = Query(default=None, description="comma separated: quiz,roadmap"),
    before_id: Optional[int] = None,
    limit: int = Query(default=20, ge=1, le=100),
    order: Literal["newest", "popular"] = "newest",
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    items = await repo.list_posts(
        _uid(user),
        course_id=course_id,
        post_type=type,
        author_id=author_id,
        query=q,
        saved_only=saved,
        my_courses_only=my_courses,
        embed_types=[e.strip() for e in embed.split(",")] if embed else None,
        before_id=before_id,
        limit=limit,
        order=order,
    )
    next_cursor = items[-1]["id"] if len(items) >= limit else None
    return {"items": items, "next_before_id": next_cursor}


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "file")
    base = re.sub(r"[^\w.\-]+", "_", base, flags=re.UNICODE).strip("._") or "file"
    return base[:120]


async def _store_upload(file: UploadFile) -> Dict[str, Any]:
    original = _safe_filename(file.filename or "file")
    ext = os.path.splitext(original)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        raise HTTPException(status_code=400, detail=f"File type {ext or '(none)'} is not allowed")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{original}"
    path = os.path.join(UPLOAD_DIR, stored_name)
    limit = MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    with open(path, "wb") as fh:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > limit:
                fh.close()
                os.remove(path)
                raise HTTPException(status_code=413, detail=f"File larger than {MAX_UPLOAD_MB} MB")
            fh.write(chunk)
    return {"name": original, "path": path, "size": size, "mime": file.content_type}


@router.post("/posts", status_code=201)
async def create_post(
    type: str = Form(default="summary"),
    title: Optional[str] = Form(default=None),
    content: Optional[str] = Form(default=None),
    course_id: Optional[int] = Form(default=None),
    tags: Optional[str] = Form(default=None),
    embed_type: Optional[str] = Form(default=None),
    embed_id: Optional[str] = Form(default=None),
    file: Optional[UploadFile] = File(default=None),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    uid = _uid(user)
    post_type = (type or "summary").strip().lower()
    if post_type not in repo.POST_TYPES:
        raise HTTPException(status_code=400, detail="Invalid post type")
    if post_type == "material" and not _is_staff(user):
        raise HTTPException(status_code=403, detail="Only teachers can publish course materials")
    if course_id is not None and course_id > 0 and not await repo.get_course(course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    if course_id is not None and course_id <= 0:
        course_id = None

    snapshot: Optional[Dict[str, Any]] = None
    embed_type = (embed_type or "").strip().lower() or None
    if embed_type:
        if not embed_id:
            raise HTTPException(status_code=400, detail="embed_id is required")
        try:
            if embed_type == "quiz":
                session = await QuizSession.get_for_owner(session_id=embed_id, owner_id=_owner(user))
                snapshot = {
                    "topic": session.topic,
                    "language": session.language,
                    "question_count": session.question_count,
                    "questions": session.questions,
                }
                post_type = "quiz"
                if not title:
                    title = session.topic
            elif embed_type == "roadmap":
                session = await RoadmapSession.get_for_owner(session_id=embed_id, owner_id=_owner(user))
                snapshot = {
                    "title": session.title,
                    "description": session.description,
                    "nodes": session.nodes,
                    "edges": session.edges,
                }
                post_type = "roadmap"
                if not title:
                    title = session.title
            else:
                raise HTTPException(status_code=400, detail="embed_type must be quiz or roadmap")
        except NotFoundError:
            raise HTTPException(status_code=404, detail="Session not found or not yours")

    text_body = (content or "").strip()
    heading = (title or "").strip()
    if not text_body and not snapshot and file is None:
        raise HTTPException(status_code=400, detail="โพสต์ต้องมีเนื้อหา ไฟล์แนบ หรือควิซ/Roadmap ที่ฝังไว้")
    # Reject one-character "aaa" posts outright – they exist only to farm points.
    if not snapshot and file is None and len(text_body) + len(heading) < MIN_POST_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"เขียนอย่างน้อย {MIN_POST_CHARS} ตัวอักษร เพื่อให้เพื่อนเข้าใจว่าโพสต์นี้เกี่ยวกับอะไร",
        )

    await _guard_spam(user, "post")
    content_hash = ratelimit.fingerprint(heading, text_body, embed_id or "")
    try:
        await ratelimit.check_duplicate_post(uid, content_hash)
    except ratelimit.DuplicateContent as exc:
        raise _duplicate(exc)

    attachment = await _store_upload(file) if file is not None and file.filename else None
    tag_list = [t for t in re.split(r"[,#\s]+", tags or "") if t]

    post_id = await repo.create_post(
        author_id=uid,
        post_type=post_type,
        title=title,
        content=content,
        course_id=course_id,
        tags=tag_list,
        embed_type=embed_type,
        embed_id=embed_id,
        embed_snapshot=snapshot,
        attachment=attachment,
        content_hash=content_hash,
    )

    # --- earn points for contributing ------------------------------------
    # A substantial lecture summary is worth more than a one-line question,
    # and both are capped per day so the feed cannot be farmed.
    bonus = 0
    substantial = bool(attachment) or bool(snapshot) or len((content or "").strip()) >= 100
    if post_type == "summary" and substantial:
        bonus = await points.grant_capped(
            uid, points.CREATOR_BONUS_SUMMARY, "creator_bonus",
            ref_type="post", ref_id=str(post_id), note="shared a summary",
        )
    elif substantial or (title or "").strip():
        bonus = await points.grant_capped(
            uid, points.POST_BONUS, "post_bonus",
            ref_type="post", ref_id=str(post_id), note=f"posted {post_type}",
        )

    post = await repo.get_post(post_id, uid)
    return {"post": post, "creator_bonus": bonus, "balance": await points.get_balance(uid)}


@router.get("/posts/{post_id}")
async def get_post(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    post = await repo.get_post(post_id, _uid(user))
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post["comments"] = await repo.list_comments(post_id)
    return post


@router.put("/posts/{post_id}")
async def edit_post(
    post_id: int, body: PostEditBody, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Edit your own post (admins may edit any). Attachments and embedded
    quizzes/roadmaps are left untouched; only the text, tags and course move.
    """
    uid = _uid(user)
    post = await _post_or_404(post_id)
    if int(post["author_id"]) != uid and user.role != USER_ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="แก้ไขได้เฉพาะโพสต์ของตัวเอง")
    if body.course_id is not None and body.course_id > 0 and not await repo.get_course(body.course_id):
        raise HTTPException(status_code=404, detail="ไม่พบรายวิชานี้")

    await repo.update_post(
        post_id,
        title=body.title,
        content=body.content,
        tags=[t for t in re.split(r"[,#\s]+", body.tags) if t] if body.tags is not None else None,
        course_id=body.course_id if (body.course_id or 0) > 0 else None,
        clear_course=body.course_id is not None and body.course_id <= 0,
    )

    # Improving an existing post is worth a small, tightly capped reward.
    bonus = 0
    if int(post["author_id"]) == uid and points.EDIT_BONUS:
        improved = len((body.content or "").strip()) > len((post.get("content") or "").strip())
        if improved:
            bonus = await points.grant_capped(
                uid, points.EDIT_BONUS, "edit_bonus",
                ref_type="post", ref_id=str(post_id), note="improved a post",
            )

    return {
        "post": await repo.get_post(post_id, uid),
        "edit_bonus": bonus,
        "balance": await points.get_balance(uid),
    }


@router.delete("/posts/{post_id}")
async def delete_post(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    post = await _post_or_404(post_id)
    if int(post["author_id"]) != _uid(user) and user.role != USER_ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    await repo.soft_delete_post(post_id)
    return {"ok": True}


@router.get("/posts/{post_id}/attachment")
async def download_attachment(post_id: int, user: User = Depends(get_current_user)):
    post = await _post_or_404(post_id)
    path = post.get("attachment_path")
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(
        path,
        filename=post.get("attachment_name") or os.path.basename(path),
        media_type=post.get("attachment_mime") or "application/octet-stream",
    )


@router.post("/posts/{post_id}/reactions")
async def react(post_id: int, body: ReactionBody, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    active = await repo.toggle_reaction(post_id, uid, body.kind)
    author_id = int(post["author_id"])
    if active and author_id != uid:
        label = "ถูกใจ" if body.kind == "like" else "บอกว่าโพสต์นี้มีประโยชน์"
        await repo.add_notification(
            author_id, body.kind, f"{_display(user)} {label} โพสต์ของคุณ", post_id=post_id, actor_id=uid
        )
        # The author earns for the attention their post gets. Each reactor can
        # only pay out once per post, and there is a daily ceiling per kind.
        bonus_kind = "like_bonus" if body.kind == "like" else "helpful_bonus"
        bonus_amount = points.LIKE_BONUS if body.kind == "like" else points.HELPFUL_BONUS
        if bonus_amount and not await repo.has_actor_bonus(bonus_kind, post_id, uid):
            await points.grant_capped(
                author_id, bonus_amount, bonus_kind,
                ref_type="post", ref_id=str(post_id), note=repo.actor_note(bonus_kind, uid),
            )
    fresh = await repo.get_post(post_id, uid)
    return {"active": active, "counts": fresh["counts"] if fresh else {}, "viewer": fresh["viewer"] if fresh else {}}


def _mark_deletable(
    comments: List[Dict[str, Any]], user: User, post: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Flag the comments this viewer is allowed to remove.

    Three people can: whoever wrote it, whoever owns the post (moderating their
    own thread, as on any social feed), and an admin.
    """
    uid = _uid(user)
    owns_post = int(post.get("author_id") or 0) == uid
    is_admin = user.role == USER_ROLE_ADMIN
    for c in comments:
        c["can_delete"] = bool(int(c.get("author_id") or 0) == uid or owns_post or is_admin)
    return comments


@router.get("/posts/{post_id}/comments")
async def list_comments(post_id: int, user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    post = await _post_or_404(post_id)
    return _mark_deletable(await repo.list_comments(post_id), user, post)


@router.post("/posts/{post_id}/comments", status_code=201)
async def add_comment(post_id: int, body: CommentBody, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    await _guard_spam(user, "comment")
    await repo.add_comment(post_id, uid, body.content)
    await repo.add_notification(
        int(post["author_id"]), "comment",
        f"{_display(user)} แสดงความคิดเห็นในโพสต์ของคุณ", post_id=post_id, actor_id=uid,
    )
    return {"comments": _mark_deletable(await repo.list_comments(post_id), user, post)}


@router.delete("/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: int, comment_id: int, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Remove a comment. Unlike a post, this really deletes the row."""
    post = await _post_or_404(post_id)
    comment = await repo.get_comment(comment_id)
    if not comment or int(comment["post_id"]) != post_id:
        raise HTTPException(status_code=404, detail="ไม่พบความคิดเห็นนี้")

    uid = _uid(user)
    allowed = (
        int(comment["author_id"]) == uid
        or int(post.get("author_id") or 0) == uid
        or user.role == USER_ROLE_ADMIN
    )
    if not allowed:
        raise HTTPException(
            status_code=403, detail="ลบได้เฉพาะความคิดเห็นของตัวเอง หรือในโพสต์ของคุณเอง"
        )

    await repo.delete_comment(comment_id, post_id)
    return {
        "ok": True,
        "deleted": comment_id,
        "comments": _mark_deletable(await repo.list_comments(post_id), user, post),
    }


@router.post("/posts/{post_id}/save")
async def toggle_save(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    await _post_or_404(post_id)
    saved = await repo.toggle_saved(post_id, _uid(user))
    return {"saved": saved}


@router.post("/posts/{post_id}/share")
async def reshare(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    author_id = int(post["author_id"])

    # One share per person per post. The insert itself decides: a second call
    # changes nothing, so the count, the bonus and the notification cannot be
    # inflated by sharing your own post or by sharing again after the daily
    # point cap was reached.
    first_share = await repo.record_share(post_id, uid)
    if not first_share:
        fresh = await repo.get_post(post_id, uid)
        return {
            "ok": True,
            "counted": False,
            "already_shared": True,
            "counts": fresh["counts"] if fresh else {},
            "message": "คุณแชร์โพสต์นี้ไปแล้ว",
        }

    await repo.bump_counter(post_id, "share_count", 1)
    if author_id != uid and points.SHARE_BONUS:
        await points.grant_capped(
            author_id, points.SHARE_BONUS, "share_bonus",
            ref_type="post", ref_id=str(post_id), note=repo.actor_note("share_bonus", uid),
        )
    await repo.add_notification(
        author_id, "share", f"{_display(user)} แชร์โพสต์ของคุณ", post_id=post_id, actor_id=uid
    )
    fresh = await repo.get_post(post_id, uid)
    return {
        "ok": True,
        "counted": True,
        "already_shared": False,
        "counts": fresh["counts"] if fresh else {},
    }


# ---------------------------------------------------------------------------
# Interactive quiz cards
# ---------------------------------------------------------------------------


def _quiz_questions(post: Dict[str, Any]) -> List[Dict[str, Any]]:
    if post.get("embed_type") != "quiz" or not post.get("embed_snapshot"):
        raise HTTPException(status_code=400, detail="This post has no quiz")
    return list(post["embed_snapshot"].get("questions") or [])


@router.post("/posts/{post_id}/quiz/start")
async def quiz_start(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    questions = _quiz_questions(post)
    is_author = int(post["author_id"]) == uid
    plays = await repo.count_plays(post_id, uid)
    public = await repo.get_post(post_id, uid)
    imported = bool(public and public["viewer"]["imported"])
    if not is_author and not user.is_points_exempt and plays["total"] >= 1 and not imported:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="คุณใช้สิทธิ์เล่นฟรี 1 ครั้งของควิซชุดนี้แล้ว นำเข้าคลังส่วนตัว (1 แต้ม) เพื่อซ้อมซ้ำได้ไม่จำกัด",
            headers={"X-Points-Required": str(points.COSTS["quiz_import"]), "X-Points-Kind": "quiz_import"},
        )
    play_id = await repo.create_play(post_id, uid, len(questions))
    return {
        "play_id": play_id,
        "free": True,
        "questions": [
            {
                "id": q.get("id"),
                "question": q.get("question"),
                "options": [o.get("text") if isinstance(o, dict) else o for o in (q.get("options") or [])],
            }
            for q in questions
        ],
    }


@router.post("/posts/{post_id}/quiz/submit")
async def quiz_submit(post_id: int, body: QuizSubmitBody, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    questions = _quiz_questions(post)
    play = await repo.get_play(body.play_id)
    if not play or int(play["user_id"]) != uid or int(play["post_id"]) != post_id:
        raise HTTPException(status_code=404, detail="Play not found")
    if play.get("completed"):
        raise HTTPException(status_code=409, detail="This play was already submitted")

    results = []
    score = 0
    for q in questions:
        qid = str(q.get("id"))
        given = (body.answers.get(qid) or "").strip()
        correct_answer = (q.get("correct_answer") or "").strip()
        is_correct = bool(given) and given == correct_answer
        if is_correct:
            score += 1
        results.append(
            {
                "id": q.get("id"),
                "your_answer": given or None,
                "correct": is_correct,
                "correct_answer": correct_answer,
                "explanation": q.get("explanation"),
            }
        )

    author_id = int(post["author_id"])
    cashback_paid = False
    if (
        author_id != uid
        and points.CASHBACK_PER_PLAY
        and int(post.get("cashback_earned") or 0) < points.CASHBACK_MAX_PER_POST
        and not await repo.has_completed_before(post_id, uid, body.play_id)
    ):
        await points.grant(
            author_id, points.CASHBACK_PER_PLAY, "cashback",
            ref_type="post", ref_id=str(post_id), note=f"{_display(user)} finished your quiz",
        )
        await repo.bump_counter(post_id, "cashback_earned", points.CASHBACK_PER_PLAY)
        await repo.add_notification(
            author_id, "cashback",
            f"{_display(user)} ทำควิซของคุณจนจบ คุณได้รับแต้มคืน +{points.CASHBACK_PER_PLAY}",
            post_id=post_id, actor_id=uid,
        )
        cashback_paid = True

    await repo.complete_play(body.play_id, score, len(questions), cashback_paid)
    return {"score": score, "total": len(questions), "results": results, "cashback_paid": cashback_paid}


@router.post("/posts/{post_id}/quiz/import")
async def quiz_import(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    questions = _quiz_questions(post)
    if int(post["author_id"]) == uid:
        raise HTTPException(status_code=400, detail="This quiz is already in your library")
    public = await repo.get_post(post_id, uid)
    if public and public["viewer"]["imported"]:
        raise HTTPException(status_code=409, detail="You already imported this quiz")

    try:
        charge = await points.charge(user, "quiz_import", ref_type="post", ref_id=str(post_id))
    except points.InsufficientPoints as exc:
        raise _insufficient(exc)

    snapshot = post["embed_snapshot"]
    try:
        session = QuizSession(
            owner_id=_owner(user),
            topic=snapshot.get("topic") or post.get("title") or "Imported quiz",
            language=snapshot.get("language") or "th",
            question_count=len(questions),
            questions=questions,
            prompt_hash=f"import:{post_id}",
        )
        await session.save()
    except Exception as exc:
        await points.refund(charge, "quiz import failed")
        raise HTTPException(status_code=500, detail=f"Could not import quiz: {exc}")

    await repo.add_notification(
        int(post["author_id"]), "import", f"{_display(user)} นำควิซของคุณเข้าคลังส่วนตัว", post_id=post_id, actor_id=uid
    )
    return {"session_id": session.id, "charged": charge.amount, "balance": await points.get_balance(uid)}


# ---------------------------------------------------------------------------
# Roadmap cards
# ---------------------------------------------------------------------------


@router.post("/posts/{post_id}/roadmap/follow")
async def roadmap_follow(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    if post.get("embed_type") != "roadmap" or not post.get("embed_snapshot"):
        raise HTTPException(status_code=400, detail="This post has no roadmap")
    snapshot = post["embed_snapshot"]

    marker = f"follow:{post_id}"
    existing = [s for s in await RoadmapSession.list_for_owner(_owner(user), limit=200) if s.prompt_hash == marker]
    if existing:
        session = existing[0]
        created = False
    else:
        session = RoadmapSession(
            owner_id=_owner(user),
            title=snapshot.get("title") or post.get("title") or "Roadmap",
            description=snapshot.get("description") or "",
            language="th",
            node_count=len(snapshot.get("nodes") or []),
            nodes=snapshot.get("nodes") or [],
            edges=snapshot.get("edges") or [],
            prompt_hash=marker,
        )
        await session.save()
        created = True
        await repo.bump_counter(post_id, "roadmap_follow_count", 1)
        if int(post["author_id"]) != uid:
            await repo.add_notification(
                int(post["author_id"]), "follow", f"{_display(user)} เริ่มเดินตาม Roadmap ของคุณ", post_id=post_id, actor_id=uid
            )
    await repo.save_item(post_id, uid)
    return {"session_id": session.id, "created": created, "charged": 0}


# ---------------------------------------------------------------------------
# Widgets: leaderboard / popular / notifications / search / materials
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Teacher console
#
# Everything a teacher owns, gathered in one place: the rooms they opened, the
# course material sitting in those rooms, and how students are doing on the
# quizzes posted there. Students never see these routes.
# ---------------------------------------------------------------------------


@router.get("/teacher/overview")
async def teacher_overview(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    if not _is_staff(user):
        raise HTTPException(status_code=403, detail="ส่วนนี้สำหรับอาจารย์และผู้ดูแลระบบเท่านั้น")
    uid = _uid(user)
    courses = await repo.courses_owned_by(uid)
    rooms = [c for c in courses if c.get("kind") != repo.KIND_CLUB]
    return {
        "courses": courses,
        "totals": {
            "courses": len(rooms),
            "members": sum(int(c["member_count"]) for c in rooms),
            "posts": sum(int(c["post_count"]) for c in rooms),
            "documents": sum(int(c["document_count"]) for c in rooms),
        },
    }


@router.get("/teacher/quiz-results")
async def teacher_quiz_results(
    course_id: Optional[int] = None,
    limit: int = Query(default=100, ge=1, le=300),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    if not _is_staff(user):
        raise HTTPException(status_code=403, detail="ส่วนนี้สำหรับอาจารย์และผู้ดูแลระบบเท่านั้น")
    items = await repo.quiz_results_for_teacher(_uid(user), course_id=course_id, limit=limit)
    finished = [i for i in items if i["completed"] and i.get("total")]
    average = (
        round(sum(int(i["score"] or 0) / int(i["total"]) for i in finished) / len(finished) * 100)
        if finished
        else None
    )
    return {
        "items": items,
        "summary": {
            "attempts": len(items),
            "finished": len(finished),
            "students": len({i["student_id"] for i in items}),
            "average_percent": average,
        },
    }


@router.get("/leaderboard")
async def leaderboard(days: int = Query(default=7, ge=1, le=90), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    weekly = await points.top_creators(days=days, limit=10)
    return {"days": days, "items": weekly}


@router.get("/roadmaps/popular")
async def popular_roadmaps(limit: int = Query(default=5, ge=1, le=20), user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    posts = await repo.list_posts(_uid(user), embed_types=["roadmap"], limit=limit, order="popular")
    return [
        {
            "id": p["id"],
            "title": p.get("title") or (p.get("embed") or {}).get("title"),
            "author": p["author"],
            "node_count": len((p.get("embed") or {}).get("nodes") or []),
            "counts": p["counts"],
            "created_at": p["created_at"],
        }
        for p in posts
    ]


@router.get("/notifications")
async def notifications(limit: int = Query(default=20, ge=1, le=100), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return await repo.list_notifications(_uid(user), limit)


@router.post("/notifications/read")
async def notifications_read(body: NotificationsRead, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    await repo.mark_notifications_read(_uid(user), body.ids)
    return {"ok": True}


@router.get("/search")
async def search(q: str = Query(..., min_length=1, max_length=200), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    return {
        "query": q,
        "posts": await repo.list_posts(uid, query=q, limit=10),
        "users": await repo.search_users(q),
        "courses": await repo.search_courses(q),
    }


@router.get("/materials")
async def materials(
    course_id: Optional[int] = None,
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    items = await repo.list_posts(_uid(user), post_type="material", course_id=course_id, limit=limit)
    return {"items": items}


# ---------------------------------------------------------------------------
# Knowledge library
#
#   * teachers/admins publish course material  -> scope="course"  (everyone reads)
#   * students push their own PDFs/links/text  -> scope="personal" (private)
#
# Both end up as embedded Open Notebook sources, so KMITL RAG AI, AI Quiz and
# AI Roadmap can ground their answers in them.
# ---------------------------------------------------------------------------


def _library_error(exc: library.LibraryError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


def _doc_public(doc: Dict[str, Any], user: User) -> Dict[str, Any]:
    return {
        "id": doc["id"],
        "title": doc["title"],
        "scope": doc["scope"],
        "kind": doc["kind"],
        "status": doc["status"],
        "error": doc.get("error"),
        "chunks": int(doc.get("chunks") or 0),
        "chars": int(doc.get("chars") or 0),
        "filename": doc.get("filename"),
        "mime": doc.get("mime"),
        "size": doc.get("size"),
        "created_at": doc.get("created_at"),
        "course": (
            {
                "id": doc.get("course_id"),
                "code": doc.get("course_code"),
                "name": doc.get("course_name"),
            }
            if doc.get("course_id")
            else None
        ),
        "owner": {
            "id": doc.get("owner_id"),
            "username": doc.get("owner_username"),
            "display_name": doc.get("owner_display_name"),
            "role": doc.get("owner_role"),
        },
        "is_owner": int(doc.get("owner_id") or 0) == int(user.id or 0),
        "can_manage": library.can_manage_document(user, doc),
    }


@router.get("/library")
async def list_library(
    scope: Optional[Literal["course", "personal"]] = None,
    course_id: Optional[int] = None,
    limit: int = Query(default=100, ge=1, le=200),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Documents the caller may read: every course library + their own uploads."""
    docs = await library.list_documents(user, scope=scope, course_id=course_id, limit=limit)
    return {
        "items": [_doc_public(d, user) for d in docs],
        "stats": await library.library_stats(user),
        "can_publish_course": _is_staff(user),
    }


@router.get("/library/{doc_id}")
async def get_library_document(
    doc_id: int, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    doc = await library.get_document(doc_id)
    if not doc or not library.can_read_document(user, doc):
        raise HTTPException(status_code=404, detail="ไม่พบเอกสารนี้")
    return _doc_public(doc, user)


@router.post("/library", status_code=201)
async def upload_library_document(
    background: BackgroundTasks,
    scope: Literal["course", "personal"] = Form(default="personal"),
    course_id: Optional[int] = Form(default=None),
    title: Optional[str] = Form(default=None),
    url: Optional[str] = Form(default=None),
    content: Optional[str] = Form(default=None),
    share_to_feed: bool = Form(default=False),
    file: Optional[UploadFile] = File(default=None),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Add one document to the knowledge library.

    Teachers/admins may publish into a course library (``scope="course"`` with a
    ``course_id``); everyone else is confined to their own private library.
    Extraction + embedding run in the background – poll ``GET /library/{id}``.
    """
    uid = _uid(user)
    await _guard_spam(user, "library")
    if course_id is not None and course_id <= 0:
        course_id = None

    # --- resolve scope + destination notebook -----------------------------
    if scope == library.SCOPE_COURSE:
        if not _is_staff(user):
            raise HTTPException(
                status_code=403,
                detail="เฉพาะอาจารย์หรือผู้ดูแลเท่านั้นที่เพิ่มเนื้อหาเข้าคลังของรายวิชาได้",
            )
        if not course_id:
            raise HTTPException(status_code=400, detail="กรุณาเลือกรายวิชา")
        course = await library.get_course(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="ไม่พบรายวิชานี้")
        if course.get("kind") == repo.KIND_CLUB:
            # Discussion rooms have no shared library on purpose, so nothing a
            # student opens can end up grounding the RAG.
            raise HTTPException(
                status_code=400,
                detail="ห้องพูดคุยไม่มีคลังความรู้ กรุณาเลือกห้องวิชา",
            )
        notebook_id = await library.ensure_course_notebook(course)
    else:
        scope = library.SCOPE_PERSONAL
        notebook_id = await library.ensure_personal_notebook(user)

    # --- payload ----------------------------------------------------------
    kind: str
    file_path: Optional[str] = None
    filename: Optional[str] = None
    mime: Optional[str] = None
    size: Optional[int] = None
    raw_text: Optional[str] = None
    content_hash: str = ""

    if file is not None and file.filename:
        kind = "file"
        filename = library.safe_filename(file.filename)
        try:
            library.validate_extension(filename)
        except library.LibraryError as exc:
            raise _library_error(exc)
        file_path = library.storage_path(filename)
        limit = library.MAX_UPLOAD_MB * 1024 * 1024
        size = 0
        digest = hashlib.md5()
        with open(file_path, "wb") as fh:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    fh.close()
                    os.remove(file_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"ไฟล์ใหญ่เกิน {library.MAX_UPLOAD_MB} MB",
                    )
                digest.update(chunk)
                fh.write(chunk)
        mime = file.content_type
        content_hash = digest.hexdigest()
    elif url and url.strip():
        kind = "url"
        cleaned = url.strip()
        if not cleaned.lower().startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://")
        file_path = cleaned[:512]
        content_hash = ratelimit.fingerprint(cleaned)
    elif content and content.strip():
        kind = "text"
        raw_text = content
        if len(content.strip()) < MIN_DOCUMENT_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"ข้อความต้องยาวอย่างน้อย {MIN_DOCUMENT_CHARS} ตัวอักษรจึงจะใช้เป็นแหล่งอ้างอิงได้",
            )
        content_hash = ratelimit.fingerprint(content)
    else:
        raise HTTPException(status_code=400, detail="กรุณาแนบไฟล์ ใส่ลิงก์ หรือวางข้อความ")

    # Re-uploading the same document would burn embedding budget for nothing.
    try:
        await ratelimit.check_duplicate_document(uid, content_hash)
    except ratelimit.DuplicateContent as exc:
        if kind == "file" and file_path and os.path.isfile(file_path):
            os.remove(file_path)
        raise _duplicate(exc)

    resolved_title = (title or "").strip() or filename or (file_path if kind == "url" else None) or "เอกสารไม่มีชื่อ"

    doc_id = await library.create_document(
        owner_id=uid,
        scope=scope,
        course_id=course_id,
        notebook_id=notebook_id,
        title=resolved_title,
        kind=kind,
        filename=filename,
        file_path=file_path,
        mime=mime,
        size=size,
        content_hash=content_hash,
    )

    # --- optionally announce it in the feed --------------------------------
    post_id: Optional[int] = None
    if share_to_feed:
        post_type = "material" if scope == library.SCOPE_COURSE else "summary"
        if post_type == "material" and not _is_staff(user):
            post_type = "summary"
        post_id = await repo.create_post(
            author_id=uid,
            post_type=post_type,
            title=resolved_title,
            content=(
                "เพิ่มเข้าคลังความรู้ของรายวิชาแล้ว ถาม KMITL RAG AI หรือสร้างควิซจากเอกสารนี้ได้เลย"
                if scope == library.SCOPE_COURSE
                else None
            ),
            course_id=course_id,
            tags=[],
            attachment=(
                {"name": filename, "path": file_path, "size": size, "mime": mime}
                if kind == "file"
                else None
            ),
        )
        await library.update_document(doc_id, post_id=post_id)

    background.add_task(library.ingest_document, doc_id, raw_text)

    doc = await library.get_document(doc_id)
    return {
        "document": _doc_public(doc or {}, user),
        "post_id": post_id,
        "message": "กำลังประมวลผลเอกสาร ระบบจะพร้อมใช้ภายในไม่กี่วินาที",
    }


@router.post("/library/{doc_id}/retry")
async def retry_library_document(
    doc_id: int, background: BackgroundTasks, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    doc = await library.get_document(doc_id)
    if not doc or not library.can_read_document(user, doc):
        raise HTTPException(status_code=404, detail="ไม่พบเอกสารนี้")
    if not library.can_manage_document(user, doc):
        raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์จัดการเอกสารนี้")
    if doc["kind"] == "text":
        raise HTTPException(status_code=400, detail="เอกสารแบบข้อความต้องอัปโหลดใหม่")
    await library.update_document(doc_id, status="processing", error=None)
    background.add_task(library.ingest_document, doc_id, None)
    return {"ok": True}


@router.delete("/library/{doc_id}")
async def delete_library_document(
    doc_id: int, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    doc = await library.get_document(doc_id)
    if not doc or not library.can_read_document(user, doc):
        raise HTTPException(status_code=404, detail="ไม่พบเอกสารนี้")
    if not library.can_manage_document(user, doc):
        raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ลบเอกสารนี้")
    await library.delete_document(doc)
    return {"ok": True}


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


# ---------------------------------------------------------------------------
# Study tools scoped to the library (quiz / roadmap from course material)
# ---------------------------------------------------------------------------


@router.post("/study/quiz")
async def study_quiz(
    body: StudyQuizBody, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Generate a quiz grounded in the selected course material / own documents."""
    from open_notebook.features import service as feature_service

    uid = _uid(user)
    notebook_ids, label, _fallback = await _resolve_scope(
        user, body.scope, body.course_id, body.document_ids
    )
    try:
        charge = await points.charge(user, "quiz_generate", ref_type="quiz_generate")
    except points.InsufficientPoints as exc:
        raise _insufficient(exc)

    report: Dict[str, Any] = {}
    try:
        session = await feature_service.generate_quiz(
            owner_id=_owner(user),
            topic=body.topic,
            question_count=body.question_count,
            language=body.language,
            model_id=None,
            report=report,
            notebook_ids=notebook_ids or None,
        )
    except (InvalidInputError, ConfigurationError) as exc:
        await points.refund(charge, "quiz generation failed")
        raise HTTPException(status_code=400, detail=str(exc))
    except ExternalServiceError as exc:
        await points.refund(charge, "quiz generation failed")
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        await points.refund(charge, "quiz generation failed")
        logger.exception("study quiz failed")
        raise HTTPException(status_code=500, detail=str(exc))

    if report.get("cached"):
        await points.refund(charge, "cached quiz – no compute cost")
    else:
        await points.set_charge_ref(charge, "quiz_session", session.id or "")

    return {
        "session_id": session.id,
        "topic": session.topic,
        "questions": session.questions,
        "scope_label": label,
        "grounded": bool(notebook_ids),
        "cached": bool(report.get("cached")),
        "charged": 0 if report.get("cached") else charge.amount,
        "balance": await points.get_balance(uid),
    }


@router.post("/study/roadmap")
async def study_roadmap(
    body: StudyRoadmapBody, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Generate a roadmap grounded in the selected course material / own documents."""
    from open_notebook.features import service as feature_service

    uid = _uid(user)
    notebook_ids, label, _fallback = await _resolve_scope(
        user, body.scope, body.course_id, body.document_ids
    )
    try:
        charge = await points.charge(user, "roadmap_generate", ref_type="roadmap_generate")
    except points.InsufficientPoints as exc:
        raise _insufficient(exc)

    report: Dict[str, Any] = {}
    try:
        session = await feature_service.generate_roadmap(
            owner_id=_owner(user),
            description=body.description,
            title=body.title,
            language=body.language,
            node_count=body.node_count,
            model_id=None,
            report=report,
            notebook_ids=notebook_ids or None,
        )
    except (InvalidInputError, ConfigurationError) as exc:
        await points.refund(charge, "roadmap generation failed")
        raise HTTPException(status_code=400, detail=str(exc))
    except ExternalServiceError as exc:
        await points.refund(charge, "roadmap generation failed")
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        await points.refund(charge, "roadmap generation failed")
        logger.exception("study roadmap failed")
        raise HTTPException(status_code=500, detail=str(exc))

    if report.get("cached"):
        await points.refund(charge, "cached roadmap – no compute cost")
    else:
        await points.set_charge_ref(charge, "roadmap_session", session.id or "")

    return {
        "session_id": session.id,
        "title": session.title,
        "nodes": session.nodes,
        "edges": session.edges,
        "scope_label": label,
        "grounded": bool(notebook_ids),
        "cached": bool(report.get("cached")),
        "charged": 0 if report.get("cached") else charge.amount,
        "balance": await points.get_balance(uid),
    }


# ---------------------------------------------------------------------------
# Shared knowledge: staff notebooks every role can ask about
# ---------------------------------------------------------------------------


@router.get("/knowledge")
async def list_knowledge(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Everything the "เจาะจงเอกสาร" dropdown offers besides the caller's own
    library documents: research notebooks built by admins/teachers and live
    course libraries, each with its sources. Read-only and the same for every
    role — students cannot open /notebooks, but they can ask about its content.
    """
    notebooks = await library.list_shared_notebooks(with_sources=True, viewer=user)
    return {
        "notebooks": notebooks,
        # Admins also receive every private notebook (visibility="private").
        "sees_everything": library.is_admin(user),
        "stats": {
            "notebooks": len(notebooks),
            "sources": sum(nb["source_count"] for nb in notebooks),
        },
    }


# ---------------------------------------------------------------------------
# KMITL RAG AI quick-ask (1 pt / question, 4 pt / 5-message session)
# ---------------------------------------------------------------------------


async def _store_exchange(
    uid: int,
    body: AskBody,
    result: Dict[str, Any],
    scope_label: str,
    grounded: bool,
    charged: int,
    session_id: Optional[str],
    credits_left: Optional[int],
) -> Optional[str]:
    """
    Append the question and answer to the caller's chat history.

    History is a convenience on top of an answer that was already produced and
    paid for, so a storage problem is logged and the answer still goes out.
    """
    try:
        conversation_id = body.conversation_id
        if conversation_id and not await repo.get_conversation(conversation_id, uid):
            conversation_id = None  # not theirs or gone: start a fresh one
        if not conversation_id:
            conversation_id = await repo.create_conversation(uid, body.question, scope_label)
        await repo.append_messages(
            conversation_id,
            [
                {
                    "role": "user",
                    "content": body.question,
                    "meta": {"scope": body.scope, "web": body.web},
                },
                {
                    "role": "assistant",
                    "content": result["answer"],
                    "meta": {
                        "citations": result.get("citations", []),
                        "web_sources": result.get("web_sources", []),
                        "web_used": bool(result.get("web_used")),
                        "coverage": result.get("coverage"),
                        "scope_label": scope_label,
                        "grounded": grounded,
                        "charged": charged,
                        "session_id": session_id,
                        "credits_left": credits_left,
                    },
                },
            ],
        )
        return conversation_id
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(f"rag history: could not store exchange for user {uid}: {exc}")
        return None


def _conversation_public(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row.get("title") or "บทสนทนาใหม่",
        "scope_label": row.get("scope_label"),
        "message_count": int(row.get("message_count") or 0),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@router.get("/ask/history")
async def list_ask_history(
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """The caller's own KMITL RAG AI conversations, newest first (every role)."""
    rows = await repo.list_conversations(_uid(user), limit=limit)
    return {"items": [_conversation_public(r) for r in rows]}


@router.get("/ask/history/{conversation_id}")
async def get_ask_conversation(
    conversation_id: str, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    row = await repo.get_conversation(conversation_id, _uid(user))
    if not row:
        raise HTTPException(status_code=404, detail="ไม่พบบทสนทนานี้")
    messages = await repo.list_messages(conversation_id)
    return {
        **_conversation_public(row),
        "messages": [
            {
                "id": m["id"],
                "role": m["role"],
                "content": m["content"],
                "meta": m.get("meta") or {},
                "created_at": m.get("created_at"),
            }
            for m in messages
        ],
    }


@router.patch("/ask/history/{conversation_id}")
async def rename_ask_conversation(
    conversation_id: str,
    body: RenameConversationBody,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    if not await repo.rename_conversation(conversation_id, _uid(user), body.title):
        raise HTTPException(status_code=404, detail="ไม่พบบทสนทนานี้")
    return {"ok": True}


@router.delete("/ask/history/{conversation_id}")
async def delete_ask_conversation(
    conversation_id: str, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    if not await repo.delete_conversation(conversation_id, _uid(user)):
        raise HTTPException(status_code=404, detail="ไม่พบบทสนทนานี้")
    return {"ok": True}


@router.post("/ask")
async def ask(body: AskBody, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    source_ids: Optional[List[str]] = None
    if body.scope in ("document", "notebook") and not (
        body.document_ids or body.notebook_ids or body.source_ids
    ):
        raise HTTPException(status_code=400, detail="เลือก notebook หรือเอกสารก่อนถาม")
    pick = await _resolve_pick(user, body.document_ids, body.notebook_ids, body.source_ids)
    if pick is not None:
        notebook_ids, source_ids, scope_label = pick
        allow_fallback = False
    else:
        notebook_ids, scope_label, allow_fallback = await _resolve_scope(
            user, body.scope, body.course_id, body.document_ids
        )
    charge: Optional[points.Charge] = None
    session: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = body.session_id

    if session_id:
        session = await repo.get_rag_session(session_id, uid)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if int(session.get("credits_left") or 0) <= 0:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"เซสชันนี้ใช้ครบ {points.RAG_SESSION_MESSAGES} ข้อความแล้ว เริ่มเซสชันใหม่ ({points.COSTS['rag_session']} แต้ม) หรือถามแบบคำถามเดี่ยว ({points.COSTS['rag_question']} แต้ม)",
                headers={"X-Points-Kind": "rag_session_exhausted"},
            )
    elif body.mode == "session":
        try:
            charge = await points.charge(user, "rag_session", ref_type="rag_session")
        except points.InsufficientPoints as exc:
            raise _insufficient(exc)
        session_id = await repo.create_rag_session(uid, points.RAG_SESSION_MESSAGES)
        await points.set_charge_ref(charge, "rag_session", session_id)
        session = {"id": session_id, "messages": [], "credits_left": points.RAG_SESSION_MESSAGES}
    else:
        try:
            charge = await points.charge(user, "rag_question", ref_type="rag_question")
        except points.InsufficientPoints as exc:
            raise _insufficient(exc)

    history = list(session["messages"]) if session else []
    try:
        result = await quick_ask(
            owner_id=_owner(user),
            question=body.question,
            history=history,
            language=body.language,
            model_id=body.model_id,
            notebook_ids=notebook_ids or None,
            scope_label=scope_label,
            allow_global_fallback=allow_fallback,
            source_ids=source_ids,
            web=body.web,
        )
    except (ConfigurationError, InvalidInputError) as exc:
        await points.refund(charge, "ask failed")
        raise HTTPException(status_code=400, detail=str(exc))
    except ExternalServiceError as exc:
        await points.refund(charge, "ask failed")
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        await points.refund(charge, "ask failed")
        logger.exception("quick ask failed")
        raise HTTPException(status_code=500, detail=str(exc))

    credits_left: Optional[int] = None
    if session:
        history.append({"role": "user", "content": body.question})
        history.append({"role": "assistant", "content": result["answer"]})
        credits_left = int(session.get("credits_left") or 0) - 1
        await repo.update_rag_session(session_id or "", history, credits_left)

    charged_amount = charge.amount if charge and charge.charged else 0
    conversation_id = await _store_exchange(
        uid, body, result, scope_label, bool(notebook_ids), charged_amount,
        session_id if session else None, credits_left,
    )

    return {
        "conversation_id": conversation_id,
        "answer": result["answer"],
        "citations": result["citations"],
        "web_sources": result.get("web_sources", []),
        "web_used": bool(result.get("web_used")),
        "web_queries": result.get("web_queries", []),
        "web_mode": result.get("web_mode", "off"),
        "coverage": result.get("coverage", "full"),
        "scope_label": scope_label,
        "grounded": bool(notebook_ids),
        "session_id": session_id if session else None,
        "credits_left": credits_left,
        "charged": charge.amount if charge and charge.charged else 0,
        "balance": await points.get_balance(uid),
    }
