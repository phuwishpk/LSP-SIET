# 08 — ดัชนีไฟล์ของส่วน admin (ทุกไฟล์ที่เกี่ยวข้อง)

> path ในเอกสารนี้ปรับตามการแยกโค้ด KMITL (23 ต.ค. 2026, `docs/ARCHITECTURE.md`): route `/admin/rag/*` และ `rag_stats`/`summarize_rag_answers` ตอนนี้อยู่ใน `kmitl-rag/kmitl_rag/{routers/admin,history}.py`, helper `_naive_utc`/`_points_spent`/`_author`/`_per_day` อยู่ใน `siet_platform/db.py`

> ไฟล์ละหนึ่งบรรทัด: อยู่ที่ไหน ใหม่หรือแก้ ทำอะไร และเอกสารไหนอธิบายละเอียด
> สถานะ ณ commit `ebffe06` (ยกเว้น `docs/figma-admin-plugin/` และ `docs/admin/` ที่ยังไม่ commit)
> "ใหม่" = ไม่มีก่อน 8 ต.ค. 2026, "แก้" = มีอยู่แล้วและถูกเปลี่ยน

## Frontend — `open-notebook/frontend/src/`

### หน้า (`app/`)

| ไฟล์ | สถานะ | หน้าที่ | เอกสาร |
|---|---|---|---|
| `app/layout.tsx` | แก้ | โหลดฟอนต์ Inter + IBM Plex Sans Thai + Noto Sans Thai เป็นตัวแปร CSS บน `<body>` | 02 §2.4 |
| `app/globals.css` | แก้ | โทเค็น `canvas`/`subtle-foreground`/`ai*` ใน `@theme inline`, `:root`, `.dark`; class `.theme-siet` (light + dark); ปิดเงา; ฟอนต์ | 02 §2 |
| `app/(dashboard)/admin/layout.tsx` | ใหม่ | ใส่ `.theme-siet` ให้ wrapper และ `<body>` ตลอดที่อยู่ใน `/admin` | 02 §3 |
| `app/(dashboard)/admin/page.tsx` | แก้ | จัดการระบบ: 5 แท็บ, ตารางผู้ใช้, `UserDialog`; ถอดแท็บเนื้อหา/ห้อง | 03 §1 |
| `app/(dashboard)/admin/community/page.tsx` | ใหม่ | จัดการ Community: ภาพรวม/โพสต์/ความคิดเห็น/ห้อง/หมวดหมู่ (แท็บหมวดหมู่ 22 ต.ค.) | 03 §2 |
| `app/(dashboard)/admin/rag/page.tsx` | ใหม่ | จัดการ RAG AI: ภาพรวม/เอกสารที่ AI อ่าน/แหล่งความรู้ | 03 §3 |
| `app/(dashboard)/admin/roadmap/page.tsx` | แก้ | จัดการ AI Roadmap (เปลี่ยนชื่อ, ใช้ `AdminPageHeader`) | 03 §4 |
| `app/(dashboard)/admin/quiz/page.tsx` | ใหม่ | จัดการ Quiz: ภาพรวม/Quiz ทั้งหมด/ที่แชร์ในฟีด | 03 §5 |

### ชิ้นส่วนร่วม (`components/admin/`)

| ไฟล์ | สถานะ | หน้าที่ | เอกสาร |
|---|---|---|---|
| `AdminPageHeader.tsx` | ใหม่ | หัวหน้าเพจ: กล่องไอคอน + ชื่อ + คำอธิบาย + ปุ่มขวา | 04 §1.1 |
| `StatTile.tsx` | ใหม่ | การ์ดตัวเลขเดียว (`accent` = ม่วง เฉพาะเรื่อง AI/แต้ม) แทน StatCard/Kpi เดิม | 04 §1.2 |
| `StatCharts.tsx` | ใหม่ | `DailyColumns` (ต่อวัน/สัปดาห์), `BarList`, `dayLabel`, `ChartTone` | 04 §1.3 |
| `controls.tsx` | ใหม่ | `Segmented`, `Pager`, `RangeSelect`, `EmptyState`, `VISIBILITY_OPTIONS` | 04 §1.4 |
| `PostCounts.tsx` | ใหม่ | ไอคอนเส้นถูกใจ/คอมเมนต์/แชร์ แทนอีโมจิ | 04 §1.5 |

### Panel ของจัดการระบบ (`components/admin/`)

