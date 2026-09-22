"""
RAG + web search grounding ("KMITL RAG AI").

Step 1 answers from the library and reports coverage; step 2 (Google Search) runs
only when the library is not enough, and the answer carries [n] / [Wn] references.
"""

import pytest

from open_notebook.community import ask, grounding


# ---------------------------------------------------------------- web mode ceiling
@pytest.mark.parametrize(
    "env, requested, expected",
    [
        (None, None, "auto"), (None, "always", "always"), (None, "off", "off"),
        (None, "nonsense", "auto"),
        ("auto", "always", "auto"),  # a client can never get more web than the operator allows
        ("off", "always", "off"), ("off", "auto", "off"),
        ("always", "auto", "auto"), ("garbage", "always", "always"),
    ],
)
def test_effective_web_mode(monkeypatch, env, requested, expected):
    if env is None:
        monkeypatch.delenv("RAG_WEB_GROUNDING", raising=False)
    else:
        monkeypatch.setenv("RAG_WEB_GROUNDING", env)
    assert grounding.effective_web_mode(requested) == expected


# ---------------------------------------------------------------- grounding metadata
META = {
    "grounding_chunks": [
        {"web": {"title": "kmitl.ac.th", "uri": "https://example.org/a"}},
        {"web": {"title": "wikipedia.org", "uri": "https://example.org/b"}},
        {"web": {"title": "kmitl.ac.th", "uri": "https://example.org/a"}},  # same page again
        {"web": {"title": "bad", "uri": "javascript:alert(1)"}},  # never becomes a link
        {"image": {}},
    ],
    "grounding_supports": [
        {"segment": {"text": "สจล. ตั้งอยู่ที่ลาดกระบัง"}, "grounding_chunk_indices": [0, 2]},
        {"segment": {"text": "ก่อตั้งปี พ.ศ. 2503"}, "grounding_chunk_indices": [1, 3]},
        {"segment": {"text": "ข้อความที่ไม่มีในคำตอบ"}, "grounding_chunk_indices": [1]},
    ],
}


def test_web_sources_dedupes_pages_and_drops_unsafe_links():
    sources, chunk_map = grounding.web_sources(META)
    assert [(s["index"], s["url"]) for s in sources] == [(1, "https://example.org/a"), (2, "https://example.org/b")]
    assert chunk_map == {0: 1, 1: 2, 2: 1}
    assert grounding.web_sources(None) == ([], {})


def test_markers_follow_the_supported_sentence_in_thai_text():
    _, chunk_map = grounding.web_sources(META)
    text = "สจล. ตั้งอยู่ที่ลาดกระบัง และ ก่อตั้งปี พ.ศ. 2503 ครับ"
    out = grounding.insert_web_markers(text, META, chunk_map)
    assert out == "สจล. ตั้งอยู่ที่ลาดกระบัง [W1] และ ก่อตั้งปี พ.ศ. 2503 [W2] ครับ"
    assert grounding.insert_web_markers(text, None, {}) == text


def test_cited_documents_reads_groups_in_order_and_ignores_out_of_range():
    assert grounding.cited_documents("ก [2, 4] ข [1] ค [2] ง [9] จ [W1]", 6) == [2, 4, 1]
    assert grounding.cited_documents("ไม่มีอ้างอิง", 6) == []


# ---------------------------------------------------------------- coverage header
@pytest.mark.parametrize(
    "reply, coverage, missing, body",
    [
        ("COVERAGE: full\nMISSING: -\n---\nคำตอบ [1]", "full", "", "คำตอบ [1]"),
        ("COVERAGE: partial\nMISSING: ค่าเทอมปีล่าสุด\n---\nบางส่วน [2]", "partial", "ค่าเทอมปีล่าสุด", "บางส่วน [2]"),
        ("COVERAGE: none\nMISSING: ความแตกต่างของ Docker", "none", "ความแตกต่างของ Docker", ""),  # no '---', no body
        ("**COVERAGE:** None\n**MISSING:** x\n\nเนื้อหา", "none", "x", "เนื้อหา"),
    ],
)
def test_split_coverage(reply, coverage, missing, body):
    assert ask.split_coverage(reply, has_citation=True) == {"coverage": coverage, "missing": missing, "body": body}


def test_a_model_that_ignores_the_contract_is_not_an_error():
    assert ask.split_coverage("ตอบเลย [1]", has_citation=True)["coverage"] == "full"
    assert ask.split_coverage("ไม่ทราบ", has_citation=False)["coverage"] == "none"


@pytest.mark.parametrize(
    "mode, coverage, expected",
    [("auto", "full", False), ("auto", "partial", True), ("auto", "none", True),
     ("always", "full", True), ("off", "none", False)],
)
def test_wants_web(mode, coverage, expected):
    assert ask.wants_web(mode, coverage) is expected


# ---------------------------------------------------------------- the two-step flow
PASSAGES = [{"index": i, "id": f"source:{i}", "title": "doc", "snippet": f"p{i}", "score": 0.8} for i in (1, 2, 3)]


def wire(monkeypatch, replies):
    calls = []

    async def fake_retrieve(*a, **k):
        return [dict(p) for p in PASSAGES]

    async def fake_invoke(**kwargs):
        calls.append(kwargs)
        return replies[len(calls) - 1]

    monkeypatch.delenv("RAG_WEB_GROUNDING", raising=False)
    monkeypatch.setattr(ask, "retrieve", fake_retrieve)
    monkeypatch.setattr(grounding, "invoke_chat", fake_invoke)
    return calls


