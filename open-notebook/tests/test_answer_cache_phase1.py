"""
Phase 1 tests for the answer cache.

Focuses on pure-Python helpers that don't need a live Redis or SurrealDB:
- question normalization (NFKC, zero-width strip, trailing punctuation)
- context fingerprint stability across the supported scopes
- token-savings estimator
- CacheMetrics counters round-trip through get_summary() / reset()
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from open_notebook.cache.answer_cache import (
    ANSWER_CACHE_HIGH_THRESHOLD,
    ANSWER_CACHE_MID_THRESHOLD,
    ANSWER_CACHE_THRESHOLD,
    _estimate_tokens_saved,
    _normalize_question,
    context_fingerprint,
)
from open_notebook.cache.metrics import cache_metrics


class TestNormalizeQuestion:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("What is AI?", "what is ai"),
            ("what  is   AI", "what is ai"),
            ("  HELLO  ", "hello"),
            ("สวัสดีครับ?", "สวัสดีครับ"),
            ("สวัสดีครับ??!!", "สวัสดีครับ"),
            ("price??", "price"),
            ("Hello\u200bWorld", "helloworld"),
            ("Hello\u200cWorld", "helloworld"),
            ("Hello\u200dWorld", "helloworld"),
            ("\ufeffhello", "hello"),
            ("Test\u2060test", "testtest"),
            # NFKC: full-width digits collapse to ASCII
            ("\uff11\uff12\uff13", "123"),
            # NFKC: ligatures collapse
            ("\ufb01nd", "find"),
        ],
    )
    def test_normalized_matches_expected(self, raw: str, expected: str):
        assert _normalize_question(raw) == expected

    def test_empty_string(self):
        assert _normalize_question("") == ""
        assert _normalize_question(None or "") == ""


class TestContextFingerprint:
    def _resolved(self, nb_ids=("nb:1",), out_of_rag=False, chunks=()):
        return SimpleNamespace(
            resolved=[SimpleNamespace(notebook_id=nb) for nb in nb_ids],
            out_of_rag=out_of_rag,
            global_fallback_chunks=list(chunks),
        )

    def test_same_notebooks_same_language_same_fingerprint(self):
        a = self._resolved(nb_ids=("nb:1", "nb:2"))
        b = self._resolved(nb_ids=("nb:2", "nb:1"))  # different order
        assert context_fingerprint(a, language="th") == context_fingerprint(
            b, language="th"
        )

    def test_different_languages_produce_different_fingerprints(self):
        a = self._resolved(nb_ids=("nb:1",))
        b = self._resolved(nb_ids=("nb:1",))
        assert context_fingerprint(a, language="th") != context_fingerprint(
            b, language="en"
        )

    def test_different_tenants_produce_different_fingerprints(self):
        a = self._resolved(nb_ids=("nb:1",))
        b = self._resolved(nb_ids=("nb:1",))
        assert context_fingerprint(a, tenant_id="user-1") != context_fingerprint(
            b, tenant_id="user-2"
        )

    def test_knowledge_version_changes_fingerprint(self):
        a = self._resolved(nb_ids=("nb:1",))
        b = self._resolved(nb_ids=("nb:1",))
        assert context_fingerprint(a, knowledge_version=1) != context_fingerprint(
            b, knowledge_version=2
        )

    def test_out_of_rag_distinct(self):
        a = self._resolved(nb_ids=(), out_of_rag=True)
        b = self._resolved(nb_ids=(), out_of_rag=False)
        assert context_fingerprint(a) != context_fingerprint(b)


class TestTokenSavingsEstimator:
    def test_exact_hit_baseline(self):
        assert _estimate_tokens_saved("exact", 1.0) > 0

    def test_semantic_hit_at_threshold(self):
        # Should still save tokens at the high threshold.
        assert _estimate_tokens_saved("semantic", ANSWER_CACHE_THRESHOLD) > 0

    def test_miss_saves_nothing(self):
        assert _estimate_tokens_saved("miss", 0.0) == 0

    def test_semantic_higher_similarity_saves_more(self):
        low = _estimate_tokens_saved("semantic", ANSWER_CACHE_MID_THRESHOLD)
        high = _estimate_tokens_saved("semantic", ANSWER_CACHE_HIGH_THRESHOLD)
        assert high >= low


class TestCacheMetrics:
    def setup_method(self):
        cache_metrics.reset()

    def test_exact_hit_increments_counter(self):
        cache_metrics.record_answer_hit("exact", tokens_saved=500)
        summary = cache_metrics.get_summary()
        ac = summary["answer_cache"]
        assert ac["exact_hits"] == 1
        assert ac["tokens_saved_estimated"] == 500
        assert ac["hit_rate"] > 0

    def test_semantic_hit_increments_counter(self):
        cache_metrics.record_answer_hit("semantic", tokens_saved=200)
        summary = cache_metrics.get_summary()
        ac = summary["answer_cache"]
        assert ac["semantic_hits"] == 1
        assert ac["tokens_saved_estimated"] == 200

    def test_miss_increments_counter(self):
        cache_metrics.record_answer_miss()
        summary = cache_metrics.get_summary()
        ac = summary["answer_cache"]
        assert ac["misses"] == 1

    def test_quality_failure_counter(self):
        cache_metrics.record_answer_quality_failure()
        cache_metrics.record_answer_quality_failure()
        summary = cache_metrics.get_summary()
        assert summary["answer_cache"]["quality_failures"] == 2

    def test_similarity_running_average(self):
        cache_metrics.record_answer_similarity(0.95)
        cache_metrics.record_answer_similarity(0.99)
        summary = cache_metrics.get_summary()
        # Average ≈ 0.97
        assert 0.96 < summary["answer_cache"]["avg_similarity"] < 0.98

    def test_reset_clears_answer_cache_metrics(self):
        cache_metrics.record_answer_hit("exact", 100)
        cache_metrics.record_answer_miss()
        cache_metrics.reset()
        summary = cache_metrics.get_summary()
        ac = summary["answer_cache"]
        assert ac["exact_hits"] == 0
        assert ac["semantic_hits"] == 0
        assert ac["misses"] == 0
        assert ac["tokens_saved_estimated"] == 0