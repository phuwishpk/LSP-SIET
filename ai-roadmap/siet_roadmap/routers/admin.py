"""
Admin console: delete any roadmap for good (DELETE /api/admin/roadmaps/{id}).

The rest of the roadmap console (lists, stats, shared posts) reads community posts
too, so it stays in siet_community.routers.admin.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from siet_platform.auth_jwt import get_current_user
from siet_platform.http import _audit, _require_admin
from siet_platform.users import User
from siet_roadmap.domain import RoadmapSession

router = APIRouter(prefix="/admin", tags=["admin"])


@router.delete("/roadmaps/{session_id}")
async def delete_any_roadmap(session_id: str, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Delete a roadmap for good. A post made from it keeps its own copy."""
    _require_admin(user)
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
