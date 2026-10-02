"""Shaping of AI learning plans: stages, sub-nodes, sources and what a shared post may show."""

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
