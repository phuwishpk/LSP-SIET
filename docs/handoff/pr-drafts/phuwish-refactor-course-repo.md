<!-- ร่างสำหรับ Phuwish: branch นี้มี PR #1 เปิดอยู่แล้ว (base staging) ตรวจทุกข้อแล้วอัปเดตเนื้อหาด้วย
gh pr edit 1 --title "คลังข้อมูลและรายวิชา 4.3.1–4.3.5 + hardening ฟีเจอร์ AI 4.5" --body-file docs/handoff/pr-drafts/phuwish-refactor-course-repo.md -->

## ทำอะไร
- **4.3.1 โครงสร้างรายวิชา**: หมวดหมู่ (`categories`) เทอม รหัสเข้าห้อง ห้องเก็บถาวร/กู้คืน ผู้ช่วยสอน (TA); หน้า `/teacher/courses/[id]`; แผงหมวดหมู่ + CSV import ใน `/admin/community`; seed 13 หลักสูตร / 65 รายวิชาของ SIET + ห้องเดโม (`catalog.py`)
- **4.3.4 การมองเห็น**: `posts.visibility` (public / course / private) + ห้องส่วนตัว บังคับใช้ทุก route ของโพสต์ คอมเมนต์ เอกสาร ค้นหา และ RAG
- **4.3.2 สื่อการสอน**: รับรูป/วิดีโอ/zip ตรวจ magic bytes, `GET /community/library/{id}/download` (รับ `?token=` สำหรับเปิดในแท็บใหม่), reaper เคลียร์งาน ingest ที่ค้างตอน startup, ลบบัญชีแล้วล้างไฟล์/Source/notebook
- **4.3.3 ค้นหาขั้นสูง**: `GET /community/search` (posts / courses / documents / users + ตัวกรอง, จำกัด 20 ครั้ง/นาที) และหน้า `/community/search`
- **4.3.5 Moderation**: ตาราง `content_reports` + `admin_audit_log`, คิวรายงานใน `/admin` และในหน้ารายวิชา (ผู้สอนจัดการห้องตัวเอง), ระงับบัญชีแบบระบุเหตุผล/วันสิ้นสุด (ปลดเองเมื่อครบกำหนด), บันทึกการกระทำของผู้ดูแล 15 จุด, คอมโพเนนต์ `ReportButton`
- **4.5.1 KMITL RAG AI**: จองเครดิตของเซสชันแบบ atomic (`UPDATE … WHERE credits_left > 0`) คืนเครดิตเมื่อคำตอบล้มเหลว, ข้อความ 500 ไม่เผยข้อมูลภายใน (มีรหัสอ้างอิงใน log), ธีม SIET Pink `.theme-adventure` + น้องฮูกบน `/community/ask`, หน้าคง light แม้ผู้ใช้เปิดโหมดมืด (`useForcedLightTheme`)
- **4.5.2 AI Roadmap**: ธีม SIET Pink ทั้งแอป roadmap, กราฟใหญ่ขึ้นและขยายอัตโนมัติตามพื้นที่, โพสต์ที่แชร์ไว้อัปเดตสำเนาเองเมื่อเจ้าของขยายด่าน (`synced_post_id`)
- **เอกสาร**: `docs/SYSTEM-GUIDE.md` (§6.2.1–6.2.5, 6.6, 6.7, API map), `docs/admin/*`, รายงานบทที่ 4 ข้อ 4.1 / 4.3 / 4.5 (`.md` + `.docx` + ภาพหน้าจอจริง), `docs/handoff/for-poh.md`

## ใครทำอะไร
| คน | งาน | ไฟล์/โฟลเดอร์หลัก |
|---|---|---|
| Phuwish | backend รายวิชา / คลังเอกสาร / ค้นหา / moderation / RAG | `open-notebook/open_notebook/community/{schema,repository,library,moderation,catalog}.py`, `open-notebook/api/routers/{community,admin,users}.py`, `open-notebook/api/{auth,auth_jwt,main}.py`, `open-notebook/open_notebook/domain/user.py` |
| Phuwish | teacher / admin console, หน้าค้นหา, ธีมหน้า ask | `app/(dashboard)/teacher/**`, `app/(dashboard)/admin/**`, `components/admin/**`, `app/(dashboard)/community/{search,ask}/**`, `components/common/{OwlMascot,ReportButton}.tsx`, `lib/api/{courses,community-search,moderation,library,admin}.ts`, `lib/hooks/{use-courses,use-advanced-search,use-moderation,use-forced-light-theme}.ts`, `app/globals.css` (เฉพาะ block `.theme-adventure`), `app/layout.tsx` (ฟอนต์ Nunito), `public/mascot/*` |
| Phuwish | แอป roadmap | `ai-roadmap-generator/src/**` |
| Phuwish | เอกสารและรายงาน | `docs/**` |

