"""
Knowledge library for SIET Space.

Two kinds of knowledge feed the AI features:

* **Course library** (``scope="course"``) – teachers/admins publish syllabi,
  slides and hand-outs into the notebook that backs a course. Every student in
  the workspace can ask questions against it and generate quizzes/roadmaps from
  it, but only staff can add or remove documents.
* **Personal library** (``scope="personal"``) – any student can push their own
  PDF/URL/text into a private notebook and ask questions about just that.

Both are ordinary Open Notebook ``Notebook`` + ``Source`` records, so the
existing vector search works unchanged; MariaDB only keeps the bookkeeping
(owner, scope, status) needed for permissions and listings.

Ingestion runs **in-process** (FastAPI background task) rather than through
surreal-commands, so it also works in the dev stack where no worker runs.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger
from sqlalchemy import text

from open_notebook.config import DATA_FOLDER
from open_notebook.database.repository import ensure_record_id, repo_insert, repo_query
from open_notebook.domain.notebook import Asset, Notebook, Source
from open_notebook.domain.user import User, _mariadb_session

UPLOAD_DIR = os.path.join(DATA_FOLDER, "library")
MAX_UPLOAD_MB = int(os.getenv("LIBRARY_MAX_UPLOAD_MB", "100"))
ALLOWED_EXT = {
    ".pdf", ".txt", ".md", ".markdown", ".docx", ".pptx", ".xlsx", ".csv",
    ".html", ".htm", ".epub", ".rtf", ".odt",
}
MAX_TEXT_CHARS = 400_000

SCOPE_COURSE = "course"
SCOPE_PERSONAL = "personal"


class LibraryError(Exception):
    """Raised for user-fixable problems (bad file type, missing course, …)."""


# ---------------------------------------------------------------------------
# Notebook provisioning
# ---------------------------------------------------------------------------


async def _notebook_exists(notebook_id: Optional[str]) -> bool:
    if not notebook_id:
        return False
    try:
        return await Notebook.get(notebook_id) is not None
    except Exception:
        return False


async def ensure_course_notebook(course: Dict[str, Any]) -> str:
    """Return (creating if needed) the notebook id backing a course library."""
    notebook_id = course.get("notebook_id")
    if await _notebook_exists(notebook_id):
        return str(notebook_id)

    notebook = Notebook(
        name=f"[วิชา] {course['code']} {course['name']}",
        description=(
            f"คลังความรู้ของรายวิชา {course['code']} – เอกสารที่อาจารย์อัปโหลด "
            "จะถูกใช้เป็นแหล่งอ้างอิงของ KMITL RAG AI, AI Quiz และ AI Roadmap"
        ),
        owner_id=f"course:{course['id']}",
    )
    await notebook.save()
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE courses SET notebook_id = :nb WHERE id = :cid"),
            {"nb": str(notebook.id), "cid": course["id"]},
        )
    logger.info(f"Created course notebook {notebook.id} for course {course['code']}")
    return str(notebook.id)


async def ensure_personal_notebook(user: User) -> str:
    """Return (creating if needed) the notebook id of a user's private library."""
    if await _notebook_exists(user.library_notebook_id):
        return str(user.library_notebook_id)

    notebook = Notebook(
        name=f"[ส่วนตัว] {user.display_name or user.username}",
        description="เอกสารส่วนตัวที่อัปโหลดเข้ามาเพื่อถาม AI (เห็นเฉพาะเจ้าของ)",
        owner_id=str(user.id),
    )
    await notebook.save()
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE users SET library_notebook_id = :nb WHERE id = :uid"),
            {"nb": str(notebook.id), "uid": user.id},
        )
    logger.info(f"Created personal notebook {notebook.id} for user {user.username}")
    return str(notebook.id)


async def get_course(course_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT id, code, name, kind, notebook_id FROM courses WHERE id = :cid"),
                {"cid": course_id},
            )
        ).first()
    return dict(row._mapping) if row else None


