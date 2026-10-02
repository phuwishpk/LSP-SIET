"""Shaping of AI learning plans: stages, sub-nodes, sources and what a shared post may show."""

import asyncio
from types import SimpleNamespace

import pytest

from open_notebook.community import grounding, roadmap_plan
from open_notebook.exceptions import ExternalServiceError


def _node(node_id, label, category=None, parent=None, **extra):
    return {"id": node_id, "label": label, "category": category, "parent": parent, **extra}


def test_stage_of_accepts_the_models_variations():
    assert roadmap_plan.stage_of("พื้นฐาน") == "พื้นฐาน"
    assert roadmap_plan.stage_of(" ทบทวน / ประเมิน ") == "ทบทวน/ประเมิน"
    assert roadmap_plan.stage_of("ทบทวนและประเมินผล") == "ทบทวน/ประเมิน"
    assert roadmap_plan.stage_of("ขั้นฝึกปฏิบัติ") == "ฝึกปฏิบัติ"
    assert roadmap_plan.stage_of("planning") is None
    assert roadmap_plan.stage_of(None) is None


def test_normalize_orders_mains_by_stage_and_reissues_ids():
    plan = roadmap_plan.normalize_plan(
        {
            "title": "Python",
            "nodes": [
                _node("a", "ลูป", "แนวคิดหลัก"),
                _node("b", "ตัวแปร", "พื้นฐาน"),
                _node("c", "สอบย่อย", "ทบทวน/ประเมิน"),
                _node("d", "โจทย์", "ฝึกปฏิบัติ"),
            ],
        },
        node_count=8,
    )
    mains = [n for n in plan["nodes"] if n["parent"] is None]
    assert [n["label"] for n in mains] == ["ตัวแปร", "ลูป", "โจทย์", "สอบย่อย"]
    assert [n["id"] for n in mains] == ["n1", "n2", "n3", "n4"]
    assert [n["order"] for n in mains] == [1, 2, 3, 4]
    assert plan["edges"] == [
        {"source": "n1", "target": "n2"},
        {"source": "n2", "target": "n3"},
        {"source": "n3", "target": "n4"},
    ]


def test_normalize_attaches_sub_nodes_and_inherits_stage():
    plan = roadmap_plan.normalize_plan(
        {
            "nodes": [
                _node("m1", "ตัวแปร", "พื้นฐาน"),
                _node("m2", "ลูป", "แนวคิดหลัก"),
                _node("m3", "สอบ", "ทบทวน/ประเมิน"),
                _node("s1", "break", parent="m2"),
                _node("s2", "ตัวอย่าง break", parent="s1"),  # sub of a sub -> its main
                _node("s3", "ลอย", parent="missing"),  # unknown parent -> a main node
            ]
        },
        node_count=12,
    )
    by_label = {n["label"]: n for n in plan["nodes"]}
    loop = by_label["ลูป"]
    assert by_label["break"]["parent"] == loop["id"]
    assert by_label["ตัวอย่าง break"]["parent"] == loop["id"]
    assert by_label["break"]["category"] == "แนวคิดหลัก"
    assert by_label["break"]["level"] == 1
    assert by_label["ลอย"]["parent"] is None
    assert {"source": loop["id"], "target": by_label["break"]["id"]} in plan["edges"]


def test_normalize_fills_missing_stages_by_position_and_trims():
    plan = roadmap_plan.normalize_plan(
        {"nodes": [_node(str(i), f"หัวข้อ {i}", "whatever") for i in range(10)]},
        node_count=5,
    )
    assert len(plan["nodes"]) == 5
    stages = [n["category"] for n in plan["nodes"]]
    assert stages == sorted(stages, key=roadmap_plan.STAGES.index)
    assert stages[0] == "พื้นฐาน"


def test_without_a_requested_size_the_plan_keeps_every_node_the_model_wrote():
    mains = [_node(f"m{i}", f"หัวข้อ {i}", "พื้นฐาน") for i in range(30)]
    subs = [_node(f"s{i}", f"ย่อย {i}", parent="m0") for i in range(9)]
    plan = roadmap_plan.normalize_plan({"nodes": mains + subs})
    assert len(plan["nodes"]) == 39
    assert sum(1 for n in plan["nodes"] if n["parent"] == "n1") == 9  # no per-node cap
    # asking for a size still trims to it
    assert len(roadmap_plan.normalize_plan({"nodes": mains + subs}, node_count=12)["nodes"]) == 12
    # and a runaway answer stops at the safety ceiling
    flood = [_node(f"x{i}", f"ข้อ {i}", "พื้นฐาน") for i in range(roadmap_plan.MAX_NODES + 40)]
    assert len(roadmap_plan.normalize_plan({"nodes": flood})["nodes"]) == roadmap_plan.MAX_NODES


