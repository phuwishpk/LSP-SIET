"""Editing a roadmap from a typed instruction: the operations the AI returns, applied safely."""

import copy

import pytest
from siet_community import roadmap_edit

from siet_core.exceptions import InvalidInputError


def _nodes():
    return [
        {"id": "n1", "label": "ตัวแปร", "description": "d1", "category": "พื้นฐาน", "parent": None,
         "level": 0, "order": 1, "refs": [], "from_library": False, "sources": [{"kind": "web", "url": "https://a"}]},
        {"id": "n2", "label": "ลูป", "description": "d2", "category": "แนวคิดหลัก", "parent": None,
         "level": 0, "order": 2, "refs": [], "from_library": False, "sources": []},
        {"id": "n3", "label": "โจทย์", "description": "d3", "category": "ฝึกปฏิบัติ", "parent": None,
         "level": 0, "order": 3, "refs": [], "from_library": False, "sources": []},
        {"id": "n4", "label": "for", "description": "d4", "category": "แนวคิดหลัก", "parent": "n2",
         "level": 1, "order": 1, "refs": [], "from_library": False, "sources": []},
        {"id": "n5", "label": "สอบ", "description": "d5", "category": "ทบทวน/ประเมิน", "parent": None,
         "level": 0, "order": 4, "refs": [], "from_library": False, "sources": []},
    ]


def _by_id(nodes):
    return {n["id"]: n for n in nodes}


def _mains(nodes):
    return [n["id"] for n in sorted((n for n in nodes if not n.get("parent")), key=lambda n: n["order"])]


def test_add_main_after_node_takes_its_stage_and_renumbers():
    nodes, changes = roadmap_edit.apply_edit_ops(
        _nodes(), [{"op": "add", "ref": "a", "label": "Docker", "description": "x", "parent": None, "after": "n2"}]
    )
    new = _by_id(nodes)["n6"]
    assert changes["added"] == ["n6"]
    assert new["category"] == "แนวคิดหลัก" and new["level"] == 0
    assert _mains(nodes) == ["n1", "n2", "n6", "n3", "n5"]
    assert [n["order"] for n in sorted((n for n in nodes if not n["parent"]), key=lambda n: n["order"])] == [1, 2, 3, 4, 5]
    edges = roadmap_edit.rebuild(nodes)[1]
    assert {"source": "n2", "target": "n6"} in edges and {"source": "n6", "target": "n3"} in edges


def test_add_children_under_a_node_added_in_the_same_answer():
    nodes, changes = roadmap_edit.apply_edit_ops(
        _nodes(),
        [
            {"op": "add", "ref": "a", "label": "Docker", "parent": None, "after": "n3"},
            {"op": "add", "ref": "b", "label": "Dockerfile", "parent": "a"},
        ],
    )
    added = [_by_id(nodes)[i] for i in changes["added"]]
    assert added[1]["parent"] == added[0]["id"] and added[1]["level"] == 1


def test_remove_takes_descendants():
    nodes, changes = roadmap_edit.apply_edit_ops(_nodes(), [{"op": "remove", "id": "n2"}])
    assert "n4" not in _by_id(nodes) and changes["removed"] == ["n2", "n4"]


def test_update_keeps_sources_and_id():
    nodes, changes = roadmap_edit.apply_edit_ops(_nodes(), [{"op": "update", "id": "n1", "label": "ตัวแปรและชนิดข้อมูล"}])
    n1 = _by_id(nodes)["n1"]
    assert n1["label"] == "ตัวแปรและชนิดข้อมูล" and n1["sources"] == [{"kind": "web", "url": "https://a"}]
    assert changes == {"added": [], "removed": [], "updated": ["n1"]}


def test_move_child_to_main():
    nodes, changes = roadmap_edit.apply_edit_ops(_nodes(), [{"op": "move", "id": "n4", "parent": None, "after": "n1"}])
    n4 = _by_id(nodes)["n4"]
    assert n4["parent"] is None and n4["level"] == 0 and n4["category"] == "พื้นฐาน"
    assert _mains(nodes) == ["n1", "n4", "n2", "n3", "n5"] and changes["updated"] == ["n4"]


def test_unknown_ids_and_cycles_are_skipped():
    nodes, changes = roadmap_edit.apply_edit_ops(
        _nodes(),
        [
            {"op": "remove", "id": "zz"},
            {"op": "move", "id": "n2", "parent": "n4"},
            {"op": "add", "label": "x", "parent": "nope"},
            {"op": "update", "id": "n3", "description": "ใหม่"},
        ],
    )
    assert changes == {"added": [], "removed": [], "updated": ["n3"]}
    assert _by_id(nodes)["n2"]["parent"] is None