async def notebook_ids_for_scope(
    user: User,
    *,
    scope: str = "auto",
    course_id: Optional[int] = None,
    document_ids: Optional[Sequence[int]] = None,
) -> List[str]:
    """
    Resolve a retrieval scope into the notebook ids the RAG should search.

    * ``document`` – the notebooks holding the given (readable) documents
    * ``course``   – one course library (any authenticated user may read it)
    * ``personal`` – only the caller's own uploads
    * ``auto``     – personal library + every course the caller belongs to
                     (staff see every course library) + every shared staff
                     notebook (see :func:`list_shared_notebooks`)
    """
    uid = int(user.id or 0)
    ids: List[str] = []

    if document_ids:
        docs = await list_documents_by_ids(user, list(document_ids))
        ids = [d["notebook_id"] for d in docs if d.get("notebook_id")]
        return list(dict.fromkeys(ids))

    if scope == SCOPE_COURSE:
        if not course_id:
            raise LibraryError("ต้องระบุวิชาเมื่อเลือกขอบเขตเป็นรายวิชา")
        course = await get_course(course_id)
        if not course:
            raise LibraryError("ไม่พบรายวิชานี้")
        if course.get("notebook_id"):
            ids.append(str(course["notebook_id"]))
        return ids

    if scope == SCOPE_PERSONAL:
        if user.library_notebook_id:
            ids.append(str(user.library_notebook_id))
        return ids

    # auto
    if user.library_notebook_id:
        ids.append(str(user.library_notebook_id))
    async with _mariadb_session() as session:
        if user.is_points_exempt:  # admins + teachers see every course library
            rows = (
                await session.execute(
                    text("SELECT notebook_id FROM courses WHERE notebook_id IS NOT NULL")
                )
            ).all()
        else:
            rows = (
                await session.execute(
                    text(
                        """
                        SELECT c.notebook_id
                          FROM courses c
                          JOIN course_members m ON m.course_id = c.id
                         WHERE m.user_id = :uid AND c.notebook_id IS NOT NULL
                        """
                    ),
                    {"uid": uid},
                )
            ).all()
    ids.extend(str(r[0]) for r in rows if r[0])
    # Research notebooks prepared by admins/teachers are part of everybody's
    # knowledge, not only of the person who built them.
    ids.extend(await shared_notebook_ids())
    return list(dict.fromkeys(ids))


# ---------------------------------------------------------------------------
# Document bookkeeping (MariaDB)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Shared notebooks: staff research notebooks surfaced to every role
# ---------------------------------------------------------------------------
#
# Admins and teachers prepare material in the Open Notebook research surface
# (/notebooks), which students cannot open. Those notebooks are nevertheless the
# richest knowledge in the workspace, so the community RAG exposes them
# read-only: every signed-in user can pick one (or one of its sources) in the
# "เจาะจงเอกสาร" dropdown and the "auto" scope searches them too.
#
# What is NEVER shared: a notebook owned by a student, anybody's personal
# library notebook, archived notebooks, and notebooks of deleted courses.

PERSONAL_NOTEBOOK_PREFIX = "[ส่วนตัว]"
MAX_SHARED_NOTEBOOKS = 100
MAX_SOURCES_PER_NOTEBOOK = 200
_RECORD_ID_RE = re.compile(r"^(notebook|source):[A-Za-z0-9_\-]{1,64}$")

ROLE_LABEL = {"admin": "ผู้ดูแลระบบ", "teacher": "อาจารย์"}


def classify_notebook_owner(
    owner_id: Any, *, staff_ids: set[int], course_ids: set[int]
) -> Optional[str]:
    """
    Decide whether a notebook owner makes the notebook shareable.

    Returns ``"staff"`` (built by an admin/teacher, or a legacy notebook from
    before per-user ownership existed), ``"course"`` (a live course library) or
    ``None`` when the notebook must stay private.
    """
    owner = str(owner_id or "").strip()
    if owner in ("", "default", "None"):
        return "staff"
    if owner.startswith("course:"):
        try:
            return "course" if int(owner.split(":", 1)[1]) in course_ids else None
        except ValueError:
            return None
    if owner.isdigit() and int(owner) in staff_ids:
        return "staff"
    return None


def is_valid_record_id(value: Any, table: str) -> bool:
    return (
        isinstance(value, str)
        and bool(_RECORD_ID_RE.match(value))
        and value.startswith(f"{table}:")
    )


