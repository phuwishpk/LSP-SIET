"""
MariaDB repository for the SIET Space community feed.

Everything here is plain SQL (SQLAlchemy ``text``) on top of the shared async
engine from ``open_notebook.domain.user``. Rows are returned as dictionaries
so the API layer can serialise them straight into Pydantic models.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy import bindparam, text

from open_notebook.domain.user import _mariadb_session

POST_TYPES = ("summary", "quiz", "roadmap", "question", "material")
REACTION_KINDS = ("like", "helpful")

# Rooms come in two flavours: official course rooms (staff only) and
# student-run discussion rooms.
KIND_COURSE = "course"
KIND_CLUB = "club"


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
    return f"%{q.strip()}%"


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
    if row.get("course_id"):
        course = {
            "id": row["course_id"],
            "code": course_code,
            "name": course_name,
            "kind": course_kind or KIND_COURSE,
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


_POST_SELECT = """
    SELECT p.*,
           u.username     AS author_username,
           u.display_name AS author_display_name,
           u.avatar_url   AS author_avatar_url,
           u.role         AS author_role,
           c.code         AS course_code,
           c.name         AS course_name,
           c.kind         AS course_kind,
           EXISTS(SELECT 1 FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = :viewer AND r.kind = 'like')    AS liked,
           EXISTS(SELECT 1 FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = :viewer AND r.kind = 'helpful') AS marked_helpful,
           EXISTS(SELECT 1 FROM saved_items s WHERE s.post_id = p.id AND s.user_id = :viewer) AS saved,
           EXISTS(SELECT 1 FROM post_shares ps WHERE ps.post_id = p.id AND ps.user_id = :viewer) AS shared,
           (SELECT COUNT(*) FROM quiz_plays q WHERE q.post_id = p.id AND q.user_id = :viewer)                   AS my_plays,
           (SELECT COUNT(*) FROM quiz_plays q WHERE q.post_id = p.id AND q.user_id = :viewer AND q.completed = 1) AS my_completed_plays,
           EXISTS(SELECT 1 FROM point_transactions t WHERE t.user_id = :viewer AND t.kind = 'quiz_import' AND t.ref_type = 'post' AND t.ref_id = CAST(p.id AS CHAR)) AS my_imported
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN courses c ON c.id = p.course_id
"""


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------


async def list_courses(user_id: int) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                SELECT c.id, c.code, c.name, c.description, c.kind,
                       c.created_by, c.created_at,
                       (SELECT COUNT(*) FROM course_members m WHERE m.course_id = c.id) AS member_count,
                       (SELECT COUNT(*) FROM posts p WHERE p.course_id = c.id AND p.is_deleted = 0) AS post_count,
                       EXISTS(SELECT 1 FROM course_members m WHERE m.course_id = c.id AND m.user_id = :uid) AS joined
                  FROM courses c
                 ORDER BY c.kind ASC, c.code ASC
                """
            ),
            {"uid": user_id},
        )
        rows = _rows(result)
    for r in rows:
        r["joined"] = bool(r.get("joined"))
        r["member_count"] = int(r.get("member_count") or 0)
        r["post_count"] = int(r.get("post_count") or 0)
        r["kind"] = r.get("kind") or KIND_COURSE
    return rows


async def get_course(course_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(text("SELECT * FROM courses WHERE id = :id"), {"id": course_id})
        ).first()
    return _row(row) if row else None


async def create_course(
    code: str,
    name: str,
    description: Optional[str],
    created_by: int,
    kind: str = KIND_COURSE,
) -> Dict[str, Any]:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO courses (code, name, description, created_by, kind)
                VALUES (:code, :name, :description, :created_by, :kind)
                """
            ),
            {
                "code": code.strip().upper()[:32],
                "name": name.strip()[:128],
                "description": (description or "").strip()[:255] or None,
                "created_by": created_by,
                "kind": kind if kind in (KIND_COURSE, KIND_CLUB) else KIND_COURSE,
            },
        )
        course_id = int(result.lastrowid)
        await session.execute(
            text(
                "INSERT IGNORE INTO course_members (course_id, user_id) VALUES (:cid, :uid)"
            ),
            {"cid": course_id, "uid": created_by},
        )
    course = await get_course(course_id)
    assert course is not None
    return course


async def ensure_course(code: str, name: str, description: Optional[str] = None) -> None:
    """Seed helper – insert the course only if the code is not taken."""
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                INSERT IGNORE INTO courses (code, name, description)
                VALUES (:code, :name, :description)
                """
            ),
            {"code": code, "name": name, "description": description},
        )


