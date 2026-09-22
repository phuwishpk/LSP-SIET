"""
"KMITL RAG AI" quick-ask.

A deliberately small RAG pipeline that matches the point-economy contract:

* retrieves at most ``RAG_MAX_CHUNKS`` (default 6) *distinct* passages from the
  knowledge the caller may read (course libraries, staff notebooks, own uploads),
  plus the document's stored summary when one specific document was picked
* asks the default chat model for a **150–300 word** answer with citations
* optionally carries a short conversation history (session mode)

When ``notebook_ids`` is given, retrieval is restricted to those notebooks
(that is how "ถามเฉพาะวิชานี้" / "ถามจากไฟล์ของฉัน" are implemented). With no
notebooks the search falls back to the whole workspace so the widget still
works before anybody has uploaded anything.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

from open_notebook.community import grounding
from open_notebook.community.retrieval import (
    content_key,
    search_in_notebooks,
    source_summaries,
)
from open_notebook.domain.notebook import text_search, vector_search

def _env_int(name: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(os.getenv(name, default))))
    except (TypeError, ValueError):
        return default


# Three passages were not enough to answer from a 260-page curriculum, and one
# duplicated passage (see retrieval.dedupe_hits) was all the model ever saw.
MAX_CHUNKS = _env_int("RAG_MAX_CHUNKS", 6, 1, 12)
MAX_CHUNK_CHARS = 1800
# Stored summaries are dense by design; cutting them at chunk length throws away
# exactly the overview a broad question needs.
MAX_INSIGHT_CHARS = 5000
MAX_CONTEXT_CHARS = _env_int("RAG_MAX_CONTEXT_CHARS", 14000, 2000, 40000)


def _extract_snippet(result: Dict[str, Any]) -> str:
    raw_matches = result.get("matches") or []
    if isinstance(raw_matches, str):
        raw_matches = [raw_matches]
    content = "\n".join(str(m) for m in raw_matches if m)
    if not content:
        content = str(result.get("content") or result.get("text") or "")
    limit = MAX_INSIGHT_CHARS if result.get("kind") == "insight" else MAX_CHUNK_CHARS
    return content.strip()[:limit]


def _score(result: Dict[str, Any]) -> float:
    for key in ("similarity", "score", "relevance"):
        value = result.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


async def _search_notebooks(
    question: str,
    notebook_ids: Sequence[str],
    source_ids: Optional[Sequence[str]] = None,
) -> List[Any]:
    """Search only the documents inside the given notebooks (or just ``source_ids``)."""
    try:
        return await search_in_notebooks(
            question, notebook_ids, results=MAX_CHUNKS, source_ids=source_ids
        )
    except Exception as exc:
        logger.warning(f"quick-ask: scoped search failed: {exc}")
        return []


async def _search_global(question: str) -> List[Any]:
    try:
        return await vector_search(question, MAX_CHUNKS * 4, source=True, note=True) or []
    except Exception as exc:
        logger.debug(f"quick-ask vector search unavailable ({exc}); trying text search")
    try:
        return await text_search(question, MAX_CHUNKS * 4, source=True, note=True) or []
    except Exception as exc:
        logger.warning(f"quick-ask retrieval skipped: {exc}")
        return []


async def retrieve(
    question: str,
    notebook_ids: Optional[Sequence[str]] = None,
    *,
    allow_global_fallback: bool = True,
    source_ids: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Return up to MAX_CHUNKS citation dicts: {index, id, title, snippet, score}.

    When the caller picked an explicit scope (a course, their own files, one
    document) ``allow_global_fallback`` must be False – answering from the whole
    workspace would silently break the promise made in the UI.
    """
    results: List[Any] = []
    if notebook_ids:
        results = await _search_notebooks(question, notebook_ids, source_ids)
        if not results and not allow_global_fallback:
            return []
    if not results and allow_global_fallback:
        results = await _search_global(question)

    # One specific document was picked: make sure its overview is part of the
    # context even when the best-matching passages are all from the introduction.
    if source_ids and len(source_ids) <= 3 and results:
        if not any(isinstance(r, dict) and r.get("kind") == "insight" for r in results[:MAX_CHUNKS]):
            summaries = await source_summaries(source_ids, limit=1)
            if summaries:
                results = list(results[: MAX_CHUNKS - 1]) + summaries

    citations: List[Dict[str, Any]] = []
    seen: set[str] = set()
    used_chars = 0
    for item in results:
        if len(citations) >= MAX_CHUNKS:
            break
        if not isinstance(item, dict):
            continue
        snippet = _extract_snippet(item)
        if not snippet:
            continue
        # Whole-passage fingerprint: PDF pages share a running header, so the
        # first line alone would merge different pages into one.
        key = content_key(snippet)
        if key in seen:
            continue
        if citations and used_chars + len(snippet) > MAX_CONTEXT_CHARS:
            continue
        seen.add(key)
        used_chars += len(snippet)
        citations.append(
            {
                "index": len(citations) + 1,
                "id": str(item.get("id") or item.get("parent_id") or ""),
                "title": str(item.get("title") or f"Knowledge item {len(citations) + 1}"),
                "snippet": snippet,
                "score": item.get("similarity") or item.get("score"),
            }
        )
    return citations


