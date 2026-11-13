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

## 2b. คลังเอกสาร: ดาวน์โหลดและไฟล์สื่อ (4.3.2)

- ทุกเอกสารจาก `GET /community/library` มี `download_url` (เฉพาะ `kind === 'file'`) และ `is_media`
  (รูป/วิดีโอ/zip — เก็บไว้ให้ดาวน์โหลด ไม่ได้ให้ AI อ่าน `chunks` จะเป็น 0 ตลอด อย่าโชว์ว่า "ยังไม่พร้อมค้น")
- helper: `libraryDownloadUrl(doc, token)` ใน `lib/api/library.ts` (ต่อ `?token=` เพราะ `<a href>` ส่ง header ไม่ได้;
  token มาจาก `useAuthStore((s) => s.token)`) — PDF/รูป/วิดีโอเปิด inline ใน tab ใหม่, zip/docx ดาวน์โหลด
- สิ่งที่ต้องทำใน `LibraryPanel.tsx`: ปุ่มดาวน์โหลดต่อแถว (ดูตัวอย่างใน `app/(dashboard)/teacher/page.tsx` → `DocumentsByCourse`)
  และ `accept` ของ input ไฟล์ เพิ่ม `.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.zip` (เพดานสื่อ 200 MB, เอกสาร 100 MB)
- backend ตรวจ magic bytes แล้ว: ไฟล์ที่เนื้อหาไม่ตรงนามสกุลตอบ 400 "เนื้อหาไฟล์ไม่ตรงกับนามสกุล…" — แสดง detail ตรง ๆ ได้
- `can_manage` ของเอกสารตอนนี้เป็น true สำหรับผู้สอน/TA ของห้องด้วย (ไม่ใช่แค่คนอัปโหลด) ปุ่มลบจึงควรอิง `can_manage` ไม่ใช่ `is_owner`

## 2c. ค้นหาขั้นสูง (4.3.3)

- มีหน้าใหม่ `/community/search?q=…` (ของเรา) — ค้นโพสต์/รายวิชา/เอกสาร(ตามความหมาย)/ผู้ใช้ พร้อมตัวกรอง
- สิ่งที่ขอใน `CommunityHeader.tsx`: ให้ช่องค้นหาบนหัวพาไป `/community/search?q=<คำ>` (หรือเพิ่มลิงก์ "ค้นหาขั้นสูง" ใต้ช่อง)
  แทนที่จะกรองฟีดด้วย `?q=` อย่างเดียว — `GET /community/search` เดิมที่ `useCommunitySearch` เรียกยังใช้ได้ (response มีฟิลด์เพิ่ม ไม่ลบของเดิม)
- `GET /community/search` ของผู้ใช้ทั่วไป **ไม่คืน `student_id`/ไม่จับคู่ email แล้ว** — ถ้า UI ไหนเคยโชว์รหัสนักศึกษาจากผลค้นหา ให้คาดว่าเป็น null
- ฟีด `order=popular` + `before_id` ตอนนี้แบ่งหน้าถูกแล้ว (เดิมข้าม/ซ้ำ) — ไม่ต้องแก้ฝั่ง UI

## 2d. รายงานเนื้อหา (4.3.5)

- ปุ่มสำเร็จรูป: `<ReportButton targetType="post" targetId={post.id} targetLabel={post.title} alreadyReported={…} size="icon" />`
  จาก `components/common/ReportButton.tsx` — เปิด dialog เลือกเหตุผล + รายละเอียด แล้วยิง `POST /community/reports` เอง
- ขอวางใน `PostCard` (เมนู ⋯ หรือมุมขวาล่าง) และ `PostDetailModal` (โพสต์ + ทุกคอมเมนต์ `targetType="comment"`)
  และหน้าโปรไฟล์ (`targetType="user"`); ไม่ต้องแสดงกับเนื้อหาของตัวเอง (backend ตอบ 400 อยู่แล้ว)
- สถานะ "รายงานแล้ว": `useMyReports('post', ids)` คืน id ที่ผู้ใช้เคยรายงาน → ส่ง `alreadyReported`
- ผู้สอนเห็นรายงานของห้องที่ `/teacher/courses/{id}` และผู้ดูแลที่ `/admin/community` แท็บ "รายงาน" — ไม่ต้องทำ UI ฝั่ง community เพิ่ม
- ผู้ใช้ที่ถูกระงับจะได้ notification `kind: "moderation"` — ถ้า `NotificationsMenu` map ไอคอนตาม kind ให้เพิ่มเคสนี้ (ไอคอน shield/ban)

## 3. บั๊กที่เจอในไฟล์ของ Poh

- ~~`list_comments` ไม่ SELECT `c.parent_id`~~ — **แก้แล้ว** ในข้อ 4.3.5 (`repository.list_comments` เพิ่ม `c.parent_id`); `PostDetailModal` ไม่ต้องแก้

## 2e. Roadmap ในฟีด (4.5.2)

- โพสต์ชนิด roadmap อัปเดตสำเนาของตัวเองทันทีที่เจ้าของขยายด่านในแอป roadmap (`expand` ตอบ `synced_post_id`)
  ฝั่ง feed ไม่ต้องทำอะไรเพิ่ม แต่ถ้า card มี cache ของ `linked_snapshot` ไว้ใน state ให้ refetch โพสต์เมื่อกลับมาที่หน้า
- ลบแผนแล้วโพสต์ยังอยู่ (มีสำเนา) — เป็นพฤติกรรมที่ตั้งใจ ไม่ต้องซ่อนโพสต์

## 4. ธีม

- `DESIGN.md` (SIET Pink) กับ `.community-theme` ใน `globals.css` ใช้ค่าสีคนละชุด (`#ED4988` vs `#db2777`)
  หน้า `/community/ask` และแอป roadmap จะใช้ค่าจาก DESIGN.md ผ่าน class `.theme-adventure` — ถ้าอยากให้ community
  ตรงกัน แนะนำปรับ `--primary`/`--ai` ของ `.community-theme` เป็น `#ED4988` และ `--accent` เป็น `#FCE7F0`
