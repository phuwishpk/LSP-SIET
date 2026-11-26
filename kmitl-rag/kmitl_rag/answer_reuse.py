"""
Answer reuse for KMITL RAG AI single questions (``POST /community/ask``).

Students in one class ask the same thing in different words right after a
lecture; each fresh answer costs a retrieval + an LLM call. This reuses the
shared answer cache (``siet_platform.cache.answer_cache``: exact, semantic-high,
and semantic-mid confirmed by a small intent check) but only **within one
scope**: the same readable notebooks, picked sources, web mode, language and
model - and the same *content*. Each notebook is fingerprinted by its
knowledge version, how many sources it holds and when they last changed, so a
document added to a course or a personal library makes earlier answers in that
scope unusable at once (the SurrealDB ``fn::compute_notebook_knowledge_version``
alone does not change when a new source is added).
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional, Sequence, Tuple

from loguru import logger

from siet_core.database.repository import ensure_record_id, repo_query
from siet_platform.cache.answer_cache import get_cached_answer, set_cached_answer
from siet_platform.cache.intent_validator import validate_intent_match
from siet_platform.config import ANSWER_CACHE_INTENT_MIN_SIMILARITY

PROMPT_VERSION = "rag-ask-v2"

_FINGERPRINT_QUERY = """
SELECT id, knowledge_version,
       count(<-reference) AS n,
       array::max((<-reference<-source).updated) AS last
  FROM $ids
"""


async def notebook_fingerprints(notebook_ids: Sequence[str]) -> Dict[str, str]:
    """``{notebook_id: "<version>:<sources>:<last change>"}`` from ONE query; "0" when unknown."""
    ids = sorted({str(n) for n in notebook_ids if n})
    prints = {nb: "0" for nb in ids}
    if not ids:
        return prints
    try:
        rows = await repo_query(_FINGERPRINT_QUERY, {"ids": [ensure_record_id(n) for n in ids]})
    except Exception as exc:
        logger.warning(f"answer reuse: fingerprint query failed, using 0: {exc}")
        return prints
    for row in rows or []:
        nb = str(row.get("id") or "")
        if nb in prints:
            prints[nb] = f"{row.get('knowledge_version') or 0}:{row.get('n') or 0}:{row.get('last') or ''}"
    return prints


async def scope_key(
    *,
    notebook_ids: Optional[Sequence[str]],
    source_ids: Optional[Sequence[str]],
    allow_global_fallback: bool,
    web: Optional[str],
    language: str,
    model_id: Optional[str],
) -> str:
    """Cache scope for one question: everything that changes the answer except the wording."""
    from kmitl_rag.ask import answer_cache_key

    base = answer_cache_key(
        question="",
        notebook_ids=notebook_ids,
        source_ids=source_ids,
        allow_global_fallback=allow_global_fallback,
        web=web,
        language=language,
        model_id=model_id,
    )
    prints = await notebook_fingerprints(list(notebook_ids or []))
    content = "|".join(f"{nb}={fp}" for nb, fp in sorted(prints.items()))
    return hashlib.sha1(f"{PROMPT_VERSION}|{base}|{content}".encode("utf-8")).hexdigest()


async def lookup(question: str, key: str, language: str, model_id: str) -> Optional[Tuple[Dict[str, Any], str]]:
    """``(payload, "exact" | "similar")`` for a reusable answer, else None. Never raises."""
    try:
        _answer, _embedding, match = await get_cached_answer(question, key, language)
    except Exception as exc:
        logger.debug(f"answer reuse: lookup skipped: {exc}")
        return None
    kind = (match or {}).get("match_type")
    if kind in ("exact", "semantic_high"):
        payload = match.get("payload")
        return (payload, "exact" if kind == "exact" else "similar") if isinstance(payload, dict) else None
    if (
        kind == "semantic_mid"
        and match.get("intent_validation_required")
        and float(match.get("similarity", 0)) >= ANSWER_CACHE_INTENT_MIN_SIMILARITY
        and isinstance(match.get("candidate_payload"), dict)
    ):
        try:
            same = await validate_intent_match(
                new_question=question,
                cached_question=str(match.get("candidate_question") or ""),
                cached_intent=match.get("candidate_intent"),
                cached_entities=match.get("candidate_entities") or {},
                model_id=model_id,
            )
        except Exception as exc:
            logger.debug(f"answer reuse: intent check failed: {exc}")
            same = None
        if same is True:
            return match["candidate_payload"], "similar"
    return None


async def store(
    question: str,
    key: str,
    language: str,
    payload: Dict[str, Any],
    model_id: str,
    ttl: Optional[int] = None,
) -> None:
    """Remember an answer (best effort: a cache problem never reaches the student)."""
    try:
        await set_cached_answer(
            question,
            str(payload.get("answer") or payload.get("text") or ""),
            key,
            language,
            model_id=model_id or None,
            payload=payload,
            ttl=ttl,
        )
    except Exception as exc:
        logger.debug(f"answer reuse: store skipped: {exc}")


async def default_model_id() -> str:
    """Id of the default chat model (used for the intent check when a request names none)."""
    try:
        from siet_core.ai.models import model_manager

        defaults = await model_manager.get_defaults()
        return str(getattr(defaults, "default_chat_model", "") or "")
    except Exception as exc:
        logger.debug(f"answer reuse: no default model id: {exc}")
        return ""


__all__: List[str] = ["notebook_fingerprints", "scope_key", "lookup", "store", "default_model_id"]
