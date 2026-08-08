"""
API router for the bundled AI feature modules (Quiz + Roadmap).

Endpoints are protected by the existing `PasswordAuthMiddleware` and
require an `X-Owner-Id` header to separate data across users. If the
header is missing, the request is attributed to the `default` user so
single-user deployments keep working without any config changes.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from loguru import logger

from api.models import (
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizSessionResponse,
    QuizSessionSummary,
    RoadmapGenerateRequest,
    RoadmapGenerateResponse,
    RoadmapSessionResponse,
    RoadmapSessionSummary,
)
from open_notebook.domain.features import QuizSession, RoadmapSession
from open_notebook.exceptions import (
    ConfigurationError,
    DatabaseOperationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)
from open_notebook.features import service as feature_service

router = APIRouter(prefix="/features", tags=["features"])

DEFAULT_OWNER_ID = "default"


def _resolve_owner_id(
    request: Request,
    x_owner_id: Optional[str] = Header(default=None, alias="X-Owner-Id"),
) -> str:
    """
    Read the per-user identifier from the request.

    Priority:
      1. ``X-Owner-Id`` header supplied by the caller
      2. ``request.state.owner_id`` populated by the auth middleware
         (resolved from the verified JWT subject)
      3. ``"default"`` so legacy single-user setups keep working
    """
    header_value = (x_owner_id or "").strip()
    if header_value:
        return header_value
    state_owner = getattr(request.state, "owner_id", None)
    if state_owner:
        return str(state_owner)
    return DEFAULT_OWNER_ID


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


def _session_to_roadmap_response(session: RoadmapSession) -> RoadmapSessionResponse:
    return RoadmapSessionResponse(
        id=session.id or "",
        owner_id=session.owner_id,
        title=session.title,
        description=session.description,
        language=session.language,
        node_count=session.node_count,
        nodes=session.nodes,
        edges=session.edges,
        notebook_id=session.notebook_id,
        model_id=session.model_id,
        prompt_hash=session.prompt_hash,
        created=str(session.created),
        updated=str(session.updated),
    )


# ---------------------------------------------------------------------------
# Quiz endpoints
# ---------------------------------------------------------------------------


@router.post("/quiz/generate", response_model=QuizGenerateResponse)
async def generate_quiz(
    request: QuizGenerateRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Generate a new quiz and persist it for the request owner."""
    try:
        session = await feature_service.generate_quiz(
            owner_id=owner_id,
            topic=request.topic,
            question_count=request.question_count,
            language=request.language,
            notebook_id=request.notebook_id,
            model_id=request.model_id,
        )
    except (InvalidInputError, ConfigurationError, ExternalServiceError) as exc:
        logger.warning(f"Quiz generation rejected for {owner_id}: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except DatabaseOperationError as exc:
        logger.exception(f"Database error while generating quiz for {owner_id}")
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    except Exception as exc:
        logger.exception(f"Unexpected error while generating quiz for {owner_id}")
        raise HTTPException(status_code=500, detail=str(exc))

    return QuizGenerateResponse(
        session=_session_to_quiz_response(session),
        cached=False,
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


# ---------------------------------------------------------------------------
# Roadmap endpoints
# ---------------------------------------------------------------------------


@router.post("/roadmap/generate", response_model=RoadmapGenerateResponse)
async def generate_roadmap(
    request: RoadmapGenerateRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Generate a new project roadmap and persist it for the request owner."""
    try:
        session = await feature_service.generate_roadmap(
            owner_id=owner_id,
            description=request.description,
            title=request.title,
            language=request.language,
            node_count=request.node_count,
            notebook_id=request.notebook_id,
            model_id=request.model_id,
        )
    except (InvalidInputError, ConfigurationError, ExternalServiceError) as exc:
        logger.warning(f"Roadmap generation rejected for {owner_id}: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except DatabaseOperationError as exc:
        logger.exception(f"Database error while generating roadmap for {owner_id}")
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    except Exception as exc:
        logger.exception(f"Unexpected error while generating roadmap for {owner_id}")
        raise HTTPException(status_code=500, detail=str(exc))

    return RoadmapGenerateResponse(
        session=_session_to_roadmap_response(session),
        cached=False,
    )


@router.get("/roadmap/sessions", response_model=List[RoadmapSessionSummary])
async def list_roadmap_sessions(
    limit: int = 50,
    owner_id: str = Depends(_resolve_owner_id),
):
    """List all roadmap sessions belonging to the request owner."""
    try:
        sessions = await RoadmapSession.list_for_owner(
            owner_id=owner_id, limit=limit
        )
    except DatabaseOperationError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return [
        RoadmapSessionSummary(
            id=session.id or "",
            title=session.title,
            description=session.description,
            language=session.language,
            node_count=session.node_count,
            created=str(session.created),
        )
        for session in sessions
    ]


@router.get("/roadmap/sessions/{session_id}", response_model=RoadmapSessionResponse)
async def get_roadmap_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Fetch a single roadmap session, scoped to the request owner."""
    try:
        session = await RoadmapSession.get_for_owner(
            session_id=session_id, owner_id=owner_id
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Roadmap session not found")
    except DatabaseOperationError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return _session_to_roadmap_response(session)


@router.delete("/roadmap/sessions/{session_id}")
async def delete_roadmap_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Delete a roadmap session owned by the request owner."""
    try:
        session = await RoadmapSession.get_for_owner(
            session_id=session_id, owner_id=owner_id
        )
        await session.delete_for_owner(owner_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Roadmap session not found")
    except DatabaseOperationError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    return {"message": "Roadmap session deleted"}