async def _sharing_context() -> Dict[str, Any]:
    """Who is staff, which courses are live, which notebooks are private libraries."""
    async with _mariadb_session() as session:
        staff_rows = (
            await session.execute(
                text(
                    "SELECT id, username, display_name, role FROM users "
                    "WHERE role IN ('admin', 'teacher') AND IFNULL(disabled, 0) = 0"
                )
            )
        ).all()
        course_rows = (
            await session.execute(
                text("SELECT id, code, name, notebook_id FROM courses WHERE kind = 'course'")
            )
        ).all()
        personal_rows = (
            await session.execute(
                text("SELECT library_notebook_id FROM users WHERE library_notebook_id IS NOT NULL")
            )
        ).all()
    staff = {int(r._mapping["id"]): dict(r._mapping) for r in staff_rows}
    courses = {int(r._mapping["id"]): dict(r._mapping) for r in course_rows}
    return {
        "staff": staff,
        "courses": courses,
        "personal_notebooks": {str(r[0]) for r in personal_rows if r[0]},
        "course_notebooks": {
            str(c["notebook_id"]) for c in courses.values() if c.get("notebook_id")
        },
    }


async def list_shared_notebooks(*, with_sources: bool = True) -> List[Dict[str, Any]]:
    """
    Notebooks every signed-in user may read through the community RAG.

    Each item: ``{id, name, description, kind, owner_label, source_count,
    sources: [{id, title, chunks}]}``. Only notebooks that actually hold at
    least one source are returned, so empty scratch notebooks never show up.
    """
    ctx = await _sharing_context()
    staff_owner_ids = [str(uid) for uid in ctx["staff"]]
    course_owner_ids = [f"course:{cid}" for cid in ctx["courses"]]
    try:
        rows = await repo_query(
            """
            SELECT id, name, description, owner_id, updated
              FROM notebook
             WHERE (archived = false OR archived = NONE)
               AND (owner_id = "default" OR owner_id = NONE
                    OR owner_id IN $staff OR owner_id IN $courses)
               AND count(<-reference) > 0
             ORDER BY name
             LIMIT $limit
            """,
            {"staff": staff_owner_ids, "courses": course_owner_ids, "limit": MAX_SHARED_NOTEBOOKS},
        )
    except Exception as exc:
        logger.warning(f"shared notebooks: listing failed: {exc}")
        return []

    notebooks: List[Dict[str, Any]] = []
    for row in rows or []:
        nb_id = str(row.get("id") or "")
        name = str(row.get("name") or "")
        if not nb_id or nb_id in ctx["personal_notebooks"]:
            continue
        # Belt and braces: a personal library whose MariaDB link was lost is
        # still private, whoever owns it.
        if name.startswith(PERSONAL_NOTEBOOK_PREFIX):
            continue
        kind = classify_notebook_owner(
            row.get("owner_id"),
            staff_ids=set(ctx["staff"]),
            course_ids=set(ctx["courses"]),
        )
        if kind is None:
            continue
        owner = str(row.get("owner_id") or "")
        if kind == "course":
            course = ctx["courses"].get(int(owner.split(":", 1)[1]), {})
            owner_label = f"คลังวิชา {course.get('code') or ''}".strip()
        elif owner.isdigit():
            person = ctx["staff"].get(int(owner), {})
            who = person.get("display_name") or person.get("username") or "staff"
            owner_label = f"{who} · {ROLE_LABEL.get(str(person.get('role')), 'อาจารย์')}"
        else:
            owner_label = "ส่วนกลาง · ผู้ดูแลระบบ"
        notebooks.append(
            {
                "id": nb_id,
                "name": name or "Notebook",
                "description": str(row.get("description") or ""),
                "kind": kind,
                "owner_label": owner_label,
                "source_count": 0,
                "sources": [],
            }
        )

    if not notebooks:
        return []

    nb_refs = [ensure_record_id(n["id"]) for n in notebooks]
    try:
        links = await repo_query(
            "SELECT in AS source, out AS notebook FROM reference WHERE out IN $nbs",
            {"nbs": nb_refs},
        )
    except Exception as exc:
        logger.warning(f"shared notebooks: reference lookup failed: {exc}")
        links = []
    by_notebook: Dict[str, List[str]] = {}
    for link in links or []:
        by_notebook.setdefault(str(link.get("notebook")), []).append(str(link.get("source")))

    titles: Dict[str, str] = {}
    chunks: Dict[str, int] = {}
    if with_sources:
        all_sources = [ensure_record_id(s) for ids in by_notebook.values() for s in ids]
        if all_sources:
            try:
                for src in await repo_query(
                    "SELECT id, title FROM source WHERE id IN $ids", {"ids": all_sources}
                ) or []:
                    titles[str(src.get("id"))] = str(src.get("title") or "")
                for agg in await repo_query(
                    "SELECT source, count() AS chunks FROM source_embedding "
                    "WHERE source IN $ids GROUP BY source",
                    {"ids": all_sources},
                ) or []:
                    chunks[str(agg.get("source"))] = int(agg.get("chunks") or 0)
            except Exception as exc:
                logger.warning(f"shared notebooks: source lookup failed: {exc}")

    for nb in notebooks:
        source_ids = list(dict.fromkeys(by_notebook.get(nb["id"], [])))
        nb["source_count"] = len(source_ids)
        if with_sources:
            nb["sources"] = [
                {
                    "id": sid,
                    "title": titles.get(sid) or "เอกสารไม่มีชื่อ",
                    "chunks": chunks.get(sid, 0),
                }
                for sid in source_ids[:MAX_SOURCES_PER_NOTEBOOK]
            ]
            nb["sources"].sort(key=lambda s: s["title"])
    return [nb for nb in notebooks if nb["source_count"] > 0]


