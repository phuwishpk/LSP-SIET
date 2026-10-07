"""
One gate for every call to the LLM provider: a queue per lane + 429 retry.

Why: the provider rate-limits the whole Google Cloud project (RPM / TPM / RPD),
and the workspace serves a few hundred students who tend to ask at the same
minute. Without this gate a burst turns straight into ``429 RESOURCE_EXHAUSTED``
errors on screen; with it, callers wait a few seconds in a queue, a 429 is
retried with exponential backoff (honouring the provider's ``Retry-After``), and
only a sustained overload reaches the user, as a 503 with a retry hint.

Lanes (concurrency is per API process; ``LLM_*`` env vars tune them):

* ``chat``      – answer / quiz / roadmap generation   (default 10 in flight)
* ``embedding`` – question embeddings + document ingestion (default 8 in flight)

Every call is counted in :data:`stats` so an admin can see how often the queue
and the retries actually kick in (``GET /api/admin/llm-throttle``).
"""

from __future__ import annotations

import asyncio
import os
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Optional, TypeVar

from loguru import logger

from open_notebook.exceptions import OpenNotebookError, RateLimitError

T = TypeVar("T")


def _env_int(name: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(os.getenv(name, default))))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float, low: float, high: float) -> float:
    try:
        return max(low, min(high, float(os.getenv(name, default))))
    except (TypeError, ValueError):
        return default


LANE_LIMITS: Dict[str, int] = {
    "chat": _env_int("LLM_MAX_CONCURRENT_CHAT", 10, 1, 200),
    "embedding": _env_int("LLM_MAX_CONCURRENT_EMBED", 8, 1, 200),
}
# How long a caller may sit in the queue before we give up and answer 503.
QUEUE_TIMEOUT = _env_float("LLM_QUEUE_TIMEOUT_SECONDS", 45.0, 1.0, 600.0)
# 429 handling: attempts, first delay, delay cap (plus random jitter).
RETRY_ATTEMPTS = _env_int("LLM_RATE_LIMIT_RETRIES", 4, 0, 10)
RETRY_BASE = _env_float("LLM_RATE_LIMIT_BACKOFF_SECONDS", 1.0, 0.1, 30.0)
RETRY_MAX_DELAY = _env_float("LLM_RATE_LIMIT_BACKOFF_MAX_SECONDS", 12.0, 1.0, 120.0)
# A provider that asks us to wait longer than this is overloaded: fail fast and
# let the client retry later instead of holding a request open for minutes.
RETRY_AFTER_CAP = _env_float("LLM_RATE_LIMIT_RETRY_AFTER_CAP_SECONDS", 20.0, 1.0, 300.0)


class ProviderBusy(OpenNotebookError):
    """The queue is full and the caller waited the whole QUEUE_TIMEOUT. → HTTP 503."""

    def __init__(self, lane: str, retry_after: int = 10) -> None:
        self.lane = lane
        self.retry_after = max(1, int(retry_after))
        super().__init__(
            "ระบบมีผู้ใช้พร้อมกันจำนวนมากในขณะนี้ "
            f"กรุณาลองใหม่ในอีก {self.retry_after} วินาที"
        )


@dataclass
class LaneStats:
    limit: int
    in_flight: int = 0
    calls: int = 0
    waited: int = 0  # calls that had to queue (semaphore not free)
    wait_total: float = 0.0
    wait_max: float = 0.0
    queue_timeouts: int = 0
    rate_limit_retries: int = 0
    rate_limit_failures: int = 0
    other_failures: int = 0
    last_rate_limit_at: Optional[float] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "limit": self.limit,
            "in_flight": self.in_flight,
            "calls": self.calls,
            "waited": self.waited,
            "wait_avg_s": round(self.wait_total / self.waited, 2) if self.waited else 0.0,
            "wait_max_s": round(self.wait_max, 2),
            "queue_timeouts": self.queue_timeouts,
            "rate_limit_retries": self.rate_limit_retries,
            "rate_limit_failures": self.rate_limit_failures,
            "other_failures": self.other_failures,
            "last_rate_limit_at": self.last_rate_limit_at,
        }


@dataclass
class Gate:
    limits: Dict[str, int]
    _semaphores: Dict[str, asyncio.Semaphore] = field(default_factory=dict)
    stats: Dict[str, LaneStats] = field(default_factory=dict)
    started_at: float = field(default_factory=time.time)

    def lane(self, name: str) -> asyncio.Semaphore:
        if name not in self._semaphores:
            limit = self.limits.get(name, 4)
            self._semaphores[name] = asyncio.Semaphore(limit)
            self.stats[name] = LaneStats(limit=limit)
        return self._semaphores[name]

    def snapshot(self) -> Dict[str, Any]:
        return {
            "uptime_s": int(time.time() - self.started_at),
            "queue_timeout_s": QUEUE_TIMEOUT,
            "retry": {
                "attempts": RETRY_ATTEMPTS,
                "base_s": RETRY_BASE,
                "max_delay_s": RETRY_MAX_DELAY,
                "retry_after_cap_s": RETRY_AFTER_CAP,
            },
            "lanes": {name: s.as_dict() for name, s in self.stats.items()},
        }


