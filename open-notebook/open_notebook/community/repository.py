"""
MariaDB repository for the SIET Space community feed.

Everything here is plain SQL (SQLAlchemy ``text``) on top of the shared async
engine from ``siet_platform.users``. Rows are returned as dictionaries
so the API layer can serialise them straight into Pydantic models.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy import bindparam, text

from siet_platform.users import _mariadb_session

POST_TYPES = ("summary", "quiz", "roadmap", "question", "material")
REACTION_KINDS = ("like", "helpful")

# Rooms come in two flavours: official course rooms (staff only) and
# student-run discussion rooms.
KIND_COURSE = "course"
KIND_CLUB = "club"

# A room is archived rather than deleted by its owner; only an admin purges it.
STATUS_ACTIVE = "active"
STATUS_ARCHIVED = "archived"

# Membership roles. The owner is rooms.created_by, not a row in room_members.
MEMBER_ROLE_MEMBER = "member"
MEMBER_ROLE_TA = "ta"
MEMBER_ROLES = (MEMBER_ROLE_MEMBER, MEMBER_ROLE_TA)

# Who may read a post. A private *room* narrows all of these to its members.
VISIBILITY_PUBLIC = "public"
VISIBILITY_COURSE = "course"
VISIBILITY_PRIVATE = "private"
VISIBILITIES = (VISIBILITY_PUBLIC, VISIBILITY_COURSE, VISIBILITY_PRIVATE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _row(r: Any) -> Dict[str, Any]:
    return {k: _iso(v) for k, v in dict(r._mapping).items()}


def _rows(result: Any) -> List[Dict[str, Any]]:
    return [_row(r) for r in result.all()]


def _like(q: str) -> str:
    """A contains-match where the user's own ``%``/``_`` stay literal."""
    cleaned = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{cleaned}%"


# The MariaDB columns were renamed (see ``schema.RENAMES``) but callers and the
# API still use the older keys, so reads alias the new columns back to them.
# Explicit lists rather than ``*`` so a row never carries both names.
_POST_COLUMNS = """
    p.id, p.author_id, p.room_id AS course_id, p.type, p.title, p.content, p.tags,
    p.attachment_name, p.attachment_path, p.attachment_size, p.attachment_mime,
    p.linked_type AS embed_type, p.linked_id AS embed_id, p.linked_snapshot AS embed_snapshot,
    p.like_count, p.helpful_count, p.comment_count, p.share_count,
    p.quiz_play_count AS play_count,
    p.roadmap_follow_count AS follow_count,
    p.cashback_earned, p.is_deleted, p.content_hash,
    p.visibility,
    p.created_at, p.updated_at
"""

# How "popular" ranks a post; also the keyset the popular cursor pages on.
_POPULARITY = (
    "p.like_count * 2 + p.helpful_count * 3 + p.roadmap_follow_count * 2 "
    "+ p.quiz_play_count + p.comment_count"
)

# One rule for "may this viewer read this post", used by every feed query and
# mirrored in Python by ``post_visible_to`` for the single-post routes.
# Expects the feed aliases: posts p, LEFT JOIN rooms c. Parameters: :viewer,
# :viewer_is_admin (1/0).
_VISIBLE_SQL = """
    (
        :viewer_is_admin = 1
        OR p.author_id = :viewer
        OR (p.visibility = 'public' AND (ISNULL(p.room_id) OR COALESCE(c.is_private, 0) = 0))
        OR (
            p.room_id IS NOT NULL AND p.visibility IN ('public', 'course')
            AND (
                c.created_by = :viewer
                OR EXISTS(SELECT 1 FROM room_members vm
                           WHERE vm.room_id = p.room_id AND vm.user_id = :viewer)
            )
        )
    )
"""


def post_visible_to(
    post: Dict[str, Any],
    viewer_id: int,
    *,
    is_admin: bool = False,
    room: Optional[Dict[str, Any]] = None,
    is_member: bool = False,
) -> bool:
    """
    Python twin of ``_VISIBLE_SQL`` for routes that start from a raw post.
    ``room`` is the post's room (or None) and ``is_member`` whether the viewer
    belongs to it; the caller looks both up.
    """
    if is_admin or int(post.get("author_id") or 0) == int(viewer_id):
        return True
    visibility = post.get("visibility") or VISIBILITY_PUBLIC
    if visibility == VISIBILITY_PRIVATE:
        return False
    room_id = post.get("course_id") or post.get("room_id")
    if not room_id or room is None:
        return visibility == VISIBILITY_PUBLIC
    manages = int(room.get("created_by") or 0) == int(viewer_id)
    if is_member or manages:
        return True
    return visibility == VISIBILITY_PUBLIC and not bool(room.get("is_private"))

_ROOM_COLUMNS = """
    id, code, name, description, kind, created_by, created_at,
    library_notebook_id AS notebook_id,
    category_id, term, join_code, status, archived_at, is_private
"""

# The public shape of a room's category + lifecycle, joined in list queries.
_ROOM_META_COLUMNS = """
    c.category_id, cat.name AS category_name, cat.slug AS category_slug,
    c.term, c.status, c.archived_at, c.is_private,
    (c.join_code IS NOT NULL AND c.join_code <> '') AS requires_code
"""


def _room_meta(r: Dict[str, Any]) -> Dict[str, Any]:
    r["requires_code"] = bool(r.get("requires_code"))
    r["is_private"] = bool(r.get("is_private"))
    r["status"] = r.get("status") or STATUS_ACTIVE
    r["archived"] = r["status"] == STATUS_ARCHIVED
    return r


def _post_public(row: Dict[str, Any], viewer_id: int) -> Dict[str, Any]:
    """Shape a raw ``posts`` row (+joined author) into the API projection."""
    snapshot_raw = row.pop("embed_snapshot", None)
    snapshot: Optional[Dict[str, Any]] = None
    if snapshot_raw:
        try:
            snapshot = json.loads(snapshot_raw)
        except (TypeError, ValueError):
            snapshot = None

    is_author = int(row.get("author_id") or 0) == int(viewer_id)
    embed: Optional[Dict[str, Any]] = None
    if row.get("embed_type") and snapshot is not None:
        if row["embed_type"] == "quiz":
            questions = snapshot.get("questions") or []
            public_questions = []
            for q in questions:
                entry = {
                    "id": q.get("id"),
                    "question": q.get("question"),
                    "options": [o.get("text") if isinstance(o, dict) else o for o in (q.get("options") or [])],
                }
                if is_author:
                    entry["correct_answer"] = q.get("correct_answer")
                    entry["explanation"] = q.get("explanation")
                public_questions.append(entry)
            embed = {
                "type": "quiz",
                "id": row.get("embed_id"),
                "topic": snapshot.get("topic"),
                "language": snapshot.get("language"),
                "question_count": len(questions),
                "questions": public_questions,
            }
        elif row["embed_type"] == "roadmap":
            embed = {
                "type": "roadmap",
                "id": row.get("embed_id"),
                "title": snapshot.get("title"),
                "description": snapshot.get("description"),
                "nodes": snapshot.get("nodes") or [],
                "edges": snapshot.get("edges") or [],
                "grounding": snapshot.get("grounding"),
            }

    author = {
        "id": row.pop("author_id"),
        "username": row.pop("author_username", None),
        "display_name": row.pop("author_display_name", None),
        "avatar_url": row.pop("author_avatar_url", None),
        "role": row.pop("author_role", None),
    }
    course = None
    course_code = row.pop("course_code", None)
    course_name = row.pop("course_name", None)
    course_kind = row.pop("course_kind", None)
    room_is_private = bool(row.pop("room_is_private", 0))
    if row.get("course_id"):
        course = {
            "id": row["course_id"],
            "code": course_code,
            "name": course_name,
            "kind": course_kind or KIND_COURSE,
            "is_private": room_is_private,
        }

    tags_raw = row.get("tags") or ""
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

    return {
        "id": row["id"],
        "type": row["type"],
        "title": row.get("title"),
        "content": row.get("content"),
        "tags": tags,
        "course": course,
        "visibility": row.get("visibility") or VISIBILITY_PUBLIC,
        "author": author,
        "is_author": is_author,
        "attachment": (
            {
                "name": row.get("attachment_name"),
                "size": row.get("attachment_size"),
                "mime": row.get("attachment_mime"),
            }
            if row.get("attachment_name")
            else None
        ),
        "embed": embed,
        "counts": {
            "like": int(row.get("like_count") or 0),
            "helpful": int(row.get("helpful_count") or 0),
            "comment": int(row.get("comment_count") or 0),
            "share": int(row.get("share_count") or 0),
            "play": int(row.get("play_count") or 0),
            "follow": int(row.get("follow_count") or 0),
            "cashback": int(row.get("cashback_earned") or 0),
        },
        "viewer": {
            "liked": bool(row.get("liked")),
            "helpful": bool(row.get("marked_helpful")),
            "saved": bool(row.get("saved")),
            "shared": bool(row.get("shared")),
            "plays": int(row.get("my_plays") or 0),
            "completed_plays": int(row.get("my_completed_plays") or 0),
            "imported": bool(row.get("my_imported")),
        },
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


_POST_SELECT = f"""
    SELECT {_POST_COLUMNS},
           u.username     AS author_username,
           u.display_name AS author_display_name,
           u.avatar_url   AS author_avatar_url,
           u.role         AS author_role,
           c.code         AS course_code,
           c.name         AS course_name,
           c.kind         AS course_kind,
           c.is_private   AS room_is_private,
           EXISTS(SELECT 1 FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = :viewer AND r.kind = 'like')    AS liked,
           EXISTS(SELECT 1 FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = :viewer AND r.kind = 'helpful') AS marked_helpful,
           EXISTS(SELECT 1 FROM saved_posts s WHERE s.post_id = p.id AND s.user_id = :viewer) AS saved,
           EXISTS(SELECT 1 FROM post_shares ps WHERE ps.post_id = p.id AND ps.user_id = :viewer) AS shared,
           (SELECT COUNT(*) FROM quiz_attempts q WHERE q.post_id = p.id AND q.user_id = :viewer)                   AS my_plays,
           (SELECT COUNT(*) FROM quiz_attempts q WHERE q.post_id = p.id AND q.user_id = :viewer AND q.completed = 1) AS my_completed_plays,
           EXISTS(SELECT 1 FROM point_transactions t WHERE t.user_id = :viewer AND t.kind = 'quiz_import' AND t.ref_type = 'post' AND t.ref_id = CAST(p.id AS CHAR)) AS my_imported
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN rooms c ON c.id = p.room_id
"""


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------


async def list_courses(
    user_id: int,
    *,
    include_archived: bool = False,
    category_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Rooms as the sidebar and pickers see them. Archived rooms are left out
    unless asked for; their posts still show in the feed, they just stop
    being somewhere to join or post into.
    """
    where = ["1 = 1"] if include_archived else ["c.status = 'active'"]
    params: Dict[str, Any] = {"uid": user_id}
    if category_id:
        where.append("c.category_id = :category_id")
        params["category_id"] = int(category_id)
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                f"""
                SELECT c.id, c.code, c.name, c.description, c.kind,
                       c.created_by, c.created_at,
                       {_ROOM_META_COLUMNS},
                       COALESCE(instructor.display_name, instructor.username) AS instructor_name,
                       (SELECT COUNT(*) FROM room_members m WHERE m.room_id = c.id) AS member_count,
                       (SELECT COUNT(*) FROM posts p WHERE p.room_id = c.id AND p.is_deleted = 0) AS post_count,
                       EXISTS(SELECT 1 FROM room_members m WHERE m.room_id = c.id AND m.user_id = :uid) AS joined,
                       (SELECT m.role FROM room_members m
                         WHERE m.room_id = c.id AND m.user_id = :uid) AS membership_role
                  FROM rooms c
                  LEFT JOIN users instructor ON instructor.id = c.created_by
                  LEFT JOIN categories cat ON cat.id = c.category_id
                 WHERE {' AND '.join(where)}
                 ORDER BY c.kind ASC, c.code ASC
                """
            ),
            params,
        )
        rows = _rows(result)
    for r in rows:
        r["joined"] = bool(r.get("joined"))
        r["member_count"] = int(r.get("member_count") or 0)
        r["post_count"] = int(r.get("post_count") or 0)
        r["kind"] = r.get("kind") or KIND_COURSE
        _room_meta(r)
    return rows


async def get_course(course_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(f"SELECT {_ROOM_COLUMNS} FROM rooms WHERE id = :id"), {"id": course_id}
            )
        ).first()
    return _row(row) if row else None


async def create_course(
    code: str,
    name: str,
    description: Optional[str],
    created_by: int,
    kind: str = KIND_COURSE,
    *,
    category_id: Optional[int] = None,
    term: Optional[str] = None,
    join_code: Optional[str] = None,
    is_private: bool = False,
) -> Dict[str, Any]:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO rooms (code, name, description, created_by, kind,
                                   category_id, term, join_code, is_private)
                VALUES (:code, :name, :description, :created_by, :kind,
                        :category_id, :term, :join_code, :is_private)
                """
            ),
            {
                "code": code.strip().upper()[:32],
                "name": name.strip()[:128],
                "description": (description or "").strip()[:255] or None,
                "created_by": created_by,
                "kind": kind if kind in (KIND_COURSE, KIND_CLUB) else KIND_COURSE,
                "category_id": int(category_id) if category_id else None,
                "term": _clean_term(term),
                "join_code": _clean_join_code(join_code),
                "is_private": 1 if is_private else 0,
            },
        )
        course_id = int(result.lastrowid)
        await session.execute(
            text(
                "INSERT IGNORE INTO room_members (room_id, user_id) VALUES (:cid, :uid)"
            ),
            {"cid": course_id, "uid": created_by},
        )
    course = await get_course(course_id)
    assert course is not None
    return course