async def shared_notebook_ids() -> List[str]:
    return [nb["id"] for nb in await list_shared_notebooks(with_sources=False)]


async def resolve_knowledge_pick(
    user: User,
    *,
    notebook_ids: Optional[Sequence[str]] = None,
    source_ids: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """
    Validate a dropdown pick and turn it into a retrieval scope.

    The ids come from the browser, so every one of them is checked against what
    this user may read: shared notebooks, every course library and the user's
    own personal library. Anything else (e.g. another student's private
    notebook) is dropped, and an empty result raises instead of silently
    widening the search.

    Returns ``{"notebook_ids": [...], "source_ids": [...] | None, "label": str}``.
    ``source_ids`` is ``None`` when whole notebooks were picked.
    """
    wanted_nbs = [n for n in (notebook_ids or []) if is_valid_record_id(n, "notebook")][:20]
    wanted_srcs = [s for s in (source_ids or []) if is_valid_record_id(s, "source")][:20]
    if not wanted_nbs and not wanted_srcs:
        raise LibraryError("ยังไม่ได้เลือก notebook หรือเอกสาร")

    shared = await list_shared_notebooks(with_sources=False)
    names = {nb["id"]: nb["name"] for nb in shared}
    ctx = await _sharing_context()
    allowed = set(names) | ctx["course_notebooks"]
    if user.library_notebook_id:
        allowed.add(str(user.library_notebook_id))

    if wanted_srcs:
        links = await repo_query(
            "SELECT in AS source, out AS notebook FROM reference "
            "WHERE in IN $srcs AND out IN $nbs",
            {
                "srcs": [ensure_record_id(s) for s in wanted_srcs],
                "nbs": [ensure_record_id(n) for n in allowed],
            },
        )
        ok_sources = list(dict.fromkeys(str(l.get("source")) for l in links or []))
        ok_notebooks = list(dict.fromkeys(str(l.get("notebook")) for l in links or []))
        if not ok_sources:
            raise LibraryError("ไม่พบเอกสารที่เลือก หรือคุณไม่มีสิทธิ์อ่านเอกสารนี้")
        title_rows = await repo_query(
            "SELECT id, title FROM source WHERE id IN $ids",
            {"ids": [ensure_record_id(s) for s in ok_sources]},
        )
        first = next((str(r.get("title") or "") for r in title_rows or []), "")
        label = f"เอกสาร “{first}”" if len(ok_sources) == 1 and first else f"เอกสารที่เลือก {len(ok_sources)} ฉบับ"
        return {"notebook_ids": ok_notebooks, "source_ids": ok_sources, "label": label}

    ok = [n for n in dict.fromkeys(wanted_nbs) if n in allowed]
    if not ok:
        raise LibraryError("ไม่พบ notebook ที่เลือก หรือคุณไม่มีสิทธิ์อ่าน notebook นี้")
    label = (
        f"Notebook “{names.get(ok[0], 'ที่เลือก')}”" if len(ok) == 1 else f"Notebook ที่เลือก {len(ok)} เล่ม"
    )
    return {"notebook_ids": ok, "source_ids": None, "label": label}


async def scope_for_documents(user: User, document_ids: Sequence[int]) -> Dict[str, Any]:
    """
    Library documents → ``{"notebook_ids", "source_ids"}``.

    A course notebook holds many documents, so "ask about this one document"
    has to narrow the search to that document's source, not the whole notebook.
    ``source_ids`` is ``None`` only for legacy rows that never recorded one.
    """
    docs = await list_documents_by_ids(user, list(document_ids))
    notebooks = list(dict.fromkeys(str(d["notebook_id"]) for d in docs if d.get("notebook_id")))
    sources = [str(d["source_id"]) for d in docs if d.get("source_id")]
    complete = bool(docs) and len(sources) == len(docs)
    return {"notebook_ids": notebooks, "source_ids": sources if complete else None}


def _row(r: Any) -> Dict[str, Any]:
    out = {}
    for k, v in dict(r._mapping).items():
        out[k] = v.isoformat() if isinstance(v, datetime) else v
    return out


async def create_document(
    *,
    owner_id: int,
    scope: str,
    course_id: Optional[int],
    notebook_id: str,
    title: str,
    kind: str,
    filename: Optional[str] = None,
    file_path: Optional[str] = None,
    mime: Optional[str] = None,
    size: Optional[int] = None,
    content_hash: Optional[str] = None,
) -> int:
    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO library_documents
                    (owner_id, scope, course_id, notebook_id, title, kind,
                     filename, file_path, mime, size, status, content_hash)
                VALUES
                    (:owner_id, :scope, :course_id, :notebook_id, :title, :kind,
                     :filename, :file_path, :mime, :size, 'processing', :content_hash)
                """
            ),
            {
                "owner_id": owner_id,
                "scope": scope,
                "course_id": course_id,
                "notebook_id": notebook_id,
                "title": title[:200],
                "kind": kind,
                "filename": (filename or None) and filename[:255],
                "file_path": (file_path or None) and file_path[:512],
                "mime": (mime or None) and mime[:128],
                "size": size,
                "content_hash": content_hash,
            },
        )
        return int(result.lastrowid)


async def get_document(doc_id: int) -> Optional[Dict[str, Any]]:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT * FROM library_documents WHERE id = :id"), {"id": doc_id}
            )
        ).first()
    return _row(row) if row else None


async def update_document(doc_id: int, **fields: Any) -> None:
    if not fields:
        return
    allowed = {"status", "error", "chunks", "chars", "source_id", "title", "post_id"}
    sets = {k: v for k, v in fields.items() if k in allowed}
    if not sets:
        return
    assignments = ", ".join(f"{k} = :{k}" for k in sets)
    async with _mariadb_session() as session:
        await session.execute(
            text(f"UPDATE library_documents SET {assignments} WHERE id = :id"),
            {**sets, "id": doc_id},
        )


def can_read_document(user: User, doc: Dict[str, Any]) -> bool:
    """Course documents are readable by everyone; personal ones by their owner."""
    if doc.get("scope") == SCOPE_COURSE:
        return True
    return int(doc.get("owner_id") or 0) == int(user.id or 0)


def can_manage_document(user: User, doc: Dict[str, Any]) -> bool:
    if int(doc.get("owner_id") or 0) == int(user.id or 0):
        return True
    return (user.role or "") == "admin"


async def list_documents_by_ids(user: User, ids: Sequence[int]) -> List[Dict[str, Any]]:
    clean = [int(i) for i in ids][:20]
    if not clean:
        return []
    placeholders = ", ".join(f":id{i}" for i in range(len(clean)))
    params = {f"id{i}": v for i, v in enumerate(clean)}
    async with _mariadb_session() as session:
        rows = (
            await session.execute(
                text(
                    f"SELECT * FROM library_documents WHERE id IN ({placeholders}) AND status = 'ready'"
                ),
                params,
            )
        ).all()
    docs = [_row(r) for r in rows]
    return [d for d in docs if can_read_document(user, d)]


async def list_documents(
    user: User,
    *,
    scope: Optional[str] = None,
    course_id: Optional[int] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """List documents the caller may read, newest first."""
    uid = int(user.id or 0)
    where = ["(d.scope = 'course' OR d.owner_id = :uid)"]
    params: Dict[str, Any] = {"uid": uid, "limit": int(limit)}
    if scope in (SCOPE_COURSE, SCOPE_PERSONAL):
        where.append("d.scope = :scope")
        params["scope"] = scope
    if course_id:
        where.append("d.course_id = :course_id")
        params["course_id"] = course_id

    async with _mariadb_session() as session:
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT d.*, c.code AS course_code, c.name AS course_name,
                           u.username AS owner_username, u.display_name AS owner_display_name,
                           u.role AS owner_role
                      FROM library_documents d
                      LEFT JOIN courses c ON c.id = d.course_id
                      LEFT JOIN users u ON u.id = d.owner_id
                     WHERE {" AND ".join(where)}
                     ORDER BY d.id DESC
                     LIMIT :limit
                    """
                ),
                params,
            )
        ).all()
    return [_row(r) for r in rows]


