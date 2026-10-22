# 05 — Backend: `/api/admin/*` และ query เบื้องหลัง

> ทุก endpoint ที่หน้า admin ใช้ พร้อมพารามิเตอร์ รูปร่าง response ฟังก์ชันที่รองรับ และตารางที่แตะ
> ไฟล์: `open-notebook/api/routers/admin.py` (router), `open_notebook/community/repository.py`,
> `open_notebook/community/library.py`, `open_notebook/domain/features.py`

## 1. กติกาที่ใช้กับทุก route

- Router ประกาศ `APIRouter(prefix="/admin", tags=["admin"])` และถูก mount ใต้ `/api` → URL จริงคือ `/api/admin/...`
- สองชั้นกัน: middleware (`api/auth_roles.py`, `/api/admin` อยู่ใน `ADMIN_PREFIXES`) + `_require_admin(user)`
  ในทุก handler (403 "ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น", 401 ถ้าไม่มี id)
- ข้อความ error เป็นภาษาไทยใน `detail` — frontend แสดงตรง ๆ ผ่าน `toastApiError`
- รายการทุกตัวคืน `{ items, total, offset }`; `limit` 1–200 default 50; `offset ≥ 0`
- MariaDB เก็บ `DATETIME` เป็น naive UTC; SurrealDB (`quiz_session`, `roadmap_session`) เก็บ datetime มีโซน
- ชื่อคอลัมน์ในฐานข้อมูลถูก rename ไปแล้ว (`rooms`, `room_id`, `linked_type/linked_id/linked_snapshot`,
  `quiz_attempts.question_count`, `rag_messages.answer_meta`, `roadmap_follow_count`, `quiz_play_count`)
  แต่ API ยังตอบ key เดิม (`course`, `embed_*`, `follow_count`, `play_count`) — ดู `_POST_COLUMNS` ใน repository

## 2. หน้าต่างเวลาของผู้ดู (`days` + `tz_offset`)

endpoint สถิติ (`/roadmaps/stats`, `/quizzes/stats`, `/community/stats`, `/rag/stats`) รับ

| param | ช่วง | ความหมาย |
|---|---|---|
| `days` | 1–180, default 30 | จำนวนวันปฏิทินย้อนหลัง **รวมวันนี้** |
| `tz_offset` | −840…840, default 0 | นาทีที่ผู้ดูอยู่ทางตะวันออกของ UTC (กรุงเทพ = 420); browser ส่ง `-getTimezoneOffset()` |

```python
def _viewer_window(days, tz_offset) -> (since_utc: datetime, viewer_zone: timezone)
# since = เที่ยงคืนของผู้ดูเมื่อ (days-1) วันก่อน แปลงเป็น UTC
def _viewer_day(created, viewer_zone) -> 'YYYY-MM-DD' | None   # สำหรับแถวจาก SurrealDB (naive = UTC)
```

ฝั่ง SQL ตัดวันด้วย `DATE(DATE_ADD(created_at, INTERVAL :tz MINUTE))` และ bound `since` ต้องเป็น naive UTC
(`repository._naive_utc`). ถ้าไม่ทำแบบนี้ คำถามเวลา 00:30 ที่กรุงเทพจะไปนับเป็นวันก่อนหน้า

> `/usage` (ค่าใช้จ่าย AI) ใช้คนละกลไก: `USAGE_TZ_OFFSET_HOURS` (env, default 7) ฝั่งเซิร์ฟเวอร์

## 3. Endpoint ทั้งหมด

### 3.1 ภาพรวม/สุขภาพ (เดิม)

| route | คืน |
|---|---|
| `GET /overview` | `{ users, suspended, active_week, posts, courses, documents, points_outstanding, points_spent_week }` |
| `GET /health` | `{ checks: [{name, label, ok, detail}], healthy, content: { failed_documents, processing_documents, deleted_posts, ownerless_rooms } }` — probe MariaDB, SurrealDB, Redis, default models |
| `GET /usage?days=` | tokens/ค่าใช้จ่ายจาก `llm_usage`: `today, month, window, all_time, by_day, by_feature, by_model, top_users, search, pricing, note` |
| `GET /llm-throttle` | snapshot ของ provider gate + `per_user_ask_policy { cooldown_seconds, per_minute, per_hour, per_day, staff_multiplier }` |

### 3.2 บัญชี (เดิม)