async def update_course(
    course_id: int,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    code: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Rename / re-code a room. Only the fields that are passed are touched."""
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
    if not sets:
        return await get_course(course_id)
    async with _mariadb_session() as session:
        await session.execute(
            text(f"UPDATE courses SET {', '.join(sets)} WHERE id = :cid"), values
        )
    return await get_course(course_id)


async def courses_owned_by(user_id: int) -> List[Dict[str, Any]]:
    """Rooms this person created, with the numbers a teacher actually wants."""
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT c.id, c.code, c.name, c.description, c.kind, c.created_at,
                           (SELECT COUNT(*) FROM course_members m
                             WHERE m.course_id = c.id) AS member_count,
                           (SELECT COUNT(*) FROM posts p
                             WHERE p.course_id = c.id AND p.is_deleted = 0) AS post_count,
                           (SELECT COUNT(*) FROM library_documents d
                             WHERE d.course_id = c.id AND d.scope = 'course') AS document_count
                      FROM courses c
                     WHERE c.created_by = :uid
                     ORDER BY c.kind ASC, c.code ASC
                    """
                ),
                {"uid": user_id},
            )
        )
    for r in rows:
        for key in ("member_count", "post_count", "document_count"):
            r[key] = int(r.get(key) or 0)
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
        where.append("p.course_id = :cid")
        params["cid"] = int(course_id)
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    f"""
                    SELECT q.id, q.post_id, q.score, q.total, q.completed,
                           q.created_at, q.completed_at,
                           p.title        AS post_title,
                           p.course_id    AS course_id,
                           c.code         AS course_code,
                           c.name         AS course_name,
                           u.id           AS student_id,
                           u.username     AS student_username,
                           u.display_name AS student_display_name,
                           u.student_id   AS student_code
                      FROM quiz_plays q
                      JOIN posts p ON p.id = q.post_id
                      JOIN users u ON u.id = q.user_id
                      LEFT JOIN courses c ON c.id = p.course_id
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
                    """
                    SELECT * FROM courses
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
    Remove a room. Posts are *detached*, not deleted: a room owner should not be
    able to wipe out other people's work by closing the room.
    """
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE posts SET course_id = NULL WHERE course_id = :cid"),
            {"cid": course_id},
        )
        await session.execute(
            text("DELETE FROM course_members WHERE course_id = :cid"), {"cid": course_id}
        )
        await session.execute(text("DELETE FROM courses WHERE id = :cid"), {"cid": course_id})


async def set_course_membership(course_id: int, user_id: int, joined: bool) -> None:
    async with _mariadb_session() as session:
        if joined:
            await session.execute(
                text("INSERT IGNORE INTO course_members (course_id, user_id) VALUES (:cid, :uid)"),
                {"cid": course_id, "uid": user_id},
            )
        else:
            await session.execute(
                text("DELETE FROM course_members WHERE course_id = :cid AND user_id = :uid"),
                {"cid": course_id, "uid": user_id},
            )


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
) -> int:
    if post_type not in POST_TYPES:
        raise ValueError(f"invalid post type {post_type}")
    attachment = attachment or {}
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO posts
                    (author_id, course_id, type, title, content, tags,
                     attachment_name, attachment_path, attachment_size, attachment_mime,
                     embed_type, embed_id, embed_snapshot, content_hash)
                VALUES
                    (:author_id, :course_id, :type, :title, :content, :tags,
                     :att_name, :att_path, :att_size, :att_mime,
                     :embed_type, :embed_id, :embed_snapshot, :content_hash)
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
    my_courses_only: bool = False,
    embed_types: Optional[Iterable[str]] = None,
    before_id: Optional[int] = None,
    limit: int = 20,
    order: str = "newest",
) -> List[Dict[str, Any]]:
    where = ["p.is_deleted = 0"]
    params: Dict[str, Any] = {"viewer": viewer_id, "limit": max(1, min(int(limit), 100))}
    if course_id:
        where.append("p.course_id = :course_id")
        params["course_id"] = course_id
    if post_type:
        where.append("p.type = :ptype")
        params["ptype"] = post_type
    if author_id:
        where.append("p.author_id = :author_id")
        params["author_id"] = author_id
    if query:
        where.append("(p.title LIKE :q OR p.content LIKE :q OR p.tags LIKE :q OR u.display_name LIKE :q OR u.username LIKE :q)")
        params["q"] = _like(query)
    if saved_only:
        where.append("EXISTS(SELECT 1 FROM saved_items s2 WHERE s2.post_id = p.id AND s2.user_id = :viewer)")
    if my_courses_only:
        where.append("p.course_id IN (SELECT m.course_id FROM course_members m WHERE m.user_id = :viewer)")
    if embed_types:
        types = [t for t in embed_types if t in ("quiz", "roadmap")]
        if types:
            where.append("p.embed_type IN (" + ",".join(f"'{t}'" for t in types) + ")")
    if before_id:
        where.append("p.id < :before_id")
        params["before_id"] = int(before_id)

    if order == "popular":
        order_by = "(p.like_count * 2 + p.helpful_count * 3 + p.follow_count * 2 + p.play_count + p.comment_count) DESC, p.id DESC"
    else:
        order_by = "p.id DESC"

    sql = _POST_SELECT + " WHERE " + " AND ".join(where) + f" ORDER BY {order_by} LIMIT :limit"
    async with _mariadb_session() as session:
        rows = _rows(await session.execute(text(sql), params))
    return [_post_public(r, viewer_id) for r in rows]


async def get_post(post_id: int, viewer_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(_POST_SELECT + " WHERE p.id = :pid AND p.is_deleted = 0"),
                {"pid": post_id, "viewer": viewer_id},
            )
        ).first()
    return _post_public(_row(row), viewer_id) if row else None


async def get_post_raw(post_id: int) -> Optional[Dict[str, Any]]:
    """Full row including the private embed snapshot (server-side use only)."""
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT * FROM posts WHERE id = :pid AND is_deleted = 0"),
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
) -> None:
    """Edit the text fields of a post. Embeds and attachments are untouched."""
    values: Dict[str, Any] = {"pid": post_id}
    sets: List[str] = []
    if title is not None:
        sets.append("title = :title")
        values["title"] = title.strip()[:200] or None
    if content is not None:
        sets.append("content = :content")
        values["content"] = content.strip() or None
    if title is not None or content is not None:
        from open_notebook.community.ratelimit import fingerprint

        sets.append("content_hash = :content_hash")
        values["content_hash"] = fingerprint(title or "", content or "")
    if tags is not None:
        sets.append("tags = :tags")
        values["tags"] = ",".join(t.strip()[:40] for t in tags if t.strip())[:255] or None
    if clear_course:
        sets.append("course_id = NULL")
    elif course_id is not None:
        sets.append("course_id = :course_id")
        values["course_id"] = course_id
    if not sets:
        return
    async with _mariadb_session() as session:
        await session.execute(
            text(f"UPDATE posts SET {', '.join(sets)} WHERE id = :pid"), values
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
        where.append("p.course_id = :cid")
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
                           p.attachment_name,
                           u.id AS author_id, u.username AS author_username,
                           u.display_name AS author_display_name, u.role AS author_role,
                           c.id AS course_id, c.code AS course_code, c.name AS course_name,
                           c.kind AS course_kind
                      FROM posts p
                      JOIN users u ON u.id = p.author_id
                      LEFT JOIN courses c ON c.id = p.course_id
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
                    """
                    SELECT c.id, c.code, c.name, c.description, c.kind, c.created_at,
                           c.created_by,
                           u.username     AS owner_username,
                           u.display_name AS owner_display_name,
                           u.role         AS owner_role,
                           (SELECT COUNT(*) FROM course_members m WHERE m.course_id = c.id) AS member_count,
                           (SELECT COUNT(*) FROM posts p
                             WHERE p.course_id = c.id AND p.is_deleted = 0) AS post_count,
                           (SELECT COUNT(*) FROM library_documents d
                             WHERE d.course_id = c.id AND d.scope = 'course') AS document_count,
                           (SELECT MAX(p.created_at) FROM posts p
                             WHERE p.course_id = c.id AND p.is_deleted = 0) AS last_post_at
                      FROM courses c
                      LEFT JOIN users u ON u.id = c.created_by
                     ORDER BY c.kind ASC, c.code ASC
                    """
                )
            )
        )
    for r in rows:
        for key in ("member_count", "post_count", "document_count"):
            r[key] = int(r.get(key) or 0)
    return rows


async def find_course_by_code(code: str) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT * FROM courses WHERE code = :code LIMIT 1"),
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
        "play_count",
        "follow_count",
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
                SELECT c.id, c.post_id, c.content, c.created_at,
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


async def add_comment(post_id: int, author_id: int, content: str) -> int:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                "INSERT INTO post_comments (post_id, author_id, content) VALUES (:pid, :uid, :content)"
            ),
            {"pid": post_id, "uid": author_id, "content": content.strip()[:4000]},
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
            text("DELETE FROM post_comments WHERE id = :cid"), {"cid": comment_id}
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
                text("SELECT 1 FROM saved_items WHERE post_id = :pid AND user_id = :uid"),
                {"pid": post_id, "uid": user_id},
            )
        ).first()
        if existing:
            await session.execute(
                text("DELETE FROM saved_items WHERE post_id = :pid AND user_id = :uid"),
                {"pid": post_id, "uid": user_id},
            )
            return False
        await session.execute(
            text("INSERT INTO saved_items (post_id, user_id) VALUES (:pid, :uid)"),
            {"pid": post_id, "uid": user_id},
        )
        return True


async def save_item(post_id: int, user_id: int) -> None:
    async with _mariadb_session() as session:
        await session.execute(
            text("INSERT IGNORE INTO saved_items (post_id, user_id) VALUES (:pid, :uid)"),
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
                      FROM quiz_plays WHERE post_id = :pid AND user_id = :uid
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
                "INSERT INTO quiz_plays (post_id, user_id, total) VALUES (:pid, :uid, :total)"
            ),
            {"pid": post_id, "uid": user_id, "total": total},
        )
        await session.execute(
            text("UPDATE posts SET play_count = play_count + 1 WHERE id = :pid"), {"pid": post_id}
        )
        return int(result.lastrowid)


async def get_play(play_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(text("SELECT * FROM quiz_plays WHERE id = :id"), {"id": play_id})
        ).first()
    return _row(row) if row else None


async def complete_play(play_id: int, score: int, total: int, cashback_paid: bool) -> None:
    async with _mariadb_session() as session:
        await session.execute(
            text(
                """
                UPDATE quiz_plays
                   SET score = :score, total = :total, completed = 1,
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
                    SELECT 1 FROM quiz_plays
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
                INSERT INTO rag_sessions (id, user_id, credits_left, messages)
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
                text("SELECT * FROM rag_sessions WHERE id = :id AND user_id = :uid"),
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


