"""Shared exact and semantic cache for notebook answers."""

from __future__ import annotations

import hashlib
import math
import os
import re
from typing import Any, Optional

from loguru import logger

from open_notebook.cache.service import cache_service
from open_notebook.utils.embedding import generate_embedding


ANSWER_CACHE_TTL = int(os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_TTL", "3600"))
ANSWER_CACHE_THRESHOLD = float(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_SIMILARITY", "0.94")
)
ANSWER_CACHE_MAX_ENTRIES = int(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_MAX_ENTRIES", "100")
)


def _normalize_question(question: str) -> str:
    return re.sub(r"\s+", " ", question.strip().casefold())


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def context_fingerprint(resolved_notebooks: Any) -> str:
    """Scope reuse to the same notebooks (or same global fallback context)."""
    parts = sorted(str(block.notebook_id) for block in resolved_notebooks.resolved)
    # A global search has no notebook boundary, so include its retrieved context
    # to prevent answers leaking between unrelated result sets.
    if not parts:
        parts.extend(
            str(chunk) for chunk in resolved_notebooks.global_fallback_chunks
        )
    parts.append(f"out_of_rag={resolved_notebooks.out_of_rag}")
    return _hash("\n".join(parts))


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left) * sum(b * b for b in right))
    return dot / norm if norm else 0.0


async def get_cached_answer(
    question: str, context_key: str, language: str
) -> tuple[Optional[str], Optional[list[float]], str]:
    """Return an exact/semantic match and the reusable query embedding."""
    normalized = _normalize_question(question)
    scope = _hash(f"{context_key}:{language}")
    exact_key = f"answer:exact:{scope}:{_hash(normalized)}"
    exact = await cache_service.get_json(exact_key)
    if isinstance(exact, dict) and exact.get("answer"):
        logger.info("Answer cache exact HIT")
        return str(exact["answer"]), None, "exact"

    entries = await cache_service.get_json(f"answer:semantic:{scope}") or []
    if not isinstance(entries, list) or not entries:
        return None, None, "miss"

    try:
        embedding = await generate_embedding(normalized)
    except Exception as exc:
        logger.warning(f"Semantic answer cache lookup skipped: {exc}")
        return None, None, "miss"

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
        logger.info(f"Answer cache semantic HIT (similarity={best[0]:.4f})")
        return str(best[1]["answer"]), embedding, "semantic"
    return None, embedding, "miss"


async def set_cached_answer(
    question: str,
    answer: str,
    context_key: str,
    language: str,
    embedding: Optional[list[float]] = None,
) -> None:
    """Store an answer for free exact hits and low-cost semantic hits."""
    if not answer:
        return
    normalized = _normalize_question(question)
    scope = _hash(f"{context_key}:{language}")
    await cache_service.set_json(
        f"answer:exact:{scope}:{_hash(normalized)}",
        {"answer": answer},
        ttl=ANSWER_CACHE_TTL,
    )
    try:
        query_embedding = embedding or await generate_embedding(normalized)
    except Exception as exc:
        logger.warning(f"Semantic answer cache store skipped: {exc}")
        return

    index_key = f"answer:semantic:{scope}"
    entries = await cache_service.get_json(index_key) or []
    if not isinstance(entries, list):
        entries = []
    entries = [entry for entry in entries if entry.get("question") != normalized]
    entries.append(
        {"question": normalized, "answer": answer, "embedding": query_embedding}
    )
    await cache_service.set_json(
        index_key, entries[-ANSWER_CACHE_MAX_ENTRIES:], ttl=ANSWER_CACHE_TTL
    )
