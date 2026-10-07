"""Token accounting: price lookup, cost estimate, usage extraction."""

from types import SimpleNamespace

import pytest

from open_notebook.community import pricing, usage


@pytest.mark.parametrize(
    "model, matched",
    [
        ("gemini-3.5-flash-lite", "gemini-3.5-flash-lite"),
        ("models/gemini-3.5-flash-lite", "gemini-3.5-flash-lite"),
        ("gemini-3.5-flash", "gemini-3.5-flash"),  # not the -lite entry
        ("gemini-2.0-flash-001", "gemini-2.0-flash"),
        ("gemini-2.0-flash-lite-001", "gemini-2.0-flash-lite"),
        ("gemini-embedding-001", "gemini-embedding-001"),
        ("gpt-4o", None),
        ("", None),
        (None, None),
    ],
)
def test_price_lookup_uses_the_longest_prefix(model, matched):
    price = pricing.price_for(model)
    assert (price or {}).get("matched") == matched


def test_cost_estimate_for_flash_lite():
    # 10k in (2k cached) + 500 out + 100 thinking
    usd = pricing.estimate_cost_usd(
        "gemini-3.5-flash-lite", input_tokens=10_000, output_tokens=500, cached_tokens=2_000, thinking_tokens=100
    )
    expected = (8_000 * 0.30 + 2_000 * 0.03 + 600 * 2.50) / 1_000_000
    assert usd == pytest.approx(expected, rel=1e-6)
    assert pricing.estimate_cost_usd("unknown-model", input_tokens=1_000_000) == 0.0


def test_search_cost_only_beyond_the_free_allowance():
    assert pricing.search_cost_usd(0) == 0.0
    assert pricing.search_cost_usd(pricing.SEARCH_FREE_PER_MONTH) == 0.0
    assert pricing.search_cost_usd(pricing.SEARCH_FREE_PER_MONTH + 1000) == pytest.approx(pricing.SEARCH_USD_PER_1000)


def test_chat_usage_from_langchain_message():
    msg = SimpleNamespace(
        usage_metadata={"input_tokens": 11, "output_tokens": 1, "total_tokens": 12,
                        "input_token_details": {"cache_read": 3}, "output_token_details": {"reasoning": 0}},
        response_metadata={},
    )
    assert usage.chat_usage_from_message(msg) == {"input_tokens": 11, "output_tokens": 1, "cached_tokens": 3, "thinking_tokens": 0}


def test_chat_usage_falls_back_to_the_raw_gemini_shape():
    msg = SimpleNamespace(
        usage_metadata=None,
        response_metadata={"usage_metadata": {"prompt_token_count": 100, "candidates_token_count": 20,
                                              "cached_content_token_count": 10, "thoughts_token_count": 5}},
    )
    assert usage.chat_usage_from_message(msg) == {"input_tokens": 100, "output_tokens": 20, "cached_tokens": 10, "thinking_tokens": 5}
    assert usage.chat_usage_from_message(SimpleNamespace()) == {"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0, "thinking_tokens": 0}


def test_search_queries_counted_from_grounding_metadata():
    assert usage.search_queries_from_metadata({"web_search_queries": ["a", "b", ""]}) == 2
    assert usage.search_queries_from_metadata(None) == 0


def test_embedding_tokens_are_estimated_from_the_texts():
    n = usage.estimate_tokens(["hello world", "สวัสดีครับ"])
    assert n > 0


def test_context_is_per_task_and_additive():
    usage.set_context(feature="ingest")
    usage.set_context(user_id="42")
    assert usage.context() == {"feature": "ingest", "user_id": 42}
