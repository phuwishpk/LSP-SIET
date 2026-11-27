"""
Editing a roadmap from a typed instruction ("สั่งแก้ด้วย AI").

The model does not rewrite the roadmap: it answers with operations (add /
remove / update / move) that are checked and applied here, so the nodes the
instruction does not touch stay exactly as they were, sources included.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional, Sequence, Tuple

from kmitl_rag import ask as rag
from kmitl_rag import grounding
from loguru import logger

from siet_community import roadmap_plan
from siet_community.roadmap_plan import (
    MAX_DEPTH,
    MAX_DESCRIPTION_CHARS,
    MAX_LABEL_CHARS,
    MAX_NODES,
    MIN_MAIN_NODES,
    STAGES,
    _clip,
    _int_refs,
    _one_line,
    _passage_block,
    _plan_max_tokens,
    attach_library_sources,
    derive_edges,
    graph_fingerprint,
    grounding_label,
    merge_research,
    next_node_ids,
    relevant_passages,
    stage_of,
    web_note_ids,
    web_topics,
)
from siet_core.exceptions import ExternalServiceError, InvalidInputError
from siet_platform import usage
from siet_platform.ai_helpers import _extract_json, _invoke_chat
from siet_platform.cache.service import cache_service

NOTHING_CHANGED = "คำสั่งนี้ไม่ได้เปลี่ยนอะไรใน Roadmap ลองพิมพ์ให้ชัดขึ้น เช่น บอกชื่อหัวข้อที่อยากเพิ่มหรือลบ"
TOO_FEW_MAINS = f"Roadmap ต้องเหลือหัวข้อหลักอย่างน้อย {MIN_MAIN_NODES} หัวข้อ"
UNREADABLE = "AI ตอบกลับในรูปแบบที่อ่านไม่ได้ ลองสั่งใหม่อีกครั้ง"
NO_INSTRUCTION = "พิมพ์สิ่งที่อยากให้แก้ก่อน"
NOTHING_TO_UNDO = "ไม่มีการแก้ที่ย้อนได้ (ย้อนได้เฉพาะการแก้ล่าสุด และต้องยังไม่ได้แก้หรือขยายต่อ)"

CHANGED_MEANWHILE = "Roadmap นี้ถูกแก้หรือขยายระหว่างที่ AI ทำงาน จึงไม่บันทึกทับ ลองสั่งใหม่อีกครั้ง (คืนแต้มแล้ว)"

UNDO_TTL = 7 * 24 * 3600
DESCRIPTION_IN_PROMPT = 160

EDIT_SYSTEM_PROMPT = (
    "You edit a learning plan by listing changes, never by rewriting it. Reply with ONE JSON "
    'object and nothing else, shaped as {"summary": str, "ops": [op, ...]}, where each op is '
    'one of: {"op": "add", "ref": str, "label": str, "description": str, "parent": id or null, '
    '"after": id or null, "stage": str, "refs": [int], "from_library": bool}; '
    '{"op": "remove", "id": str}; {"op": "update", "id": str, "label": str (optional), '
    '"description": str (optional)}; '
    '{"op": "move", "id": str, "parent": id or null, "after": id or null, "stage": str}.'
)

_MISSING = object()


class _Tree:
    """The roadmap as ordered sibling lists, so positions survive the edits."""

    def __init__(self, nodes: Sequence[Dict[str, Any]]):
        self.by_id: Dict[str, Dict[str, Any]] = {}
        self.kids: Dict[Optional[str], List[str]] = {None: []}
        for node in sorted(nodes, key=lambda n: (n.get("level") or 0, n.get("order") or 0)):
            node = copy.deepcopy(node)
            node["id"] = str(node["id"])
            node["parent"] = str(node["parent"]) if node.get("parent") else None
            self.by_id[node["id"]] = node
        for node in sorted(self.by_id.values(), key=lambda n: n.get("order") or 0):
            parent = node["parent"] if node["parent"] in self.by_id else None
            node["parent"] = parent
            self.kids.setdefault(parent, []).append(node["id"])

    def depth(self, node_id: str) -> int:
        depth, current = 0, self.by_id[node_id]
        while current["parent"] and depth <= len(self.by_id):
            current = self.by_id[current["parent"]]
            depth += 1
        return depth

    def descendants(self, node_id: str) -> List[str]:
        out: List[str] = []
        for child in self.kids.get(node_id, []):
            out.append(child)
            out.extend(self.descendants(child))
        return out

    def height(self, node_id: str) -> int:
        return max((1 + self.height(c) for c in self.kids.get(node_id, [])), default=0)

    def place(self, node_id: str, parent: Optional[str], after: Any) -> None:
        siblings = self.kids.setdefault(parent, [])
        if after in siblings:
            siblings.insert(siblings.index(after) + 1, node_id)
        else:
            siblings.append(node_id)
        self.by_id[node_id]["parent"] = parent

    def unplace(self, node_id: str) -> Tuple[Optional[str], int]:
        parent = self.by_id[node_id]["parent"]
        siblings = self.kids.get(parent, [])
        index = siblings.index(node_id)
        siblings.pop(index)
        return parent, index

    def set_category(self, node_id: str, category: Any) -> None:
        for item in [node_id, *self.descendants(node_id)]:
            self.by_id[item]["category"] = category

    def flatten(self) -> List[Dict[str, Any]]:
        mains = list(self.kids.get(None, []))
        stages = [stage_of(self.by_id[m].get("category")) for m in mains]
        if all(stages):
            # Never step back to an earlier stage; within a stage the edited order stands.
            mains = [m for _, _, m in sorted((STAGES.index(s), i, m) for i, (s, m) in enumerate(zip(stages, mains)))]
        out: List[Dict[str, Any]] = []

        def walk(node_id: str, level: int, order: int) -> None:
            node = self.by_id[node_id]
            node["level"], node["order"] = level, order
            out.append(node)
            for position, child in enumerate(self.kids.get(node_id, []), start=1):
                walk(child, level + 1, position)

        for order, main in enumerate(mains, start=1):
            walk(main, 0, order)
        return out


def _echoes(new: Any, old: Any) -> bool:
    """
    True when ``new`` is only the node's description as the prompt showed it
    (one line, cut at DESCRIPTION_IN_PROMPT): a model renaming a node often
    copies it back, which must not cut the real description short.
    """
    shown = " ".join(str(new or "").split())
    full = " ".join(str(old or "").split())
    if not full or shown == full or shown == _one_line(old, DESCRIPTION_IN_PROMPT):
        return True if full else not shown
    stem = shown.rstrip("…").rstrip()
    return shown.endswith("…") and bool(stem) and full.startswith(stem)


def _stage_for_main(tree: _Tree, op: Dict[str, Any], after: Any) -> Any:
    # Older roadmaps name their lanes in English (planning, development…): a
    # new main node joins its neighbour's lane there instead of opening a new one.
    staged = all(stage_of(tree.by_id[m].get("category")) for m in tree.kids.get(None, []))
    stage = stage_of(op.get("stage") or op.get("category"))
    if stage and staged:
        return stage
    if isinstance(after, str) and after in tree.by_id:
        return tree.by_id[after].get("category")
    mains = tree.kids.get(None, [])
    return tree.by_id[mains[-1]].get("category") if mains else STAGES[0]


def apply_edit_ops(
    nodes: Sequence[Dict[str, Any]], ops: Any, passages: int = 0
) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    """
    Apply the model's operations; returns ``(nodes, {"added", "removed", "updated"})``.

    An operation that names an unknown node, would create a cycle or go deeper
    than MAX_DEPTH, or would pass MAX_NODES is skipped; the others still apply.
    Raises InvalidInputError when nothing changed or too few main nodes remain.
    """
    if not isinstance(ops, list):
        raise InvalidInputError(NOTHING_CHANGED)
    tree = _Tree(nodes)
    refs: Dict[str, str] = {}
    added: List[str] = []
    removed: List[str] = []
    updated: List[str] = []

    def resolve(value: Any) -> Any:
        if value is None or str(value).strip() in ("", "null", "None"):
            return None
        key = str(value).strip()
        if key in tree.by_id:
            return key
        # A node added earlier in this answer may already be gone again (removed itself or with its parent).
        node_id = refs.get(key)
        return node_id if node_id in tree.by_id else _MISSING

    def mark_updated(node_id: str) -> None:
        if node_id not in added and node_id not in updated:
            updated.append(node_id)

    for op in ops:
        if not isinstance(op, dict):
            continue
        kind = str(op.get("op") or "").strip().lower()

        if kind == "add":
            parent, after = resolve(op.get("parent")), resolve(op.get("after"))
            label = _one_line(op.get("label") or op.get("title"), MAX_LABEL_CHARS)
            if parent is _MISSING or not label or len(tree.by_id) >= MAX_NODES:
                continue
            if parent is not None and tree.depth(parent) + 1 > MAX_DEPTH:
                continue
            from_library = bool(op.get("from_library")) and passages > 0
            node_id = next_node_ids(list(tree.by_id.values()), 1)[0]
            tree.by_id[node_id] = {
                "id": node_id,
                "label": label,
                "description": _clip(op.get("description"), MAX_DESCRIPTION_CHARS),
                "category": tree.by_id[parent].get("category") if parent else _stage_for_main(tree, op, after),
                "parent": parent,
                "refs": _int_refs(op.get("refs"), passages) if from_library else [],
                "from_library": from_library,
                "sources": [],
            }
            tree.place(node_id, parent, after)
            if op.get("ref"):
                refs[str(op["ref"]).strip()] = node_id
            added.append(node_id)

        elif kind == "remove":
            node_id = resolve(op.get("id"))
            if node_id is _MISSING or node_id is None:
                continue
            gone = [node_id, *tree.descendants(node_id)]
            tree.unplace(node_id)
            for item in gone:
                tree.kids.pop(item, None)
                tree.by_id.pop(item, None)
                if item in added:
                    added.remove(item)
                else:
                    removed.append(item)
                if item in updated:
                    updated.remove(item)

        elif kind == "update":
            node_id = resolve(op.get("id"))
            if node_id is _MISSING or node_id is None:
                continue
            node, changed = tree.by_id[node_id], False
            if op.get("label") is not None:
                label = _one_line(op["label"], MAX_LABEL_CHARS)
                if label and label != node.get("label"):
                    node["label"], changed = label, True
            if op.get("description") is not None and not _echoes(op["description"], node.get("description")):
                description = _clip(op["description"], MAX_DESCRIPTION_CHARS)
                if description != (node.get("description") or ""):
                    node["description"], changed = description, True
            if changed:
                mark_updated(node_id)

        elif kind == "move":
            node_id, parent, after = resolve(op.get("id")), resolve(op.get("parent")), resolve(op.get("after"))
            if node_id in (_MISSING, None) or parent is _MISSING:
                continue
            if parent == node_id or parent in tree.descendants(node_id):
                continue
            new_depth = 0 if parent is None else tree.depth(parent) + 1
            if new_depth + tree.height(node_id) > MAX_DEPTH:
                continue
            before = (tree.by_id[node_id]["parent"], tree.by_id[node_id].get("category"))
            old_parent, old_index = tree.unplace(node_id)
            tree.place(node_id, parent, after)
            category = tree.by_id[parent].get("category") if parent else _stage_for_main(tree, op, after)
            tree.set_category(node_id, category)
            moved = old_parent != parent or tree.kids[parent].index(node_id) != old_index
            if moved or before[1] != category:
                mark_updated(node_id)

    if not (added or removed or updated):
        raise InvalidInputError(NOTHING_CHANGED)
    if len(tree.kids.get(None, [])) < MIN_MAIN_NODES:
        raise InvalidInputError(TOO_FEW_MAINS)
    return tree.flatten(), {"added": added, "removed": removed, "updated": updated}


def rebuild(nodes: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    """The nodes with the edges derived from them (main → next main, parent → child)."""
    return nodes, derive_edges(nodes)


# ---------------------------------------------------------------------------
# The AI call
# ---------------------------------------------------------------------------


def _undo_key(session_id: Any) -> str:
    return f"roadmap:undo:{session_id}"


def _edit_prompt(session: Any, nodes: Sequence[Dict[str, Any]], instruction: str, passages: Sequence[Dict[str, Any]]) -> str:
    lines = []
    for node in sorted(nodes, key=lambda n: (n.get("level") or 0, str(n.get("parent") or ""), n.get("order") or 0)):
        description = _one_line(node.get("description"), DESCRIPTION_IN_PROMPT)
        lines.append(
            f"{node['id']} | {node.get('parent') or '-'} | {node.get('category') or ''} | {node.get('label')}"
            + (f" — {description}" if description else "")
        )
    language = session.language or "th"
    return (
        f'Learning plan: "{session.title}".\n'
        f"Stages, in learning order: {', '.join(STAGES)}.\n"
        "Nodes, one per line as: id | parent id (- for a main node) | stage | label — description\n"
        + "\n".join(lines)
        + "\n\nThe learner's instruction:\n"
        + instruction
        + "\n\nRules:\n"
        "- Change only what the instruction asks. Every other node stays as it is: do not list it.\n"
        "- Refer to existing nodes by their id. A node you add gets a ref (a1, a2, ...) that later "
        "ops may use as its parent or after.\n"
        "- parent null makes a main node; give a main node a stage from the list above. A main node "
        f"may have sub-nodes and those may have details: at most {MAX_DEPTH} levels below a main node.\n"
        "- update: give only the fields that change. To rename a node send just its label; never "
        "copy a description back (the descriptions above are shortened).\n"
        "- after = the sibling it comes right after (null puts it last among its siblings).\n"
        f"- remove also removes the node's sub-nodes. Keep at least {MIN_MAIN_NODES} main nodes.\n"
        f"- Write labels (at most 40 characters) and descriptions (1-3 sentences) in language code {language}.\n"
        "- summary: one short sentence in that language saying what you changed.\n"
        "- If nothing in the instruction can be done to this plan, reply with an empty ops list.\n\n"
        + _passage_block(passages)
    )


async def edit_roadmap(
    *,
    session: Any,
    instruction: str,
    notebook_ids: Optional[Sequence[str]] = None,
    source_ids: Optional[Sequence[str]] = None,
    web_mode: str = grounding.WEB_AUTO,
    files_only: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Change ``session`` as the instruction asks, save it, and keep the previous
    version for one undo. Returns ``{"added", "removed", "updated", "summary"}``.

    New nodes are grounded like expanded ones: library passages for the
    instruction inside the saved scope, then the web (saved web mode).
    """
    usage.set_context(feature="roadmap_edit")
    instruction = (instruction or "").strip()
    if not instruction:
        raise InvalidInputError(NO_INSTRUCTION)
    nodes: List[Dict[str, Any]] = list(session.nodes or [])
    web_mode = grounding.effective_web_mode(web_mode)

    passages: List[Dict[str, Any]] = []
    if notebook_ids:
        found = await rag.retrieve(
            instruction, list(notebook_ids), allow_global_fallback=False, source_ids=source_ids
        )
        passages = relevant_passages(found, picked=bool(source_ids) if files_only is None else files_only)

    raw = await _invoke_chat(
        prompt=_edit_prompt(session, nodes, instruction, passages),
        system=EDIT_SYSTEM_PROMPT,
        owner_id=session.owner_id,
        max_tokens=_plan_max_tokens(),
    )
    try:
        payload = await _extract_json(raw)
    except ExternalServiceError:
        raise ExternalServiceError(UNREADABLE)
    if not isinstance(payload, dict) or not isinstance(payload.get("ops"), list):
        raise ExternalServiceError(UNREADABLE)

    new_nodes, changes = apply_edit_ops(nodes, payload["ops"], len(passages))
    added = set(changes["added"])
    fresh = [n for n in new_nodes if n["id"] in added]

    info = dict(session.grounding or {})
    if fresh:
        meta: Dict[str, Dict[str, Any]] = {}
        if passages:
            from siet_platform import library

            meta = await library.source_metadata([p["id"] for p in passages])
        attach_library_sources(fresh, passages, meta)
        web_used, pages = False, []
        topics = web_topics(fresh, web_mode)
        if topics:
            research = await roadmap_plan.research_on_web(
                title=session.title, language=session.language, topics=topics, owner_id=session.owner_id
            )
            info["web_available"] = research["available"]
            web_used = merge_research(fresh, research, note_ids=web_note_ids(fresh, web_mode))
            pages = research["sources"] if web_used else []
        info["library"] = bool(info.get("library")) or any(
            s.get("kind") == "library" for node in fresh for s in node["sources"]
        )
        info["web"] = bool(info.get("web")) or web_used
        info["label"] = grounding_label(info["library"], info["web"])
        known_urls = {p.get("url") for p in info.get("web_sources") or []}
        info["web_sources"] = (info.get("web_sources") or []) + [p for p in pages if p.get("url") not in known_urls]

    # The model took about half a minute; an expansion or another edit may have
    # been saved meanwhile. Saving now would silently drop it.
    if graph_fingerprint(await _current_nodes(session)) != graph_fingerprint(nodes):
        raise InvalidInputError(CHANGED_MEANWHILE)

    previous = {"nodes": nodes, "edges": list(session.edges or []), "grounding": session.grounding}
    session.nodes, session.edges = rebuild(new_nodes)
    session.grounding = info
    await session.save_graph()
    try:
        await cache_service.set_json(
            _undo_key(session.id), {**previous, "after": graph_fingerprint(session.nodes)}, ttl=UNDO_TTL
        )
    except Exception as exc:  # the edit stands; only the undo is lost
        logger.warning(f"roadmap edit: could not keep the undo copy of {session.id}: {exc}")
    logger.info(
        f"roadmap: edited {session.id}: +{len(changes['added'])} -{len(changes['removed'])} ~{len(changes['updated'])}"
    )
    return {**changes, "summary": _one_line(payload.get("summary"), 200)}