async def ensure_course(
    code: str,
    name: str,
    description: Optional[str] = None,
    *,
    category_id: Optional[int] = None,
    term: Optional[str] = None,
) -> None:
    """
    Seed helper – insert the course only if the code is not taken. A room that
    already exists only gains a category/term it did not have; nothing a
    teacher typed is overwritten.
    """
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                INSERT IGNORE INTO rooms (code, name, description, category_id, term)
                VALUES (:code, :name, :description, :category_id, :term)
                """
            ),
            {
                "code": code,
                "name": name,
                "description": description,
                "category_id": category_id,
                "term": _clean_term(term),
            },
        )
        if category_id or term:
            await session.execute(
                text(
                    """
                    UPDATE rooms
                       SET category_id = COALESCE(category_id, :category_id),
                           term        = COALESCE(term, :term)
                     WHERE code = :code
                    """
                ),
                {"code": code, "category_id": category_id, "term": _clean_term(term)},
            )


async def update_course(
    course_id: int,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    code: Optional[str] = None,
    category_id: Optional[int] = None,
    term: Optional[str] = None,
    join_code: Optional[str] = None,
    is_private: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    """
    Rename / re-code a room. Only the fields that are passed are touched;
    ``category_id=0``, ``term=""`` and ``join_code=""`` clear the value.
    """
    sets: List[str] = []
    values: Dict[str, Any] = {"cid": course_id}
    if name is not None:
        sets.append("name = :name")
        values["name"] = name.strip()[:128]
    if description is not None:
        sets.append("description = :description")
        values["description"] = description.strip()[:255] or None
    if code is not None:
        sets.append("code = :code")
        values["code"] = code.strip().upper()[:32]
    if category_id is not None:
        sets.append("category_id = :category_id")
        values["category_id"] = int(category_id) or None
    if term is not None:
        sets.append("term = :term")
        values["term"] = _clean_term(term)
    if join_code is not None:
        sets.append("join_code = :join_code")
        values["join_code"] = _clean_join_code(join_code)
    if is_private is not None:
        sets.append("is_private = :is_private")
        values["is_private"] = 1 if is_private else 0
    if not sets:
        return await get_course(course_id)
    async with _mariadb_session() as session:
        await session.execute(
            text(f"UPDATE rooms SET {', '.join(sets)} WHERE id = :cid"), values
        )
    return await get_course(course_id)


async def courses_owned_by(user_id: int) -> List[Dict[str, Any]]:
    """
    Rooms this person created or assists in (TA), with the numbers a teacher
    actually wants. Archived rooms are included so they can be restored.
    """
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT c.id, c.code, c.name, c.description, c.kind, c.created_at,
                           {_ROOM_META_COLUMNS},
                           (SELECT COUNT(*) FROM room_members m
                             WHERE m.room_id = c.id) AS member_count,
                           (SELECT COUNT(*) FROM posts p
                             WHERE p.room_id = c.id AND p.is_deleted = 0) AS post_count,
                           (SELECT COUNT(*) FROM library_documents d
                             WHERE d.room_id = c.id AND d.scope = 'course') AS document_count
                      FROM rooms c
                      LEFT JOIN categories cat ON cat.id = c.category_id
                     WHERE c.created_by = :uid
                        OR EXISTS(SELECT 1 FROM room_members m
                                   WHERE m.room_id = c.id AND m.user_id = :uid AND m.role = 'ta')
                     ORDER BY c.status ASC, c.kind ASC, c.code ASC
                    """
                ),
                {"uid": user_id},
            )
        )
    for r in rows:
        for key in ("member_count", "post_count", "document_count"):
            r[key] = int(r.get(key) or 0)
        _room_meta(r)
    return rows


async def quiz_results_for_teacher(
    user_id: int,
    *,
    course_id: Optional[int] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Every attempt at a quiz that belongs to this teacher: quizzes posted into a
    room they created, plus quizzes they posted themselves.
    """
    where = [
        "(c.created_by = :uid OR p.author_id = :uid)",
        "p.is_deleted = 0",
    ]
    params: Dict[str, Any] = {"uid": user_id, "limit": int(limit)}
    if course_id:
        where.append("p.room_id = :cid")
        params["cid"] = int(course_id)
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT q.id, q.post_id, q.score, q.question_count AS total, q.completed,
                           q.created_at, q.completed_at,
                           p.title        AS post_title,
                           p.room_id      AS course_id,
                           c.code         AS course_code,
                           c.name         AS course_name,
                           u.id           AS student_id,
                           u.username     AS student_username,
                           u.display_name AS student_display_name,
                           u.student_code AS student_code
                      FROM quiz_attempts q
                      JOIN posts p ON p.id = q.post_id
                      JOIN users u ON u.id = q.user_id
                      LEFT JOIN rooms c ON c.id = p.room_id
                     WHERE {' AND '.join(where)}
                     ORDER BY q.id DESC
                     LIMIT :limit
                    """
                ),
                params,
            )
        )
    for r in rows:
        r["completed"] = bool(r.get("completed"))
    return rows


async def find_room_by_name(name: str, kind: str = KIND_CLUB) -> Optional[Dict[str, Any]]:
    """Look up a room by its (case-insensitive, whitespace-collapsed) name."""
    needle = " ".join((name or "").split())
    if not needle:
        return None
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    f"""
                    SELECT {_ROOM_COLUMNS} FROM rooms
                     WHERE kind = :kind AND LOWER(name) = LOWER(:name)
                     LIMIT 1
                    """
                ),
                {"kind": kind, "name": needle},
            )
        ).first()
    return _row(row) if row else None


async def delete_course(course_id: int) -> None:
    """
    Remove a room for good (admin only - owners archive instead). Posts are
    *detached*, not deleted: nobody should be able to wipe out other people's
    work by closing a room. Library rows are swept here as a last resort; the
    caller (``library.purge_course_library``) has already removed their files,
    SurrealDB sources and embeddings.
    """
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE posts SET room_id = NULL WHERE room_id = :cid"),
            {"cid": course_id},
        )
        await session.execute(
            text("DELETE FROM library_documents WHERE room_id = :cid AND scope = 'course'"),
            {"cid": course_id},
        )
        await session.execute(
            text("DELETE FROM room_members WHERE room_id = :cid"), {"cid": course_id}
        )
        await session.execute(text("DELETE FROM rooms WHERE id = :cid"), {"cid": course_id})


