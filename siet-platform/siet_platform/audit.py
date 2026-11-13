"""
Admin audit log (4.3.5): append-only record of every change an admin - or a
room owner acting on a report - makes, so "who removed this and why" can
always be answered. Used by the admin consoles of every SIET package.

Retention (PR #37): rows older than ``AUDIT_LOG_RETENTION_DAYS`` (default 90,
never less - Computer Crime Act B.E. 2560 s.26 sets 90 days as the minimum)
are purged at startup and on demand. ``AUDIT_LOG_RETENTION_DAYS=0`` keeps the
log forever. Every purge that deletes rows is itself written to the log.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from siet_platform.db import _row, _rows
from siet_platform.users import _mariadb_session


# Minimum retention period in days mandated by Thailand Computer Crime Act B.E. 2560 Section 26
LEGAL_MIN_RETENTION_DAYS = 90
_KEEP_FOREVER = {"0", "off", "never", "forever", "none", "false"}


def get_retention_days() -> Optional[int]:
    """
    Days to keep audit rows, from AUDIT_LOG_RETENTION_DAYS.

    Unset or invalid -> 90 (the legal minimum); 1-89 -> 90; ``0``/``off`` (or any
    value <= 0) -> None, meaning keep forever: the law sets a floor, not a ceiling.
    """
    raw = (os.getenv("AUDIT_LOG_RETENTION_DAYS") or "").strip().lower()
    if not raw:
        return LEGAL_MIN_RETENTION_DAYS
    if raw in _KEEP_FOREVER:
        return None
    try:
        val = int(raw)
    except ValueError:
        return LEGAL_MIN_RETENTION_DAYS
    if val <= 0:
        return None
    return max(LEGAL_MIN_RETENTION_DAYS, val)


def effective_retention_days(days: Optional[int] = None) -> Optional[int]:
    """
    What a purge may delete: never younger than the configured retention (an
    admin cannot cut below what the operator set) nor below 90 days. None when
    the operator chose to keep the log forever.
    """
    configured = get_retention_days()
    if configured is None:
        return None
    return max(configured, int(days or 0), LEGAL_MIN_RETENTION_DAYS)


async def purge_expired_audit_logs(days: Optional[int] = None, *, actor_id: int = 0) -> int:
    """
    Delete audit rows older than the retention period; returns how many.

    Errors propagate: the startup sweep catches and logs them, the admin route
    must not report a failed DELETE as "nothing to purge".
    """
    from loguru import logger

    retention = effective_retention_days(days)
    if retention is None:
        return 0
    async with _mariadb_session() as session:
        result = await session.execute(
            # NOW(): the same clock CURRENT_TIMESTAMP stamped the rows with.
            text("DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL :days DAY"),
            {"days": int(retention)},
        )
        count = int(result.rowcount or 0)
    if count > 0:
        logger.info(f"audit: purged {count} audit records older than {retention} days per retention policy")
    # The purge is an action on the audit log itself: it leaves a trace whenever
    # it deleted something, and always when an admin ran it.
    if count > 0 or actor_id:
        await log_action(
            actor_id=int(actor_id or 0),
            action="audit.purge",
            target_type="audit",
            target_id=None,
            detail={"purged": count, "retention_days": retention},
        )
    return count


def _like_escape(value: str) -> str:
    """Escape LIKE wildcards (MariaDB's default escape character is the backslash)."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def parse_audit_time(value: Optional[str], *, end_of_day: bool = False) -> Optional[datetime]:
    """
    A filter bound as the naive UTC datetime ``created_at`` is stored in.

    Accepts ISO instants (``2026-11-12T17:00:00.000Z``, with or without an
    offset; the admin page sends the viewer's local midnight this way) and, for
    older callers, ``YYYY-MM-DD`` / ``YYYY-MM-DD HH:MM:SS`` taken as UTC.
    Raises ValueError on anything else.
    """
    raw = (value or "").strip()
    if not raw:
        return None
    if len(raw) == 10:
        day = datetime.fromisoformat(raw)
        return day.replace(hour=23, minute=59, second=59) if end_of_day else day
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


# Category -> action patterns. ``room.report.*`` is the room owner handling a
# report, so it belongs to moderation only, not to "rooms and categories".
_CATEGORY_SQL = {
    "auth": "a.action LIKE 'auth.%'",
    "user": "a.action LIKE 'user.%'",
    "content": "(a.action LIKE 'post.%' OR a.action LIKE 'comment.%' OR a.action LIKE 'document.%')",
    "moderation": "(a.action LIKE 'report.%' OR a.action LIKE 'room.report.%')",
    "course": "((a.action LIKE 'room.%' AND a.action NOT LIKE 'room.report.%') OR a.action LIKE 'category.%')",
    "ai": "(a.action LIKE 'quiz.%' OR a.action LIKE 'roadmap.%')",
    "system": "a.action LIKE 'audit.%'",
}


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
        params["action"] = _like_escape(action) + "%"
    if category:
        sql = _CATEGORY_SQL.get(category.strip().lower())
        if sql:
            where.append(sql)
    if actor_id:
        where.append("a.actor_id = :actor")
        params["actor"] = int(actor_id)
    start = parse_audit_time(date_from)
    if start is not None:
        where.append("a.created_at >= :date_from")
        params["date_from"] = start
    end = parse_audit_time(date_to, end_of_day=True)
    if end is not None:
        where.append("a.created_at <= :date_to")
        params["date_to"] = end
    if query:
        where.append(
            "(a.action LIKE :query OR a.target_type LIKE :query OR a.target_id LIKE :query"
            " OR a.detail LIKE :query)"
        )
        params["query"] = f"%{_like_escape(query.strip())}%"
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