async def library_stats(user: User) -> Dict[str, int]:
    uid = int(user.id or 0)
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM library_documents WHERE scope='course' AND status='ready') AS course_docs,
                      (SELECT COUNT(*) FROM library_documents WHERE owner_id=:uid AND scope='personal') AS my_docs,
                      (SELECT COUNT(*) FROM library_documents WHERE owner_id=:uid AND status='processing') AS processing
                    """
                ),
                {"uid": uid},
            )
        ).first()
    if not row:
        return {"course_docs": 0, "my_docs": 0, "processing": 0}
    return {
        "course_docs": int(row.course_docs or 0),
        "my_docs": int(row.my_docs or 0),
        "processing": int(row.processing or 0),
    }


# ---------------------------------------------------------------------------
# Upload handling
# ---------------------------------------------------------------------------


def safe_filename(name: str) -> str:
    base = os.path.basename(name or "document")
    base = re.sub(r"[^\w.\-]+", "_", base, flags=re.UNICODE).strip("._") or "document"
    return base[:120]


def validate_extension(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise LibraryError(
            f"ไม่รองรับไฟล์ชนิด {ext or '(ไม่ทราบชนิด)'} – รองรับ PDF, Word, PowerPoint, Excel, CSV, Markdown และ text"
        )
    return ext


def storage_path(filename: str) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    return os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}_{safe_filename(filename)}")


# ---------------------------------------------------------------------------
# Ingestion (extract → Source → chunk → embed)
# ---------------------------------------------------------------------------


async def _extract_text(doc: Dict[str, Any]) -> tuple[str, str]:
    """Return ``(title, text)`` extracted from the document's payload."""
    from content_core import extract_content

    kind = doc.get("kind")
    if kind == "text":
        # Pasted text is handed to ingest_document() directly via raw_text.
        raise LibraryError("เนื้อหาว่างเปล่า")

    state: Dict[str, Any] = {"output_format": "markdown"}
    if kind == "url":
        state["url"] = doc["file_path"]
    else:
        state["file_path"] = doc["file_path"]
        state["document_engine"] = "auto"

    processed = await extract_content(state)
    content = (processed.content or "").strip()
    if processed.title == "Error" and content.startswith("Failed to extract content:"):
        raise LibraryError("อ่านเนื้อหาจากไฟล์/ลิงก์นี้ไม่ได้ ลองไฟล์อื่นหรือแปลงเป็น PDF ที่มีข้อความ")
    if not content:
        raise LibraryError(
            "ไม่พบข้อความในเอกสารนี้ (ถ้าเป็น PDF สแกนต้องทำ OCR ก่อน)"
        )
    title = doc["title"] or processed.title or "เอกสาร"
    return title, content[:MAX_TEXT_CHARS]


