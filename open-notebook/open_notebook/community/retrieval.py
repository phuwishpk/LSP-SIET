"""
Notebook-scoped retrieval for the SIET Space knowledge library.

Open Notebook ships ``fn::vector_search_in_notebook``, but that SurrealQL
function is not present in every deployment (and silently 404s at call time),
which would make a "search only this course" request fall back to searching the
whole workspace — leaking one student's private uploads into another scope.

So scoping is done here with plain queries instead:

1. resolve the notebooks to their linked source ids (``reference``) and note ids
   (``artifact``);
2. run the cosine search restricted to exactly those records.

If a scope resolves to no documents at all we return an empty list, and the
caller decides whether a global fallback is acceptable (it is for "auto", it is
NOT for an explicit course/personal/document scope).
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

from open_notebook.database.repository import ensure_record_id, repo_query

DEFAULT_MIN_SIMILARITY = 0.1

# A source that was embedded more than once leaves identical rows behind (the
# curriculum PDF had every chunk three times). Without over-fetching, "top 3"
# was the same paragraph three times and the model saw a single chunk.
OVERFETCH_FACTOR = 6
MIN_CANDIDATES = 24

_WS_RE = re.compile(r"\s+")


def content_key(text: Any) -> str:
    """Whitespace-insensitive fingerprint of a whole chunk (not just its first line:
    PDF pages share a running header, so a prefix would merge different pages)."""
    return hashlib.sha1(_WS_RE.sub(" ", str(text or "")).strip().encode("utf-8")).hexdigest()


def dedupe_hits(hits: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep the best-scoring copy of each distinct chunk, best first."""
    best: Dict[str, Dict[str, Any]] = {}
    for hit in hits:
        key = content_key(hit.get("content"))
        if key not in best or hit["similarity"] > best[key]["similarity"]:
            best[key] = hit
    return sorted(best.values(), key=lambda h: h["similarity"], reverse=True)


async def notebook_record_ids(notebook_ids: Sequence[str]) -> Dict[str, List[Any]]:
    """Return ``{"sources": [...], "notes": [...]}`` linked to these notebooks."""
    refs = [ensure_record_id(n) for n in notebook_ids if n]
    if not refs:
        return {"sources": [], "notes": []}
    try:
        sources = await repo_query(
            "SELECT VALUE in FROM reference WHERE out IN $nbs", {"nbs": refs}
        )
    except Exception as exc:
        logger.warning(f"scoped retrieval: source lookup failed: {exc}")
        sources = []
    try:
        notes = await repo_query(
            "SELECT VALUE in FROM artifact WHERE out IN $nbs", {"nbs": refs}
        )
    except Exception as exc:
        logger.debug(f"scoped retrieval: note lookup failed: {exc}")
        notes = []
    # SurrealDB returns these as plain strings; comparisons against a
    # record-typed column only match when they are real RecordIDs.
    return {
        "sources": [ensure_record_id(s) for s in (sources or []) if s],
        "notes": [ensure_record_id(n) for n in (notes or []) if n],
    }


