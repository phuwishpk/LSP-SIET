"""Cheap, fail-safe intent validation for semantic-mid answer-cache hits."""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import TYPE_CHECKING, Any, Optional

from loguru import logger

from open_notebook.ai.models import model_manager
from open_notebook.cache.metrics import cache_metrics
from open_notebook.config import (
    ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED,
    ANSWER_CACHE_INTENT_TIMEOUT_MS,
    ANSWER_CACHE_INTENT_VALIDATOR_ENABLED,
)
from open_notebook.utils.text_utils import extract_text_content

if TYPE_CHECKING:
    from open_notebook.cache.circuit_breaker import CircuitBreaker


def _parse_json_object(text: str) -> dict[str, Any]:
    """Parse a small JSON response, tolerating fenced model output."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.I)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Model response did not contain a JSON object")
    value = json.loads(cleaned[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("Model response was not a JSON object")
    return value


async def _invoke_json_model(prompt: str, model_id: str) -> dict[str, Any]:
    model = await model_manager.get_model(model_id)
    if model is None:
        raise ValueError(f"Intent-validation model '{model_id}' is unavailable")
    # ModelManager returns Esperanto model wrappers; graph code consumes their
    # LangChain adapter. Accept a native LangChain model too for compatibility.
    langchain_model = model.to_langchain() if hasattr(model, "to_langchain") else model
    response = await langchain_model.ainvoke(prompt)
    return _parse_json_object(extract_text_content(response.content))


async def _extract_intent_and_entities(
    question: str, model_id: str
) -> tuple[str, dict[str, Any]]:
    """Extract a compact intent label and answer-changing entities."""
    if not question or not question.strip() or not model_id:
        return "", {}
    prompt = f"""Classify this user question for answer-cache matching.
Return JSON only, with this exact shape:
{{"intent":"short_snake_case_label","entities":{{}}}}
Entities must include only values that can change the answer, such as year,
date, person, organization, product version, quantity, negation, or location.

Question: {question}
"""
    try:
        result = await asyncio.wait_for(
            _invoke_json_model(prompt, model_id),
            timeout=ANSWER_CACHE_INTENT_TIMEOUT_MS / 1000,
        )
        intent = str(result.get("intent") or "").strip().lower()
        entities = result.get("entities") or {}
        if not isinstance(entities, dict):
            entities = {}
        return intent, entities
    except Exception as exc:
        logger.warning(f"Intent extraction skipped: {exc}")
        return "", {}


async def validate_intent_match(
    new_question: str,
    cached_question: str,
    cached_intent: Optional[str] = None,
    cached_entities: Optional[dict[str, Any]] = None,
    new_intent: Optional[str] = None,
    new_entities: Optional[dict[str, Any]] = None,
    model_id: str = "",
) -> Optional[bool]:
    """Return True/False, or None when validation cannot be trusted.

    None is deliberately distinct from False so callers can monitor timeouts
    and provider errors while applying the same safe fallback: generate a
    fresh answer.
    """
    if not ANSWER_CACHE_INTENT_VALIDATOR_ENABLED:
        return None

    cb = _get_circuit_breaker()
    # _check_transition is async — schedule it without awaiting
    import asyncio
    asyncio.create_task(cb._check_transition())

    if cb.is_open():
        logger.debug("Intent validation blocked: circuit OPEN")
        cache_metrics.record_intent_validation(False, 0)
        return None

    if not cached_intent or not model_id:
        logger.info("Intent validation skipped: cached intent/model unavailable")
        cache_metrics.record_intent_validation(False, 0)
        return None

    prompt = f"""Decide whether two questions require the same factual answer.
Return JSON only: {{"same_intent":true}} or {{"same_intent":false}}.
Return false when a year, date, number, person, organization, product version,
location, negation, comparison target, or requested operation differs.

Cached question: {cached_question}
Cached intent: {cached_intent}
Cached entities: {json.dumps(cached_entities or {}, ensure_ascii=False, sort_keys=True)}

New question: {new_question}
New intent (if known): {new_intent or "unknown"}
New entities (if known): {json.dumps(new_entities or {}, ensure_ascii=False, sort_keys=True)}
"""
    started = time.perf_counter()
    passed = False
    try:
        result = await asyncio.wait_for(
            _invoke_json_model(prompt, model_id),
            timeout=ANSWER_CACHE_INTENT_TIMEOUT_MS / 1000,
        )
        value = result.get("same_intent")
        if not isinstance(value, bool):
            raise ValueError("Validator did not return a boolean same_intent")
        passed = value
        if cb.is_closed():
            await cb.record_success()
        return passed
    except asyncio.TimeoutError:
        logger.warning("Intent validation timed out; generating a fresh answer")
        if cb.state.value != "half_open":
            await cb.record_failure()
        return None
    except Exception as exc:
        logger.warning(f"Intent validation failed safely: {exc}")
        if cb.state.value != "half_open":
            await cb.record_failure()
        return None
    finally:
        latency_ms = int((time.perf_counter() - started) * 1000)
        cache_metrics.record_intent_validation(passed, latency_ms)


_cb_instance: Optional["CircuitBreaker"] = None
_cb_initialized: bool = False


def _get_circuit_breaker() -> "CircuitBreaker":
    global _cb_instance, _cb_initialized
    if _cb_instance is None:
        from open_notebook.cache.circuit_breaker import (
            ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED,
            circuit_breaker,
        )
        if ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED:
            # Lazy async init: schedule if not yet done
            if not _cb_initialized:
                import asyncio
                asyncio.create_task(circuit_breaker._load())
                _cb_initialized = True
            _cb_instance = circuit_breaker
        else:
            class NoOpCB:
                state = type("S", (), {"value": "closed"})()
                is_open = lambda self: False
                is_closed = lambda self: True
                async def record_success(self): pass
                async def record_failure(self): pass
                async def _check_transition(self): pass
            _cb_instance = NoOpCB()
    return _cb_instance
