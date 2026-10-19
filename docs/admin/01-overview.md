# 01 — ภาพรวมส่วนผู้ดูแล (Admin Console)

> อ่านไฟล์นี้ก่อนไฟล์อื่นในโฟลเดอร์ `docs/admin/` เพื่อรู้ว่าส่วนผู้ดูแลมีอะไรบ้าง
> แบ่งอย่างไร ใครเห็น และกติกาที่ห้ามละเมิด จากนั้นค่อยเจาะไฟล์ที่ตรงกับงาน
>
> สถานะโค้ด: commit `36d384f` (หน้าใหม่ 3 หน้า + API) และ `ebffe06` (จัดกลุ่ม sidebar) บน `main`
> อัปเดตเอกสาร: 19 ตุลาคม 2026

## 1. ส่วนผู้ดูแลคืออะไร

ส่วนผู้ดูแลคือชุดหน้าใต้ URL `/admin` ในแอป Next.js (`open-notebook/frontend`) ที่ให้บัญชี
สิทธิ์ `admin` ดูสถิติและจัดการข้อมูลของ SIET Space โดยไม่ต้องเข้า MariaDB เอง
ข้อมูลทุกอย่างมาจาก API ใต้ `/api/admin/*` (`open-notebook/api/routers/admin.py`) ซึ่ง
เป็น admin-only ทั้ง router

แบ่งเป็น **4 ส่วน** ตามที่ตกลงกับเจ้าของระบบเมื่อ 9 ต.ค. 2026 (ดูข้อ 4):

| ส่วน | URL | หน้าที่ | แท็บ |
|---|---|---|---|
| จัดการระบบ | `/admin` | เรื่องที่ใช้ร่วมกันทุกส่วน: บัญชี แต้ม ค่าใช้จ่าย AI สถานะระบบ | ภาพรวม · ผู้ใช้ · แต้ม · การใช้ AI · นำเข้า CSV |
| จัดการ Community | `/admin/community` | ฟีด โพสต์ ความคิดเห็น ห้อง | ภาพรวม · โพสต์ · ความคิดเห็น · ห้อง |
| จัดการ AI → RAG AI | `/admin/rag` | การใช้ KMITL RAG AI, เอกสารที่ AI อ่าน, แหล่งความรู้ | ภาพรวม · เอกสารที่ AI อ่าน · แหล่งความรู้ |
| จัดการ AI → AI Roadmap | `/admin/roadmap` | Roadmap ทุกคน + โพสต์ Roadmap ในฟีด | ภาพรวม · Roadmap ทั้งหมด · ที่แชร์ในฟีด |
| จัดการ Quiz | `/admin/quiz` | Quiz ทุกคน + โพสต์ Quiz ในฟีด พร้อมผลการทำ | ภาพรวม · Quiz ทั้งหมด · ที่แชร์ในฟีด |

ทุกหน้าใช้โครงเดียวกัน: `AppShell` (sidebar ซ้าย) → `AdminPageHeader` (ไอคอน ชื่อ คำอธิบาย ปุ่ม)
→ `Tabs` → แท็บละหนึ่ง "Panel" component ใน `frontend/src/components/admin/`

## 2. แผนที่ไฟล์แบบย่อ