gate = Gate(limits=LANE_LIMITS)


# ---------------------------------------------------------------------------
# Recognising a provider rate limit
# ---------------------------------------------------------------------------

_RATE_LIMIT_WORDS = ("resource_exhausted", "rate limit", "rate_limit", "too many requests", "quota")
# "Please retry in 23.5s", "retryDelay": "23s", "retry-after: 12"
_RETRY_AFTER_RE = re.compile(
    r"(?:retry\s*(?:in|after)\s*[:=]?\s*|retryDelay['\"]?\s*[:=]\s*['\"]?)(\d+(?:\.\d+)?)\s*s?",
    re.IGNORECASE,
)


def _status_code(exc: BaseException) -> Optional[int]:
    for attr in ("status_code", "code", "status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    code = getattr(response, "status_code", None)
    return code if isinstance(code, int) else None


def is_rate_limit(exc: BaseException) -> bool:
    if isinstance(exc, RateLimitError):
        return True
    if _status_code(exc) == 429:
        return True
    text = f"{type(exc).__name__}: {exc}".lower()
    return "429" in text or any(w in text for w in _RATE_LIMIT_WORDS)


def retry_after_hint(exc: BaseException) -> Optional[float]:
    """Seconds the provider asked us to wait, when it said so."""
    for attr in ("retry_after", "retry_delay"):
        value = getattr(exc, attr, None)
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
    match = _RETRY_AFTER_RE.search(str(exc))
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def backoff_delay(attempt: int, hint: Optional[float]) -> float:
    """Exponential backoff with full jitter; the provider's own hint wins."""
    if hint is not None:
        return min(hint, RETRY_AFTER_CAP) + random.uniform(0, 0.5)
    return random.uniform(0, min(RETRY_MAX_DELAY, RETRY_BASE * (2**attempt)))


# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------


async def run(lane: str, call: Callable[[], Awaitable[T]], *, label: str = "") -> T:
    """
    Run ``call()`` inside the lane's queue, retrying provider rate limits.

    Raises :class:`ProviderBusy` when the queue stayed full for QUEUE_TIMEOUT,
    :class:`RateLimitError` when the provider kept answering 429, and whatever
    ``call`` raised otherwise (unchanged, so callers keep their own handling).
    """
    sem = gate.lane(lane)
    stats = gate.stats[lane]
    stats.calls += 1

    started = time.monotonic()
    queued = sem.locked()
    try:
        await asyncio.wait_for(sem.acquire(), timeout=QUEUE_TIMEOUT)
    except asyncio.TimeoutError:
        stats.queue_timeouts += 1
        logger.warning(f"llm gate[{lane}]: queue full for {QUEUE_TIMEOUT:.0f}s ({label})")
        raise ProviderBusy(lane, retry_after=min(30, int(QUEUE_TIMEOUT / 3) or 5))
    if queued:
        waited = time.monotonic() - started
        stats.waited += 1
        stats.wait_total += waited
        stats.wait_max = max(stats.wait_max, waited)

    stats.in_flight += 1
    try:
        attempt = 0
        while True:
            try:
                return await call()
            except Exception as exc:  # noqa: BLE001 - classified below
                if not is_rate_limit(exc):
                    stats.other_failures += 1
                    raise
                stats.last_rate_limit_at = time.time()
                hint = retry_after_hint(exc)
                if attempt >= RETRY_ATTEMPTS or (hint is not None and hint > RETRY_AFTER_CAP):
                    stats.rate_limit_failures += 1
                    logger.warning(
                        f"llm gate[{lane}]: provider rate limit, giving up after "
                        f"{attempt} retries ({label}): {exc}"
                    )
                    raise RateLimitError(
                        "ผู้ให้บริการ AI จำกัดจำนวนคำขอชั่วคราว กรุณาลองใหม่ในอีกสักครู่"
                    ) from exc
                delay = backoff_delay(attempt, hint)
                stats.rate_limit_retries += 1
                attempt += 1
                logger.info(
                    f"llm gate[{lane}]: 429 from provider, retry {attempt}/{RETRY_ATTEMPTS} "
                    f"in {delay:.1f}s ({label})"
                )
                await asyncio.sleep(delay)
    finally:
        stats.in_flight -= 1
        sem.release()