def test_the_prompt_leaves_the_size_to_the_model_unless_one_is_asked_for():
    free = roadmap_plan._plan_prompt("เรียน Python", "th", None, [])
    assert "You decide how many nodes" in free and "Produce exactly" not in free
    fixed = roadmap_plan._plan_prompt("เรียน Python", "th", 12, [])
    assert "Produce exactly 12 nodes" in fixed and "You decide" not in fixed


def test_normalize_rejects_a_plan_that_is_too_small():
    with pytest.raises(ExternalServiceError):
        roadmap_plan.normalize_plan({"nodes": [_node("a", "หนึ่ง"), _node("b", "สอง")]}, node_count=8)


def test_refs_are_kept_only_when_they_point_at_a_real_passage():
    plan = roadmap_plan.normalize_plan(
        {
            "nodes": [
                _node("a", "หนึ่ง", "พื้นฐาน", refs=[1, 7, "2", "x"], from_library=True),
                _node("b", "สอง", "แนวคิดหลัก", refs=[3], from_library=True),
                # refs without the model vouching for them are not a citation
                _node("c", "สาม", "ฝึกปฏิบัติ", refs=[1], from_library=False),
            ]
        },
        node_count=3,
        passages=2,
    )
    assert plan["nodes"][0]["refs"] == [1, 2]
    assert plan["nodes"][1]["refs"] == []
    assert plan["nodes"][2]["refs"] == []


def test_relevant_passages_drop_off_topic_text_unless_the_document_was_picked(monkeypatch):
    monkeypatch.setenv("ROADMAP_MIN_SIMILARITY", "0.65")
    passages = [
        {"index": 1, "id": "a", "score": 0.61},
        {"index": 2, "id": "b", "score": 0.78},
        {"index": 3, "id": "c", "score": None},  # a stored summary has no score
    ]
    kept = roadmap_plan.relevant_passages(passages, picked=False)
    assert [(p["id"], p["index"]) for p in kept] == [("b", 1), ("c", 2)]
    assert [p["id"] for p in roadmap_plan.relevant_passages(passages, picked=True)] == ["a", "b", "c"]


def test_library_sources_name_where_a_passage_came_from():
    nodes = [{"id": "n1", "refs": [1, 2, 3], "from_library": True}, {"id": "n2", "refs": []}]
    passages = [
        {"index": 1, "id": "source:course", "title": "chunk"},
        {"index": 2, "id": "source:mine", "title": "chunk"},
        {"index": 3, "id": "source:staff", "title": "หลักสูตร"},
    ]
    meta = {
        "source:course": {"title": "บทที่ 1", "scope": "course", "room_code": "DEMO101"},
        "source:mine": {"title": "โน้ตของฉัน", "scope": "personal", "room_code": None},
    }
    roadmap_plan.attach_library_sources(nodes, passages, meta)
    assert nodes[0]["sources"] == [
        {"kind": "library", "title": "บทที่ 1", "scope": "course", "origin": "คลังวิชา DEMO101"},
        {"kind": "library", "title": "โน้ตของฉัน", "scope": "personal", "origin": "ไฟล์ของฉัน"},
        {"kind": "library", "title": "หลักสูตร", "scope": "shared", "origin": "Notebook ที่อาจารย์แชร์"},
    ]
    assert nodes[1]["sources"] == []
    assert "refs" not in nodes[0] and "from_library" not in nodes[0]


def test_public_nodes_hide_private_file_names():
    nodes = [
        {
            "id": "n1",
            "sources": [
                {"kind": "library", "title": "โน้ตของฉัน", "scope": "personal", "origin": "ไฟล์ของฉัน"},
                {"kind": "library", "title": "โน้ตอีกไฟล์", "scope": "personal", "origin": "ไฟล์ของฉัน"},
                {"kind": "library", "title": "บทที่ 1", "scope": "course", "origin": "คลังวิชา DEMO101"},
                {"kind": "web", "title": "Docs", "url": "https://example.org"},
            ],
        }
    ]
    shared = roadmap_plan.public_nodes(nodes)[0]["sources"]
    assert shared == [
        {"kind": "private"},
        {"kind": "library", "title": "บทที่ 1", "origin": "คลังวิชา DEMO101"},
        {"kind": "web", "title": "Docs", "url": "https://example.org"},
    ]
    assert "โน้ต" not in str(shared)
    # the owner's copy is untouched
    assert nodes[0]["sources"][0]["title"] == "โน้ตของฉัน"


