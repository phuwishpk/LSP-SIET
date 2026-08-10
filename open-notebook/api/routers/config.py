import asyncio
import os
import time
import tomllib
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request
from loguru import logger

from open_notebook.database.repository import repo_query
from open_notebook.utils.version_utils import (
    compare_versions,
    get_version_from_github_async,
)

router = APIRouter()

# In-memory cache for version check results
_version_cache: dict = {
    "latest_version": None,
    "has_update": False,
    "timestamp": 0,
    "check_failed": False,
}

# Cache TTL in seconds (24 hours)
VERSION_CACHE_TTL = 24 * 60 * 60


def get_version() -> str:
    """Read version from pyproject.toml"""
    try:
        pyproject_path = Path(__file__).parent.parent.parent / "pyproject.toml"
        with open(pyproject_path, "rb") as f:
            pyproject = tomllib.load(f)
            return pyproject.get("project", {}).get("version", "unknown")
    except Exception as e:
        logger.warning(f"Could not read version from pyproject.toml: {e}")
        return "unknown"


async def get_latest_version_cached(current_version: str) -> tuple[Optional[str], bool]:
    """
    Check for the latest version from GitHub with caching.

    Returns:
        tuple: (latest_version, has_update)
        - latest_version: str or None if check failed
        - has_update: bool indicating if update is available
    """
    global _version_cache

    # Check if cache is still valid (within TTL)
    cache_age = time.time() - _version_cache["timestamp"]
    if _version_cache["timestamp"] > 0 and cache_age < VERSION_CACHE_TTL:
        logger.debug(f"Using cached version check result (age: {cache_age:.0f}s)")
        return _version_cache["latest_version"], _version_cache["has_update"]

    # Cache expired or not yet set
    if _version_cache["timestamp"] > 0:
        logger.info(f"Version cache expired (age: {cache_age:.0f}s), refreshing...")

    # Perform version check with strict error handling
    try:
        logger.info("Checking for latest version from GitHub...")

        # Fetch latest version from GitHub with 10-second timeout
        latest_version = await get_version_from_github_async(
            "https://github.com/lfnovo/open-notebook", "main"
        )

        logger.info(
            f"Latest version from GitHub: {latest_version}, Current version: {current_version}"
        )

        # Compare versions
        has_update = compare_versions(current_version, latest_version) < 0

        # Cache the result
        _version_cache["latest_version"] = latest_version
        _version_cache["has_update"] = has_update
        _version_cache["timestamp"] = time.time()
        _version_cache["check_failed"] = False

        logger.info(f"Version check complete. Update available: {has_update}")

        return latest_version, has_update

    except Exception as e:
        logger.warning(f"Version check failed: {e}")

        # Cache the failure to avoid repeated attempts
        _version_cache["latest_version"] = None
        _version_cache["has_update"] = False
        _version_cache["timestamp"] = time.time()
        _version_cache["check_failed"] = True

        return None, False


async def check_database_health() -> dict:
    """
    Check if database is reachable using a lightweight query.

    Returns:
        dict with 'status' ("online" | "offline") and optional 'error'
    """
    try:
        # 2-second timeout for database health check
        result = await asyncio.wait_for(repo_query("RETURN 1"), timeout=2.0)
        if result:
            return {"status": "online"}
        return {"status": "offline", "error": "Empty result"}
    except asyncio.TimeoutError:
        logger.warning("Database health check timed out after 2 seconds")
        return {"status": "offline", "error": "Health check timeout"}
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        return {"status": "offline", "error": str(e)}


@router.get("/config")
async def get_config(request: Request):
    """
    Get frontend configuration.

    Returns version information and health status.
    Note: The frontend determines the API URL via its own runtime-config endpoint,
    so this endpoint no longer returns apiUrl.

    Also checks for version updates from GitHub (with caching and error handling).
    """
    # Get current version
    current_version = get_version()

    # Check for updates (with caching and error handling)
    # This MUST NOT break the endpoint - wrapped in try-except as extra safety
    latest_version = None
    has_update = False

    try:
        latest_version, has_update = await get_latest_version_cached(current_version)
    except Exception as e:
        # Extra safety: ensure version check never breaks the config endpoint
        logger.error(f"Unexpected error during version check: {e}")

    # Check database health
    db_health = await check_database_health()
    db_status = db_health["status"]

    if db_status == "offline":
        logger.warning(f"Database offline: {db_health.get('error', 'Unknown error')}")

    return {
        "version": current_version,
        "latestVersion": latest_version,
        "hasUpdate": has_update,
        "dbStatus": db_status,
    }


