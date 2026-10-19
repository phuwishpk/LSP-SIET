#!/usr/bin/env python3
"""
Live-stack smoke test: exercise every community endpoint that reads or writes
MariaDB (rooms, room_members, saved_posts, quiz_attempts, rag_credit_sessions,
student_code, linked_*, question_count, answer_meta, room_id, chunk/char_count,
recipient_id, roadmap_follow_count).

  python3 deploy/smoke-test.py [--no-ai]

API_BASE overrides the default http://localhost:5055. --no-ai skips the steps
that call the model (quiz, roadmap, ask), which also leave sessions behind.

Uses the demo.* accounts from deploy/seed-demo-data.py and the seeded admin.
Creates its own records under a unique suffix and removes them at the end.
"""
import json, os, sys, time, uuid, urllib.request, urllib.error
from pathlib import Path

BASE = os.environ.get("API_BASE", "http://localhost:5055").rstrip("/")
NO_AI = "--no-ai" in sys.argv
RUN = uuid.uuid4().hex[:6]
results = []


def call(method, path, token=None, body=None, form=None):
    for _ in range(6):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        data = None
        if form is not None:
            b = uuid.uuid4().hex
            parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in form.items() if v is not None]
            data = ("".join(parts) + f"--{b}--\r\n").encode("utf-8")
            headers["Content-Type"] = f"multipart/form-data; boundary={b}"
        elif body is not None:
            data, headers["Content-Type"] = json.dumps(body).encode(), "application/json"
        req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                raw, status = r.read(), r.status
        except urllib.error.HTTPError as e:
            raw, status = e.read(), e.code
            if status == 429:
                time.sleep(min(int(e.headers.get("retry-after") or 5), 70) + 1)
                continue
        try:
            return status, (json.loads(raw) if raw else None)
        except ValueError:
            return status, raw.decode("utf-8", "replace")[:300]
    return 429, None


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  -> {str(detail)[:220]}" if detail and not ok else ""))


def ok(name, status, payload, want=(200, 201)):
    check(name, status in want, f"{status} {payload}")
    return payload


def login(u, p):
    s, d = call("POST", "/api/users/login", body={"username": u, "password": p})
    if s != 200:
        sys.exit(f"login {u} failed: {s} {d}")
    return d["access_token"]