def test_web_sections_are_split_per_node_with_their_pages():
    text = "### n2\nลูป for ใช้เมื่อรู้จำนวนรอบ [W1] ดูที่ docs [W1][W3]\n\n### n5 สอบ\nทบทวนก่อนสอบ\n"
    assert roadmap_plan.parse_web_sections(text) == {
        "n2": ("ลูป for ใช้เมื่อรู้จำนวนรอบ ดูที่ docs", [1, 3]),
        "n5": ("ทบทวนก่อนสอบ", []),
    }


def test_web_topics_follow_the_mode():
    nodes = [
        {"id": "n1", "parent": None, "sources": [{"kind": "library"}]},
        {"id": "n2", "parent": None, "sources": []},
        {"id": "n3", "parent": "n1", "sources": []},
    ]
    assert roadmap_plan.web_topics(nodes, grounding.WEB_OFF) == []
    assert [n["id"] for n in roadmap_plan.web_topics(nodes, grounding.WEB_AUTO)] == ["n2", "n3"]
    assert [n["id"] for n in roadmap_plan.web_topics(nodes, grounding.WEB_ALWAYS)] == ["n2", "n3", "n1"]


def test_merge_research_needs_a_page_unless_none_could_be_pinned():
    page = {"kind": "web", "title": "Docs", "url": "https://example.org"}
    nodes = [{"id": "n1", "description": "เดิม", "sources": []}, {"id": "n2", "description": "", "sources": []}]
    used = roadmap_plan.merge_research(
        nodes, {"notes": {"n1": ("จากเว็บ", [page]), "n2": ("ไม่มีที่มา", [])}, "sources": [page]}
    )
    assert used is True
    assert nodes[0]["description"] == "เดิม\n\nจากเว็บ" and nodes[0]["sources"] == [page]
    assert nodes[1]["description"] == ""  # no page for it -> left alone

    # pages came back but none could be tied to a sentence: keep the notes anyway
    nodes = [{"id": "n1", "description": "", "sources": []}]
    assert roadmap_plan.merge_research(nodes, {"notes": {"n1": ("จากเว็บ", [])}, "sources": [page]}) is True
    assert nodes[0]["description"] == "จากเว็บ" and nodes[0]["sources"] == []

    # the search returned nothing usable
    nodes = [{"id": "n1", "description": "", "sources": []}]
    assert roadmap_plan.merge_research(nodes, {"notes": {}, "sources": []}) is False


def test_grounding_label():
    assert roadmap_plan.grounding_label(True, True) == "อ้างอิง: คลังความรู้ + เว็บ"
    assert roadmap_plan.grounding_label(True, False) == "อ้างอิง: คลังความรู้"
    assert roadmap_plan.grounding_label(False, True) == "อ้างอิง: เว็บ"
    assert roadmap_plan.grounding_label(False, False) == "ไม่ได้อ้างอิงคลังความรู้"


# ---------------------------------------------------------------------------
# Expanding a node
# ---------------------------------------------------------------------------


def _tree():
    return [
        {"id": "n1", "label": "ตัวแปร", "category": "พื้นฐาน", "parent": None, "order": 1},
        {"id": "n2", "label": "ลูป", "category": "แนวคิดหลัก", "parent": None, "order": 2},
        {"id": "n3", "label": "break", "category": "แนวคิดหลัก", "parent": "n2", "order": 1},
        {"id": "n4", "label": "ตัวอย่าง break", "category": "แนวคิดหลัก", "parent": "n3", "order": 1},
    ]


def test_depth_and_what_blocks_an_expansion():
    nodes = _tree()
    assert [roadmap_plan.depth_of(nodes, i) for i in ("n1", "n3", "n4")] == [0, 1, 2]
    assert roadmap_plan.expansion_block(nodes, "n2") is None
    assert roadmap_plan.expansion_block(nodes, "n3") is None
    assert "ลึกสุด" in roadmap_plan.expansion_block(nodes, "n4")
    assert "ไม่พบ" in roadmap_plan.expansion_block(nodes, "nope")
    full = [{"id": f"n{i}", "parent": None} for i in range(1, roadmap_plan.MAX_NODES + 1)]
    assert "ครบ" in roadmap_plan.expansion_block(full, "n1")


def test_new_ids_never_clash_even_with_old_style_ids():
    assert roadmap_plan.next_node_ids(_tree(), 2) == ["n5", "n6"]
    legacy = [{"id": "node_1"}, {"id": "intro"}, {"id": "n3"}]
    assert roadmap_plan.next_node_ids(legacy, 2) == ["n4", "n5"]


