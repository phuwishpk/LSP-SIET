"""
/api/features/quiz/sessions*: the caller's saved quizzes. Generating one is
POST /api/features/quiz/generate, in siet_community (it can read saved posts).

The owner comes from ``X-Owner-Id``, else the JWT subject, else ``default``
(siet_platform.http._resolve_owner_id); every read and delete is scoped to it.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from siet_core.exceptions import DatabaseOperationError, NotFoundError
from siet_platform.http import _resolve_owner_id
from siet_quiz.domain import QuizSession
from siet_quiz.schemas import QuizSessionResponse, QuizSessionSummary

router = APIRouter(prefix="/features", tags=["features"])


def _session_to_quiz_response(session: QuizSession) -> QuizSessionResponse:
    return QuizSessionResponse(
        id=session.id or "",
        owner_id=session.owner_id,
        topic=session.topic,
        language=session.language,
        question_count=session.question_count,
        questions=session.questions,
        notebook_id=session.notebook_id,
        model_id=session.model_id,
        prompt_hash=session.prompt_hash,
        created=str(session.created),
        updated=str(session.updated),
    )


@router.get("/quiz/sessions", response_model=List[QuizSessionSummary])
async def list_quiz_sessions(
    limit: int = 50,
    owner_id: str = Depends(_resolve_owner_id),
):
    """List all quiz sessions belonging to the request owner."""
    try:
        sessions = await QuizSession.list_for_owner(owner_id=owner_id, limit=limit)
    except DatabaseOperationError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return [
        QuizSessionSummary(
            id=session.id or "",
            topic=session.topic,
            language=session.language,
            question_count=session.question_count,
            created=str(session.created),
        )
        for session in sessions
    ]


@router.get("/quiz/sessions/{session_id}", response_model=QuizSessionResponse)
async def get_quiz_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Fetch a single quiz session, scoped to the request owner."""
    try:
        session = await QuizSession.get_for_owner(
            session_id=session_id, owner_id=owner_id
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Quiz session not found")
    except DatabaseOperationError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return _session_to_quiz_response(session)


@router.delete("/quiz/sessions/{session_id}")
async def delete_quiz_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Delete a quiz session owned by the request owner."""
    try:
        session = await QuizSession.get_for_owner(
            session_id=session_id, owner_id=owner_id
        )
        await session.delete_for_owner(owner_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Quiz session not found")
    except DatabaseOperationError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return {"message": "Quiz session deleted"}
