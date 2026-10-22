"""
Price list for estimating what each provider call costs.

The provider's invoice is the truth; this is the *estimate* the admin page shows
so the operator sees cost grow in near-real time instead of at the end of the
month. Prices are USD per 1M tokens from https://ai.google.dev/gemini-api/docs/pricing
(standard tier, text), and can be overridden without a deploy through
``LLM_PRICES_JSON`` (same shape as :data:`DEFAULT_PRICES`).

Grounding with Google Search is billed per search *query* on Gemini 3.x
(5,000 free per month, then $14 per 1,000); that part is computed over a whole
month, not per call, so it lives in the aggregation, not here.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from loguru import logger

# {model prefix: {"input": $/1M, "output": $/1M (thinking tokens bill as output),
#                 "cached": $/1M for cache hits, "note": ...}}
DEFAULT_PRICES: Dict[str, Dict[str, Any]] = {
    "gemini-3.5-flash-lite": {"input": 0.30, "output": 2.50, "cached": 0.03},
    "gemini-3.5-flash": {"input": 1.50, "output": 9.00, "cached": 0.15},
    "gemini-3.1-pro": {"input": 2.00, "output": 12.00, "cached": 0.20},
    "gemini-3-pro": {"input": 2.00, "output": 12.00, "cached": 0.20},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00, "cached": 0.125},
    "gemini-2.5-flash-lite": {"input": 0.10, "output": 0.40, "cached": 0.01},
    "gemini-2.5-flash": {"input": 0.30, "output": 2.50, "cached": 0.03},
    "gemini-2.0-flash-lite": {"input": 0.075, "output": 0.30, "cached": 0.0},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40, "cached": 0.025},
    "gemini-embedding-2": {"input": 0.20, "output": 0.0, "cached": 0.0},
    # Not on the public price page any more; last published price.
    "gemini-embedding-001": {"input": 0.15, "output": 0.0, "cached": 0.0, "note": "ราคาเดิมที่เคยประกาศ"},
}

SEARCH_FREE_PER_MONTH = int(os.getenv("LLM_SEARCH_FREE_PER_MONTH", "5000") or 5000)
SEARCH_USD_PER_1000 = float(os.getenv("LLM_SEARCH_USD_PER_1000", "14") or 14)
USD_THB_RATE = float(os.getenv("USD_THB_RATE", "34") or 34)


def _load_overrides() -> Dict[str, Dict[str, Any]]:
    raw = os.getenv("LLM_PRICES_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return {str(k): dict(v) for k, v in data.items() if isinstance(v, dict)}
    except (ValueError, TypeError, AttributeError) as exc:
        logger.warning(f"LLM_PRICES_JSON ignored: {exc}")
        return {}


PRICES: Dict[str, Dict[str, Any]] = {**DEFAULT_PRICES, **_load_overrides()}


def price_for(model: Optional[str]) -> Optional[Dict[str, Any]]:
    """Longest matching prefix: ``gemini-2.0-flash-001`` -> ``gemini-2.0-flash``."""
    name = (model or "").strip().lower()
    if not name:
        return None
    if name.startswith("models/"):
        name = name[len("models/"):]
    best = ""
    for prefix in PRICES:
        if name.startswith(prefix) and len(prefix) > len(best):
            best = prefix
    return {**PRICES[best], "matched": best} if best else None


def estimate_cost_usd(
    model: Optional[str],
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_tokens: int = 0,
    thinking_tokens: int = 0,
) -> float:
    """Token cost of one call in USD (0.0 for a model we have no price for)."""
    price = price_for(model)
    if not price:
        return 0.0
    billable_input = max(0, int(input_tokens) - int(cached_tokens))
    usd = (
        billable_input * float(price.get("input", 0.0))
        + int(cached_tokens) * float(price.get("cached", 0.0))
        + (int(output_tokens) + int(thinking_tokens)) * float(price.get("output", 0.0))
    ) / 1_000_000
    return round(usd, 8)


def search_cost_usd(queries_this_month: int) -> float:
    """Grounding queries beyond the monthly free allowance."""
    billable = max(0, int(queries_this_month) - SEARCH_FREE_PER_MONTH)
    return round(billable / 1000 * SEARCH_USD_PER_1000, 6)


def price_table() -> Dict[str, Any]:
    return {
        "models": {k: {kk: v for kk, v in p.items()} for k, p in sorted(PRICES.items())},
        "search": {"free_per_month": SEARCH_FREE_PER_MONTH, "usd_per_1000": SEARCH_USD_PER_1000},
        "usd_thb_rate": USD_THB_RATE,
        "source": "https://ai.google.dev/gemini-api/docs/pricing",
    }
