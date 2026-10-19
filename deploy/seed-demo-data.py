#!/usr/bin/env python3
"""
Seed a demo dataset into the RUNNING stack through the public API.

Everything goes through the same endpoints the UI uses, so welcome points,
post/like/share bonuses, notifications and the RAG knowledge library are
produced exactly as they would be for real users.

  python3 deploy/seed-demo-data.py            # create (safe to re-run)
  python3 deploy/seed-demo-data.py --remove   # delete everything it created

Accounts are recognised by the ``demo.`` username prefix and courses by the
``DEMO`` code prefix. Re-running skips what already exists: posts are matched
by title per author, and reactions/comments/shares are only added to posts
created in that same run (reactions toggle, so repeating them would undo them).

Admin credentials: ADMIN_USERNAME / ADMIN_PASSWORD env vars, else
WORKSPACE_SEED_ADMIN_USERNAME / WORKSPACE_SEED_ADMIN_PASSWORD from ../.env.
API base: API_BASE env var (default http://localhost:5055).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = os.environ.get("API_BASE", "http://localhost:5055").rstrip("/")
DEMO_PASSWORD = "Demo@2026"

TEACHERS = [
    ("demo.teacher1", "อ.ธนากร วงศ์สวัสดิ์"),
    ("demo.teacher2", "อ.พิมพ์ชนก ศรีสุข"),
]
STUDENTS = [
    ("demo.student1", "กานต์ ชัยมงคล", "69990001"),
    ("demo.student2", "ณัฐธิดา แก้วประเสริฐ", "69990002"),
    ("demo.student3", "ภูมิ รุ่งเรือง", "69990003"),
    ("demo.student4", "ปาริชาติ บุญมา", "69990004"),
    ("demo.student5", "ธีรเดช อินทร์แก้ว", "69990005"),
    ("demo.student6", "วริศรา ทองดี", "69990006"),
]

COURSES = [
    {
        "code": "DEMO101",
        "name": "การเขียนโปรแกรมคอมพิวเตอร์",
        "description": "ห้องวิชาตัวอย่าง (ข้อมูลทดสอบ) – ตัวแปร เงื่อนไข ลูป ฟังก์ชัน",
        "owner": "demo.teacher1",
        "members": ["demo.student1", "demo.student2", "demo.student3",
                    "demo.student4", "demo.student5", "demo.student6"],
        "document": {
            "title": "เอกสารประกอบการสอน DEMO101 บทที่ 1–3: ตัวแปร เงื่อนไข และลูป",
            "content": """บทที่ 1 ตัวแปรและชนิดข้อมูล
ตัวแปร (variable) คือชื่อที่ใช้อ้างถึงค่าที่เก็บในหน่วยความจำ ในภาษา Python ไม่ต้องประกาศชนิดข้อมูลล่วงหน้า ชนิดข้อมูลพื้นฐานได้แก่ int (จำนวนเต็ม), float (ทศนิยม), str (ข้อความ) และ bool (True/False) ใช้ฟังก์ชัน type() เพื่อตรวจสอบชนิดของค่า และแปลงชนิดด้วย int(), float(), str()

บทที่ 2 คำสั่งเงื่อนไข
คำสั่ง if ใช้ตัดสินใจตามเงื่อนไข รูปแบบคือ if เงื่อนไข: ... elif เงื่อนไขอื่น: ... else: ... โปรแกรมจะตรวจเงื่อนไขจากบนลงล่างและทำงานเฉพาะบล็อกแรกที่เงื่อนไขเป็นจริง ตัวดำเนินการเปรียบเทียบได้แก่ ==, !=, <, >, <=, >= และตัวดำเนินการตรรกะ and, or, not
ตัวอย่าง: คะแนน 80 ขึ้นไปได้เกรด A, 70–79 ได้ B, 60–69 ได้ C, ต่ำกว่า 60 ได้ F

บทที่ 3 การวนซ้ำ
for ใช้เมื่อรู้จำนวนรอบหรือต้องการวนตามสมาชิกของลำดับ เช่น for i in range(5) จะวน 5 รอบ (i = 0 ถึง 4) ส่วน while ใช้เมื่อวนไปเรื่อย ๆ จนกว่าเงื่อนไขจะเป็นเท็จ ต้องระวังลูปไม่รู้จบ (infinite loop) โดยต้องมีการเปลี่ยนค่าตัวแปรที่ใช้ในเงื่อนไขทุกรอบ คำสั่ง break ใช้ออกจากลูปทันที และ continue ใช้ข้ามไปรอบถัดไป

