"""
Redis client singleton for Open Notebook.

Provides async Redis operations with graceful degradation - if Redis is unavailable,
cache operations silently fail and the application continues without caching.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Optional

import redis.asyncio as redis
from loguru import logger

from open_notebook.config import REDIS_URL


class RedisClient:
    """
    Async Redis client wrapper with lazy connection and graceful degradation.

    If Redis is not configured or unavailable, all operations return None/False
    without raising errors, allowing the application to function without caching.
    """

    def __init__(self, url: str = ""):
        self._url = url
        self._client: Optional[redis.Redis] = None
        self._available: Optional[bool] = None  # None = unknown, True/False = known

    @property
    def is_configured(self) -> bool:
        """Check if Redis URL is configured."""
        return bool(self._url)

    async def _ensure_connection(self) -> Optional[redis.Redis]:
        """Lazily create connection pool on first use."""
        if not self.is_configured:
            if self._available is None:
                logger.debug("Redis not configured (REDIS_URL not set)")
                self._available = False
            return None

        if self._client is None:
            try:
                self._client = redis.from_url(
                    self._url,
                    encoding="utf-8",
                    decode_responses=False,  # We'll handle bytes manually
                    socket_connect_timeout=5,
                    socket_timeout=5,
                )
                # Test connection
                await self._client.ping()
                self._available = True
                logger.info(f"Redis connection established: {self._url}")
            except Exception as e:
                logger.warning(f"Redis connection failed: {e}. Caching disabled.")
                self._client = None
                self._available = False

        return self._client

    async def is_available(self) -> bool:
        """Check if Redis is available. Caches the result after first check."""
        if self._available is False:
            return False

        client = await self._ensure_connection()
        if client is None:
            return False

        try:
            await client.ping()
            self._available = True
            return True
        except Exception as e:
            logger.warning(f"Redis ping failed: {e}")
            self._available = False
            return False

    async def get_json(self, key: str) -> Optional[Any]:
        """Get a JSON value from Redis. Returns None if not found or Redis unavailable."""
        client = await self._ensure_connection()
        if client is None:
            return None

        try:
            value = await client.get(key)
            if value is None:
                return None
            return json.loads(value.decode("utf-8"))
        except Exception as e:
            logger.debug(f"Redis GET error for {key}: {e}")
            return None

    async def set_json(
        self, key: str, value: Any, ttl: Optional[int] = None
    ) -> bool:
        """Set a JSON value in Redis. Returns True on success."""
        client = await self._ensure_connection()
        if client is None:
            return False

        try:
            serialized = json.dumps(value)
            if ttl:
                await client.setex(key, ttl, serialized)
            else:
                await client.set(key, serialized)
            return True
        except Exception as e:
            logger.debug(f"Redis SET error for {key}: {e}")
            return False

    async def set_binary(
        self, key: str, value: bytes, ttl: Optional[int] = None
    ) -> bool:
        """Set a binary value in Redis (for embeddings). Returns True on success."""
        client = await self._ensure_connection()
        if client is None:
            return False

        try:
            if ttl:
                await client.setex(key, ttl, value)
            else:
                await client.set(key, value)
            return True
        except Exception as e:
            logger.debug(f"Redis SET (binary) error for {key}: {e}")
            return False

    async def get_binary(self, key: str) -> Optional[bytes]:
        """Get a binary value from Redis. Returns None if not found."""
        client = await self._ensure_connection()
        if client is None:
            return None

        try:
            value = await client.get(key)
            return value
        except Exception as e:
            logger.debug(f"Redis GET (binary) error for {key}: {e}")
            return None

    async def delete(self, key: str) -> bool:
        """Delete a key from Redis. Returns True on success."""
        client = await self._ensure_connection()
        if client is None:
            return False

        try:
            await client.delete(key)
            return True
        except Exception as e:
            logger.debug(f"Redis DELETE error for {key}: {e}")
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching a pattern using SCAN (non-blocking).
        Returns count of deleted keys.
        """
        client = await self._ensure_connection()
        if client is None:
            return 0

        try:
            deleted = 0
            cursor = 0
            while True:
                cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    await client.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            if deleted > 0:
                logger.debug(f"Redis: deleted {deleted} keys matching '{pattern}'")
            return deleted
        except Exception as e:
            logger.debug(f"Redis DELETE pattern error for '{pattern}': {e}")
            return 0

    async def invalidate_prefix(self, prefix: str) -> int:
        """
        Invalidate all cache entries with a given prefix.
        Alias for delete_pattern with prefix*.

        Returns count of deleted keys.
        """
        return await self.delete_pattern(f"{prefix}*")

    async def get_embedding(self, key: str) -> Optional[list[float]]:
        """
        Get an embedding vector from Redis.
        Embeddings are stored as base64-encoded bytes for efficiency.
        """
        client = await self._ensure_connection()
        if client is None:
            return None

        try:
            value = await client.get(key)
            if value is None:
                return None
            decoded = base64.b64decode(value)
            import struct

            count = len(decoded) // 8  # float64
            return list(struct.unpack(f"{count}d", decoded))
        except Exception as e:
            logger.debug(f"Redis GET embedding error for {key}: {e}")
            return None

    async def set_embedding(
        self, key: str, embedding: list[float], ttl: Optional[int] = None
    ) -> bool:
        """
        Set an embedding vector in Redis.
        Embeddings are stored as base64-encoded bytes for efficiency.
        """
        client = await self._ensure_connection()
        if client is None:
            return False

        try:
            import struct

            packed = struct.pack(f"{len(embedding)}d", *embedding)
            encoded = base64.b64encode(packed)
            if ttl:
                await client.setex(key, ttl, encoded)
            else:
                await client.set(key, encoded)
            return True
        except Exception as e:
            logger.debug(f"Redis SET embedding error for {key}: {e}")
            return False

    async def close(self) -> None:
        """Close the Redis connection."""
        if self._client:
            try:
                await self._client.close()
            except Exception as e:
                logger.debug(f"Error closing Redis connection: {e}")
            self._client = None
            self._available = None

    async def health_check(self) -> dict[str, Any]:
        """Return health status for monitoring."""
        client = await self._ensure_connection()
        if client is None or not self._available:
            return {
                "available": False,
                "configured": self.is_configured,
                "url": self._url[:20] + "..." if len(self._url) > 20 else self._url,
            }

        try:
            info = await client.info("memory")
            return {
                "available": True,
                "configured": True,
                "url": self._url,
                "used_memory_human": info.get("used_memory_human", "unknown"),
                "connected_clients": info.get("connected_clients", 0),
            }
        except Exception as e:
            return {
                "available": False,
                "configured": True,
                "error": str(e)[:100],
            }


# Global singleton instance
redis_client = RedisClient(url=REDIS_URL)