@pytest.mark.asyncio
async def test_in_scope_question_never_touches_the_web(monkeypatch):
    calls = wire(monkeypatch, [{"text": "COVERAGE: full\nMISSING: -\n---\n132 หน่วยกิต [1, 3]", "metadata": None, "search_available": False}])
    r = await ask.quick_ask(owner_id="1", question="กี่หน่วยกิต", notebook_ids=["notebook:n"], web="auto")
    assert len(calls) == 1 and not calls[0].get("use_search")
    assert r["answer"] == "132 หน่วยกิต [1, 3]" and "COVERAGE" not in r["answer"]
    assert [c["index"] for c in r["citations"] if c["cited"]] == [1, 3]
    assert r["web_used"] is False and r["web_sources"] == [] and r["coverage"] == "full"


@pytest.mark.asyncio
async def test_out_of_scope_question_is_answered_from_the_web_with_references(monkeypatch):
    calls = wire(monkeypatch, [
        {"text": "COVERAGE: none\nMISSING: ความต่างของ Docker กับ Kubernetes", "metadata": None, "search_available": False},
        {"text": "สจล. ตั้งอยู่ที่ลาดกระบัง และ ก่อตั้งปี พ.ศ. 2503", "metadata": META, "search_available": True},
    ])
    r = await ask.quick_ask(owner_id="1", question="Docker ต่างจาก K8s ยังไง", notebook_ids=["notebook:n"], web="auto", language="th")
    assert len(calls) == 2 and calls[1]["use_search"] is True
    assert "ความต่างของ Docker กับ Kubernetes" in calls[1]["prompt"]  # the gap drives the search
    assert "COVERAGE" not in r["answer"]
    assert r["answer"].startswith("เอกสารในขอบเขตที่เลือกไม่มีข้อมูลเรื่องนี้")
    assert "**ข้อมูลจากการค้นเว็บ**" in r["answer"] and "[W1]" in r["answer"] and "[W2]" in r["answer"]
    assert [s["index"] for s in r["web_sources"]] == [1, 2] and r["web_used"] is True
    assert not any(c["cited"] for c in r["citations"])  # the library was not used



@pytest.mark.asyncio
async def test_models_english_not_covered_sentence_is_replaced_when_the_web_answers(monkeypatch):
    wire(monkeypatch, [
        {"text": "COVERAGE: none\nMISSING: x\n---\nThe retrieved knowledge does not cover this.", "metadata": None, "search_available": False},
        {"text": "คำตอบจากเว็บ", "metadata": META, "search_available": True},
    ])
    r = await ask.quick_ask(owner_id="1", question="q", notebook_ids=["notebook:n"], web="auto", language="th")
    assert "The retrieved knowledge" not in r["answer"]
    assert r["answer"].startswith("เอกสารในขอบเขตที่เลือกไม่มีข้อมูลเรื่องนี้")


@pytest.mark.asyncio
async def test_with_web_off_the_models_general_knowledge_answer_is_kept(monkeypatch):
    wire(monkeypatch, [{"text": "COVERAGE: none\nMISSING: x\n---\nไม่พบในเอกสาร แต่โดยทั่วไป Docker คือ...", "metadata": None, "search_available": False}])
    r = await ask.quick_ask(owner_id="1", question="q", notebook_ids=["notebook:n"], web="off", language="th")
    assert "โดยทั่วไป Docker คือ" in r["answer"]

@pytest.mark.asyncio
async def test_always_mode_supports_a_covered_answer(monkeypatch):
    calls = wire(monkeypatch, [
        {"text": "COVERAGE: full\nMISSING: -\n---\nสอบบรรจุได้ [2]", "metadata": None, "search_available": False},
        {"text": "ก่อตั้งปี พ.ศ. 2503", "metadata": META, "search_available": True},
    ])
    r = await ask.quick_ask(owner_id="1", question="สอบบรรจุได้ไหม", notebook_ids=["notebook:n"], web="always", language="th")
    assert len(calls) == 2
    assert r["answer"].startswith("สอบบรรจุได้ [2]") and "**ข้อมูลเสริมจากการค้นเว็บ**" in r["answer"]
    assert [c["index"] for c in r["citations"] if c["cited"]] == [2]


@pytest.mark.asyncio
async def test_web_off_stays_in_the_library(monkeypatch):
    calls = wire(monkeypatch, [{"text": "COVERAGE: none\nMISSING: x\n---\nเอกสารไม่ครอบคลุม", "metadata": None, "search_available": False}])
    r = await ask.quick_ask(owner_id="1", question="q", notebook_ids=["notebook:n"], web="off")
    assert len(calls) == 1 and r["web_used"] is False and r["web_mode"] == "off"


@pytest.mark.asyncio
async def test_search_that_found_nothing_is_labelled_as_ungrounded(monkeypatch):
    wire(monkeypatch, [
        {"text": "COVERAGE: none\nMISSING: x", "metadata": None, "search_available": False},
        {"text": "คำตอบจากความจำของโมเดล", "metadata": None, "search_available": True},
    ])
    r = await ask.quick_ask(owner_id="1", question="q", notebook_ids=["notebook:n"], web="auto", language="th")
    assert "ไม่พบแหล่งอ้างอิงบนเว็บ" in r["answer"] and r["web_used"] is False