| route | body/params | หมายเหตุ |
|---|---|---|
| `GET /users` | `q`(≤100), `role`, `limit`, `offset` | เพิ่ม `me` = id ของ admin ที่เรียก |
| `GET /users/{id}` | | `{ user, points_history }` |
| `PATCH /users/{id}` | `UserUpdate { role?, display_name?, student_id?, disabled? }` | กันเปลี่ยนสิทธิ์/ระงับตัวเอง, กันลดสิทธิ์หรือระงับ admin คนสุดท้าย (`count_admins`) |
| `POST /users/{id}/points` | `PointsAdjust { delta ±10000, note? }` | เขียน `point_transactions` kind `admin_grant`/`admin_deduct` |
| `POST /users/{id}/reset-password` | `{ password ≥6 }` | ตั้งรหัสใหม่แล้วล้างตัวนับล็อกอินผิด (`clear_login_failures`) |
| `POST /users` (201) | `UserCreate { username, password, display_name?, role, student_id? }` | นักศึกษาได้แต้มต้อนรับ |
| `DELETE /users/{id}` / `POST /users/bulk-delete { ids ≤200 }` | | `_guard_delete`: ห้ามลบตัวเอง/ห้ามลบ admin (ต้องลดสิทธิ์ก่อน) |

### 3.3 โพสต์และห้อง (เดิม)

| route | params | หมายเหตุ |
|---|---|---|
| `GET /posts` | `q`, `type` (regex 5 ชนิด), `course_id`, `author_id`, `state` visible/deleted/all, `limit`, `offset` | `repo.admin_list_posts` — ไม่ใช่ query ของฟีด (มี `is_deleted` และ excerpt 180 ตัว) |
| `DELETE /posts/{id}` / `POST /posts/{id}/restore` | | ธง `is_deleted`; ใช้ `repo.post_exists` เพื่อให้ restore โพสต์ที่ซ่อนอยู่ได้ |
| `GET /courses` | | `{ items, totals: { courses, clubs, empty, ownerless } }` จาก `repo.admin_list_courses` |
| `GET /points/log` | `user_id?`, `kind?`, `days` 1–90, `limit` ≤500 | `{ items, by_kind, top_spenders(10), days }` |
| `POST /import/courses`, `POST /import/users` | `CsvImport { csv ≤500k, dry_run }` | `_parse_csv` มี/ไม่มีหัวตารางก็ได้; รายวิชารับคอลัมน์เพิ่ม `category` (slug หรือชื่อหมวด) และ `term` (22 ต.ค.) |
| `GET /categories` | — | `{items: [{id, slug, name, name_en, sort_order, course_count, archived_count}], total}` (`repo.list_categories`) |
| `POST /categories` | `CategoryCreate {name, name_en?, slug?, sort_order}` | 201; `slug` จาก `_slugify(slug ‖ name_en ‖ name)`, ซ้ำ → 409 |
| `PATCH /categories/{id}` | `CategoryUpdate {name?, name_en?, sort_order?}` | 404 ถ้าไม่มี |
| `DELETE /categories/{id}` | — | `{ok, deleted, rooms_uncategorised}`; `rooms.category_id` ของห้องในหมวดถูกตั้งเป็น NULL (`repo.delete_category`) |
| `GET /courses` (เดิม) | — | แถวละห้องเพิ่ม `category_id/category_name/category_slug, term, status, archived, archived_at, requires_code, is_private` (`_ROOM_META_COLUMNS`) |
| `GET /posts` (เดิม) | — | แถวละโพสต์เพิ่ม `visibility` (public/course/private); ผู้ดูแลเห็นทุกโพสต์ไม่ว่าระดับใด (22 ต.ค.) |

### 3.4 AI Roadmap (เดิม, แก้เล็กน้อย)

| route | params | หมายเหตุ |
|---|---|---|
| `GET /roadmaps` | `q`, `origin` all/own/followed, `limit`, `offset` | `RoadmapSession.admin_list` (ไม่มี nodes) + `_session_owners` + `repo.roadmap_posts_by_session`; origin จาก `prompt_hash` ขึ้นต้น `follow:<post id>` |
| `DELETE /roadmaps/{session_id}` | ต้องขึ้นต้น `roadmap_session:` | ลบ record SurrealDB; โพสต์ที่แชร์ไว้เก็บสำเนาใน `linked_snapshot` จึงไม่หาย |
| `GET /roadmaps/shared` | `state`, `limit`, `offset` | `repo.admin_roadmap_posts` เรียงตาม `roadmap_follow_count` |
| `GET /roadmaps/stats` | `days`, `tz_offset` | `{ days, total, generated, followed, per_day, grounding{library, library_web, web, none}, points_spent, expansions, shared_posts, follows, top_followed(5) }` |

การ lookup เจ้าของที่เคย inline ใน `/roadmaps` ย้ายเป็น `_session_owners(rows)` เพื่อใช้ร่วมกับ quiz

