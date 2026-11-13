"""
KMITL RAG AI admin console (/api/admin/rag): statistics and the document
library only. What people asked and what the AI answered stays private to
each user - the console never reads it.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from loguru import logger

from kmitl_rag import history as repo
from siet_platform import library, points, pricing, ratelimit
from siet_platform.auth_jwt import get_current_user
from siet_platform.http import _audit, _require_admin, _viewer_window
from siet_platform.users import User

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# KMITL RAG AI
#
# Statistics and the document library only. What people asked and what the AI
# answered stays private to each user - the console never reads it.
# ---------------------------------------------------------------------------


@router.get("/rag/stats")
async def rag_stats(
    days: int = Query(default=30, ge=1, le=180),
    tz_offset: int = Query(default=0, ge=-840, le=840, description="Viewer's offset from UTC in minutes"),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Questions per day, how well the library covered them, cost, and the per-user limits."""
    _require_admin(user)
    since, _zone = _viewer_window(days, tz_offset)
    stats = await repo.rag_stats(since, tz_offset)
    stats["usage"]["cost_thb"] = round(stats["usage"]["cost_usd"] * pricing.USD_THB_RATE, 2)
    ask = ratelimit.LIMITS["ask"]
    return {
        "days": days,
        **stats,
        "costs": {
            "question": points.COSTS["rag_question"],
            "session": points.COSTS["rag_session"],
            "session_messages": points.RAG_SESSION_MESSAGES,
        },
        "policy": {
            "cooldown_seconds": ask.cooldown_seconds,
            "per_minute": ask.per_minute,
            "per_hour": ask.per_hour,
            "per_day": ask.per_day,
            "staff_multiplier": ratelimit.STAFF_MULTIPLIER,
        },
    }


@router.get("/rag/documents")
async def list_all_documents(
    q: Optional[str] = Query(default=None, max_length=200),
    status: Optional[Literal["processing", "ready", "failed"]] = None,
    scope: Optional[Literal["course", "personal"]] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Every document people gave the AI to read, personal ones included (never the content)."""
    _require_admin(user)
    return await library.admin_list_documents(query=q, status=status, scope=scope, limit=limit, offset=offset)


async def _document_or_404(doc_id: int) -> Dict[str, Any]:
    doc = await library.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="ไม่พบเอกสารนี้")
    return doc


@router.post("/rag/documents/{doc_id}/retry")
async def retry_any_document(
    doc_id: int, background: BackgroundTasks, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Index a document again. The library's own route only reaches documents the caller can read."""
    _require_admin(user)
    doc = await _document_or_404(doc_id)
    if doc["kind"] == "text":
        raise HTTPException(status_code=400, detail="เอกสารแบบข้อความต้องอัปโหลดใหม่")
    await library.update_document(doc_id, status="processing", error=None)
    background.add_task(library.ingest_document, doc_id, None)
    logger.info(f"admin {user.username} re-indexed library document {doc_id}")
    await _audit(user, "document.retry", target_type="document", target_id=doc_id)
    return {"ok": True}


@router.delete("/rag/documents/{doc_id}")
async def delete_any_document(doc_id: int, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Remove a document with its embeddings and uploaded file, whoever owns it."""
    _require_admin(user)
    doc = await _document_or_404(doc_id)
    await library.delete_document(doc)
    logger.info(f"admin {user.username} deleted library document {doc_id} of owner {doc.get('owner_id')}")
    await _audit(user, "document.delete", target_type="document", target_id=doc_id, owner_id=doc.get("owner_id"), title=doc.get("title"))
    return {"ok": True, "deleted": doc_id}