async def ingest_document(doc_id: int, raw_text: Optional[str] = None) -> None:
    """
    Extract, persist and embed one library document.

    Safe to run as a FastAPI background task: every failure is written back to
    ``library_documents.status='failed'`` with a user-facing message.
    """
    doc = await get_document(doc_id)
    if not doc:
        logger.warning(f"library: document {doc_id} vanished before ingestion")
        return

    try:
        if raw_text is not None:
            title, content = doc["title"], raw_text.strip()[:MAX_TEXT_CHARS]
            if not content:
                raise LibraryError("เนื้อหาว่างเปล่า")
        else:
            title, content = await _extract_text(doc)

        source = Source(
            title=title,
            topics=[],
            asset=Asset(
                url=doc["file_path"] if doc["kind"] == "url" else None,
                file_path=doc["file_path"] if doc["kind"] == "file" else None,
            ),
            full_text=content,
            owner_id=(
                f"course:{doc['course_id']}"
                if doc["scope"] == SCOPE_COURSE
                else str(doc["owner_id"])
            ),
        )
        await source.save()
        await source.add_to_notebook(doc["notebook_id"])
        await update_document(doc_id, source_id=str(source.id), chars=len(content))

        chunks_created = await _embed_source(str(source.id), content, doc["file_path"])
        await update_document(doc_id, status="ready", chunks=chunks_created, error=None)
        logger.info(
            f"library: document {doc_id} ready – source {source.id}, {chunks_created} chunks"
        )
    except LibraryError as exc:
        await update_document(doc_id, status="failed", error=str(exc)[:500])
        logger.warning(f"library: document {doc_id} failed – {exc}")
    except Exception as exc:  # noqa: BLE001 - surface everything to the user
        await update_document(
            doc_id, status="failed", error=f"ประมวลผลไม่สำเร็จ: {exc}"[:500]
        )
        logger.exception(f"library: document {doc_id} failed unexpectedly")


