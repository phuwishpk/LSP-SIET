"""
Admin audit log (4.3.5): append-only record of every change an admin - or a
room owner acting on a report - makes, so "who removed this and why" can
always be answered. Used by the admin consoles of every SIET package.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from siet_platform.db import _row, _rows
from siet_platform.users import _mariadb_session


# Minimum retention period in days mandated by Thailand Computer Crime Act B.E. 2560 Section 26
LEGAL_MIN_RETENTION_DAYS = 90


def get_retention_days() -> int:
    """Resolve retention policy in days from AUDIT_LOG_RETENTION_DAYS (enforces legal minimum of 90 days)."""
    raw = os.getenv("AUDIT_LOG_RETENTION_DAYS")
    if not raw:
        return LEGAL_MIN_RETENTION_DAYS
    try:
        val = int(raw)
        return max(LEGAL_MIN_RETENTION_DAYS, val)
    except ValueError:
        return LEGAL_MIN_RETENTION_DAYS


async def purge_expired_audit_logs(days: Optional[int] = None) -> int:
    """Purge audit log entries older than retention policy (minimum 90 days per Computer Crime Act).
    Returns count of deleted entries.
    """
    retention = days if days is not None else get_retention_days()
    retention = max(LEGAL_MIN_RETENTION_DAYS, retention)
    try:
        async with _mariadb_session() as session:
            result = await session.execute(
                text("DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL :days DAY"),
                {"days": int(retention)},
            )
            count = result.rowcount or 0
            if count > 0:
                from loguru import logger
                logger.info(f"audit: purged {count} audit records older than {retention} days per retention policy")
            return count
    except Exception as exc:  # noqa: BLE001
        from loguru import logger
        logger.warning(f"audit: retention purge failed: {exc}")
        return 0



async def log_action(
    actor_id: int,
    action: str,
    *,
    target_type: Optional[str] = None,
    target_id: Optional[Any] = None,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """Append one line. Never raises: an audit failure must not undo the action itself."""
    try:
        async with _mariadb_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
                    VALUES (:actor, :action, :ttype, :tid, :detail)
                    """
                ),
                {
                    "actor": int(actor_id),
                    "action": action[:64],
                    "ttype": (target_type or None) and target_type[:32],
                    "tid": None if target_id is None else str(target_id)[:64],
                    "detail": json.dumps(detail, ensure_ascii=False, default=str)[:60000] if detail else None,
                },
            )
    except Exception as exc:  # noqa: BLE001
        from loguru import logger

        logger.warning(f"audit: could not record {action}: {exc}")


async def list_audit(
    *,
    action: Optional[str] = None,
    category: Optional[str] = None,
    actor_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    where: List[str] = []
    params: Dict[str, Any] = {"limit": int(limit), "offset": int(offset)}
    if action:
        where.append("a.action LIKE :action")
        params["action"] = action.replace("%", "\\%") + "%"
    if category:
        category = category.strip().lower()
        if category == "auth":
            where.append("a.action LIKE 'auth.%'")
        elif category == "user":
            where.append("a.action LIKE 'user.%'")
        elif category == "content":
            where.append("(a.action LIKE 'post.%' OR a.action LIKE 'comment.%' OR a.action LIKE 'document.%')")
        elif category == "moderation":
            where.append("(a.action LIKE 'report.%' OR a.action LIKE 'room.report.%')")
        elif category == "course":
            where.append("(a.action LIKE 'room.%' OR a.action LIKE 'category.%')")
        elif category == "ai":
            where.append("(a.action LIKE 'quiz.%' OR a.action LIKE 'roadmap.%')")
    if actor_id:
        where.append("a.actor_id = :actor")
        params["actor"] = int(actor_id)
    if date_from:
        where.append("a.created_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where.append("a.created_at <= :date_to")
        params["date_to"] = date_to
    if query:
        where.append("(a.target_type LIKE :query OR a.target_id LIKE :query OR a.detail LIKE :query)")
        params["query"] = f"%{query.replace('%', '')}%"
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    async with _mariadb_session() as session:
        total = (await session.execute(text(f"SELECT COUNT(*) FROM admin_audit_log a {clause}"), params)).scalar()
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
                           u.username AS actor_username, u.display_name AS actor_display_name, u.role AS actor_role
                      FROM admin_audit_log a
                      LEFT JOIN users u ON u.id = a.actor_id
                      {clause}
                     ORDER BY a.id DESC
                     LIMIT :limit OFFSET :offset
                    """
                ),
                params,
            )
        ).all()
    items = []
    for r in rows:
        d = _row(r)
        try:
            d["detail"] = json.loads(d["detail"]) if d.get("detail") else None
        except (TypeError, ValueError):
            pass
        items.append(d)
    return {"items": items, "total": int(total or 0), "offset": int(offset)}
