"""
Cache service for Open Notebook.

Provides high-level caching operations for vector search, context building,
embeddings, and notebook metadata with automatic invalidation support.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from loguru import logger

from open_notebook.cache.metrics import cache_metrics
from open_notebook.cache.redis_client import RedisClient, redis_client
from open_notebook.config import (
    CONTEXT_CACHE_TTL,
    DEFAULT_CACHE_TTL,
    EMBEDDING_CACHE_TTL,
    NOTEBOOK_CACHE_TTL,
    PROVIDER_CACHE_TTL,
    VECTOR_SEARCH_CACHE_TTL,
)


class CacheService:
    """
    High-level cache service with domain-specific operations.

    All operations gracefully degrade - if Redis is unavailable, operations
    return None/False without errors and the application continues.
    """

    def __init__(self, redis_client: RedisClient = None):
        self._redis = redis_client or RedisClient()

    # -------------------------------------------------------------------------
    # Key Generation Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _hash_key(data: Any) -> str:
        """Create a deterministic hash from arbitrary data."""
        if isinstance(data, str):
            content = data
        else:
            content = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _make_key(*parts: str) -> str:
        """Build a cache key from parts."""
        return ":".join(parts)

    # -------------------------------------------------------------------------
    # Vector Search Caching
    # -------------------------------------------------------------------------

    async def get_vector_search_results(
        self, notebook_id: str, query: str, limit: int = 10
    ) -> Optional[List[Dict]]:
        """Get cached vector search results for a notebook."""
        query_hash = self._hash_key({"q": query, "l": limit})
        key = self._make_key("search", "vector", notebook_id, query_hash)

        result = await self._redis.get_json(key)
        if result is not None:
            cache_metrics.record_hit("search:vector")
            logger.debug(f"Cache HIT: vector_search {key[:50]}")
        else:
            cache_metrics.record_miss("search:vector")
            logger.debug(f"Cache MISS: vector_search {key[:50]}")
        return result

    async def set_vector_search_results(
        self, notebook_id: str, query: str, results: List[Dict], ttl: int = None
    ) -> bool:
        """Cache vector search results for a notebook."""
        query_hash = self._hash_key({"q": query, "l": len(results) if results else 0})
        key = self._make_key("search", "vector", notebook_id, query_hash)
        ttl = ttl or VECTOR_SEARCH_CACHE_TTL

        success = await self._redis.set_json(key, results, ttl)
        if success:
            cache_metrics.record_set("search:vector")
        return success

    async def invalidate_vector_search(self, notebook_id: str) -> int:
        """Invalidate all vector search cache for a notebook."""
        pattern = self._make_key("search", "vector", notebook_id, "*")
        deleted = await self._redis.delete_pattern(pattern)
        cache_metrics.record_invalidation("search:vector", deleted)
        if deleted > 0:
            logger.debug(f"Invalidated {deleted} vector_search entries for notebook {notebook_id}")
        return deleted

    # -------------------------------------------------------------------------
    # Context Build Caching
    # -------------------------------------------------------------------------

    async def get_context(self, notebook_id: str, config: Dict) -> Optional[List[Dict]]:
        """Get cached context build for a notebook with specific config."""
        config_hash = self._hash_key(config)
        key = self._make_key("context", notebook_id, config_hash)

        result = await self._redis.get_json(key)
        if result is not None:
            cache_metrics.record_hit("context")
            logger.debug(f"Cache HIT: context {key[:50]}")
        else:
            cache_metrics.record_miss("context")
            logger.debug(f"Cache MISS: context {key[:50]}")
        return result

    async def set_context(
        self, notebook_id: str, config: Dict, items: List[Dict], ttl: int = None
    ) -> bool:
        """Cache context build for a notebook."""
        config_hash = self._hash_key(config)
        key = self._make_key("context", notebook_id, config_hash)
        ttl = ttl or CONTEXT_CACHE_TTL

        # Serialize ContextItems to dicts
        serializable = []
        for item in items:
            if hasattr(item, "__dict__"):
                serializable.append(item.__dict__)
            else:
                serializable.append(dict(item))

        success = await self._redis.set_json(key, serializable, ttl)
        if success:
            cache_metrics.record_set("context")
        return success

    async def invalidate_context(self, notebook_id: str) -> int:
        """Invalidate all context cache for a notebook."""
        pattern = self._make_key("context", notebook_id, "*")
        deleted = await self._redis.delete_pattern(pattern)
        cache_metrics.record_invalidation("context", deleted)
        if deleted > 0:
            logger.debug(f"Invalidated {deleted} context entries for notebook {notebook_id}")
        return deleted

    # -------------------------------------------------------------------------
    # Embedding Caching
    # -------------------------------------------------------------------------

    async def get_embedding(self, source_id: str, chunk_idx: int) -> Optional[List[float]]:
        """Get a cached embedding for a source chunk."""
        key = self._make_key("embed", source_id, str(chunk_idx))

        result = await self._redis.get_embedding(key)
        if result is not None:
            cache_metrics.record_hit("embed")
            logger.debug(f"Cache HIT: embedding {key}")
        else:
            cache_metrics.record_miss("embed")
            logger.debug(f"Cache MISS: embedding {key}")
        return result

    async def get_embeddings_batch(
        self, source_id: str, indices: List[int]
    ) -> Dict[int, List[float]]:
        """Get multiple cached embeddings for a source. Returns dict of idx -> embedding."""
        results = {}
        for idx in indices:
            emb = await self.get_embedding(source_id, idx)
            if emb is not None:
                results[idx] = emb
        return results

    async def set_embedding(
        self, source_id: str, chunk_idx: int, embedding: List[float], ttl: int = None
    ) -> bool:
        """Cache an embedding for a source chunk."""
        key = self._make_key("embed", source_id, str(chunk_idx))
        ttl = ttl or EMBEDDING_CACHE_TTL

        success = await self._redis.set_embedding(key, embedding, ttl)
        if success:
            cache_metrics.record_set("embed")
        return success

    async def set_embeddings_batch(
        self, source_id: str, embeddings: Dict[int, List[float]], ttl: int = None
    ) -> int:
        """Cache multiple embeddings. Returns count of successfully cached."""
        count = 0
        for idx, emb in embeddings.items():
            if await self.set_embedding(source_id, idx, emb, ttl):
                count += 1
        return count

    async def invalidate_embedding(self, source_id: str) -> int:
        """Invalidate all embeddings for a source."""
        pattern = self._make_key("embed", source_id, "*")
        deleted = await self._redis.delete_pattern(pattern)
        cache_metrics.record_invalidation("embed", deleted)
        if deleted > 0:
            logger.debug(f"Invalidated {deleted} embeddings for source {source_id}")
        return deleted

    # -------------------------------------------------------------------------
    # Notebook Metadata Caching
    # -------------------------------------------------------------------------

    async def get_notebook_meta(self, notebook_id: str) -> Optional[Dict]:
        """Get cached notebook metadata."""
        key = self._make_key("notebook", notebook_id, "meta")

        result = await self._redis.get_json(key)
        if result is not None:
            cache_metrics.record_hit("notebook:meta")
        else:
            cache_metrics.record_miss("notebook:meta")
        return result

    async def set_notebook_meta(
        self, notebook_id: str, meta: Dict, ttl: int = None
    ) -> bool:
        """Cache notebook metadata."""
        key = self._make_key("notebook", notebook_id, "meta")
        ttl = ttl or NOTEBOOK_CACHE_TTL

        success = await self._redis.set_json(key, meta, ttl)
        if success:
            cache_metrics.record_set("notebook:meta")
        return success

    async def invalidate_notebook(self, notebook_id: str) -> int:
        """Invalidate all cache entries for a notebook (metadata, context, search)."""
        deleted = 0
        deleted += await self._redis.delete_pattern(self._make_key("notebook", notebook_id, "*"))
        deleted += await self._redis.delete_pattern(self._make_key("context", notebook_id, "*"))
        deleted += await self._redis.delete_pattern(self._make_key("search", "vector", notebook_id, "*"))
        cache_metrics.record_invalidation("notebook", deleted)
        if deleted > 0:
            logger.debug(f"Invalidated {deleted} cache entries for notebook {notebook_id}")
        return deleted

    # -------------------------------------------------------------------------
    # Provider Availability Caching
    # -------------------------------------------------------------------------

    async def get_provider_availability(self) -> Optional[Dict]:
        """Get cached provider availability response."""
        key = "models:providers:availability"

        result = await self._redis.get_json(key)
        if result is not None:
            cache_metrics.record_hit("models:providers")
        else:
            cache_metrics.record_miss("models:providers")
        return result

    async def set_provider_availability(
        self, data: Dict, ttl: int = None
    ) -> bool:
        """Cache provider availability response."""
        key = "models:providers:availability"
        ttl = ttl or PROVIDER_CACHE_TTL

        success = await self._redis.set_json(key, data, ttl)
        if success:
            cache_metrics.record_set("models:providers")
        return success

    async def invalidate_provider_cache(self) -> int:
        """Invalidate provider availability cache."""
        deleted = await self._redis.delete("models:providers:availability")
        if deleted:
            cache_metrics.record_invalidation("models:providers", deleted)
        return deleted

    # -------------------------------------------------------------------------
    # Generic Operations
    # -------------------------------------------------------------------------

    async def get_json(self, key: str) -> Optional[Any]:
        """Generic JSON get."""
        result = await self._redis.get_json(key)
        if result is not None:
            cache_metrics.record_hit("generic")
        else:
            cache_metrics.record_miss("generic")
        return result

    async def set_json(self, key: str, value: Any, ttl: int = None) -> bool:
        """Generic JSON set."""
        ttl = ttl or DEFAULT_CACHE_TTL
        success = await self._redis.set_json(key, value, ttl)
        if success:
            cache_metrics.record_set("generic")
        return success

    async def delete(self, key: str) -> bool:
        """Generic delete."""
        return await self._redis.delete(key)

    async def invalidate_prefix(self, prefix: str) -> int:
        """Invalidate all keys with a prefix."""
        deleted = await self._redis.invalidate_prefix(prefix)
        cache_metrics.record_invalidation(prefix, deleted)
        return deleted

    # -------------------------------------------------------------------------
    # Health & Stats
    # -------------------------------------------------------------------------

    async def is_available(self) -> bool:
        """Check if cache is available."""
        return await self._redis.is_available()

    def get_metrics(self) -> Dict:
        """Get cache metrics summary."""
        return cache_metrics.get_summary()

    def reset_metrics(self) -> None:
        """Reset cache metrics."""
        cache_metrics.reset()


# Global singleton instance
cache_service = CacheService(redis_client=redis_client)
