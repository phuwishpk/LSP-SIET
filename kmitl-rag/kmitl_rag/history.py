"""
KMITL RAG AI records in MariaDB: paid quick-ask sessions (message credits),
each user's chat history (rag_conversations / rag_messages) and the admin
statistics over them. The questions and answers themselves stay private to
their owner; the admin console only reads aggregates.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text

from siet_platform.db import _author, _naive_utc, _per_day, _points_spent, _row, _rows
from siet_platform.users import _mariadb_session


# ---------------------------------------------------------------------------
# RAG quick-ask sessions
# ---------------------------------------------------------------------------


async def create_rag_session(user_id: int, credits: int) -> str:
    session_id = uuid.uuid4().hex
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                INSERT INTO rag_credit_sessions (id, user_id, credits_left, messages)
                VALUES (:id, :uid, :credits, :messages)
                """
            ),
            {"id": session_id, "uid": user_id, "credits": credits, "messages": "[]"},
        )
    return session_id


async def get_rag_session(session_id: str, user_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT * FROM rag_credit_sessions WHERE id = :id AND user_id = :uid"),
                {"id": session_id, "uid": user_id},
            )
        ).first()
    if not row:
        return None
    data = _row(row)
    try:
        data["messages"] = json.loads(data.get("messages") or "[]")
    except (TypeError, ValueError):
        data["messages"] = []
    return data


async def reserve_rag_credit(session_id: str, user_id: int) -> Optional[int]:
    """
    Take one message credit atomically. Returns the credits left after the
    reservation, or ``None`` when the session is exhausted (or not theirs) -
    the UPDATE's own ``credits_left > 0`` guard is what makes two concurrent
    questions unable to both succeed on a single remaining credit.
    """
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                UPDATE rag_credit_sessions
                   SET credits_left = credits_left - 1
                 WHERE id = :id AND user_id = :uid AND credits_left > 0
                """
            ),
            {"id": session_id, "uid": user_id},
        )
        if not result.rowcount:
            return None
        row = (
            await session.execute(
                text("SELECT credits_left FROM rag_credit_sessions WHERE id = :id"), {"id": session_id}
            )
        ).first()
    return int(row[0]) if row else 0


async def release_rag_credit(session_id: str) -> None:
    """Give a reserved credit back (the answer failed, so the message was never used)."""
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE rag_credit_sessions SET credits_left = credits_left + 1 WHERE id = :id"),
            {"id": session_id},
        )


async def save_rag_messages(session_id: str, messages: List[Dict[str, Any]]) -> None:
    """Persist the conversation window without touching the credit counter."""
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE rag_credit_sessions SET messages = :messages WHERE id = :id"),
            {"messages": json.dumps(messages[-20:], ensure_ascii=False), "id": session_id},
        )


async def update_rag_session(
    session_id: str, messages: List[Dict[str, Any]], credits_left: int
) -> None:
    async with _mariadb_session() as session:
        await session.execute(
            text(
                "UPDATE rag_credit_sessions SET messages = :messages, credits_left = :credits WHERE id = :id"
            ),
            {
                "messages": json.dumps(messages[-20:], ensure_ascii=False),
                "credits": max(0, credits_left),
                "id": session_id,
            },
        )


# ---------------------------------------------------------------------------
# RAG chat history (rag_conversations / rag_messages)
# ---------------------------------------------------------------------------

MAX_CONVERSATIONS_LISTED = 100
MAX_MESSAGES_LOADED = 400
TITLE_MAX = 200


def conversation_title(question: str) -> str:
    """First line of the first question, trimmed to fit the column."""
    first = " ".join((question or "").strip().split())
    return (first[: TITLE_MAX - 1] + "…") if len(first) > TITLE_MAX else (first or "บทสนทนาใหม่")


async def create_conversation(user_id: int, title: str, scope_label: Optional[str] = None) -> str:
    conversation_id = uuid.uuid4().hex
    async with _mariadb_session() as session:
        await session.execute(
            text(
                "INSERT INTO rag_conversations (id, user_id, title, scope_label) "
                "VALUES (:id, :uid, :title, :scope)"
            ),
            {"id": conversation_id, "uid": user_id, "title": conversation_title(title),
             "scope": (scope_label or None) and scope_label[:255]},
        )
    return conversation_id


async def get_conversation(conversation_id: str, user_id: int) -> Optional[Dict[str, Any]]:
    """The conversation header, only for its owner."""
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT * FROM rag_conversations WHERE id = :id AND user_id = :uid"),
                {"id": conversation_id, "uid": user_id},
            )
        ).first()
    return _row(row) if row else None


async def list_conversations(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT * FROM rag_conversations WHERE user_id = :uid "
                    "ORDER BY updated_at DESC, id DESC LIMIT :limit"
                ),
                {"uid": user_id, "limit": max(1, min(int(limit), MAX_CONVERSATIONS_LISTED))},
            )
        ).all()
    return [_row(r) for r in rows]


async def list_messages(conversation_id: str) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT id, role, content, answer_meta AS meta, created_at FROM rag_messages "
                    "WHERE conversation_id = :cid ORDER BY id ASC LIMIT :limit"
                ),
                {"cid": conversation_id, "limit": MAX_MESSAGES_LOADED},
            )
        ).all()
    out = []
    for r in rows:
        data = _row(r)
        try:
            data["meta"] = json.loads(data.get("meta") or "{}")
        except (TypeError, ValueError):
            data["meta"] = {}
        out.append(data)
    return out


async def append_messages(conversation_id: str, messages: List[Dict[str, Any]]) -> None:
    """Add a user/assistant pair (or more) and bump the header's counters."""
    if not messages:
        return
    async with _mariadb_session() as session:
        for m in messages:
            await session.execute(
                text(
                    "INSERT INTO rag_messages (conversation_id, role, content, answer_meta) "
                    "VALUES (:cid, :role, :content, :meta)"
                ),
                {
                    "cid": conversation_id,
                    "role": str(m.get("role") or "user")[:16],
                    "content": str(m.get("content") or ""),
                    "meta": json.dumps(m.get("meta") or {}, ensure_ascii=False),
                },
            )
        await session.execute(
            text(
                "UPDATE rag_conversations SET message_count = message_count + :n, "
                "updated_at = CURRENT_TIMESTAMP WHERE id = :cid"
            ),
            {"n": len(messages), "cid": conversation_id},
        )