async def set_course_status(course_id: int, archived: bool) -> None:
    """Archive (or restore) a room. Archiving keeps every row; see list_courses."""
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                UPDATE rooms
                   SET status = :status,
                       archived_at = CASE WHEN :archived THEN UTC_TIMESTAMP() ELSE NULL END
                 WHERE id = :cid
                """
            ),
            {
                "cid": course_id,
                "status": STATUS_ARCHIVED if archived else STATUS_ACTIVE,
                "archived": 1 if archived else 0,
            },
        )


async def set_course_membership(
    course_id: int, user_id: int, joined: bool, role: str = MEMBER_ROLE_MEMBER
) -> None:
    async with _mariadb_session() as session:
        if joined:
            await session.execute(
                text(
                    "INSERT IGNORE INTO room_members (room_id, user_id, role) "
                    "VALUES (:cid, :uid, :role)"
                ),
                {
                    "cid": course_id,
                    "uid": user_id,
                    "role": role if role in MEMBER_ROLES else MEMBER_ROLE_MEMBER,
                },
            )
        else:
            await session.execute(
                text("DELETE FROM room_members WHERE room_id = :cid AND user_id = :uid"),
                {"cid": course_id, "uid": user_id},
            )


async def member_role(course_id: int, user_id: int) -> Optional[str]:
    """``'member'`` / ``'ta'`` for a member of the room, ``None`` for anyone else."""
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT role FROM room_members WHERE room_id = :cid AND user_id = :uid"),
                {"cid": course_id, "uid": user_id},
            )
        ).first()
    return str(row[0]) if row else None


async def set_member_role(course_id: int, user_id: int, role: str) -> bool:
    if role not in MEMBER_ROLES:
        raise ValueError(f"unknown member role {role!r}")
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                "UPDATE room_members SET role = :role "
                "WHERE room_id = :cid AND user_id = :uid"
            ),
            {"cid": course_id, "uid": user_id, "role": role},
        )
    return bool(result.rowcount)


async def list_course_members(course_id: int) -> List[Dict[str, Any]]:
    """Everyone in the room, assistants first. For the room's managers only."""
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT m.user_id, m.role, m.joined_at,
                           u.username, u.display_name, u.avatar_url,
                           u.role AS user_role, u.student_code,
                           (SELECT COUNT(*) FROM posts p
                             WHERE p.room_id = m.room_id AND p.author_id = m.user_id
                               AND p.is_deleted = 0) AS post_count
                      FROM room_members m
                      JOIN users u ON u.id = m.user_id
                     WHERE m.room_id = :cid
                     ORDER BY FIELD(m.role, 'ta', 'member'), m.joined_at ASC
                    """
                ),
                {"cid": course_id},
            )
        )
    for r in rows:
        r["post_count"] = int(r.get("post_count") or 0)
    return rows


def _clean_term(term: Optional[str]) -> Optional[str]:
    """An academic term such as ``1/2569``; whitespace only means "not set"."""
    cleaned = " ".join((term or "").split())[:16]
    return cleaned or None


def _clean_join_code(code: Optional[str]) -> Optional[str]:
    """Join codes compare case-insensitively, so store them upper-cased."""
    cleaned = "".join((code or "").split()).upper()[:32]
    return cleaned or None


def join_code_matches(room: Dict[str, Any], given: Optional[str]) -> bool:
    expected = _clean_join_code(room.get("join_code"))
    return expected is None or _clean_join_code(given) == expected


# ---------------------------------------------------------------------------
# Categories (ภาควิชา / สาขา / หมวดทั่วไป) - one flat level for course rooms
# ---------------------------------------------------------------------------


async def list_categories() -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT cat.id, cat.slug, cat.name, cat.name_en, cat.sort_order, cat.created_at,
                           (SELECT COUNT(*) FROM rooms c
                             WHERE c.category_id = cat.id AND c.status = 'active') AS course_count,
                           (SELECT COUNT(*) FROM rooms c
                             WHERE c.category_id = cat.id AND c.status = 'archived') AS archived_count
                      FROM categories cat
                     ORDER BY cat.sort_order ASC, cat.name ASC
                    """
                )
            )
        )
    for r in rows:
        r["course_count"] = int(r.get("course_count") or 0)
        r["archived_count"] = int(r.get("archived_count") or 0)
    return rows


async def get_category(category_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT id, slug, name, name_en, sort_order, created_at FROM categories WHERE id = :id"),
                {"id": category_id},
            )
        ).first()
    return _row(row) if row else None


async def find_category_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT id, slug, name, name_en, sort_order, created_at FROM categories WHERE slug = :slug"),
                {"slug": (slug or "").strip().lower()[:64]},
            )
        ).first()
    return _row(row) if row else None


async def create_category(
    slug: str, name: str, name_en: Optional[str] = None, sort_order: int = 0
) -> Dict[str, Any]:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO categories (slug, name, name_en, sort_order)
                VALUES (:slug, :name, :name_en, :sort_order)
                """
            ),
            {
                "slug": slug.strip().lower()[:64],
                "name": " ".join(name.split())[:128],
                "name_en": (" ".join((name_en or "").split())[:128]) or None,
                "sort_order": int(sort_order or 0),
            },
        )
        category_id = int(result.lastrowid)
    category = await get_category(category_id)
    assert category is not None
    return category


async def ensure_category(
    slug: str, name: str, name_en: Optional[str] = None, sort_order: int = 0
) -> int:
    """Seed helper - create the category if the slug is new; return its id."""
    existing = await find_category_by_slug(slug)
    if existing:
        return int(existing["id"])
    return int((await create_category(slug, name, name_en, sort_order))["id"])


async def update_category(
    category_id: int,
    *,
    name: Optional[str] = None,
    name_en: Optional[str] = None,
    sort_order: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    sets: List[str] = []
    values: Dict[str, Any] = {"id": category_id}
    if name is not None:
        sets.append("name = :name")
        values["name"] = " ".join(name.split())[:128]
    if name_en is not None:
        sets.append("name_en = :name_en")
        values["name_en"] = (" ".join(name_en.split())[:128]) or None
    if sort_order is not None:
        sets.append("sort_order = :sort_order")
        values["sort_order"] = int(sort_order)
    if sets:
        async with _mariadb_session() as session:
            await session.execute(
                text(f"UPDATE categories SET {', '.join(sets)} WHERE id = :id"), values
            )
    return await get_category(category_id)


async def delete_category(category_id: int) -> int:
    """Drop a category; its rooms become uncategorised. Returns rooms touched."""
    async with _mariadb_session() as session:
        moved = await session.execute(
            text("UPDATE rooms SET category_id = NULL WHERE category_id = :id"),
            {"id": category_id},
        )
        await session.execute(text("DELETE FROM categories WHERE id = :id"), {"id": category_id})
    return int(moved.rowcount or 0)


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


async def create_post(
    *,
    author_id: int,
    post_type: str,
    title: Optional[str],
    content: Optional[str],
    course_id: Optional[int],
    tags: Sequence[str],
    embed_type: Optional[str] = None,
    embed_id: Optional[str] = None,
    embed_snapshot: Optional[Dict[str, Any]] = None,
    attachment: Optional[Dict[str, Any]] = None,
    content_hash: Optional[str] = None,
    visibility: str = VISIBILITY_PUBLIC,
) -> int:
    if post_type not in POST_TYPES:
        raise ValueError(f"invalid post type {post_type}")
    if visibility not in VISIBILITIES:
        raise ValueError(f"invalid visibility {visibility}")
    attachment = attachment or {}
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO posts
                    (author_id, room_id, type, title, content, tags,
                     attachment_name, attachment_path, attachment_size, attachment_mime,
                     linked_type, linked_id, linked_snapshot, content_hash, visibility)
                VALUES
                    (:author_id, :course_id, :type, :title, :content, :tags,
                     :att_name, :att_path, :att_size, :att_mime,
                     :embed_type, :embed_id, :embed_snapshot, :content_hash, :visibility)
                """
            ),
            {
                "author_id": author_id,
                "course_id": course_id,
                "type": post_type,
                "title": (title or "").strip()[:200] or None,
                "content": (content or "").strip() or None,
                "tags": ",".join(t.strip()[:40] for t in tags if t.strip())[:255] or None,
                "att_name": attachment.get("name"),
                "att_path": attachment.get("path"),
                "att_size": attachment.get("size"),
                "att_mime": attachment.get("mime"),
                "embed_type": embed_type,
                "embed_id": embed_id,
                "embed_snapshot": json.dumps(embed_snapshot, ensure_ascii=False) if embed_snapshot else None,
                "content_hash": content_hash,
                "visibility": visibility,
            },
        )
        return int(result.lastrowid)


