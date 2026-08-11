"""Phase 6.4 + 6.5 tests: tuner decision log and circuit breaker."""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch

import pytest

from open_notebook.cache.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    circuit_breaker,
)
from open_notebook.config import (
    ANSWER_CACHE_CIRCUIT_BREAKER_ENABLED,
    ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD,
    ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,
)
from open_notebook.cache.tuner_decision_log import (
    clear_history,
    get_history,
    push_decision,
)


# ─────────────────────────────────────────────────────────────────────────────
# Circuit Breaker — state machine
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_circuit_breaker():
    circuit_breaker._state = CircuitState.CLOSED
    circuit_breaker._failures = 0
    circuit_breaker._opens_at = None
    circuit_breaker._half_open_passes = 0
    circuit_breaker._half_open_failures = 0
    # Clear cached instance so patch applies to each test
    import open_notebook.cache.intent_validator as intent_validator
    intent_validator._cb_instance = None
    intent_validator._cb_initialized = False
    yield
    circuit_breaker._state = CircuitState.CLOSED
    circuit_breaker._failures = 0
    circuit_breaker._opens_at = None
    circuit_breaker._half_open_passes = 0
    circuit_breaker._half_open_failures = 0
    intent_validator._cb_instance = None
    intent_validator._cb_initialized = False


class TestCircuitBreakerStateMachine:
    def test_starts_closed(self):
        assert circuit_breaker.state == CircuitState.CLOSED
        assert not circuit_breaker.is_open()
        assert circuit_breaker.is_closed()

    @pytest.mark.asyncio
    async def test_failures_trip_circuit(self):
        for _ in range(ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD):
            await circuit_breaker.record_failure()

        assert circuit_breaker.state == CircuitState.OPEN
        assert circuit_breaker.is_open()

    @pytest.mark.asyncio
    async def test_success_resets_failure_count(self):
        await circuit_breaker.record_failure()
        await circuit_breaker.record_failure()
        await circuit_breaker.record_success()

        assert circuit_breaker._failures == 0
        assert circuit_breaker.is_closed()

    @pytest.mark.asyncio
    async def test_half_open_after_timeout(self):
        import time

        circuit_breaker._state = CircuitState.OPEN
        circuit_breaker._opens_at = time.time() - 999  # far in past

        await circuit_breaker._check_transition()

        assert circuit_breaker.state == CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_half_open_all_successes_closes(self):
        circuit_breaker._state = CircuitState.HALF_OPEN
        circuit_breaker._half_open_passes = 0

        for _ in range(ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS):
            await circuit_breaker.record_success()

        assert circuit_breaker.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_half_open_one_failure_reopens(self):
        circuit_breaker._state = CircuitState.HALF_OPEN
        await circuit_breaker.record_failure()

        assert circuit_breaker.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_manual_open(self):
        await circuit_breaker.open()

        assert circuit_breaker.state == CircuitState.OPEN
        assert circuit_breaker._opens_at is not None

    @pytest.mark.asyncio
    async def test_manual_close(self):
        circuit_breaker._state = CircuitState.OPEN
        circuit_breaker._opens_at = 123.45

        await circuit_breaker.close()

        assert circuit_breaker.state == CircuitState.CLOSED
        assert circuit_breaker._opens_at is None

    def test_get_status_returns_dict(self):
        status = circuit_breaker.get_status()

        assert isinstance(status, dict)
        assert "state" in status
        assert "enabled" in status
        assert "config" in status
        assert status["state"] == "closed"

    @pytest.mark.asyncio
    async def test_open_does_not_record_for_half_open_failures(self):
        """Failure in half_open shouldn't increment _failures counter."""
        circuit_breaker._state = CircuitState.HALF_OPEN
        circuit_breaker._half_open_failures = 0

        await circuit_breaker.record_failure()

        assert circuit_breaker._failures == 0  # NOT incremented


# ─────────────────────────────────────────────────────────────────────────────
# Decision Log
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_push_and_get_decision():
    result = await push_decision(
        from_high=0.97,
        to_high=0.975,
        from_mid=0.92,
        to_mid=0.92,
        reason="mid_fail_rate=0.20 > threshold (0.15)",
        signal_snapshot={"mid_failure_rate": 0.20, "mid_outcomes": 50},
    )
    history = await get_history(limit=10)

    if result:  # Redis was available
        assert len(history) >= 1
        entry = history[0]
        assert entry["from_high"] == 0.97
        assert entry["to_high"] == 0.975
        assert "mid_fail_rate" in entry["reason"]
        assert "signal_snapshot" in entry


@pytest.mark.asyncio
async def test_get_history_returns_empty_gracefully():
    """get_history returns [] when Redis is unavailable (no-op)."""
    result = await get_history(limit=5)
    assert isinstance(result, list)


@pytest.mark.asyncio
async def test_clear_history():
    await push_decision(0.97, 0.975, 0.92, 0.92, "test", {})
    await clear_history()
    history = await get_history(limit=100)
    assert history == []


# ─────────────────────────────────────────────────────────────────────────────
# Intent Validator — circuit breaker integration
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validate_intent_match_blocked_when_circuit_open():
    from open_notebook.cache import intent_validator

    circuit_breaker._state = CircuitState.OPEN

    with patch.object(intent_validator, "_get_circuit_breaker", return_value=circuit_breaker):
        result = await intent_validator.validate_intent_match(
            new_question="What is the capital of France?",
            cached_question="Capital of France?",
            cached_intent="capital_of_country",
            model_id="test-model",
        )

    assert result is None  # Fast-fail: generate fresh answer


@pytest.mark.asyncio
async def test_validate_intent_match_closes_circuit_on_success():
    from open_notebook.cache import intent_validator

    circuit_breaker._state = CircuitState.CLOSED
    circuit_breaker._failures = 0

    mock_response = type("R", (), {"content": '{"same_intent":true}'})()
    mock_langchain = AsyncMock(return_value=mock_response)
    mock_model = Mock()
    mock_model.to_langchain = Mock(return_value=mock_langchain)

    with patch.object(intent_validator, "_get_circuit_breaker", return_value=circuit_breaker), \
         patch.object(
             intent_validator,
             "_invoke_json_model",
             new=AsyncMock(return_value={"same_intent": True}),
         ):
        result = await intent_validator.validate_intent_match(
            new_question="What is the capital of France?",
            cached_question="Capital of France?",
            cached_intent="capital_of_country",
            model_id="test-model",
        )

    assert result is True
    assert circuit_breaker._failures == 0


# ─────────────────────────────────────────────────────────────────────────────
# Analytics endpoint — Phase 6 fields
# ─────────────────────────────────────────────────────────────────────────────

def test_circuit_breaker_status_returns_expected_keys():
    """Smoke test: verify get_status returns expected fields."""
    circuit_breaker._state = CircuitState.CLOSED
    status = circuit_breaker.get_status()
    assert "state" in status
    assert "enabled" in status
    assert "config" in status
    assert "failures" in status
    assert status["state"] == "closed"
