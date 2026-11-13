"""
KMITL RAG AI routes under /api/community: the knowledge picker, the paid
quick-ask (1 pt / question, 4 pt / 5-message session) and each user's own
chat history.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from pydantic import BaseModel, Field

from kmitl_rag import history as repo
from kmitl_rag.ask import ANSWER_CACHE_TTL, answer_cache_key, quick_ask
from open_notebook.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    RateLimitError,
)
from siet_platform import library, points, throttle
from siet_platform.auth_jwt import get_current_user
from siet_platform.cache.service import cache_service
from siet_platform.http import (
    _guard_spam,
    _insufficient,
    _internal_error,
    _owner,
    _resolve_pick,
    _resolve_scope,
    _uid,
)
from siet_platform.users import User

router = APIRouter(prefix="/community", tags=["community"])


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


# Identical questions that arrive at the same moment (a whole class asking
# "สรุปสไลด์วันนี้" right after the lecture) all miss the cache, because the first
# answer is not written yet when the others look. The first request becomes the
# leader; the others wait for its result instead of each calling the provider.
_INFLIGHT: Dict[str, "asyncio.Future[Optional[Dict[str, Any]]]"] = {}


async def _store_exchange(
    uid: int,
    body: AskBody,
    result: Dict[str, Any],
    scope_label: str,
    grounded: bool,
    charged: int,
    session_id: Optional[str],
    credits_left: Optional[int],
    cached: bool = False,
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
                        "cached": cached,
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
    # Burst guard per user (3 s cooldown, 8/min, 60/h, 300/day; staff x4). Checked
    # first so a blocked request costs neither points nor a provider call.
    await _guard_spam(user, "ask")
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
    # A session message credit is *reserved* up front with one atomic UPDATE
    # (credits_left > 0), so two questions fired at once cannot both pass a
    # read-then-write check; the credit is given back if the answer fails.
    credits_after: Optional[int] = None

    if session_id:
        session = await repo.get_rag_session(session_id, uid)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        credits_after = await repo.reserve_rag_credit(session_id, uid)
        if credits_after is None:
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
        credits_after = await repo.reserve_rag_credit(session_id, uid)
    else:
        try:
            charge = await points.charge(user, "rag_question", ref_type="rag_question")
        except points.InsufficientPoints as exc:
            raise _insufficient(exc)

    history = list(session["messages"]) if session else []

    # Identical single questions (no conversation context) share one answer for
    # RAG_ANSWER_CACHE_TTL seconds; a hit costs no provider call and no points.
    cache_key: Optional[str] = None
    cached_result: Optional[Dict[str, Any]] = None
    if not session:
        cache_key = answer_cache_key(
            question=body.question,
            notebook_ids=notebook_ids,
            source_ids=source_ids,
            allow_global_fallback=allow_fallback,
            web=body.web,
            language=body.language,
            model_id=body.model_id,
        )
        try:
            cached_result = await cache_service.get_json(cache_key)
        except Exception as exc:  # the cache is optional
            logger.debug(f"answer cache read skipped: {exc}")
            cached_result = None
        if not isinstance(cached_result, dict) or "answer" not in cached_result:
            cached_result = None

    leader: Optional["asyncio.Future[Optional[Dict[str, Any]]]"] = None
    if cache_key and cached_result is None:
        pending = _INFLIGHT.get(cache_key)
        if pending is not None:
            # shield: a follower that disconnects must not cancel the leader's call
            followed = await asyncio.shield(pending)
            if isinstance(followed, dict) and "answer" in followed:
                cached_result = followed
        if cached_result is None:
            leader = asyncio.get_running_loop().create_future()
            _INFLIGHT[cache_key] = leader

    try:
        if cached_result is not None:
            result = cached_result
        else:
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
        if credits_after is not None:
            await repo.release_rag_credit(session_id or "")
        raise HTTPException(status_code=400, detail=str(exc))
    except ExternalServiceError as exc:
        await points.refund(charge, "ask failed")
        if credits_after is not None:
            await repo.release_rag_credit(session_id or "")
        raise HTTPException(status_code=502, detail=str(exc))
    except (throttle.ProviderBusy, RateLimitError):
        # Queue full / provider rate limit: the global handlers answer 503 / 429
        # with Retry-After; the student keeps the point.
        await points.refund(charge, "ask throttled")
        if credits_after is not None:
            await repo.release_rag_credit(session_id or "")
        raise
    except Exception as exc:
        await points.refund(charge, "ask failed")
        if credits_after is not None:
            await repo.release_rag_credit(session_id or "")
        raise _internal_error(exc, "quick ask failed")
    finally:
        if leader is not None:
            _INFLIGHT.pop(cache_key or "", None)
            if not leader.done():
                # None = "ask on your own": the leader failed or was cancelled
                leader.set_result(result if "result" in locals() else None)

    if cached_result is not None:
        await points.refund(charge, "cached answer – no compute cost")
        charge = None
    elif cache_key:
        try:
            await cache_service.set_json(cache_key, result, ttl=ANSWER_CACHE_TTL)
        except Exception as exc:
            logger.debug(f"answer cache write skipped: {exc}")

    credits_left: Optional[int] = None
    if session:
        history.append({"role": "user", "content": body.question})
        history.append({"role": "assistant", "content": result["answer"]})
        credits_left = credits_after if credits_after is not None else int(session.get("credits_left") or 0) - 1
        await repo.save_rag_messages(session_id or "", history)

    charged_amount = charge.amount if charge and charge.charged else 0
    conversation_id = await _store_exchange(
        uid, body, result, scope_label, bool(notebook_ids), charged_amount,
        session_id if session else None, credits_left,
        cached=cached_result is not None,
    )

    return {
        "conversation_id": conversation_id,
        "cached": cached_result is not None,
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