@router.get("/config/redis")
async def get_redis_status():
    """
    Get Redis cache status.

    Returns availability and health information for the Redis cache layer.
    Phase 1: includes answer-cache specific analytics (hit rate, tokens
    saved, similarity stats) so dashboards and tests can verify the cache
    is working.
    """
    try:
        from open_notebook.cache.redis_client import redis_client
        from open_notebook.cache.service import cache_service

        health = await redis_client.health_check()
        metrics = cache_service.get_metrics()
        answer_cache = metrics.get("answer_cache", {}) or {}

        return {
            "available": health.get("available", False),
            "configured": health.get("configured", False),
            "memory": health.get("used_memory_human", "N/A"),
            "connected_clients": health.get("connected_clients", 0),
            "cache": {
                "hit_rate": metrics.get("hit_rate", 0),
                "hits": metrics.get("hits", 0),
                "misses": metrics.get("misses", 0),
                "sets": metrics.get("sets", 0),
                "invalidations": metrics.get("invalidations", 0),
                "total_requests": metrics.get("total_requests", 0),
            },
            "answer_cache": {
                "hit_rate": answer_cache.get("hit_rate", 0),
                "exact_hits": answer_cache.get("exact_hits", 0),
                "semantic_hits": answer_cache.get("semantic_hits", 0),
                "misses": answer_cache.get("misses", 0),
                "sets": answer_cache.get("sets", 0),
                "tokens_saved_estimated": answer_cache.get(
                    "tokens_saved_estimated", 0
                ),
                "quality_failures": answer_cache.get("quality_failures", 0),
                "avg_similarity": answer_cache.get("avg_similarity", 0),
            },
        }
    except Exception as e:
        logger.warning(f"Redis status check failed: {e}")
        return {
            "available": False,
            "configured": False,
            "error": str(e)[:100],
            "cache": {},
            "answer_cache": {},
        }


@router.post("/config/redis/reset-metrics")
async def reset_redis_metrics():
    """Reset cache metrics counters."""
    try:
        from open_notebook.cache.service import cache_service

        cache_service.reset_metrics()
        return {"message": "Cache metrics reset successfully"}
    except Exception as e:
        logger.warning(f"Failed to reset cache metrics: {e}")
        return {"message": "Failed to reset metrics", "error": str(e)[:100]}


# ── Phase 1: answer-cache analytics ───────────────────────────────────────


@router.get("/config/answer-cache/analytics")
async def get_answer_cache_analytics():
    """
    Phase 1: Answer-cache analytics.

    Reports hit rate, estimated tokens saved, average cosine similarity, and
    the configuration that controls the cache thresholds. The frontend
    dashboard (and CI smoke tests) consume this endpoint to verify the
    token-saving system is working.
    """
    try:
        from open_notebook.cache.metrics import cache_metrics
        from open_notebook.cache.redis_client import redis_client

        health = await redis_client.health_check()
        summary = cache_metrics.get_summary()
        answer = summary.get("answer_cache", {}) or {}

        return {
            "redis_available": health.get("available", False),
            "hit_rate": answer.get("hit_rate", 0),
            "exact_hits": answer.get("exact_hits", 0),
            "semantic_hits": answer.get("semantic_hits", 0),
            "misses": answer.get("misses", 0),
            "sets": answer.get("sets", 0),
            "tokens_saved_estimated": answer.get("tokens_saved_estimated", 0),
            "quality_failures": answer.get("quality_failures", 0),
            "avg_similarity": answer.get("avg_similarity", 0),
            "config": {
                "ttl_seconds": int(
                    __import__(
                        "open_notebook.cache.answer_cache",
                        fromlist=["ANSWER_CACHE_TTL"],
                    ).ANSWER_CACHE_TTL
                ),
                "semantic_threshold": float(
                    __import__(
                        "open_notebook.cache.answer_cache",
                        fromlist=["ANSWER_CACHE_THRESHOLD"],
                    ).ANSWER_CACHE_THRESHOLD
                ),
                "high_threshold": float(
                    __import__(
                        "open_notebook.cache.answer_cache",
                        fromlist=["ANSWER_CACHE_HIGH_THRESHOLD"],
                    ).ANSWER_CACHE_HIGH_THRESHOLD
                ),
                "mid_threshold": float(
                    __import__(
                        "open_notebook.cache.answer_cache",
                        fromlist=["ANSWER_CACHE_MID_THRESHOLD"],
                    ).ANSWER_CACHE_MID_THRESHOLD
                ),
                "max_entries": int(
                    __import__(
                        "open_notebook.cache.answer_cache",
                        fromlist=["ANSWER_CACHE_MAX_ENTRIES"],
                    ).ANSWER_CACHE_MAX_ENTRIES
                ),
            },
        }
    except Exception as e:
        logger.warning(f"Answer cache analytics failed: {e}")
        return {"redis_available": False, "error": str(e)[:200]}


@router.post("/config/answer-cache/report-quality-failure")
async def report_answer_cache_quality_failure():
    """
    Phase 1: User-reported endpoint when a cached answer looks wrong.

    The frontend can call this when the user clicks "this cached answer is
    incorrect" so we can later tune thresholds against real feedback.
    """
    try:
        from open_notebook.cache.metrics import cache_metrics

        cache_metrics.record_answer_quality_failure()
        return {"message": "Quality failure recorded"}
    except Exception as e:
        logger.warning(f"Failed to record quality failure: {e}")
        return {"message": "Failed to record", "error": str(e)[:100]}
