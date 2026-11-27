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
