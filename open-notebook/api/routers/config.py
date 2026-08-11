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


# ── Phase 1-4: answer-cache analytics ────────────────────────────────────


@router.get("/config/answer-cache/analytics")
async def get_answer_cache_analytics():
    """
    Phase 1-4: Answer-cache analytics.

    Reports hit rate, estimated tokens saved, average cosine similarity, and
    the configuration that controls the cache thresholds. Phase 3 adds the
    3-tier semantic breakdown (high/mid/low) and similarity distribution
    histogram so the dashboard can tune thresholds. The frontend dashboard
    (and CI smoke tests) consume this endpoint to verify the token-saving
    system is working.
    """
    try:
        from open_notebook.cache.answer_cache import get_cache_analytics
        from open_notebook.cache.metrics import cache_metrics
        from open_notebook.cache.redis_client import redis_client
        from open_notebook.cache.threshold_tuner import threshold_tuner
        from open_notebook.config import ANSWER_CACHE_TUNER_ENABLED

        health = await redis_client.health_check()
        analytics = await get_cache_analytics()
        answer = analytics or {}

        return {
            "redis_available": health.get("available", False),
            # Complete snapshot for dashboards; flattened fields below remain
            # for clients that consume the original analytics response.
            "answer_cache": answer,
            "hit_rate": answer.get("hit_rate", 0),
            "exact_hits": answer.get("exact_hits", 0),
            "semantic_hits": answer.get("semantic_hits", 0),
            "misses": answer.get("misses", 0),
            "sets": answer.get("sets", 0),
            "tokens_saved_estimated": answer.get("tokens_saved_estimated", 0),
            "quality_failures": answer.get("quality_failures", 0),
            "avg_similarity": answer.get("avg_similarity", 0),
            # Phase 3: 3-tier semantic breakdown
            "semantic_high_hits": answer.get("semantic_high_hits", 0),
            "semantic_mid_hits": answer.get("semantic_mid_hits", 0),
            "semantic_low_rejected": answer.get("semantic_low_rejected", 0),
            "total_entry_hits": answer.get("total_entry_hits", 0),
            "max_entry_hits": answer.get("max_entry_hits", 0),
            "similarity_distribution": answer.get("similarity_distribution", {}),
            # Phase 4: cheap semantic-mid intent validation
            "intent_validations_total": answer.get("intent_validations_total", 0),
            "intent_validations_passed": answer.get("intent_validations_passed", 0),
            "intent_validations_failed": answer.get("intent_validations_failed", 0),
            "intent_validation_avg_latency_ms": answer.get(
                "intent_validation_avg_latency_ms", 0
            ),
            "tokens_saved_by_intent_validation": answer.get(
                "tokens_saved_by_intent_validation", 0
            ),
            "quality_failures_by_source": answer.get(
                "quality_failures_by_source", {}
            ),
            "adaptive_thresholds": {
                "tuner_enabled": ANSWER_CACHE_TUNER_ENABLED,
                "current_high_threshold": threshold_tuner.get_high_threshold(),
                "current_mid_threshold": threshold_tuner.get_mid_threshold(),
                "last_adjustment": (
                    threshold_tuner.last_adjustment.isoformat()
                    if threshold_tuner.last_adjustment
                    else None
                ),
                "tuning_signals": cache_metrics.compute_tuning_signals(),
            },
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
                "intent_validation_enabled": __import__(
                    "open_notebook.config",
                    fromlist=["ANSWER_CACHE_INTENT_VALIDATOR_ENABLED"],
                ).ANSWER_CACHE_INTENT_VALIDATOR_ENABLED,
                "intent_timeout_ms": __import__(
                    "open_notebook.config",
                    fromlist=["ANSWER_CACHE_INTENT_TIMEOUT_MS"],
                ).ANSWER_CACHE_INTENT_TIMEOUT_MS,
                "intent_min_similarity": __import__(
                    "open_notebook.config",
                    fromlist=["ANSWER_CACHE_INTENT_MIN_SIMILARITY"],
                ).ANSWER_CACHE_INTENT_MIN_SIMILARITY,
                "circuit_breaker_enabled": __import__(
                    "open_notebook.config",
                    fromlist=["ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED"],
                ).ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED,
            },
            # Phase 6.5: circuit breaker status (sync read of singleton state)
            "circuit_breaker": _get_circuit_breaker_status(),
        }
    except Exception as e:
        logger.warning(f"Answer cache analytics failed: {e}")
        return {"redis_available": False, "error": str(e)[:200]}


