"""Phase 4 intent-validated semantic reuse tests."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from api.routers.search import _stream_notebook_ask_response
from open_notebook.cache.answer_cache import set_cached_answer
from open_notebook.cache.intent_validator import validate_intent_match
from open_notebook.cache.metrics import cache_metrics


@pytest.mark.asyncio
async def test_validate_intent_match_returns_true():
    with patch(
        "open_notebook.cache.intent_validator._invoke_json_model",
        new=AsyncMock(return_value={"same_intent": True}),
    ):
        result = await validate_intent_match(
            "ปัญญาประดิษฐ์หมายถึงอะไร",
            "AI คืออะไร",
            cached_intent="definition",
            cached_entities={},
            model_id="model:test",
        )
    assert result is True


@pytest.mark.asyncio
async def test_validate_intent_match_returns_false():
    with patch(
        "open_notebook.cache.intent_validator._invoke_json_model",
        new=AsyncMock(return_value={"same_intent": False}),
    ):
        result = await validate_intent_match(
            "ค่าเทอมปี 2026 เท่าไร",
            "ค่าเทอมปี 2025 เท่าไร",
            cached_intent="tuition_fee",
            cached_entities={"year": 2025},
            model_id="model:test",
        )
    assert result is False


@pytest.mark.asyncio
async def test_validate_intent_timeout_returns_none():
    async def slow_model(*_args, **_kwargs):
        await asyncio.sleep(0.05)
        return {"same_intent": True}

    with patch(
        "open_notebook.cache.intent_validator._invoke_json_model",
        side_effect=slow_model,
    ), patch(
        "open_notebook.cache.intent_validator.ANSWER_CACHE_INTENT_TIMEOUT_MS", 1
    ):
        result = await validate_intent_match(
            "new",
            "cached",
            cached_intent="definition",
            model_id="model:test",
        )
    assert result is None


@pytest.mark.asyncio
async def test_set_cached_answer_extracts_intent_automatically():
    writes: list[tuple[str, dict]] = []

    async def fake_set(key, value, ttl=None):
        writes.append((key, dict(value) if isinstance(value, dict) else value))
        return True

    with patch(
        "open_notebook.cache.answer_cache.generate_embedding",
        new=AsyncMock(return_value=[1.0, 0.0]),
    ), patch(
        "open_notebook.cache.intent_validator._extract_intent_and_entities",
        new=AsyncMock(return_value=("definition", {"topic": "AI"})),
    ), patch(
        "open_notebook.cache.answer_cache.cache_service.set_json",
        side_effect=fake_set,
    ), patch(
        "open_notebook.cache.answer_cache.cache_service.get_json",
        new=AsyncMock(return_value=[]),
    ):
        await set_cached_answer(
            "AI คืออะไร",
            "AI คือ...",
            "scope",
            "th",
            model_id="model:test",
        )

    exact = next(value for key, value in writes if key.startswith("answer:exact:"))
    assert exact["intent"] == "definition"
    assert exact["entities"] == {"topic": "AI"}


def _resolved(out_of_rag: bool = True):
    return SimpleNamespace(
        resolved=[],
        failed_refs=[],
        global_fallback_used=False,
        global_fallback_chunks=[],
        out_of_rag=out_of_rag,
    )


async def _collect_stream(**kwargs):
    events = []
    async for frame in _stream_notebook_ask_response(**kwargs):
        if frame.startswith("data: "):
            events.append(json.loads(frame[6:]))
    return events


def _stream_args(cache_match):
    model = SimpleNamespace(id="model:test")
    return dict(
        question="ปัญญาประดิษฐ์หมายถึงอะไร",
        strategy_model=model,
        answer_model=model,
        final_answer_model=model,
        resolved_notebooks=_resolved(),
        owner_id="tenant:test",
        language="th",
        context_key="scope",
        cached_answer=None,
        question_embedding=[1.0, 0.0],
        cache_match=cache_match,
    )


def _mid_match():
    return {
        "match_type": "semantic_mid",
        "similarity": 0.95,
        "tokens_saved": 0,
        "intent_validation_required": True,
        "candidate_answer": "AI คือปัญญาประดิษฐ์",
        "candidate_question": "AI คืออะไร",
        "candidate_intent": "definition",
        "candidate_entities": {},
    }


@pytest.mark.asyncio
async def test_mid_band_intent_pass_reuses_candidate():
    with patch(
        "api.routers.search.validate_intent_match", new=AsyncMock(return_value=True)
    ), patch(
        "api.routers.search._invoke_direct_answer", new=AsyncMock()
    ) as fresh:
        events = await _collect_stream(**_stream_args(_mid_match()))

    final = next(event for event in events if event["type"] == "final_answer")
    assert final["content"] == "AI คือปัญญาประดิษฐ์"
    assert final["intent_validated"] is True
    fresh.assert_not_awaited()


@pytest.mark.asyncio
async def test_mid_band_intent_fail_generates_fresh_answer():
    with patch(
        "api.routers.search.validate_intent_match", new=AsyncMock(return_value=False)
    ), patch(
        "api.routers.search._invoke_direct_answer",
        new=AsyncMock(return_value="คำตอบใหม่"),
    ), patch(
        "api.routers.search.set_cached_answer", new=AsyncMock()
    ):
        events = await _collect_stream(**_stream_args(_mid_match()))

    final = next(event for event in events if event["type"] == "final_answer")
    assert final["content"] == "คำตอบใหม่"
    assert final.get("intent_validated") is None


def test_intent_validation_metrics():
    cache_metrics.reset()
    cache_metrics.record_intent_validation(True, 200)
    cache_metrics.record_intent_validation(False, 400)
    stats = cache_metrics.get_summary()["answer_cache"]
    assert stats["intent_validations_total"] == 2
    assert stats["intent_validations_passed"] == 1
    assert stats["intent_validations_failed"] == 1
    assert stats["intent_validation_avg_latency_ms"] == 300