เกณฑ์การให้คะแนนรายวิชา: สอบย่อย 20% งานมอบหมาย 30% สอบกลางภาค 20% สอบปลายภาค 30%
สอบย่อยครั้งที่ 1 ครอบคลุมบทที่ 1–3""",
        },
    },
    {
        "code": "DEMO202",
        "name": "ระบบฐานข้อมูล",
        "description": "ห้องวิชาตัวอย่าง (ข้อมูลทดสอบ) – ER Diagram, SQL, Normalization",
        "owner": "demo.teacher2",
        "members": ["demo.student1", "demo.student2", "demo.student3", "demo.student4"],
        "document": {
            "title": "เอกสารประกอบการสอน DEMO202: การออกแบบฐานข้อมูลและ Normalization",
            "content": """1. แนวคิดฐานข้อมูลเชิงสัมพันธ์
ฐานข้อมูลเชิงสัมพันธ์เก็บข้อมูลเป็นตาราง (relation) แต่ละแถวคือระเบียน (tuple) แต่ละคอลัมน์คือแอตทริบิวต์ Primary Key คือคอลัมน์ที่ระบุแต่ละแถวได้ไม่ซ้ำและห้ามเป็น NULL ส่วน Foreign Key คือคอลัมน์ที่อ้างอิง Primary Key ของอีกตาราง เพื่อรักษาความถูกต้องของความสัมพันธ์ (referential integrity)

2. ER Diagram
ประกอบด้วย Entity (สี่เหลี่ยม), Attribute (วงรี) และ Relationship (สี่เหลี่ยมข้าวหลามตัด) ความสัมพันธ์มี 3 แบบ คือ 1:1, 1:N และ M:N โดยความสัมพันธ์แบบ M:N ต้องแตกเป็นตารางกลาง (associative table) เมื่อแปลงเป็นตาราง

3. Normalization
1NF: ทุกคอลัมน์ต้องเก็บค่าเดี่ยว (atomic) ไม่มีกลุ่มข้อมูลซ้ำ
2NF: อยู่ใน 1NF และแอตทริบิวต์ที่ไม่ใช่คีย์ต้องขึ้นกับคีย์หลักทั้งหมด ไม่ใช่เพียงบางส่วน (ไม่มี partial dependency)
3NF: อยู่ใน 2NF และไม่มี transitive dependency คือแอตทริบิวต์ที่ไม่ใช่คีย์ต้องไม่ขึ้นกับแอตทริบิวต์ที่ไม่ใช่คีย์ด้วยกัน

4. คำสั่ง SQL พื้นฐาน
SELECT ... FROM ... WHERE ... ใช้ดึงข้อมูล, JOIN ใช้รวมตารางตามคีย์ที่สัมพันธ์กัน, GROUP BY ใช้จัดกลุ่มร่วมกับฟังก์ชัน COUNT, SUM, AVG และ HAVING ใช้กรองผลหลังจัดกลุ่ม