### 3.5 Quiz (ใหม่)

| route | params | หมายเหตุ |
|---|---|---|
| `GET /quizzes` | `q` (≤200, ค้นใน `topic` แบบ lowercase CONTAINS), `origin` all/own/imported, `limit`, `offset` | `QuizSession.admin_list` คืนเฉพาะ `id, owner_id, topic, language, question_count, prompt_hash, notebook_id, created_at` |
| `DELETE /quizzes/{session_id}` | ต้องขึ้นต้น `quiz_session:` มิฉะนั้น 404 | `QuizSession.get` → `delete()`; log ชื่อ admin + เจ้าของ |
| `GET /quizzes/shared` | `state`, `limit`, `offset` | `repo.admin_quiz_posts` |
| `GET /quizzes/stats` | `days`, `tz_offset` | ดูด้านล่าง |

รายการ `/quizzes` แต่ละ item:

```json
{ "id": "quiz_session:…", "topic": "…", "language": "th", "question_count": 3,
  "origin": "own" | "imported", "source_post_id": 345 | null,
  "owner": { "id", "username", "display_name", "role" } | null, "owner_id": "204",
  "from_library": false, "shared_post": { "post_id", "is_deleted", "play_count" } | null,
  "created_at": "2026-09-15T18:46:29.863312+00:00" }
```

- `_quiz_origin(prompt_hash)`: `import:<post id>` → `('imported', post_id)` (ควิซที่คัดลอกจากฟีดผ่าน
  `POST /community/posts/{id}/quiz/import`) ไม่เช่นนั้น `('own', None)`
- `from_library = bool(notebook_id)` — สร้างจากคลังความรู้ (study quiz) ไม่ใช่ความรู้ทั่วไปของโมเดล

`/quizzes/stats` คืน:

```json
{ "days": 30, "total": 85, "generated": 67, "imported": 18,
  "per_day": [{ "day": "2026-09-15", "count": 51 }], "grounding": { "library": 0, "none": 67 },
  "attempts": 0, "completed": 0, "players": 0, "avg_score_pct": null,
  "cashback_paid": 18, "shared_posts": 0, "plays": 0, "points_spent": 148,
  "top_played": [{ "id", "title", "author", "counts", "attempts", "question_count" }] }
```

- `generated`/`imported`/`per_day`/`grounding` นับใน Python จาก `QuizSession.created_since(since)`
  (SurrealDB) ด้วย `_viewer_day`; `total` จาก `admin_list(limit=1)["total"]`
- ส่วนที่เหลือจาก `repo.quiz_stats(since)` (MariaDB): `quiz_attempts` ในช่วง, `avg_score_pct` =
  `AVG(score/question_count)` เฉพาะ `completed=1 AND question_count>0` ปัดเป็น % เต็ม (`_pct`, `None` ถ้าไม่มี),
  `cashback_paid` = SUM `point_transactions.kind='cashback'`, `shared_posts`/`plays` จาก `posts.linked_type='quiz'`
  ที่ยังแสดง, `points_spent` = `_points_spent(('quiz_generate','quiz_import'))`

### 3.6 Community (ใหม่)

| route | params | หมายเหตุ |
|---|---|---|
| `GET /community/stats` | `days`, `tz_offset` | `repo.community_stats` |
| `GET /comments` | `q` (ค้นใน content / username / display_name), `limit`, `offset` | `repo.admin_list_comments` ใหม่สุดก่อน |
| `DELETE /comments/{id}` | | 404 ถ้าไม่มี; `repo.delete_comment` **ลบแถวจริง** และคำนวณ `posts.comment_count` ใหม่ (ไม่ใช่ลบ 1) — ต่างจาก route ในฟีดตรงที่เข้าถึงความคิดเห็นใต้โพสต์ที่ซ่อนอยู่ได้ |

`/community/stats` คืน:

```json
{ "days": 30, "posts": 12, "comments": 25, "reactions": 51, "shares": 60, "saves": 47, "room_joins": 37,
  "hidden_posts": 58, "contributors": 12,
  "per_day": [{ "day", "count" }], "by_type": { "summary": 4, "quiz": 0, "roadmap": 0, "question": 6, "material": 2 },
  "top_contributors": [{ "user": Person, "posts", "comments" }],   // 8 คน เรียง posts+comments
  "top_posts": [{ "id", "type", "title", "author": Person, "counts": { like, helpful, comment, share } }] }  // 5 โพสต์ที่ like+helpful+comment+share สูงสุด (>0)
```