def test_depth_limit():
    nodes, _ = roadmap_edit.apply_edit_ops(_nodes(), [{"op": "add", "ref": "d", "label": "detail", "parent": "n4"}])
    deep = next(n for n in nodes if n["label"] == "detail")
    assert deep["level"] == 2
    with pytest.raises(InvalidInputError):
        roadmap_edit.apply_edit_ops(nodes, [{"op": "add", "label": "too deep", "parent": deep["id"]}])


def test_move_that_would_push_a_subtree_too_deep_is_skipped():
    base = _nodes()
    nodes, changes = roadmap_edit.apply_edit_ops(
        base, [{"op": "move", "id": "n2", "parent": "n1"}, {"op": "move", "id": "n1", "parent": "n3"}]
    )
    by = _by_id(nodes)
    assert by["n1"]["parent"] is None and by["n2"]["parent"] == "n1" and by["n4"]["level"] == 2
    assert changes["updated"] == ["n2"]


def test_too_few_mains_is_refused():
    with pytest.raises(InvalidInputError):
        roadmap_edit.apply_edit_ops(_nodes(), [{"op": "remove", "id": "n1"}, {"op": "remove", "id": "n2"}, {"op": "remove", "id": "n3"}])


def test_nothing_changed_is_refused():
    with pytest.raises(InvalidInputError):
        roadmap_edit.apply_edit_ops(_nodes(), [])
    with pytest.raises(InvalidInputError):
        roadmap_edit.apply_edit_ops(_nodes(), [{"op": "update", "id": "n1", "label": "ตัวแปร"}])
    with pytest.raises(InvalidInputError):
        roadmap_edit.apply_edit_ops(_nodes(), "not a list")


def test_untouched_nodes_are_identical():
    before = _nodes()
    nodes, _ = roadmap_edit.apply_edit_ops(copy.deepcopy(before), [{"op": "add", "label": "Docker", "after": "n3"}])
    after = _by_id(nodes)
    for node in before:
        assert {k: v for k, v in after[node["id"]].items() if k != "order"} == {k: v for k, v in node.items() if k != "order"}


def test_input_is_not_mutated():
    before = _nodes()
    snapshot = copy.deepcopy(before)
    roadmap_edit.apply_edit_ops(before, [{"op": "remove", "id": "n2"}, {"op": "update", "id": "n1", "label": "x"}])
    assert before == snapshot


def test_node_ceiling():
    many = _nodes() + [
        {"id": f"n{i}", "label": f"c{i}", "description": "", "category": "พื้นฐาน", "parent": "n1",
         "level": 1, "order": i, "refs": [], "from_library": False, "sources": []}
        for i in range(6, 201)
    ]
    assert len(many) == 200
    with pytest.raises(InvalidInputError):
        roadmap_edit.apply_edit_ops(many, [{"op": "add", "label": "one more", "after": "n3"}])


# ---------------------------------------------------------------------------
# The AI call, grounding of new nodes, and the one-step undo
# ---------------------------------------------------------------------------

import asyncio
import json
from types import SimpleNamespace

from siet_community import roadmap_plan

from siet_core.exceptions import ExternalServiceError


class _Cache:
    def __init__(self, fail=False):
        self.store, self.ttls, self.fail = {}, {}, fail

    async def get_json(self, key):
        if self.fail:
            raise RuntimeError("redis down")
        return self.store.get(key)

    async def set_json(self, key, value, ttl=None):
        if self.fail:
            raise RuntimeError("redis down")
        self.store[key], self.ttls[key] = json.loads(json.dumps(value)), ttl
        return True

    async def delete(self, key):
        self.store.pop(key, None)
        return True


class _Session(SimpleNamespace):
    async def save_graph(self):
        self.saves = getattr(self, "saves", 0) + 1


def _session():
    nodes = [{k: v for k, v in n.items() if k not in ("refs", "from_library")} for n in _nodes()]
    return _Session(id="roadmap_session:r1", owner_id="7", title="Python", language="th", nodes=nodes,
                    edges=roadmap_plan.derive_edges(nodes), grounding={"library": False, "web": True, "label": "อ้างอิง: เว็บ", "web_sources": []})


@pytest.fixture
def ai(monkeypatch):
    state = {"replies": [], "prompts": [], "topics": None, "cache": _Cache()}

    async def fake_chat(*, prompt, system, owner_id, max_tokens=None):
        state["prompts"].append(prompt)
        return state["replies"].pop(0)

    async def fake_research(*, title, language, topics, owner_id):
        state["topics"] = [t["id"] for t in topics]
        return {"available": True, "notes": {}, "sources": []}

    monkeypatch.setattr(roadmap_edit, "_invoke_chat", fake_chat)
    monkeypatch.setattr(roadmap_plan, "research_on_web", fake_research)
    monkeypatch.setattr(roadmap_edit, "cache_service", state["cache"])
    return state


def _edit(session, instruction="เพิ่มเรื่อง Docker หลังลูป", **kw):
    return asyncio.run(roadmap_edit.edit_roadmap(session=session, instruction=instruction, **kw))


