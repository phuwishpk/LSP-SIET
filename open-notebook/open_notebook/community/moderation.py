"""
Moderation (4.3.5): content reports and the admin audit log.

Reports are plain rows that a moderator works through; nothing is hidden
automatically. The audit log is append-only and records every change an
admin - or a room owner acting on a report - makes, so "who removed this and
why" can always be answered.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import text

from open_notebook.domain.user import _mariadb_session

TARGET_TYPES = ("post", "comment", "user", "document")
REASONS = ("spam", "harassment", "inappropriate", "copyright", "other")
REASON_LABELS = {
    "spam": "สแปม / โฆษณา",
    "harassment": "กลั่นแกล้ง / คุกคาม",
    "inappropriate": "เนื้อหาไม่เหมาะสม",
    "copyright": "ละเมิดลิขสิทธิ์",
    "other": "อื่น ๆ",
}
STATUSES = ("open", "dismissed", "actioned")
# What a moderator may do from the queue; the router performs the action and
# records it here so the report shows what happened.
ACTIONS = ("none", "hide_post", "restore_post", "delete_comment", "suspend_user", "delete_document")


class ReportError(Exception):
    """User-fixable problems: unknown target, reporting yourself."""


class DuplicateReport(ReportError):
    """This person already reported this target."""


def _row(r: Any) -> Dict[str, Any]:
    out = {}
    for k, v in dict(r._mapping).items():
        out[k] = v.isoformat() if isinstance(v, datetime) else v
    return out


# ---------------------------------------------------------------------------
# reports
# ---------------------------------------------------------------------------


async def resolve_target(target_type: str, target_id: int) -> Optional[Dict[str, Any]]:
    """
    What is being reported: ``{"owner_id", "room_id", "title"}`` or ``None``
    when it does not exist. The room is remembered so the room's owner can
    see reports about their own room.
    """
    async with _mariadb_session() as session:
        if target_type == "post":
            row = (
                await session.execute(
                    text("SELECT author_id AS owner_id, room_id, COALESCE(title, LEFT(content, 80)) AS title "
                         "FROM posts WHERE id = :id AND is_deleted = 0"),
                    {"id": target_id},
                )
            ).first()
        elif target_type == "comment":
            row = (
                await session.execute(
                    text("SELECT c.author_id AS owner_id, p.room_id, LEFT(c.content, 80) AS title "
                         "FROM post_comments c JOIN posts p ON p.id = c.post_id WHERE c.id = :id"),
                    {"id": target_id},
                )
            ).first()
        elif target_type == "user":
            row = (
                await session.execute(
                    text("SELECT id AS owner_id, NULL AS room_id, COALESCE(display_name, username) AS title "
                         "FROM users WHERE id = :id"),
                    {"id": target_id},
                )
            ).first()
        elif target_type == "document":
            row = (
                await session.execute(
                    text("SELECT owner_id, room_id, title FROM library_documents WHERE id = :id"),
                    {"id": target_id},
                )
            ).first()
        else:
            return None
    return _row(row) if row else None


async def create_report(
    reporter_id: int,
    target_type: str,
    target_id: int,
    reason: str,
    detail: Optional[str] = None,
) -> Dict[str, Any]:
    if target_type not in TARGET_TYPES:
        raise ReportError("ประเภทเป้าหมายไม่ถูกต้อง")
    if reason not in REASONS:
        raise ReportError("เหตุผลไม่ถูกต้อง")
    target = await resolve_target(target_type, int(target_id))
    if not target:
        raise ReportError("ไม่พบสิ่งที่ต้องการรายงาน")
    if int(target.get("owner_id") or 0) == int(reporter_id):
        raise ReportError("รายงานเนื้อหาของตัวเองไม่ได้ — ลบหรือแก้ไขได้เลย")
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT IGNORE INTO content_reports
                    (reporter_id, target_type, target_id, room_id, reason, detail)
                VALUES (:reporter, :ttype, :tid, :room, :reason, :detail)
                """
            ),
            {
                "reporter": reporter_id,
                "ttype": target_type,
                "tid": int(target_id),
                "room": target.get("room_id"),
                "reason": reason,
                "detail": (" ".join((detail or "").split())[:500]) or None,
            },
        )
        if not result.rowcount:
            raise DuplicateReport("คุณรายงานรายการนี้ไปแล้ว ผู้ดูแลกำลังตรวจสอบ")
        report_id = int(result.lastrowid)
    return {"id": report_id, "room_id": target.get("room_id"), "title": target.get("title")}


