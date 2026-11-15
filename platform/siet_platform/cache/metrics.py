"""
Cache metrics tracking for Open Notebook.

Tracks cache hit/miss ratios and invalidation events for monitoring.

Phase 1 additions:
- answer-cache-specific counters (exact/semantic/miss)
- token-savings accumulator (used by the analytics dashboard)
- quality-failure counter (incremented when the user reports a bad cached answer)
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict

from loguru import logger


@dataclass
class CacheMetrics:
    """Thread-safe cache metrics counter."""

    hits: int = 0
    misses: int = 0
    sets: int = 0
    invalidations: int = 0
    errors: int = 0
    last_reset: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    by_prefix: Dict[str, Dict[str, int]] = field(default_factory=dict)

    # ── Phase 1: answer-cache specific ────────────────────────────────────────
    answer_cache_exact_hits: int = 0
    answer_cache_semantic_hits: int = 0
    answer_cache_misses: int = 0
    answer_cache_sets: int = 0
    answer_cache_tokens_saved: int = 0
    answer_cache_quality_failures: int = 0
    answer_cache_similarity_sum: float = 0.0
    answer_cache_similarity_samples: int = 0
    # ── Phase 3: 3-tier semantic + distribution histogram ─────────────────────
    answer_cache_semantic_high_hits: int = 0   # similarity ≥ HIGH
    answer_cache_semantic_mid_hits: int = 0    # MID ≤ similarity < HIGH
    answer_cache_semantic_low_rejected: int = 0  # tracked for tuning
    answer_cache_total_entry_hits: int = 0     # sum of hit_count increments
    answer_cache_max_entry_hits: int = 0       # hottest cached question
    # ── Phase 4: intent-validator outcomes ────────────────────────────────────
    answer_cache_intent_validations: int = 0
    answer_cache_intent_passes: int = 0
    answer_cache_intent_fails: int = 0
    answer_cache_intent_validation_latency_ms: int = 0
    answer_cache_quality_failures_by_source: Dict[str, int] = field(default_factory=dict)
    # ── Phase 5: adaptive-threshold tuning signals ────────────────────────────
    answer_cache_mid_failure_rate: float = 0.0
    answer_cache_high_failure_rate: float = 0.0
    answer_cache_intent_fail_ratio: float = 0.0
    answer_cache_tuner_adjustments: int = 0
    answer_cache_tuner_high: float = 0.97
    answer_cache_tuner_mid: float = 0.92

    def _get_prefix_stats(self, prefix: str) -> Dict[str, int]:
        if prefix not in self.by_prefix:
            self.by_prefix[prefix] = {"hits": 0, "misses": 0, "sets": 0, "invalidations": 0}
        return self.by_prefix[prefix]

    # ── Phase 3: similarity histogram buckets ─────────────────────────────────
    SIMILARITY_BUCKETS = (
        "0.00-0.70",
        "0.70-0.85",
        "0.85-0.92",
        "0.92-0.94",
        "0.94-0.97",
        "0.97-1.00",
    )

    @staticmethod
    def _bucket_for(similarity: float) -> str:
        s = float(similarity)
        if s < 0.70:
            return "0.00-0.70"
        if s < 0.85:
            return "0.70-0.85"
        if s < 0.92:
            return "0.85-0.92"
        if s < 0.94:
            return "0.92-0.94"
        if s < 0.97:
            return "0.94-0.97"
        return "0.97-1.00"

    # ── Generic cache counters (used by CacheService) ─────────────────────────
    def record_hit(self, prefix: str = "") -> None:
        with self._lock:
            self.hits += 1
            if prefix:
                self._get_prefix_stats(prefix)["hits"] += 1

    def record_miss(self, prefix: str = "") -> None:
        with self._lock:
            self.misses += 1
            if prefix:
                self._get_prefix_stats(prefix)["misses"] += 1

    def record_set(self, prefix: str = "") -> None:
        with self._lock:
            self.sets += 1
            if prefix:
                self._get_prefix_stats(prefix)["sets"] += 1

    def record_invalidation(self, prefix: str = "", count: int = 1) -> None:
        with self._lock:
            self.invalidations += count
            if prefix:
                self._get_prefix_stats(prefix)["invalidations"] += count

    def record_error(self) -> None:
        with self._lock:
            self.errors += 1

    def record_answer_hit(self, kind: str, tokens_saved: int = 0) -> None:
        """kind: 'exact' | 'semantic' | 'semantic_high' | 'semantic_mid'."""
        with self._lock:
            if kind == "exact":
                self.answer_cache_exact_hits += 1
            elif kind == "semantic_high":
                self.answer_cache_semantic_high_hits += 1
                self.answer_cache_semantic_hits += 1
            elif kind == "semantic_mid":
                self.answer_cache_semantic_mid_hits += 1
                self.answer_cache_semantic_hits += 1
            elif kind == "semantic":
                # Backward compatibility: treat plain 'semantic' as the
                # combined counter. Phase 3 callers should prefer the
                # _high/_mid split so we can analyze the distribution.
                self.answer_cache_semantic_hits += 1
            self.hits += 1
            self.answer_cache_tokens_saved += int(tokens_saved or 0)

    def record_answer_miss(self, reason: str = "miss") -> None:
        with self._lock:
            self.answer_cache_misses += 1
            self.misses += 1

    def record_answer_set(self) -> None:
        with self._lock:
            self.answer_cache_sets += 1
            self.sets += 1

    def record_answer_quality_failure(self, source: str = "unknown") -> None:
        with self._lock:
            self.answer_cache_quality_failures += 1
            key = source if source in {
                "exact", "semantic_high", "semantic_mid_via_intent_validation", "fresh"
            } else "unknown"
            self.answer_cache_quality_failures_by_source[key] = (
                self.answer_cache_quality_failures_by_source.get(key, 0) + 1
            )

    def record_intent_validation(self, passed: bool, latency_ms: int) -> None:
        with self._lock:
            self.answer_cache_intent_validations += 1
            if passed:
                self.answer_cache_intent_passes += 1
            else:
                self.answer_cache_intent_fails += 1
            self.answer_cache_intent_validation_latency_ms += max(0, int(latency_ms))

    def record_answer_similarity(self, similarity: float) -> None:
        """Track the cosine similarity of every semantic lookup for histograms."""
        with self._lock:
            self.answer_cache_similarity_sum += float(similarity)
            self.answer_cache_similarity_samples += 1

    def record_answer_entry_hit(self, hit_count: int) -> None:
        """
        Phase 3: record that an existing cache entry has been re-used.
        Tracks the global "total entry hits" counter plus the running
        max so the dashboard can show the hottest cached question.
        """
        with self._lock:
            self.answer_cache_total_entry_hits += 1
            if hit_count > self.answer_cache_max_entry_hits:
                self.answer_cache_max_entry_hits = hit_count

    def record_semantic_low_rejected(self) -> None:
        with self._lock:
            self.answer_cache_semantic_low_rejected += 1

    def compute_tuning_signals(self) -> Dict[str, Any]:
        """Compute a consistent snapshot for the periodic threshold tuner."""
        with self._lock:
            mid_total = self.answer_cache_semantic_mid_hits
            high_total = self.answer_cache_semantic_high_hits
            validation_total = self.answer_cache_intent_validations
            mid_failures = self.answer_cache_quality_failures_by_source.get(
                "semantic_mid_via_intent_validation", 0
            )
            high_failures = self.answer_cache_quality_failures_by_source.get(
                "semantic_high", 0
            )
            mid_rate = mid_failures / mid_total if mid_total else 0.0
            high_rate = high_failures / high_total if high_total else 0.0
            intent_ratio = (
                self.answer_cache_intent_fails / validation_total
                if validation_total
                else 0.0
            )
            sample_count = max(mid_total, high_total, validation_total)
            confidence = min(1.0, sample_count / 100)
            self.answer_cache_mid_failure_rate = mid_rate
            self.answer_cache_high_failure_rate = high_rate
            self.answer_cache_intent_fail_ratio = intent_ratio
            return {
                "mid_failure_rate": round(mid_rate, 6),
                "high_failure_rate": round(high_rate, 6),
                "intent_fail_ratio": round(intent_ratio, 6),
                "similarity_distribution": self._similarity_distribution_unlocked(),
                "confidence": round(confidence, 4),
                "sample_count": sample_count,
                "mid_outcomes": mid_total,
                "high_outcomes": high_total,
                "intent_validations": validation_total,
            }

    def record_tuner_adjustment(self, high: float, mid: float) -> None:
        with self._lock:
            self.answer_cache_tuner_adjustments += 1
            self.answer_cache_tuner_high = float(high)
            self.answer_cache_tuner_mid = float(mid)

    def _similarity_distribution_unlocked(self) -> Dict[str, int]:
        """Internal: read bucket counts WITHOUT acquiring ``self._lock``.

        MUST be called while the caller already holds ``self._lock``.
        Splitting this out of :meth:`similarity_distribution` prevents a
        recursive-lock hang (Python ``threading.Lock`` is non-reentrant).
        """
        base = {bucket: 0 for bucket in self.SIMILARITY_BUCKETS}
        for k, v in self.by_prefix.items():
            if k.startswith("answer_cache:sim:"):
                bucket = k.split(":", 2)[2]
                if bucket in base:
                    base[bucket] += v.get("hits", 0)
        return base

    @property
    def similarity_distribution(self) -> Dict[str, int]:
        """Snapshot of the similarity histogram (Phase 3)."""
        with self._lock:
            return self._similarity_distribution_unlocked()

    def _record_similarity_internal(self, similarity: float) -> None:
        """Internal: increment the per-bucket hit counter (used by tests)."""
        bucket = self._bucket_for(similarity)
        key = f"answer_cache:sim:{bucket}"
        if key not in self.by_prefix:
            self.by_prefix[key] = {"hits": 0, "misses": 0, "sets": 0, "invalidations": 0}
        self.by_prefix[key]["hits"] += 1

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        if total == 0:
            return 0.0
        return self.hits / total

    @property
    def answer_cache_hit_rate(self) -> float:
        total = (
            self.answer_cache_exact_hits
            + self.answer_cache_semantic_hits
            + self.answer_cache_misses
        )
        if total == 0:
            return 0.0
        return (self.answer_cache_exact_hits + self.answer_cache_semantic_hits) / total

    @property
    def answer_cache_avg_similarity(self) -> float:
        if self.answer_cache_similarity_samples == 0:
            return 0.0
        return self.answer_cache_similarity_sum / self.answer_cache_similarity_samples

    def get_summary(self) -> Dict:
        with self._lock:
            total = self.hits + self.misses
            hit_rate = self.hits / total if total > 0 else 0.0
            # Call the unlocked helper so we do not re-acquire the lock
            # and deadlock (threading.Lock is non-reentrant).
            distribution = self._similarity_distribution_unlocked()
            return {
                "hits": self.hits,
                "misses": self.misses,
                "sets": self.sets,
                "invalidations": self.invalidations,
                "errors": self.errors,
                "hit_rate": round(hit_rate, 4),
                "total_requests": total,
                "last_reset": self.last_reset.isoformat(),
                "by_prefix": dict(self.by_prefix),
                # Phase 1 additions
                "answer_cache": {
                    "exact_hits": self.answer_cache_exact_hits,
                    "semantic_hits": self.answer_cache_semantic_hits,
                    "misses": self.answer_cache_misses,
                    "sets": self.answer_cache_sets,
                    "tokens_saved_estimated": self.answer_cache_tokens_saved,
                    "quality_failures": self.answer_cache_quality_failures,
                    "hit_rate": round(self.answer_cache_hit_rate, 4),
                    "avg_similarity": round(self.answer_cache_avg_similarity, 4),
                    # Phase 3 additions
                    "semantic_high_hits": self.answer_cache_semantic_high_hits,
                    "semantic_mid_hits": self.answer_cache_semantic_mid_hits,
                    "semantic_low_rejected": self.answer_cache_semantic_low_rejected,
                    "total_entry_hits": self.answer_cache_total_entry_hits,
                    "max_entry_hits": self.answer_cache_max_entry_hits,
                    "similarity_distribution": distribution,
                    # Phase 4 additions
                    "intent_validations_total": self.answer_cache_intent_validations,
                    "intent_validations_passed": self.answer_cache_intent_passes,
                    "intent_validations_failed": self.answer_cache_intent_fails,
                    "intent_validation_avg_latency_ms": round(
                        self.answer_cache_intent_validation_latency_ms
                        / self.answer_cache_intent_validations,
                        2,
                    ) if self.answer_cache_intent_validations else 0,
                    "tokens_saved_by_intent_validation": (
                        self.answer_cache_intent_passes * 350
                    ),
                    "quality_failures_by_source": dict(
                        self.answer_cache_quality_failures_by_source
                    ),
                    "tuner_adjustments": self.answer_cache_tuner_adjustments,
                    "tuner_high_threshold": self.answer_cache_tuner_high,
                    "tuner_mid_threshold": self.answer_cache_tuner_mid,
                },
            }

    def reset(self) -> None:
        with self._lock:
            self.hits = 0
            self.misses = 0
            self.sets = 0
            self.invalidations = 0
            self.errors = 0
            self.answer_cache_exact_hits = 0
            self.answer_cache_semantic_hits = 0
            self.answer_cache_misses = 0
            self.answer_cache_sets = 0
            self.answer_cache_tokens_saved = 0
            self.answer_cache_quality_failures = 0
            self.answer_cache_similarity_sum = 0.0
            self.answer_cache_similarity_samples = 0
            self.answer_cache_semantic_high_hits = 0
            self.answer_cache_semantic_mid_hits = 0
            self.answer_cache_semantic_low_rejected = 0
            self.answer_cache_total_entry_hits = 0
            self.answer_cache_max_entry_hits = 0
            self.answer_cache_intent_validations = 0
            self.answer_cache_intent_passes = 0
            self.answer_cache_intent_fails = 0
            self.answer_cache_intent_validation_latency_ms = 0
            self.answer_cache_quality_failures_by_source.clear()
            self.answer_cache_mid_failure_rate = 0.0
            self.answer_cache_high_failure_rate = 0.0
            self.answer_cache_intent_fail_ratio = 0.0
            self.answer_cache_tuner_adjustments = 0
            self.answer_cache_tuner_high = 0.97
            self.answer_cache_tuner_mid = 0.92
            self.last_reset = datetime.now(timezone.utc)
            self.by_prefix.clear()

    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)


# Global metrics instance
cache_metrics = CacheMetrics()
