"""POST /community/ask reuses answers per scope; POST /community/ask/web adds KMITL web info once."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from kmitl_rag import answer_reuse
from kmitl_rag.routers import ask as router

USER = SimpleNamespace(id=7, role="student", username="s7")
RESULT = {
    "answer": "ตอบจากเอกสาร [1]", "citations": [{"index": 1, "cited": True}], "web_sources": [],
    "web_used": False, "web_queries": [], "web_mode": "auto", "coverage": "partial",
    "missing": "ค่าเทอม", "web_offer": True, "fell_back": False,
}


class Points:
    RAG_SESSION_MESSAGES = 5

    def __init__(self):
        self.refunds = []

    async def set_charge_ref(self, charge, kind, ref):
        return None

    async def charge(self, user, kind, ref_type=None):
        return SimpleNamespace(amount=1, charged=True)

    async def refund(self, charge, reason):
        self.refunds.append(reason)

    async def get_balance(self, uid):
        return 100


@pytest.fixture
def world(monkeypatch):
    state = {"asked": 0, "stored": [], "messages": {}, "web_calls": 0, "next_id": 100}

    async def no_op(*a, **k):
        return None

    async def resolve_scope(user, scope, course_id, document_ids):
        return ["notebook:c"], "คลังวิชา CS301", True

    async def quick_ask(**kwargs):
        state["asked"] += 1
        return dict(state.get("result", RESULT))

    async def scope_key(**kwargs):
        return "scope-1"

    async def lookup(question, key, language, model_id):
        return state.get("hit")

    async def store(question, key, language, payload, model_id, ttl=None):
        state["stored"].append((question, key, payload))

    async def get_conversation(cid, uid):
        return {"id": cid} if uid == USER.id and cid == "c1" else None

    async def create_conversation(uid, title, scope_label=None):
        return "c1"

    async def append_messages(cid, messages):
        ids = []
        for m in messages:
            state["next_id"] += 1
            state["messages"][state["next_id"]] = {"id": state["next_id"], "conversation_id": cid, **m}
            ids.append(state["next_id"])
        return ids

    async def get_message(cid, mid):
        m = state["messages"].get(mid)
        return dict(m) if m and m["conversation_id"] == cid else None

    async def list_messages(cid):
        return [dict(m) for m in state["messages"].values() if m["conversation_id"] == cid]

    async def update_message(mid, content, meta):
        state["messages"][mid].update(content=content, meta=meta)

    async def web_step(**kwargs):
        state["web_calls"] += 1
        state["web_topic"] = kwargs["topic"]
        return {"text": "ค่าเทอม 25,000 บาท [W1]", "searched": True, "queries": [],
                "sources": [{"index": 1, "title": "kmitl.ac.th", "url": "https://www.kmitl.ac.th/fee"}]}

    points = Points()
    state["points"] = points
    monkeypatch.setattr(router, "_guard_spam", no_op)
    monkeypatch.setattr(router, "_resolve_pick", no_op)
    monkeypatch.setattr(router, "_resolve_scope", resolve_scope)
    monkeypatch.setattr(router, "quick_ask", quick_ask)
    monkeypatch.setattr(router, "web_step", web_step)
    monkeypatch.setattr(router, "points", points)
    monkeypatch.setattr(answer_reuse, "scope_key", scope_key)
    monkeypatch.setattr(answer_reuse, "lookup", lookup)
    monkeypatch.setattr(answer_reuse, "store", store)
    monkeypatch.setattr(answer_reuse, "default_model_id", no_op)
    async def create_rag_session(uid, credits):
        return "s1"

    async def reserve_rag_credit(sid, uid):
        return 4

    async def lookup_spy(question, key, language, model_id):
        state["lookups"] = state.get("lookups", 0) + 1
        return state.get("hit")

    monkeypatch.setattr(answer_reuse, "lookup", lookup_spy)
    for name, fn in dict(create_rag_session=create_rag_session, reserve_rag_credit=reserve_rag_credit,
                         save_rag_messages=no_op).items():
        monkeypatch.setattr(router.repo, name, fn)
    for name, fn in dict(get_conversation=get_conversation, create_conversation=create_conversation,
                         append_messages=append_messages, get_message=get_message,
                         list_messages=list_messages, update_message=update_message).items():
        monkeypatch.setattr(router.repo, name, fn)
    return state


def body(**over):
    return router.AskBody(**{"question": "ค่าเทอมเท่าไร", **over})


@pytest.mark.asyncio
async def test_fresh_answer_is_stored_and_returns_message_id(world):
    r = await router.ask(body(), user=USER)
    assert world["asked"] == 1 and len(world["stored"]) == 1
    assert r["cached"] is False and r["web_offer"] is True and r["message_id"] in world["messages"]


@pytest.mark.asyncio
async def test_similar_question_served_from_cache_without_points(world):
    world["hit"] = (dict(RESULT), "similar")
    r = await router.ask(body(question="ค่าเทอมคณะนี้ราคาเท่าไหร่"), user=USER)
    assert world["asked"] == 0 and r["cached"] is True and r["cache_match"] == "similar"
    assert r["charged"] == 0 and world["points"].refunds


@pytest.mark.asyncio
async def test_fallback_answers_are_not_stored(world):
    world["result"] = {**RESULT, "fell_back": True}
    await router.ask(body(), user=USER)
    assert world["stored"] == []


@pytest.mark.asyncio
async def test_web_button_appends_and_marks_added(world):
    r = await router.ask(body(), user=USER)
    out = await router.ask_web(router.AskWebBody(conversation_id="c1", message_id=r["message_id"]), user=USER)
    assert world["web_topic"] == "ค่าเทอม"
    assert out["answer"].startswith("ตอบจากเอกสาร [1]") and "ค่าเทอม 25,000 บาท [W1]" in out["answer"]
    assert out["web_sources"][0]["url"] == "https://www.kmitl.ac.th/fee"
    meta = world["messages"][r["message_id"]]["meta"]
    assert meta["web_added"] is True and meta["web_used"] is True


@pytest.mark.asyncio
async def test_web_button_twice_is_409_and_no_llm_call(world):
    r = await router.ask(body(), user=USER)
    req = router.AskWebBody(conversation_id="c1", message_id=r["message_id"])
    await router.ask_web(req, user=USER)
    with pytest.raises(HTTPException) as exc:
        await router.ask_web(req, user=USER)
    assert exc.value.status_code == 409 and world["web_calls"] == 1


@pytest.mark.asyncio
async def test_web_button_on_other_users_message_is_404(world):
    r = await router.ask(body(), user=USER)
    other = SimpleNamespace(id=8, role="student", username="s8")
    with pytest.raises(HTTPException) as exc:
        await router.ask_web(router.AskWebBody(conversation_id="c1", message_id=r["message_id"]), user=other)
    assert exc.value.status_code == 404 and world["web_calls"] == 0


@pytest.mark.asyncio
async def test_web_button_without_offer_is_409(world):
    world["result"] = {**RESULT, "web_offer": False, "coverage": "full"}
    r = await router.ask(body(), user=USER)
    with pytest.raises(HTTPException) as exc:
        await router.ask_web(router.AskWebBody(conversation_id="c1", message_id=r["message_id"]), user=USER)
    assert exc.value.status_code == 409 and world["web_calls"] == 0


@pytest.mark.asyncio
async def test_web_button_on_a_question_message_is_404(world):
    r = await router.ask(body(), user=USER)
    with pytest.raises(HTTPException) as exc:
        await router.ask_web(router.AskWebBody(conversation_id="c1", message_id=r["message_id"] - 1), user=USER)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_session_answers_skip_cache(world):
    world["hit"] = (dict(RESULT), "exact")
    r = await router.ask(body(mode="session"), user=USER)
    assert world.get("lookups", 0) == 0 and world["asked"] == 1 and world["stored"] == []
    assert r["cached"] is False
