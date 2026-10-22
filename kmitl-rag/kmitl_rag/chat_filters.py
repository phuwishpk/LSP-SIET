"""
Answer filters shared by every chat surface - notebook chat, source chat and
the global chat: drop URLs the model made up, flag course codes that are not
in the context, and pin the most relevant excerpts of a notebook ahead of the
question.
"""

import re
from typing import Any, Dict, List, Optional

from loguru import logger

from open_notebook.database.repository import ensure_record_id, repo_query


# =============================================================================
# URL hallucination filter — prevents the LLM from citing invented URLs
# =============================================================================

# A URL is allowed only when it appears verbatim in the CONTEXT that was fed
# to the model, OR when it matches one of the hard-verified KMITL hostnames
# below. Reason: LLMs like to invent plausible "kmitl-looking" URLs (e.g.
# fiet.kmitl.ac.th) that don't actually exist, or swap kmutt.ac.th →
# kmitl.ac.th. Even subdomains under kmitl.ac.th can be fabricated. So the
# allowlist is intentionally conservative — the model can always link to the
# root kmitl.ac.th and describe which faculty in prose.
_ALLOWED_URL_HOSTS = {
    "kmitl.ac.th",
    "www.kmitl.ac.th",
    # Verified faculty / department / service subdomains. Add more here after
    # a human has visited the URL and confirmed it resolves. Do NOT add
    # speculative "kmitl-looking" hosts — they defeat the filter's purpose.
    "siet.kmitl.ac.th",           # ครุศาสตร์อุตสาหกรรมและเทคโนโลยี — Industrial Education & Technology
    "eng.kmitl.ac.th",            # คณะวิศวกรรมศาสตร์ — Engineering
    "it.kmitl.ac.th",             # คณะเทคโนโลยีสารสนเทศ — Information Technology
    "reg.kmitl.ac.th",            # สำนักทะเบียนและประมวลผล — Registrar
    "www.reg.kmitl.ac.th",
    "science.kmitl.ac.th",        # คณะวิทยาศาสตร์ — Faculty of Science
    "www.science.kmitl.ac.th",
    "osda.kmitl.ac.th",           # สำนักกิจการนักศึกษา — Office of Student Development Affairs
    "gened.kmitl.ac.th",          # สำนักวิชาศึกษาทั่วไป — General Education
    "www.gened.kmitl.ac.th",
    "kbs.kmitl.ac.th",            # KMITL Business School — คณะบริหารธุรกิจ
    "www.kbs.kmitl.ac.th",
    "curriculum.kmitl.ac.th",     # ระบบข้อมูลหลักสูตร — canonical source of truth for curriculum details
                                  # (department/24 = ครุศาสตร์อุตสาหกรรมและเทคโนโลยี)
}
_URL_HOST_PATTERN = re.compile(
    r"^https?://([^/:?#]+)", re.IGNORECASE
)
# Match markdown link: [label](url) — handled before plain URL stripping so we
# can also strip the surrounding [] and () when the URL fails the filter (leaving
# just the label). Otherwise plain-URL stripping would leave broken `[label]()`.
_MARKDOWN_LINK = re.compile(
    r"\[([^\]]*)\]\((https?://[^)\s]+)\)", re.IGNORECASE
)
# Match ANY http(s) URL in prose (not just [url:...]) so plain-text hallucinated
# URLs like "see https://fiet.kmitl.ac.th" also get stripped by the same
# allowlist/context check.
_PLAIN_URL = re.compile(
    r"https?://[^\s\]\"'<>()]+", re.IGNORECASE
)
_URL_CITATION = re.compile(r"\[url:([^\]]+)\]")


