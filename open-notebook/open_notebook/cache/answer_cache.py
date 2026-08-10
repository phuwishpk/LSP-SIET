"""Shared exact and semantic cache for notebook answers."""

from __future__ import annotations

import hashlib
import math
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

from open_notebook.cache.metrics import cache_metrics
from open_notebook.cache.service import cache_service
from open_notebook.utils.embedding import generate_embedding


ANSWER_CACHE_TTL = int(os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_TTL", "3600"))
ANSWER_CACHE_THRESHOLD = float(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_SIMILARITY", "0.94")
)
ANSWER_CACHE_MAX_ENTRIES = int(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_MAX_ENTRIES", "100")
)
# Phase 1: separate thresholds for high-confidence hits vs intent-validated hits
ANSWER_CACHE_HIGH_THRESHOLD = float(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_HIGH_SIMILARITY", "0.97")
)
ANSWER_CACHE_MID_THRESHOLD = float(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_MID_SIMILARITY", "0.92")
)

# Conservative token-cost heuristic for cache savings accounting.
# Real token counts require tokenizer access; this estimate lets us report
# savings consistently across cache hits regardless of which model would have
# been called.
_AVG_TOKENS_PER_QUESTION = 25
_AVG_TOKENS_PER_CONTEXT_CHUNK = 350


def _normalize_question(question: str) -> str:
    """
    Phase 1 hardened question normalization.

    Compared to the original implementation, this:
    - Applies NFKC Unicode normalization (collapses compatibility forms)
    - Strips zero-width and invisible Unicode characters
    - Removes trailing terminal punctuation that doesn't change meaning
      ("?", "!", ".", "…", "ๆ", etc.)
    - Collapses internal whitespace
    - Case-folds the resulting string

    Cached questions that differ only by these transformations will now
    match the same exact-key.
    """
    if not question:
        return ""
    text = unicodedata.normalize("NFKC", question)
    # Strip zero-width and bidi marks
    text = "".join(
        ch for ch in text if not (0x200B <= ord(ch) <= 0x200F or ord(ch) in {0xFEFF, 0x2060})
    )
    text = text.strip().casefold()
    # Drop trailing question/exclamation marks and the repeating-ๆ marker
    text = re.sub(r"[?.!\u0e46\u2026]+\s*$", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def context_fingerprint(
    resolved_notebooks: Any,
    language: str = "",
    knowledge_version: Optional[int] = None,
    tenant_id: Optional[str] = None,
    prompt_version: str = "v1",
) -> str:
    """
    Phase 1+2 cache-scope fingerprint.

    Scope reuse to the same notebooks (or same global fallback context),
    tied to:
    - tenant (so answers do not leak across tenants/users)
    - knowledge_version (so a doc edit invalidates answers automatically)
    - prompt_version (so a prompt change invalidates old cached answers)
    - language (so answers are not reused across locales)
    """
    parts: List[str] = [
        f"tenant={tenant_id or 'default'}",
        f"lang={_normalize_language_tag(language)}",
        f"prompt={_normalize_language_tag(prompt_version)}",
    ]
    notebook_ids = sorted(str(block.notebook_id) for block in resolved_notebooks.resolved)
    # A global search has no notebook boundary, so include its retrieved context
    # to prevent answers leaking between unrelated result sets.
    if not notebook_ids:
        notebook_ids = [str(chunk) for chunk in resolved_notebooks.global_fallback_chunks]
    parts.extend(f"nb={nb_id}" for nb_id in notebook_ids)
    parts.append(f"out_of_rag={resolved_notebooks.out_of_rag}")
    if knowledge_version is not None:
        parts.append(f"kv={knowledge_version}")
    return _hash("|".join(parts))


def _normalize_language_tag(value: str) -> str:
    """Allow language/prompt-version strings to participate in the hash safely."""
    return (value or "").strip().lower()


def _estimate_tokens_saved(match_kind: str, similarity: float) -> int:
    """
    Heuristic token savings estimate used for accounting, not billing.

    Exact hits save the question + all context chunks that would have been
    sent to the LLM. Semantic hits save the same but at a slightly lower
    confidence level.
    """
    base = _AVG_TOKENS_PER_QUESTION + _AVG_TOKENS_PER_CONTEXT_CHUNK
    if match_kind == "exact":
        return base
    if match_kind == "semantic":
        # Penalize the estimate by the inverse similarity so high-confidence
        # hits report more savings than marginal ones.
        confidence = max(0.5, min(1.0, similarity))
        return int(base * confidence)
    return 0


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left) * sum(b * b for b in right))
    return dot / norm if norm else 0.0


CacheMatch = Dict[str, Any]
"""Return type for answer-cache lookups.

Keys:
    match_type: "exact" | "semantic" | "miss"
    similarity: cosine similarity of the best semantic candidate (0.0 if miss)
    tokens_saved: heuristic number of LLM tokens that this hit avoided
    cached_question: the original (normalized) question that produced the hit
    created_at: ISO timestamp of when the cache entry was created
    expires_at: ISO timestamp of when the entry will expire
"""


