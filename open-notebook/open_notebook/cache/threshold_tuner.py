"""Phase 5 adaptive tuning for answer-cache similarity thresholds."""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from open_notebook.cache.metrics import cache_metrics
from open_notebook.config import (
    ANSWER_CACHE_TUNER_ENABLED,
    ANSWER_CACHE_TUNER_HIGH_MAX,
    ANSWER_CACHE_TUNER_HIGH_MIN,
    ANSWER_CACHE_TUNER_INTERVAL_SECONDS,
    ANSWER_CACHE_TUNER_MID_ADJUST_STEP,
    ANSWER_CACHE_TUNER_MID_FAIL_RATE_DECREASE,
    ANSWER_CACHE_TUNER_MID_FAIL_RATE_INCREASE,
    ANSWER_CACHE_TUNER_MID_MAX,
    ANSWER_CACHE_TUNER_MID_MIN,
)


DEFAULT_HIGH_THRESHOLD = float(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_HIGH_SIMILARITY", "0.97")
)
DEFAULT_MID_THRESHOLD = float(
    os.getenv("OPEN_NOTEBOOK_ANSWER_CACHE_MID_SIMILARITY", "0.92")
)
_MIN_GAP = 0.001


class ThresholdTuner:
    def __init__(self) -> None:
        self._high = DEFAULT_HIGH_THRESHOLD
        self._mid = DEFAULT_MID_THRESHOLD
        self._last_adjustment: Optional[datetime] = None
        self._task: Optional[asyncio.Task] = None

    def get_high_threshold(self) -> float:
        return self._high

    def get_mid_threshold(self) -> float:
        return self._mid

    @property
    def last_adjustment(self) -> Optional[datetime]:
        return self._last_adjustment

    def reset(self) -> None:
        self._high = DEFAULT_HIGH_THRESHOLD
        self._mid = DEFAULT_MID_THRESHOLD
        self._last_adjustment = None

    def _enforce_bounds(self) -> None:
        self._high = min(max(self._high, ANSWER_CACHE_TUNER_HIGH_MIN), ANSWER_CACHE_TUNER_HIGH_MAX)
        self._mid = min(max(self._mid, ANSWER_CACHE_TUNER_MID_MIN), ANSWER_CACHE_TUNER_MID_MAX)
        if self._mid >= self._high:
            self._mid = max(ANSWER_CACHE_TUNER_MID_MIN, self._high - _MIN_GAP)
        if self._high <= self._mid:
            self._high = min(ANSWER_CACHE_TUNER_HIGH_MAX, self._mid + _MIN_GAP)

    async def _tune_once(self) -> bool:
        signals = cache_metrics.compute_tuning_signals()
        if signals["confidence"] < 0.5:
            logger.debug("Threshold tuner skipped: insufficient production samples")
            return False

        intent_fail = float(signals["intent_fail_ratio"])
        if intent_fail > 0.60:
            logger.warning(
                f"Tuner: intent validation fail ratio {intent_fail:.1%} > 60%. "
                "Validator/provider may need review; thresholds were not adjusted."
            )
            return False

        original_high, original_mid = self._high, self._mid
        mid_rate = float(signals["mid_failure_rate"])
        high_rate = float(signals["high_failure_rate"])

        if int(signals["mid_outcomes"]) > 0:
            if mid_rate > ANSWER_CACHE_TUNER_MID_FAIL_RATE_INCREASE:
                self._mid += ANSWER_CACHE_TUNER_MID_ADJUST_STEP
            elif mid_rate < ANSWER_CACHE_TUNER_MID_FAIL_RATE_DECREASE:
                self._mid -= ANSWER_CACHE_TUNER_MID_ADJUST_STEP

        if int(signals["high_outcomes"]) > 0 and high_rate > 0.05:
            self._high += 0.005

        self._enforce_bounds()
        changed = self._high != original_high or self._mid != original_mid
        if changed:
            self._last_adjustment = datetime.now(timezone.utc)
            cache_metrics.record_tuner_adjustment(self._high, self._mid)
            reason = self._build_reason(signals, original_high, original_mid)
            await self._push_log(original_high, original_mid, reason, signals)
            logger.info(
                "Tuner adjusted thresholds: "
                f"HIGH {original_high:.4f}->{self._high:.4f}, "
                f"MID {original_mid:.4f}->{self._mid:.4f}"
            )
        return changed

    def _build_reason(
        self, signals: dict, original_high: float, original_mid: float
    ) -> str:
        reasons = []
        mid_rate = float(signals.get("mid_failure_rate", 0))
        high_rate = float(signals.get("high_failure_rate", 0))
        intent_fail = float(signals.get("intent_fail_ratio", 0))
        if self._mid > original_mid:
            reasons.append(
                f"mid_fail_rate={mid_rate:.3f} > threshold "
                f"({float(signals.get('mid_fail_threshold', 0.15)):.3f})"
            )
        elif self._mid < original_mid:
            reasons.append(
                f"mid_fail_rate={mid_rate:.3f} < threshold "
                f"({float(signals.get('mid_decrease_threshold', 0.05)):.3f})"
            )
        if self._high > original_high:
            reasons.append(f"high_fail_rate={high_rate:.3f} > 0.05")
        if intent_fail > 0.60:
            reasons.append(
                f"CRITICAL: intent_fail_ratio={intent_fail:.1%} > 60% "
                "(validator/provider issue detected)"
            )
        return "; ".join(reasons) if reasons else "threshold_refresh"

    async def _push_log(
        self,
        from_high: float,
        from_mid: float,
        reason: str,
        signals: dict,
    ) -> None:
        try:
            from open_notebook.cache.tuner_decision_log import push_decision

            await push_decision(
                from_high=from_high,
                to_high=self._high,
                from_mid=from_mid,
                to_mid=self._mid,
                reason=reason,
                signal_snapshot=signals,
            )
        except Exception:
            pass  # Never block tuning on log failure

    async def run_loop(self) -> None:
        logger.info(
            f"Adaptive answer-cache tuner started (interval={ANSWER_CACHE_TUNER_INTERVAL_SECONDS}s)"
        )
        try:
            while True:
                await asyncio.sleep(max(1, ANSWER_CACHE_TUNER_INTERVAL_SECONDS))
                try:
                    await self._tune_once()
                except Exception as exc:
                    logger.warning(f"Threshold tuner iteration failed safely: {exc}")
        except asyncio.CancelledError:
            logger.info("Adaptive answer-cache tuner stopped")
            raise

    def start(self) -> Optional[asyncio.Task]:
        if not ANSWER_CACHE_TUNER_ENABLED:
            return None
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run_loop())
        return self._task

    async def stop(self) -> None:
        if self._task is None or self._task.done():
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None


threshold_tuner = ThresholdTuner()


async def start_tuner_if_enabled() -> Optional[asyncio.Task]:
    return threshold_tuner.start()


async def stop_tuner() -> None:
    await threshold_tuner.stop()