def _unwrap_context(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    The /chat/context endpoint returns `{context: {sources, notes}, token_count, ...}`.
    Older frontend builds forwarded that whole envelope to the streaming
    endpoint as `context`, which made every downstream check (URL allowlist,
    course-code verify, RELEVANT_EXCERPTS pin) silently no-op. Accept both
    shapes here so historic sessions still filter correctly on replay.
    """
    if not isinstance(context, dict):
        return {}
    if "sources" in context or "notes" in context or "relevant_excerpts" in context:
        return context
    inner = context.get("context")
    if isinstance(inner, dict):
        return inner
    return context


def _collect_context_texts(context: Dict[str, Any]) -> List[str]:
    """Flatten every text field the model was shown, for verbatim URL matching."""
    context = _unwrap_context(context)
    texts: List[str] = []
    for ex in (context.get("relevant_excerpts") or []):
        if isinstance(ex, dict) and ex.get("text"):
            texts.append(str(ex["text"]))
    for src in (context.get("sources") or []):
        if isinstance(src, dict):
            if src.get("full_text"):
                texts.append(str(src["full_text"]))
            for ins in (src.get("insights") or []):
                if isinstance(ins, dict) and ins.get("content"):
                    texts.append(str(ins["content"]))
    for note in (context.get("notes") or []):
        if isinstance(note, dict) and note.get("content"):
            texts.append(str(note["content"]))
    return texts


# Course-code-like tokens. Two patterns commonly hallucinated by the model:
#   - KMITL faculty codes: 8 digits, often starting with 03 (e.g. 03206107).
#   - General studies codes: 8 digits often starting with 90.
# The AI sometimes writes them with dashes/spaces (03-406-101 / 03 406 101).
# We normalise by stripping whitespace/dashes before the verbatim CONTEXT check.
_COURSE_CODE = re.compile(
    r"(?<![\d.])\d{2}[-\s]?\d{3}[-\s]?\d{3}(?![\d.])"
)


def _normalise_code(token: str) -> str:
    return re.sub(r"[\s\-]", "", token)


async def _fetch_source_full_texts(source_ids: List[str]) -> str:
    """
    Pull the raw full_text of every source referenced in the context so that
    course-code verification can trust the source of truth (the actual PDF /
    extracted document) instead of the maybe-truncated blob that was fed to
    the LLM. Fixes the false-positive where the user picks "insights only"
    mode — full_text is omitted from context, so verify would otherwise flag
    every real course code as fabricated.
    """
    if not source_ids:
        return ""
    try:
        from open_notebook.database.repository import ensure_record_id, repo_query

        rows = await repo_query(
            "SELECT full_text FROM source WHERE id IN $ids",
            {"ids": [ensure_record_id(sid) for sid in source_ids]},
        )
    except Exception as exc:
        logger.warning(f"verify: cannot fetch source full_text: {exc}")
        return ""
    parts: List[str] = []
    for row in rows or []:
        ft = row.get("full_text") if isinstance(row, dict) else None
        if ft:
            parts.append(str(ft))
    return "\n".join(parts)


async def _verify_course_codes(content: str, context: Dict[str, Any]) -> str:
    """
    Every code-like token the model emits must match a code found in CONTEXT
    or in the source's full_text (fetched from DB when the context blob is
    thin — e.g. "insights only" mode). Codes that don't match are wrapped
    with a visible warning so the reader sees the fabrication instead of
    the model's number being trusted at face value.

    Async because it may need to hit SurrealDB for a full_text fallback and
    callers are already async request handlers.
    """
    if not content:
        return content
    context_blob = "\n".join(_collect_context_texts(context))
    unwrapped = _unwrap_context(context)
    source_ids: List[str] = []
    for s in unwrapped.get("sources") or []:
        if isinstance(s, dict) and s.get("id"):
            source_ids.append(str(s["id"]))
    if source_ids:
        # Always augment with full_text from DB so context mode (insights vs
        # full content) doesn't change verification behaviour.
        context_blob = context_blob + "\n" + await _fetch_source_full_texts(source_ids)
    if not context_blob.strip():
        return content
    normalised_context = _normalise_code(context_blob)

    def _check(match: "re.Match[str]") -> str:
        token = match.group(0)
        if _normalise_code(token) in normalised_context:
            return token
        logger.info(f"Flagging unverified course code: {token}")
        return f"⚠️`{token}` (รหัสไม่พบในเอกสาร)"

    return _COURSE_CODE.sub(_check, content)


def _is_url_allowed(url: str, allowed_texts: List[str]) -> bool:
    """URL passes if it's on the KMITL allowlist OR appears verbatim in CONTEXT."""
    host_match = _URL_HOST_PATTERN.match(url)
    host = host_match.group(1).lower() if host_match else ""
    if host in _ALLOWED_URL_HOSTS:
        return True
    return any(url in t for t in allowed_texts)


def _filter_url_citations(content: str, context: Dict[str, Any]) -> str:
    """
    Strip URL citations of three shapes when the URL is not on the KMITL
    allowlist AND not present in the CONTEXT that was fed to the model:
      1. Markdown links `[label](url)` → replaced with just `label`.
      2. Bracketed citations `[url:...]` → removed entirely.
      3. Plain URLs `https://...` in prose → removed (trailing punctuation kept).
    Order matters: markdown links first, so plain-URL stripping doesn't leave
    a broken `[label]()` shell behind.
    """
    if not content:
        return content
    allowed_texts = _collect_context_texts(context)

    def _markdown(match: "re.Match[str]") -> str:
        label, url = match.group(1), match.group(2).strip()
        if _is_url_allowed(url, allowed_texts):
            return match.group(0)
        logger.info(f"Stripping hallucinated URL citation (markdown link): {url}")
        return label

    result = _MARKDOWN_LINK.sub(_markdown, content)

    def _bracketed(match: "re.Match[str]") -> str:
        url = match.group(1).strip()
        if _is_url_allowed(url, allowed_texts):
            return match.group(0)
        logger.info(f"Stripping hallucinated URL citation (bracketed): {url}")
        return ""

    result = _URL_CITATION.sub(_bracketed, result)

    def _plain(match: "re.Match[str]") -> str:
        url = match.group(0).rstrip(".,;:!?)]")
        trailing = match.group(0)[len(url):]
        if _is_url_allowed(url, allowed_texts):
            return match.group(0)
        logger.info(f"Stripping hallucinated URL citation (plain): {url}")
        return trailing

    return _PLAIN_URL.sub(_plain, result)


