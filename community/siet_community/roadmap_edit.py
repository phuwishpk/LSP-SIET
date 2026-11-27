"""
Editing a roadmap from a typed instruction ("สั่งแก้ด้วย AI").

The model does not rewrite the roadmap: it answers with operations (add /
remove / update / move) that are checked and applied here, so the nodes the
instruction does not touch stay exactly as they were, sources included.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional, Sequence, Tuple

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
    derive_edges,
    next_node_ids,
    stage_of,
)
from siet_core.exceptions import InvalidInputError

NOTHING_CHANGED = "คำสั่งนี้ไม่ได้เปลี่ยนอะไรใน Roadmap ลองพิมพ์ให้ชัดขึ้น เช่น บอกชื่อหัวข้อที่อยากเพิ่มหรือลบ"
TOO_FEW_MAINS = f"Roadmap ต้องเหลือหัวข้อหลักอย่างน้อย {MIN_MAIN_NODES} หัวข้อ"

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


def _stage_for_main(tree: _Tree, op: Dict[str, Any], after: Any) -> Any:
    stage = stage_of(op.get("stage") or op.get("category"))
    if stage:
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
        return refs.get(key, _MISSING)

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
            if op.get("description") is not None:
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
