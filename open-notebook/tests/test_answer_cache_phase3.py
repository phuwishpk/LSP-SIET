"""
Phase 3 tests for the semantic cache 3-tier thresholds + metadata.

Focused, side-effect-free coverage of the new helpers:
- ``_classify_semantic`` returns "high" / "mid" / "low" per threshold
- ``get_cached_answer`` match dict includes Phase 3 fields
  (intent_validation_required, candidate_answer, hit_count, …)
- Similarity distribution buckets cover all expected ranges
- ``set_cached_answer`` accepts intent/entities/quality_score kwargs and
  persists them into both exact and semantic entries
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from open_notebook.cache.answer_cache import (
    ANSWER_CACHE_HIGH_THRESHOLD,
    ANSWER_CACHE_MID_THRESHOLD,
    _classify_semantic,
    get_cached_answer,
    set_cached_answer,
)
from open_notebook.cache.metrics import cache_metrics


class TestClassifySemantic:
    def test_high_band(self):
        assert _classify_semantic(ANSWER_CACHE_HIGH_THRESHOLD) == "high"
        assert _classify_semantic(0.99) == "high"
        assert _classify_semantic(1.0) == "high"

    def test_mid_band(self):
        assert _classify_semantic(ANSWER_CACHE_MID_THRESHOLD) == "mid"
        assert _classify_semantic(0.95) == "mid"
        assert _classify_semantic(ANSWER_CACHE_HIGH_THRESHOLD - 0.005) == "mid"

    def test_low_band(self):
        assert _classify_semantic(0.0) == "low"
        assert _classify_semantic(0.5) == "low"
        assert _classify_semantic(ANSWER_CACHE_MID_THRESHOLD - 0.005) == "low"


class TestSimilarityDistribution:
    def setup_method(self):
        cache_metrics.reset()

    def test_buckets_initialized(self):
        dist = cache_metrics.similarity_distribution
        assert set(dist.keys()) == {
            "0.00-0.70",
            "0.70-0.85",
            "0.85-0.92",
            "0.92-0.94",
            "0.94-0.97",
            "0.97-1.00",
        }
        for v in dist.values():
            assert v == 0

    def test_recording_increments_correct_bucket(self):
        cache_metrics._record_similarity_internal(0.96)  # 0.94-0.97
        cache_metrics._record_similarity_internal(0.98)  # 0.97-1.00
        cache_metrics._record_similarity_internal(0.50)  # 0.00-0.70
        dist = cache_metrics.similarity_distribution
        assert dist["0.94-0.97"] == 1
        assert dist["0.97-1.00"] == 1
        assert dist["0.00-0.70"] == 1
        assert dist["0.92-0.94"] == 0


class TestThreeTierHitCounters:
    def setup_method(self):
        cache_metrics.reset()

    def test_exact_hit_increments(self):
        cache_metrics.record_answer_hit("exact", tokens_saved=100)
        s = cache_metrics.get_summary()["answer_cache"]
        assert s["exact_hits"] == 1
        assert s["semantic_high_hits"] == 0

    def test_semantic_high_increments(self):
        cache_metrics.record_answer_hit("semantic_high", tokens_saved=80)
        s = cache_metrics.get_summary()["answer_cache"]
        assert s["semantic_high_hits"] == 1
        # semantic_hits is the rollup
        assert s["semantic_hits"] == 1

    def test_semantic_mid_increments(self):
        cache_metrics.record_answer_hit("semantic_mid", tokens_saved=0)
        s = cache_metrics.get_summary()["answer_cache"]
        assert s["semantic_mid_hits"] == 1
        assert s["semantic_hits"] == 1

    def test_low_rejected_counter(self):
        cache_metrics.record_semantic_low_rejected()
        cache_metrics.record_semantic_low_rejected()
        s = cache_metrics.get_summary()["answer_cache"]
        assert s["semantic_low_rejected"] == 2


class TestEntryHitCount:
    def setup_method(self):
        cache_metrics.reset()

    def test_hit_count_running_max(self):
        cache_metrics.record_answer_entry_hit(1)
        cache_metrics.record_answer_entry_hit(3)
        cache_metrics.record_answer_entry_hit(7)
        s = cache_metrics.get_summary()["answer_cache"]
        assert s["total_entry_hits"] == 3
        assert s["max_entry_hits"] == 7


class TestGetCachedAnswerMatchShape:
    @pytest.mark.asyncio
    async def test_exact_match_shape_includes_hit_count(self):
        # Pre-populate Redis with a fake exact entry
        fake_entry = {
            "answer": "cached",
            "normalized_question": "what is x?",
            "hit_count": 4,
            "created_at": "2026-08-10T00:00:00+00:00",
            "expires_at": "2026-08-10T01:00:00+00:00",
        }
        with patch(
            "open_notebook.cache.answer_cache.cache_service.get_json",
            new=AsyncMock(return_value=fake_entry),
        ), patch(
            "open_notebook.cache.answer_cache._increment_entry_hit_count",
            new=AsyncMock(return_value=5),
        ):
            answer, emb, match = await get_cached_answer(
                "What is x?", "ctx", "en"
            )
        assert answer == "cached"
        assert match["match_type"] == "exact"
        assert match["similarity"] == 1.0
        assert match["hit_count"] == 5

    @pytest.mark.asyncio
    async def test_miss_match_shape(self):
        # No entries anywhere
        with patch(
            "open_notebook.cache.answer_cache.cache_service.get_json",
            new=AsyncMock(return_value=None),
        ):
            answer, emb, match = await get_cached_answer("zzz", "ctx", "en")
        assert answer is None
        assert match["match_type"] == "miss"
        assert match["hit_count"] == 0  # default

    @pytest.mark.asyncio
    async def test_semantic_mid_match_shape(self):
        # Pre-populate semantic index with an entry whose similarity will
        # land in the MID band.
        fake_entry = {
            "answer": "candidate",
            "normalized_question": "what is x?",
            "intent": "definition",
            "entities": {"year": "2025"},
            "hit_count": 2,
            "embedding": [0.0] * 4,
            "created_at": "2026-08-10T00:00:00+00:00",
            "expires_at": "2026-08-10T01:00:00+00:00",
        }
        with patch(
            "open_notebook.cache.answer_cache.cache_service.get_json",
            new=AsyncMock(return_value=[fake_entry]),
        ), patch(
            "open_notebook.cache.answer_cache.generate_embedding",
            new=AsyncMock(return_value=[1.0, 1.0, 1.0, 1.0]),
        ), patch(
            "open_notebook.cache.answer_cache._cosine",
            return_value=0.95,
        ):
            answer, emb, match = await get_cached_answer("What is x?", "ctx", "en")
        # MID band means: don't return the answer, but expose candidate info.
        assert answer is None
        assert match["match_type"] == "semantic_mid"
        assert match["intent_validation_required"] is True
        assert match["candidate_answer"] == "candidate"
        assert match["candidate_intent"] == "definition"
        assert match["candidate_entities"] == {"year": "2025"}


class TestSetCachedAnswerMetadata:
    @pytest.mark.asyncio
    async def test_intent_entities_quality_persisted(self):
        captured: dict = {}

        async def fake_set_json(key, value, ttl=None):
            captured["key"] = key
            captured["value"] = value
            captured["ttl"] = ttl
            return True

        with patch(
            "open_notebook.cache.answer_cache.cache_service.set_json",
            new=AsyncMock(side_effect=fake_set_json),
        ), patch(
            "open_notebook.cache.answer_cache.generate_embedding",
            new=AsyncMock(side_effect=Exception("no embeddings in test")),
        ):
            await set_cached_answer(
                "What is x?",
                "the answer",
                "ctx",
                "en",
                intent="definition",
                entities={"year": "2026"},
                quality_score=0.91,
            )

        # First call is the exact-key write; check it carries our metadata
        assert "answer:exact:" in captured["key"]
        stored = captured["value"]
        assert stored["intent"] == "definition"
        assert stored["entities"] == {"year": "2026"}
        assert stored["quality_score"] == 0.91
        assert stored["hit_count"] == 0
        assert stored["last_hit_at"] == stored["created_at"]