async def list_posts(
    viewer_id: int,
    *,
    course_id: Optional[int] = None,
    post_type: Optional[str] = None,
    author_id: Optional[int] = None,
    query: Optional[str] = None,
    saved_only: bool = False,
    saved_collection_id: Optional[int] = None,
    my_courses_only: bool = False,
    profile_visibility_only: bool = False,
    embed_types: Optional[Iterable[str]] = None,
    before_id: Optional[int] = None,
    limit: int = 20,
    order: str = "newest",
    viewer_is_admin: bool = False,
    tag: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    author_username: Optional[str] = None,
    category_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    # Visibility first: nothing below widens what the viewer may read.
    where = ["p.is_deleted = 0", _VISIBLE_SQL]
    params: Dict[str, Any] = {
        "viewer": viewer_id,
        "viewer_is_admin": 1 if viewer_is_admin else 0,
        "limit": max(1, min(int(limit), 100)),
    }
    if tag:
        # tags are stored comma-separated; match a whole tag, not a substring
        where.append("CONCAT(',', REPLACE(IFNULL(p.tags, ''), ' ', ''), ',') LIKE :tag")
        params["tag"] = f"%,{tag.strip().lstrip('#')},%"
    if since is not None:
        where.append("p.created_at >= :since")
        params["since"] = since
    if until is not None:
        where.append("p.created_at < :until")
        params["until"] = until
    if author_username:
        where.append("u.username = :author_username")
        params["author_username"] = author_username.strip().lstrip("@").lower()
    if category_id:
        where.append("c.category_id = :category_id")
        params["category_id"] = int(category_id)
    if course_id:
        where.append("p.room_id = :course_id")
        params["course_id"] = course_id
    if post_type:
        where.append("p.type = :ptype")
        params["ptype"] = post_type
    if author_id:
        where.append("p.author_id = :author_id")
        params["author_id"] = author_id
    if profile_visibility_only:
        if not author_id:
            where.append("1 = 0")
        elif author_id != viewer_id:
            where.append(
                """
                (
                    p.room_id IS NULL
                    OR EXISTS (
                        SELECT 1
                          FROM room_members viewer_members
                          JOIN room_members author_members
                            ON author_members.room_id = viewer_members.room_id
                         WHERE viewer_members.room_id = p.room_id
                           AND viewer_members.user_id = :viewer
                           AND author_members.user_id = :author_id
                    )
                )
                """
            )
    if query:
        where.append("(p.title LIKE :q OR p.content LIKE :q OR p.tags LIKE :q OR u.display_name LIKE :q OR u.username LIKE :q)")
        params["q"] = _like(query)
    if saved_only:
        where.append("EXISTS(SELECT 1 FROM saved_posts s2 WHERE s2.post_id = p.id AND s2.user_id = :viewer)")
    if saved_collection_id is not None:
        where.append(
            """
            EXISTS(
                SELECT 1 FROM saved_collection_posts scp
                JOIN saved_collections sc ON sc.id = scp.collection_id
                WHERE scp.post_id = p.id
                  AND scp.collection_id = :saved_collection_id
                  AND sc.user_id = :viewer
                  AND scp.user_id = :viewer
            )
            """
        )
        params["saved_collection_id"] = saved_collection_id
    if my_courses_only:
        where.append("p.room_id IN (SELECT m.room_id FROM room_members m WHERE m.user_id = :viewer)")
    if embed_types:
        types = [t for t in embed_types if t in ("quiz", "roadmap")]
        if types:
            where.append("p.linked_type IN (" + ",".join(f"'{t}'" for t in types) + ")")
    if before_id and order == "popular":
        # Keyset cursor on (score, id): the id alone would skip and repeat
        # pages because popular order is not id order. The cursor row's own
        # score is looked up so the client keeps passing just the last id.
        where.append(
            f"""
            (
                ({_POPULARITY}) < (SELECT {_POPULARITY.replace('p.', 'cur.')} FROM posts cur WHERE cur.id = :before_id)
                OR (({_POPULARITY}) = (SELECT {_POPULARITY.replace('p.', 'cur.')} FROM posts cur WHERE cur.id = :before_id)
                    AND p.id < :before_id)
            )
            """
        )
        params["before_id"] = int(before_id)
    elif before_id:
        where.append("p.id < :before_id")
        params["before_id"] = int(before_id)

    if order == "popular":
        order_by = f"({_POPULARITY}) DESC, p.id DESC"
    elif saved_only:
        order_by = (
            "(SELECT s.created_at FROM saved_posts s "
            "WHERE s.post_id = p.id AND s.user_id = :viewer) DESC, p.id DESC"
        )
    else:
        order_by = "p.id DESC"

    sql = _POST_SELECT + " WHERE " + " AND ".join(where) + f" ORDER BY {order_by} LIMIT :limit"
    async with _mariadb_session() as session:
        rows = _rows(await session.execute(text(sql), params))
    return [_post_public(r, viewer_id) for r in rows]


async def get_post(
    post_id: int, viewer_id: int, *, viewer_is_admin: bool = False
) -> Optional[Dict[str, Any]]:
    """One post as the viewer may see it - ``None`` when hidden from them too."""
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(_POST_SELECT + " WHERE p.id = :pid AND p.is_deleted = 0 AND " + _VISIBLE_SQL),
                {"pid": post_id, "viewer": viewer_id, "viewer_is_admin": 1 if viewer_is_admin else 0},
            )
        ).first()
    return _post_public(_row(row), viewer_id) if row else None


async def get_post_raw(post_id: int) -> Optional[Dict[str, Any]]:
    """Full row including the private embed snapshot (server-side use only)."""
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(f"SELECT {_POST_COLUMNS} FROM posts p WHERE p.id = :pid AND p.is_deleted = 0"),
                {"pid": post_id},
            )
        ).first()
    if not row:
        return None
    data = _row(row)
    raw = data.get("embed_snapshot")
    if raw:
        try:
            data["embed_snapshot"] = json.loads(raw)
        except (TypeError, ValueError):
            data["embed_snapshot"] = None
    return data


async def update_post(
    post_id: int,
    *,
    title: Optional[str] = None,
    content: Optional[str] = None,
    tags: Optional[Sequence[str]] = None,
    course_id: Optional[int] = None,
    clear_course: bool = False,
    visibility: Optional[str] = None,
) -> None:
    """Edit the text fields of a post. Embeds and attachments are untouched."""
    values: Dict[str, Any] = {"pid": post_id}
    sets: List[str] = []
    if visibility is not None:
        if visibility not in VISIBILITIES:
            raise ValueError(f"invalid visibility {visibility}")
        sets.append("visibility = :visibility")
        values["visibility"] = visibility
    if title is not None:
        sets.append("title = :title")
        values["title"] = title.strip()[:200] or None
    if content is not None:
        sets.append("content = :content")
        values["content"] = content.strip() or None
    if title is not None or content is not None:
        from siet_platform.ratelimit import fingerprint

        sets.append("content_hash = :content_hash")
        values["content_hash"] = fingerprint(title or "", content or "")
    if tags is not None:
        sets.append("tags = :tags")
        values["tags"] = ",".join(t.strip()[:40] for t in tags if t.strip())[:255] or None
    if clear_course:
        sets.append("room_id = NULL")
    elif course_id is not None:
        sets.append("room_id = :course_id")
        values["course_id"] = course_id
    if not sets:
        return
    async with _mariadb_session() as session:
        await session.execute(
            text(f"UPDATE posts SET {', '.join(sets)} WHERE id = :pid"), values
        )


async def roadmap_posts_for_author(author_id: int, session_ids: Sequence[str]) -> Dict[str, int]:
    """
    ``{roadmap session id: post id}`` for the visible posts this author made
    from those sessions. One roadmap is shared at most once, so this is what
    tells the roadmap app to show "view post" instead of "share".
    """
    ids = [str(s) for s in session_ids if s]
    if not ids:
        return {}
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT linked_id, MAX(id) AS post_id
                      FROM posts
                     WHERE author_id = :uid AND linked_type = 'roadmap'
                       AND is_deleted = 0 AND linked_id IN :ids
                     GROUP BY linked_id
                    """
                ).bindparams(bindparam("ids", expanding=True)),
                {"uid": author_id, "ids": ids},
            )
        )
    return {str(r["linked_id"]): int(r["post_id"]) for r in rows}


async def roadmap_posts_by_session(session_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    """``{roadmap session id: {post_id, is_deleted, follow_count}}`` whoever the author is."""
    ids = [str(s) for s in session_ids if s]
    if not ids:
        return {}
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT linked_id, id AS post_id, is_deleted, roadmap_follow_count
                      FROM posts
                     WHERE linked_type = 'roadmap' AND linked_id IN :ids
                     ORDER BY id ASC
                    """
                ).bindparams(bindparam("ids", expanding=True)),
                {"ids": ids},
            )
        )
    # A re-share after the first post was deleted: the newest row wins.
    return {
        str(r["linked_id"]): {
            "post_id": int(r["post_id"]),
            "is_deleted": bool(r["is_deleted"]),
            "follow_count": int(r["roadmap_follow_count"] or 0),
        }
        for r in rows
    }


async def admin_roadmap_posts(*, state: str = "visible", limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """Roadmap posts for moderation: author, room, counters and the size of the plan."""
    where = ["p.linked_type = 'roadmap'"]
    if state == "visible":
        where.append("p.is_deleted = 0")
    elif state == "deleted":
        where.append("p.is_deleted = 1")
    clause = " AND ".join(where)
    params = {"limit": int(limit), "offset": int(offset)}
    async with _mariadb_session() as session:
        total = (await session.execute(text(f"SELECT COUNT(*) FROM posts p WHERE {clause}"))).scalar()
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT p.id, p.title, p.is_deleted, p.created_at, p.linked_id, p.linked_snapshot,
                           p.like_count, p.helpful_count, p.comment_count, p.share_count,
                           p.roadmap_follow_count,
                           u.id AS author_id, u.username AS author_username,
                           u.display_name AS author_display_name, u.role AS author_role,
                           c.id AS room_id, c.code AS room_code, c.name AS room_name
                      FROM posts p
                      JOIN users u ON u.id = p.author_id
                      LEFT JOIN rooms c ON c.id = p.room_id
                     WHERE {clause}
                     ORDER BY p.roadmap_follow_count DESC, p.id DESC
                     LIMIT :limit OFFSET :offset
                    """
                ),
                params,
            )
        )
    items = []
    for r in rows:
        try:
            snapshot = json.loads(r.get("linked_snapshot") or "{}")
        except (TypeError, ValueError):
            snapshot = {}
        nodes = snapshot.get("nodes") or []
        items.append(
            {
                "id": r["id"],
                "title": r.get("title") or snapshot.get("title"),
                "session_id": r.get("linked_id"),
                "is_deleted": bool(r.get("is_deleted")),
                "created_at": r.get("created_at"),
                "node_count": len(nodes),
                "sub_node_count": sum(1 for n in nodes if n.get("parent")),
                "grounding_label": (snapshot.get("grounding") or {}).get("label"),
                "counts": {
                    "follow": int(r.get("roadmap_follow_count") or 0),
                    "like": int(r.get("like_count") or 0),
                    "helpful": int(r.get("helpful_count") or 0),
                    "comment": int(r.get("comment_count") or 0),
                    "share": int(r.get("share_count") or 0),
                },
                "author": {
                    "id": r["author_id"],
                    "username": r.get("author_username"),
                    "display_name": r.get("author_display_name"),
                    "role": r.get("author_role"),
                },
                "room": (
                    {"id": r["room_id"], "code": r.get("room_code"), "name": r.get("room_name")}
                    if r.get("room_id")
                    else None
                ),
            }
        )
    return {"items": items, "total": int(total or 0), "offset": int(offset)}


async def roadmap_point_stats(since: datetime) -> Dict[str, int]:
    """Points spent on roadmaps since ``since``, net of refunds, plus sharing totals."""
    # created_at is a naive UTC DATETIME.
    if since.tzinfo is not None:
        since = since.astimezone(timezone.utc).replace(tzinfo=None)
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COALESCE(SUM(-t.delta), 0) FROM point_transactions t
                        WHERE t.kind IN ('roadmap_generate', 'roadmap_expand')
                          AND t.created_at >= :since) AS charged,
                      (SELECT COALESCE(SUM(r.delta), 0) FROM point_transactions r
                         JOIN point_transactions t
                           ON r.ref_type = 'point_transaction' AND r.ref_id = CAST(t.id AS CHAR)
                        WHERE r.kind = 'refund' AND t.kind IN ('roadmap_generate', 'roadmap_expand')
                          AND t.created_at >= :since) AS refunded,
                      (SELECT COUNT(*) FROM point_transactions t
                        WHERE t.kind = 'roadmap_expand'
                          AND t.created_at >= :since
                          AND NOT EXISTS (SELECT 1 FROM point_transactions r
                                           WHERE r.kind = 'refund' AND r.ref_type = 'point_transaction'
                                             AND r.ref_id = CAST(t.id AS CHAR))) AS expansions,
                      (SELECT COUNT(*) FROM posts WHERE linked_type = 'roadmap' AND is_deleted = 0) AS shared_posts,
                      (SELECT COALESCE(SUM(roadmap_follow_count), 0) FROM posts
                        WHERE linked_type = 'roadmap' AND is_deleted = 0) AS follows
                    """
                ),
                {"since": since},
            )
        ).first()
    return {
        "points_spent": int((row.charged or 0) - (row.refunded or 0)) if row else 0,
        "expansions": int(row.expansions or 0) if row else 0,
        "shared_posts": int(row.shared_posts or 0) if row else 0,
        "follows": int(row.follows or 0) if row else 0,
    }


