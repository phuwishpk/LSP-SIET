"""What kmitl-rag does through open-notebook's chat hooks."""

from types import SimpleNamespace

import pytest

from kmitl_rag import chat_filters, hooks, source_chat


@pytest.fixture
def marked(monkeypatch):
    """Replace the filters with markers so the test sees which ran, with what."""
    seen = []

    def url(content, context):
        seen.append(("url", context))
        return content + "|url"

    async def codes(content, context):
        seen.append(("codes", context))
        return content + "|codes"

    monkeypatch.setattr(chat_filters, "_filter_url_citations", url)
    monkeypatch.setattr(chat_filters, "_verify_course_codes", codes)
    return seen


@pytest.mark.asyncio
async def test_notebook_chat_always_filters_ai_messages(marked):
    ai = SimpleNamespace(type="ai")
    assert await hooks._filter_message("answer", message=ai, context=None) == "answer|url|codes"
    assert marked == [("url", {}), ("codes", {})]


@pytest.mark.asyncio
async def test_user_messages_and_non_text_pass_through(marked):
    assert await hooks._filter_message("q", message=SimpleNamespace(type="human"), context={}) == "q"
    assert await hooks._filter_message(["blocks"], message=SimpleNamespace(type="ai"), context={}) == ["blocks"]
    assert marked == []


@pytest.mark.asyncio
async def test_source_chat_wraps_its_prompt_text_and_skips_when_empty(marked):
    ai = SimpleNamespace(type="ai")
    assert await hooks._filter_message("a", message=ai, context="") == "a"
    assert marked == []
    await hooks._filter_message("a", message=ai, context="## SOURCE CONTENT ...")
    assert marked[0] == ("url", {"sources": [{"full_text": "## SOURCE CONTENT ..."}]})


def test_source_chat_pins_excerpts_ahead_of_the_source(monkeypatch):
    monkeypatch.setattr(
        source_chat, "_fetch_relevant_chunks", lambda sid, q: [{"text": "3.3.3 ...", "similarity": 0.81}]
    )
    messages = [SimpleNamespace(type="human", content="section 3.3.3?")]
    out = source_chat.pin_relevant_chunks({"context": "## SOURCE CONTENT"}, source_id="source:1", messages=messages)
    assert out["context"].startswith("## RELEVANT_EXCERPTS")
    assert out["context"].endswith("\n## SOURCE CONTENT")
    assert "### Excerpt 1 (similarity: 0.81)" in out["context"]
    assert out["relevant_chunks"] == [{"text": "3.3.3 ...", "similarity": 0.81}]


def test_source_chat_without_matches_keeps_the_context(monkeypatch):
    monkeypatch.setattr(source_chat, "_fetch_relevant_chunks", lambda sid, q: [])
    out = source_chat.pin_relevant_chunks({"context": "ctx"}, source_id="source:1", messages=[])
    assert out == {"context": "ctx", "relevant_chunks": []}
    assert source_chat.full_text_limit(5000) == 200000