## เปลี่ยนฐานข้อมูล / env / config ไหม
- ตารางใหม่ (MariaDB): `categories`, `content_reports`, `admin_audit_log`
- คอลัมน์ใหม่: `rooms.category_id / term / join_code / status / archived_at / is_private`, `room_members.role` (member / ta), `posts.visibility`, `users.suspend_reason / suspended_until`; index `idx_rooms_category`, `idx_posts_visibility`
- ทั้งหมดสร้างตอน startup ผ่าน `open_notebook/community/schema.py` (`IF NOT EXISTS`) ไม่ต้องรันคำสั่งเพิ่ม; seed หลักสูตร/รายวิชา (`catalog.py`) ก็รันตอน startup และข้ามของที่มีอยู่แล้ว
- env: ไม่มีตัวใหม่; `docker-compose.yml` ไม่เปลี่ยน แต่หลัง merge ต้อง rebuild image `open_notebook_api` (รวม frontend) และ `ai_roadmap_generator`
- ไม่มี dependency ใหม่ทั้ง Python และ npm

## ทดสอบยังไง
- **pytest** ในคอนเทนเนอร์ API ผ่านทั้งหมด: `tests/test_course_rooms.py` (22), `test_post_visibility.py` (16), `test_library_media.py` (13), `test_search.py` (10), `test_moderation.py` (10), `test_rag_hardening.py` (6), `test_roadmap_sync.py` (2) รวมชุดเดิมของ community / RAG ไม่มีกรณีไหนพัง
  วิธีรัน: `docker exec kmitl_open_notebook_api /app/.venv/bin/python -m pip install --target /tmp/pt pytest pytest-asyncio` แล้ว `docker exec -w /app -e PYTHONPATH=/app:/tmp/pt kmitl_open_notebook_api /app/.venv/bin/python -m pytest -q tests/test_course_rooms.py tests/test_post_visibility.py tests/test_library_media.py tests/test_search.py tests/test_moderation.py tests/test_rag_hardening.py tests/test_roadmap_sync.py`
- **smoke บน stack จริง** (`make up`) ผ่านทุกข้อ: เข้าห้องด้วยรหัส / เก็บถาวร / TA (28), โพสต์แต่ละระดับการมองเห็นและห้องส่วนตัว (29), อัปโหลด-ดาวน์โหลดสื่อและไฟล์ปลอม (18), ค้นหาพร้อมตัวกรอง (16), รายงาน → จัดการ → audit → ระงับแล้วปลดเอง (29), เซสชัน RAG จนเครดิตหมดได้ 402 และลบบัญชีแล้วข้อมูลหาย, ขยาย roadmap แล้วโพสต์ในฟีดอัปเดตเอง 8 → 11 ด่าน และ admin ลบแผนแล้วโพสต์ยังอยู่ (14)
- **เปิดดูด้วยตา** ด้วยบัญชีเดโม `demo.teacher1` / `demo.student1` (รหัส `Demo@2026`): `/teacher`, `/teacher/courses/250`, `/admin` (แท็บ รายงาน, บันทึกผู้ดูแล), `/admin/community` (แท็บ หมวดหมู่), `/community/search`, `/community/ask` (ลองทั้งโหมดสว่างและโหมดมืด), `/roadmap`
- ภาพหน้าจอจริงอยู่ใน `docs/report/images/fig-4.6` ถึง `fig-4.17`