def _naive_utc(value: datetime) -> datetime:
    """MariaDB keeps naive UTC DATETIMEs, so that is what a bound must be."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _pct(ratio: Any) -> Optional[int]:
    """An average score ratio (0-1) as a whole percentage; None when nobody finished."""
    return None if ratio is None else int(round(float(ratio) * 100))


async def _points_spent(session: Any, kinds: Sequence[str], since: datetime) -> int:
    """Points charged for ``kinds`` since ``since``, minus what was refunded."""
    row = (
        await session.execute(
            text(
                """
                SELECT
                  (SELECT COALESCE(SUM(-t.delta), 0) FROM point_transactions t
                    WHERE t.kind IN :kinds AND t.created_at >= :since) AS charged,
                  (SELECT COALESCE(SUM(r.delta), 0) FROM point_transactions r
                     JOIN point_transactions t
                       ON r.ref_type = 'point_transaction' AND r.ref_id = CAST(t.id AS CHAR)
                    WHERE r.kind = 'refund' AND t.kind IN :kinds
                      AND t.created_at >= :since) AS refunded
                """
            ).bindparams(bindparam("kinds", expanding=True)),
            {"kinds": list(kinds), "since": since},
        )
    ).first()
    return int((row.charged or 0) - (row.refunded or 0)) if row else 0


async def quiz_posts_by_session(session_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    """``{quiz session id: {post_id, is_deleted, play_count}}`` whoever the author is."""
    ids = [str(s) for s in session_ids if s]
    if not ids:
        return {}
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT linked_id, id AS post_id, is_deleted, quiz_play_count
                      FROM posts
                     WHERE linked_type = 'quiz' AND linked_id IN :ids
                     ORDER BY id ASC
                    """
                ).bindparams(bindparam("ids", expanding=True)),
                {"ids": ids},
            )
        )
    # The same quiz can be posted again: the newest row wins.
    return {
        str(r["linked_id"]): {
            "post_id": int(r["post_id"]),
            "is_deleted": bool(r["is_deleted"]),
            "play_count": int(r["quiz_play_count"] or 0),
        }
        for r in rows
    }


async def admin_quiz_posts(*, state: str = "visible", limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """Quiz posts for moderation: author, room, counters and how people scored."""
    where = ["p.linked_type = 'quiz'"]
    if state == "visible":
        where.append("p.is_deleted = 0")
    elif state == "deleted":
        where.append("p.is_deleted = 1")
    clause = " AND ".join(where)
    params = {"limit": int(limit), "offset": int(offset)}
    async with _mariadb_session() as session:
        total = (await session.execute(text(f"SELECT COUNT(*) FROM posts p WHERE {clause}"))).scalar()
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT p.id, p.title, p.is_deleted, p.created_at, p.linked_id, p.linked_snapshot,
                           p.like_count, p.helpful_count, p.comment_count, p.share_count,
                           p.quiz_play_count, p.cashback_earned,
                           u.id AS author_id, u.username AS author_username,
                           u.display_name AS author_display_name, u.role AS author_role,
                           c.id AS room_id, c.code AS room_code, c.name AS room_name,
                           a.attempts, a.completed, a.players, a.avg_ratio
                      FROM posts p
                      JOIN users u ON u.id = p.author_id
                      LEFT JOIN rooms c ON c.id = p.room_id
                      LEFT JOIN (
                            SELECT post_id,
                                   COUNT(*) AS attempts,
                                   SUM(completed) AS completed,
                                   COUNT(DISTINCT user_id) AS players,
                                   AVG(CASE WHEN completed = 1 AND question_count > 0
                                            THEN score / question_count END) AS avg_ratio
                              FROM quiz_attempts
                             GROUP BY post_id
                           ) a ON a.post_id = p.id
                     WHERE {clause}
                     ORDER BY p.quiz_play_count DESC, p.id DESC
                     LIMIT :limit OFFSET :offset
                    """
                ),
                params,
            )
        )
    items = []
    for r in rows:
        try:
            snapshot = json.loads(r.get("linked_snapshot") or "{}")
        except (TypeError, ValueError):
            snapshot = {}
        items.append(
            {
                "id": r["id"],
                "title": r.get("title") or snapshot.get("topic"),
                "session_id": r.get("linked_id"),
                "is_deleted": bool(r.get("is_deleted")),
                "created_at": r.get("created_at"),
                "question_count": len(snapshot.get("questions") or []),
                "counts": {
                    "play": int(r.get("quiz_play_count") or 0),
                    "like": int(r.get("like_count") or 0),
                    "helpful": int(r.get("helpful_count") or 0),
                    "comment": int(r.get("comment_count") or 0),
                    "share": int(r.get("share_count") or 0),
                    "cashback": int(r.get("cashback_earned") or 0),
                },
                "attempts": {
                    "total": int(r.get("attempts") or 0),
                    "completed": int(r.get("completed") or 0),
                    "players": int(r.get("players") or 0),
                    "avg_score_pct": _pct(r.get("avg_ratio")),
                },
                "author": {
                    "id": r["author_id"],
                    "username": r.get("author_username"),
                    "display_name": r.get("author_display_name"),
                    "role": r.get("author_role"),
                },
                "room": (
                    {"id": r["room_id"], "code": r.get("room_code"), "name": r.get("room_name")}
                    if r.get("room_id")
                    else None
                ),
            }
        )
    return {"items": items, "total": int(total or 0), "offset": int(offset)}


async def quiz_stats(since: datetime) -> Dict[str, Any]:
    """Quiz activity since ``since``: attempts, scores, points spent and cashback paid."""
    since = _naive_utc(since)
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM quiz_attempts WHERE created_at >= :since) AS attempts,
                      (SELECT COUNT(*) FROM quiz_attempts
                        WHERE created_at >= :since AND completed = 1) AS completed,
                      (SELECT COUNT(DISTINCT user_id) FROM quiz_attempts
                        WHERE created_at >= :since) AS players,
                      (SELECT AVG(score / question_count) FROM quiz_attempts
                        WHERE created_at >= :since AND completed = 1 AND question_count > 0) AS avg_ratio,
                      (SELECT COALESCE(SUM(delta), 0) FROM point_transactions
                        WHERE kind = 'cashback' AND created_at >= :since) AS cashback,
                      (SELECT COUNT(*) FROM posts WHERE linked_type = 'quiz' AND is_deleted = 0) AS shared_posts,
                      (SELECT COALESCE(SUM(quiz_play_count), 0) FROM posts
                        WHERE linked_type = 'quiz' AND is_deleted = 0) AS plays
                    """
                ),
                {"since": since},
            )
        ).first()
        spent = await _points_spent(session, ("quiz_generate", "quiz_import"), since)
    return {
        "attempts": int(row.attempts or 0) if row else 0,
        "completed": int(row.completed or 0) if row else 0,
        "players": int(row.players or 0) if row else 0,
        "avg_score_pct": _pct(row.avg_ratio) if row else None,
        "cashback_paid": int(row.cashback or 0) if row else 0,
        "shared_posts": int(row.shared_posts or 0) if row else 0,
        "plays": int(row.plays or 0) if row else 0,
        "points_spent": spent,
    }


async def update_post_snapshot(post_id: int, snapshot: Dict[str, Any]) -> None:
    """Replace the roadmap/quiz copy a post carries (the author pushed a newer version)."""
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE posts SET linked_snapshot = :snapshot WHERE id = :pid"),
            {"snapshot": json.dumps(snapshot, ensure_ascii=False), "pid": post_id},
        )


async def post_exists(post_id: int) -> bool:
    """
    Does this post row exist at all?

    ``get_post_raw`` filters out hidden posts, which made "restore" impossible:
    the only posts you would ever want to restore are the hidden ones.
    """
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT id FROM posts WHERE id = :pid"), {"pid": post_id}
            )
        ).first()
    return row is not None


async def restore_post(post_id: int) -> None:
    """Undo a soft delete. Posts are flagged, never dropped, so this is enough."""
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE posts SET is_deleted = 0 WHERE id = :id"), {"id": post_id}
        )