async def _embed_source(source_id: str, content: str, file_path: Optional[str]) -> int:
    """Chunk + embed a source in-process (mirrors the embed_source command)."""
    from open_notebook.utils.chunking import chunk_text, detect_content_type
    from open_notebook.utils.embedding import generate_embeddings

    await repo_query(
        "DELETE source_embedding WHERE source = $source_id",
        {"source_id": ensure_record_id(source_id)},
    )
    content_type = detect_content_type(content, file_path)
    chunks = chunk_text(content, content_type=content_type)
    if not chunks:
        raise LibraryError("แบ่งเนื้อหาเป็นชิ้นไม่ได้")

    embeddings = await generate_embeddings(chunks)
    if len(embeddings) != len(chunks):
        raise LibraryError("สร้าง embedding ไม่ครบทุกชิ้น ลองใหม่อีกครั้ง")

    await repo_insert(
        "source_embedding",
        [
            {
                "source": ensure_record_id(source_id),
                "order": idx,
                "content": chunk,
                "embedding": embedding,
            }
            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ],
    )
    return len(chunks)


async def delete_document(doc: Dict[str, Any]) -> None:
    """Remove the document, its Source, embeddings and uploaded file."""
    source_id = doc.get("source_id")
    if source_id:
        try:
            await repo_query(
                "DELETE source_embedding WHERE source = $source_id",
                {"source_id": ensure_record_id(source_id)},
            )
            source = await Source.get(source_id)
            if source:
                await source.delete()
        except Exception as exc:
            logger.warning(f"library: could not delete source {source_id}: {exc}")

    path = doc.get("file_path")
    if doc.get("kind") == "file" and path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError as exc:
            logger.warning(f"library: could not remove file {path}: {exc}")

    async with _mariadb_session() as session:
        await session.execute(
            text("DELETE FROM library_documents WHERE id = :id"), {"id": doc["id"]}
        )