```
open-notebook/
├── api/routers/admin.py                      ← ทุก endpoint ใต้ /api/admin
├── open_notebook/
│   ├── community/repository.py               ← SQL ของสถิติ community / quiz / RAG / comments
│   ├── community/library.py                  ← admin_list_documents (เอกสารที่ AI อ่าน)
│   └── domain/features.py                    ← QuizSession.admin_list / created_since (SurrealDB)
├── tests/test_admin_consoles.py              ← unit test ของ helper ฝั่ง backend
└── frontend/src/
    ├── app/(dashboard)/admin/
    │   ├── layout.tsx                        ← ใส่ธีม .theme-siet ให้ทุกหน้า /admin
    │   ├── page.tsx                          ← จัดการระบบ (รวม UserDialog อยู่ในไฟล์นี้)
    │   ├── community/page.tsx
    │   ├── rag/page.tsx
    │   ├── roadmap/page.tsx
    │   └── quiz/page.tsx
    ├── components/admin/                     ← panel ทุกตัว + ชิ้นส่วนที่ใช้ร่วมกัน
    │   ├── AdminPageHeader.tsx  StatTile.tsx  StatCharts.tsx  controls.tsx  PostCounts.tsx
    │   ├── HealthPanel  ModerationPanel  RoomsPanel  PointsLogPanel  UsagePanel  ImportPanel  CreateUserDialog
    │   ├── community/  CommunityStatsPanel  CommentsPanel
    │   ├── rag/        RagStatsPanel  RagDocumentsPanel  RagKnowledgePanel
    │   ├── roadmap/    RoadmapStatsPanel  RoadmapListPanel  SharedRoadmapsPanel
    │   └── quiz/       QuizStatsPanel  QuizListPanel  SharedQuizzesPanel
    ├── components/layout/AppSidebar.tsx      ← เมนูซ้าย (กลุ่ม admin 3 กลุ่ม)
    ├── lib/api/admin.ts                      ← type ของทุก response + adminApi
    ├── lib/hooks/use-admin.ts                ← TanStack Query hooks + query keys
    ├── lib/utils/community-format.ts         ← ป้ายภาษาไทย (kindLabel, postTypeLabel, roleLabel …)
    └── app/globals.css                       ← ธีม .theme-siet
docs/figma-admin-plugin/                      ← ปลั๊กอิน Figma สร้างหน้าที่เหลือ + โยงเส้น
```

ตารางรายไฟล์ครบทุกไฟล์อยู่ใน [08-file-index.md](08-file-index.md)

## 3. ใครเห็นอะไร (สิทธิ์)

- **Backend เป็นผู้บังคับ**: `api/auth_roles.py` มี `ADMIN_PREFIXES` ที่รวม `/api/admin` ไว้
  middleware จะตอบ 403 ให้ทุก path ใต้ prefix นี้ถ้าไม่ใช่ admin และทุก route ใน
  `admin.py` ยังเรียก `_require_admin(user)` ซ้ำอีกชั้น (403 + ข้อความไทย) เผื่อ middleware ถูกแก้
- **Frontend แค่ซ่อนประตู**: `frontend/src/lib/roles.ts` มี `ADMIN_ROUTES = ['/settings', '/advanced', '/admin']`
  และ `canAccessRoute()`; `app/(dashboard)/layout.tsx` จะ `router.replace('/community')`
  ถ้า role เข้าไม่ได้ ส่วน `AppSidebar` แสดงกลุ่มเมนู admin เฉพาะ `isAdmin(role)`
- หลัง admin ล็อกอิน จะถูกพาไป `/admin` (`lib/auth-redirect.ts`), role อื่นไป `/community`
- อาจารย์ (`teacher`) มีหน้าของตัวเองที่ `/teacher` ไม่เกี่ยวกับส่วนนี้

## 4. การจัดกลุ่มเมนูและเหตุผล (ตกลงกับเจ้าของระบบ 9 ต.ค. 2026)

sidebar ของ admin เรียงเป็น:

```
SIET SPACE          ชุมชน (Community)
COLLECT             Sources
PROCESS             Notebooks · Ask and Search
CREATE              AI Features
จัดการ COMMUNITY    Community                 → /admin/community
จัดการ AI           RAG AI · AI Roadmap       → /admin/rag · /admin/roadmap
จัดการ QUIZ         Quiz                      → /admin/quiz
MANAGE              จัดการการสอน · Models · Transformations · จัดการระบบ · Settings · Advanced
```

ข้อตกลงที่มีผลกับงานต่อไป:

1. **หนึ่งหน้า = หนึ่งลิงก์** ใน sidebar แท็บอยู่ในหน้า ไม่แตกเป็นลิงก์
2. **Quiz อยู่นอกกลุ่ม AI โดยตั้งใจ** เพราะเรื่องคะแนนและผลการทำเป็นเรื่องการเรียน
   ไม่ใช่เรื่องตัว AI ชื่อเมนูจึงตัดคำว่า AI ออก (เดิม "จัดการ Quiz AI")
3. **อะไรที่ข้ามหลายส่วนอยู่ที่ "จัดการระบบ"**: แต้ม (ได้จาก Community ใช้กับทุก AI),
   ค่าใช้จ่าย AI (รวม Quiz ด้วย), บัญชี, สถานะระบบ, นำเข้า CSV
