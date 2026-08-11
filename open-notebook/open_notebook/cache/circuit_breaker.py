"""Phase 6.5: Circuit breaker for intent validation.

Three-state state machine stored in Redis so it survives restarts:

  CLOSED ──(failures >= threshold)──► OPEN ──(timeout)──► HALF-OPEN
                                                          │
                              (validation passes) ◄────────┘

In OPEN state, validate_intent_match() returns None immediately so callers
fall back to fresh-answer generation without paying for a slow/failing model.
"""

from __future__ import annotations

import asyncio
import enum
import json
import time
from typing import Optional

from loguru import logger

from open_notebook.config import (
    ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED,
    ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD,
    ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,
    ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT_SECONDS,
)
from open_notebook.cache.redis_client import redis_client


CIRCUIT_KEY = "cache:intent_validator:circuit"
PERSISTENT_STATES = frozenset({"CLOSED", "HALF_OPEN"})


class CircuitState(str, enum.Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(self) -> None:
        self._state: CircuitState = CircuitState.CLOSED
        self._failures: int = 0
        self._opens_at: Optional[float] = None  # unix timestamp when opened
        self._half_open_passes: int = 0
        self._half_open_failures: int = 0

    @property
    def state(self) -> CircuitState:
        return self._state

    async def _load(self) -> None:
        try:
            raw = await redis_client.get_json(CIRCUIT_KEY)
            if raw and isinstance(raw, dict):
                self._state = CircuitState(raw.get("state", "closed"))
                self._failures = int(raw.get("failures", 0))
                self._opens_at = raw.get("opens_at")
                self._half_open_passes = int(raw.get("half_open_passes", 0))
                self._half_open_failures = int(raw.get("half_open_failures", 0))
        except Exception:
            pass

    async def _save(self) -> None:
        try:
            data = {
                "state": self._state.value,
                "failures": self._failures,
                "opens_at": self._opens_at,
                "half_open_passes": self._half_open_passes,
                "half_open_failures": self._half_open_failures,
            }
            # No TTL — persisted until next deliberate change
            await redis_client.set_json(CIRCUIT_KEY, data)
        except Exception:
            pass

    async def _check_transition(self) -> None:
        """Check OPEN→HALF_OPEN transition based on timeout."""
        if self._state == CircuitState.OPEN and self._opens_at is not None:
            elapsed = time.time() - self._opens_at
            if elapsed >= ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT_SECONDS:
                self._state = CircuitState.HALF_OPEN
                self._half_open_passes = 0
                self._half_open_failures = 0
                await self._save()
                logger.warning(
                    "Intent-validation circuit breaker transitioned OPEN → HALF_OPEN "
                    "(probe window)"
                )

    def is_open(self) -> bool:
        """True when the circuit should block validation calls."""
        return self._state == CircuitState.OPEN

    def is_closed(self) -> bool:
        return self._state == CircuitState.CLOSED

    async def record_success(self) -> None:
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_passes += 1
            if (
                self._half_open_passes
                >= ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS
            ):
                self._state = CircuitState.CLOSED
                self._failures = 0
                self._half_open_passes = 0
                self._half_open_failures = 0
                self._opens_at = None
                await self._save()
                logger.info(
                    "Intent-validation circuit breaker CLOSED "
                    f"({ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS} consecutive successes)"
                )
        elif self._state == CircuitState.CLOSED:
            self._failures = 0
            await self._save()

    async def record_failure(self) -> None:
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_failures += 1
            self._state = CircuitState.OPEN
            self._opens_at = time.time()
            self._half_open_passes = 0
            self._half_open_failures = 0
            await self._save()
            logger.warning(
                "Intent-validation circuit breaker OPEN "
                f"(failure during HALF_OPEN probe)"
            )
        elif self._state == CircuitState.CLOSED:
            self._failures += 1
            if self._failures >= ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD:
                self._state = CircuitState.OPEN
                self._opens_at = time.time()
                await self._save()
                logger.warning(
                    f"Intent-validation circuit breaker OPEN "
                    f"(failures={self._failures} >= threshold "
                    f"{ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD})"
                )

    async def open(self) -> None:
        """Manually trip the circuit to OPEN."""
        self._state = CircuitState.OPEN
        self._opens_at = time.time()
        self._failures = 0
        self._half_open_passes = 0
        self._half_open_failures = 0
        await self._save()

    async def close(self) -> None:
        """Manually reset the circuit to CLOSED."""
        self._state = CircuitState.CLOSED
        self._failures = 0
        self._opens_at = None
        self._half_open_passes = 0
        self._half_open_failures = 0
        await self._save()

    def get_status(self) -> dict:
        """Return serialisable state snapshot."""
        return {
            "enabled": ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED,
            "state": self._state.value,
            "failures": self._failures,
            "opens_at": self._opens_at,
            "half_open_passes": self._half_open_passes,
            "half_open_failures": self._half_open_failures,
            "config": {
                "error_threshold": ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD,
                "open_timeout_seconds": ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT_SECONDS,
                "half_open_required_successes": ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,
            },
        }


circuit_breaker = CircuitBreaker()


async def init_circuit_breaker() -> None:
    """Load persisted state on startup."""
    await circuit_breaker._load()