def _empty_match() -> CacheMatch:
    return {
        "match_type": "miss",
        "similarity": 0.0,
        "tokens_saved": 0,
        "cached_question": None,
        "created_at": None,
        "expires_at": None,
    }


def _entry_metadata(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "cached_question": entry.get("normalized_question") or entry.get("question"),
        "created_at": entry.get("created_at"),
        "expires_at": entry.get("expires_at"),
    }


async def get_cached_answer(
    question: str,
    context_key: str,
    language: str,
) -> Tuple[Optional[str], Optional[List[float]], CacheMatch]:
    """
    Return an exact/semantic match, the reusable query embedding, and a
    detailed match descriptor (for metrics and downstream logging).

    The match descriptor replaces the previous "exact"|"semantic"|"miss"
    string token so callers can record similarity, tokens_saved, and entry
    timestamps without re-querying Redis.
    """
    normalized = _normalize_question(question)
    scope = _hash(f"{context_key}:{_normalize_language_tag(language)}")
    exact_key = f"answer:exact:{scope}:{_hash(normalized)}"
    exact = await cache_service.get_json(exact_key)
    if isinstance(exact, dict) and exact.get("answer"):
        match: CacheMatch = {
            "match_type": "exact",
            "similarity": 1.0,
            "tokens_saved": _estimate_tokens_saved("exact", 1.0),
            **_entry_metadata(exact),
        }
        logger.info(f"Answer cache exact HIT scope={scope[:12]}")
        cache_metrics.record_answer_hit("exact", match["tokens_saved"])
        return str(exact["answer"]), None, match

    entries = await cache_service.get_json(f"answer:semantic:{scope}") or []
    if not isinstance(entries, list) or not entries:
        cache_metrics.record_answer_miss("miss")
        return None, None, _empty_match()

    try:
        embedding = await generate_embedding(normalized)
    except Exception as exc:
        logger.warning(f"Semantic answer cache lookup skipped: {exc}")
        cache_metrics.record_answer_miss("embedding_error")
        return None, None, _empty_match()

    best = max(
        (
            (_cosine(embedding, entry.get("embedding", [])), entry)
            for entry in entries
            if isinstance(entry, dict) and entry.get("answer")
        ),
        default=(0.0, None),
        key=lambda item: item[0],
    )
    if best[1] is not None and best[0] >= ANSWER_CACHE_THRESHOLD:
        kind = "semantic"
        match = {
            "match_type": kind,
            "similarity": float(best[0]),
            "tokens_saved": _estimate_tokens_saved(kind, float(best[0])),
            **_entry_metadata(best[1]),
        }
        logger.info(
            f"Answer cache semantic HIT scope={scope[:12]} "
            f"similarity={best[0]:.4f}"
        )
        cache_metrics.record_answer_hit(kind, match["tokens_saved"])
        return str(best[1]["answer"]), embedding, match

    cache_metrics.record_answer_miss("below_threshold")
    miss = _empty_match()
    miss["similarity"] = float(best[0]) if best[1] is not None else 0.0
    return None, embedding, miss


async def set_cached_answer(
    question: str,
    answer: str,
    context_key: str,
    language: str,
    embedding: Optional[List[float]] = None,
    scope_metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Store an answer for free exact hits and low-cost semantic hits.

    Phase 1 expansion:
    - Persist normalized_question, created_at, expires_at so cache entries
      are self-describing for the analytics dashboard.
    - Merge scope_metadata (tenant_id, knowledge_version, prompt_version,
      intent, entities, quality_score) so later phases can use them without
      changing the public signature.
    """
    if not answer:
        return
    normalized = _normalize_question(question)
    scope = _hash(f"{context_key}:{_normalize_language_tag(language)}")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ANSWER_CACHE_TTL)
    metadata: Dict[str, Any] = {
        "question": question,
        "normalized_question": normalized,
        "answer": answer,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    if scope_metadata:
        metadata.update(scope_metadata)

    await cache_service.set_json(
        f"answer:exact:{scope}:{_hash(normalized)}",
        metadata,
        ttl=ANSWER_CACHE_TTL,
    )
    cache_metrics.record_answer_set()

    try:
        query_embedding = embedding or await generate_embedding(normalized)
    except Exception as exc:
        logger.warning(f"Semantic answer cache store skipped: {exc}")
        return

    index_key = f"answer:semantic:{scope}"
    entries = await cache_service.get_json(index_key) or []
    if not isinstance(entries, list):
        entries = []
    # Cap size: keep the most recent ANSWER_CACHE_MAX_ENTRIES entries.
    entries = [entry for entry in entries if entry.get("normalized_question") != normalized]
    metadata["embedding"] = query_embedding
    entries.append(metadata)
    await cache_service.set_json(
        index_key, entries[-ANSWER_CACHE_MAX_ENTRIES:], ttl=ANSWER_CACHE_TTL
    )
