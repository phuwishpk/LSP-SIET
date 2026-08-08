"""
Cache metrics tracking for Open Notebook.

Tracks cache hit/miss ratios and invalidation events for monitoring.
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

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        if total == 0:
            return 0.0
        return self.hits / total

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
            }

    def reset(self) -> None:
        with self._lock:
            self.hits = 0
            self.misses = 0
            self.sets = 0
            self.invalidations = 0
            self.errors = 0
            self.last_reset = datetime.now(timezone.utc)
            self.by_prefix.clear()

    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)


# Global metrics instance
cache_metrics = CacheMetrics()