async def rename_conversation(conversation_id: str, user_id: int, title: str) -> bool:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                "UPDATE rag_conversations SET title = :title "
                "WHERE id = :id AND user_id = :uid"
            ),
            {"title": conversation_title(title), "id": conversation_id, "uid": user_id},
        )
    return bool(result.rowcount)


async def delete_conversation(conversation_id: str, user_id: int) -> bool:
    """Delete a conversation and its messages; only the owner may do it."""
    async with _mariadb_session() as session:
        owned = (
            await session.execute(
                text("SELECT 1 FROM rag_conversations WHERE id = :id AND user_id = :uid"),
                {"id": conversation_id, "uid": user_id},
            )
        ).first()
        if not owned:
            return False
        await session.execute(
            text("DELETE FROM rag_messages WHERE conversation_id = :id"), {"id": conversation_id}
        )
        await session.execute(
            text("DELETE FROM rag_conversations WHERE id = :id"), {"id": conversation_id}
        )
    return True


# ---------------------------------------------------------------------------
# Admin statistics
# ---------------------------------------------------------------------------


# The answers of one window are folded in Python (their details live in a JSON
# column); a cap keeps a very busy term from loading the whole table.
RAG_STATS_MAX_ANSWERS = 5000
RAG_COVERAGE_LEVELS = ("full", "partial", "none")


def summarize_rag_answers(metas: Iterable[Any]) -> Dict[str, Any]:
    """
    Fold the stored ``answer_meta`` of RAG answers into coverage counts and the
    most cited documents.

    Tolerant on purpose: the column is JSON text written by several versions of
    the ask route, so a row that cannot be read counts as "unknown" coverage
    instead of failing the page. A document cited twice in one answer counts once.
    """
    coverage = {level: 0 for level in (*RAG_COVERAGE_LEVELS, "unknown")}
    web_used = cached = 0
    cited: Dict[str, Dict[str, Any]] = {}
    for raw in metas:
        try:
            meta = json.loads(raw) if isinstance(raw, (str, bytes)) else (raw or {})
        except (TypeError, ValueError):
            meta = {}
        if not isinstance(meta, dict):
            meta = {}
        level = str(meta.get("coverage") or "").lower()
        coverage[level if level in RAG_COVERAGE_LEVELS else "unknown"] += 1
        if meta.get("web_used") or meta.get("web_sources"):
            web_used += 1
        if meta.get("cached"):
            cached += 1
        seen: set[str] = set()
        for citation in meta.get("citations") or []:
            if not isinstance(citation, dict) or not citation.get("cited"):
                continue
            key = str(citation.get("id") or citation.get("title") or "")
            if not key or key in seen:
                continue
            seen.add(key)
            entry = cited.setdefault(
                key, {"id": citation.get("id"), "title": citation.get("title") or "(ไม่มีชื่อ)", "count": 0}
            )
            entry["count"] += 1
    return {
        "answers": sum(coverage.values()),
        "coverage": coverage,
        "web_used": web_used,
        "cached": cached,
        "top_documents": sorted(cited.values(), key=lambda e: (-e["count"], str(e["title"])))[:8],
    }


