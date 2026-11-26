"""The web step: KMITL pages only, on demand, cached per missing topic."""

from __future__ import annotations

import pytest
from kmitl_rag import answer_reuse, ask, grounding, web_verify

PASSAGES = [{"index": 1, "id": "source:1", "title": "doc", "snippet": "p1", "score": 0.8}]
META = {
    "grounding_chunks": [
        {"web": {"title": "kmitl.ac.th", "uri": "https://vertexaisearch.cloud.google.com/r/1"}},
        {"web": {"title": "someblog.com", "uri": "https://vertexaisearch.cloud.google.com/r/2"}},
    ],
    "grounding_supports": [
        {"segment": {"text": "สจล. มีนักศึกษาราว 30,000 คน"}, "grounding_chunk_indices": [0]},
        {"segment": {"text": "ค่าหอพักเดือนละ 3,000 บาท"}, "grounding_chunk_indices": [1]},
    ],
}
WEB_TEXT = "สจล. มีนักศึกษาราว 30,000 คน และ ค่าหอพักเดือนละ 3,000 บาท"


@pytest.fixture
def world(monkeypatch):
    state = {"calls": [], "cache": {}}

    async def fake_retrieve(*a, **k):
        return [dict(p) for p in PASSAGES]

    async def fake_invoke(**kwargs):
        state["calls"].append(kwargs)
        return state["replies"][len(state["calls"]) - 1]

    async def fake_verify(sources):
        # only the first source (the KMITL page) is live
        return {1: "https://www.kmitl.ac.th/about/stat"} if sources else {}

    async def fake_lookup(question, key, language, model_id):
        hit = state["cache"].get((key, question))
        return (hit, "exact") if hit else None

    async def fake_store(question, key, language, payload, model_id, ttl=None):
        state["cache"][(key, question)] = payload
        state["ttl"] = ttl

    monkeypatch.delenv("RAG_WEB_GROUNDING", raising=False)
    monkeypatch.setattr(ask, "retrieve", fake_retrieve)
    monkeypatch.setattr(grounding, "invoke_chat", fake_invoke)
    monkeypatch.setattr(web_verify, "verify_sources", fake_verify)
    monkeypatch.setattr(answer_reuse, "lookup", fake_lookup)
    monkeypatch.setattr(answer_reuse, "store", fake_store)
    return state


def lib(coverage, missing="ค่าเทอม"):
    return {"text": f"COVERAGE: {coverage}\nMISSING: {missing}\n---\nตอบจากเอกสาร [1]", "metadata": None, "search_available": False}


WEB = {"text": WEB_TEXT, "metadata": META, "search_available": True}


@pytest.mark.asyncio
async def test_auto_partial_offers_web_without_searching(world):
    world["replies"] = [lib("partial")]
    r = await ask.quick_ask(owner_id="1", question="ค่าเทอมเท่าไร", notebook_ids=["notebook:n"], web="auto")
    assert len(world["calls"]) == 1
    assert r["web_offer"] is True and r["missing"] == "ค่าเทอม" and r["web_used"] is False


@pytest.mark.asyncio
async def test_auto_none_searches(world):
    world["replies"] = [lib("none"), WEB]
    r = await ask.quick_ask(owner_id="1", question="สจล. มีนักศึกษากี่คน", notebook_ids=["notebook:n"], web="auto")
    assert len(world["calls"]) == 2 and world["calls"][1]["use_search"] is True
    assert r["web_offer"] is False and r["web_used"] is True


@pytest.mark.asyncio
async def test_always_searches_even_when_full(world):
    world["replies"] = [lib("full", "-"), WEB]
    r = await ask.quick_ask(owner_id="1", question="q", notebook_ids=["notebook:n"], web="always")
    assert len(world["calls"]) == 2 and r["web_offer"] is False


@pytest.mark.asyncio
async def test_web_prompt_has_no_question_or_scope(world):
    world["replies"] = [lib("none", "จำนวนนักศึกษาของ สจล."), WEB]
    await ask.quick_ask(owner_id="1", question="ช่วยบอกหน่อยว่ามีกี่คน", notebook_ids=["notebook:n"],
                        web="auto", scope_label="คลังวิชา CS301")
    prompt = world["calls"][1]["prompt"]
    assert "จำนวนนักศึกษาของ สจล." in prompt
    assert "ช่วยบอกหน่อยว่ามีกี่คน" not in prompt and "CS301" not in prompt


@pytest.mark.asyncio
async def test_web_step_result_is_cached_by_topic(world):
    world["replies"] = [WEB]
    first = await ask.web_step(topic="จำนวนนักศึกษา สจล.", language="th", owner_id="1", model_id="model:m")
    second = await ask.web_step(topic="จำนวนนักศึกษา สจล.", language="th", owner_id="2", model_id="model:m")
    assert len(world["calls"]) == 1 and first == second and world["ttl"] == 86400


@pytest.mark.asyncio
async def test_web_step_drops_unverified_sources(world):
    world["replies"] = [WEB]
    r = await ask.web_step(topic="t", language="th", owner_id="1", model_id="model:m")
    assert r["sources"] == [{"index": 1, "title": "kmitl.ac.th", "url": "https://www.kmitl.ac.th/about/stat"}]
    assert "สจล. มีนักศึกษาราว 30,000 คน [W1]" in r["text"]
    assert "ค่าหอพัก" not in r["text"]


@pytest.mark.asyncio
async def test_fallback_is_reported(world, monkeypatch):
    async def global_retrieve(*a, **k):
        return [dict(p, **{"global": True}) for p in PASSAGES]

    monkeypatch.setattr(ask, "retrieve", global_retrieve)
    world["replies"] = [lib("full", "-")]
    r = await ask.quick_ask(owner_id="1", question="q", notebook_ids=["notebook:n"], web="off")
    assert r["fell_back"] is True


@pytest.mark.asyncio
async def test_scoped_answer_is_not_a_fallback(world):
    world["replies"] = [lib("full", "-")]
    r = await ask.quick_ask(owner_id="1", question="q", notebook_ids=["notebook:n"], web="off")
    assert r["fell_back"] is False


def test_system_prompt_requires_site_filter():
    assert "site:kmitl.ac.th" in ask.WEB_SYSTEM_PROMPT
    assert "without the site: filter" not in ask.WEB_SYSTEM_PROMPT
    assert "never" in ask.WEB_SYSTEM_PROMPT.lower()