## ยังไม่เสร็จ / ห้ามแตะ
- branch นี้**ไม่แก้** `components/community/*`, `community/page.tsx` และ quiz AI (ของ Poh / SpritUm) มีเพียง CSS override ที่ scoped อยู่ใน `.theme-adventure` ของหน้า ask
- สิ่งที่รอ Poh ต่อเข้า UI ของ community อยู่ใน `docs/handoff/for-poh.md`: ปุ่มรายงาน, ตัวเลือกการมองเห็นตอนโพสต์, ปุ่มดาวน์โหลดเอกสาร, ช่องรหัสเข้าห้อง, refetch โพสต์ roadmap หลังกลับมาหน้า feed
- ธีมยังเป็น 2 ชุด: `.community-theme` (`#db2777`, Inter) ของหน้าชุมชน กับ DESIGN.md (`#ED4988`, Nunito) ที่ใช้บน `/community/ask` และ roadmap — รอทีม UI ตัดสินใจว่าจะรวมเป็นชุดเดียวไหม
- ค้นหาเนื้อหาในเอกสารภาษาไทยใช้ semantic search (FULLTEXT ของ MariaDB ตัดคำไทยไม่ได้) จึงช้ากว่าค้นชื่อเรื่องเล็กน้อย (มี cache 5 นาที)
- `.markdown-collab/.mcp-server.json` ที่ติดมาใน commit `a4738c1` (ไฟล์เครื่องมือเฉพาะเครื่อง) ถอดออกจาก branch แล้วใน `aaaf73a` และใส่ `.gitignore` ไว้

## Merge ownership
<!-- merge-ownership:start -->
```yaml
branch: refactor/course-repo
merge-order: 1            # merge ก่อนได้: ตามหลัง staging 0 commit, ไม่ชนกับ dev-poh / refactor/community / feat/quiz-ai
depends-on: []
owns:                     # พื้นที่ที่ branch นี้เป็นตัวหลัก: ถ้าชน ให้ยึดฝั่งนี้
  - backend community/courses: open-notebook/open_notebook/community/**, open-notebook/api/routers/community.py, open-notebook/api/routers/admin.py
  - teacher console: open-notebook/frontend/src/app/(dashboard)/teacher/**
  - admin console: open-notebook/frontend/src/app/(dashboard)/admin/**, open-notebook/frontend/src/components/admin/**
  - advanced search page: open-notebook/frontend/src/app/(dashboard)/community/search/**, lib/api/community-search.ts, lib/hooks/use-advanced-search.ts
  - ask page theme: open-notebook/frontend/src/app/(dashboard)/community/ask/**, lib/hooks/use-forced-light-theme.ts, components/common/OwlMascot.tsx
  - roadmap app: ai-roadmap-generator/**
  - docs/report และ docs/handoff: docs/**
defers-to:                # พื้นที่ที่ branch นี้ไม่ใช่ตัวหลัก: ถ้าชน ให้ยึดอีกฝั่ง
  - community UI (feed, navbar, CommunityHeader, สีหน้า community): open-notebook/frontend/src/components/community/**, open-notebook/frontend/src/app/(dashboard)/community/page.tsx
shared:                   # ไฟล์ที่ทั้งสองฝั่งแก้: ให้เก็บทั้งสองฝั่ง
  - open-notebook/frontend/src/app/globals.css: branch นี้เพิ่มเฉพาะ block `.theme-adventure` ต่อท้าย (dev-poh / refactor/community แก้ `.community-theme`) git merge เองได้
  - open-notebook/frontend/src/app/layout.tsx: branch นี้เพิ่มฟอนต์ Nunito (`--font-nunito`) เท่านั้น
  - open-notebook/open_notebook/domain/user.py: ชนกับ feat/auth-rbac-logs เพราะทั้งสองฝั่งเพิ่มฟังก์ชันท้ายไฟล์ ให้เก็บทั้งสองฝั่ง (suspension_* + allowed_teacher)
  - open-notebook/open_notebook/community/schema.py: feat/auth-rbac-logs ก็แก้ไฟล์นี้ (allowed_teachers, role pending) git merge เองได้
  - open-notebook/api/auth_roles.py, api/auth_jwt.py: branch นี้แก้เฉพาะจุดปลดระงับอัตโนมัติ ถ้าชนกับ RBAC ของ Tanabordi ให้ยึดโครงของ Tanabordi แล้วใส่ `suspension_lifted` กลับ
```
<!-- merge-ownership:end -->

ผลการจำลอง merge (`git merge-tree`) เทียบกับ branch อื่นที่ยังไม่เข้า staging ณ 2026-10-22:

| คู่ branch | ผล |
|---|---|
| refactor/course-repo + dev-poh | merge ได้เลย |
| refactor/course-repo + refactor/community | merge ได้เลย |
| refactor/course-repo + feat/quiz-ai | merge ได้เลย |
| refactor/course-repo + feat/auth-rbac-logs | ชนที่ `domain/user.py`: เก็บทั้งสองฝั่ง |
| dev-poh + refactor/community | ชน 4 ไฟล์ใน `components/community/` (CommunityHeader, CreatorBox, InstructorMediaView, SavedSummariesView): ต้องตกลงกันก่อนว่าใครเป็นตัวหลักของ community UI |
