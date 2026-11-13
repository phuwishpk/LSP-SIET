"""Accuracy and speed of the other AI features (report section 4.6.3).

  search    semantic document search (embedding model): rank of the expected document
  quiz      AI quiz from the course library: structure checks + questions kept for review
  roadmap   AI learning roadmap: structure, stage order, grounding, topic coverage, expand
  solo      My-ai-quiz solo mode (OpenRouter, outside the SIET API): structure checks

  SIET_API=http://localhost:25055 IT46_PW=... IT46_ADMIN_PW=... \
    python3 ai_features_eval.py search quiz roadmap --course 1953 --docs syllabus=81,intern=83,ds=82
  QUIZ_APP=http://localhost:3001 python3 ai_features_eval.py solo

Each part writes results/<part>_eval.json. Run after rag_eval.py, not alongside it, so the
features do not share the provider queue while their latency is measured.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import time

import requests

from siet_client import DEFAULT_BASE

HERE = os.path.dirname(os.path.abspath(__file__))
STAGES = ["พื้นฐาน", "แนวคิดหลัก", "ฝึกปฏิบัติ", "ประยุกต์", "ทบทวน/ประเมิน"]
THAI = re.compile(r"[฀-๿]")


def login(base: str, username: str, password: str) -> dict:
    r = requests.post(f"{base}/api/users/login", json={"username": username, "password": password}, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def usage(base: str, admin: dict, features: tuple[str, ...]) -> dict:
    data = requests.get(f"{base}/api/admin/usage?days=1", headers=admin, timeout=30).json()
    keep = ("calls", "input_tokens", "output_tokens", "search_queries", "cost_usd")
    return {f"{r['feature']}/{r['kind']}": {k: r.get(k, 0) for k in keep}
            for r in data.get("by_feature", []) if r.get("feature") in features}


def delta(before: dict, after: dict) -> dict:
    return {key: {k: round(v - before.get(key, {}).get(k, 0), 6) for k, v in row.items()} for key, row in after.items()}


def thai_ratio(texts: list[str]) -> float:
    texts = [t for t in texts if t]
    return round(sum(bool(THAI.search(t)) for t in texts) / max(1, len(texts)), 3)


def save(name: str, payload: dict) -> None:
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(os.path.join(HERE, "results", f"{name}_eval.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(json.dumps(payload.get("summary", {}), ensure_ascii=False, indent=1))


# --------------------------------------------------------------------------- search
SEARCH_QUERIES = [
    ("เกณฑ์การให้คะแนนวิชาพัฒนาเว็บ", "syllabus"),
    ("แผนการสอนรายสัปดาห์ React และ FastAPI", "syllabus"),
    ("นโยบายการส่งงานล่าช้า", "syllabus"),
    ("ชั่วโมงให้คำปรึกษาของอาจารย์", "syllabus"),
    ("คุณสมบัติของนักศึกษาที่มีสิทธิ์ฝึกงาน", "intern"),
    ("แบบฟอร์มที่ต้องยื่นก่อนเริ่มฝึกงาน", "intern"),
    ("การประเมินผลฝึกงานแบบผ่านไม่ผ่าน", "intern"),
    ("internship evaluation by the company mentor", "intern"),
    ("LIFO data structure push and pop", "ds"),
    ("โครงสร้างข้อมูลคิววงกลม", "ds"),
    ("ความซับซ้อนของ priority queue แบบ binary heap", "ds"),
    ("งานแล็บสร้างสแตกจากสองคิว", "ds"),
]


def run_search(args, titles: dict, student: dict) -> None:
    rows = []
    for q, key in SEARCH_QUERIES:
        t0 = time.perf_counter()
        r = requests.get(f"{args.base}/api/community/search", headers=student,
                         params={"q": q, "kind": "documents", "limit": 10}, timeout=60)
        secs = time.perf_counter() - t0
        items = r.json().get("documents", []) if r.ok else []
        ranks = [i + 1 for i, it in enumerate(items) if it.get("title") == titles[key]]
        rows.append({"query": q, "expected": key, "status": r.status_code, "seconds": round(secs, 3),
                     "results": len(items), "rank": ranks[0] if ranks else None,
                     "top": [{"title": it.get("title"), "similarity": it.get("similarity"), "match": it.get("match")} for it in items[:5]]})
        print(f"[search] {r.status_code} {secs:5.2f}s rank={rows[-1]['rank']} {q}")
        time.sleep(4)
    ok = [x for x in rows if x["status"] == 200]
    secs = [x["seconds"] for x in ok]
    save("search", {"rows": rows, "summary": {
        "queries": len(rows), "errors": len(rows) - len(ok),
        "hit@1": round(sum(x["rank"] == 1 for x in ok) / max(1, len(ok)), 3),
        "hit@3": round(sum(bool(x["rank"]) and x["rank"] <= 3 for x in ok) / max(1, len(ok)), 3),
        "hit@10": round(sum(x["rank"] is not None for x in ok) / max(1, len(ok)), 3),
        "mrr": round(sum(1 / x["rank"] for x in ok if x["rank"]) / max(1, len(ok)), 3),
        "results_mean": round(statistics.mean(x["results"] for x in ok), 1) if ok else None,
        "seconds_mean": round(statistics.mean(secs), 3) if secs else None,
        "seconds_max": round(max(secs), 3) if secs else None,
    }})


# --------------------------------------------------------------------------- quiz
QUIZ_TOPICS = [
    ("เกณฑ์คะแนน ข้อกำหนด และแผนการสอนของวิชา IT46-201 การพัฒนาเว็บแอปพลิเคชัน", "syllabus"),
    ("ขั้นตอน เอกสาร และการประเมินผลการฝึกงานภาคฤดูร้อน", "intern"),
    ("Stack, Queue, circular queue และ priority queue", "ds"),
]


def check_quiz(questions: list[dict], asked: int) -> dict:
    issues = []
    for q in questions:
        opts = [o.get("text", "") for o in q.get("options", [])]
        flagged = [o for o in q.get("options", []) if o.get("is_correct")]
        key = (q.get("correct_answer") or "").strip().lower()
        if len(opts) != 4:
            issues.append((q.get("id"), "options != 4"))
        if len({o.strip().lower() for o in opts}) != len(opts):
            issues.append((q.get("id"), "duplicate options"))
        if key not in [o.strip().lower() for o in opts]:
            issues.append((q.get("id"), "answer not among options"))
        if len(flagged) != 1:
            issues.append((q.get("id"), f"{len(flagged)} options flagged correct"))
        if not (q.get("explanation") or "").strip() or q.get("explanation") == "No explanation provided.":
            issues.append((q.get("id"), "no explanation"))
    stems = [q.get("question", "").strip().lower() for q in questions]
    return {"asked": asked, "returned": len(questions), "count_ok": len(questions) == asked,
            "duplicate_questions": len(stems) - len(set(stems)), "issues": issues,
            "structurally_valid": sum(1 for q in questions if not any(i[0] == q.get("id") for i in issues)),
            "thai_ratio": thai_ratio([q.get("question", "") for q in questions])}


def run_quiz(args, teacher: dict, admin: dict, doc_ids: dict) -> None:
    before = usage(args.base, admin, ("quiz",))
    rows = []
    for topic, key in QUIZ_TOPICS:
        body = {"topic": topic, "question_count": args.quiz_count, "language": "th",
                "scope": "document", "course_id": args.course, "document_ids": [doc_ids[key]]}
        t0 = time.perf_counter()
        r = requests.post(f"{args.base}/api/community/study/quiz", headers=teacher, json=body, timeout=300)
        secs = time.perf_counter() - t0
        data = r.json() if r.ok else {"error": r.text[:300]}
        qs = data.get("questions", [])
        rows.append({"topic": topic, "doc": key, "status": r.status_code, "seconds": round(secs, 2),
                     "cached": data.get("cached"), "grounded": data.get("grounded"), "scope_label": data.get("scope_label"),
                     "check": check_quiz(qs, args.quiz_count), "questions": qs})
        print(f"[quiz] {r.status_code} {secs:5.1f}s n={len(qs)} issues={len(rows[-1]['check']['issues'])} {topic[:40]}")
    ok = [x for x in rows if x["status"] == 200]
    save("quiz", {"rows": rows, "usage": delta(before, usage(args.base, admin, ("quiz",))), "summary": {
        "requests": len(rows), "errors": len(rows) - len(ok),
        "questions": sum(x["check"]["returned"] for x in ok),
        "structurally_valid": sum(x["check"]["structurally_valid"] for x in ok),
        "count_matches_request": sum(x["check"]["count_ok"] for x in ok),
        "seconds_mean": round(statistics.mean(x["seconds"] for x in ok), 2) if ok else None,
        "seconds_max": round(max(x["seconds"] for x in ok), 2) if ok else None,
    }})


# --------------------------------------------------------------------------- roadmap
ROADMAPS = [
    {"id": "RM1", "description": "เตรียมตัวสอบกลางภาควิชา IT46-201 การพัฒนาเว็บแอปพลิเคชัน", "scope": "course", "web": "off", "node_count": None,
     "topics": ["html", "css", "javascript", "dom", "react", "hook", "next", "fetch"]},
    {"id": "RM2", "description": "เตรียมตัวสอบกลางภาควิชา IT46-201 การพัฒนาเว็บแอปพลิเคชัน", "scope": "course", "web": "auto", "node_count": None,
     "topics": ["html", "css", "javascript", "dom", "react", "hook", "next", "fetch"]},
    {"id": "RM3", "description": "เตรียมตัวไปฝึกงานภาคฤดูร้อนตามคู่มือการฝึกงาน IT46", "scope": "course", "web": "off", "node_count": 8,
     "topics": ["90", "หน่วยกิต", "คำร้อง", "f01", "f02", "f03", "บันทึก", "รายงาน", "นำเสนอ", "240"]},
    {"id": "RM4", "description": "เรียนโครงสร้างข้อมูล Stack และ Queue ให้ทำ Lab 5 ได้", "scope": "course", "web": "auto", "node_count": 10,
     "topics": ["stack", "queue", "lifo", "fifo", "circular", "priority", "heap", "deque", "lab"]},
    {"id": "RM5", "description": "พื้นฐานการวิเคราะห์ข้อมูลด้วย Python สำหรับผู้เริ่มต้น", "scope": "none", "web": "auto", "node_count": 12,
     "topics": ["python", "pandas", "numpy", "visual", "csv", "clean", "สถิติ"]},
    {"id": "RM6", "description": "การเขียนโปรแกรมเชิงวัตถุด้วยภาษา Java", "scope": "none", "web": "off", "node_count": None,
     "topics": ["class", "object", "inherit", "encapsulation", "polymorphism", "interface", "abstract"]},
]


def check_roadmap(data: dict, spec: dict) -> dict:
    nodes = data.get("nodes", [])
    ids = {n.get("id") for n in nodes}
    mains = sorted([n for n in nodes if not n.get("parent")], key=lambda n: n.get("order", 0))
    edges = data.get("edges", [])
    bad_edges = [e for e in edges if e.get("source") not in ids or e.get("target") not in ids]
    # Acyclic: walk parents and main-to-main edges with a DFS.
    graph = {}
    for e in edges:
        graph.setdefault(e.get("source"), []).append(e.get("target"))
    state, cyclic = {}, False

    def dfs(n):
        nonlocal cyclic
        state[n] = 1
        for m in graph.get(n, []):
            if state.get(m) == 1:
                cyclic = True
            elif not state.get(m):
                dfs(m)
        state[n] = 2

    for n in ids:
        if not state.get(n):
            dfs(n)
    stage_idx = [STAGES.index(n.get("category")) if n.get("category") in STAGES else -1 for n in mains]
    text = " ".join(f"{n.get('label', '')} {n.get('description', '')}" for n in nodes).lower()
    lib = sum(1 for n in nodes if any(s.get("kind") == "library" for s in n.get("sources") or []))
    web = sum(1 for n in nodes if any(s.get("kind") == "web" for s in n.get("sources") or []))
    return {
        "nodes": len(nodes), "main_nodes": len(mains), "requested": spec["node_count"],
        "count_within_request": spec["node_count"] is None or len(nodes) <= spec["node_count"],
        "edges": len(edges), "bad_edges": len(bad_edges), "acyclic": not cyclic,
        "unknown_stage": sum(1 for i in stage_idx if i < 0),
        "stage_order_ok": stage_idx == sorted(stage_idx),
        "stages_used": len({i for i in stage_idx if i >= 0}),
        "empty_label": sum(1 for n in nodes if not (n.get("label") or "").strip()),
        "empty_description": sum(1 for n in nodes if not (n.get("description") or "").strip()),
        "thai_ratio": thai_ratio([n.get("label", "") for n in nodes]),
        "nodes_with_library_source": lib, "nodes_with_web_source": web,
        "topic_coverage": round(sum(1 for t in spec["topics"] if t in text) / len(spec["topics"]), 3),
        "topics_missing": [t for t in spec["topics"] if t not in text],
    }


def run_roadmap(args, teacher: dict, admin: dict) -> None:
    before = usage(args.base, admin, ("roadmap", "roadmap_expand", "roadmap_web"))
    rows = []
    for spec in ROADMAPS:
        body = {"description": spec["description"], "language": "th", "scope": spec["scope"], "web": spec["web"],
                "node_count": spec["node_count"]}
        if spec["scope"] == "course":
            body["course_id"] = args.course
        t0 = time.perf_counter()
        r = requests.post(f"{args.base}/api/community/study/roadmap", headers=teacher, json=body, timeout=900)
        secs = time.perf_counter() - t0
        data = r.json() if r.ok else {"error": r.text[:300]}
        row = {"id": spec["id"], "description": spec["description"], "scope": spec["scope"], "web": spec["web"],
               "status": r.status_code, "seconds": round(secs, 1), "cached": data.get("cached"),
               "grounding": {k: v for k, v in (data.get("grounding") or {}).items() if k != "web_sources"},
               "web_sources": len((data.get("grounding") or {}).get("web_sources") or []),
               "check": check_roadmap(data, spec) if r.ok else None,
               "nodes": [{k: n.get(k) for k in ("id", "label", "category", "parent", "level")} for n in data.get("nodes", [])]}
        # Expand the first main node (one level deeper), as a student does from the map.
        if r.ok and data.get("session_id") and data.get("nodes"):
            first = next((n for n in data["nodes"] if not n.get("parent")), data["nodes"][0])
            t1 = time.perf_counter()
            e = requests.post(f"{args.base}/api/community/roadmaps/mine/{data['session_id']}/expand",
                              headers=teacher, json={"node_id": first["id"]}, timeout=600)
            es = time.perf_counter() - t1
            ed = e.json() if e.ok else {}
            added = ed.get("added") or []
            new_nodes = [n for n in ed.get("nodes", []) if n.get("id") in set(added)]
            row["expand"] = {"status": e.status_code, "seconds": round(es, 1), "added": len(added),
                             "children_of_target": sum(1 for n in new_nodes if n.get("parent") == first["id"]),
                             "labels": [n.get("label") for n in new_nodes]}
        rows.append(row)
        c = row["check"] or {}
        print(f"[roadmap] {spec['id']} {r.status_code} {secs:6.1f}s nodes={c.get('nodes')} main={c.get('main_nodes')} cover={c.get('topic_coverage')} expand={row.get('expand', {}).get('added')}")
    ok = [x for x in rows if x["status"] == 200]
    save("roadmap", {"rows": rows, "usage": delta(before, usage(args.base, admin, ("roadmap", "roadmap_expand", "roadmap_web"))), "summary": {
        "requests": len(rows), "errors": len(rows) - len(ok),
        "structurally_valid": sum(1 for x in ok if x["check"]["bad_edges"] == 0 and x["check"]["acyclic"]
                                  and x["check"]["unknown_stage"] == 0 and x["check"]["stage_order_ok"]
                                  and x["check"]["empty_label"] == 0 and x["check"]["count_within_request"]),
        "nodes_mean": round(statistics.mean(x["check"]["nodes"] for x in ok), 1) if ok else None,
        "topic_coverage_mean": round(statistics.mean(x["check"]["topic_coverage"] for x in ok), 3) if ok else None,
        "seconds": {x["id"]: x["seconds"] for x in rows},
        "expand_ok": sum(1 for x in ok if x.get("expand", {}).get("status") == 200 and x["expand"]["children_of_target"] > 0),
    }})


# --------------------------------------------------------------------------- My-ai-quiz solo mode
SOLO = [
    {"subject": "การเขียนโปรแกรม", "topic": "ฟังก์ชันในภาษา Python", "difficulty": "easy"},
    {"subject": "ฐานข้อมูล", "topic": "การทำ Normalization 1NF 2NF 3NF", "difficulty": "medium"},
    {"subject": "เครือข่ายคอมพิวเตอร์", "topic": "แบบจำลอง OSI 7 ชั้น", "difficulty": "hard"},
]


def run_solo(args) -> None:
    app = os.environ.get("QUIZ_APP", "http://localhost:3001")
    rows = []
    for spec in SOLO:
        body = {**spec, "count": args.quiz_count, "questionType": "mcq"}
        t0 = time.perf_counter()
        r = requests.post(f"{app}/quiz/api/generate-quiz", json=body, timeout=300)
        secs = time.perf_counter() - t0
        data = r.json() if r.ok else {"error": r.text[:300]}
        qs = data.get("quiz", [])
        issues = []
        for q in qs:
            opts = q.get("options") or []
            if len(opts) != 4:
                issues.append((q.get("id"), f"{len(opts)} options"))
            if (q.get("correctAnswer") or "").strip().lower() not in [o.strip().lower() for o in opts]:
                issues.append((q.get("id"), "answer not among options"))
            if len({o.strip().lower() for o in opts}) != len(opts):
                issues.append((q.get("id"), "duplicate options"))
            if not (q.get("explanation") or "").strip():
                issues.append((q.get("id"), "no explanation"))
        rows.append({**spec, "status": r.status_code, "seconds": round(secs, 1), "returned": len(qs), "asked": args.quiz_count,
                     "issues": issues, "valid": sum(1 for q in qs if not any(i[0] == q.get("id") for i in issues)),
                     "thai_ratio": thai_ratio([q.get("question", "") for q in qs]), "questions": qs})
        print(f"[solo] {r.status_code} {secs:5.1f}s n={len(qs)} issues={len(issues)} {spec['topic']}")
    ok = [x for x in rows if x["status"] == 200]
    save("solo", {"app": app, "rows": rows, "summary": {
        "requests": len(rows), "errors": len(rows) - len(ok), "questions": sum(x["returned"] for x in ok),
        "structurally_valid": sum(x["valid"] for x in ok),
        "seconds_mean": round(statistics.mean(x["seconds"] for x in ok), 1) if ok else None,
    }})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("parts", nargs="+", choices=["search", "quiz", "roadmap", "solo"])
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--course", type=int)
    ap.add_argument("--docs", default="", help="key=library_id,...")
    ap.add_argument("--quiz-count", type=int, default=5)
    args = ap.parse_args()

    if set(args.parts) - {"solo"}:
        doc_ids = {k: int(v) for k, v in (p.split("=") for p in args.docs.split(",") if p)}
        admin = login(args.base, "it46.admin", os.environ["IT46_ADMIN_PW"])
        teacher = login(args.base, "it46.teacher", os.environ["IT46_PW"])
        student = login(args.base, "it46.student3", os.environ["IT46_PW"])
        titles = {}
        for key, doc_id in doc_ids.items():
            d = requests.get(f"{args.base}/api/community/library/{doc_id}", headers=teacher, timeout=30).json()
            titles[key] = (d.get("document") or d)["title"]
        if "search" in args.parts:
            run_search(args, titles, student)
        if "quiz" in args.parts:
            run_quiz(args, teacher, admin, doc_ids)
        if "roadmap" in args.parts:
            run_roadmap(args, teacher, admin)
    if "solo" in args.parts:
        run_solo(args)


if __name__ == "__main__":
    main()