- `posts`/`per_day`/`by_type`/`top_posts` นับเฉพาะ `is_deleted = 0` ในช่วง; `hidden_posts` นับทั้งตารางไม่สนช่วง
- `reactions` = แถวใน `post_reactions` (like + helpful), `shares` = `post_shares`, `saves` = `saved_posts`,
  `room_joins` = `room_members.joined_at` ในช่วง
- `contributors` = UNION ของ author ที่โพสต์หรือคอมเมนต์ในช่วง
- `by_type` เติมทุกชนิดใน `POST_TYPES` ให้ครบ (0 ถ้าไม่มี) เพื่อให้ `BarList` แสดงแถวครบเสมอ

`/comments` item: `{ id, content, created_at, author: Person, post: { id, title, type, is_deleted } }`

### 3.7 RAG AI (ใหม่)

| route | params | หมายเหตุ |
|---|---|---|
| `GET /rag/stats` | `days`, `tz_offset` | `repo.rag_stats` + เติม `usage.cost_thb`, `costs`, `policy` ใน router |
| `GET /rag/documents` | `q` (title/filename/owner username/room code), `status` processing/ready/failed, `scope` course/personal, `limit`, `offset` | `library.admin_list_documents` |
| `POST /rag/documents/{id}/retry` | | 404 ถ้าไม่มี; **400** ถ้า `kind == 'text'` (ข้อความที่วางไม่มีไฟล์ให้อ่านซ้ำ); ตั้ง `status='processing', error=NULL` แล้ว `BackgroundTasks` → `library.ingest_document` |
| `DELETE /rag/documents/{id}` | | `library.delete_document`: ลบ `source_embedding`, `Source` ใน SurrealDB, ไฟล์บนดิสก์, แถว `library_documents` — ไม่สนว่าใครเป็นเจ้าของ |

`/rag/stats` คืน:

```json
{ "days": 30, "questions": 3, "conversations": 3, "askers": 3, "per_day": [...],
  "answers": 3, "coverage": { "full": 2, "partial": 1, "none": 0, "unknown": 0 }, "web_used": 1, "cached": 0,
  "top_documents": [{ "id": "source:…", "title": "…", "count": 2 }],        // ≤8
  "top_askers": [{ "user": Person, "questions": 1 }],                       // ≤8
  "points_spent": 69,
  "usage": { "calls": 6, "tokens": 7858, "search_queries": 2, "cost_usd": 0.004581, "cost_thb": 0.16, "avg_latency_ms": 2690 },
  "library": { "ready": 2, "processing": 0, "failed": 0, "course": 2, "personal": 0, "chunks": 4 },
  "costs": { "question": 1, "session": 4, "session_messages": 5 },
  "policy": { "cooldown_seconds", "per_minute", "per_hour", "per_day", "staff_multiplier" } }
```

ที่มาของแต่ละส่วน (`repo.rag_stats`):

- `questions`/`conversations`/`askers`/`per_day`: `rag_messages` ที่ `role='user'` ในช่วง (join
  `rag_conversations` เพื่อหาผู้ถาม) → นับจาก**ประวัติแชตที่ยังอยู่** บทสนทนาที่ผู้ใช้ลบจะไม่ถูกนับ
- `answers`, `coverage`, `web_used`, `cached`, `top_documents`: `summarize_rag_answers(metas)` อ่าน
  `answer_meta` ของแถว `role='assistant'` ในช่วง (ล่าสุด ≤ `RAG_STATS_MAX_ANSWERS = 5000` แถว)
  - `coverage` จาก key `coverage` ∈ `full|partial|none`; อย่างอื่น/อ่านไม่ได้ → `unknown` (ไม่โยน error)
  - `web_used` ถ้า `web_used` truthy **หรือ** มี `web_sources` (แถวเก่าไม่มีธง)
  - `top_documents` นับเฉพาะ citation ที่ `cited: true`; เอกสารเดียวกันซ้ำในคำตอบเดียวนับครั้งเดียว; เรียง count แล้วชื่อ
  - **ไม่อ่าน `content`** ของข้อความใด
- `points_spent` = `_points_spent(('rag_question','rag_session'))`
- `usage`: `llm_usage WHERE feature='ask'`; `avg_latency_ms` เฉพาะ `kind='chat'`
- `library`: `library_documents GROUP BY status, scope`; `course`/`personal`/`chunks` นับเฉพาะ `ready`

`/rag/documents` item: `{ id, title, kind, filename, mime, size, scope, status, error, chunks, chars, created_at, updated_at,
course_id, course_code, course_name, owner_id, owner_username, owner_display_name, owner_role }` และ response มี
`by_status: { processing, ready, failed }` นับทั้งตาราง (ไม่ตามตัวกรอง) ให้ UI โชว์ตัวเลขบน segment
**ไม่มี** `file_path`, `notebook_id`, `source_id`, `content_hash`

