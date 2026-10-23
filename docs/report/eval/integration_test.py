"""Frontend-backend integration test for report section 4.6.1.

Plays the API calls each screen makes, module by module and role by role, on the integrated
build (staging) running in the isolated test stack, then cleans up what it created.

  SIET_API=http://localhost:25055 ROADMAP_APP=http://localhost:23002 QUIZ_APP=http://localhost:23001 \
  IT46_PW=... IT46_ADMIN_PW=... python3 integration_test.py --course 1953

Needs the it46.* accounts and the IT46-201 test course (see the report). Writes
results/integration_test.json and prints a per-module summary.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from collections import defaultdict

import requests

from siet_client import DEFAULT_BASE, Recorder

HERE = os.path.dirname(os.path.abspath(__file__))
POST_COOLDOWN = 21  # one post per author every 20 s
LIBRARY_COOLDOWN = 16


def jid(resp: requests.Response, *keys: str):
    """The id in a create response, whether at the top level or under a key such as 'post'."""
    try:
        data = resp.json()
    except ValueError:
        return None
    for k in keys:
        if isinstance(data.get(k), dict) and data[k].get("id") is not None:
            return data[k]["id"]
    return data.get("id") if isinstance(data, dict) else None


def require(rec: Recorder, value, module: str, what: str):
    """A create call whose id cannot be read would silently skip the steps that depend on it."""
    if value is None:
        last = rec.calls[-1]
        rec.calls.append(type(last)(module, f"read id of {what}", "-", "-", last.role, [0], 0, 0.0, False,
                                    "the create response had no id; dependent steps were skipped"))
        print(f"FAIL [{module}] could not read the id of {what}")
    return value


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--course", type=int, required=True)
    args = ap.parse_args()
    roadmap_app = os.environ.get("ROADMAP_APP", "http://localhost:23002")
    quiz_app = os.environ.get("QUIZ_APP", "http://localhost:23001")
    pw, admin_pw = os.environ["IT46_PW"], os.environ["IT46_ADMIN_PW"]

    rec = Recorder(args.base)
    C = rec.call
    cid = args.course
    cleanup: list = []  # (session, path) DELETEs run at the end
    run = time.strftime("%H%M%S")

    # ---------------------------------------------------------------- auth / login / RBAC
    C("auth", "public auth status", None, "GET", "/api/auth/status")
    C("auth", "public runtime config", None, "GET", "/api/config")
    C("auth", "login with a wrong password", None, "POST", "/api/users/login", 401,
      json={"username": "it46.student1", "password": "wrong-password"})
    admin = rec.login("it46.admin", admin_pw, "admin")
    teacher = rec.login("it46.teacher", pw, "teacher")
    s1 = rec.login("it46.student1", pw, "student")
    s2 = rec.login("it46.student2", pw, "student")
    for s in (admin, teacher, s1):
        C("auth", f"current user ({s.role})", s, "GET", "/api/users/me")
    C("auth", "PDPA consent", s1, "POST", "/api/users/me/consent-pdpa")
    C("rbac", "no token -> feed refused", None, "GET", "/api/community/posts", 401)
    C("rbac", "student -> admin console refused", s1, "GET", "/api/admin/overview", 403)
    C("rbac", "student -> notebooks (staff only) refused", s1, "GET", "/api/notebooks", 403)
    C("rbac", "student -> model settings refused", s1, "GET", "/api/models", 403)
    C("rbac", "teacher -> admin console refused", teacher, "GET", "/api/admin/overview", 403)
    C("rbac", "teacher -> notebooks allowed", teacher, "GET", "/api/notebooks")

    # Google sign-in (mock mode of the test stack): the e-mail decides the role.
    mock_ids = []
    for email, expect_role, expect in [("65039901@kmitl.ac.th", "student", 200), ("65019901@kmitl.ac.th", "pending", 200),
                                       ("it46.outsider@gmail.com", None, 403)]:
        st = C("rbac", "google start (state)", None, "GET", "/api/auth/google/start?next=/community")
        state = st.json().get("state") if st.ok else ""
        r = C("rbac", f"google sign-in {email} -> {expect_role or 'refused (domain)'}", None, "POST",
              "/api/auth/google/exchange", expect, json={"state": state, "mock_email": email})
        if r.ok:
            data = r.json()
            role = (data.get("user") or {}).get("role")
            rec.calls[-1].note = f"role={role}"
            rec.calls[-1].ok = rec.calls[-1].ok and role == expect_role
            mock_ids.append((data.get("user") or {}).get("id"))
            if expect_role == "pending":
                h = {"Authorization": f"Bearer {data['access_token']}"}
                C("rbac", "pending account -> community refused", None, "GET", "/api/community/posts", 403, headers=h)
                C("rbac", "pending account -> own profile allowed", None, "GET", "/api/users/me", 200, headers=h)

    # ---------------------------------------------------------------- courses / teacher console
    C("courses", "list rooms", s1, "GET", "/api/community/courses")
    C("courses", "room detail", s1, "GET", f"/api/community/courses/{cid}")
    C("courses", "categories", s1, "GET", "/api/community/categories")
    r = C("courses", "teacher opens a room with a join code", teacher, "POST", "/api/community/courses", 201,
          json={"code": f"IT46-9{int(time.time()) % 100:02d}", "name": "ห้องทดสอบการบูรณาการ 4.6", "term": "2/2569",
                "join_code": "JOIN46"})
    room = require(rec, jid(r, "course"), "courses", "the new room")
    if room:
        C("courses", "join with a wrong code refused", s2, "POST", f"/api/community/courses/{room}/join", 403, json={"code": "WRONG"})
        C("courses", "join with the right code", s2, "POST", f"/api/community/courses/{room}/join", json={"code": "JOIN46"})
        C("courses", "teacher lists members", teacher, "GET", f"/api/community/courses/{room}/members")
        C("courses", "teacher makes the student a TA", teacher, "PATCH", f"/api/community/courses/{room}/members/{s2.user['id']}", json={"role": "ta"})
        C("courses", "student cannot archive the room", s1, "POST", f"/api/community/courses/{room}/archive", 403)
        C("courses", "teacher archives the room", teacher, "POST", f"/api/community/courses/{room}/archive")
        C("courses", "archived room refuses new members", s1, "POST", f"/api/community/courses/{room}/join", 400, json={"code": "JOIN46"})
        C("courses", "teacher restores the room", teacher, "POST", f"/api/community/courses/{room}/restore")
        C("courses", "teacher removes the member", teacher, "DELETE", f"/api/community/courses/{room}/members/{s2.user['id']}")
    C("courses", "teacher console overview", teacher, "GET", "/api/community/teacher/overview")
    C("courses", "teacher quiz results", teacher, "GET", "/api/community/teacher/quiz-results")

    # ---------------------------------------------------------------- library
    r = C("library", "teacher adds a text document to the course library", teacher, "POST", "/api/community/library", 201,
          data={"scope": "course", "course_id": str(cid), "title": "IT46 บันทึกการทดสอบการบูรณาการ",
                "content": f"เอกสารทดสอบรอบ {run}: ระบบคลังความรู้ต้องประมวลผลข้อความนี้และพร้อมให้ค้นหาได้ รหัสตรวจสอบ INTEG-4627"})
    doc = require(rec, jid(r, "document"), "library", "the new document")
    ready = None
    if doc:
        for _ in range(60):
            g = requests.get(f"{args.base}/api/community/library/{doc}", headers=teacher.headers, timeout=30).json()
            ready = (g.get("document") or g).get("status")
            if ready != "processing":
                break
            time.sleep(3)
        C("library", f"document processed (status={ready})", teacher, "GET", f"/api/community/library/{doc}")
        rec.calls[-1].ok = rec.calls[-1].ok and ready == "ready"
        C("library", "course member lists the library", s1, "GET", f"/api/community/library?course_id={cid}")
        C("library", "a pasted-text document has no file to download", s1, "GET", f"/api/community/library/{doc}/download", 404)
    # Download a PDF of the course library (the syllabus uploaded for 4.6.3).
    lib = requests.get(f"{args.base}/api/community/library?course_id={cid}", headers=s1.headers, timeout=30).json()
    pdf = next((d["id"] for d in (lib.get("items") or lib.get("documents") or []) if (d.get("mime") or "").endswith("pdf")), None)
    if pdf:
        C("library", "course member downloads a PDF", s1, "GET", f"/api/community/library/{pdf}/download")
        C("library", "download with ?token= (link in a new tab)", None, "GET",
          f"/api/community/library/{pdf}/download?token={s1.token}")
    C("library", "student cannot publish into the course library", s1, "POST", "/api/community/library", 403,
      data={"scope": "course", "course_id": str(cid), "content": "ทดสอบสิทธิ์"})
    C("library", "knowledge list for the ask page", s1, "GET", "/api/community/knowledge")

    # ---------------------------------------------------------------- feed / posts / comments
    r = C("feed", "student posts a summary to the course", s1, "POST", "/api/community/posts", 201,
          data={"type": "summary", "title": "สรุปสัปดาห์ที่ 1 (ทดสอบ 4.6)", "content": "HTML และ CSS เบื้องต้น", "course_id": str(cid),
                "visibility": "course", "tags": "it46"})
    post = require(rec, jid(r, "post"), "feed", "the new post")
    if post:
        cleanup.append((s1, f"/api/community/posts/{post}"))
        C("feed", "course feed shows the post", s2, "GET", f"/api/community/posts?course_id={cid}")
        C("feed", "post detail", s2, "GET", f"/api/community/posts/{post}")
        C("feed", "author edits the post", s1, "PUT", f"/api/community/posts/{post}", json={"title": "สรุปสัปดาห์ที่ 1 (แก้ไข)"})
        C("feed", "another student cannot edit it", s2, "PUT", f"/api/community/posts/{post}", 403, json={"title": "x"})
        C("feed", "react: helpful", s2, "POST", f"/api/community/posts/{post}/reactions", json={"kind": "helpful"})
        rc = C("feed", "comment", s2, "POST", f"/api/community/posts/{post}/comments", 201, json={"content": "ขอบคุณสำหรับสรุป"})
        # The comment call answers with the whole thread; pick the comment just written.
        body = rc.json() if rc.ok else []
        mine = [c for c in (body.get("comments", []) if isinstance(body, dict) else body) if c.get("content") == "ขอบคุณสำหรับสรุป"]
        comment = require(rec, mine[-1]["id"] if mine else None, "feed", "the new comment")
        if comment:
            C("feed", "reply to a comment", s1, "POST", f"/api/community/posts/{post}/comments", 201,
              json={"content": "ยินดีครับ", "parent_id": comment})
        r = C("feed", "list comments (reply nested under its parent)", s1, "GET", f"/api/community/posts/{post}/comments")
        data = r.json() if r.ok else []
        thread = data.get("comments", []) if isinstance(data, dict) else data
        replies = [c for c in thread if c.get("parent_id") == comment]
        rec.calls[-1].ok = rec.calls[-1].ok and (comment is None or bool(replies))
        rec.calls[-1].note = f"replies under the comment: {len(replies)}"
        C("feed", "save the post", s2, "POST", f"/api/community/posts/{post}/save")
        C("feed", "saved collections", s2, "GET", "/api/community/saved-collections")
        C("feed", "share the post", s2, "POST", f"/api/community/posts/{post}/share")
    time.sleep(POST_COOLDOWN)
    r = C("feed", "student posts a private note", s2, "POST", "/api/community/posts", 201,
          data={"type": "summary", "title": "บันทึกส่วนตัว (ทดสอบ)", "content": "เห็นเฉพาะเจ้าของ", "visibility": "private"})
    private = require(rec, jid(r, "post"), "feed", "the private post")
    if private:
        cleanup.append((s2, f"/api/community/posts/{private}"))
        C("feed", "private post is hidden from others (404)", s1, "GET", f"/api/community/posts/{private}", 404)
        C("feed", "owner still sees the private post", s2, "GET", f"/api/community/posts/{private}")

    # ---------------------------------------------------------------- moderation
    if post:
        r = C("moderation", "student reports the post", s2, "POST", "/api/community/reports", 201,
              json={"target_type": "post", "target_id": post, "reason": "spam", "detail": "ทดสอบระบบรายงาน 4.6"})
        report = require(rec, r.json().get("report_id") if r.ok else None, "moderation", "the report")
        C("moderation", "the same person cannot report twice", s2, "POST", "/api/community/reports", 409,
          json={"target_type": "post", "target_id": post, "reason": "spam"})
        C("moderation", "my reports", s2, "GET", "/api/community/reports/mine")
        C("moderation", "room owner sees the room queue", teacher, "GET", f"/api/community/courses/{cid}/reports")
        C("moderation", "a student cannot see the room queue", s1, "GET", f"/api/community/courses/{cid}/reports", 403)
        if report:
            C("moderation", "room owner hides the post", teacher, "POST", f"/api/community/courses/{cid}/reports/{report}",
              json={"status": "actioned", "action": "hide_post", "note": "ทดสอบ 4.6"})
            C("moderation", "hidden post is gone for other students", s2, "GET", f"/api/community/posts/{post}", 404)
            r = C("moderation", "the room owner's action is in the audit log", admin, "GET", "/api/admin/audit?action=room.report")
            hits = [i for i in ((r.json().get("items") if r.ok else []) or []) if str(i.get("target_id")) == str(post)]
            rec.calls[-1].ok = rec.calls[-1].ok and bool(hits)
            rec.calls[-1].note = f"entries for this post: {len(hits)}"
        C("moderation", "admin report queue", admin, "GET", "/api/admin/reports")
        r = C("moderation", "admin audit log", admin, "GET", "/api/admin/audit")
        items = (r.json().get("items") if r.ok else []) or []
        rec.calls[-1].note = f"latest action: {items[0].get('action') if items else '-'}"
    s3_id = None
    try:
        s3_id = requests.post(f"{args.base}/api/users/login", json={"username": "it46.student3", "password": pw}, timeout=30).json()["user"]["id"]
    except Exception:
        pass
    if s3_id:
        until = time.strftime("%Y-%m-%d", time.localtime(time.time() + 3 * 86400))
        C("moderation", "admin suspends a student (reason + end date)", admin, "PATCH", f"/api/admin/users/{s3_id}",
          json={"disabled": True, "suspend_reason": "ทดสอบการระงับ 4.6", "suspended_until": until})
        C("moderation", "suspended student cannot sign in", None, "POST", "/api/users/login", 403,
          json={"username": "it46.student3", "password": pw})
        C("moderation", "admin lifts the suspension", admin, "PATCH", f"/api/admin/users/{s3_id}", json={"disabled": False})
        C("moderation", "student signs in again", None, "POST", "/api/users/login", 200,
          json={"username": "it46.student3", "password": pw})

    # ---------------------------------------------------------------- search / points / notifications
    for kind, q in [("posts", "สรุป"), ("courses", "IT46"), ("documents", "เกณฑ์การให้คะแนน"), ("users", "it46")]:
        C("search", f"advanced search: {kind}", s1, "GET", f"/api/community/search?q={q}&kind={kind}")
        time.sleep(1)
    C("points", "profile and balance", s1, "GET", "/api/community/me")
    C("points", "wallet history", s1, "GET", "/api/community/wallet")
    C("notifications", "notifications (reaction / comment)", s1, "GET", "/api/community/notifications")
    C("notifications", "mark all as read", s1, "POST", "/api/community/notifications/read", json={})

    # ---------------------------------------------------------------- KMITL RAG AI
    r = C("rag", "ask the course library", s1, "POST", "/api/community/ask",
          json={"question": "IT46 บันทึกการทดสอบการบูรณาการ มีรหัสตรวจสอบอะไร", "scope": "course", "course_id": cid, "web": "off"})
    if r.ok:
        rec.calls[-1].note = f"cites={len(r.json().get('citations') or [])} answer_has_code={'INTEG-4627' in (r.json().get('answer') or '')}"
        rec.calls[-1].ok = rec.calls[-1].ok and "INTEG-4627" in (r.json().get("answer") or "")
        conv = r.json().get("conversation_id")
        C("rag", "chat history list", s1, "GET", "/api/community/ask/history")
        if conv:
            C("rag", "open a conversation", s1, "GET", f"/api/community/ask/history/{conv}")
            C("rag", "delete the conversation", s1, "DELETE", f"/api/community/ask/history/{conv}")

    # ---------------------------------------------------------------- AI quiz (library -> post -> play)
    r = C("quiz", "teacher generates a quiz from the course library", teacher, "POST", "/api/community/study/quiz", timeout=300,
          json={"topic": "เกณฑ์คะแนนและข้อกำหนดของวิชา IT46-201", "question_count": 3, "language": "th", "scope": "course", "course_id": cid})
    quiz = r.json() if r.ok else {}
    if require(rec, quiz.get("session_id"), "quiz", "the quiz session"):
        rp = C("quiz", "teacher shares the quiz to the course feed", teacher, "POST", "/api/community/posts", 201,
               data={"type": "quiz", "title": "แบบทดสอบ IT46-201 (ทดสอบ 4.6)", "course_id": str(cid), "visibility": "course",
                     "embed_type": "quiz", "embed_id": quiz["session_id"]})
        qpost = require(rec, jid(rp, "post"), "quiz", "the quiz post")
        if qpost:
            cleanup.append((teacher, f"/api/community/posts/{qpost}"))
            st = C("quiz", "student starts the quiz", s1, "POST", f"/api/community/posts/{qpost}/quiz/start")
            play = st.json() if st.ok else {}
            questions = play.get("questions") or quiz.get("questions") or []
            answers = {q["id"]: q.get("correct_answer") or (q.get("options") or [{}])[0].get("text") for q in quiz.get("questions", [])}
            sub = C("quiz", "student submits answers (graded by the server)", s1, "POST", f"/api/community/posts/{qpost}/quiz/submit",
                    json={"play_id": play.get("play_id"), "answers": answers})
            if sub.ok:
                rec.calls[-1].note = f"score={sub.json().get('score')}/{sub.json().get('total')} questions={len(questions)}"
        time.sleep(POST_COOLDOWN)

    # ---------------------------------------------------------------- AI roadmap (+ the separate roadmap app)
    r = C("roadmap", "teacher generates a roadmap from the course library", teacher, "POST", "/api/community/study/roadmap", timeout=600,
          json={"description": "ทบทวนเนื้อหาครึ่งแรกของวิชา IT46-201", "language": "th", "scope": "course", "course_id": cid,
                "web": "off", "node_count": 5})
    rm = r.json() if r.ok else {}
    sid = require(rec, rm.get("session_id"), "roadmap", "the roadmap session")
    if sid:
        rec.calls[-1].note = f"nodes={len(rm.get('nodes') or [])}"
        C("roadmap", "my roadmaps", teacher, "GET", "/api/community/roadmaps/mine")
        C("roadmap", "roadmap detail", teacher, "GET", f"/api/community/roadmaps/mine/{sid}")
        rp = C("roadmap", "share the roadmap to the feed", teacher, "POST", "/api/community/posts", 201,
               data={"type": "roadmap", "title": "แผนทบทวน IT46-201 (ทดสอบ 4.6)", "course_id": str(cid), "visibility": "course",
                     "embed_type": "roadmap", "embed_id": sid})
        rpost = require(rec, jid(rp, "post"), "roadmap", "the roadmap post")
        if rpost:
            cleanup.append((teacher, f"/api/community/posts/{rpost}"))
            C("roadmap", "student reads the roadmap post", s1, "GET", f"/api/community/posts/{rpost}")
        ext = f"{roadmap_app}/roadmap/api/ws"
        for step, path, sess, expect in [("roadmap app page", None, None, 200),
                                         ("roadmap app proxy: my roadmaps", "community/roadmaps/mine", teacher, 200),
                                         ("roadmap app proxy: who am I", "community/me", s1, 200),
                                         ("roadmap app proxy blocks non-allowlisted paths", "admin/overview", admin, 404)]:
            t0 = time.perf_counter()
            if path is None:
                resp = requests.get(f"{roadmap_app}/roadmap", timeout=60)
            else:
                resp = requests.get(f"{ext}/{path}", headers=sess.headers, timeout=60)
            rec.calls.append(type(rec.calls[0])("external-apps", step, "GET", f"/roadmap/api/ws/{path or ''}", sess.role if sess else "anonymous",
                                                [expect], resp.status_code, round((time.perf_counter() - t0) * 1000, 1), resp.status_code == expect))
            print(f"{'PASS' if resp.status_code == expect else 'FAIL'} {resp.status_code} [external-apps] {step}")
        C("roadmap", "owner deletes the roadmap", teacher, "DELETE", f"/api/community/roadmaps/mine/{sid}")
        if rpost:
            C("roadmap", "the shared post keeps its copy of the plan", s1, "GET", f"/api/community/posts/{rpost}")

    # The quiz app: its page and the bridge to the SIET API (the solo generator itself calls OpenRouter).
    for step, url, headers, expect in [("quiz app page", f"{quiz_app}/quiz", {}, 200),
                                       ("quiz app bridge /quiz/api/me -> /api/users/me", f"{quiz_app}/quiz/api/me", s1.headers, 200)]:
        t0 = time.perf_counter()
        resp = requests.get(url, headers=headers, timeout=60)
        rec.calls.append(type(rec.calls[0])("external-apps", step, "GET", url.replace(quiz_app, ""), "student" if headers else "anonymous",
                                            [expect], resp.status_code, round((time.perf_counter() - t0) * 1000, 1), resp.status_code == expect))
        print(f"{'PASS' if resp.status_code == expect else 'FAIL'} {resp.status_code} [external-apps] {step}")

    # ---------------------------------------------------------------- Open Notebook core (staff workspace)
    r = C("notebooks", "teacher creates a notebook", teacher, "POST", "/api/notebooks", [200, 201],
          json={"name": "IT46 สมุดทดสอบ 4.6", "description": "integration test"})
    nb = require(rec, jid(r), "notebooks", "the notebook")
    if nb:
        rs = C("notebooks", "add a text source", teacher, "POST", "/api/sources", [200, 201],
               data={"type": "text", "notebook_id": nb, "title": "IT46 source", "content": "Integration test source for section 4.6.",
                     "embed": "false", "async_processing": "false"})
        src = require(rec, jid(rs), "notebooks", "the source")
        rn = C("notebooks", "add a note", teacher, "POST", "/api/notes", [200, 201],
               json={"title": "IT46 note", "content": "integration note", "note_type": "human", "notebook_id": nb})
        note = require(rec, jid(rn), "notebooks", "the note")
        C("notebooks", "notebook detail", teacher, "GET", f"/api/notebooks/{nb}")
        C("notebooks", "notebook sources", teacher, "GET", f"/api/sources?notebook_id={nb}")
        C("notebooks", "notebook notes", teacher, "GET", f"/api/notes?notebook_id={nb}")
        C("notebooks", "text search", teacher, "POST", "/api/search", json={"query": "Integration", "type": "text", "limit": 5})
        C("notebooks", "chat sessions of the notebook", teacher, "GET", f"/api/chat/sessions?notebook_id={nb}")
        if note:
            C("notebooks", "delete the note", teacher, "DELETE", f"/api/notes/{note}")
        if src:
            C("notebooks", "delete the source", teacher, "DELETE", f"/api/sources/{src}")
        C("notebooks", "delete the notebook", teacher, "DELETE", f"/api/notebooks/{nb}")

    # ---------------------------------------------------------------- admin console
    for step, path in [("overview", "/api/admin/overview"), ("users", "/api/admin/users?q=it46"), ("usage", "/api/admin/usage?days=7"),
                       ("health", "/api/admin/health"), ("LLM throttle", "/api/admin/llm-throttle"), ("points log", "/api/admin/points/log"),
                       ("community stats", "/api/admin/community/stats"), ("rooms", "/api/admin/courses"),
                       ("categories", "/api/admin/categories"), ("posts", "/api/admin/posts"), ("comments", "/api/admin/comments"),
                       ("RAG stats", "/api/admin/rag/stats?days=7"), ("RAG documents", "/api/admin/rag/documents"),
                       ("roadmaps", "/api/admin/roadmaps"), ("quizzes", "/api/admin/quizzes"),
                       ("models", "/api/models"), ("default models", "/api/models/defaults"), ("credentials", "/api/credentials"),
                       ("settings", "/api/settings")]:
        C("admin", step, admin, "GET", path)
    r = C("admin", "create a category", admin, "POST", "/api/admin/categories", 201, json={"name": f"หมวดทดสอบ 4.6 {int(time.time()) % 1000}"})
    cat = require(rec, jid(r, "category"), "admin", "the category")
    if cat:
        C("admin", "rename the category", admin, "PATCH", f"/api/admin/categories/{cat}", json={"name": "หมวดทดสอบ 4.6 (แก้ไข)"})
        C("admin", "delete the category", admin, "DELETE", f"/api/admin/categories/{cat}")

    # ---------------------------------------------------------------- clean up
    for sess, path in cleanup:
        requests.delete(f"{args.base}{path}", headers=sess.headers, timeout=60)
    if doc:
        requests.delete(f"{args.base}/api/community/library/{doc}", headers=teacher.headers, timeout=60)
    if room:
        requests.delete(f"{args.base}/api/community/courses/{room}", headers=admin.headers, timeout=60)
    for uid in mock_ids:
        if uid:
            requests.delete(f"{args.base}/api/admin/users/{uid}", headers=admin.headers, timeout=60)

    summary = defaultdict(lambda: {"steps": 0, "passed": 0, "ms": []})
    for c in rec.calls:
        summary[c.module]["steps"] += 1
        summary[c.module]["passed"] += int(c.ok)
        summary[c.module]["ms"].append(c.ms)
    table = {m: {"steps": v["steps"], "passed": v["passed"], "failed": v["steps"] - v["passed"],
                 "ms_median": round(statistics.median(v["ms"]), 1), "ms_max": round(max(v["ms"]), 1)} for m, v in summary.items()}
    total = {"steps": len(rec.calls), "passed": sum(c.ok for c in rec.calls)}
    rec.dump(os.path.join(HERE, "results", "integration_test.json"),
             {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "summary": table, "total": total})
    print(json.dumps(table, ensure_ascii=False, indent=1))
    print("TOTAL", total)
    for c in rec.calls:
        if not c.ok:
            print("FAILED:", c.module, c.step, c.method, c.path, c.status, c.note[:160])


if __name__ == "__main__":
    main()
