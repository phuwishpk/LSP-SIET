"""
Throttle for the sign-in and sign-up endpoints.

Without this, `POST /api/users/login` accepts unlimited guesses: the seeded
`admin1` account was reachable by a script in seconds. Content spam is already
handled in `open_notebook/community/ratelimit.py`, but that counts rows in the
content tables, which is no use for attempts that never write anything.

Two counters, both sliding windows:

* **per username** – the real defence. An attacker can change IP freely, but
  the account they are guessing at cannot change, so this one cannot be evaded.
* **per client IP** – a wider net to slow a script working through many
  accounts. Behind Traefik the peer address is always the proxy, so the
  forwarded address is used when present. That header is forgeable when the API
  port is reachable directly, which is exactly why it is only the secondary
  limit and carries a much higher threshold.

Counters live in Redis so they survive a restart and are shared between
workers; when Redis is down the module keeps an in-process copy rather than
dropping the protection entirely.
"""

from __future__ import annotations

import os
import time
from typing import Dict, Optional, Tuple

from fastapi import HTTPException, Request, status
from loguru import logger

from open_notebook.cache.redis_client import redis_client


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        logger.warning(f"Invalid {name}={raw!r}; using default {default}")
        return default


# Five wrong passwords in a quarter of an hour is already someone guessing.
MAX_FAILURES_PER_USER = _env_int("LOGIN_MAX_FAILURES_PER_USER", 5)
# Deliberately loose: a campus NATs hundreds of students behind one address, so
# a tight per-IP limit would lock out a whole faculty because of other people's
# typos. Set it to 0 to switch the IP counter off entirely.
MAX_FAILURES_PER_IP = _env_int("LOGIN_MAX_FAILURES_PER_IP", 100)
FAILURE_WINDOW_SECONDS = _env_int("LOGIN_FAILURE_WINDOW_SECONDS", 900)
# Sign-ups are cheap to script, so cap them per address as well - again loosely,
# for the same NAT reason. In production registration is off anyway.
MAX_REGISTRATIONS_PER_IP = _env_int("REGISTER_MAX_PER_IP", 20)
REGISTER_WINDOW_SECONDS = _env_int("REGISTER_WINDOW_SECONDS", 3600)

_PREFIX = "auth:throttle:"

# Fallback store used only when Redis is unavailable: {key: (count, expires_at)}
_memory: Dict[str, Tuple[int, float]] = {}


def _memory_incr(key: str, ttl: int) -> int:
    now = time.time()
    # Opportunistically drop expired entries so this cannot grow without bound.
    for stale in [k for k, (_, exp) in _memory.items() if exp <= now]:
        _memory.pop(stale, None)
    count, expires_at = _memory.get(key, (0, now + ttl))
    if expires_at <= now:
        count, expires_at = 0, now + ttl
    count += 1
    _memory[key] = (count, expires_at)
    return count


def _memory_peek(key: str) -> Tuple[int, int]:
    now = time.time()
    count, expires_at = _memory.get(key, (0, 0.0))
    if expires_at <= now:
        return 0, 0
    return count, int(expires_at - now)


def client_ip(request: Optional[Request]) -> str:
    """Best-effort caller address; see the module docstring on trust."""
    if request is None:
        return "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return (request.client.host if request.client else "unknown")[:45]


async def _incr(key: str, ttl: int) -> int:
    value = await redis_client.incr_with_ttl(_PREFIX + key, ttl)
    if value is None:
        return _memory_incr(key, ttl)
    return value


async def _peek(key: str, ttl: int) -> Tuple[int, int]:
    """Current count and seconds left, without incrementing."""
    value = await redis_client.get_binary(_PREFIX + key)
    if value is None and not await redis_client.is_available():
        return _memory_peek(key)
    try:
        count = int(value) if value is not None else 0
    except (TypeError, ValueError):
        count = 0
    remaining = await redis_client.seconds_until_expiry(_PREFIX + key) or ttl
    return count, remaining


def _too_many(retry_after: int, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=message,
        headers={"Retry-After": str(max(1, retry_after))},
    )


async def check_login_allowed(username: str, request: Optional[Request] = None) -> None:
    """Refuse the attempt when this account or address has failed too often."""
    name = (username or "").strip().lower()[:64]
    if MAX_FAILURES_PER_USER and name:
        count, remaining = await _peek(f"user:{name}", FAILURE_WINDOW_SECONDS)
        if count >= MAX_FAILURES_PER_USER:
            minutes = max(1, round(remaining / 60))
            raise _too_many(
                remaining,
                f"ใส่รหัสผ่านผิดหลายครั้งเกินไป กรุณารออีก {minutes} นาทีแล้วลองใหม่",
            )
    if MAX_FAILURES_PER_IP:
        ip = client_ip(request)
        count, remaining = await _peek(f"ip:{ip}", FAILURE_WINDOW_SECONDS)
        if count >= MAX_FAILURES_PER_IP:
            minutes = max(1, round(remaining / 60))
            raise _too_many(
                remaining,
                f"มีการพยายามเข้าสู่ระบบจากเครื่องนี้มากเกินไป กรุณารออีก {minutes} นาที",
            )


async def record_login_failure(username: str, request: Optional[Request] = None) -> None:
    name = (username or "").strip().lower()[:64]
    if name:
        await _incr(f"user:{name}", FAILURE_WINDOW_SECONDS)
    await _incr(f"ip:{client_ip(request)}", FAILURE_WINDOW_SECONDS)


async def clear_login_failures(username: str) -> None:
    """A correct password proves the owner is back; wipe their counter."""
    name = (username or "").strip().lower()[:64]
    if not name:
        return
    key = f"user:{name}"
    await redis_client.delete(_PREFIX + key)
    _memory.pop(key, None)


async def check_registration_allowed(request: Optional[Request] = None) -> None:
    """Stop one address from scripting hundreds of accounts."""
    if not MAX_REGISTRATIONS_PER_IP:
        return
    ip = client_ip(request)
    count, remaining = await _peek(f"reg:{ip}", REGISTER_WINDOW_SECONDS)
    if count >= MAX_REGISTRATIONS_PER_IP:
        minutes = max(1, round(remaining / 60))
        raise _too_many(
            remaining,
            f"สมัครสมาชิกจากเครื่องนี้บ่อยเกินไป กรุณารออีก {minutes} นาที",
        )


async def record_registration(request: Optional[Request] = None) -> None:
    await _incr(f"reg:{client_ip(request)}", REGISTER_WINDOW_SECONDS)
