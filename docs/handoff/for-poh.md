# งานฝั่ง community UI ที่รอ wire กับ backend ใหม่ (สำหรับ Poh)

> เขียนโดยทีม backend/teacher-admin บน branch `refactor/course-repo` (22 ต.ค. 2026)
> ทุกอย่างในนี้ backend ทำเสร็จและมี test แล้ว เหลือแค่จุดที่อยู่ในไฟล์ `components/community/*`
> ซึ่งตกลงกันว่าเป็นของ Poh — เราไม่แตะไฟล์เหล่านั้น

## 1. เข้าร่วมห้องที่ต้องใช้รหัส (4.3.1)

- `POST /api/community/courses/{id}/join` ตอนนี้ตอบ **403 + header `X-Join-Code-Required: 1`** ถ้าห้องตั้งรหัสไว้
  และยังไม่ได้ส่ง `{ "code": "…" }` (ส่งผิดก็ 403 เหมือนกัน แต่ detail เป็น "รหัสเข้าห้องไม่ถูกต้อง")
- แถวห้องจาก `GET /community/courses` มี `requires_code: boolean` ให้โชว์ไอคอนกุญแจล่วงหน้า
- helper พร้อมใช้: `useJoinWithCode()` ใน `lib/hooks/use-courses.ts` (`mutate({ courseId, code })`)
- สิ่งที่ต้องทำใน `CourseSidebar.tsx`: เมื่อ join แล้วได้ 403 ที่มี header นี้ → เปิด prompt/dialog ขอรหัส แล้วเรียกซ้ำพร้อม `code`
- ห้องที่ `archived: true` จะไม่อยู่ใน `GET /community/courses` อีกแล้ว (ส่ง `?include_archived=true` ถ้าต้องการ)

## 2. ระดับการมองเห็นของโพสต์ (4.3.4)

- `POST /api/community/posts` รับฟิลด์ฟอร์ม `visibility` = `public` (ค่าเริ่มต้น) | `course` | `private`
  — `course` มีผลเฉพาะโพสต์ที่มี `course_id`; นอกห้องระบบลดเป็น `public` เอง
- `PUT /api/community/posts/{id}` รับ `visibility` ด้วย → ใช้ทำปุ่ม "ซ่อนโพสต์" (= `private`) / "เลิกซ่อน" ให้เจ้าของโพสต์
- ทุกโพสต์ใน response มี `visibility` และ `course.is_private`
- โพสต์ที่ผู้ใช้ไม่มีสิทธิ์อ่านตอบ **404** ทุกเส้นทาง (รวมคอมเมนต์/ไฟล์แนบ/ไลก์) — ถ้า PostDetailModal เปิดจาก id ตรง ๆ ให้ handle 404 เป็น "โพสต์นี้ไม่เปิดให้ดู"
- ข้อเสนอ UI: ใน `CreatorBox` เพิ่ม select 3 ตัวเลือก (label: ทุกคน / เฉพาะสมาชิกห้อง / เฉพาะฉัน — มี `POST_VISIBILITY_LABELS`
  ใน `lib/api/courses.ts`) แสดงตัวเลือก "เฉพาะสมาชิกห้อง" เฉพาะเมื่อเลือกห้อง; ใน `PostCard` โชว์ไอคอน 🔒 ถ้า `visibility !== 'public'`
- `SharePostModal` ตัวเลือก audience `course`/`private` ปัจจุบัน toast ว่ายังไม่รองรับ — ไม่เกี่ยวกับ visibility โดยตรง
  (เป็นการแชร์ซ้ำ) ถ้าจะทำ "แชร์ลงวิชา" แนะนำให้สร้างโพสต์ใหม่ `type=summary` ใน `course_id` นั้นพร้อม `visibility=course`

## 3. บั๊กที่เจอในไฟล์ของ Poh (ยังไม่ได้แก้ เพราะอยู่ในเขตของ Poh)

- `open_notebook/community/repository.py::list_comments` (commit `8494961`) ไม่ SELECT `c.parent_id` แต่ return `r.get("parent_id")`
  → `PostDetailModal` สร้าง tree ไม่ได้ reply ทุกอันขึ้นเป็นคอมเมนต์ชั้นบน — แก้โดยเพิ่ม `c.parent_id` ใน SELECT (เราจะแก้ให้ในข้อ 4.3.5 ถ้ายังไม่ถูกแก้)

## 4. ธีม

- `DESIGN.md` (SIET Pink) กับ `.community-theme` ใน `globals.css` ใช้ค่าสีคนละชุด (`#ED4988` vs `#db2777`)
  หน้า `/community/ask` และแอป roadmap จะใช้ค่าจาก DESIGN.md ผ่าน class `.theme-adventure` — ถ้าอยากให้ community
  ตรงกัน แนะนำปรับ `--primary`/`--ai` ของ `.community-theme` เป็น `#ED4988` และ `--accent` เป็น `#FCE7F0`
