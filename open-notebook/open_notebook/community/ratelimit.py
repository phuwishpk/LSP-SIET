"""
Anti-spam guards for everything that adds content to SIET Space.

Three independent checks, all tunable through ``SPAM_*`` environment variables:

1. **Cooldown** – a minimum gap between two submissions of the same kind, so a
   script cannot fire a hundred posts in a second.
2. **Rolling quota** – a per-hour and per-day ceiling per user.
3. **Duplicate fingerprint** – the same content cannot be submitted twice inside
   a time window (MD5 of the payload, stored in ``content_hash``).

Library uploads matter most: each one spends real money on embeddings, so its
quota is the tightest. Teachers and admins get a higher multiplier because
publishing a whole semester of material in one sitting is legitimate.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Optional

from loguru import logger
from sqlalchemy import text

from open_notebook.domain.user import User, _mariadb_session


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        logger.warning(f"Invalid {name}={raw!r}; using default {default}")
        return default


# Multiplier applied to every quota for teachers/admins.
STAFF_MULTIPLIER = _env_int("SPAM_STAFF_MULTIPLIER", 4)
DUPLICATE_WINDOW_HOURS = _env_int("SPAM_DUPLICATE_WINDOW_HOURS", 24)


@dataclass(frozen=True)
class Limit:
    """One rate-limit policy."""

    table: str
    user_column: str
    cooldown_seconds: int
    per_hour: int
    per_day: int
    label: str
    extra_where: str = ""


LIMITS = {
    "post": Limit(
        table="posts",
        user_column="author_id",
        cooldown_seconds=_env_int("SPAM_POST_COOLDOWN_SECONDS", 20),
        per_hour=_env_int("SPAM_POST_PER_HOUR", 10),
        per_day=_env_int("SPAM_POST_PER_DAY", 40),
        label="โพสต์",
        extra_where=" AND is_deleted = 0",
    ),
    "comment": Limit(
        table="post_comments",
        user_column="author_id",
        cooldown_seconds=_env_int("SPAM_COMMENT_COOLDOWN_SECONDS", 5),
        per_hour=_env_int("SPAM_COMMENT_PER_HOUR", 30),
        per_day=_env_int("SPAM_COMMENT_PER_DAY", 150),
        label="ความคิดเห็น",
    ),
    # Discussion rooms any student may open. Deliberately tight: an abandoned
    # room is far more annoying to clean up than a stray post.
    "room": Limit(
        table="courses",
        user_column="created_by",
        cooldown_seconds=_env_int("SPAM_ROOM_COOLDOWN_SECONDS", 60),
        per_hour=_env_int("SPAM_ROOM_PER_HOUR", 2),
        per_day=_env_int("SPAM_ROOM_PER_DAY", 5),
        label="ห้องพูดคุย",
        extra_where=" AND kind = 'club'",
    ),
    "library": Limit(
        table="library_documents",
        user_column="owner_id",
        cooldown_seconds=_env_int("SPAM_LIBRARY_COOLDOWN_SECONDS", 15),
        per_hour=_env_int("SPAM_LIBRARY_PER_HOUR", 10),
        per_day=_env_int("SPAM_LIBRARY_PER_DAY", 30),
        label="การอัปโหลดเอกสาร",
    ),
}


class RateLimited(Exception):
    """Raised when a user submits too fast or too much."""

    def __init__(self, message: str, retry_after: int = 60):
        self.message = message
        self.retry_after = max(1, int(retry_after))
        super().__init__(message)


class DuplicateContent(Exception):
    """Raised when the exact same content was submitted recently."""

    def __init__(self, message: str, existing_id: Optional[int] = None):
        self.message = message
        self.existing_id = existing_id
        super().__init__(message)


def fingerprint(*parts: object) -> str:
    """Stable MD5 of the meaningful parts of a submission."""
    joined = "␟".join(
        " ".join(str(p or "").split()).lower() for p in parts
    )
    return hashlib.md5(joined.encode("utf-8")).hexdigest()


def _quota(value: int, user: User) -> int:
    if value <= 0:
        return 0
    return value * STAFF_MULTIPLIER if user.is_points_exempt else value


async def check_rate(user: User, action: str) -> None:
    """
    Raise :class:`RateLimited` when this user is submitting too fast/too much.

    Counting reuses the content tables themselves, so there is no extra
    bookkeeping to keep in sync.
    """
    limit = LIMITS.get(action)
    if limit is None or user.id is None:
        return
    uid = int(user.id)
    per_hour = _quota(limit.per_hour, user)
    per_day = _quota(limit.per_day, user)

    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    f"""
                    SELECT
                      COALESCE(TIMESTAMPDIFF(
                        SECOND, MAX(created_at), NOW()
                      ), 999999) AS since_last,
                      SUM(created_at >= NOW() - INTERVAL 1 HOUR) AS last_hour,
                      SUM(created_at >= NOW() - INTERVAL 1 DAY)  AS last_day
                    FROM {limit.table}
                    WHERE {limit.user_column} = :uid{limit.extra_where}
                    """
                ),
                {"uid": uid},
            )
        ).first()

    if not row:
        return
    # NOTE: `row.since_last or default` would be wrong here - a 0-second gap
    # (exactly the spam case) is falsy and would silently pass the cooldown.
    since_last = 999999 if row.since_last is None else int(row.since_last)
    last_hour = 0 if row.last_hour is None else int(row.last_hour)
    last_day = 0 if row.last_day is None else int(row.last_day)

    if limit.cooldown_seconds and since_last < limit.cooldown_seconds:
        wait = limit.cooldown_seconds - since_last
        raise RateLimited(
            f"ช้าลงอีกนิด — รออีก {wait} วินาทีแล้วค่อยส่ง{limit.label}ถัดไป",
            retry_after=wait,
        )
    if per_hour and last_hour >= per_hour:
        raise RateLimited(
            f"คุณส่ง{limit.label}ครบ {per_hour} รายการในหนึ่งชั่วโมงแล้ว ลองใหม่ในอีกสักครู่",
            retry_after=600,
        )
    if per_day and last_day >= per_day:
        raise RateLimited(
            f"คุณส่ง{limit.label}ครบ {per_day} รายการในวันนี้แล้ว พรุ่งนี้ค่อยส่งต่อได้",
            retry_after=3600,
        )


async def check_duplicate_post(author_id: int, content_hash: str) -> None:
    """Reject a post identical to one the same author made recently."""
    if not content_hash:
        return
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id FROM posts
                     WHERE author_id = :uid AND content_hash = :h AND is_deleted = 0
                       AND created_at >= NOW() - INTERVAL :hours HOUR
                     LIMIT 1
                    """
                ),
                {"uid": author_id, "h": content_hash, "hours": DUPLICATE_WINDOW_HOURS},
            )
        ).first()
    if row:
        raise DuplicateContent(
            "คุณโพสต์เนื้อหานี้ไปแล้ว ลองแก้ไขโพสต์เดิมแทนการโพสต์ซ้ำ",
            existing_id=int(row.id),
        )


async def check_duplicate_document(owner_id: int, content_hash: str) -> None:
    """Reject re-uploading a file/link/text that is already in the library."""
    if not content_hash:
        return
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id, title FROM library_documents
                     WHERE owner_id = :uid AND content_hash = :h
                       AND status <> 'failed'
                     LIMIT 1
                    """
                ),
                {"uid": owner_id, "h": content_hash},
            )
        ).first()
    if row:
        raise DuplicateContent(
            f'เอกสารนี้อยู่ในคลังของคุณแล้ว ("{row.title}") ไม่ต้องอัปซ้ำ',
            existing_id=int(row.id),
        )