async def admin_list_posts(
    *,
    query: Optional[str] = None,
    post_type: Optional[str] = None,
    course_id: Optional[int] = None,
    author_id: Optional[int] = None,
    state: str = "visible",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Moderation listing: every post, deleted ones included.

    Deliberately not the feed query - a moderator needs the author and the
    deleted flag, not the viewer-specific "did I like this" columns.
    """
    where: List[str] = []
    params: Dict[str, Any] = {"limit": int(limit), "offset": int(offset)}
    if state == "visible":
        where.append("p.is_deleted = 0")
    elif state == "deleted":
        where.append("p.is_deleted = 1")
    if post_type:
        where.append("p.type = :type")
        params["type"] = post_type
    if course_id:
        where.append("p.room_id = :cid")
        params["cid"] = int(course_id)
    if author_id:
        where.append("p.author_id = :aid")
        params["aid"] = int(author_id)
    if query:
        where.append("(p.title LIKE :q OR p.content LIKE :q OR u.username LIKE :q)")
        params["q"] = _like(query)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    async with _mariadb_session() as session:
        total = (
            await session.execute(
                text(
                    f"""
                    SELECT COUNT(*) AS n FROM posts p
                      JOIN users u ON u.id = p.author_id {clause}
                    """
                ),
                params,
            )
        ).scalar()
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT p.id, p.type, p.title, p.content, p.is_deleted, p.created_at,
                           p.like_count, p.helpful_count, p.comment_count, p.share_count,
                           p.attachment_name, p.visibility,
                           u.id AS author_id, u.username AS author_username,
                           u.display_name AS author_display_name, u.role AS author_role,
                           c.id AS course_id, c.code AS course_code, c.name AS course_name,
                           c.kind AS course_kind
                      FROM posts p
                      JOIN users u ON u.id = p.author_id
                      LEFT JOIN rooms c ON c.id = p.room_id
                      {clause}
                     ORDER BY p.id DESC
                     LIMIT :limit OFFSET :offset
                    """
                ),
                params,
            )
        )
    items = []
    for r in rows:
        body = (r.get("content") or "")
        items.append(
            {
                "id": r["id"],
                "type": r["type"],
                "title": r.get("title"),
                "excerpt": body[:180] + ("…" if len(body) > 180 else ""),
                "is_deleted": bool(r.get("is_deleted")),
                "visibility": r.get("visibility") or VISIBILITY_PUBLIC,
                "created_at": r.get("created_at"),
                "has_attachment": bool(r.get("attachment_name")),
                "counts": {
                    "like": int(r.get("like_count") or 0),
                    "helpful": int(r.get("helpful_count") or 0),
                    "comment": int(r.get("comment_count") or 0),
                    "share": int(r.get("share_count") or 0),
                },
                "author": {
                    "id": r["author_id"],
                    "username": r.get("author_username"),
                    "display_name": r.get("author_display_name"),
                    "role": r.get("author_role"),
                },
                "course": (
                    {
                        "id": r["course_id"],
                        "code": r.get("course_code"),
                        "name": r.get("course_name"),
                        "kind": r.get("course_kind") or KIND_COURSE,
                    }
                    if r.get("course_id")
                    else None
                ),
            }
        )
    return {"items": items, "total": int(total or 0), "offset": int(offset)}


async def admin_list_courses() -> List[Dict[str, Any]]:
    """Every room in the workspace with its owner - abandoned ones included."""
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT c.id, c.code, c.name, c.description, c.kind, c.created_at,
                           c.created_by,
                           {_ROOM_META_COLUMNS},
                           u.username     AS owner_username,
                           u.display_name AS owner_display_name,
                           u.role         AS owner_role,
                           (SELECT COUNT(*) FROM room_members m WHERE m.room_id = c.id) AS member_count,
                           (SELECT COUNT(*) FROM posts p
                             WHERE p.room_id = c.id AND p.is_deleted = 0) AS post_count,
                           (SELECT COUNT(*) FROM library_documents d
                             WHERE d.room_id = c.id AND d.scope = 'course') AS document_count,
                           (SELECT MAX(p.created_at) FROM posts p
                             WHERE p.room_id = c.id AND p.is_deleted = 0) AS last_post_at
                      FROM rooms c
                      LEFT JOIN users u ON u.id = c.created_by
                      LEFT JOIN categories cat ON cat.id = c.category_id
                     ORDER BY c.status ASC, c.kind ASC, c.code ASC
                    """
                )
            )
        )
    for r in rows:
        for key in ("member_count", "post_count", "document_count"):
            r[key] = int(r.get(key) or 0)
        _room_meta(r)
    return rows


async def find_course_by_code(code: str) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(f"SELECT {_ROOM_COLUMNS} FROM rooms WHERE code = :code LIMIT 1"),
                {"code": (code or "").strip().upper()[:32]},
            )
        ).first()
    return _row(row) if row else None


async def admin_points_log(
    *,
    user_id: Optional[int] = None,
    kind: Optional[str] = None,
    days: int = 7,
    limit: int = 100,
) -> Dict[str, Any]:
    """The wallet ledger for the whole workspace, plus totals to spot outliers."""
    where = ["t.created_at >= NOW() - INTERVAL :days DAY"]
    params: Dict[str, Any] = {"days": int(days), "limit": int(limit)}
    if user_id:
        where.append("t.user_id = :uid")
        params["uid"] = int(user_id)
    if kind:
        where.append("t.kind = :kind")
        params["kind"] = kind
    clause = " AND ".join(where)

    async with _mariadb_session() as session:
        items = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT t.id, t.user_id, t.delta, t.balance_after, t.kind, t.note,
                           t.created_at, u.username, u.display_name, u.role
                      FROM point_transactions t
                      JOIN users u ON u.id = t.user_id
                     WHERE {clause}
                     ORDER BY t.id DESC
                     LIMIT :limit
                    """
                ),
                params,
            )
        )
        by_kind = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT t.kind,
                           COUNT(*) AS rows_count,
                           COALESCE(SUM(CASE WHEN t.delta > 0 THEN t.delta END), 0) AS granted,
                           COALESCE(SUM(CASE WHEN t.delta < 0 THEN -t.delta END), 0) AS spent
                      FROM point_transactions t
                      JOIN users u ON u.id = t.user_id
                     WHERE {clause}
                     GROUP BY t.kind
                     ORDER BY rows_count DESC
                    """
                ),
                params,
            )
        )
        top = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT u.id, u.username, u.display_name, u.role,
                           COALESCE(SUM(CASE WHEN t.delta < 0 THEN -t.delta END), 0) AS spent,
                           COALESCE(SUM(CASE WHEN t.delta > 0 THEN t.delta END), 0) AS earned
                      FROM point_transactions t
                      JOIN users u ON u.id = t.user_id
                     WHERE {clause}
                     GROUP BY u.id, u.username, u.display_name, u.role
                     ORDER BY spent DESC
                     LIMIT 10
                    """
                ),
                params,
            )
        )
    for r in by_kind:
        r["rows_count"] = int(r.get("rows_count") or 0)
        r["granted"] = int(r.get("granted") or 0)
        r["spent"] = int(r.get("spent") or 0)
    for r in top:
        r["spent"] = int(r.get("spent") or 0)
        r["earned"] = int(r.get("earned") or 0)
    return {"items": items, "by_kind": by_kind, "top_spenders": top, "days": int(days)}