## 4. ฟังก์ชันใน `repository.py` ที่เพิ่ม

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `_naive_utc(dt)` | aware → naive UTC สำหรับ bound ของ MariaDB (naive ปล่อยผ่าน) |
| `_pct(ratio)` | 0–1 → เปอร์เซ็นต์จำนวนเต็ม; `None` → `None` |
| `_points_spent(session, kinds, since)` | SUM(−delta) ของ `kinds` ลบ refund ที่ชี้กลับมาด้วย `ref_type='point_transaction'`; ใช้ `bindparam(expanding=True)` |
| `_author(row)`, `_per_day(rows)` | จัดรูป Person / `[{day, count}]` |
| `quiz_posts_by_session(ids)` | `{session_id: {post_id, is_deleted, play_count}}` แถวใหม่สุดชนะเมื่อแชร์ซ้ำ |
| `admin_quiz_posts(state, limit, offset)` | โพสต์ `linked_type='quiz'` + LEFT JOIN subquery รวม `quiz_attempts` ต่อโพสต์; `question_count` อ่านจาก `linked_snapshot` JSON; เรียง `quiz_play_count DESC, id DESC` |
| `quiz_stats(since)` | ดู 3.5 |
| `admin_list_comments(query, limit, offset)` | ดู 3.6 |
| `community_stats(since, tz_minutes)` | ดู 3.6 — 5 query ใน session เดียว |
| `summarize_rag_answers(metas)` | pure function (ทดสอบได้ไม่ต้องมี DB) |
| `rag_stats(since, tz_minutes)` | ดู 3.7 |

ของเดิมที่หน้า admin ใช้: `admin_list_posts`, `admin_list_courses`, `admin_points_log`, `admin_roadmap_posts`,
`roadmap_posts_by_session`, `roadmap_point_stats`, `post_exists`, `restore_post`, `soft_delete_post`, `get_comment`, `delete_comment`

## 5. `library.py` และ `features.py`

- `library.DOCUMENT_STATUSES = ('processing','ready','failed')`
- `library.admin_list_documents(*, query, status, scope, limit, offset)` — รายการทั้ง workspace (ต่างจาก
  `list_documents(user)` ที่กรองตามสิทธิ์ผู้เรียก) + `by_status`
- `QuizSession.admin_list(*, query, origin, limit, offset)` — SurrealQL `SELECT … FROM quiz_session`
  ไม่มี `questions`; กรอง `string::starts_with(prompt_hash, 'import:')`; `GROUP ALL` นับ total
- `QuizSession.created_since(since)` — `prompt_hash, question_count, notebook_id, created_at`
- ทั้งสองเลียนแบบ `RoadmapSession.admin_list/created_since` ที่มีอยู่แล้ว

## 6. ตารางที่เกี่ยวข้อง

| ตาราง (MariaDB `workspace`) | ใช้โดย |
|---|---|
| `users` | ทุกอย่างที่ join ชื่อ/บทบาท, `_session_owners` |
| `posts` (`linked_type`, `linked_id`, `linked_snapshot`, `quiz_play_count`, `roadmap_follow_count`, `is_deleted`, `comment_count`) | moderation, shared quiz/roadmap, community stats |
| `post_comments`, `post_reactions`, `post_shares`, `saved_posts`, `room_members`, `rooms` | community stats, comments, rooms |
| `quiz_attempts` (`score`, `question_count`, `completed`) | quiz stats / shared quizzes |
| `point_transactions` (`kind`, `delta`, `ref_type`, `ref_id`) | points log, `_points_spent`, cashback |
| `rag_conversations`, `rag_messages` (`role`, `answer_meta` JSON) | rag stats |
| `llm_usage` | usage, rag stats `usage` |
| `library_documents` | rag documents, rag stats `library`, health |
| SurrealDB `quiz_session`, `roadmap_session` | รายการและสถิติการสร้าง |

## 7. ตัวอย่างเรียกด้วย curl

```bash
TOKEN=$(curl -s -X POST http://localhost:5055/api/users/login \
  -H 'Content-Type: application/json' -d '{"username":"<admin>","password":"<pw>"}' | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:5055/api/admin/rag/stats?days=30&tz_offset=420' | jq .coverage
```

login endpoint คือ `POST /api/users/login` (ไม่ใช่ `/auth/login`); บัญชีนักศึกษาต้องได้ 403 ทุก route ในไฟล์นี้
