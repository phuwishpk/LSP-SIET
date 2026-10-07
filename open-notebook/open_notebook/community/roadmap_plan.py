"""
Learning-plan roadmaps for SIET Space.

A roadmap is a study plan in five stages (พื้นฐาน → แนวคิดหลัก → ฝึกปฏิบัติ →
ประยุกต์ → ทบทวน/ประเมิน). Main nodes run through the stages in order; sub-nodes
hang off the main node they explain in more detail.

Where the content comes from, in this order:

1. the knowledge library, limited to the scope the user picked;
2. the web (Google Search through Gemini) for what the library does not cover,
   when the web mode allows it;
3. the model's own knowledge - and the plan is labelled as such.

Every node carries ``sources`` so the reader can see which of the three it was.
"""

from __future__ import annotations

import asyncio
import os
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from loguru import logger

from open_notebook.cache.service import cache_service
from open_notebook.community import ask as rag
from open_notebook.community import grounding
from open_notebook.community.retrieval import content_key
from open_notebook.config import DEFAULT_CACHE_TTL
from open_notebook.domain.features import RoadmapSession
from open_notebook.exceptions import ExternalServiceError, InvalidInputError
from open_notebook.features.service import _extract_json, _hash_prompt, _invoke_chat

STAGES: Tuple[str, ...] = ("พื้นฐาน", "แนวคิดหลัก", "ฝึกปฏิบัติ", "ประยุกต์", "ทบทวน/ประเมิน")
# How big a plan is, and how far a node is broken down, is the model's call.
# This is only a ceiling against a runaway answer being stored and drawn.
MAX_NODES = 200
MIN_MAIN_NODES = 3
MAX_LABEL_CHARS = 80
MAX_DESCRIPTION_CHARS = 900
MAX_WEB_TOPICS = 12
PASSAGE_CHARS = 1200


def _plan_max_tokens() -> int:
    """
    Output budget for a whole plan. The shared default (8192) fits about forty
    Thai nodes; a plan whose size the model chooses must not be cut off mid-JSON.
    """
    try:
        return max(8192, int(os.getenv("ROADMAP_LLM_MAX_TOKENS", "32768")))
    except ValueError:
        return 32768


def _min_similarity() -> float:
    """
    A passage below this cosine similarity is treated as being about something
    else. With the workspace's embedding model unrelated text still scores
    0.5-0.64 and on-topic text 0.7+, so the library would otherwise be "cited"
    for any subject at all.
    """
    try:
        return float(os.getenv("ROADMAP_MIN_SIMILARITY", "0.65"))
    except ValueError:
        return 0.65

_WEB_MARKER_RE = re.compile(r"\s*\[W(\d{1,2})\]")
_SECTION_RE = re.compile(r"^#{2,4}\s*`?([A-Za-z0-9_-]+)`?[^\n]*$", re.MULTILINE)

SYSTEM_PROMPT = (
    "You design learning plans for university students. Reply with ONE JSON object and "
    "nothing else, shaped as "
    '{"title": str, "description": str, "nodes": [{"id": str, "label": str, '
    '"description": str, "category": str, "parent": str or null, "refs": [int], '
    '"from_library": bool}]}.'
)

WEB_SYSTEM_PROMPT = (
    "You are a study assistant with Google Search. Search before you write, rely on what "
    "the search returns, and never invent a source."
)


# ---------------------------------------------------------------------------
# Shaping the model's answer
# ---------------------------------------------------------------------------


def stage_of(category: Any) -> Optional[str]:
    """Map whatever the model wrote to one of the five stages (None if it is not one)."""
    text = re.sub(r"\s+", "", str(category or ""))
    if not text:
        return None
    for stage in STAGES:
        if text == stage.replace(" ", ""):
            return stage
    # "ทบทวน", "ประเมินผล", "ทบทวนและประเมิน" and similar all mean the last stage.
    if "ทบทวน" in text or "ประเมิน" in text:
        return STAGES[4]
    for stage in STAGES[:4]:
        if stage in text:
            return stage
    return None


