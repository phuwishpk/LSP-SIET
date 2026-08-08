"""
Cache package for Open Notebook.

Provides Redis-based caching for expensive operations like vector search,
context building, and embedding generation.
"""

from open_notebook.cache.invalidation import (
    invalidate_after_insight_change,
    invalidate_after_model_change,
    invalidate_after_note_change,
    invalidate_after_source_delete,
    invalidate_notebook_cache,
    invalidate_on_change,
    invalidate_source_cache,
)
from open_notebook.cache.metrics import cache_metrics
from open_notebook.cache.redis_client import RedisClient, redis_client
from open_notebook.cache.service import CacheService, cache_service

__all__ = [
    # Client
    "RedisClient",
    "redis_client",
    # Service
    "CacheService",
    "cache_service",
    # Metrics
    "cache_metrics",
    # Invalidation helpers
    "invalidate_on_change",
    "invalidate_source_cache",
    "invalidate_notebook_cache",
    "invalidate_after_source_delete",
    "invalidate_after_note_change",
    "invalidate_after_insight_change",
    "invalidate_after_model_change",
]