env = {}
for line in (Path(__file__).resolve().parent.parent / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip("'\"")
admin = login(env["WORKSPACE_SEED_ADMIN_USERNAME"], env["WORKSPACE_SEED_ADMIN_PASSWORD"])
s1, s2, t1 = login("demo.student1", "Demo@2026"), login("demo.student2", "Demo@2026"), login("demo.teacher1", "Demo@2026")

# ---- reads over renamed tables -------------------------------------------
me = ok("me (users.student_code -> student_id)", *call("GET", "/api/community/me", s1))
check("me keeps student_id key = 69990001", (me or {}).get("user", {}).get("student_id") == "69990001", me)
courses = ok("courses list (rooms + room_members)", *call("GET", "/api/community/courses", s1)) or []
demo101 = next((c for c in courses if c.get("code") == "DEMO101"), None)
check("DEMO101 present, joined, member_count >= 7", bool(demo101) and demo101["joined"] and demo101["member_count"] >= 7, demo101)
posts = ok("feed (posts.room_id / linked_*)", *call("GET", "/api/community/posts?limit=50", s1)) or {}
in_room = [p for p in posts.get("items", []) if (p.get("course") or {}).get("code") == "DEMO101"]
check("feed posts carry their room as course{}", len(in_room) >= 1, len(in_room))
ok("feed filtered by room", *call("GET", f"/api/community/posts?course_id={demo101['id']}", s1))
ok("feed my rooms only", *call("GET", "/api/community/posts?my_courses=true", s1))
ok("feed saved only (saved_posts)", *call("GET", "/api/community/posts?saved=true", s1))
ok("feed embeds filter (linked_type)", *call("GET", "/api/community/posts?embed=quiz,roadmap", s1))
ok("feed popular order (roadmap_follow_count)", *call("GET", "/api/community/posts?order=popular", s1))
ok("popular roadmaps", *call("GET", "/api/community/roadmaps/popular", s1))
notif = ok("notifications (recipient_id)", *call("GET", "/api/community/notifications", s1)) or {}
check("student1 still has seeded notifications", len(notif.get("items", [])) >= 1, notif)
found = ok("search (rooms + student_code)", *call("GET", "/api/community/search?q=6999000", s1)) or {}
check("search finds users by student number", len(found.get("users", [])) >= 1, found.get("users"))
lib = ok("library list (room_id / chunk_count)", *call("GET", f"/api/community/library?scope=course&course_id={demo101['id']}", s1)) or {}
doc = (lib.get("items") or [None])[0]
check("course document keeps chunks + course{}", bool(doc) and doc["chunks"] >= 1 and doc["course"]["code"] == "DEMO101", doc)
ok("knowledge picker", *call("GET", "/api/community/knowledge", s1))
ok("leaderboard", *call("GET", "/api/community/leaderboard", s1))
ok("wallet", *call("GET", "/api/community/wallet", s1))
ok("teacher overview (rooms owned)", *call("GET", "/api/community/teacher/overview", t1))
ok("teacher quiz results (quiz_attempts)", *call("GET", "/api/community/teacher/quiz-results", t1))
users = ok("admin users search by student number", *call("GET", "/api/admin/users?q=69990001", admin)) or {}
check("admin list returns student_id", any(u.get("student_id") == "69990001" for u in users.get("items", [])), users)
ok("admin posts", *call("GET", "/api/admin/posts", admin))
ok("admin courses (rooms)", *call("GET", "/api/admin/courses", admin))
ok("admin points log", *call("GET", "/api/admin/points/log", admin))
ok("admin overview", *call("GET", "/api/admin/overview", admin))
ok("admin health", *call("GET", "/api/admin/health", admin))
maps = ok("admin roadmaps (summaries)", *call("GET", "/api/admin/roadmaps?limit=5", admin)) or {}
check("admin roadmap list never carries the nodes of a plan", all("nodes" not in m and "edges" not in m for m in maps.get("items", [])), maps)
ok("admin shared roadmap posts", *call("GET", "/api/admin/roadmaps/shared", admin))
rstats = ok("admin roadmap stats (viewer time zone)", *call("GET", "/api/admin/roadmaps/stats?days=30&tz_offset=420", admin)) or {}
check("roadmap stats: days add up to the generated total", sum(d["count"] for d in rstats.get("per_day", [])) == rstats.get("generated"), rstats)
check("admin roadmap console is closed to students and teachers", [call("GET", "/api/admin/roadmaps", tok)[0] for tok in (s1, t1)] == [403, 403])

# ---- writes ----------------------------------------------------------------
room = ok("create discussion room (rooms, kind=club)", *call("POST", "/api/community/courses", s1, body={"name": f"ห้องทดสอบย้ายชื่อ {RUN}", "kind": "club"}))
rid = (room or {}).get("id")
ok("join room (room_members)", *call("POST", f"/api/community/courses/{rid}/join", s2))
ok("leave room", *call("DELETE", f"/api/community/courses/{rid}/join", s2))
ok("rename room", *call("PATCH", f"/api/community/courses/{rid}", s1, body={"description": "แก้คำอธิบาย"}))
created = ok("create post in room (posts.room_id)", *call("POST", "/api/community/posts", s1, form={"type": "question", "title": f"โพสต์ทดสอบย้ายชื่อ {RUN}", "content": f"ทดสอบการย้ายชื่อตาราง รอบ {RUN} ข้อความยาวพอสมควร", "course_id": rid, "tags": "ทดสอบ rename"}))
pid = ((created or {}).get("post") or {}).get("id")
check("new post reports its room", ((created or {}).get("post") or {}).get("course", {}).get("id") == rid, created)
ok("edit post + move to feed", *call("PUT", f"/api/community/posts/{pid}", s1, body={"content": f"แก้ไขแล้ว รอบ {RUN} เพิ่มรายละเอียดให้ยาวขึ้นกว่าเดิมอีกหน่อย", "course_id": 0}))
ok("like", *call("POST", f"/api/community/posts/{pid}/reactions", s2, body={"kind": "like"}))
ok("helpful", *call("POST", f"/api/community/posts/{pid}/reactions", s2, body={"kind": "helpful"}))
ok("comment", *call("POST", f"/api/community/posts/{pid}/comments", s2, body={"content": f"คอมเมนต์ทดสอบ {RUN}"}))
ok("save (saved_posts)", *call("POST", f"/api/community/posts/{pid}/save", s2))
ok("share", *call("POST", f"/api/community/posts/{pid}/share", s2))
one = ok("get post", *call("GET", f"/api/community/posts/{pid}", s2)) or {}
check("viewer flags liked/saved/shared", all(one.get("viewer", {}).get(k) for k in ("liked", "helpful", "saved", "shared")), one.get("viewer"))
n2 = ok("author notifications after reactions", *call("GET", "/api/community/notifications", s1)) or {}
check("author notified by student2", any(i.get("post_id") == pid for i in n2.get("items", [])), n2.get("items", [])[:3])
ok("mark notifications read", *call("POST", "/api/community/notifications/read", s1, body={}))

up = ok("personal library upload (library_documents.room_id NULL)", *call("POST", "/api/community/library", s2, form={"scope": "personal", "title": f"โน้ตทดสอบ {RUN}", "content": f"ลูป for ใช้เมื่อรู้จำนวนรอบ ส่วน while ใช้เมื่อวนจนกว่าเงื่อนไขจะเป็นเท็จ รอบ {RUN}"}))
did = ((up or {}).get("document") or {}).get("id")
state = {}
for _ in range(30):
    _, state = call("GET", f"/api/community/library/{did}", s2)
    if (state or {}).get("status") != "processing":
        break
    time.sleep(4)
check("document embedded (chunk_count / char_count written)", (state or {}).get("status") == "ready" and state.get("chunks", 0) >= 1 and state.get("chars", 0) > 10, state)

if not NO_AI:
    quiz = ok("generate quiz (teacher, exempt)", *call("POST", "/api/community/study/quiz", t1, body={"topic": "ลูป for และ while ใน Python", "question_count": 3, "scope": "course", "course_id": demo101["id"]})) or {}
    qp = ok("post quiz (posts.linked_type/linked_id/linked_snapshot)", *call("POST", "/api/community/posts", t1, form={"type": "quiz", "title": f"ควิซทดสอบ {RUN}", "content": "ลองทำดู", "embed_type": "quiz", "embed_id": quiz.get("session_id"), "course_id": demo101["id"]})) or {}
    qpid = (qp.get("post") or {}).get("id")
    check("quiz post exposes embed without answers", (qp.get("post") or {}).get("embed", {}).get("type") == "quiz", qp)
    st = ok("quiz start (quiz_attempts insert, question_count)", *call("POST", f"/api/community/posts/{qpid}/quiz/start", s1)) or {}
    answers = {str(q["id"]): (q["options"][0] if q.get("options") else None) for q in st.get("questions", [])}
    sub = ok("quiz submit (quiz_attempts update)", *call("POST", f"/api/community/posts/{qpid}/quiz/submit", s1, body={"play_id": st.get("play_id"), "answers": answers})) or {}
    check("submit returns score/total", "score" in sub and sub.get("total") == len(st.get("questions", [])), sub)
    res = ok("teacher sees the attempt", *call("GET", f"/api/community/teacher/quiz-results?course_id={demo101['id']}", t1)) or {}
    rows = res.get("items", res if isinstance(res, list) else [])
    check("attempt row has total + student_code", any(r.get("post_id") == qpid and r.get("total") and r.get("student_code") == "69990001" for r in rows), rows[:2])

    rm = ok("generate roadmap (teacher, exempt)", *call("POST", "/api/community/study/roadmap", t1, body={"description": "พื้นฐาน Python: ตัวแปร เงื่อนไข ลูป", "node_count": 6, "scope": "course", "course_id": demo101["id"]})) or {}
    rp = ok("post roadmap", *call("POST", "/api/community/posts", t1, form={"type": "roadmap", "title": f"Roadmap ทดสอบ {RUN}", "content": "ลองเดินตาม", "embed_type": "roadmap", "embed_id": rm.get("session_id")})) or {}
    rpid = (rp.get("post") or {}).get("id")
    ok("follow roadmap (roadmap_follow_count + saved_posts)", *call("POST", f"/api/community/posts/{rpid}/roadmap/follow", s1))
    after = ok("roadmap post after follow", *call("GET", f"/api/community/posts/{rpid}", s1)) or {}
    check("follow counter = 1", after.get("counts", {}).get("follow") == 1, after.get("counts"))

    a1 = ok("ask single (rag_messages.answer_meta)", *call("POST", "/api/community/ask", s2, body={"question": "สอบย่อยครั้งที่ 1 ครอบคลุมบทไหน", "scope": "course", "course_id": demo101["id"], "web": "off"})) or {}
    hist = ok("ask history detail", *call("GET", f"/api/community/ask/history/{a1.get('conversation_id')}", s2)) or {}
    msgs = hist.get("messages", [])
    check("assistant message meta restored", any(m.get("role") == "assistant" and isinstance(m.get("meta"), dict) and "citations" in m["meta"] for m in msgs), msgs[-1:] )
    a2 = ok("ask session (rag_credit_sessions insert)", *call("POST", "/api/community/ask", s2, body={"question": "for กับ while ต่างกันอย่างไร", "mode": "session", "scope": "course", "course_id": demo101["id"], "web": "off"})) or {}
    a3 = ok("ask session follow-up (rag_credit_sessions update)", *call("POST", "/api/community/ask", s2, body={"question": "ยกตัวอย่าง while", "mode": "session", "session_id": a2.get("session_id"), "scope": "course", "course_id": demo101["id"], "web": "off", "conversation_id": a2.get("conversation_id")})) or {}
    check("session credits go down", (a3.get("credits_left") is not None) and a3.get("credits_left") < (a2.get("credits_left") or 99), (a2.get("credits_left"), a3.get("credits_left")))
    for cid in {a1.get("conversation_id"), a2.get("conversation_id")} - {None}:
        call("DELETE", f"/api/community/ask/history/{cid}", s2)
    for p in (qpid, rpid):
        call("DELETE", f"/api/community/posts/{p}", t1)

# ---- admin paths touching renamed tables -----------------------------------
imp = ok("admin CSV import with student_id", *call("POST", "/api/admin/import/users", admin, body={"csv": f"username,password,display_name,role,student_id\nrn{RUN},Tmp#2026x,ผู้ใช้ทดสอบย้ายชื่อ,student,6888{RUN[:4]}"})) or {}
uid = (imp.get("created") or [{}])[0].get("id")
tmp = login(f"rn{RUN}", "Tmp#2026x")
ok("temp user joins a room", *call("POST", f"/api/community/courses/{demo101['id']}/join", tmp))
ok("temp user saves a post", *call("POST", f"/api/community/posts/{pid}/save", tmp))
ok("admin hides post", *call("DELETE", f"/api/admin/posts/{pid}", admin))
ok("admin restores post", *call("POST", f"/api/admin/posts/{pid}/restore", admin))
gone = ok("admin deletes user (saved_posts/quiz_attempts/room_members/rag_credit_sessions/notifications/rooms)", *call("DELETE", f"/api/admin/users/{uid}", admin)) or {}
check("delete reports removed rows", isinstance(gone.get("removed"), dict) and gone["removed"].get("memberships") == 1 and gone["removed"].get("saved") == 1, gone)

# ---- cleanup ---------------------------------------------------------------
ok("delete library doc", *call("DELETE", f"/api/community/library/{did}", s2))
ok("author deletes post", *call("DELETE", f"/api/community/posts/{pid}", s1))
ok("delete room (posts detached, members removed)", *call("DELETE", f"/api/community/courses/{rid}", s1))

failed = [n for n, good in results if not good]
print(f"\n{len(results) - len(failed)}/{len(results)} passed" + (f" - FAILED: {failed}" if failed else ""))
sys.exit(1 if failed else 0)
