"""
SIET Space community API (Facebook-style feed + point wallet).

All routes require a workspace JWT (``get_current_user``) because every
action is attributed to a MariaDB user id.
"""

from __future__ import annotations

import os
import re
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel, Field

from api.auth_jwt import get_current_user
from open_notebook.community import points
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uid(user: User) -> int:
    if user.id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return int(user.id)


def _owner(user: User) -> str:
    return str(_uid(user))


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


async def _post_or_404(post_id: int) -> Dict[str, Any]:
    post = await repo.get_post_raw(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CourseCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    name: str = Field(..., min_length=2, max_length=128)
    description: Optional[str] = Field(default=None, max_length=255)


class ReactionBody(BaseModel):
    kind: Literal["like", "helpful"]


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
    if not _is_staff(user):
        raise HTTPException(status_code=403, detail="Only teachers or admins can create courses")
    try:
        return await repo.create_course(body.code, body.name, body.description, _uid(user))
    except Exception as exc:
        if "Duplicate" in str(exc):
            raise HTTPException(status_code=409, detail="Course code already exists")
        raise


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

    if not (content or "").strip() and not snapshot and file is None:
        raise HTTPException(status_code=400, detail="Post needs some content, a file, or an embed")

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
    )

    bonus = 0
    if post_type == "summary" and (attachment or len((content or "").strip()) >= 100):
        bonus = points.CREATOR_BONUS_SUMMARY
        if bonus:
            await points.grant(uid, bonus, "creator_bonus", ref_type="post", ref_id=str(post_id), note="shared a summary")

    post = await repo.get_post(post_id, uid)
    return {"post": post, "creator_bonus": bonus, "balance": await points.get_balance(uid)}


@router.get("/posts/{post_id}")
async def get_post(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    post = await repo.get_post(post_id, _uid(user))
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post["comments"] = await repo.list_comments(post_id)
    return post


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
        if body.kind == "helpful" and points.HELPFUL_BONUS and not await repo.has_helpful_bonus(post_id, uid):
            await points.grant(
                author_id, points.HELPFUL_BONUS, "helpful_bonus",
                ref_type="post", ref_id=str(post_id), note=f"helpful from user:{uid}",
            )
    fresh = await repo.get_post(post_id, uid)
    return {"active": active, "counts": fresh["counts"] if fresh else {}, "viewer": fresh["viewer"] if fresh else {}}


@router.get("/posts/{post_id}/comments")
async def list_comments(post_id: int, user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    await _post_or_404(post_id)
    return await repo.list_comments(post_id)


@router.post("/posts/{post_id}/comments", status_code=201)
async def add_comment(post_id: int, body: CommentBody, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
    post = await _post_or_404(post_id)
    await repo.add_comment(post_id, uid, body.content)
    await repo.add_notification(
        int(post["author_id"]), "comment",
        f"{_display(user)} แสดงความคิดเห็นในโพสต์ของคุณ", post_id=post_id, actor_id=uid,
    )
    return {"comments": await repo.list_comments(post_id)}


@router.post("/posts/{post_id}/save")
async def toggle_save(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    await _post_or_404(post_id)
    saved = await repo.toggle_saved(post_id, _uid(user))
    return {"saved": saved}


@router.post("/posts/{post_id}/share")
async def reshare(post_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    post = await _post_or_404(post_id)
    await repo.bump_counter(post_id, "share_count", 1)
    await repo.add_notification(
        int(post["author_id"]), "share", f"{_display(user)} แชร์โพสต์ของคุณ", post_id=post_id, actor_id=_uid(user)
    )
    return {"ok": True}


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
        await repo.bump_counter(post_id, "follow_count", 1)
        if int(post["author_id"]) != uid:
            await repo.add_notification(
                int(post["author_id"]), "follow", f"{_display(user)} เริ่มเดินตาม Roadmap ของคุณ", post_id=post_id, actor_id=uid
            )
    await repo.save_item(post_id, uid)
    return {"session_id": session.id, "created": created, "charged": 0}


# ---------------------------------------------------------------------------
# Widgets: leaderboard / popular / notifications / search / materials
# ---------------------------------------------------------------------------


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
# KMITL RAG AI quick-ask (1 pt / question, 4 pt / 5-message session)
# ---------------------------------------------------------------------------


@router.post("/ask")
async def ask(body: AskBody, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    uid = _uid(user)
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

    return {
        "answer": result["answer"],
        "citations": result["citations"],
        "session_id": session_id if session else None,
        "credits_left": credits_left,
        "charged": charge.amount if charge and charge.charged else 0,
        "balance": await points.get_balance(uid),
    }
