"""
AI helpers shared by the feature packages (siet_quiz, siet_roadmap) and the
community study tools: prompt hashing for cache keys, RAG retrieval and chunk
formatting, JSON extraction from a model reply and the one call into whichever
chat model the user configured (throttled, usage recorded).
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any, Dict, List, Optional

from loguru import logger

from siet_core.ai.models import model_manager
from siet_core.domain.notebook import text_search
from siet_core.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    RateLimitError,
)
from siet_core.utils.text_utils import extract_text_content
from siet_platform import throttle, usage

MAX_RAG_CONTEXT_CHARS = 12_000


def _hash_prompt(payload: Dict[str, Any]) -> str:
    """Stable content hash for cache-key derivation."""
    encoded = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:16]


async def _retrieve_rag_context(
    query: str,
    notebook_ids: Optional[List[str]] = None,
    *,
    scoped: bool = False,
    source_ids: Optional[List[str]] = None,
) -> str:
    """
    Retrieve relevant source/note snippets for every feature.

    When ``notebook_ids`` is given (a course library and/or the student's own
    uploads), retrieval is restricted to those notebooks - and to
    ``source_ids`` when specific documents were picked - so generated quizzes
    and roadmaps stay inside the chosen course material.

    ``scoped`` means the caller already resolved what the user may read (the
    study tools): no notebooks then means no library at all ("ไม่ใช้คลังความรู้",
    or nothing readable), never the whole workspace.
    """
    results: Any = None
    if notebook_ids:
        from siet_platform.retrieval import search_in_notebooks

        try:
            results = await search_in_notebooks(
                query, notebook_ids, results=8, source_ids=source_ids or None
            )
        except Exception as exc:
            logger.warning(f"Scoped RAG retrieval failed: {exc}")
            results = None
        # An explicit scope must not silently widen to the whole workspace.
        return _format_rag_chunks(results or [])
    if scoped:
        return ""

    if not results:
        try:
            results = await text_search(
                keyword=query,
                results=8,
                source=True,
                note=True,
            )
        except Exception as exc:
            # Empty/new workspaces must still be able to generate features.
            logger.warning(f"RAG retrieval skipped for {query!r}: {exc}")
            return ""

    return _format_rag_chunks(results or [])


def _format_rag_chunks(results: Any) -> str:
    chunks: List[str] = []
    for index, result in enumerate(results or [], start=1):
        if not isinstance(result, dict):
            continue
        title = str(result.get("title") or f"Knowledge item {index}")
        raw_matches = result.get("matches") or []
        if isinstance(raw_matches, str):
            raw_matches = [raw_matches]
        content = "\n".join(str(match) for match in raw_matches if match)
        if not content:
            content = str(result.get("content") or result.get("text") or "")
        if content.strip():
            chunks.append(f"[เอกสาร: {title}]\n{content.strip()}")

    return "\n\n".join(chunks)[:MAX_RAG_CONTEXT_CHARS]


async def _extract_json(raw: str) -> Dict[str, Any]:
    """Find the first JSON object inside an LLM response string."""
    if not raw:
        raise ExternalServiceError("LLM returned an empty response")

    text = raw.strip()
    # Strip optional ```json fences
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    # Find the first balanced JSON object
    decoder = json.JSONDecoder()
    idx = text.find("{")
    while idx != -1:
        try:
            return decoder.decode(text[idx:])
        except json.JSONDecodeError:
            idx = text.find("{", idx + 1)
    raise ExternalServiceError("LLM response did not contain valid JSON")


async def _invoke_chat(
    prompt: str,
    system: str,
    owner_id: str,
    default_type: str = "chat",
    model_id: Optional[str] = None,
    max_tokens: Optional[int] = None,
    feature: Optional[str] = None,
) -> str:
    """Single entry point that talks to whichever provider the user configured."""
    # Esperanto models default to max_tokens=850, which truncates long Thai
    # JSON (e.g. a 15-node roadmap) and makes the response unparseable.
    max_tokens = max_tokens or int(os.getenv("FEATURES_LLM_MAX_TOKENS", "8192") or 8192)
    try:
        if model_id:
            model = await model_manager.get_model(model_id, max_tokens=max_tokens)
        else:
            model = await model_manager.get_default_model(default_type, max_tokens=max_tokens)
    except Exception as exc:
        logger.error(f"Failed resolving model for feature: {exc}")
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )

    if model is None:
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )

    try:
        # Build the prompt as a single string, matching the convention used by
        # the rest of the core (see siet_core/graphs/ask.py).
        prompt = f"{system}\n\n{prompt}"
        # model_manager returns an Esperanto model; convert it to the LangChain
        # runnable interface (some providers, e.g. GoogleLanguageModel, do not
        # expose ``ainvoke`` themselves).
        runnable = model.to_langchain() if hasattr(model, "to_langchain") else model
        with usage.Timer() as timer:
            ai_message = await throttle.run(
                "chat", lambda: runnable.ainvoke(prompt), label=f"feature:{feature or default_type}"
            )
        await usage.record(
            kind=usage.KIND_CHAT,
            model=getattr(model, "model_name", None) or getattr(runnable, "model", None) or model_id,
            provider=getattr(model, "provider", None),
            latency_ms=timer.ms,
            feature=feature,
            user_id=owner_id,
            **usage.chat_usage_from_message(ai_message),
        )
        return extract_text_content(ai_message.content)
    except (throttle.ProviderBusy, RateLimitError):
        raise
    except Exception as exc:
        logger.exception(f"LLM call failed for owner {owner_id}: {exc}")
        raise ExternalServiceError(f"LLM call failed: {exc}")