4. แท็บ "เนื้อหา" และ "ห้อง" ถูกเอาออกจากจัดการระบบ เหลืออยู่ที่ Community ที่เดียว
   (`ModerationPanel`, `RoomsPanel` ยังเป็น component เดิม แค่ย้ายที่เรียก)
5. URL ทุกหน้าคงเดิม, เมนู Models / Settings / Advanced / จัดการการสอน ไม่ถูกแตะ
6. ตำแหน่งกลุ่ม (เหนือ MANAGE) เจ้าของระบบรับ "ไปก่อน" — เปลี่ยนได้ถ้าใช้จริงแล้วไม่ถนัด

ชื่อหน้าใน `AdminPageHeader` ต้องตรงกับชื่อกลุ่ม+ลิงก์: "จัดการ Community", "จัดการ RAG AI",
"จัดการ AI Roadmap", "จัดการ Quiz", "จัดการระบบ"

## 5. เส้นแบ่งความเป็นส่วนตัว (ห้ามข้าม)

หลักเดียวกับ roadmap console และประวัติแชต RAG ที่มีมาก่อน: **ผู้ดูแลเห็นว่าใครทำอะไร
และตัวเลขรวม แต่ไม่เห็นเนื้อหาส่วนตัว**

| เห็นได้ | ไม่เห็น |
|---|---|
| หัวข้อ Quiz / Roadmap, เจ้าของ, จำนวนข้อ/ด่าน, วันที่, แชร์หรือยัง | คำถาม เฉลย และ node ของ Quiz/Roadmap ที่ยังไม่แชร์ (`QuizSession.admin_list` และ `RoadmapSession.admin_list` ไม่ SELECT `questions`/`nodes`) |
| จำนวนคำถาม RAG ต่อวัน, coverage, เอกสารที่ถูกอ้าง, ใครถามกี่ครั้ง | ข้อความคำถาม/คำตอบ (`rag_stats` อ่านเฉพาะ `answer_meta` ไม่อ่าน `content`) |
| ชื่อเอกสาร ขนาด สถานะดัชนี เจ้าของ | เนื้อหาเอกสาร และ `file_path`/`content_hash` (ถูกตัดออกจาก `admin_list_documents`) |
| ความคิดเห็นทั้งข้อความ (เป็นเนื้อหาสาธารณะในฟีดอยู่แล้ว) | — |

ถ้าจะเพิ่ม field ใหม่ให้ endpoint ใดใน `/api/admin/*` ให้ถามก่อนว่า field นั้นเป็นเนื้อหา
ที่เจ้าของยังไม่ได้เผยแพร่หรือไม่ ถ้าใช่ ห้ามส่งออก

## 6. อำนาจที่ส่วนนี้ให้ผู้ดูแล

ทุกอย่างที่ลบถาวรมี `AlertDialog` ยืนยันก่อนเสมอ (ยกเว้นซ่อน/กู้คืนโพสต์ซึ่งย้อนได้)

| การกระทำ | หน้า | endpoint | ย้อนได้? |
|---|---|---|---|
| ซ่อน / กู้คืนโพสต์ | Community › โพสต์, Roadmap/Quiz › ที่แชร์ในฟีด | `DELETE /admin/posts/{id}`, `POST /admin/posts/{id}/restore` | ได้ (เป็นธง `is_deleted`) |
| ลบความคิดเห็น | Community › ความคิดเห็น | `DELETE /admin/comments/{id}` | **ไม่ได้** ลบแถวจริง |
| ปิดห้อง | Community › ห้อง | `DELETE /community/courses/{id}` (hook เดิม `useDeleteCourse`) | ไม่ได้ แต่โพสต์ย้ายไปฟีดรวม ไม่ถูกลบ |
| ลบ Quiz / Roadmap ของใครก็ได้ | Quiz › Quiz ทั้งหมด, Roadmap › Roadmap ทั้งหมด | `DELETE /admin/quizzes/{id}`, `DELETE /admin/roadmaps/{id}` | ไม่ได้ (โพสต์ที่แชร์แล้วเก็บสำเนาของตัวเอง จึงยังอยู่) |
| ลบ / ทำดัชนีใหม่ เอกสารของใครก็ได้ รวมเอกสารส่วนตัวของนักศึกษา | RAG AI › เอกสารที่ AI อ่าน | `DELETE /admin/rag/documents/{id}`, `POST …/retry` | ลบไม่ได้ (ลบไฟล์ + embeddings + Source ด้วย) |
| บัญชี: สิทธิ์ แต้ม รหัสผ่าน ระงับ ลบ สร้าง | จัดการระบบ › ผู้ใช้ | `/admin/users…` | ลบถาวรไม่ได้ |