async def reported_targets(reporter_id: int, target_type: str, ids: Sequence[int]) -> set[int]:
    """Which of these targets this person already reported (for the UI's button state)."""
    clean = [int(i) for i in ids][:200]
    if not clean:
        return set()
    placeholders = ", ".join(f":i{n}" for n in range(len(clean)))
    async with _mariadb_session() as session:
        rows = (
            await session.execute(
                text(
                    f"SELECT target_id FROM content_reports "
                    f"WHERE reporter_id = :uid AND target_type = :ttype AND target_id IN ({placeholders})"
                ),
                {"uid": reporter_id, "ttype": target_type, **{f"i{n}": v for n, v in enumerate(clean)}},
            )
        ).all()
    return {int(r[0]) for r in rows}


_REPORT_SELECT = """
    SELECT r.id, r.reporter_id, r.target_type, r.target_id, r.room_id, r.reason, r.detail,
           r.status, r.action, r.note, r.reviewed_by, r.reviewed_at, r.created_at,
           rep.username AS reporter_username, rep.display_name AS reporter_display_name,
           rev.username AS reviewer_username,
           c.code AS room_code, c.name AS room_name,
           (SELECT COUNT(*) FROM content_reports o
             WHERE o.target_type = r.target_type AND o.target_id = r.target_id) AS report_count,
           CASE r.target_type
             WHEN 'post' THEN (SELECT COALESCE(p.title, LEFT(p.content, 80)) FROM posts p WHERE p.id = r.target_id)
             WHEN 'comment' THEN (SELECT LEFT(pc.content, 80) FROM post_comments pc WHERE pc.id = r.target_id)
             WHEN 'user' THEN (SELECT COALESCE(u.display_name, u.username) FROM users u WHERE u.id = r.target_id)
             WHEN 'document' THEN (SELECT d.title FROM library_documents d WHERE d.id = r.target_id)
           END AS target_title,
           CASE r.target_type
             WHEN 'post' THEN (SELECT p.author_id FROM posts p WHERE p.id = r.target_id)
             WHEN 'comment' THEN (SELECT pc.author_id FROM post_comments pc WHERE pc.id = r.target_id)
             WHEN 'user' THEN r.target_id
             WHEN 'document' THEN (SELECT d.owner_id FROM library_documents d WHERE d.id = r.target_id)
           END AS target_owner_id,
           CASE r.target_type
             WHEN 'post' THEN (SELECT p.is_deleted FROM posts p WHERE p.id = r.target_id)
             WHEN 'comment' THEN (SELECT IF(COUNT(*) = 0, 1, 0) FROM post_comments pc WHERE pc.id = r.target_id)
             WHEN 'user' THEN (SELECT u.disabled FROM users u WHERE u.id = r.target_id)
             WHEN 'document' THEN (SELECT IF(COUNT(*) = 0, 1, 0) FROM library_documents d WHERE d.id = r.target_id)
           END AS target_gone,
           CASE r.target_type
             WHEN 'comment' THEN (SELECT pc.post_id FROM post_comments pc WHERE pc.id = r.target_id)
             WHEN 'post' THEN r.target_id
           END AS post_id
      FROM content_reports r
      JOIN users rep ON rep.id = r.reporter_id
      LEFT JOIN users rev ON rev.id = r.reviewed_by
      LEFT JOIN rooms c ON c.id = r.room_id
"""