ADD_DOCKER = json.dumps({"summary": "เพิ่ม Docker", "ops": [{"op": "add", "ref": "a1", "label": "Docker", "after": "n2"}]})


def test_edit_saves_new_graph_and_snapshot(ai):
    session = _session()
    old_nodes = [dict(n) for n in session.nodes]
    ai["replies"] = [ADD_DOCKER]
    result = _edit(session)
    assert result["added"] == ["n6"] and result["summary"] == "เพิ่ม Docker"
    assert session.saves == 1 and any(n["label"] == "Docker" for n in session.nodes)
    assert {"source": "n2", "target": "n6"} in session.edges
    snap = ai["cache"].store["roadmap:undo:roadmap_session:r1"]
    assert snap["nodes"] == old_nodes and snap["after"] == roadmap_plan.graph_fingerprint(session.nodes)
    assert ai["cache"].ttls["roadmap:undo:roadmap_session:r1"] == roadmap_edit.UNDO_TTL == 604800


def test_prompt_lists_nodes_and_instruction(ai):
    ai["replies"] = [ADD_DOCKER]
    _edit(_session(), instruction="ตัดเรื่องสอบออก")
    prompt = ai["prompts"][0]
    assert "n2 | - | แนวคิดหลัก | ลูป" in prompt and "n4 | n2 |" in prompt
    assert "ตัดเรื่องสอบออก" in prompt and all(stage in prompt for stage in roadmap_plan.STAGES)


def test_new_nodes_get_web_research_only_they(ai):
    ai["replies"] = [ADD_DOCKER]
    session = _session()
    _edit(session)
    assert ai["topics"] == ["n6"]
    assert next(n for n in session.nodes if n["id"] == "n6")["sources"] == []


def test_web_off_skips_research(ai):
    ai["replies"] = [ADD_DOCKER]
    _edit(_session(), web_mode="off")
    assert ai["topics"] is None


@pytest.mark.parametrize("reply", ["no json at all", json.dumps({"ops": "x"}), json.dumps(["a"])])
def test_malformed_answer_raises_external_error(ai, reply):
    session = _session()
    ai["replies"] = [reply]
    with pytest.raises(ExternalServiceError):
        _edit(session)
    assert not getattr(session, "saves", 0) and ai["cache"].store == {}


def test_blank_instruction_is_refused(ai):
    with pytest.raises(InvalidInputError):
        _edit(_session(), instruction="   ")
    assert ai["prompts"] == []


def test_undo_restores_and_clears(ai):
    session = _session()
    before = [dict(n) for n in session.nodes]
    ai["replies"] = [ADD_DOCKER]
    _edit(session)
    assert asyncio.run(roadmap_edit.can_undo(session)) is True
    asyncio.run(roadmap_edit.undo_edit(session))
    assert session.nodes == before and session.saves == 2
    assert asyncio.run(roadmap_edit.can_undo(session)) is False


def test_undo_after_expansion_is_refused(ai):
    session = _session()
    ai["replies"] = [ADD_DOCKER]
    _edit(session)
    session.nodes = session.nodes + [{"id": "n7", "label": "ขยาย", "parent": "n1"}]  # an expansion
    assert asyncio.run(roadmap_edit.can_undo(session)) is False
    with pytest.raises(InvalidInputError):
        asyncio.run(roadmap_edit.undo_edit(session))
    assert session.saves == 1


def test_undo_with_nothing_is_refused(ai):
    with pytest.raises(InvalidInputError):
        asyncio.run(roadmap_edit.undo_edit(_session()))


def test_can_undo_false_when_cache_fails(ai, monkeypatch):
    monkeypatch.setattr(roadmap_edit, "cache_service", _Cache(fail=True))
    assert asyncio.run(roadmap_edit.can_undo(_session())) is False


def test_edit_still_saves_when_cache_is_down(ai, monkeypatch):
    monkeypatch.setattr(roadmap_edit, "cache_service", _Cache(fail=True))
    session = _session()
    ai["replies"] = [ADD_DOCKER]
    _edit(session)
    assert session.saves == 1


def test_old_roadmaps_with_english_stages_keep_their_lanes():
    legacy = [
        {"id": f"node-{i}", "label": label, "description": "", "category": cat, "parent": None, "level": 0, "order": i, "sources": []}
        for i, (label, cat) in enumerate([("a", "planning"), ("b", "development"), ("c", "testing"), ("d", "launch")], start=1)
    ]
    nodes, _ = roadmap_edit.apply_edit_ops(
        legacy, [{"op": "add", "label": "PR", "after": "node-2", "stage": "แนวคิดหลัก"}]
    )
    new = next(n for n in nodes if n["label"] == "PR")
    assert new["category"] == "development"
    assert [n["label"] for n in sorted((n for n in nodes if not n["parent"]), key=lambda n: n["order"])] == ["a", "b", "PR", "c", "d"]
