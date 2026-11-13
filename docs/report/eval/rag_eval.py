"""Accuracy and speed of KMITL RAG AI (report section 4.6.3).

Asks every question in rag_questions.json as a student of the test course, under two settings:
  course  - scope=course, web=off   (the course library only: pure retrieval + generation)
  auto    - scope=auto,   web=auto  (what a student gets by default; web search may join in)
then repeats a few questions to time the answer cache, and scores each answer:
  correct   - every expected fact appears in the answer (any listed spelling counts)
  partial   - some but not all expected facts appear
  refusal   - for "none" questions: the answer says the documents do not contain it
  hit@1/@k  - the expected document is the top / any retrieved citation; MRR = 1 / its rank
  cited     - the model cited ([n]) a passage of the expected document

  SIET_API=http://localhost:25055 IT46_PW=... IT46_ADMIN_PW=... \
    python3 rag_eval.py --course 1953 --docs syllabus=81,intern=83,ds=82

Writes results/rag_eval.json. Needs the it46.* accounts made for the test stack.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import time
from collections import defaultdict

import requests

from siet_client import DEFAULT_BASE

HERE = os.path.dirname(os.path.abspath(__file__))
STUDENTS = ["it46.student1", "it46.student2", "it46.student3"]
SETTINGS = {
    "course": {"scope": "course", "web": "off"},
    "auto": {"scope": "auto", "web": "auto"},
}
# How an answer says "the documents don't have this".
REFUSAL = [
    "ไม่พบ", "ไม่มีข้อมูล", "ไม่ได้ระบุ", "ไม่ระบุ", "ไม่ปรากฏ", "ไม่ได้กล่าวถึง", "ไม่มีการระบุ",
    "ไม่ได้ให้ข้อมูล", "ไม่มีรายละเอียด", "ไม่สามารถ", "ไม่ครอบคลุม", "not found", "not mention", "no information",
]


def norm(text: str) -> str:
    text = text.replace("**", "").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).lower()


def facts_found(answer: str, expect: list[list[str]]) -> int:
    a = norm(answer)
    return sum(1 for group in expect if any(norm(alt) in a for alt in group))


def pct(values: list[float], p: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p * (len(s) - 1))))] if s else 0.0


class Asker:
    def __init__(self, base: str, password: str):
        self.base = base
        self.tokens = {}
        self.ids = {}
        for u in STUDENTS:
            r = requests.post(f"{base}/api/users/login", json={"username": u, "password": password}, timeout=30)
            r.raise_for_status()
            self.tokens[u] = r.json()["access_token"]
            self.ids[u] = r.json()["user"]["id"]
        self.last = defaultdict(float)
        self.turn = 0

    def ask(self, payload: dict) -> tuple[dict, float, int]:
        user = STUDENTS[self.turn % len(STUDENTS)]
        self.turn += 1
        for _ in range(6):
            gap = time.time() - self.last[user]
            if gap < 8:  # stay well inside the per-user burst limits (3 s, 8/min)
                time.sleep(8 - gap)
            t0 = time.perf_counter()
            r = requests.post(
                f"{self.base}/api/community/ask",
                headers={"Authorization": f"Bearer {self.tokens[user]}"},
                json=payload,
                timeout=240,
            )
            secs = time.perf_counter() - t0
            self.last[user] = time.time()
            if r.status_code == 429:
                time.sleep(float(r.headers.get("Retry-After", 10)) + 1)
                continue
            return (r.json() if r.headers.get("content-type", "").startswith("application/json") else {"error": r.text[:300]}), secs, r.status_code
        return {"error": "rate limited"}, 0.0, 429


def admin_headers(base: str, admin_pw: str) -> dict:
    r = requests.post(f"{base}/api/users/login", json={"username": "it46.admin", "password": admin_pw}, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def top_up(base: str, h: dict, ids: dict, need: int) -> None:
    for uid in ids.values():
        requests.post(f"{base}/api/admin/users/{uid}/points", headers=h, json={"delta": need, "note": "4.6 evaluation"}, timeout=30)


def usage(base: str, h: dict, features: tuple[str, ...]) -> dict:
    """Provider calls recorded in llm_usage today, per feature and kind (chat / embedding)."""
    data = requests.get(f"{base}/api/admin/usage?days=1", headers=h, timeout=30).json()
    keep = ("calls", "input_tokens", "output_tokens", "search_queries", "cost_usd")
    return {f"{r['feature']}/{r['kind']}": {k: r.get(k, 0) for k in keep}
            for r in data.get("by_feature", []) if r.get("feature") in features}


def usage_delta(before: dict, after: dict) -> dict:
    out = {}
    for key, row in after.items():
        prev = before.get(key, {})
        out[key] = {k: round(v - prev.get(k, 0), 6) for k, v in row.items()}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--course", type=int, required=True)
    ap.add_argument("--docs", required=True, help="key=library_id,... e.g. syllabus=81,intern=83,ds=82")
    ap.add_argument("--settings", default="course,auto")
    ap.add_argument("--cache-repeats", type=int, default=10)
    ap.add_argument("--only", default="", help="comma separated question ids")
    args = ap.parse_args()

    spec = json.load(open(os.path.join(HERE, "rag_questions.json"), encoding="utf-8"))
    questions = spec["questions"]
    if args.only:
        keep = set(args.only.split(","))
        questions = [q for q in questions if q["id"] in keep]

    asker = Asker(args.base, os.environ["IT46_PW"])
    settings = [s for s in args.settings.split(",") if s]
    admin = admin_headers(args.base, os.environ["IT46_ADMIN_PW"])
    top_up(args.base, admin, asker.ids, len(questions) * len(settings) // len(STUDENTS) + 5)
    usage_before = usage(args.base, admin, ("ask",))

    # Stored library titles (the upload renames files), used to recognise citations.
    h = {"Authorization": f"Bearer {next(iter(asker.tokens.values()))}"}
    titles = {}
    for pair in args.docs.split(","):
        key, doc_id = pair.split("=")
        d = requests.get(f"{args.base}/api/community/library/{doc_id}", headers=h, timeout=30).json()
        titles[key] = (d.get("document") or d)["title"]

    rows = []
    for setting in settings:
        for q in questions:
            payload = {"question": q["q"], "course_id": args.course, **SETTINGS[setting]}
            data, secs, code = asker.ask(payload)
            cites = data.get("citations") or []
            expected_title = titles[q["doc"]]
            ranks = [i + 1 for i, c in enumerate(cites) if c.get("title") == expected_title]
            answer = data.get("answer") or ""
            found = facts_found(answer, q["expect"])
            refused = any(p in answer.lower() for p in REFUSAL)
            row = {
                "setting": setting, "id": q["id"], "type": q["type"], "doc": q["doc"], "question": q["q"],
                "status": code, "seconds": round(secs, 2), "cached": data.get("cached"),
                "coverage": data.get("coverage"), "grounded": data.get("grounded"), "web_used": data.get("web_used"),
                "answer": answer, "facts_expected": len(q["expect"]), "facts_found": found,
                "correct": bool(q["expect"]) and found == len(q["expect"]),
                "partial": bool(q["expect"]) and 0 < found < len(q["expect"]),
                "refusal": refused if q["type"] == "none" else None,
                "rank": ranks[0] if ranks else None,
                "cited_expected": any(c.get("cited") and c.get("title") == expected_title for c in cites),
                "citations": [{"title": c.get("title"), "score": round(c.get("score") or 0, 3), "cited": c.get("cited")} for c in cites],
                "web_sources": len(data.get("web_sources") or []),
            }
            rows.append(row)
            verdict = "REFUSE" if q["type"] == "none" and refused else ("OK" if row["correct"] else ("PART" if row["partial"] else "MISS"))
            print(f"[{setting}] {q['id']:3} {code} {secs:5.1f}s rank={row['rank']} {verdict}")

    # Answer cache: ask the first N course-library questions again.
    cache_rows = []
    for q in questions[: args.cache_repeats]:
        data, secs, code = asker.ask({"question": q["q"], "course_id": args.course, **SETTINGS["course"]})
        cache_rows.append({"id": q["id"], "status": code, "seconds": round(secs, 3), "cached": data.get("cached")})
        print(f"[cache] {q['id']:3} {secs:5.2f}s cached={data.get('cached')}")

    out = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "base": args.base, "course": args.course,
           "doc_titles": titles, "rows": rows, "cache": cache_rows, "summary": summarise(rows, cache_rows),
           "usage": usage_delta(usage_before, usage(args.base, admin, ("ask",)))}
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(os.path.join(HERE, "results", "rag_eval.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out["summary"], ensure_ascii=False, indent=1))


def summarise(rows: list[dict], cache_rows: list[dict]) -> dict:
    out = {}
    for setting in sorted({r["setting"] for r in rows}):
        rs = [r for r in rows if r["setting"] == setting and r["status"] == 200]
        answerable = [r for r in rs if r["type"] != "none"]
        none = [r for r in rs if r["type"] == "none"]
        by_type = {}
        for t in ("fact", "cross", "reason"):
            g = [r for r in answerable if r["type"] == t]
            if g:
                by_type[t] = {"n": len(g), "correct": sum(r["correct"] for r in g), "partial": sum(r["partial"] for r in g)}
        secs = [r["seconds"] for r in rs if not r["cached"]]
        out[setting] = {
            "asked": len(rs),
            "errors": sum(1 for r in rows if r["setting"] == setting and r["status"] != 200),
            "answerable": len(answerable),
            "correct": sum(r["correct"] for r in answerable),
            "partial": sum(r["partial"] for r in answerable),
            "accuracy": round(sum(r["correct"] for r in answerable) / max(1, len(answerable)), 3),
            "by_type": by_type,
            "none": len(none),
            "refused": sum(bool(r["refusal"]) for r in none),
            "hit@1": round(sum(r["rank"] == 1 for r in answerable) / max(1, len(answerable)), 3),
            "hit@k": round(sum(r["rank"] is not None for r in answerable) / max(1, len(answerable)), 3),
            "mrr": round(sum(1 / r["rank"] for r in answerable if r["rank"]) / max(1, len(answerable)), 3),
            "cited_expected": round(sum(r["cited_expected"] for r in answerable) / max(1, len(answerable)), 3),
            "web_used": sum(bool(r["web_used"]) for r in rs),
            "seconds_mean": round(statistics.mean(secs), 2) if secs else None,
            "seconds_p50": round(pct(secs, 0.5), 2) if secs else None,
            "seconds_p95": round(pct(secs, 0.95), 2) if secs else None,
            "seconds_max": round(max(secs), 2) if secs else None,
        }
    hits = [c["seconds"] for c in cache_rows if c["cached"]]
    out["cache"] = {"repeated": len(cache_rows), "served_from_cache": len(hits),
                    "seconds_mean": round(statistics.mean(hits), 3) if hits else None}
    return out


if __name__ == "__main__":
    main()
