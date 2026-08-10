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
from typing import Dict

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

    def _get_prefix_stats(self, prefix: str) -> Dict[str, int]:
        if prefix not in self.by_prefix:
            self.by_prefix[prefix] = {"hits": 0, "misses": 0, "sets": 0, "invalidations": 0}
        return self.by_prefix[prefix]

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

    # ── Phase 1: answer-cache methods ─────────────────────────────────────────
    def record_answer_hit(self, kind: str, tokens_saved: int = 0) -> None:
        """kind: 'exact' | 'semantic'."""
        with self._lock:
            if kind == "exact":
                self.answer_cache_exact_hits += 1
            elif kind == "semantic":
                self.answer_cache_semantic_hits += 1
            self.hits += 1
            self.answer_cache_tokens_saved += int(tokens_saved or 0)

    def record_answer_miss(self, reason: str = "miss") -> None:
        """
        reason is just a debug tag (e.g. 'miss', 'below_threshold',
        'embedding_error'); we keep it out of the public counter for now.
        """
        with self._lock:
            self.answer_cache_misses += 1
            self.misses += 1

    def record_answer_set(self) -> None:
        with self._lock:
            self.answer_cache_sets += 1
            self.sets += 1

    def record_answer_quality_failure(self) -> None:
        with self._lock:
            self.answer_cache_quality_failures += 1

    def record_answer_similarity(self, similarity: float) -> None:
        """Track the cosine similarity of every semantic lookup for histograms."""
        with self._lock:
            self.answer_cache_similarity_sum += float(similarity)
            self.answer_cache_similarity_samples += 1

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
            self.last_reset = datetime.now(timezone.utc)
            self.by_prefix.clear()

    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)


# Global metrics instance
cache_metrics = CacheMetrics()
