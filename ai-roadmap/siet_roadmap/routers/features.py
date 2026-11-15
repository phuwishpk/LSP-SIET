"""
/api/features/roadmap/*: generate a project roadmap (15 points, refunded on a
cache hit or a failure) and the caller's saved roadmaps.

The owner comes from ``X-Owner-Id``, else the JWT subject, else ``default``
(siet_platform.http._resolve_owner_id); every read and delete is scoped to it.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from siet_core.exceptions import (
    ConfigurationError,
    DatabaseOperationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)
from siet_platform import points
from siet_platform.auth_jwt import optional_current_user
from siet_platform.http import _charge, _resolve_owner_id
from siet_platform.users import User
from siet_roadmap import service as roadmap_service
from siet_roadmap.domain import RoadmapSession
from siet_roadmap.schemas import (
    RoadmapGenerateRequest,
    RoadmapGenerateResponse,
    RoadmapSessionResponse,
    RoadmapSessionSummary,
)

router = APIRouter(prefix="/features", tags=["features"])


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


@router.post("/roadmap/generate", response_model=RoadmapGenerateResponse)
async def generate_roadmap(
    request: RoadmapGenerateRequest,
    owner_id: str = Depends(_resolve_owner_id),
    user: Optional[User] = Depends(optional_current_user),
):
    """Generate a new project roadmap and persist it for the request owner (15 pt)."""
    charge = await _charge(user, "roadmap_generate")
    report: dict = {}
    try:
        session = await roadmap_service.generate_roadmap(
            owner_id=owner_id,
            description=request.description,
            title=request.title,
            language=request.language,
            node_count=request.node_count,
            notebook_id=request.notebook_id,
            model_id=request.model_id,
            report=report,
        )
    except (InvalidInputError, ConfigurationError, ExternalServiceError) as exc:
        await points.refund(charge, "roadmap generation failed")
        logger.warning(f"Roadmap generation rejected for {owner_id}: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except DatabaseOperationError as exc:
        await points.refund(charge, "roadmap generation failed")
        logger.exception(f"Database error while generating roadmap for {owner_id}")
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
    except Exception as exc:
        await points.refund(charge, "roadmap generation failed")
        logger.exception(f"Unexpected error while generating roadmap for {owner_id}")
        raise HTTPException(status_code=500, detail=str(exc))

    cached = bool(report.get("cached"))
    if cached:
        await points.refund(charge, "cached roadmap – no compute cost")
    else:
        await points.set_charge_ref(charge, "roadmap_session", session.id or "")

    return RoadmapGenerateResponse(
        session=_session_to_roadmap_response(session),
        cached=cached,
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