def _get_circuit_breaker_status() -> dict:
    try:
        from open_notebook.cache.circuit_breaker import (
            ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED,
            circuit_breaker,
        )
        return circuit_breaker.get_status()
    except Exception:
        return {"enabled": False, "state": "unknown", "error": "not available"}


@router.post("/config/answer-cache/thresholds/reset")
async def reset_answer_cache_thresholds():
    """Reset adaptive thresholds to configured defaults.

    The workspace auth middleware protects this configuration endpoint. The
    current user model has no role field yet, so there is no finer-grained
    admin RBAC distinction to enforce here.
    """
    from open_notebook.cache.threshold_tuner import threshold_tuner

    threshold_tuner.reset()
    return {
        "status": "ok",
        "high": threshold_tuner.get_high_threshold(),
        "mid": threshold_tuner.get_mid_threshold(),
    }


@router.get("/config/answer-cache/thresholds/history")
async def get_threshold_history():
    """
    Phase 6.4: Tuner decision log — last 100 threshold adjustments.

    Returns a list of tuning decisions with:
    - Threshold values before/after
    - Human-readable reason
    - Signal snapshot at decision time
    """
    from open_notebook.cache.tuner_decision_log import get_history

    limit_str = __import__("os").environ.get(
        "OPEN_NOTEBOOK_TUNER_HISTORY_LIMIT", "100"
    )
    limit = max(1, min(1000, int(limit_str)))
    history = await get_history(limit=limit)
    return {"count": len(history), "decisions": history}


@router.post("/config/answer-cache/thresholds/history/clear")
async def clear_threshold_history():
    """Phase 6.4: Clear the tuner decision log."""
    from open_notebook.cache.tuner_decision_log import clear_history

    success = await clear_history()
    return {"status": "ok" if success else "error"}


@router.post("/config/answer-cache/circuit-breaker/open")
async def open_circuit_breaker():
    """Phase 6.5: Manually open the intent-validation circuit breaker."""
    from open_notebook.cache.circuit_breaker import circuit_breaker

    await circuit_breaker.open()
    return {
        "status": "ok",
        "state": circuit_breaker.state.value,
    }


@router.post("/config/answer-cache/circuit-breaker/close")
async def close_circuit_breaker():
    """Phase 6.5: Manually close (reset) the intent-validation circuit breaker."""
    from open_notebook.cache.circuit_breaker import circuit_breaker

    await circuit_breaker.close()
    return {
        "status": "ok",
        "state": circuit_breaker.state.value,
    }


@router.get("/config/answer-cache/circuit-breaker/status")
async def get_circuit_breaker_status():
    """Phase 6.5: Return current circuit-breaker state and stats."""
    from open_notebook.cache.circuit_breaker import circuit_breaker

    return circuit_breaker.get_status()


@router.post("/config/answer-cache/report-quality-failure")
async def report_answer_cache_quality_failure(request: Request):
    """
    Phase 1: User-reported endpoint when a cached answer looks wrong.

    The frontend can call this when the user clicks "this cached answer is
    incorrect" so we can later tune thresholds against real feedback.
    """
    try:
        from open_notebook.cache.metrics import cache_metrics

        try:
            body = await request.json()
        except Exception:
            body = {}
        source = str(body.get("source") or "unknown") if isinstance(body, dict) else "unknown"
        cache_metrics.record_answer_quality_failure(source)
        return {"message": "Quality failure recorded", "source": source}
    except Exception as e:
        logger.warning(f"Failed to record quality failure: {e}")
        return {"message": "Failed to record", "error": str(e)[:100]}
