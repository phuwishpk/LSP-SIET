"""
The provider gate (open_notebook/community/throttle.py).

A burst of students must become a short queue, a provider 429 a retry with
backoff, and only a sustained overload an error the client can retry.
"""

import asyncio

import pytest

from open_notebook.community import throttle
from open_notebook.exceptions import RateLimitError


class Boom(Exception):
    def __init__(self, msg, status_code=None):
        super().__init__(msg)
        if status_code is not None:
            self.status_code = status_code


@pytest.fixture
def fresh_gate(monkeypatch):
    gate = throttle.Gate(limits={"chat": 2, "embedding": 1})
    monkeypatch.setattr(throttle, "gate", gate)
    monkeypatch.setattr(throttle, "QUEUE_TIMEOUT", 0.3)
    monkeypatch.setattr(throttle, "RETRY_ATTEMPTS", 3)
    monkeypatch.setattr(throttle, "RETRY_BASE", 0.01)
    monkeypatch.setattr(throttle, "RETRY_MAX_DELAY", 0.02)
    monkeypatch.setattr(throttle, "RETRY_AFTER_CAP", 1.0)
    return gate


# ----------------------------------------------------------------- classification
@pytest.mark.parametrize(
    "exc, expected",
    [
        (Boom("429 Too Many Requests"), True),
        (Boom("RESOURCE_EXHAUSTED: quota exceeded"), True),
        (Boom("anything", status_code=429), True),
        (RateLimitError("x"), True),
        (Boom("500 internal"), False),
        (ValueError("bad json"), False),
    ],
)
def test_is_rate_limit(exc, expected):
    assert throttle.is_rate_limit(exc) is expected


@pytest.mark.parametrize(
    "msg, expected",
    [
        ("429 RESOURCE_EXHAUSTED. Please retry in 23.5s.", 23.5),
        ('{"retryDelay": "7s"}', 7.0),
        ("retry after: 12", 12.0),
        ("no hint here", None),
    ],
)
def test_retry_after_hint(msg, expected):
    assert throttle.retry_after_hint(Boom(msg)) == expected


def test_backoff_prefers_the_providers_hint_but_caps_it(monkeypatch):
    monkeypatch.setattr(throttle, "RETRY_AFTER_CAP", 5.0)
    assert 5.0 <= throttle.backoff_delay(0, hint=60.0) <= 5.5
    monkeypatch.setattr(throttle, "RETRY_BASE", 1.0)
    monkeypatch.setattr(throttle, "RETRY_MAX_DELAY", 3.0)
    for attempt in range(6):
        assert 0 <= throttle.backoff_delay(attempt, None) <= 3.0


# ----------------------------------------------------------------- queueing
@pytest.mark.asyncio
async def test_lane_limits_concurrency_and_records_waits(fresh_gate):
    running, peak = 0, 0

    async def work():
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.05)
        running -= 1
        return "ok"

    results = await asyncio.gather(*(throttle.run("chat", work) for _ in range(6)))
    assert results == ["ok"] * 6
    assert peak == 2  # the lane limit, never more
    stats = fresh_gate.stats["chat"]
    assert stats.calls == 6 and stats.waited >= 4 and stats.in_flight == 0
    assert stats.wait_max > 0


@pytest.mark.asyncio
async def test_full_queue_becomes_provider_busy_not_an_exception_soup(fresh_gate):
    async def slow():
        await asyncio.sleep(1.0)

    blocker = asyncio.create_task(throttle.run("embedding", slow))
    await asyncio.sleep(0.01)
    with pytest.raises(throttle.ProviderBusy) as info:
        await throttle.run("embedding", slow)
    assert info.value.retry_after >= 1
    assert fresh_gate.stats["embedding"].queue_timeouts == 1
    blocker.cancel()


# ----------------------------------------------------------------- retries
@pytest.mark.asyncio
async def test_429_is_retried_then_succeeds(fresh_gate):
    calls = 0

    async def flaky():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise Boom("429 RESOURCE_EXHAUSTED. Please retry in 0.01s.")
        return "answer"

    assert await throttle.run("chat", flaky) == "answer"
    assert calls == 3
    assert fresh_gate.stats["chat"].rate_limit_retries == 2
    assert fresh_gate.stats["chat"].rate_limit_failures == 0


@pytest.mark.asyncio
async def test_persistent_429_gives_up_as_rate_limit_error(fresh_gate):
    async def always():
        raise Boom("429 Too Many Requests")

    with pytest.raises(RateLimitError):
        await throttle.run("chat", always)
    assert fresh_gate.stats["chat"].rate_limit_retries == 3
    assert fresh_gate.stats["chat"].rate_limit_failures == 1
    assert fresh_gate.stats["chat"].in_flight == 0  # the slot was released


@pytest.mark.asyncio
async def test_a_huge_retry_after_fails_fast(fresh_gate):
    async def overloaded():
        raise Boom("429 RESOURCE_EXHAUSTED. Please retry in 90s.")

    with pytest.raises(RateLimitError):
        await throttle.run("chat", overloaded)
    assert fresh_gate.stats["chat"].rate_limit_retries == 0


@pytest.mark.asyncio
async def test_other_errors_pass_through_untouched(fresh_gate):
    async def broken():
        raise ValueError("bad json from model")

    with pytest.raises(ValueError):
        await throttle.run("chat", broken)
    assert fresh_gate.stats["chat"].other_failures == 1
    assert fresh_gate.stats["chat"].rate_limit_retries == 0


def test_snapshot_shape(fresh_gate):
    fresh_gate.lane("chat")
    snap = fresh_gate.snapshot()
    assert set(snap) == {"uptime_s", "queue_timeout_s", "retry", "lanes"}
    assert snap["lanes"]["chat"]["limit"] == 2