def _shape(r: Dict[str, Any]) -> Dict[str, Any]:
    r["report_count"] = int(r.get("report_count") or 0)
    r["target_gone"] = bool(r.get("target_gone"))
    r["reason_label"] = REASON_LABELS.get(str(r.get("reason")), str(r.get("reason")))
    return r


async def list_reports(
    *,
    status: Optional[str] = "open",
    target_type: Optional[str] = None,
    room_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    where: List[str] = []
    params: Dict[str, Any] = {"limit": int(limit), "offset": int(offset)}
    if status and status != "all":
        where.append("r.status = :status")
        params["status"] = status
    if target_type:
        where.append("r.target_type = :ttype")
        params["ttype"] = target_type
    if room_id:
        where.append("r.room_id = :room_id")
        params["room_id"] = int(room_id)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    async with _mariadb_session() as session:
        total = (
            await session.execute(
                text(f"SELECT COUNT(*) FROM content_reports r {clause}"), params
            )
        ).scalar()
        rows = (
            await session.execute(
                text(f"{_REPORT_SELECT} {clause} ORDER BY r.status = 'open' DESC, r.id DESC LIMIT :limit OFFSET :offset"),
                params,
            )
        ).all()
    return {"items": [_shape(_row(r)) for r in rows], "total": int(total or 0), "offset": int(offset)}


async def get_report(report_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (await session.execute(text(f"{_REPORT_SELECT} WHERE r.id = :id"), {"id": report_id})).first()
    return _shape(_row(row)) if row else None


async def resolve_report(
    report_id: int, *, status: str, action: str, reviewer_id: int, note: Optional[str] = None
) -> None:
    if status not in ("dismissed", "actioned"):
        raise ReportError("สถานะต้องเป็น dismissed หรือ actioned")
    if action not in ACTIONS:
        raise ReportError("การดำเนินการไม่ถูกต้อง")
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                UPDATE content_reports
                   SET status = :status, action = :action, note = :note,
                       reviewed_by = :reviewer, reviewed_at = UTC_TIMESTAMP()
                 WHERE id = :id
                """
            ),
            {
                "id": report_id, "status": status, "action": action,
                "note": (" ".join((note or "").split())[:255]) or None, "reviewer": reviewer_id,
            },
        )


async def resolve_sibling_reports(target_type: str, target_id: int, *, status: str, action: str, reviewer_id: int) -> int:
    """Once a target is actioned, every other open report about it is settled too."""
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                UPDATE content_reports
                   SET status = :status, action = :action, reviewed_by = :reviewer, reviewed_at = UTC_TIMESTAMP(),
                       note = COALESCE(note, 'ปิดพร้อมรายงานอื่นของรายการเดียวกัน')
                 WHERE target_type = :ttype AND target_id = :tid AND status = 'open'
                """
            ),
            {"status": status, "action": action, "reviewer": reviewer_id, "ttype": target_type, "tid": int(target_id)},
        )
    return int(result.rowcount or 0)


async def report_stats() -> Dict[str, int]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT SUM(status = 'open') AS open_count,
                           SUM(status = 'actioned') AS actioned,
                           SUM(status = 'dismissed') AS dismissed,
                           SUM(created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY) AS last_7_days
                      FROM content_reports
                    """
                )
            )
        ).first()
    return {k: int(v or 0) for k, v in dict(row._mapping).items()} if row else {}


# ---------------------------------------------------------------------------
# audit log
# ---------------------------------------------------------------------------


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
    *, action: Optional[str] = None, actor_id: Optional[int] = None, limit: int = 50, offset: int = 0
) -> Dict[str, Any]:
    where: List[str] = []
    params: Dict[str, Any] = {"limit": int(limit), "offset": int(offset)}
    if action:
        where.append("a.action LIKE :action")
        params["action"] = action.replace("%", "\\%") + "%"
    if actor_id:
        where.append("a.actor_id = :actor")
        params["actor"] = int(actor_id)
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
