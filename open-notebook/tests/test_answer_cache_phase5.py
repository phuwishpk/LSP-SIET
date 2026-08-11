"""Phase 5 adaptive-threshold tuning tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from open_notebook.cache.answer_cache import _classify_semantic
from open_notebook.cache.metrics import CacheMetrics, cache_metrics
from open_notebook.cache.threshold_tuner import ThresholdTuner, threshold_tuner
from open_notebook.config import (
    ANSWER_CACHE_TUNER_HIGH_MAX,
    ANSWER_CACHE_TUNER_MID_MAX,
    ANSWER_CACHE_TUNER_MID_MIN,
)


@pytest.fixture(autouse=True)
def reset_metrics_and_singleton():
    cache_metrics.reset()
    threshold_tuner.reset()
    yield
    cache_metrics.reset()
    threshold_tuner.reset()


@pytest.mark.asyncio
async def test_mid_threshold_rises_on_high_failure_rate():
    tuner = ThresholdTuner()
    cache_metrics.answer_cache_semantic_mid_hits = 100
    cache_metrics.answer_cache_quality_failures_by_source[
        "semantic_mid_via_intent_validation"
    ] = 20

    changed = await tuner._tune_once()

    assert changed is True
    assert tuner.get_mid_threshold() > 0.92


@pytest.mark.asyncio
async def test_mid_threshold_lowers_on_low_failure_rate():
    tuner = ThresholdTuner()
    cache_metrics.answer_cache_semantic_mid_hits = 100

    await tuner._tune_once()

    assert tuner.get_mid_threshold() < 0.92


@pytest.mark.asyncio
async def test_tuner_respects_max_and_high_mid_ordering():
    tuner = ThresholdTuner()
    cache_metrics.answer_cache_semantic_mid_hits = 1000
    cache_metrics.answer_cache_quality_failures_by_source[
        "semantic_mid_via_intent_validation"
    ] = 800

    for _ in range(30):
        await tuner._tune_once()

    assert tuner.get_mid_threshold() <= ANSWER_CACHE_TUNER_MID_MAX
    assert tuner.get_high_threshold() <= ANSWER_CACHE_TUNER_HIGH_MAX
    assert tuner.get_high_threshold() > tuner.get_mid_threshold()


@pytest.mark.asyncio
async def test_tuner_respects_min_bound():
    tuner = ThresholdTuner()
    cache_metrics.answer_cache_semantic_mid_hits = 1000

    for _ in range(30):
        await tuner._tune_once()

    assert tuner.get_mid_threshold() >= ANSWER_CACHE_TUNER_MID_MIN


@pytest.mark.asyncio
async def test_low_confidence_skips_adjustment():
    tuner = ThresholdTuner()
    cache_metrics.answer_cache_semantic_mid_hits = 5
    cache_metrics.answer_cache_quality_failures_by_source[
        "semantic_mid_via_intent_validation"
    ] = 3
    original = tuner.get_mid_threshold()

    changed = await tuner._tune_once()

    assert changed is False
    assert tuner.get_mid_threshold() == original


@pytest.mark.asyncio
async def test_intent_validator_unreliable_does_not_adjust():
    tuner = ThresholdTuner()
    cache_metrics.answer_cache_semantic_mid_hits = 100
    cache_metrics.answer_cache_intent_validations = 100
    cache_metrics.answer_cache_intent_fails = 70
    original = (tuner.get_high_threshold(), tuner.get_mid_threshold())

    changed = await tuner._tune_once()

    assert changed is False
    assert (tuner.get_high_threshold(), tuner.get_mid_threshold()) == original


@pytest.mark.asyncio
async def test_high_threshold_rises_on_quality_failures():
    tuner = ThresholdTuner()
    cache_metrics.answer_cache_semantic_high_hits = 100
    cache_metrics.answer_cache_quality_failures_by_source["semantic_high"] = 6
    original = tuner.get_high_threshold()

    await tuner._tune_once()

    assert tuner.get_high_threshold() > original


def test_compute_tuning_signals():
    cache_metrics.answer_cache_semantic_mid_hits = 100
    cache_metrics.answer_cache_quality_failures_by_source[
        "semantic_mid_via_intent_validation"
    ] = 20
    cache_metrics.answer_cache_intent_validations = 100
    cache_metrics.answer_cache_intent_fails = 25

    signals = cache_metrics.compute_tuning_signals()

    assert signals["mid_failure_rate"] == 0.2
    assert signals["intent_fail_ratio"] == 0.25
    assert signals["confidence"] == 1.0
    assert "similarity_distribution" in signals


def test_cache_classification_uses_tuner_thresholds():
    threshold_tuner._mid = 0.95
    threshold_tuner._high = 0.98

    assert _classify_semantic(0.93) == "low"
    assert _classify_semantic(0.96) == "mid"
    assert _classify_semantic(0.99) == "high"


def test_reset_restores_defaults():
    tuner = ThresholdTuner()
    tuner._high = 0.99
    tuner._mid = 0.96

    tuner.reset()

    assert tuner.get_high_threshold() == 0.97
    assert tuner.get_mid_threshold() == 0.92


def test_tuner_metrics_are_exposed_in_summary():
    metrics = CacheMetrics()

    metrics.record_tuner_adjustment(high=0.975, mid=0.925)
    answer_cache = metrics.get_summary()["answer_cache"]

    assert answer_cache["tuner_adjustments"] == 1
    assert answer_cache["tuner_high_threshold"] == pytest.approx(0.975)
    assert answer_cache["tuner_mid_threshold"] == pytest.approx(0.925)