async def admin_list_comments(
    *,
    query: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """Every comment in the workspace, newest first, with the post it sits under."""
    where: List[str] = []
    params: Dict[str, Any] = {"limit": int(limit), "offset": int(offset)}
    if query:
        where.append("(c.content LIKE :q OR u.username LIKE :q OR u.display_name LIKE :q)")
        params["q"] = _like(query)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    joins = "FROM post_comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id"
    async with _mariadb_session() as session:
        total = (await session.execute(text(f"SELECT COUNT(*) {joins} {clause}"), params)).scalar()
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at,
                           u.id AS author_id, u.username AS author_username,
                           u.display_name AS author_display_name, u.role AS author_role,
                           p.title AS post_title, p.type AS post_type, p.is_deleted AS post_is_deleted
                      {joins} {clause}
                     ORDER BY c.id DESC
                     LIMIT :limit OFFSET :offset
                    """
                ),
                params,
            )
        )
    items = [
        {
            "id": r["id"],
            "content": r["content"],
            "created_at": r.get("created_at"),
            "author": {
                "id": r["author_id"],
                "username": r.get("author_username"),
                "display_name": r.get("author_display_name"),
                "role": r.get("author_role"),
            },
            "post": {
                "id": r["post_id"],
                "title": r.get("post_title"),
                "type": r.get("post_type"),
                "is_deleted": bool(r.get("post_is_deleted")),
            },
        }
        for r in rows
    ]
    return {"items": items, "total": int(total or 0), "offset": int(offset)}


def _author(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": r["user_id"],
        "username": r.get("username"),
        "display_name": r.get("display_name"),
        "role": r.get("role"),
    }


def _per_day(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{"day": str(r["day"]), "count": int(r["count"] or 0)} for r in rows]


async def community_stats(since: datetime, tz_minutes: int = 0) -> Dict[str, Any]:
    """
    What happened in the feed since ``since``: how much, who took part and which
    posts drew a response. Days are cut on the viewer's clock (``tz_minutes``
    east of UTC). Hidden posts are left out of everything but their own count.
    """
    params = {"since": _naive_utc(since), "tz": int(tz_minutes)}
    async with _mariadb_session() as session:
        totals = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM posts WHERE created_at >= :since AND is_deleted = 0) AS posts,
                      (SELECT COUNT(*) FROM post_comments WHERE created_at >= :since) AS comments,
                      (SELECT COUNT(*) FROM post_reactions WHERE created_at >= :since) AS reactions,
                      (SELECT COUNT(*) FROM post_shares WHERE created_at >= :since) AS shares,
                      (SELECT COUNT(*) FROM saved_posts WHERE created_at >= :since) AS saves,
                      (SELECT COUNT(*) FROM room_members WHERE joined_at >= :since) AS room_joins,
                      (SELECT COUNT(*) FROM posts WHERE is_deleted = 1) AS hidden_posts,
                      (SELECT COUNT(*) FROM (
                            SELECT author_id FROM posts WHERE created_at >= :since AND is_deleted = 0
                            UNION
                            SELECT author_id FROM post_comments WHERE created_at >= :since
                       ) AS active) AS contributors
                    """
                ),
                params,
            )
        ).first()
        per_day = _rows(
            await session.execute(
                text(
                    """
                    SELECT DATE(DATE_ADD(created_at, INTERVAL :tz MINUTE)) AS day, COUNT(*) AS count
                      FROM posts
                     WHERE created_at >= :since AND is_deleted = 0
                     GROUP BY day ORDER BY day
                    """
                ),
                params,
            )
        )
        by_type = _rows(
            await session.execute(
                text(
                    """
                    SELECT type, COUNT(*) AS count FROM posts
                     WHERE created_at >= :since AND is_deleted = 0
                     GROUP BY type
                    """
                ),
                params,
            )
        )
        contributors = _rows(
            await session.execute(
                text(
                    """
                    SELECT u.id AS user_id, u.username, u.display_name, u.role, a.posts, a.comments
                      FROM (
                            SELECT author_id, SUM(posts) AS posts, SUM(comments) AS comments
                              FROM (
                                    SELECT author_id, COUNT(*) AS posts, 0 AS comments FROM posts
                                     WHERE created_at >= :since AND is_deleted = 0 GROUP BY author_id
                                    UNION ALL
                                    SELECT author_id, 0 AS posts, COUNT(*) AS comments FROM post_comments
                                     WHERE created_at >= :since GROUP BY author_id
                                   ) AS activity
                             GROUP BY author_id
                           ) AS a
                      JOIN users u ON u.id = a.author_id
                     ORDER BY (a.posts + a.comments) DESC, u.id ASC
                     LIMIT 8
                    """
                ),
                params,
            )
        )
        top_posts = _rows(
            await session.execute(
                text(
                    """
                    SELECT p.id, p.type, p.title, p.like_count, p.helpful_count, p.comment_count,
                           p.share_count, u.id AS user_id, u.username, u.display_name, u.role
                      FROM posts p
                      JOIN users u ON u.id = p.author_id
                     WHERE p.created_at >= :since AND p.is_deleted = 0
                       AND (p.like_count + p.helpful_count + p.comment_count + p.share_count) > 0
                     ORDER BY (p.like_count + p.helpful_count + p.comment_count + p.share_count) DESC,
                              p.id DESC
                     LIMIT 5
                    """
                ),
                params,
            )
        )

    counted = {r["type"]: int(r["count"] or 0) for r in by_type}
    return {
        **{
            key: int(getattr(totals, key) or 0) if totals else 0
            for key in ("posts", "comments", "reactions", "shares", "saves", "room_joins",
                        "hidden_posts", "contributors")
        },
        "per_day": _per_day(per_day),
        "by_type": {kind: counted.get(kind, 0) for kind in POST_TYPES},
        "top_contributors": [
            {"user": _author(r), "posts": int(r["posts"] or 0), "comments": int(r["comments"] or 0)}
            for r in contributors
        ],
        "top_posts": [
            {
                "id": r["id"],
                "type": r["type"],
                "title": r.get("title"),
                "author": _author(r),
                "counts": {
                    "like": int(r.get("like_count") or 0),
                    "helpful": int(r.get("helpful_count") or 0),
                    "comment": int(r.get("comment_count") or 0),
                    "share": int(r.get("share_count") or 0),
                },
            }
            for r in top_posts
        ],
    }


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


async def soft_delete_post(post_id: int) -> None:
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE posts SET is_deleted = 1 WHERE id = :pid"), {"pid": post_id}
        )


async def bump_counter(post_id: int, column: str, delta: int = 1) -> None:
    allowed = {
        "like_count",
        "helpful_count",
        "comment_count",
        "share_count",
        "quiz_play_count",
        "roadmap_follow_count",
        "cashback_earned",
    }
    if column not in allowed:
        raise ValueError(column)
    async with _mariadb_session() as session:
        await session.execute(
            text(f"UPDATE posts SET {column} = GREATEST(0, {column} + :d) WHERE id = :pid"),
            {"d": delta, "pid": post_id},
        )


# ---------------------------------------------------------------------------
# Reactions / comments / saves
# ---------------------------------------------------------------------------


async def toggle_reaction(post_id: int, user_id: int, kind: str) -> bool:
    """Toggle a like/helpful reaction. Returns True when it is now active."""
    if kind not in REACTION_KINDS:
        raise ValueError(kind)
    column = "like_count" if kind == "like" else "helpful_count"
    async with _mariadb_session() as session:
        existing = (
            await session.execute(
                text(
                    "SELECT 1 FROM post_reactions WHERE post_id = :pid AND user_id = :uid AND kind = :kind"
                ),
                {"pid": post_id, "uid": user_id, "kind": kind},
            )
        ).first()
        if existing:
            await session.execute(
                text(
                    "DELETE FROM post_reactions WHERE post_id = :pid AND user_id = :uid AND kind = :kind"
                ),
                {"pid": post_id, "uid": user_id, "kind": kind},
            )
            await session.execute(
                text(f"UPDATE posts SET {column} = GREATEST(0, {column} - 1) WHERE id = :pid"),
                {"pid": post_id},
            )
            return False
        await session.execute(
            text(
                "INSERT INTO post_reactions (post_id, user_id, kind) VALUES (:pid, :uid, :kind)"
            ),
            {"pid": post_id, "uid": user_id, "kind": kind},
        )
        await session.execute(
            text(f"UPDATE posts SET {column} = {column} + 1 WHERE id = :pid"), {"pid": post_id}
        )
        return True


def actor_note(kind: str, actor_id: int) -> str:
    """Stable note used to make an author bonus idempotent per (post, actor)."""
    return f"{kind} from user:{actor_id}"


async def has_actor_bonus(kind: str, post_id: int, actor_id: int) -> bool:
    """
    Whether this actor already earned the author a bonus of ``kind`` on this post.

    Keeps likes/shares from paying out repeatedly when someone toggles the
    button on and off.
    """
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT 1 FROM point_transactions
                     WHERE kind = :kind AND ref_type = 'post'
                       AND ref_id = :ref AND note = :note
                     LIMIT 1
                    """
                ),
                {"kind": kind, "ref": str(post_id), "note": actor_note(kind, actor_id)},
            )
        ).first()
    return bool(row)


async def has_helpful_bonus(post_id: int, reactor_id: int) -> bool:
    """Backwards-compatible wrapper around :func:`has_actor_bonus`."""
    return await has_actor_bonus("helpful_bonus", post_id, reactor_id)


async def list_comments(post_id: int, limit: int = 100) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at,
                       u.id AS author_id, u.username AS author_username,
                       u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
                       u.role AS author_role
                  FROM post_comments c
                  JOIN users u ON u.id = c.author_id
                 WHERE c.post_id = :pid
                 ORDER BY c.id ASC
                 LIMIT :limit
                """
            ),
            {"pid": post_id, "limit": int(limit)},
        )
        rows = _rows(result)
    return [
        {
            "id": r["id"],
            "post_id": r["post_id"],
            "parent_id": r.get("parent_id"),
            "content": r["content"],
            "created_at": r["created_at"],
            "author_id": r["author_id"],
            "author": {
                "id": r["author_id"],
                "username": r["author_username"],
                "display_name": r["author_display_name"],
                "avatar_url": r["author_avatar_url"],
                "role": r["author_role"],
            },
        }
        for r in rows
    ]


async def add_comment(
    post_id: int,
    author_id: int,
    content: str,
    parent_id: Optional[int] = None,
) -> int:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO post_comments (post_id, author_id, parent_id, content)
                VALUES (:pid, :uid, :parent_id, :content)
                """
            ),
            {
                "pid": post_id,
                "uid": author_id,
                "parent_id": parent_id,
                "content": content.strip()[:4000],
            },
        )
        await session.execute(
            text("UPDATE posts SET comment_count = comment_count + 1 WHERE id = :pid"),
            {"pid": post_id},
        )
        return int(result.lastrowid)


async def get_comment(comment_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT * FROM post_comments WHERE id = :cid"), {"cid": comment_id}
            )
        ).first()
    return _row(row) if row else None


async def delete_comment(comment_id: int, post_id: int) -> None:
    """
    Remove a comment for good.

    Posts are only flagged as deleted so a moderator can undo it, but a comment
    someone withdraws is expected to be gone. The count on the post is
    recalculated rather than decremented, so it cannot drift below zero if the
    same comment is deleted twice.
    """
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                DELETE FROM post_comments
                 WHERE post_id = :pid
                   AND (id = :cid OR parent_id = :cid)
                """
            ),
            {"cid": comment_id, "pid": post_id},
        )
        await session.execute(
            text(
                """
                UPDATE posts SET comment_count =
                    (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = :pid)
                 WHERE id = :pid
                """
            ),
            {"pid": post_id},
        )


async def record_share(post_id: int, user_id: int) -> bool:
    """
    Remember that this user shared this post.

    Returns True only the first time, so the share count, the author's bonus and
    the notification all fire exactly once per person per post.
    """
    async with _mariadb_session() as session:
        result = await session.execute(
            text("INSERT IGNORE INTO post_shares (post_id, user_id) VALUES (:pid, :uid)"),
            {"pid": post_id, "uid": user_id},
        )
        return bool(result.rowcount)


async def has_shared(post_id: int, user_id: int) -> bool:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT 1 FROM post_shares WHERE post_id = :pid AND user_id = :uid"),
                {"pid": post_id, "uid": user_id},
            )
        ).first()
    return bool(row)


async def toggle_saved(post_id: int, user_id: int) -> bool:
    async with _mariadb_session() as session:
        existing = (
            await session.execute(
                text("SELECT 1 FROM saved_posts WHERE post_id = :pid AND user_id = :uid"),
                {"pid": post_id, "uid": user_id},
            )
        ).first()
        if existing:
            await session.execute(
                text("DELETE FROM saved_posts WHERE post_id = :pid AND user_id = :uid"),
                {"pid": post_id, "uid": user_id},
            )
            await session.execute(
                text("DELETE FROM saved_collection_posts WHERE post_id = :pid AND user_id = :uid"),
                {"pid": post_id, "uid": user_id},
            )
            return False
        await session.execute(
            text("INSERT INTO saved_posts (post_id, user_id) VALUES (:pid, :uid)"),
            {"pid": post_id, "uid": user_id},
        )
        return True


