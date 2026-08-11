"""Phase 6: Tuner Decision Log.

Stores the last 100 tuning decisions in Redis so operators can audit
why thresholds changed without digging through log files.

GET /api/config/answer-cache/thresholds/history  → list of recent decisions
POST /api/config/answer-cache/thresholds/history/clear  → reset log
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from open_notebook.cache.redis_client import redis_client


DECISION_LOG_KEY = "cache:tuning:decision_log"
MAX_LOG_ENTRIES = 100


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def push_decision(
    from_high: float,
    to_high: float,
    from_mid: float,
    to_mid: float,
    reason: str,
    signal_snapshot: dict[str, Any],
) -> bool:
    """Append a decision to the rolling log. Returns True on success."""
    entry = {
        "timestamp": _now(),
        "from_high": round(from_high, 6),
        "to_high": round(to_high, 6),
        "from_mid": round(from_mid, 6),
        "to_mid": round(to_mid, 6),
        "reason": reason,
        "signal_snapshot": {
            k: round(v, 6) if isinstance(v, float) else v
            for k, v in signal_snapshot.items()
        },
    }
    try:
        client = await redis_client._ensure_connection()
        if client is None:
            return False
        pipe = client.pipeline()
        pipe.lpush(DECISION_LOG_KEY, __import__("json").dumps(entry))
        pipe.ltrim(DECISION_LOG_KEY, 0, MAX_LOG_ENTRIES - 1)
        await pipe.execute()
        return True
    except Exception:
        return False


async def get_history(limit: int = 100) -> list[dict[str, Any]]:
    """Return the most recent tuning decisions, newest first."""
    try:
        client = await redis_client._ensure_connection()
        if client is None:
            return []
        raw = await client.lrange(DECISION_LOG_KEY, 0, limit - 1)
        import json as _json

        decisions = []
        for item in raw:
            if isinstance(item, bytes):
                item = item.decode("utf-8")
            decisions.append(_json.loads(item))
        return decisions
    except Exception:
        return []


async def clear_history() -> bool:
    """Delete the entire decision log."""
    try:
        return await redis_client.delete(DECISION_LOG_KEY)
    except Exception:
        return False