def test_children_take_the_parents_stage_and_skip_repeats():
    nodes = _tree()
    children = roadmap_plan.build_children(
        {
            "nodes": [
                {"label": "break", "description": "ซ้ำกับที่มีอยู่"},
                {"label": "continue", "description": "ข้ามรอบ", "refs": [1], "from_library": True},
                {"label": "ลูปซ้อน", "description": "ลูปในลูป"},
                {"label": "", "description": "ไม่มีชื่อ"},
            ]
        },
        nodes,
        nodes[1],
        passages=1,
    )
    assert [c["label"] for c in children] == ["continue", "ลูปซ้อน"]
    assert [c["id"] for c in children] == ["n5", "n6"]
    assert all(c["parent"] == "n2" and c["level"] == 1 and c["category"] == "แนวคิดหลัก" for c in children)
    assert [c["order"] for c in children] == [2, 3]  # after the existing sub-node
    assert children[0]["refs"] == [1] and children[1]["refs"] == []


def test_children_are_capped_only_by_the_node_ceiling():
    nodes = _tree()
    # No fixed number per expansion: every step the model wrote is kept.
    many = roadmap_plan.build_children(
        {"nodes": [{"label": f"ใหม่ {i}"} for i in range(9)]}, nodes, nodes[0], passages=0
    )
    assert len(many) == 9
    one = roadmap_plan.build_children({"nodes": [{"label": "ขั้นเดียว"}]}, nodes, nodes[0], passages=0)
    assert len(one) == 1

    nearly_full = [{"id": f"n{i}", "label": str(i), "parent": None} for i in range(1, roadmap_plan.MAX_NODES - 1)]
    children = roadmap_plan.build_children(
        {"nodes": [{"label": f"ใหม่ {i}"} for i in range(5)]}, nearly_full, nearly_full[0], passages=0
    )
    assert len(children) == 2  # only two fit under the ceiling
    with pytest.raises(ExternalServiceError):
        roadmap_plan.build_children({"nodes": [{"label": ""}]}, nearly_full, nearly_full[0], passages=0)


def _expansion_answers(monkeypatch, *answers):
    """Feed ``_draft_children`` canned model answers; returns the prompts it sent."""
    queue, prompts = list(answers), []

    async def fake_chat(*, prompt, system, owner_id, max_tokens=None):
        prompts.append(prompt)
        return queue.pop(0)

    async def fake_json(raw):
        return {"nodes": [{"label": label, "description": "รายละเอียด"} for label in raw]}

    monkeypatch.setattr(roadmap_plan, "_invoke_chat", fake_chat)
    monkeypatch.setattr(roadmap_plan, "_extract_json", fake_json)
    return prompts


def _draft(nodes, parent):
    session = SimpleNamespace(title="แผน", language="th", owner_id="1")
    return asyncio.run(roadmap_plan._draft_children(session, nodes, parent, []))


def test_expansion_keeps_however_many_steps_the_model_wrote(monkeypatch):
    nodes = _tree()
    # "break" is already a sub-node of n2; the two new steps are accepted as they are.
    prompts = _expansion_answers(monkeypatch, ["break", "continue", "ลูปซ้อน"])
    assert [c["label"] for c in _draft(nodes, nodes[1])] == ["continue", "ลูปซ้อน"]
    assert len(prompts) == 1 and "You decide how many" in prompts[0]

    prompts = _expansion_answers(monkeypatch, [f"ขั้น {i}" for i in range(1, 8)])
    assert len(_draft(nodes, nodes[1])) == 7


def test_expansion_with_nothing_new_is_asked_again_then_refused(monkeypatch):
    nodes = _tree()
    prompts = _expansion_answers(monkeypatch, ["break"], ["continue"])
    assert [c["label"] for c in _draft(nodes, nodes[1])] == ["continue"]
    assert len(prompts) == 2 and "no step" not in prompts[0] and "no step" in prompts[1]

    prompts = _expansion_answers(monkeypatch, ["break"], [])
    with pytest.raises(ExternalServiceError):
        _draft(nodes, nodes[1])
    assert len(prompts) == 2


def test_fingerprint_tracks_the_graph_not_the_sources():
    nodes = _tree()
    same = [{**n, "sources": [{"kind": "private"}]} for n in reversed(nodes)]
    assert roadmap_plan.graph_fingerprint(nodes) == roadmap_plan.graph_fingerprint(same)
    grown = nodes + [{"id": "n5", "label": "ใหม่", "parent": "n1"}]
    assert roadmap_plan.graph_fingerprint(nodes) != roadmap_plan.graph_fingerprint(grown)