สอบกลางภาคครอบคลุมหัวข้อ 1–3 สอบปลายภาคครอบคลุมทุกหัวข้อ""",
        },
    },
]

# Posts plus the reactions/comments/shares they receive. "course" is a code.
POSTS = [
    {
        "author": "demo.teacher1", "course": "DEMO101", "type": "material",
        "title": "ประกาศ: สอบย่อยครั้งที่ 1 สัปดาห์หน้า",
        "content": "สอบย่อยครั้งที่ 1 วันพุธหน้า เวลา 09:00–09:30 ในห้องเรียน ครอบคลุมบทที่ 1–3 "
                   "(ตัวแปร เงื่อนไข ลูป) ทบทวนจากเอกสารประกอบการสอนในคลังความรู้ของรายวิชาได้เลยครับ",
        "tags": "ประกาศ สอบย่อย",
        "like": ["demo.student1", "demo.student2", "demo.student3", "demo.student4"],
        "helpful": [],
        "comments": [("demo.student2", "รับทราบครับอาจารย์ 🙏")],
        "shares": [],
    },
    {
        "author": "demo.student1", "course": "DEMO101", "type": "summary",
        "title": "สรุปบทที่ 2: if / elif / else",
        "content": "สรุปสั้น ๆ ครับ\n"
                   "1) if ตรวจเงื่อนไขแรก ถ้าจริงทำบล็อกนั้นแล้วจบ\n"
                   "2) elif ตรวจต่อเมื่อเงื่อนไขก่อนหน้าเป็นเท็จ มีได้หลายอัน\n"
                   "3) else ทำเมื่อทุกเงื่อนไขเป็นเท็จ\n"
                   "ตัวอย่างตัดเกรด: >=80 A, >=70 B, >=60 C, นอกนั้น F — ต้องเรียงจากมากไปน้อย "
                   "ไม่งั้น 85 จะตกไปที่เงื่อนไข >=60 ก่อน",
        "tags": "สรุป บทที่2",
        "like": ["demo.student2", "demo.student3", "demo.student4"],
        "helpful": ["demo.student5", "demo.teacher1"],
        "comments": [
            ("demo.student2", "ขอบคุณครับ สรุปเข้าใจง่ายมาก"),
            ("demo.teacher1", "สรุปถูกต้องครับ จุดที่เน้นเรื่องลำดับเงื่อนไขสำคัญมาก ออกสอบแน่นอน"),
        ],
        "shares": ["demo.student3", "demo.student6"],
    },
    {
        "author": "demo.student2", "course": "DEMO101", "type": "question",
        "title": "for กับ while ต่างกันยังไง ควรใช้ตอนไหน",
        "content": "อ่านเอกสารแล้วยังงงอยู่ว่าโจทย์แบบไหนควรใช้ for แบบไหนควรใช้ while ครับ มีหลักจำง่าย ๆ ไหม",
        "tags": "คำถาม ลูป",
        "like": ["demo.student1"],
        "helpful": [],
        "comments": [
            ("demo.student1", "ผมจำว่า รู้จำนวนรอบใช้ for / วนจนกว่าเงื่อนไขจะเปลี่ยนใช้ while ครับ"),
            ("demo.teacher1", "ถูกต้องครับ เช่น วนอ่านรายชื่อนักศึกษาใช้ for ส่วนรับค่าจนกว่าผู้ใช้จะพิมพ์ q ใช้ while"),
        ],
        "shares": [],
    },
    {
        "author": "demo.student3", "course": "DEMO202", "type": "summary",
        "title": "สรุป Normalization 1NF–3NF แบบจำง่าย",
        "content": "1NF = ช่องละค่าเดียว ไม่มีข้อมูลซ้ำเป็นกลุ่ม\n"
                   "2NF = ทุกคอลัมน์ต้องขึ้นกับคีย์หลัก 'ทั้งก้อน' (ระวังตารางที่ใช้คีย์ผสม)\n"
                   "3NF = คอลัมน์ธรรมดาห้ามขึ้นกับคอลัมน์ธรรมดาด้วยกัน เช่น รหัสไปรษณีย์ → จังหวัด ควรแยกตาราง\n"
                   "ท่องว่า: the key, the whole key, and nothing but the key",
        "tags": "สรุป normalization",
        "like": ["demo.student1", "demo.student2"],
        "helpful": ["demo.student4"],
        "comments": [("demo.teacher2", "สรุปดีมากค่ะ ตัวอย่างรหัสไปรษณีย์ชัดเจน")],
        "shares": ["demo.student4"],
    },
    {
        "author": "demo.student4", "course": "DEMO202", "type": "question",
        "title": "Primary Key กับ Foreign Key ต่างกันอย่างไร",
        "content": "ถ้าตาราง enrollment มีทั้ง student_id และ course_id ตัวไหนเป็น Primary Key ตัวไหนเป็น Foreign Key คะ",
        "tags": "คำถาม sql",
        "like": ["demo.student3"],
        "helpful": [],
        "comments": [
            ("demo.student3", "สองคอลัมน์นั้นเป็น Foreign Key ทั้งคู่ และรวมกันเป็น Primary Key แบบคีย์ผสมได้ครับ"),
            ("demo.teacher2", "ถูกต้องค่ะ เป็นตารางกลางของความสัมพันธ์ M:N ระหว่าง student กับ course"),
        ],
        "shares": [],
    },
    {
        "author": "demo.teacher2", "course": "DEMO202", "type": "material",
        "title": "แนวข้อสอบกลางภาค DEMO202",
        "content": "แนวข้อสอบกลางภาค: (1) วาด ER Diagram จากโจทย์ระบบลงทะเบียนเรียน "
                   "(2) แปลง ER เป็นตาราง (3) ทำ Normalization ถึง 3NF (4) เขียน SQL แบบ JOIN และ GROUP BY",
        "tags": "ประกาศ กลางภาค",
        "like": ["demo.student3", "demo.student4"],
        "helpful": ["demo.student1"],
        "comments": [],
        "shares": [],
    },
    {
        "author": "demo.student5", "course": None, "type": "question",
        "title": "แนะนำเว็บฝึกเขียน SQL ฟรีหน่อยครับ",
        "content": "อยากฝึก SQL เพิ่มก่อนสอบ มีเว็บไหนที่มีโจทย์ให้ลองรันได้เลยบ้างครับ",
        "tags": "คำถาม sql",
        "like": [],
        "helpful": [],
        "comments": [("demo.student6", "ลอง SQLBolt กับ LeetCode หมวด Database ดูค่ะ มีโจทย์ไล่ระดับ")],
        "shares": [],
    },
]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _multipart(fields):
    boundary = uuid.uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'
        for k, v in fields.items()
        if v is not None
    ]
    body = ("".join(parts) + f"--{boundary}--\r\n").encode("utf-8")
    return body, f"multipart/form-data; boundary={boundary}"


def call(method, path, token=None, body=None, form=None, ok=(200, 201)):
    """Send one request, waiting out 429 cooldowns. Returns (status, payload)."""
    for _ in range(6):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        data = None
        if form is not None:
            data, headers["Content-Type"] = _multipart(form)
        elif body is not None:
            data, headers["Content-Type"] = json.dumps(body).encode(), "application/json"
        req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw, status = r.read(), r.status
        except urllib.error.HTTPError as e:
            raw, status = e.read(), e.code
            if status == 429:
                wait = min(int(e.headers.get("retry-after") or 5), 120) + 1
                print(f"    … rate limited, waiting {wait}s")
                time.sleep(wait)
                continue
        try:
            payload = json.loads(raw) if raw else None
        except ValueError:
            payload = raw.decode("utf-8", "replace")[:300]
        if status not in ok:
            raise RuntimeError(f"{method} {path} -> {status}: {str(payload)[:300]}")
        return status, payload
    raise RuntimeError(f"{method} {path}: still rate limited after several waits")


def login(username, password):
    return call("POST", "/api/users/login", body={"username": username, "password": password})[1]["access_token"]


def admin_credentials():
    user, password = os.environ.get("ADMIN_USERNAME"), os.environ.get("ADMIN_PASSWORD")
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if (not user or not password) and env_file.exists():
        values = {}
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip().strip("'\"")
        user = user or values.get("WORKSPACE_SEED_ADMIN_USERNAME")
        password = password or values.get("WORKSPACE_SEED_ADMIN_PASSWORD")
    if not user or not password:
        sys.exit("Set ADMIN_USERNAME / ADMIN_PASSWORD (or WORKSPACE_SEED_ADMIN_* in .env)")
    return user, password


def find_course(token, code):
    return next((c for c in call("GET", "/api/community/courses", token)[1] if c.get("code") == code), None)


def demo_users(admin):
    items = call("GET", "/api/admin/users?q=demo.&limit=200", admin)[1]["items"]
    return [u for u in items if str(u.get("username", "")).startswith("demo.")]


# ---------------------------------------------------------------------------
# Seed / remove
# ---------------------------------------------------------------------------


def seed(admin):
    print("1) บัญชีผู้ใช้")
    rows = ["username,password,display_name,role,student_id"]
    rows += [f"{u},{DEMO_PASSWORD},{name},teacher," for u, name in TEACHERS]
    rows += [f"{u},{DEMO_PASSWORD},{name},student,{sid}" for u, name, sid in STUDENTS]
    result = call("POST", "/api/admin/import/users", admin, body={"csv": "\n".join(rows)})[1]
    print(f"   สร้างใหม่ {len(result['created'])}, มีอยู่แล้ว {len(result['skipped'])}")
    for err in result["errors"]:
        print(f"   ✗ {err}")

    tokens, ids = {}, {}
    for username in [u for u, _ in TEACHERS] + [u for u, _, _ in STUDENTS]:
        tokens[username] = login(username, DEMO_PASSWORD)
        ids[username] = int(call("GET", "/api/community/me", tokens[username])[1]["user"]["id"])

    print("2) ห้องวิชา + สมาชิก + เอกสารในคลังความรู้")
    course_ids, pending_docs = {}, []
    for c in COURSES:
        owner = tokens[c["owner"]]
        course = find_course(owner, c["code"])
        if course is None:
            course = call("POST", "/api/community/courses", owner, body={
                "name": c["name"], "code": c["code"], "description": c["description"], "kind": "course",
            })[1]
            print(f"   + {c['code']} {c['name']}")
        else:
            print(f"   = {c['code']} มีอยู่แล้ว")
        course_ids[c["code"]] = int(course["id"])
        for username in [c["owner"]] + c["members"]:
            call("POST", f"/api/community/courses/{course['id']}/join", tokens[username])

        docs = call("GET", f"/api/community/library?scope=course&course_id={course['id']}", owner)[1]["items"]
        if any(d["title"] == c["document"]["title"] for d in docs):
            print(f"     = เอกสาร \"{c['document']['title'][:40]}…\" มีอยู่แล้ว")
            continue
        doc = call("POST", "/api/community/library", owner, form={
            "scope": "course", "course_id": course["id"],
            "title": c["document"]["title"], "content": c["document"]["content"],
        })[1]["document"]
        pending_docs.append((owner, doc["id"], c["document"]["title"]))
        print(f"     + เอกสาร \"{c['document']['title'][:40]}…\" (กำลังทำ embedding)")

    print("3) โพสต์ + ไลก์ + คอมเมนต์ + แชร์")
    for p in POSTS:
        author = tokens[p["author"]]
        mine = call("GET", f"/api/community/posts?author_id={ids[p['author']]}&limit=100", author)[1]
        mine = mine.get("items", []) if isinstance(mine, dict) else mine
        if any((m.get("title") or "") == p["title"] for m in mine):
            print(f"   = \"{p['title']}\" มีอยู่แล้ว (ข้ามการกดไลก์/คอมเมนต์ซ้ำ)")
            continue
        post = call("POST", "/api/community/posts", author, form={
            "type": p["type"], "title": p["title"], "content": p["content"], "tags": p["tags"],
            "course_id": course_ids.get(p["course"]) if p["course"] else None,
        })[1]["post"]
        pid = post["id"]
        for username in p["like"]:
            call("POST", f"/api/community/posts/{pid}/reactions", tokens[username], body={"kind": "like"})
        for username in p["helpful"]:
            call("POST", f"/api/community/posts/{pid}/reactions", tokens[username], body={"kind": "helpful"})
        for username, text in p["comments"]:
            call("POST", f"/api/community/posts/{pid}/comments", tokens[username], body={"content": text})
        for username in p["shares"]:
            call("POST", f"/api/community/posts/{pid}/share", tokens[username])
        print(f"   + \"{p['title']}\" ({len(p['like'])} ไลก์, {len(p['helpful'])} helpful, "
              f"{len(p['comments'])} คอมเมนต์, {len(p['shares'])} แชร์)")

    if pending_docs:
        print("4) รอ embedding เอกสาร (สูงสุด ~3 นาที)")
        for owner, doc_id, title in pending_docs:
            status = "processing"
            for _ in range(36):
                doc = call("GET", f"/api/community/library/{doc_id}", owner)[1]
                status = doc.get("status")
                if status != "processing":
                    break
                time.sleep(5)
            extra = f", {doc.get('chunks')} chunks" if status == "ready" else f" – {doc.get('error')}"
            print(f"   {'✓' if status == 'ready' else '✗'} {title[:45]}… : {status}{extra}")

    print("\nสรุปบัญชีทดสอบ (รหัสผ่านทุกบัญชี: " + DEMO_PASSWORD + ")")
    for username in tokens:
        wallet = call("GET", "/api/community/wallet", tokens[username])[1]
        balance = "ไม่จำกัด (อาจารย์)" if wallet["exempt"] else wallet["balance"]
        print(f"   {username:<15} แต้ม {balance}")


def remove(admin):
    users = demo_users(admin)
    for c in COURSES:
        course = find_course(admin, c["code"])
        if course is None:
            continue
        docs = call("GET", f"/api/community/library?scope=course&course_id={course['id']}", admin)[1]["items"]
        for d in docs:
            call("DELETE", f"/api/community/library/{d['id']}", admin)
        call("DELETE", f"/api/community/courses/{course['id']}", admin)
        print(f"   - {c['code']} (+ เอกสาร {len(docs)} ฉบับ)")
    if users:
        result = call("POST", "/api/admin/users/bulk-delete", admin, body={"ids": [int(u["id"]) for u in users]})[1]
        print(f"   - ลบบัญชี demo.* {len(result['deleted'])} บัญชี, ข้าม {len(result['skipped'])}")
    else:
        print("   ไม่มีบัญชี demo.* เหลืออยู่")


if __name__ == "__main__":
    admin = login(*admin_credentials())
    if "--remove" in sys.argv:
        remove(admin)
    else:
        seed(admin)