def _build_prompt(
    question: str,
    citations: List[Dict[str, Any]],
    history: Optional[List[Dict[str, str]]],
    language: str,
    scope_label: Optional[str],
) -> str:
    parts: List[str] = []
    if scope_label:
        parts.append(f"Knowledge scope chosen by the student: {scope_label}")
    if citations:
        parts.append("Retrieved knowledge (cite with [n]):")
        for c in citations:
            parts.append(f"[{c['index']}] {c['title']}\n{c['snippet']}")
    else:
        parts.append("Retrieved knowledge: (nothing relevant was found in the knowledge base)")

    if history:
        parts.append("Conversation so far:")
        for msg in history[-8:]:
            role = "Student" if msg.get("role") == "user" else "KMITL RAG AI"
            parts.append(f"{role}: {msg.get('content', '')}")

    parts.append(f"Answer language: {language}")
    parts.append(f"Question: {question}")
    return "\n\n".join(parts)


# Step 1 always answers from the library and reports how well the library covers
# the question. Asking the model to "search if needed" in the same call does not
# work: with a long document context Gemini never calls the tool and quietly
# answers from its own memory instead. So the web is a separate, explicit step.
COVERAGE_CONTRACT = (
    "Begin your reply with exactly these three lines, then the answer:\n"
    "COVERAGE: full|partial|none\n"
    "MISSING: <one line, in the answer language, naming what the retrieved knowledge does "
    "not cover; '-' when COVERAGE is full>\n"
    "---\n"
    "COVERAGE describes how well the retrieved knowledge answers the question."
)
LIBRARY_ONLY_RULE = (
    "Answer ONLY from the retrieved knowledge. For anything it does not cover, say so in one "
    "sentence and stop: do not answer from your own knowledge, a web search step follows."
)
NO_WEB_RULE = (
    "You have no web access. If the retrieved knowledge does not cover the question, say so in "
    "one sentence; you may then add what you are certain of, clearly marked as general knowledge "
    "that is not from the library."
)
WEB_SYSTEM_PROMPT = (
    "You are the web research step of 'KMITL RAG AI' (SIET Space, KMITL). "
    "You MUST run Google Search before answering and base the answer on the search results. "
    "Start directly with the answer: no greeting. Write 80-220 words in the requested language, "
    "with short paragraphs or bullet lists (Markdown is rendered). "
    "Do not write a reference list: the app appends the references."
)

# Tolerant on purpose: models drop the "---" line, bold the labels, or stop right
# after MISSING when there is nothing to answer from.
_HEADER_RE = re.compile(
    r"^\s*\**COVERAGE\**\s*[:：]\s*\**\s*(full|partial|none)\b[^\n]*"
    r"(?:\n\s*\**MISSING\**\s*[:：]\s*([^\n]*))?"
    r"(?:\n\s*-{3,}[ \t]*)?\n?",
    re.IGNORECASE,
)
_NOT_COVERED = {
    "th": "เอกสารในขอบเขตที่เลือกไม่มีข้อมูลเรื่องนี้",
    "en": "The selected documents do not cover this question.",
}
_HEADINGS = {
    "th": ("ข้อมูลจากการค้นเว็บ", "ข้อมูลเสริมจากการค้นเว็บ", "ความรู้ทั่วไปของโมเดล (ไม่พบแหล่งอ้างอิงบนเว็บ)"),
    "en": ("From a web search", "Supporting information from the web", "Model's general knowledge (no web source found)"),
}


def split_coverage(text: str, has_citation: bool) -> Dict[str, str]:
    """
    Strip the coverage header off a step-1 reply.

    A model that ignores the contract is not an error: the answer is kept as is,
    and coverage is inferred from whether it managed to cite the library at all.
    """
    match = _HEADER_RE.match(text or "")
    if not match:
        return {"coverage": "full" if has_citation else "none", "missing": "", "body": (text or "").strip()}
    missing = (match.group(2) or "").strip().strip("*").strip()
    return {
        "coverage": match.group(1).lower(),
        "missing": "" if missing in ("-", "–", "—") else missing,
        "body": text[match.end():].strip(),
    }