# =============================================================================
# Relevant-excerpt pinning
# =============================================================================

async def _pin_relevant_excerpts(
    context: Dict[str, Any], notebook_id: Optional[str], query: str
) -> Dict[str, Any]:
    """
    Semantic-search over the notebook's `source_embedding` chunks for the
    user's query and prepend the top matches to the CONTEXT as
    `context["relevant_excerpts"]`. The full-text sources stay intact
    underneath, so the model still has the whole document as fallback.
    Falls back silently if embeddings are missing or SurrealDB rejects the
    query — the model then just sees the full context as before.
    """
    if not notebook_id or not (query and query.strip()):
        return context
    unwrapped = _unwrap_context(context)
    sources = unwrapped.get("sources") or []
    if not sources:
        return context
    source_ids: List[Any] = []
    for s in sources:
        sid = s.get("id") if isinstance(s, dict) else None
        if sid:
            source_ids.append(sid)
    if not source_ids:
        return context

    try:
        from open_notebook.database.repository import ensure_record_id, repo_query
        from open_notebook.utils.embedding import generate_embedding

        embed = await generate_embedding(query)
        # Direct source_embedding search — avoids stored fn::vector_search_in_notebook
        # which is missing from this SurrealDB instance (migration mismatch).
        # Over-fetch (36) then dedupe in Python: chunks here are duplicated ~3x
        # from repeated embedding runs, so a small LIMIT starves the top-k of
        # unique passages and the model never sees the second-most-relevant
        # material. This was the root cause of "ปีที่ 1 ภาคการศึกษาที่ 2" being
        # reported as "not in document".
        rows = await repo_query(
            """
            SELECT source, content,
                   vector::similarity::cosine(embedding, $q) AS sim
            FROM source_embedding
            WHERE source IN $sources
              AND vector::similarity::cosine(embedding, $q) >= $min_sim
            ORDER BY sim DESC
            LIMIT 36
            """,
            {
                "q": embed,
                "sources": [ensure_record_id(sid) for sid in source_ids],
                "min_sim": 0.2,
            },
        )
    except Exception as exc:
        logger.warning(f"Skipping relevant-excerpt pinning: {exc}")
        return context

    title_by_id = {s.get("id"): s.get("title") for s in sources if isinstance(s, dict)}
    excerpts: List[Dict[str, Any]] = []
    seen_prefixes: set = set()
    max_excerpts = 6
    for row in rows or []:
        parent = str(row.get("source")) if row.get("source") is not None else None
        content_text = row.get("content") or ""
        if not content_text:
            continue
        # Chunks often overlap heavily and this DB has each chunk indexed ~3x
        # from repeated embed runs; dedupe by the first 120 chars so we don't
        # waste context on near-identical excerpts.
        key = str(content_text)[:120]
        if key in seen_prefixes:
            continue
        seen_prefixes.add(key)
        excerpts.append(
            {
                "parent_id": parent,
                "title": title_by_id.get(parent, ""),
                "similarity": float(row.get("sim") or 0.0),
                "text": str(content_text)[:1500],
            }
        )
        if len(excerpts) >= max_excerpts:
            break
    if excerpts:
        # Attach the excerpts inside whichever shape was passed. If we received
        # the /chat/context envelope, put them under `context.context` so the
        # prompt template's `{{ context.relevant_excerpts }}` lookup still hits.
        if unwrapped is context:
            context = {**context, "relevant_excerpts": excerpts}
        else:
            merged_inner = {**unwrapped, "relevant_excerpts": excerpts}
            context = {**context, "context": merged_inner, **merged_inner}
        logger.info(
            f"Pinned {len(excerpts)} relevant excerpt(s) for notebook {notebook_id}"
        )
    return context


# =============================================================================
# Web grounding for notebook chat
# =============================================================================


def enable_google_search(model):
    """Attach Gemini's built-in google_search tool when running on a Google model.

    Non-Google models are returned untouched. Failures fall back to the plain
    model so a broken grounding call never breaks chat.
    """
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError:
        return model
    if not isinstance(model, ChatGoogleGenerativeAI):
        return model
    return model.bind(tools=[{"google_search": {}}])