| ไฟล์ | สถานะ | หน้าที่ | เอกสาร |
|---|---|---|---|
| `HealthPanel.tsx` | แก้ | สถานะระบบ 4 checks + 4 tile; ป้ายเป็นจุดสี; hint ชี้ไป Community › โพสต์ | 03 §1.4 |
| `PointsLogPanel.tsx` | แก้ | แต้มไหลไปทางไหน + รายการล่าสุด; ชิปที่เลือก monochrome | 03 §1.5 |
| `UsagePanel.tsx` | แก้ | ค่าใช้จ่าย AI: StatTile accent, กราฟ SVG `fill-ai`, ปุ่มช่วงเวลา `ai-soft` | 03 §1.6 |
| `ImportPanel.tsx` | ไม่แก้ | นำเข้า CSV รายวิชา/ผู้ใช้ | 03 §1.7 |
| `CreateUserDialog.tsx` | แก้ | สร้างบัญชี (`sm:max-w-lg`) | 03 §1.3 |
| `ModerationPanel.tsx` | แก้ | โพสต์ทั้งระบบ; `postTypeLabel`, `PostCounts`, ปุ่มซ่อนสีเทา | 03 §2.2 |
| `RoomsPanel.tsx` | แก้ | ห้องทั้งหมด; ไอคอนเทา, โน้ตพื้น `bg-muted`; คอลัมน์หมวด/เทอม, ป้ายเก็บถาวร, ลบถาวรผ่าน `usePurgeCourse` (22 ต.ค.) | 03 §2.4 |
| `community/CategoriesPanel.tsx` | ใหม่ (22 ต.ค.) | หมวดหมู่รายวิชา: เพิ่ม/แก้ในแถว/ลบ | 03 §2.5 |
| `community/ReportsPanel.tsx`, `AuditPanel.tsx` | ใหม่ (22 ต.ค.) | คิวรายงานเนื้อหา + บันทึกผู้ดูแล | 03 §2.6 |
| `lib/api/moderation.ts`, `lib/hooks/use-moderation.ts`, `components/common/ReportButton.tsx` | ใหม่ (22 ต.ค.) | API/hooks ของรายงานและ audit; ปุ่ม "รายงาน" สำเร็จรูป | 03 §2.6, SYSTEM-GUIDE §6.2.5 |
| `lib/api/courses.ts`, `lib/hooks/use-courses.ts` | ใหม่ (22 ต.ค.) | API + hooks ของห้องวิชา (รายละเอียด, เก็บถาวร, ลบถาวร, สมาชิก, TA) และ `adminCategoriesApi` | 03 §2.5, SYSTEM-GUIDE §6.2.1 |

### Panel ของ Community / RAG / Roadmap / Quiz

| ไฟล์ | สถานะ | หน้าที่ | เอกสาร |
|---|---|---|---|
| `community/CommunityStatsPanel.tsx` | ใหม่ | สถิติฟีด (monochrome) | 03 §2.1 |
| `community/CommentsPanel.tsx` | ใหม่ | ความคิดเห็นทั้งหมด + ลบถาวร | 03 §2.3 |
| `rag/RagStatsPanel.tsx` | ใหม่ | สถิติ RAG: coverage, เอกสารที่ถูกอ้าง, ผู้ถาม, คลัง/เพดาน | 03 §3.1 |
| `rag/RagDocumentsPanel.tsx` | ใหม่ | ตารางเอกสารทั้ง workspace + ลองใหม่/ลบ (poll 4 วิ) | 03 §3.2 |
| `rag/RagKnowledgePanel.tsx` | ใหม่ | notebook ที่ RAG ตอบได้ (`useKnowledge`) | 03 §3.3 |
| `roadmap/RoadmapStatsPanel.tsx` | แก้ | เขียนใหม่ให้ใช้ `StatTile`/`StatCharts`/`RangeSelect` | 03 §4.1 |
| `roadmap/RoadmapListPanel.tsx` | แก้ | ปุ่มลบสีเทา, segment มุมเล็ก | 03 §4.2 |
| `roadmap/SharedRoadmapsPanel.tsx` | แก้ | `PostCounts`, ไอคอนเทา | 03 §4.3 |
| `quiz/QuizStatsPanel.tsx` | ใหม่ | สถิติ Quiz + `scoreLabel` | 03 §5.1 |
| `quiz/QuizListPanel.tsx` | ใหม่ | Quiz ทั้งหมด + ลบ | 03 §5.2 |
| `quiz/SharedQuizzesPanel.tsx` | ใหม่ | โพสต์ Quiz + ผลการทำ | 03 §5.3 |