async def rag_stats(since: datetime, tz_minutes: int = 0) -> Dict[str, Any]:
    """
    How KMITL RAG AI is used since ``since``.

    Counts and document titles only - never a question or an answer: the chat
    history stays private to its owner, admins included. Questions are counted
    from that history, so a conversation its owner deleted is no longer in here.
    """
    params = {"since": _naive_utc(since), "tz": int(tz_minutes)}
    asked = "FROM rag_messages m WHERE m.role = 'user' AND m.created_at >= :since"
    async with _mariadb_session() as session:
        totals = (
            await session.execute(
                text(
                    f"""
                    SELECT
                      (SELECT COUNT(*) {asked}) AS questions,
                      (SELECT COUNT(DISTINCT m.conversation_id) {asked}) AS conversations,
                      (SELECT COUNT(DISTINCT c.user_id)
                         FROM rag_messages m JOIN rag_conversations c ON c.id = m.conversation_id
                        WHERE m.role = 'user' AND m.created_at >= :since) AS askers
                    """
                ),
                params,
            )
        ).first()
        per_day = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT DATE(DATE_ADD(m.created_at, INTERVAL :tz MINUTE)) AS day, COUNT(*) AS count
                      {asked}
                     GROUP BY day ORDER BY day
                    """
                ),
                params,
            )
        )
        metas = (
            await session.execute(
                text(
                    """
                    SELECT answer_meta FROM rag_messages
                     WHERE role = 'assistant' AND created_at >= :since
                     ORDER BY id DESC LIMIT :cap
                    """
                ),
                {**params, "cap": RAG_STATS_MAX_ANSWERS},
            )
        ).scalars().all()
        askers = _rows(
            await session.execute(
                text(
                    """
                    SELECT u.id AS user_id, u.username, u.display_name, u.role, COUNT(*) AS questions
                      FROM rag_messages m
                      JOIN rag_conversations c ON c.id = m.conversation_id
                      JOIN users u ON u.id = c.user_id
                     WHERE m.role = 'user' AND m.created_at >= :since
                     GROUP BY u.id, u.username, u.display_name, u.role
                     ORDER BY questions DESC, u.id ASC
                     LIMIT 8
                    """
                ),
                params,
            )
        )
        usage = (
            await session.execute(
                text(
                    """
                    SELECT COUNT(*) AS calls,
                           COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
                           COALESCE(SUM(search_queries), 0) AS search_queries,
                           COALESCE(SUM(cost_usd), 0) AS cost_usd,
                           AVG(CASE WHEN kind = 'chat' THEN latency_ms END) AS avg_latency_ms
                      FROM llm_usage
                     WHERE feature = 'ask' AND created_at >= :since
                    """
                ),
                params,
            )
        ).first()
        library = _rows(
            await session.execute(
                text(
                    """
                    SELECT status, scope, COUNT(*) AS documents, COALESCE(SUM(chunk_count), 0) AS chunks
                      FROM library_documents GROUP BY status, scope
                    """
                )
            )
        )
        spent = await _points_spent(session, ("rag_question", "rag_session"), params["since"])

    docs = {"ready": 0, "processing": 0, "failed": 0, "course": 0, "personal": 0, "chunks": 0}
    for r in library:
        count = int(r["documents"] or 0)
        docs[r["status"]] = docs.get(r["status"], 0) + count
        if r["status"] == "ready":
            docs[r["scope"]] = docs.get(r["scope"], 0) + count
            docs["chunks"] += int(r["chunks"] or 0)
    return {
        "questions": int(totals.questions or 0) if totals else 0,
        "conversations": int(totals.conversations or 0) if totals else 0,
        "askers": int(totals.askers or 0) if totals else 0,
        "per_day": _per_day(per_day),
        **summarize_rag_answers(metas),
        "top_askers": [{"user": _author(r), "questions": int(r["questions"] or 0)} for r in askers],
        "points_spent": spent,
        "usage": {
            "calls": int(usage.calls or 0) if usage else 0,
            "tokens": int(usage.tokens or 0) if usage else 0,
            "search_queries": int(usage.search_queries or 0) if usage else 0,
            "cost_usd": round(float(usage.cost_usd or 0), 6) if usage else 0.0,
            "avg_latency_ms": (
                int(round(float(usage.avg_latency_ms))) if usage and usage.avg_latency_ms is not None else None
            ),
        },
        "library": docs,
    }