เรื่องที่เจ้าของระบบยังไม่ได้ตัดสิน: ควรให้ลบ **เอกสารส่วนตัว** ของนักศึกษาจากหน้า admin
ได้หรือไม่ (ตอนนี้ทำได้ และ dialog เตือนว่าเจ้าของจะไม่ได้รับการแจ้งเตือน)

## 7. ตัวเลขที่ดูไม่ตรงกันแต่ถูกต้อง

- **RAG: "คำถามใน 30 วัน" น้อยกว่า "แต้มที่ใช้"** — คำถามนับจาก `rag_messages`
  (ประวัติแชตที่ผู้ใช้ยังเก็บไว้ มีตั้งแต่ 22 ก.ย. 2026) ส่วนแต้มนับจาก `point_transactions`
  ซึ่งมีรายการก่อนหน้านั้นและของบัญชี/บทสนทนาที่ถูกลบแล้ว
- **Quiz: "แต้มคืนให้เจ้าของควิซ" มีค่า แต่ "ทำควิซ" เป็น 0** — `cashback` นับจาก ledger ทั้งหมด
  ในช่วงเวลา ส่วน `quiz_attempts` ในฐานข้อมูลตอนนี้ว่าง (ข้อมูล cashback มาจากช่วงพัฒนา)
- **โพสต์ที่ซ่อนไว้ทั้งหมด** ใน Community › ภาพรวม ไม่ขึ้นกับช่วงเวลาที่เลือก (นับทั้งตาราง)
- "ต่อวัน" ทุกกราฟตัดวันตามนาฬิกาของ**ผู้ดู** (browser ส่ง `tz_offset` เป็นนาทีตะวันออกของ UTC)
  ไม่ใช่ของเซิร์ฟเวอร์ ดู [05-backend-api.md](05-backend-api.md) ข้อ 2

## 8. จะดูหน้าจริงได้อย่างไร

| วิธี | พอร์ต | ใช้เมื่อ |
|---|---|---|
| `make up` ที่รากโปรเจกต์ | 3000 (ผ่าน Traefik) + API 5055 | ต้องการ build จริง; **แก้โค้ดแล้วต้อง `make up` ใหม่** เพราะ image ถูก bake |
| `cd open-notebook/frontend && npm run dev` | 3500 (ต่อ API ของ stack ที่ 5055) | แก้ frontend แล้วอยากเห็นทันที; CORS ของ API รองรับ 3500 อยู่แล้ว |

อย่าใช้ `./dev.sh` เพื่อการนี้ — สคริปต์นั้นแก้ `.env` และ `package.json` ของเครื่อง
บัญชี admin สำหรับทดสอบอ่านจาก `WORKSPACE_SEED_ADMIN_USERNAME/PASSWORD` ใน `.env`;
บัญชีนักศึกษาตัวอย่าง `demo.student1` รหัส `Demo@2026` (จาก `deploy/seed-demo-data.py`)

หน้า `/admin` ไม่เคยถึงสถานะ network idle (มี polling ของ health/throttle) — ถ้าเขียน
automation ให้รอ `domcontentloaded` แล้วรอ element แทน

## 9. ลำดับการอ่านตามงาน

| งาน | อ่าน |
|---|---|
| แก้สี ฟอนต์ ระยะ ของหน้า admin | [02-theme-and-layout.md](02-theme-and-layout.md) |
| เพิ่มแท็บ/การ์ด/ตารางในหน้าที่มีอยู่ | [03-frontend-pages.md](03-frontend-pages.md) แล้ว [04-frontend-shared.md](04-frontend-shared.md) |
| เพิ่ม endpoint หรือแก้ query | [05-backend-api.md](05-backend-api.md) |
| เพิ่มหน้า admin ใหม่ทั้งหน้า | 01 ข้อ 4 → 02 → 04 → 05 ตามลำดับ แล้วดูเช็กลิสต์ท้าย 03 |
| ทดสอบ / ตรวจก่อนส่ง | [06-testing-and-verification.md](06-testing-and-verification.md) |
| งาน Figma | [07-figma.md](07-figma.md) |
