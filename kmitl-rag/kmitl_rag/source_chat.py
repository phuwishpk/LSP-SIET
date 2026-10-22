"""
Source chat additions (hooks into open_notebook.graphs.source_chat): the
passages of the source that best match the latest question are pinned at the
top of the context, and the full text is kept up to 200k characters instead of
5k so an answer deep in a long document is not cut off.
"""

import asyncio
from typing import Any, Dict, List

from loguru import logger

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.utils.embedding import generate_embedding

# Gemini/Claude/GPT models used here all have >=200k token windows, so a 200k
# character cap trades a little safety margin for full coverage. The upstream
# 5k cap chopped 97% of a curriculum PDF and caused "section not found" answers.
FULL_TEXT_LIMIT = 200000


def full_text_limit(_upstream_limit: int) -> int:
    return FULL_TEXT_LIMIT


def pin_relevant_chunks(
    prompt_data: Dict[str, Any], *, source_id: str, messages: List[Any]
) -> Dict[str, Any]:
    """Semantic-search the source for the latest user question; excerpts go first."""
    latest_user_msg = ""
    for m in reversed(messages or []):
        role = getattr(m, "type", None)
        if role in {"human", "user"}:
            latest_user_msg = getattr(m, "content", "") or ""
            break
    try:
        relevant_chunks = _fetch_relevant_chunks(source_id, str(latest_user_msg))
    except Exception as exc:
        logger.warning(f"source_chat: skipping chunk pinning: {exc}")
        relevant_chunks = []
    if relevant_chunks:
        logger.info(
            f"source_chat: pinned {len(relevant_chunks)} chunk(s) for source {source_id}"
        )
        excerpts = _excerpt_parts(relevant_chunks)
        context = prompt_data.get("context") or ""
        prompt_data = {
            **prompt_data,
            "context": "\n".join(excerpts + ([context] if context else [])),
        }
    return {**prompt_data, "relevant_chunks": relevant_chunks}


def _excerpt_parts(relevant_chunks: List[Dict[str, Any]]) -> List[str]:
    """The RELEVANT_EXCERPTS block, highest priority for the model."""
    parts = ["## RELEVANT_EXCERPTS"]
    parts.append(
        "These are the top passages from the source that a semantic search "
        "matched against the user's current question. Prefer these excerpts "
        "as your primary source and quote them verbatim when stating "
        "specifics (course codes, credit counts, program names, etc.)."
    )
    for i, chunk in enumerate(relevant_chunks, 1):
        sim = chunk.get("similarity", 0.0)
        text = chunk.get("text", "")
        parts.append(f"### Excerpt {i} (similarity: {sim:.2f})")
        parts.append(text)
        parts.append("")
    return parts


def _fetch_relevant_chunks(source_id: str, query: str, k: int = 6) -> List[Dict[str, Any]]:
    """
    Semantic-search over the source's embedded chunks for the user's latest
    question. Returns dicts of {content, similarity}. Runs in its own event
    loop because this graph node is sync.
    """
    if not source_id or not (query and query.strip()):
        return []

    async def _run() -> List[Dict[str, Any]]:
        try:
            embed = await generate_embedding(query)
        except Exception as exc:
            logger.warning(f"source_chat: embedding failed: {exc}")
            return []
        # Over-fetch (k * 6) so heavy chunk duplication in this DB (each
        # chunk appears ~3x from repeated embedding runs) doesn't starve the
        # top-k of actually unique passages. We then dedupe in Python before
        # truncating to k. Without this, LIMIT k returns the same passage
        # over and over and the model never sees the second-most-relevant
        # material — which was the bug for "ปีที่ 1 ภาคการศึกษาที่ 2".
        try:
            rows = await repo_query(
                """
                SELECT content,
                       vector::similarity::cosine(embedding, $q) AS sim
                FROM source_embedding
                WHERE source = $source
                  AND vector::similarity::cosine(embedding, $q) >= $min_sim
                ORDER BY sim DESC
                LIMIT $limit
                """,
                {
                    "q": embed,
                    "source": ensure_record_id(source_id),
                    "min_sim": 0.2,
                    "limit": max(k * 6, 30),
                },
            )
        except Exception as exc:
            logger.warning(f"source_chat: vector search failed: {exc}")
            return []
        seen: set = set()
        out: List[Dict[str, Any]] = []
        for row in rows or []:
            text = str(row.get("content") or "")
            if not text:
                continue
            key = text[:120]
            if key in seen:
                continue
            seen.add(key)
            out.append(
                {"text": text[:1500], "similarity": float(row.get("sim") or 0.0)}
            )
            if len(out) >= k:
                break
        return out

    new_loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(new_loop)
        return new_loop.run_until_complete(_run())
    finally:
        new_loop.close()
        asyncio.set_event_loop(None)
