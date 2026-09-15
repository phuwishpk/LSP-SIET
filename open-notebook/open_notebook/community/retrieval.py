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

from typing import Any, Dict, List, Sequence

from loguru import logger

from open_notebook.database.repository import ensure_record_id, repo_query

DEFAULT_MIN_SIMILARITY = 0.1


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
) -> List[Dict[str, Any]]:
    """
    Cosine search restricted to the documents inside ``notebook_ids``.

    Returns dicts shaped like the rest of the search helpers
    (``id``, ``title``, ``matches``, ``similarity``) so callers can treat the
    result exactly like ``text_search`` / ``vector_search`` output.
    """
    if not query or not notebook_ids:
        return []

    linked = await notebook_record_ids(notebook_ids)
    source_ids, note_ids = linked["sources"], linked["notes"]
    if not source_ids and not note_ids:
        return []

    from open_notebook.utils.embedding import generate_embedding

    embedding = await generate_embedding(query)
    hits: List[Dict[str, Any]] = []

    if source_ids:
        params = {
            "ids": source_ids,
            "q": embedding,
            "min": minimum_score,
            "k": int(results),
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
            hits.extend(rows or [])
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
            hits.extend(rows or [])
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
                {"ids": note_ids, "q": embedding, "min": minimum_score, "k": int(results)},
            )
            hits.extend(rows or [])
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
            }
        )
    normalised.sort(key=lambda h: h["similarity"], reverse=True)
    return normalised[:results]
