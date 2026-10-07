"""
Token accounting for every provider call (chat, embedding, web search).

Each call that goes through the throttle gate also leaves one row in
``llm_usage`` with the tokens the provider reported (or an estimate for
embeddings, which report nothing), the feature that caused it, the user it was
for, and the estimated cost. The admin page aggregates those rows.

Who the call is for is usually known by the caller (``owner_id``); where it is
not (the embedding batch deep inside ingestion), the request sets a
:func:`set_context` once and every call underneath inherits it.
"""

from __future__ import annotations

import contextvars
import time
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger
from sqlalchemy import text

from open_notebook.community import pricing

_ctx: contextvars.ContextVar[Dict[str, Any]] = contextvars.ContextVar("llm_usage_ctx", default={})

KIND_CHAT = "chat"
KIND_EMBEDDING = "embedding"


def set_context(feature: Optional[str] = None, user_id: Optional[int] = None) -> None:
    """Tag every provider call made while handling this request / task."""
    current = dict(_ctx.get())
    if feature:
        current["feature"] = feature
    if user_id is not None:
        current["user_id"] = int(user_id)
    _ctx.set(current)


def context() -> Dict[str, Any]:
    return dict(_ctx.get())


def chat_usage_from_message(message: Any) -> Dict[str, int]:
    """
    Tokens from a LangChain ``AIMessage``.

    ``usage_metadata`` is the normalised form every provider fills
    (``input_tokens`` includes the cached part, reported separately under
    ``input_token_details.cache_read``; reasoning tokens under
    ``output_token_details.reasoning``). Gemini's raw ``usage_metadata`` in
    ``response_metadata`` is the fallback.
    """
    usage = getattr(message, "usage_metadata", None) or {}
    if not isinstance(usage, dict):
        usage = {}
    details_in = usage.get("input_token_details") or {}
    details_out = usage.get("output_token_details") or {}
    out = {
        "input_tokens": int(usage.get("input_tokens") or 0),
        "output_tokens": int(usage.get("output_tokens") or 0),
        "cached_tokens": int((details_in or {}).get("cache_read") or 0),
        "thinking_tokens": int((details_out or {}).get("reasoning") or 0),
    }
    if out["input_tokens"] or out["output_tokens"]:
        return out
    raw = (getattr(message, "response_metadata", None) or {}).get("usage_metadata") or {}
    if isinstance(raw, dict):
        out["input_tokens"] = int(raw.get("prompt_token_count") or 0)
        out["output_tokens"] = int(raw.get("candidates_token_count") or 0)
        out["cached_tokens"] = int(raw.get("cached_content_token_count") or 0)
        out["thinking_tokens"] = int(raw.get("thoughts_token_count") or 0)
    return out


def search_queries_from_metadata(metadata: Optional[Dict[str, Any]]) -> int:
    if not isinstance(metadata, dict):
        return 0
    queries = metadata.get("web_search_queries") or []
    return len([q for q in queries if q]) if isinstance(queries, list) else 0


def estimate_tokens(texts: Sequence[str]) -> int:
    """Embedding calls report no usage; count what we sent instead."""
    try:
        from open_notebook.utils.token_utils import token_count

        return sum(token_count(t or "") for t in texts)
    except Exception:  # pragma: no cover - tokenizer missing
        return sum(max(1, len(t or "") // 4) for t in texts)


async def record(
    *,
    kind: str,
    model: Optional[str],
    provider: Optional[str] = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_tokens: int = 0,
    thinking_tokens: int = 0,
    search_queries: int = 0,
    latency_ms: Optional[int] = None,
    feature: Optional[str] = None,
    user_id: Optional[Any] = None,
    estimated: bool = False,
) -> None:
    """Write one usage row. Never raises: accounting must not break an answer."""
    ctx = context()
    feature = feature or ctx.get("feature") or ("embedding" if kind == KIND_EMBEDDING else "chat")
    uid: Optional[int] = None
    for candidate in (user_id, ctx.get("user_id")):
        if candidate is None:
            continue
        try:
            uid = int(str(candidate))
            break
        except (TypeError, ValueError):
            continue
    cost = pricing.estimate_cost_usd(
        model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_tokens,
        thinking_tokens=thinking_tokens,
    )
    try:
        from open_notebook.domain.user import _mariadb_session

        async with _mariadb_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO llm_usage
                      (user_id, feature, kind, provider, model, input_tokens, output_tokens,
                       cached_tokens, thinking_tokens, search_queries, cost_usd, latency_ms, estimated)
                    VALUES
                      (:uid, :feature, :kind, :provider, :model, :inp, :out,
                       :cached, :thinking, :queries, :cost, :latency, :estimated)
                    """
                ),
                {
                    "uid": uid,
                    "feature": str(feature)[:32],
                    "kind": kind[:16],
                    "provider": (provider or None) and str(provider)[:32],
                    "model": (model or None) and str(model)[:96],
                    "inp": int(input_tokens),
                    "out": int(output_tokens),
                    "cached": int(cached_tokens),
                    "thinking": int(thinking_tokens),
                    "queries": int(search_queries),
                    "cost": cost,
                    "latency": latency_ms,
                    "estimated": 1 if estimated else 0,
                },
            )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(f"llm usage: could not record {kind}/{feature}: {exc}")


class Timer:
    """``with Timer() as t: ...; t.ms``"""

    def __enter__(self) -> "Timer":
        self._start = time.monotonic()
        self.ms = 0
        return self

    def __exit__(self, *exc: Any) -> None:
        self.ms = int((time.monotonic() - self._start) * 1000)