async def _current_nodes(session: Any) -> List[Dict[str, Any]]:
    """The roadmap's nodes as stored right now."""
    from siet_roadmap.domain import RoadmapSession

    fresh = await RoadmapSession.get_for_owner(session_id=str(session.id), owner_id=session.owner_id)
    return list(fresh.nodes or [])


# ---------------------------------------------------------------------------
# One-step undo
# ---------------------------------------------------------------------------


async def _snapshot(session: Any) -> Optional[Dict[str, Any]]:
    """The saved previous version, if the roadmap is still exactly what that edit left."""
    try:
        snap = await cache_service.get_json(_undo_key(session.id))
    except Exception as exc:
        logger.warning(f"roadmap edit: undo copy of {session.id} unreadable: {exc}")
        return None
    if not isinstance(snap, dict) or snap.get("after") != graph_fingerprint(session.nodes or []):
        return None
    return snap


async def can_undo(session: Any) -> bool:
    return await _snapshot(session) is not None


async def undo_edit(session: Any) -> None:
    """Put back the version before the last edit (only while nothing changed since)."""
    snap = await _snapshot(session)
    if snap is None:
        raise InvalidInputError(NOTHING_TO_UNDO)
    session.nodes = snap.get("nodes") or []
    session.edges = snap.get("edges") or []
    session.grounding = snap.get("grounding")
    await session.save_graph()
    try:
        await cache_service.delete(_undo_key(session.id))
    except Exception as exc:
        logger.warning(f"roadmap edit: could not clear the undo copy of {session.id}: {exc}")