async def search_in_notebooks(
    query: str,
    notebook_ids: Sequence[str],
    *,
    results: int = 8,
    minimum_score: float = DEFAULT_MIN_SIMILARITY,
    include_notes: bool = True,
    source_ids: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Cosine search restricted to the documents inside ``notebook_ids``.

    ``source_ids`` narrows it further to exactly those sources (they must still
    belong to ``notebook_ids`` — the notebooks are the permission boundary, the
    sources only a filter inside it). Notebook notes are skipped in that mode:
    "answer from this one document" must not quote something else.

    Returns dicts shaped like the rest of the search helpers
    (``id``, ``title``, ``matches``, ``similarity``) so callers can treat the
    result exactly like ``text_search`` / ``vector_search`` output.
    """
    if not query or not notebook_ids:
        return []

    linked = await notebook_record_ids(notebook_ids)
    source_rids, note_ids = linked["sources"], linked["notes"]
    if source_ids is not None:
        wanted = {str(s) for s in source_ids}
        source_rids = [s for s in source_rids if str(s) in wanted]
        note_ids = []
    if not source_rids and not note_ids:
        return []

    from open_notebook.utils.embedding import generate_embedding

    embedding = await generate_embedding(query)
    hits: List[Dict[str, Any]] = []
    candidates = max(int(results) * OVERFETCH_FACTOR, MIN_CANDIDATES)

    if source_rids:
        params = {
            "ids": source_rids,
            "q": embedding,
            "min": minimum_score,
            "k": candidates,
        }
        try:
            rows = await repo_query(
                """
                SELECT source.id AS id,
                       source.title AS title,
                       content,
                       vector::similarity::cosine(embedding, $q) AS similarity
                  FROM source_embedding
                 WHERE embedding != NONE
                   AND array::len(embedding) = array::len($q)
                   AND source IN $ids
                   AND vector::similarity::cosine(embedding, $q) >= $min
                 ORDER BY similarity DESC
                 LIMIT $k
                """,
                params,
            )
            hits.extend({**r, "kind": "chunk"} for r in rows or [] if isinstance(r, dict))
        except Exception as exc:
            logger.warning(f"scoped retrieval: source_embedding search failed: {exc}")

        try:
            rows = await repo_query(
                """
                SELECT id,
                       insight_type AS title,
                       content,
                       vector::similarity::cosine(embedding, $q) AS similarity
                  FROM source_insight
                 WHERE embedding != NONE
                   AND array::len(embedding) = array::len($q)
                   AND source IN $ids
                   AND vector::similarity::cosine(embedding, $q) >= $min
                 ORDER BY similarity DESC
                 LIMIT $k
                """,
                params,
            )
            hits.extend({**r, "kind": "insight"} for r in rows or [] if isinstance(r, dict))
        except Exception as exc:
            logger.debug(f"scoped retrieval: source_insight search skipped: {exc}")

    if include_notes and note_ids:
        try:
            rows = await repo_query(
                """
                SELECT id, title, content,
                       vector::similarity::cosine(embedding, $q) AS similarity
                  FROM note
                 WHERE embedding != NONE
                   AND array::len(embedding) = array::len($q)
                   AND id IN $ids
                   AND vector::similarity::cosine(embedding, $q) >= $min
                 ORDER BY similarity DESC
                 LIMIT $k
                """,
                {"ids": note_ids, "q": embedding, "min": minimum_score, "k": candidates},
            )
            hits.extend({**r, "kind": "note"} for r in rows or [] if isinstance(r, dict))
        except Exception as exc:
            logger.debug(f"scoped retrieval: note search skipped: {exc}")

    normalised: List[Dict[str, Any]] = []
    for hit in hits:
        if not isinstance(hit, dict):
            continue
        content = hit.get("content")
        normalised.append(
            {
                "id": str(hit.get("id") or ""),
                "title": str(hit.get("title") or "เอกสารในคลังความรู้"),
                "matches": [content] if content else [],
                "content": content,
                "similarity": float(hit.get("similarity") or 0.0),
                "kind": str(hit.get("kind") or "chunk"),
            }
        )
    return dedupe_hits(normalised)[:results]


async def source_summaries(source_ids: Sequence[str], *, limit: int = 2) -> List[Dict[str, Any]]:
    """
    Stored insights (e.g. "Dense Summary") of the given sources, newest first.

    A broad question ("what does this programme teach?") is closest, by cosine,
    to the introduction, not to the pages that answer it. The summary gives the
    model the whole document's outline so it can answer and cite sensibly.
    """
    ids = [ensure_record_id(s) for s in source_ids if s]
    if not ids:
        return []
    try:
        rows = await repo_query(
            # SurrealDB only orders by fields that are part of the selection.
            "SELECT id, insight_type, content, created, source.title AS source_title "
            "FROM source_insight WHERE source IN $ids ORDER BY created DESC LIMIT $k",
            {"ids": ids, "k": int(limit)},
        )
    except Exception as exc:
        logger.warning(f"scoped retrieval: summary lookup failed: {exc}")
        return []
    out: List[Dict[str, Any]] = []
    for row in rows or []:
        content = row.get("content") if isinstance(row, dict) else None
        if not content:
            continue
        label = str(row.get("insight_type") or "สรุปเอกสาร")
        title = str(row.get("source_title") or "").strip()
        out.append(
            {
                "id": str(row.get("id") or ""),
                "title": f"{label} · {title}" if title else label,
                "matches": [content],
                "content": content,
                "similarity": 0.0,
                "kind": "insight",
            }
        )
    return out
