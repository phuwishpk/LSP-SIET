"""
In-app notifications: the bell menu of every signed-in user. Community
activity (comments, reactions, shares) and admin actions (suspension) both
write here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import bindparam, text

from siet_platform.db import _row, _rows
from siet_platform.users import _mariadb_session


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


async def add_notification(
    user_id: int,
    kind: str,
    message: str,
    *,
    post_id: Optional[int] = None,
    actor_id: Optional[int] = None,
) -> None:
    if actor_id is not None and actor_id == user_id:
        return  # never notify yourself
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                INSERT INTO notifications (recipient_id, kind, message, post_id, actor_id)
                VALUES (:uid, :kind, :message, :pid, :actor)
                """
            ),
            {
                "uid": user_id,
                "kind": kind[:32],
                "message": message[:255],
                "pid": post_id,
                "actor": actor_id,
            },
        )


async def list_notifications(user_id: int, limit: int = 20) -> Dict[str, Any]:
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT n.id, n.kind, n.message, n.post_id, n.is_read, n.created_at,
                           a.id AS actor_id, a.username AS actor_username,
                           a.display_name AS actor_display_name, a.avatar_url AS actor_avatar_url
                      FROM notifications n
                      LEFT JOIN users a ON a.id = n.actor_id
                     WHERE n.recipient_id = :uid
                     ORDER BY n.id DESC
                     LIMIT :limit
                    """
                ),
                {"uid": user_id, "limit": int(limit)},
            )
        )
        unread = (
            await session.execute(
                text("SELECT COUNT(*) FROM notifications WHERE recipient_id = :uid AND is_read = 0"),
                {"uid": user_id},
            )
        ).scalar()
    items = [
        {
            "id": r["id"],
            "kind": r["kind"],
            "message": r["message"],
            "post_id": r["post_id"],
            "is_read": bool(r["is_read"]),
            "created_at": r["created_at"],
            "actor": (
                {
                    "id": r["actor_id"],
                    "username": r["actor_username"],
                    "display_name": r["actor_display_name"],
                    "avatar_url": r["actor_avatar_url"],
                }
                if r.get("actor_id")
                else None
            ),
        }
        for r in rows
    ]
    return {"items": items, "unread_count": int(unread or 0)}


async def mark_notifications_read(user_id: int, ids: Optional[List[int]] = None) -> None:
    async with _mariadb_session() as session:
        if ids:
            await session.execute(
                text(
                    "UPDATE notifications SET is_read = 1 WHERE recipient_id = :uid AND id IN :ids"
                ).bindparams(bindparam("ids", expanding=True)),
                {"uid": user_id, "ids": [int(i) for i in ids]},
            )
        else:
            await session.execute(
                text("UPDATE notifications SET is_read = 1 WHERE recipient_id = :uid"), {"uid": user_id}
            )