### เลย์เอาต์, ชั้นข้อมูล, ภาษา

| ไฟล์ | สถานะ | หน้าที่ | เอกสาร |
|---|---|---|---|
| `components/layout/AppSidebar.tsx` | แก้ | กลุ่มเมนู admin 3 กลุ่ม, `activeHref` longest-match, แบรนด์ข้อความ LSP-SIET, ปุ่มกางตอนพับ | 02 §4, 01 §4 |
| `components/layout/AppSidebar.test.tsx` | แก้ | 8 เคส รวมการจัดกลุ่มและไฮไลต์ | 06 §1 |
| `lib/api/admin.ts` | แก้ | type ทุก response + `adminApi` (+11 ฟังก์ชันใหม่), `viewerWindow` | 04 §2, 05 |
| `lib/hooks/use-admin.ts` | แก้ | `ADMIN_KEYS`, query/mutation hooks (+10 ใหม่), กติกา invalidate | 04 §3 |
| `lib/utils/community-format.ts` | แก้ | เพิ่ม `POST_TYPE_LABELS`, `postTypeLabel` | 04 §4 |
| `lib/locales/{bn-IN,ca-ES,de-DE,en-US,es-ES,fr-FR,it-IT,ja-JP,pl-PL,pt-BR,ru-RU,tr-TR,zh-CN,zh-TW}/index.ts` | แก้ | `common.appName` = "LSP-SIET" | 02 §4 |

ไฟล์ที่หน้า admin ใช้แต่**ไม่ได้แก้**: `components/layout/AppShell.tsx`, `lib/hooks/use-library.ts` (`useKnowledge`),
`lib/hooks/use-community.ts` (`useDeleteCourse`, `toastApiError`), `lib/roles.ts`, `lib/auth-redirect.ts`,
`components/ui/*` (shadcn)

## Backend — `open-notebook/`

| ไฟล์ | สถานะ | หน้าที่ | เอกสาร |
|---|---|---|---|
| `community/siet_community/routers/admin.py` | แก้ | +11 route (quizzes ×4, community/stats, comments ×2, rag ×4) + helper `_quiz_origin`, `_session_owners`, `_viewer_window`, `_viewer_day` | 05 §3 |
| `community/siet_community/repository.py` | แก้ | +`quiz_posts_by_session`, `admin_quiz_posts`, `quiz_stats`, `admin_list_comments`, `community_stats`, `summarize_rag_answers`, `rag_stats`, helper `_naive_utc`/`_pct`/`_points_spent`/`_author`/`_per_day` | 05 §4 |
| `siet-platform/siet_platform/library.py` | แก้ | +`DOCUMENT_STATUSES`, `admin_list_documents` | 05 §5 |
| `siet-platform/siet_platform/features/domain.py` | แก้ | +`QuizSession.admin_list`, `QuizSession.created_since` | 05 §5 |
| `tests/test_admin_consoles.py` | ใหม่ | 27 unit test ของ helper ข้างต้น | 06 §1 |
| `siet-platform/siet_platform/auth_roles.py` | ไม่แก้ | `/api/admin` อยู่ใน `ADMIN_PREFIXES` อยู่แล้ว | 01 §3 |

## เอกสารและเครื่องมือ — `docs/`

| ไฟล์ | สถานะ | หน้าที่ | เอกสาร |
|---|---|---|---|
| `docs/figma-admin-plugin/manifest.json` | ใหม่ (ยังไม่ commit) | manifest ปลั๊กอิน Figma แบบ development | 07 §4 |
| `docs/figma-admin-plugin/code.js` | ใหม่ (ยังไม่ commit) | สร้าง 13 หน้าจอ + 6 overlay + โยงเส้น 57 จุด | 07 §4 |
| `docs/admin/*.md` | ใหม่ (ยังไม่ commit) | ชุดเอกสารนี้ | README |

## นับรวม

- frontend: 8 ไฟล์ใน `app/` (หน้า เลย์เอาต์ ธีม) + 5 ชิ้นส่วนร่วม + 18 panel + 3 ชั้นข้อมูล + 2 sidebar + 14 locale
- backend: 4 ไฟล์โค้ด + 1 test
- endpoint ใหม่ 11, ฟังก์ชัน `adminApi` ใหม่ 11, hook ใหม่ 10, ไฟล์ component ใหม่ 13 + หน้า/เลย์เอาต์ใหม่ 4, test ใหม่ 27 (pytest) + 3 (vitest)
