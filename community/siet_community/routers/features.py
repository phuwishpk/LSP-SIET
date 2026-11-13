"""
POST /api/features/quiz/generate. The quiz service lives in siet_platform;
the route lives here because a quiz can also be generated from the caller's
saved community posts, which only this package can read.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from open_notebook.exceptions import (
    ConfigurationError,
    DatabaseOperationError,
    ExternalServiceError,
    InvalidInputError,
)
from siet_community import repository as community_repo
from siet_platform import points
from siet_platform.auth_jwt import optional_current_user
from siet_platform.features import service as feature_service
from siet_platform.features.schemas import QuizGenerateRequest, QuizGenerateResponse
from siet_platform.routers.features import (
    _charge,
    _resolve_owner_id,
    _session_to_quiz_response,
)
from siet_platform.users import User

router = APIRouter(prefix="/features", tags=["features"])


@router.post("/quiz/generate", response_model=QuizGenerateResponse)
async def generate_quiz(
    request: QuizGenerateRequest,
    owner_id: str = Depends(_resolve_owner_id),
    user: Optional[User] = Depends(optional_current_user),
):
    """Generate a new quiz and persist it for the request owner (8 pt)."""
    source_text = None
    if request.saved_post_ids or request.use_saved_posts or request.saved_collection_id:
        if user is None or user.id is None:
            raise HTTPException(status_code=401, detail="ต้องเข้าสู่ระบบเพื่อใช้โพสต์ที่บันทึกไว้")
        if owner_id != str(user.id):
            raise HTTPException(status_code=403, detail="เจ้าของแบบทดสอบต้องตรงกับบัญชีที่บันทึกโพสต์")
        requested_ids = request.saved_post_ids or None
        saved_posts = await community_repo.saved_posts_for_quiz(
            int(user.id),
            requested_ids,
            request.saved_collection_id,
            include_all=request.use_saved_posts and request.saved_collection_id is None,
        )
        if request.saved_post_ids and len(saved_posts) != len(set(request.saved_post_ids)):
            raise HTTPException(status_code=403, detail="เลือกได้เฉพาะโพสต์ที่คุณบันทึกไว้")
        if not saved_posts:
            raise HTTPException(status_code=400, detail="ไม่มีโพสต์ที่บันทึกไว้สำหรับสร้างแบบทดสอบ")
        source_text = "\n\n".join(
            "\n".join(
                value
                for value in (
                    f"หัวข้อ: {post.get('title')}" if post.get("title") else "",
                    f"วิชา: {post.get('course_name')}" if post.get("course_name") else "",
                    f"แท็ก: {post.get('tags')}" if post.get("tags") else "",
                    f"ไฟล์แนบ: {post.get('attachment_name')}" if post.get("attachment_name") else "",
                    f"เนื้อหา: {post.get('content')}" if post.get("content") else "",
                )
                if value
            )
            for post in saved_posts
        )[:12000]
        if not source_text.strip():
            raise HTTPException(status_code=400, detail="โพสต์ที่บันทึกไว้ไม่มีเนื้อหาสำหรับสร้างแบบทดสอบ")
    charge = await _charge(user, "quiz_generate")
    report: dict = {}
    try:
        session = await feature_service.generate_quiz(
            owner_id=owner_id,
            topic=request.topic,
            question_count=request.question_count,
            language=request.language,
            notebook_id=request.notebook_id,
            model_id=request.model_id,
            report=report,
            source_text=source_text,
        )
    except (InvalidInputError, ConfigurationError, ExternalServiceError) as exc:
        await points.refund(charge, "quiz generation failed")
        logger.warning(f"Quiz generation rejected for {owner_id}: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except DatabaseOperationError as exc:
        await points.refund(charge, "quiz generation failed")
        logger.exception(f"Database error while generating quiz for {owner_id}")
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    except Exception as exc:
        await points.refund(charge, "quiz generation failed")
        logger.exception(f"Unexpected error while generating quiz for {owner_id}")
        raise HTTPException(status_code=500, detail=str(exc))

    cached = bool(report.get("cached"))
    if cached:
        # No LLM compute happened – give the points back.
        await points.refund(charge, "cached quiz – no compute cost")
    else:
        await points.set_charge_ref(charge, "quiz_session", session.id or "")

    return QuizGenerateResponse(
        session=_session_to_quiz_response(session),
        cached=cached,
    )