def _clip(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _one_line(value: Any, limit: int) -> str:
    return _clip(" ".join(str(value or "").split()), limit)


def _int_refs(raw: Any, available: int) -> List[int]:
    out: List[int] = []
    for item in raw if isinstance(raw, list) else []:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= available and n not in out:
            out.append(n)
    return out


def normalize_plan(
    payload: Dict[str, Any], node_count: Optional[int] = None, passages: int = 0
) -> Dict[str, Any]:
    """
    Turn the model's JSON into the stored shape.

    ``node_count`` is the size the learner asked for; without it the plan keeps
    every node the model wrote.

    Ids are reissued (``n1``, ``n2``…), main nodes are put in stage order and
    numbered, sub-nodes inherit their parent's stage, and the edges are derived
    (main → next main, parent → child) rather than trusted from the model.
    """
    raw_nodes = [n for n in (payload.get("nodes") or []) if isinstance(n, dict)]
    labelled = []
    for raw in raw_nodes:
        label = _one_line(raw.get("label") or raw.get("title"), MAX_LABEL_CHARS)
        if label:
            labelled.append((str(raw.get("id") or "").strip(), raw, label))
    old_ids = {old for old, _, _ in labelled if old}

    mains: List[Dict[str, Any]] = []
    subs: List[Tuple[str, Dict[str, Any]]] = []
    parent_of: Dict[str, str] = {}
    for position, (old_id, raw, label) in enumerate(labelled):
        parent = str(raw.get("parent") or "").strip()
        from_library = bool(raw.get("from_library")) and passages > 0
        node = {
            "_old": old_id or f"_{position}",
            "label": label,
            "description": _clip(raw.get("description") or raw.get("detail"), MAX_DESCRIPTION_CHARS),
            # Passage numbers count only when the model says they cover the node.
            "refs": _int_refs(raw.get("refs"), passages) if from_library else [],
            "from_library": from_library,
        }
        if parent and parent in old_ids and parent != old_id:
            subs.append((parent, node))
            parent_of[old_id] = parent
        else:
            node["_stage"] = stage_of(raw.get("category"))
            node["_position"] = position
            mains.append(node)

    if len(mains) < MIN_MAIN_NODES:
        raise ExternalServiceError("AI สร้างแผนได้ไม่ครบ ลองใหม่อีกครั้งหรือปรับหัวข้อให้ชัดขึ้น")

    limit = max(MIN_MAIN_NODES, min(int(node_count), MAX_NODES)) if node_count else MAX_NODES
    mains = mains[:limit]
    # Stages the model left out or misnamed are filled in by position, then the
    # main nodes are sorted so the plan never steps back to an earlier stage.
    for index, node in enumerate(mains):
        if node["_stage"] is None:
            node["_stage"] = STAGES[min(len(STAGES) - 1, index * len(STAGES) // len(mains))]
    mains.sort(key=lambda n: (STAGES.index(n["_stage"]), n["_position"]))
    new_id: Dict[str, str] = {}
    nodes: List[Dict[str, Any]] = []
    for order, node in enumerate(mains, start=1):
        new_id[node["_old"]] = f"n{order}"
        nodes.append(
            {
                "id": f"n{order}",
                "label": node["label"],
                "description": node["description"],
                "category": node["_stage"],
                "parent": None,
                "level": 0,
                "order": order,
                "refs": node["refs"],
                "from_library": node["from_library"],
            }
        )

    by_id = {n["id"]: n for n in nodes}
    child_count: Dict[str, int] = {}
    for parent_old, node in subs:
        if len(nodes) >= limit:
            break
        # A sub-node of a sub-node is attached to that sub-node's main node:
        # deeper levels only come from "expand", which the user asks for.
        parent_id = new_id.get(parent_old) or new_id.get(parent_of.get(parent_old, ""))
        if not parent_id:
            continue  # its main node was trimmed away
        child_count[parent_id] = child_count.get(parent_id, 0) + 1
        node_id = f"n{len(nodes) + 1}"
        nodes.append(
            {
                "id": node_id,
                "label": node["label"],
                "description": node["description"],
                "category": by_id[parent_id]["category"],
                "parent": parent_id,
                "level": 1,
                "order": child_count[parent_id],
                "refs": node["refs"],
                "from_library": node["from_library"],
            }
        )

    return {
        "title": _one_line(payload.get("title"), 200) or "แผนการเรียน",
        "description": _clip(payload.get("description"), MAX_DESCRIPTION_CHARS),
        "nodes": nodes,
        "edges": derive_edges(nodes),
    }


def derive_edges(nodes: Sequence[Dict[str, Any]]) -> List[Dict[str, str]]:
    """main → next main, and parent → child."""
    mains = sorted((n for n in nodes if not n.get("parent")), key=lambda n: n.get("order") or 0)
    edges = [{"source": a["id"], "target": b["id"]} for a, b in zip(mains, mains[1:])]
    edges += [{"source": str(n["parent"]), "target": n["id"]} for n in nodes if n.get("parent")]
    return edges


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------


def _library_source(passage: Dict[str, Any], meta: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    info = meta.get(str(passage.get("id") or ""))
    if info:
        scope = info["scope"]
        origin = f"คลังวิชา {info['room_code']}" if scope == "course" and info.get("room_code") else (
            "ไฟล์ของฉัน" if scope == "personal" else "คลังความรู้"
        )
        return {"kind": "library", "title": info["title"], "scope": scope, "origin": origin}
    # Not an uploaded library document: a notebook an admin/teacher shares.
    return {
        "kind": "library",
        "title": str(passage.get("title") or "เอกสารในคลังความรู้"),
        "scope": "shared",
        "origin": "Notebook ที่อาจารย์แชร์",
    }


def attach_library_sources(
    nodes: List[Dict[str, Any]], passages: Sequence[Dict[str, Any]], meta: Dict[str, Dict[str, Any]]
) -> None:
    """Replace each node's passage numbers with the documents they came from."""
    for node in nodes:
        sources: List[Dict[str, Any]] = []
        for ref in node.pop("refs", []) or []:
            source = _library_source(passages[ref - 1], meta)
            if source not in sources:
                sources.append(source)
        node.pop("from_library", None)
        node["sources"] = sources


def parse_web_sections(text: str) -> Dict[str, Tuple[str, List[int]]]:
    """
    ``### n3`` blocks → ``{"n3": (text without markers, [web source numbers])}``.
    """
    out: Dict[str, Tuple[str, List[int]]] = {}
    matches = list(_SECTION_RE.finditer(text or ""))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[match.end():end].strip()
        refs: List[int] = []
        for raw in _WEB_MARKER_RE.findall(body):
            if int(raw) not in refs:
                refs.append(int(raw))
        clean = _WEB_MARKER_RE.sub("", body).strip()
        if clean:
            out[match.group(1)] = (clean, refs)
    return out


def public_nodes(nodes: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    The copy of the nodes that goes into a shared post: a source that is the
    author's private file keeps no title, only the fact that one was used.
    """
    out: List[Dict[str, Any]] = []
    for node in nodes:
        sources: List[Dict[str, Any]] = []
        for source in node.get("sources") or []:
            if source.get("kind") == "library" and source.get("scope") == "personal":
                source = {"kind": "private"}
            elif source.get("kind") == "library":
                # "ไฟล์ของฉัน" is the author's wording; readers get the neutral form.
                source = {k: v for k, v in source.items() if k != "scope"}
            if source not in sources:
                sources.append(source)
        out.append({**node, "sources": sources})
    return out


def grounding_label(library: bool, web: bool) -> str:
    if library and web:
        return "อ้างอิง: คลังความรู้ + เว็บ"
    if library:
        return "อ้างอิง: คลังความรู้"
    if web:
        return "อ้างอิง: เว็บ"
    return "ไม่ได้อ้างอิงคลังความรู้"


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


def _passage_block(passages: Sequence[Dict[str, Any]]) -> str:
    if not passages:
        return (
            "No library passages were found for this goal: set refs to [] and from_library "
            "to false for every node."
        )
    lines = [
        "Library passages, numbered. Build the plan on them wherever they are relevant, and "
        "keep their terms, chapter names and assessment details:"
    ]
    for passage in passages:
        lines.append(f"[{passage['index']}] ({passage['title']})\n{str(passage['snippet'])[:PASSAGE_CHARS]}")
    lines.append(
        "refs = the passage numbers a node's description relies on ([] when none). "
        "from_library = true only when the passages really cover that node. A passage about "
        "a different subject than the learner's goal must be ignored: refs [] and "
        "from_library false."
    )
    return "\n\n".join(lines)


def _plan_prompt(
    description: str, language: str, node_count: Optional[int], passages: Sequence[Dict[str, Any]]
) -> str:
    if node_count:
        mains = max(MIN_MAIN_NODES, min(node_count, round(node_count * 0.6)))
        size = f"Produce exactly {node_count} nodes: about {mains} main nodes and the rest sub-nodes.\n"
    else:
        # Without "be thorough" the model returns a flat list of 6-9 main nodes
        # for almost any goal; with it the plans branch and grow with the subject.
        size = (
            "You decide how many nodes the plan needs; there is no limit. Be thorough: use as "
            "many main nodes as it takes to go from the basics to being assessed without "
            "skipping a step, and break every main node that holds more than one idea into "
            "sub-nodes. Let the size follow the subject: a narrow goal stays short, a broad one "
            "is long. Never repeat a node to make the plan look bigger.\n"
        )
    return (
        f"Learner's goal:\n{description}\n\n"
        f"Write everything in language code {language}.\n"
        + size +
        "- Main nodes have parent null and are listed in learning order. Each main node's "
        f"category is exactly one of: {', '.join(STAGES)}. Move through those stages in that "
        "order; a stage may hold several main nodes.\n"
        "- A sub-node has parent = the id of the main node it explains in more detail. Give "
        "sub-nodes to the main nodes that need breaking down, as many as each one needs.\n"
        "- label: a short name, at most 40 characters. description: 1-3 sentences on what to "
        "learn and how the learner can tell they have got it.\n\n"
        + _passage_block(passages)
    )


def _web_prompt(title: str, language: str, topics: Sequence[Dict[str, Any]]) -> str:
    listing = "\n".join(f"- {t['id']}: {t['label']} — {t.get('description') or ''}"[:400] for t in topics)
    return (
        f'A student is following the learning plan "{title}". For each topic below, search the '
        f"web and write 2-3 sentences in language code {language}: concrete facts that help "
        "learn it, and one good free resource by name. Use exactly this format, one block per "
        "topic, and no other text:\n### <topic id>\n<your sentences>\n\nTopics:\n" + listing
    )


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


async def resolve_web_links(sources: List[Dict[str, Any]]) -> None:
    """
    Swap the search tool's temporary redirect links for the pages they lead to.

    A roadmap is kept and shared, so it needs the real address; a link that
    cannot be followed in time simply stays as it was.
    """
    import httpx

    async def follow(client: "httpx.AsyncClient", source: Dict[str, Any]) -> None:
        try:
            response = await client.head(source["url"])
            final = str(response.url)
            if response.status_code < 400 and final.startswith(("http://", "https://")):
                source["url"] = final
        except Exception as exc:
            logger.debug(f"roadmap: could not resolve {source.get('title')}: {exc}")

    if not sources:
        return
    async with httpx.AsyncClient(follow_redirects=True, timeout=6) as client:
        await asyncio.gather(*(follow(client, source) for source in sources))


def relevant_passages(passages: Sequence[Dict[str, Any]], *, picked: bool) -> List[Dict[str, Any]]:
    """
    Drop passages that are not about the goal and renumber the rest from 1.

    ``picked`` (the user chose specific documents) keeps everything: reading
    that document is exactly what was asked for.
    """
    if picked:
        kept = list(passages)
    else:
        floor = _min_similarity()
        kept = [p for p in passages if p.get("score") is None or float(p["score"] or 0) >= floor]
    return [{**p, "index": i} for i, p in enumerate(kept, start=1)]


async def research_on_web(
    *, title: str, language: str, topics: Sequence[Dict[str, Any]], owner_id: str
) -> Dict[str, Any]:
    """
    One search-grounded call covering ``topics``.

    Returns ``{"available": bool, "notes": {node id: (text, [source])}, "sources": [...]}``.
    ``available`` is False when the configured model cannot search; that is
    reported to the user, never an error.
    """
    if not topics:
        return {"available": True, "notes": {}, "sources": []}
    prompt = _web_prompt(title, language, topics[:MAX_WEB_TOPICS])
    reply: Dict[str, Any] = {}
    sources: List[Dict[str, Any]] = []
    chunk_map: Dict[int, int] = {}
    # The model sometimes answers from memory without searching, and does so in
    # streaks when calls come close together; wait a moment and ask again
    # (twice at most) before giving up on web support.
    for attempt in (1, 2, 3):
        if attempt > 1:
            await asyncio.sleep(2)
        try:
            reply = await grounding.invoke_chat(
                prompt=prompt if attempt == 1 else prompt + "\n\nYou must run Google Search for every topic.",
                system=WEB_SYSTEM_PROMPT,
                owner_id=owner_id,
                use_search=True,
            )
        except Exception as exc:
            # The plan itself is already made; web support is an extra.
            logger.warning(f"roadmap: web research failed, continuing without it: {exc}")
            return {"available": False, "notes": {}, "sources": []}
        if not reply.get("search_available"):
            return {"available": False, "notes": {}, "sources": []}
        sources, chunk_map = grounding.web_sources(reply.get("metadata"))
        if sources:
            break
        logger.info(f"roadmap: web research attempt {attempt} returned no pages")
    await resolve_web_links(sources)
    by_index = {s["index"]: {"kind": "web", "title": s["title"], "url": s["url"]} for s in sources}
    marked = grounding.insert_web_markers(reply.get("text") or "", reply.get("metadata"), chunk_map)
    notes = {
        node_id: (text, [by_index[i] for i in refs if i in by_index])
        for node_id, (text, refs) in parse_web_sections(marked).items()
    }
    logger.info(f"roadmap: web research for {len(topics)} topics: {len(notes)} notes, {len(by_index)} pages")
    return {"available": True, "notes": notes, "sources": list(by_index.values())}


def apply_web_notes(
    nodes: List[Dict[str, Any]],
    notes: Dict[str, Tuple[str, List[Dict[str, Any]]]],
    *,
    require_source: bool = True,
) -> int:
    """
    Append each web note to its node and return how many nodes were updated.

    With ``require_source`` a note is used only when it can be tied to a page.
    """
    updated = 0
    for node in nodes:
        note = notes.get(node["id"])
        if not note:
            continue
        text, sources = note
        if require_source and not sources:
            continue
        node["description"] = _clip(f"{node.get('description') or ''}\n\n{text}".strip(), MAX_DESCRIPTION_CHARS)
        node["sources"] = (node.get("sources") or []) + [s for s in sources if s not in (node.get("sources") or [])]
        updated += 1
    return updated


def merge_research(nodes: List[Dict[str, Any]], research: Dict[str, Any]) -> bool:
    """
    Fold the web research into the nodes; True when the web was really used.

    Normally each note names its pages. When the search returned pages but
    none could be pinned to a sentence, the notes are still kept and the pages
    are listed for the whole plan instead of per node.
    """
    if apply_web_notes(nodes, research["notes"]) > 0:
        return True
    if research["sources"] and research["notes"]:
        return apply_web_notes(nodes, research["notes"], require_source=False) > 0
    return False


def web_topics(nodes: Sequence[Dict[str, Any]], mode: str) -> List[Dict[str, Any]]:
    """Which nodes to look up: everything not backed by the library, or (always) the main path too."""
    if mode == grounding.WEB_OFF:
        return []
    uncovered = [n for n in nodes if not n.get("sources")]
    if mode == grounding.WEB_ALWAYS:
        mains = [n for n in nodes if not n.get("parent") and n not in uncovered]
        return (uncovered + mains)[:MAX_WEB_TOPICS]
    return uncovered[:MAX_WEB_TOPICS]


async def generate_plan(
    *,
    owner_id: str,
    description: str,
    language: str = "th",
    node_count: Optional[int] = None,
    title: Optional[str] = None,
    notebook_ids: Optional[Sequence[str]] = None,
    source_ids: Optional[Sequence[str]] = None,
    web_mode: str = grounding.WEB_AUTO,
    scope_label: str = "",
    settings: Optional[Dict[str, Any]] = None,
    report: Optional[Dict[str, Any]] = None,
) -> RoadmapSession:
    """
    Generate, ground and store a learning plan for ``owner_id``.

    Without ``node_count`` the model decides how many nodes the subject needs.
    """
    from open_notebook.community import library

    description = (description or "").strip()
    if not description:
        raise InvalidInputError("กรุณาบอกหัวข้อหรือเป้าหมายที่อยากเรียน")
    if node_count is not None and (node_count < MIN_MAIN_NODES or node_count > MAX_NODES):
        raise InvalidInputError(f"จำนวนด่านต้องอยู่ระหว่าง {MIN_MAIN_NODES} ถึง {MAX_NODES}")
    web_mode = grounding.effective_web_mode(web_mode)

    # The library is searched only inside the chosen scope - never the whole workspace.
    passages: List[Dict[str, Any]] = []
    if notebook_ids:
        found = await rag.retrieve(
            description, list(notebook_ids), allow_global_fallback=False, source_ids=source_ids
        )
        passages = relevant_passages(found, picked=bool(source_ids))

    prompt_hash = _hash_prompt(
        {
            "kind": "learning-plan-v2",
            "desc": description.lower(),
            "n": node_count or "auto",
            "lang": language,
            "web": web_mode,
            "scope": sorted(notebook_ids or []),
            "sources": sorted(source_ids or []),
            "passages": [content_key(p["snippet"]) for p in passages],
        }
    )
    cache_key = f"features:learning-plan:{owner_id}:{prompt_hash}"
    cached = await cache_service.get_json(cache_key)
    if cached:
        payload = cached["payload"]
        if report is not None:
            report["cached"] = True
    else:
        raw = await _invoke_chat(
            feature="roadmap",
            prompt=_plan_prompt(description, language, node_count, passages),
            system=SYSTEM_PROMPT,
            owner_id=owner_id,
            max_tokens=_plan_max_tokens(),
        )
        plan = normalize_plan(await _extract_json(raw), node_count, len(passages))
        nodes = plan["nodes"]
        meta = await library.source_metadata([p["id"] for p in passages])
        attach_library_sources(nodes, passages, meta)
        from_library = any(n["sources"] for n in nodes)

        web_used, web_available, web_sources = False, True, []
        topics = web_topics(nodes, web_mode)
        web_tried = bool(topics)
        if topics:
            research = await research_on_web(
                title=plan["title"], language=language, topics=topics, owner_id=owner_id
            )
            web_available = research["available"]
            web_used = merge_research(nodes, research)
            web_sources = research["sources"] if web_used else []

        payload = {
            **plan,
            "grounding": {
                "library": from_library,
                "web": web_used,
                "label": grounding_label(from_library, web_used),
                "scope_label": scope_label,
                "web_mode": web_mode,
                "web_available": web_available,
                # Searched, but nothing that could be cited came back.
                "web_empty": web_tried and web_available and not web_used,
                "web_sources": web_sources,
            },
        }
        await cache_service.set_json(cache_key, {"payload": payload}, ttl=DEFAULT_CACHE_TTL)
        if report is not None:
            report["cached"] = False

    session = RoadmapSession(
        owner_id=owner_id,
        title=(title or "").strip() or payload["title"],
        description=payload.get("description") or description[:2000],
        language=language,
        node_count=len(payload["nodes"]),
        nodes=payload["nodes"],
        edges=payload["edges"],
        prompt_hash=prompt_hash,
        settings=settings or {},
        grounding=payload["grounding"],
    )
    await session.save()
    logger.info(
        f"roadmap: plan {session.id} for {owner_id}: {len(payload['nodes'])} nodes, "
        f"library={payload['grounding']['library']} web={payload['grounding']['web']}"
    )
    return session


# ---------------------------------------------------------------------------
# Expanding one node into sub-nodes
# ---------------------------------------------------------------------------

MAX_DEPTH = 2  # levels below a main node: main -> sub-node -> detail

EXPAND_SYSTEM_PROMPT = (
    "You break one step of a learning plan into smaller steps. Reply with ONE JSON object "
    'and nothing else, shaped as {"nodes": [{"label": str, "description": str, '
    '"refs": [int], "from_library": bool}]}.'
)


def depth_of(nodes: Sequence[Dict[str, Any]], node_id: str) -> int:
    """0 for a main node, 1 for its sub-node, 2 for a detail of that."""
    by_id = {str(n["id"]): n for n in nodes}
    depth, current = 0, by_id.get(str(node_id))
    while current is not None and current.get("parent") and depth <= len(nodes):
        current = by_id.get(str(current["parent"]))
        depth += 1
    return depth


def expansion_block(nodes: Sequence[Dict[str, Any]], node_id: str) -> Optional[str]:
    """Why this node cannot be expanded (shown to the user), or None when it can."""
    if not any(str(n["id"]) == str(node_id) for n in nodes):
        return "ไม่พบด่านนี้ใน Roadmap"
    if depth_of(nodes, node_id) >= MAX_DEPTH:
        return "ด่านนี้อยู่ชั้นลึกสุดแล้ว (ขยายได้ 2 ชั้นจากด่านหลัก)"
    if len(nodes) >= MAX_NODES:
        return f"Roadmap นี้มีครบ {MAX_NODES} ด่านแล้ว"
    return None


def next_node_ids(nodes: Sequence[Dict[str, Any]], count: int) -> List[str]:
    """Fresh ``n<number>`` ids that do not clash with any id already in the roadmap."""
    taken = {str(n["id"]) for n in nodes}
    numbers = [int(m.group(1)) for m in (re.fullmatch(r"n(\d+)", i) for i in taken) if m]
    out: List[str] = []
    candidate = max(numbers, default=len(nodes))
    while len(out) < count:
        candidate += 1
        if f"n{candidate}" not in taken:
            out.append(f"n{candidate}")
    return out


def build_children(
    payload: Dict[str, Any], nodes: Sequence[Dict[str, Any]], parent: Dict[str, Any], passages: int
) -> List[Dict[str, Any]]:
    """The model's steps as child nodes of ``parent`` - all of them, up to the node ceiling."""
    room = MAX_NODES - len(nodes)
    existing = [n for n in nodes if str(n.get("parent")) == str(parent["id"])]
    known = {_one_line(n.get("label"), MAX_LABEL_CHARS) for n in existing}
    picked: List[Dict[str, Any]] = []
    for raw in payload.get("nodes") or []:
        if not isinstance(raw, dict) or len(picked) >= room:
            continue
        label = _one_line(raw.get("label") or raw.get("title"), MAX_LABEL_CHARS)
        if not label or label in known:
            continue
        known.add(label)
        from_library = bool(raw.get("from_library")) and passages > 0
        picked.append(
            {
                "label": label,
                "description": _clip(raw.get("description"), MAX_DESCRIPTION_CHARS),
                "refs": _int_refs(raw.get("refs"), passages) if from_library else [],
                "from_library": from_library,
            }
        )
    if not picked:
        raise ExternalServiceError("AI ขยายด่านนี้ไม่สำเร็จ ลองใหม่อีกครั้ง")

    level = depth_of(nodes, parent["id"]) + 1
    children = []
    for offset, (node_id, child) in enumerate(zip(next_node_ids(nodes, len(picked)), picked), start=1):
        children.append(
            {
                "id": node_id,
                **child,
                "category": parent.get("category"),
                "parent": str(parent["id"]),
                "level": level,
                "order": len(existing) + offset,
            }
        )
    return children


def graph_fingerprint(nodes: Sequence[Dict[str, Any]]) -> str:
    """Changes whenever a node is added, removed or reworded (sources are ignored)."""
    return _hash_prompt(
        {"nodes": sorted((str(n.get("id")), n.get("label"), n.get("description"), str(n.get("parent") or "")) for n in nodes)}
    )


def _expand_prompt(
    session: RoadmapSession,
    parent: Dict[str, Any],
    siblings: Sequence[Dict[str, Any]],
    passages: Sequence[Dict[str, Any]],
    *,
    retry: bool = False,
) -> str:
    already = "; ".join(str(s.get("label")) for s in siblings) or "none"
    again = "Your last answer had no step that is not already in the list above.\n" if retry else ""
    return (
        f'Learning plan: "{session.title}".\n'
        f'Step to break down: "{parent.get("label")}" — {parent.get("description") or ""}\n'
        f"Steps it already has (do not repeat them): {already}\n{again}\n"
        "Write the smaller steps a learner needs to understand this step in detail, in learning "
        f"order, in language code {session.language}. You decide how many: as many as the step "
        "needs, without padding.\n"
        "- label: a short name, at most 40 characters. description: 1-3 sentences on what to "
        "learn and how the learner can tell they have got it.\n\n" + _passage_block(passages)
    )


async def _draft_children(
    session: RoadmapSession,
    nodes: Sequence[Dict[str, Any]],
    parent: Dict[str, Any],
    passages: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Ask the model for the sub-nodes; how many is its call.

    The one answer that is not accepted is an empty one (nothing usable, or only
    steps the node already has): it is asked again once, then raised so the
    caller refunds the expansion.
    """
    siblings = [n for n in nodes if str(n.get("parent")) == str(parent["id"])]
    for attempt in range(2):
        raw = await _invoke_chat(
            feature="roadmap_expand",
            prompt=_expand_prompt(session, parent, siblings, passages, retry=bool(attempt)),
            system=EXPAND_SYSTEM_PROMPT,
            owner_id=session.owner_id,
            max_tokens=_plan_max_tokens(),
        )
        try:
            return build_children(await _extract_json(raw), nodes, parent, len(passages))
        except ExternalServiceError:
            logger.warning(f"roadmap: expansion of {parent['id']} gave no new step (try {attempt + 1})")
    raise ExternalServiceError("AI ขยายด่านนี้ไม่สำเร็จ ลองใหม่อีกครั้ง")


async def expand_node(
    *,
    session: RoadmapSession,
    node_id: str,
    notebook_ids: Optional[Sequence[str]] = None,
    source_ids: Optional[Sequence[str]] = None,
    web_mode: str = grounding.WEB_AUTO,
) -> List[Dict[str, Any]]:
    """
    Break ``node_id`` into sub-nodes and save the roadmap. Returns the new nodes.

    Uses the same order of knowledge as generation: the library inside the
    given scope, then the web, then the model.
    """
    from open_notebook.community import library

    nodes: List[Dict[str, Any]] = list(session.nodes or [])
    blocked = expansion_block(nodes, node_id)
    if blocked:
        raise InvalidInputError(blocked)
    parent = next(n for n in nodes if str(n["id"]) == str(node_id))
    web_mode = grounding.effective_web_mode(web_mode)

    passages: List[Dict[str, Any]] = []
    if notebook_ids:
        found = await rag.retrieve(
            f"{parent.get('label')} {parent.get('description') or ''}".strip(),
            list(notebook_ids),
            allow_global_fallback=False,
            source_ids=source_ids,
        )
        passages = relevant_passages(found, picked=bool(source_ids))

    children = await _draft_children(session, nodes, parent, passages)
    meta = await library.source_metadata([p["id"] for p in passages])
    attach_library_sources(children, passages, meta)

    web_used, web_available, pages = False, True, []
    topics = web_topics(children, web_mode)
    if topics:
        research = await research_on_web(
            title=session.title, language=session.language, topics=topics, owner_id=session.owner_id
        )
        web_available = research["available"]
        web_used = merge_research(children, research)
        pages = research["sources"] if web_used else []

    info = dict(session.grounding or {})
    info["library"] = bool(info.get("library")) or any(
        s.get("kind") == "library" for child in children for s in child["sources"]
    )
    info["web"] = bool(info.get("web")) or web_used
    info["label"] = grounding_label(info["library"], info["web"])
    info["web_available"] = web_available
    known_urls = {p.get("url") for p in info.get("web_sources") or []}
    info["web_sources"] = (info.get("web_sources") or []) + [p for p in pages if p["url"] not in known_urls]

    session.nodes = nodes + children
    session.edges = list(session.edges or []) + [{"source": str(parent["id"]), "target": c["id"]} for c in children]
    session.grounding = info
    await session.save_graph()
    logger.info(f"roadmap: expanded {node_id} of {session.id} with {len(children)} nodes (web={web_used})")
    return children