def wants_web(web_mode: str, coverage: str) -> bool:
    if web_mode == grounding.WEB_ALWAYS:
        return True
    return web_mode == grounding.WEB_AUTO and coverage in ("partial", "none")


SYSTEM_PROMPT = (
    "You are 'KMITL RAG AI', the study assistant of SIET Space (KMITL). "
    "Start directly with the answer: no greeting and no self-introduction. "
    "Answer the student's question using the retrieved knowledge first; read every "
    "retrieved passage, including document summaries, before deciding it is not covered. "
    "Write 150-350 words, in the requested language, with clear structure "
    "(short paragraphs or bullet lists; Markdown is rendered). "
    "Cite the knowledge you used inline like [1] or [2]. "
    "Cite only passages you actually used, and never invent citations; a sentence saying the "
    "knowledge does not cover something carries no citation. "
    "Do NOT write a reference list or a 'sources' section yourself: the app appends the "
    "references after your answer."
)


async def quick_ask(
    *,
    owner_id: str,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
    language: str = "th",
    model_id: Optional[str] = None,
    notebook_ids: Optional[Sequence[str]] = None,
    scope_label: Optional[str] = None,
    allow_global_fallback: bool = True,
    source_ids: Optional[Sequence[str]] = None,
    web: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Answer from the library, with Google Search as the fallback / supporting source.

    Returns ``answer`` (library passages cited ``[n]``, web pages ``[Wn]``),
    ``citations`` (each flagged ``cited``), ``web_sources`` and ``web_used``.
    """
    question = (question or "").strip()
    if not question:
        raise ValueError("question is required")
    citations = await retrieve(
        question,
        notebook_ids,
        allow_global_fallback=allow_global_fallback,
        source_ids=source_ids,
    )
    web_mode = grounding.effective_web_mode(web)
    prompt = _build_prompt(question, citations, history, language, scope_label)

    # --- step 1: the library ---------------------------------------------
    rule = NO_WEB_RULE if web_mode == grounding.WEB_OFF else LIBRARY_ONLY_RULE
    first = await grounding.invoke_chat(
        prompt=prompt,
        system=f"{SYSTEM_PROMPT} {rule}\n\n{COVERAGE_CONTRACT}",
        owner_id=owner_id,
        model_id=model_id,
    )
    draft = (first["text"] or "").strip()
    parsed = split_coverage(draft, bool(grounding.cited_documents(draft, len(citations))))
    if not citations:
        parsed["coverage"] = "none"
    not_covered = _NOT_COVERED.get(language[:2].lower(), _NOT_COVERED["en"])
    answer = parsed["body"] or not_covered
    # When a web section follows, the library part is just "not covered": use the
    # fixed sentence in the student's language instead of whatever (sometimes
    # English) sentence the model wrote before stopping.
    if parsed["coverage"] == "none" and wants_web(web_mode, "none"):
        answer = not_covered

    # --- step 2: the web, only when it is needed --------------------------
    sources: List[Dict[str, Any]] = []
    queries: List[str] = []
    search_ran = False
    if wants_web(web_mode, parsed["coverage"]):
        gap = parsed["missing"] or question
        web_prompt = "\n\n".join(
            [
                f"Student question: {question}",
                f"What the course library does not cover: {gap}",
                f"Library scope (context only): {scope_label or '-'}",
                f"Answer language: {language}",
            ]
        )
        second = await grounding.invoke_chat(
            prompt=web_prompt,
            system=WEB_SYSTEM_PROMPT,
            owner_id=owner_id,
            model_id=model_id,
            use_search=True,
        )
        search_ran = bool(second["search_available"])
        web_text = (second["text"] or "").strip()
        sources, chunk_map = grounding.web_sources(second["metadata"])
        web_text = grounding.insert_web_markers(web_text, second["metadata"], chunk_map)
        queries = list((second["metadata"] or {}).get("web_search_queries") or [])[:5]
        if web_text:
            only, extra, ungrounded = _HEADINGS.get(language[:2].lower(), _HEADINGS["en"])
            heading = ungrounded if not sources else (only if parsed["coverage"] == "none" else extra)
            answer = f"{answer}\n\n**{heading}**\n\n{web_text}".strip()

    used = (
        set()
        if parsed["coverage"] == "none"
        else set(grounding.cited_documents(answer, len(citations)))
    )
    for c in citations:
        c["cited"] = c["index"] in used
    return {
        "answer": answer,
        "citations": citations,
        "web_sources": sources,
        "web_used": bool(sources),
        "web_queries": queries,
        "web_mode": web_mode,
        # "full" | "partial" | "none": how well the chosen scope answered the question
        "coverage": parsed["coverage"],
        "web_searched": search_ran,
    }
