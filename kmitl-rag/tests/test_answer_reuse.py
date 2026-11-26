"""KMITL RAG AI reuses answers to similar questions only within the same scope and content."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from kmitl_rag import answer_reuse
from kmitl_rag.answer_reuse import lookup, notebook_fingerprints, scope_key, store


def rows(count):
    async def fake(query, params=None):
        fake.calls += 1
        return [
            {"id": nb, "knowledge_version": 1, "n": count, "last": "2026-11-27T00:00:00Z"}
            for nb in (params or {}).get("ids", [])
        ]

    fake.calls = 0
    return fake


BASE = dict(source_ids=None, allow_global_fallback=False, web="auto", language="th", model_id=None)


@pytest.mark.asyncio
async def test_new_source_changes_the_key():
    with patch.object(answer_reuse, "repo_query", rows(3)):
        before = await scope_key(notebook_ids=["notebook:a"], **BASE)
    with patch.object(answer_reuse, "repo_query", rows(4)):
        after = await scope_key(notebook_ids=["notebook:a"], **BASE)
    assert before != after


@pytest.mark.asyncio
async def test_different_scopes_never_share():
    with patch.object(answer_reuse, "repo_query", rows(3)):
        a = await scope_key(notebook_ids=["notebook:a"], **BASE)
        b = await scope_key(notebook_ids=["notebook:b"], **BASE)
        c = await scope_key(notebook_ids=["notebook:a"], **{**BASE, "web": "off"})
        d = await scope_key(notebook_ids=["notebook:a"], **{**BASE, "allow_global_fallback": True})
    assert len({a, b, c, d}) == 4


@pytest.mark.asyncio
async def test_same_scope_any_order_same_key():
    with patch.object(answer_reuse, "repo_query", rows(3)):
        a = await scope_key(notebook_ids=["notebook:a", "notebook:b"], **BASE)
        b = await scope_key(notebook_ids=["notebook:b", "notebook:a"], **BASE)
    assert a == b


@pytest.mark.asyncio
async def test_fingerprints_use_one_query_for_many_notebooks():
    fake = rows(2)
    ids = [f"notebook:n{i}" for i in range(40)]
    with patch.object(answer_reuse, "repo_query", fake):
        prints = await notebook_fingerprints(ids)
    assert fake.calls == 1 and set(prints) == set(ids)


@pytest.mark.asyncio
async def test_fingerprint_failure_falls_back_to_zero():
    async def broken(query, params=None):
        raise RuntimeError("db down")

    with patch.object(answer_reuse, "repo_query", broken):
        prints = await notebook_fingerprints(["notebook:a"])
    assert prints == {"notebook:a": "0"}


PAYLOAD = {"answer": "x", "citations": []}


@pytest.mark.asyncio
async def test_lookup_exact_and_similar_return_payload():
    for match_type, kind in (("exact", "exact"), ("semantic_high", "similar")):
        cached = AsyncMock(return_value=("x", None, {"match_type": match_type, "payload": PAYLOAD}))
        with patch.object(answer_reuse, "get_cached_answer", cached):
            assert await lookup("q", "key", "th", "model:m") == (PAYLOAD, kind)


@pytest.mark.asyncio
@pytest.mark.parametrize("verdict, expected", [(True, (PAYLOAD, "similar")), (False, None), (None, None)])
async def test_mid_requires_intent_validation(verdict, expected):
    mid = {"match_type": "semantic_mid", "similarity": 0.95, "candidate_payload": PAYLOAD,
           "candidate_question": "q0", "intent_validation_required": True}
    with patch.object(answer_reuse, "get_cached_answer", AsyncMock(return_value=(None, None, mid))), patch.object(
        answer_reuse, "validate_intent_match", AsyncMock(return_value=verdict)
    ):
        assert await lookup("q", "key", "th", "model:m") == expected


@pytest.mark.asyncio
async def test_entry_without_payload_is_a_miss():
    cached = AsyncMock(return_value=("x", None, {"match_type": "exact", "payload": None}))
    with patch.object(answer_reuse, "get_cached_answer", cached):
        assert await lookup("q", "key", "th", "model:m") is None


@pytest.mark.asyncio
async def test_store_passes_payload_and_ttl_and_never_raises():
    setter = AsyncMock(side_effect=RuntimeError("redis down"))
    with patch.object(answer_reuse, "set_cached_answer", setter):
        await store("q", "key", "th", PAYLOAD, "model:m", ttl=86400)
    kwargs = setter.call_args.kwargs
    assert kwargs["payload"] == PAYLOAD and kwargs["ttl"] == 86400