async def update_rag_session(
    session_id: str, messages: List[Dict[str, Any]], credits_left: int
) -> None:
    async with _mariadb_session() as session:
        await session.execute(
            text(
                "UPDATE rag_sessions SET messages = :messages, credits_left = :credits WHERE id = :id"
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
                    "SELECT id, role, content, meta, created_at FROM rag_messages "
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
                    "INSERT INTO rag_messages (conversation_id, role, content, meta) "
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
                INSERT INTO notifications (user_id, kind, message, post_id, actor_id)
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
                     WHERE n.user_id = :uid
                     ORDER BY n.id DESC
                     LIMIT :limit
                    """
                ),
                {"uid": user_id, "limit": int(limit)},
            )
        )
        unread = (
            await session.execute(
                text("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND is_read = 0"),
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
                    "UPDATE notifications SET is_read = 1 WHERE user_id = :uid AND id IN :ids"
                ).bindparams(bindparam("ids", expanding=True)),
                {"uid": user_id, "ids": [int(i) for i in ids]},
            )
        else:
            await session.execute(
                text("UPDATE notifications SET is_read = 1 WHERE user_id = :uid"), {"uid": user_id}
            )


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


async def search_users(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT id, username, display_name, avatar_url, role, student_id
                      FROM users
                     WHERE username LIKE :q OR display_name LIKE :q OR email LIKE :q OR student_id LIKE :q
                     ORDER BY display_name ASC
                     LIMIT :limit
                    """
                ),
                {"q": _like(query), "limit": int(limit)},
            )
        )
    return rows


async def search_courses(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        rows = _rows(
            await session.execute(
                text(
                    """
                    SELECT id, code, name, description, kind
                      FROM courses
                     WHERE code LIKE :q OR name LIKE :q
                     ORDER BY kind ASC, code ASC
                     LIMIT :limit
                    """
                ),
                {"q": _like(query), "limit": int(limit)},
            )
        )
    return rows


async def user_stats(user_id: int) -> Dict[str, int]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM posts WHERE author_id = :uid AND is_deleted = 0) AS posts,
                      (SELECT COUNT(*) FROM saved_items WHERE user_id = :uid) AS saved,
                      (SELECT COUNT(*) FROM course_members WHERE user_id = :uid) AS courses,
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
