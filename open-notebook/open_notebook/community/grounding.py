"""
Web search grounding for "KMITL RAG AI".

The knowledge library answers what the documents cover. For everything else —
a question outside the chosen scope, or a claim that deserves outside support —
the model may run a Google Search (Gemini's built-in ``google_search`` tool) and
the answer ends with a reference list: ``[n]`` for library passages, ``[Wn]`` for
web pages.

Only Google models expose that tool. With any other provider the feature
degrades to a plain call, and the answer says the documents do not cover the
question instead of inventing one.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

WEB_OFF, WEB_AUTO, WEB_ALWAYS = "off", "auto", "always"
WEB_MODES = (WEB_OFF, WEB_AUTO, WEB_ALWAYS)
_RANK = {WEB_OFF: 0, WEB_AUTO: 1, WEB_ALWAYS: 2}
MAX_WEB_SOURCES = 8

_DOC_CITATION_RE = re.compile(r"\[(\d{1,2}(?:\s*[,，]\s*\d{1,2})*)\]")


def effective_web_mode(requested: Optional[str]) -> str:
    """
    The operator's ``RAG_WEB_GROUNDING`` is a ceiling, not a default: a client may
    ask for less web than the server allows, never for more.
    """
    ceiling = (os.getenv("RAG_WEB_GROUNDING") or WEB_ALWAYS).strip().lower()
    if ceiling not in WEB_MODES:
        ceiling = WEB_ALWAYS
    wanted = (requested or WEB_AUTO).strip().lower()
    if wanted not in WEB_MODES:
        wanted = WEB_AUTO
    return wanted if _RANK[wanted] <= _RANK[ceiling] else ceiling


def supports_search(runnable: Any) -> bool:
    """Gemini through langchain-google-genai is the only runnable with google_search."""
    return type(runnable).__name__ == "ChatGoogleGenerativeAI"


def web_sources(metadata: Optional[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[int, int]]:
    """
    ``grounding_chunks`` → ``([{index, title, url}], {chunk_position: index})``.

    The same page is often returned for several chunks; it gets one reference
    number, and the map lets text segments point at it.
    """
    sources: List[Dict[str, Any]] = []
    by_url: Dict[str, int] = {}
    chunk_to_index: Dict[int, int] = {}
    for pos, chunk in enumerate((metadata or {}).get("grounding_chunks") or []):
        web = (chunk or {}).get("web") if isinstance(chunk, dict) else None
        url = str((web or {}).get("uri") or "").strip()
        if not url.startswith(("http://", "https://")):
            continue
        if url not in by_url:
            if len(sources) >= MAX_WEB_SOURCES:
                continue
            by_url[url] = len(sources) + 1
            title = str((web or {}).get("title") or (web or {}).get("domain") or "").strip()
            sources.append({"index": by_url[url], "title": title or "เว็บไซต์", "url": url})
        chunk_to_index[pos] = by_url[url]
    return sources, chunk_to_index


def insert_web_markers(
    answer: str, metadata: Optional[Dict[str, Any]], chunk_to_index: Dict[int, int]
) -> str:
    """
    Put ``[W1]`` after each sentence the search results support.

    Gemini reports segment offsets in UTF-8 *bytes*, which is fragile for Thai, so
    the segment text itself is located in the answer; a segment that cannot be
    found is simply left unmarked (the reference list still names the page).
    """
    if not answer or not chunk_to_index:
        return answer
    inserts: List[Tuple[int, str]] = []
    for support in (metadata or {}).get("grounding_supports") or []:
        if not isinstance(support, dict):
            continue
        refs = sorted({chunk_to_index[i] for i in support.get("grounding_chunk_indices") or [] if i in chunk_to_index})
        seg_text = str(((support.get("segment") or {}).get("text")) or "").strip()
        if not refs or not seg_text:
            continue
        pos = answer.find(seg_text)
        if pos < 0:
            continue
        inserts.append((pos + len(seg_text), " " + "".join(f"[W{r}]" for r in refs)))
    # apply from the end so earlier offsets stay valid; skip duplicate positions
    seen: set[int] = set()
    for pos, marker in sorted(inserts, key=lambda x: x[0], reverse=True):
        if pos in seen:
            continue
        seen.add(pos)
        answer = answer[:pos] + marker + answer[pos:]
    return answer


def cited_documents(answer: str, available: int) -> List[int]:
    """Which ``[n]`` passages the answer really refers to, in order of first use."""
    out: List[int] = []
    for group in _DOC_CITATION_RE.findall(answer or ""):
        for raw in re.split(r"\s*[,，]\s*", group):
            n = int(raw)
            if 1 <= n <= available and n not in out:
                out.append(n)
    return out


async def invoke_chat(
    *,
    prompt: str,
    system: str,
    owner_id: str,
    model_id: Optional[str] = None,
    use_search: bool = False,
) -> Dict[str, Any]:
    """
    One LLM call, optionally with Google Search available to the model.

    Returns ``{"text", "metadata", "search_available"}``. When the search tool is
    rejected (a model without grounding support) the call is repeated without it,
    so a misconfigured model costs a retry, not an error for the student.
    """
    from open_notebook.ai.models import model_manager
    from open_notebook.exceptions import ConfigurationError, ExternalServiceError
    from open_notebook.utils.text_utils import extract_text_content

    max_tokens = int(os.getenv("FEATURES_LLM_MAX_TOKENS", "8192") or 8192)
    try:
        model = (
            await model_manager.get_model(model_id, max_tokens=max_tokens)
            if model_id
            else await model_manager.get_default_model("chat", max_tokens=max_tokens)
        )
    except Exception as exc:
        logger.error(f"Failed resolving model for quick-ask: {exc}")
        model = None
    if model is None:
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )

    runnable = model.to_langchain() if hasattr(model, "to_langchain") else model
    full_prompt = f"{system}\n\n{prompt}"
    search_available = use_search and supports_search(runnable)

    if search_available:
        try:
            message = await runnable.ainvoke(full_prompt, tools=[{"google_search": {}}])
            metadata = (getattr(message, "response_metadata", None) or {}).get("grounding_metadata")
            return {
                "text": extract_text_content(message.content),
                "metadata": metadata if isinstance(metadata, dict) else None,
                "search_available": True,
            }
        except Exception as exc:
            logger.warning(f"quick-ask: search grounding unavailable, answering without it: {exc}")
            search_available = False

    try:
        message = await runnable.ainvoke(full_prompt)
    except Exception as exc:
        logger.exception(f"LLM call failed for owner {owner_id}: {exc}")
        raise ExternalServiceError(f"LLM call failed: {exc}")
    return {
        "text": extract_text_content(message.content),
        "metadata": None,
        "search_available": search_available,
    }