async def list_saved_collections(user_id: int) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                SELECT c.id, c.name, c.created_at, COUNT(DISTINCT scp.post_id) AS item_count,
                       GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS course_names
                  FROM saved_collections c
                  LEFT JOIN saved_collection_posts scp
                    ON scp.collection_id = c.id AND scp.user_id = c.user_id
                  LEFT JOIN posts p ON p.id = scp.post_id AND p.is_deleted = 0
                  LEFT JOIN rooms r ON r.id = p.room_id
                 WHERE c.user_id = :uid
                 GROUP BY c.id, c.name, c.created_at
                 ORDER BY c.created_at DESC, c.id DESC
                """
            ),
            {"uid": user_id},
        )
        return _rows(result)


async def create_saved_collection(user_id: int, name: str) -> Dict[str, Any]:
    async with _mariadb_session() as session:
        result = await session.execute(
            text("INSERT INTO saved_collections (user_id, name) VALUES (:uid, :name)"),
            {"uid": user_id, "name": name.strip()},
        )
        collection_id = int(result.lastrowid)
        row = (
            await session.execute(
                text(
                    """
                    SELECT id, name, created_at, 0 AS item_count, NULL AS course_names
                      FROM saved_collections WHERE id = :cid AND user_id = :uid
                    """
                ),
                {"cid": collection_id, "uid": user_id},
            )
        ).first()
        return _row(row)


async def add_saved_post_to_collection(
    collection_id: int, post_id: int, user_id: int
) -> bool:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT IGNORE INTO saved_collection_posts (collection_id, user_id, post_id)
                SELECT c.id, c.user_id, s.post_id
                  FROM saved_collections c
                  JOIN saved_posts s ON s.user_id = c.user_id AND s.post_id = :pid
                 WHERE c.id = :cid AND c.user_id = :uid
                """
            ),
            {"cid": collection_id, "pid": post_id, "uid": user_id},
        )
        if result.rowcount:
            return True
        exists = (
            await session.execute(
                text(
                    """
                    SELECT 1 FROM saved_collections c
                    JOIN saved_posts s ON s.user_id = c.user_id AND s.post_id = :pid
                    WHERE c.id = :cid AND c.user_id = :uid
                    """
                ),
                {"cid": collection_id, "pid": post_id, "uid": user_id},
            )
        ).first()
        return bool(exists)


async def remove_saved_post_from_collection(
    collection_id: int, post_id: int, user_id: int
) -> bool:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                DELETE scp FROM saved_collection_posts scp
                JOIN saved_collections c ON c.id = scp.collection_id
                WHERE scp.collection_id = :cid AND scp.post_id = :pid
                  AND scp.user_id = :uid AND c.user_id = :uid
                """
            ),
            {"cid": collection_id, "pid": post_id, "uid": user_id},
        )
        return bool(result.rowcount)


async def saved_posts_for_quiz(
    user_id: int,
    post_ids: Optional[Sequence[int]] = None,
    collection_id: Optional[int] = None,
    include_all: bool = False,
) -> List[Dict[str, Any]]:
    ids = list(dict.fromkeys(int(post_id) for post_id in (post_ids or [])))
    if not ids and collection_id is None and not include_all:
        return []
    selection = (
        "p.id IN :post_ids"
        if ids
        else "EXISTS (SELECT 1 FROM saved_collection_posts scp "
        "JOIN saved_collections sc ON sc.id = scp.collection_id "
        "WHERE scp.post_id = p.id AND scp.collection_id = :collection_id "
        "AND sc.user_id = :uid)"
        if collection_id is not None
        else "1 = 1"
    )
    params: Dict[str, Any] = {"uid": user_id}
    if ids:
        params["post_ids"] = ids
    if collection_id is not None:
        params["collection_id"] = collection_id
    async with _mariadb_session() as session:
        statement = text(
            f"""
            SELECT p.id, p.title, p.content, p.tags, p.attachment_name,
                   r.name AS course_name
              FROM saved_posts s
              JOIN posts p ON p.id = s.post_id AND p.is_deleted = 0
              LEFT JOIN rooms r ON r.id = p.room_id
             WHERE s.user_id = :uid AND {selection}
             ORDER BY s.created_at DESC, p.id DESC
             LIMIT 100
            """
        )
        if ids:
            statement = statement.bindparams(bindparam("post_ids", expanding=True))
        result = await session.execute(statement, params)
        return _rows(result)


async def save_item(post_id: int, user_id: int) -> None:
    async with _mariadb_session() as session:
        await session.execute(
            text("INSERT IGNORE INTO saved_posts (post_id, user_id) VALUES (:pid, :uid)"),
            {"pid": post_id, "uid": user_id},
        )


# ---------------------------------------------------------------------------
# Quiz plays
# ---------------------------------------------------------------------------


async def count_plays(post_id: int, user_id: int) -> Dict[str, int]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT COUNT(*) AS total,
                           SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed
                      FROM quiz_attempts WHERE post_id = :pid AND user_id = :uid
                    """
                ),
                {"pid": post_id, "uid": user_id},
            )
        ).first()
    return {"total": int(row.total or 0), "completed": int(row.completed or 0)} if row else {"total": 0, "completed": 0}


async def create_play(post_id: int, user_id: int, total: int) -> int:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                "INSERT INTO quiz_attempts (post_id, user_id, question_count) VALUES (:pid, :uid, :total)"
            ),
            {"pid": post_id, "uid": user_id, "total": total},
        )
        await session.execute(
            text("UPDATE posts SET quiz_play_count = quiz_play_count + 1 WHERE id = :pid"), {"pid": post_id}
        )
        return int(result.lastrowid)


async def get_play(play_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    "SELECT id, post_id, user_id, score, question_count AS total, completed, "
                    "cashback_paid, created_at, completed_at FROM quiz_attempts WHERE id = :id"
                ),
                {"id": play_id},
            )
        ).first()
    return _row(row) if row else None


async def complete_play(play_id: int, score: int, total: int, cashback_paid: bool) -> None:
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                UPDATE quiz_attempts
                   SET score = :score, question_count = :total, completed = 1,
                       cashback_paid = :cb, completed_at = NOW()
                 WHERE id = :id
                """
            ),
            {"score": score, "total": total, "cb": 1 if cashback_paid else 0, "id": play_id},
        )


async def has_completed_before(post_id: int, user_id: int, exclude_play_id: int) -> bool:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT 1 FROM quiz_attempts
                     WHERE post_id = :pid AND user_id = :uid AND completed = 1 AND id <> :pl
                     LIMIT 1
                    """
                ),
                {"pid": post_id, "uid": user_id, "pl": exclude_play_id},
            )
        ).first()
    return bool(row)


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
# Search
# ---------------------------------------------------------------------------


async def search_users(
    query: str, limit: int = 8, *, include_contact: bool = False
) -> List[Dict[str, Any]]:
    """
    Find people by name. Only staff (``include_contact``) may also match on
    e-mail / student code, and only they get the student code back - a
    classmate searching for "6599" must not enumerate the roster.
    """
    if include_contact:
        match = "(username LIKE :q OR display_name LIKE :q OR email LIKE :q OR student_code LIKE :q)"
        columns = "id, username, display_name, avatar_url, role, student_code AS student_id"
    else:
        match = "(username LIKE :q OR display_name LIKE :q)"
        columns = "id, username, display_name, avatar_url, role, NULL AS student_id"
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT {columns}
                      FROM users
                     WHERE {match} AND IFNULL(disabled, 0) = 0
                     ORDER BY display_name ASC
                     LIMIT :limit
                    """
                ),
                {"q": _like(query), "limit": int(limit)},
            )
        )
    return rows


async def search_courses(
    query: str, limit: int = 8, *, category_id: Optional[int] = None, viewer_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Active rooms matching by code or name, with their category and member count."""
    where = ["c.status = 'active'", "(c.code LIKE :q OR c.name LIKE :q OR cat.name LIKE :q)"]
    params: Dict[str, Any] = {"q": _like(query), "limit": int(limit), "viewer": viewer_id or 0}
    if category_id:
        where.append("c.category_id = :category_id")
        params["category_id"] = int(category_id)
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT c.id, c.code, c.name, c.description, c.kind,
                           {_ROOM_META_COLUMNS},
                           (SELECT COUNT(*) FROM room_members m WHERE m.room_id = c.id) AS member_count,
                           EXISTS(SELECT 1 FROM room_members m WHERE m.room_id = c.id AND m.user_id = :viewer) AS joined
                      FROM rooms c
                      LEFT JOIN categories cat ON cat.id = c.category_id
                     WHERE {' AND '.join(where)}
                     ORDER BY c.kind ASC, c.code ASC
                     LIMIT :limit
                    """
                ),
                params,
            )
        )
    for r in rows:
        r["member_count"] = int(r.get("member_count") or 0)
        r["joined"] = bool(r.get("joined"))
        _room_meta(r)
    return rows


async def user_stats(user_id: int) -> Dict[str, int]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM posts WHERE author_id = :uid AND is_deleted = 0) AS posts,
                      (SELECT COUNT(*) FROM saved_posts WHERE user_id = :uid) AS saved,
                      (SELECT COUNT(*) FROM room_members WHERE user_id = :uid) AS courses,
                      (SELECT COALESCE(SUM(delta),0) FROM point_transactions WHERE user_id = :uid AND delta > 0 AND kind IN ('cashback','creator_bonus','helpful_bonus')) AS earned
                    """
                ),
                {"uid": user_id},
            )
        ).first()
    if not row:
        return {"posts": 0, "saved": 0, "courses": 0, "earned": 0}
    return {
        "posts": int(row.posts or 0),
        "saved": int(row.saved or 0),
        "courses": int(row.courses or 0),
        "earned": int(row.earned or 0),
    }
