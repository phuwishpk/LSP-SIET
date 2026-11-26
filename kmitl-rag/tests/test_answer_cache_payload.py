"""The answer cache can carry a whole result (payload) and a per-call TTL."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from siet_platform.cache import answer_cache
from siet_platform.cache.answer_cache import get_cached_answer, set_cached_answer


class FakeCache:
    def __init__(self):
        self.store: dict[str, object] = {}
        self.ttls: dict[str, int | None] = {}

    async def get_json(self, key):
        return self.store.get(key)

    async def set_json(self, key, value, ttl=None):
        self.store[key] = value
        self.ttls[key] = ttl
        return True


PAYLOAD = {"answer": "Paging คือ ...", "citations": [{"index": 1}], "web_sources": []}
EMB = [1.0, 0.0, 0.0]


@pytest.fixture
def cache():
    fake = FakeCache()
    with patch.object(answer_cache, "cache_service", fake), patch.object(
        answer_cache, "generate_embedding", new=AsyncMock(return_value=EMB)
    ), patch.object(answer_cache, "_increment_entry_hit_count", new=AsyncMock(return_value=1)):
        yield fake


@pytest.mark.asyncio
async def test_exact_hit_returns_payload(cache):
    await set_cached_answer("Paging คืออะไร", "Paging คือ ...", "ctx", "th", payload=PAYLOAD)
    answer, _emb, match = await get_cached_answer("Paging คืออะไร", "ctx", "th")
    assert answer == "Paging คือ ..."
    assert match["match_type"] == "exact"
    assert match["payload"] == PAYLOAD


@pytest.mark.asyncio
async def test_semantic_high_hit_returns_payload(cache):
    await set_cached_answer("Paging คืออะไร", "Paging คือ ...", "ctx", "th", payload=PAYLOAD)
    answer, _emb, match = await get_cached_answer("อธิบาย paging หน่อย", "ctx", "th")
    assert match["match_type"] == "semantic_high"
    assert match["payload"] == PAYLOAD


@pytest.mark.asyncio
async def test_mid_candidate_carries_payload(cache):
    await set_cached_answer("Paging คืออะไร", "Paging คือ ...", "ctx", "th", payload=PAYLOAD)
    # cosine 0.95: between MID (0.92) and HIGH (0.97)
    with patch.object(answer_cache, "generate_embedding", new=AsyncMock(return_value=[0.95, 0.3122, 0.0])):
        answer, _emb, match = await get_cached_answer("paging ต่างจาก segmentation ไหม", "ctx", "th")
    assert answer is None
    assert match["match_type"] == "semantic_mid"
    assert match["candidate_payload"] == PAYLOAD


@pytest.mark.asyncio
async def test_custom_ttl_is_used(cache):
    await set_cached_answer("q", "a", "ctx", "th", payload=PAYLOAD, ttl=86400)
    assert cache.ttls and all(ttl == 86400 for ttl in cache.ttls.values())


@pytest.mark.asyncio
async def test_old_entries_without_payload_still_hit(cache):
    await set_cached_answer("Paging คืออะไร", "Paging คือ ...", "ctx", "th")
    answer, _emb, match = await get_cached_answer("Paging คืออะไร", "ctx", "th")
    assert answer == "Paging คือ ..." and match["payload"] is None


@pytest.mark.asyncio
async def test_expired_entries_are_not_served(cache):
    await set_cached_answer("Paging คืออะไร", "Paging คือ ...", "ctx", "th", payload=PAYLOAD, ttl=60)
    # Redis keeps the keys alive (the index is re-saved by later writes), but the entries are past due
    for value in cache.store.values():
        for entry in value if isinstance(value, list) else [value]:
            entry["expires_at"] = "2000-01-01T00:00:00+00:00"
    answer, _emb, match = await get_cached_answer("Paging คืออะไร", "ctx", "th")
    assert answer is None and match["match_type"] == "miss"
    answer, _emb, match = await get_cached_answer("อธิบาย paging หน่อย", "ctx", "th")
    assert answer is None and match["match_type"] == "miss"


@pytest.mark.asyncio
async def test_storing_a_new_entry_drops_expired_ones_from_the_index(cache):
    await set_cached_answer("old", "a", "ctx", "th", payload=PAYLOAD, ttl=60)
    index = next(v for k, v in cache.store.items() if k.startswith("answer:semantic:"))
    index[0]["expires_at"] = "2000-01-01T00:00:00+00:00"
    await set_cached_answer("new", "b", "ctx", "th", payload=PAYLOAD, ttl=60)
    index = next(v for k, v in cache.store.items() if k.startswith("answer:semantic:"))
    assert [e["question"] for e in index] == ["new"]
