# 03 — หน้า admin และ panel แต่ละตัว (frontend)

> ไล่ทีละหน้า → ทีละแท็บ → component ที่แสดง, hook ที่ใช้, endpoint ที่เรียก และพฤติกรรมที่ตั้งใจ
> ชิ้นส่วนที่ใช้ร่วมกัน (StatTile, StatCharts, controls, hooks, types) อยู่ใน [04-frontend-shared.md](04-frontend-shared.md)
> response shape ของทุก endpoint อยู่ใน [05-backend-api.md](05-backend-api.md)

ทุกไฟล์อยู่ใต้ `open-notebook/frontend/src/` — path ด้านล่างละส่วนนี้ไว้

## 0. โครงที่ทุกหน้าใช้เหมือนกัน

```tsx
<AppShell>                                     // sidebar + main (components/layout/AppShell.tsx)
  <div className="flex-1 overflow-y-auto">
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <AdminPageHeader icon title description>{ปุ่มขวา (ถ้ามี)}</AdminPageHeader>
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap whitespace-nowrap">…</TabsList>   // whitespace-nowrap กันชื่อแท็บตัดบรรทัด
        <TabsContent value="…" className="mt-4"><SomePanel /></TabsContent>
      </Tabs>
    </div>
  </div>
</AppShell>
```

- หน้าเป็น `'use client'` ทั้งหมด; ไม่มี data fetching ในไฟล์ page — ทุก panel ดึงข้อมูลเอง
  ผ่าน hook ใน `lib/hooks/use-admin.ts`
- แท็บเป็น Radix Tabs ที่ไม่ผูก URL: รีเฟรชแล้วกลับแท็บแรกเสมอ (ยังไม่มี `?tab=`)
- การ์ดใช้ shadcn `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`
- สถานะว่าง: `EmptyState` (กรอบเส้นประ) · กำลังโหลด: `Skeleton`
- ลบถาวรทุกจุดใช้ `AlertDialog` ของ shadcn; ซ่อน/กู้คืนโพสต์ทำทันทีเพราะย้อนได้

---

## 1. `/admin` — จัดการระบบ

ไฟล์: `app/(dashboard)/admin/page.tsx` (503 บรรทัด; มี `UserDialog` อยู่ในไฟล์เดียวกัน)
Header: ไอคอน `ShieldCheck`, ปุ่มขวา "สร้างบัญชี" เปิด `CreateUserDialog`
ข้อมูลระดับหน้า: `useAdminOverview()` (StatTile ภาพรวม), `useAdminUsers({q, role, offset, limit: 50})`

| แท็บ (`value`) | แสดง | ที่มาของข้อมูล |
|---|---|---|
| `overview` ภาพรวม | 5 `StatTile` (ผู้ใช้ทั้งหมด/บัญชีที่ระงับ/โพสต์ในฟีด/เอกสารในคลัง/แต้มคงเหลือรวม — ใบสุดท้าย `accent`) + `HealthPanel` | `GET /admin/overview`, `GET /admin/health` |
| `users` ผู้ใช้ | ตารางผู้ใช้ (อยู่ในไฟล์ page) | `GET /admin/users` |
| `points` แต้ม | `PointsLogPanel` | `GET /admin/points/log` |
| `usage` การใช้ AI | `UsagePanel` | `GET /admin/usage`, `GET /admin/llm-throttle` |
| `import` นำเข้า CSV | `ImportPanel` | `POST /admin/import/{courses,users}` |

แท็บ "เนื้อหา" และ "ห้อง" **ถูกถอดออกจากหน้านี้** (อยู่ที่ `/admin/community`) — import ของ
`ModerationPanel`/`RoomsPanel` ในไฟล์นี้ถูกลบแล้ว

### 1.1 แท็บผู้ใช้ (ในไฟล์ page)

- ค้นหา (`useDebounce` 300ms) + `<select>` สิทธิ์ (`''|student|teacher|admin`), เปลี่ยนแล้ว `setPage(0)`
- แถวละ: checkbox เลือกลบหลายคน (ปิดไว้สำหรับตัวเองและ admin), `Avatar` (class `AVATAR_STYLE` =
  วงกลมเทาเส้นขอบ แทนสีสุ่มของแอป), ชื่อ, ชิปสิทธิ์ `ROLE_STYLE` (**monochrome**: admin ดำ,
  teacher ขาวเส้นขอบ, student เทา), ป้าย "ระงับอยู่"/"คุณ", meta บรรทัดล่าง, แต้ม (สีม่วง `text-ai` +
  ไอคอน `Coins`), ไอคอน `UserCog`
- คลิกแถว → `setSelected(u)` → `UserDialog`
- เลือกไว้ ≥1 → แถบแดงอ่อน + ปุ่ม "ลบบัญชีที่เลือก" (`window.confirm` → `useBulkDeleteUsers`)
- เพจละ 50 (`PAGE_SIZE`), ปุ่มก่อนหน้า/ถัดไปเมื่อ `pages > 1`

### 1.2 `UserDialog` (ในไฟล์ page)

`<DialogContent className="sm:max-w-lg">`; เนื้อหาห่อด้วย `div.min-w-0` เพื่อไม่ให้ข้อความประวัติแต้ม
ยาวดัน dialog กว้าง (bug ที่เคยเกิด). ส่วนประกอบ:

1. สิทธิ์: 3 ปุ่มเลือก + "บันทึกสิทธิ์" → `useUpdateUser({id, role})` (ปิดถ้าเป็นตัวเอง)
2. ปรับแต้ม: ช่องตัวเลข + เหตุผล → `useAdjustPoints({id, delta, note})`
3. ตั้งรหัสผ่านใหม่ (≥6 ตัว) → `useResetPassword`; หมายเหตุว่าบัญชี Google ไม่ได้รับผล
4. ประวัติแต้มล่าสุด: `div.max-h-40.overflow-y-auto` (เดิมเป็น `ScrollArea` — ถอดออกเพราะทำ dialog กว้าง)
5. Footer: ระงับ/คืนสิทธิ์ (`useUpdateUser({disabled})`), ลบบัญชีถาวร (`window.confirm` →
   `useDeleteUser`; ปิดถ้าเป็น admin), ปิด

### 1.3 `CreateUserDialog` — `components/admin/CreateUserDialog.tsx`

`sm:max-w-lg`; ฟิลด์ username (3-32), password (≥6), display_name, role (`<select>` default
teacher), student_id → `useCreateUser`; reset ฟอร์มเมื่อปิด

### 1.4 `HealthPanel` — `components/admin/HealthPanel.tsx`

- `useSystemHealth()` refetch ทุก 60 วิ; ปุ่ม `RefreshCw` เรียก `refetch()`
- ป้ายสถานะเป็น**จุดสี**ในกรอบเส้นขอบ (เขียว `bg-emerald-500` / แดง `bg-destructive`) ไม่ใช่พื้นสี
- 4 checks (MariaDB, SurrealDB, Redis, โมเดล AI เริ่มต้น) การ์ดละใบ; check ที่ไม่ผ่านเป็นกรอบแดงอ่อน
- 4 `Tile` เล็ก: เอกสารล้มเหลว, กำลังประมวลผล, โพสต์ที่ซ่อนไว้ (hint "กู้คืนได้ที่ จัดการ Community › โพสต์"),
  ห้องไม่มีเจ้าของ; `warn` ทำพื้น `bg-muted` + ไอคอน `TriangleAlert` สีเหลือง

### 1.5 `PointsLogPanel` — `components/admin/PointsLogPanel.tsx`

- `usePointsLog({days, kind})` → `GET /admin/points/log?limit=200`
- การ์ดบน: ชื่อ "แต้มไหลไปทางไหน" (ไอคอน `Coins` สีม่วง), segment วันนี้/7 วัน/30 วัน, ยอดแจก (เขียว)
  /ใช้ (แดง), ชิปกรองตาม `kind` (ชิปที่เลือก `border-primary bg-secondary`), "ใช้แต้มมากที่สุด" 6 คน
- การ์ดล่าง: ตาราง 200 รายการล่าสุด (`max-h-[420px]` scroll, หัวตาราง sticky)
- ป้ายชนิดแต้มมาจาก `kindLabel()` ใน `community-format.ts`

### 1.6 `UsagePanel` — `components/admin/UsagePanel.tsx`

- `useAdminUsage(days)` (refetch 60 วิ) + `useLlmThrottle()` (refetch 10 วิ); `RANGES = [7, 30, 90]`
- 4 `StatTile accent` (ค่าใช้จ่ายวันนี้/เดือนนี้, โทเค็น, ค้นเว็บเดือนนี้) — เป็นหน้าเดียวในจัดการระบบ
  ที่ใช้สีม่วงทั้งแถว เพราะทั้งหมดคือเรื่อง AI
- กราฟ `DailyCostChart` (SVG ในไฟล์นี้ ไม่ใช่ `StatCharts`): แท่งสี `fill-ai/70`, hover → `fill-ai`,
  hit-rect กว้างกว่าแท่ง, แท่งเป็น `pointer-events-none`, ป้ายค่าสูงสุด, tick ทศนิยมตาม scale,
  `<details>` ดูเป็นตาราง; ปุ่มช่วงเวลา (ที่เลือก `border-ai bg-ai-soft text-ai`)
- ตาราง "ตามฟีเจอร์" (`FEATURE_LABEL`: ask/quiz/roadmap/roadmap_expand/ingest/direct/embedding/chat)
  และ "ตามโมเดล", ตาราง "ผู้ใช้ที่ใช้มากที่สุด", การ์ด "คิวเรียก AI (สด)" จาก throttle
- โน้ตท้าย: อัตราแลกเปลี่ยน `USD_THB_RATE` และลิงก์ตารางราคา

### 1.7 `ImportPanel` — `components/admin/ImportPanel.tsx`

สองการ์ด (`ImportCard kind="courses"|"users"`): กล่องคอลัมน์, ปุ่มเลือกไฟล์ (อ่านเป็นข้อความ),
"ใส่ตัวอย่าง", `Textarea` font-mono, "ตรวจก่อน (ไม่บันทึก)" = `dryRun: true`, "นำเข้า";
ผล `ResultList` 3 กลุ่ม เพิ่มแล้ว/ข้าม/ผิดพลาด (แสดง 40 แถวแรก)

---

## 2. `/admin/community` — จัดการ Community

ไฟล์: `app/(dashboard)/admin/community/page.tsx`; ไอคอน `MessageSquare`

| แท็บ | component | endpoint |
|---|---|---|
| `overview` ภาพรวม | `community/CommunityStatsPanel` | `GET /admin/community/stats` |
| `posts` โพสต์ | `ModerationPanel` (เดิม) | `GET /admin/posts`, `DELETE /admin/posts/{id}`, `POST …/restore` |
| `comments` ความคิดเห็น | `community/CommentsPanel` | `GET /admin/comments`, `DELETE /admin/comments/{id}` |
| `rooms` ห้อง | `RoomsPanel` (แก้ 22 ต.ค.) | `GET /admin/courses`, `DELETE /community/courses/{id}` (admin = ลบถาวร) |
| `categories` หมวดหมู่ | `community/CategoriesPanel` (ใหม่ 22 ต.ค.) | `GET/POST /admin/categories`, `PATCH/DELETE /admin/categories/{id}` |

### 2.1 `CommunityStatsPanel` — `components/admin/community/CommunityStatsPanel.tsx`

- `RangeSelect` (7/30/90 วัน) → `useAdminCommunityStats(days)`
- 8 `StatTile` **ไม่มี accent** (หน้านี้ monochrome): โพสต์ใหม่, ความคิดเห็น, ถูกใจและ Helpful,
  แชร์, ผู้มีส่วนร่วม, บันทึกโพสต์, เข้าร่วมห้อง, โพสต์ที่ซ่อนไว้ทั้งหมด
- `DailyColumns tone="neutral"` (แท่งดำ) "โพสต์ใหม่ต่อวัน" (รวมเป็นสัปดาห์เมื่อ > 31 วัน)
- สองการ์ดคู่: `BarList tone="neutral"` "โพสต์แยกตามชนิด" (ลำดับจาก `POST_TYPE_LABELS`) และ
  "ผู้มีส่วนร่วมมากที่สุด" (อันดับ 8 คน: ชื่อ, @username · บทบาท, n โพสต์ · n ความคิดเห็น)
- การ์ด "โพสต์ที่มีคนตอบรับมากที่สุด" 5 โพสต์: ป้ายชนิด, ลิงก์ `/community?post=<id>` (เปิดแท็บใหม่),
  ผู้เขียน, `PostCounts`

### 2.2 `ModerationPanel` — `components/admin/ModerationPanel.tsx`

- `useAdminPosts({q, type, state, offset})` หน้าละ 25; ค้นหา + `<select>` ชนิด (`TYPES`) +
  segment แสดงอยู่/ซ่อนไว้/ทั้งหมด (ปุ่มที่เลือก `bg-primary`)
- แถว: ป้ายชนิดจาก `postTypeLabel()` (เดิมใช้ `kindLabel` ผิดตัว ทำให้ขึ้น "question"), หัวข้อ
  (ขีดฆ่าถ้าซ่อน), ป้าย "ซ่อนอยู่", ไอคอนคลิป, excerpt 2 บรรทัด, meta + `PostCounts`
- ปุ่ม: เปิดโพสต์ (`ExternalLink`), ซ่อน (ghost เทา → แดงตอนชี้) / กู้คืน (outline) → `useModeratePost`
- โน้ตท้าย: การซ่อนเปลี่ยนแค่ธง `is_deleted`

### 2.3 `CommentsPanel` — `components/admin/community/CommentsPanel.tsx`

- `useAdminComments({q, offset})` หน้าละ 25; ค้นจากข้อความ/ชื่อผู้เขียน
- แถว (`data-comment-id`): ข้อความ `line-clamp-3 whitespace-pre-line break-words`, meta
  "ผู้เขียน (@user) · เวลา · ในโพสต์" + ชื่อโพสต์เป็นลิงก์ หรือถ้าโพสต์ถูกซ่อน → ชื่อ + ป้าย "โพสต์ถูกซ่อน"
- ปุ่ม "ลบ" → `AlertDialog` แสดงข้อความที่จะลบ (`line-clamp-4` ใน `bg-muted`) → `useDeleteComment`
  **ลบถาวร** (ต่างจากโพสต์)
- `Pager`

### 2.4 `RoomsPanel` — `components/admin/RoomsPanel.tsx`

- `useAdminCourses()`; ตาราง `min-w-[860px]`: ห้อง (ไอคอน `Hash` หรือ `MessagesSquare` สีเทา
  `text-subtle-foreground`, ป้าย "เก็บถาวร", ไอคอน `KeyRound` ถ้าต้องใช้รหัสเข้าห้อง), **หมวดหมู่ / เทอม**,
  เจ้าของ (หรือป้าย "ไม่มีเจ้าของ"), สมาชิก, โพสต์, เอกสาร (club = —), โพสต์ล่าสุด, ปุ่มเปิด/ลบถาวร
- ลบถาวร: `window.confirm` (บอกว่าเอกสาร+notebook ของวิชาหายด้วย) → `usePurgeCourse()` จาก `use-courses.ts`
  — backend ลบเอกสาร/Source/embeddings/notebook แล้วปลดโพสต์กลับฟีดรวม; อาจารย์ที่กด DELETE เดียวกันจะได้
  "เก็บถาวร" แทน (ดู `docs/SYSTEM-GUIDE.md` §6.2.1)
- โน้ตเรื่องห้องไม่มีเจ้าของเป็นกล่อง `bg-muted` (เดิมเหลือง)

### 2.5 `CategoriesPanel` — `components/admin/community/CategoriesPanel.tsx` (ใหม่ 22 ต.ค. 2026)

- `useAdminCategories()` → ตาราง หมวดหมู่ (ไทย + อังกฤษ), `slug`, ลำดับ, จำนวนห้องวิชา (+ที่เก็บถาวร)
- ฟอร์มเพิ่มบนหัวตาราง (ชื่อไทยบังคับ ≥ 2 ตัว, ชื่ออังกฤษไม่บังคับ; `slug` backend สร้างจากชื่ออังกฤษ
  หรือ `cat-xxxxxx` ถ้ามีแต่ไทย) → `useCreateCategory()`
- แก้ไขในแถว (`Pencil` → input ชื่อ/อังกฤษ/ลำดับ → `Check`/`X`) → `useUpdateCategory()`
- ลบ: `AlertDialog` บอกจำนวนห้องที่จะกลายเป็น "ไม่ระบุหมวด" → `useDeleteCategory()`
- hooks ทั้งหมดอยู่ใน `lib/hooks/use-courses.ts` (คีย์ `COURSE_KEYS.adminCategories` / `categories`,
  invalidate `['admin','courses']` ด้วยเพราะตารางห้องแสดงชื่อหมวด); API ใน `lib/api/courses.ts`
  (`adminCategoriesApi`)
- หมวดเริ่มต้น 13 สาขาของ SIET + "ทั่วไป" มาจาก `open_notebook/community/catalog.py` ตอน API เริ่มทำงาน

---

## 3. `/admin/rag` — จัดการ RAG AI

ไฟล์: `app/(dashboard)/admin/rag/page.tsx`; ไอคอน `Database`; คำอธิบายย้ำว่า "เห็นเฉพาะสถิติ ไม่เห็นบทสนทนาของใคร"

| แท็บ | component | endpoint |
|---|---|---|
| `overview` ภาพรวม | `rag/RagStatsPanel` | `GET /admin/rag/stats` |
| `documents` เอกสารที่ AI อ่าน | `rag/RagDocumentsPanel` | `GET /admin/rag/documents`, `POST …/{id}/retry`, `DELETE …/{id}`, ปุ่มดาวน์โหลด → `GET /community/library/{id}/download?token=` (22 ต.ค.) |
| `knowledge` แหล่งความรู้ | `rag/RagKnowledgePanel` | `GET /community/knowledge` (endpoint เดิม, hook `useKnowledge` ใน `use-library.ts`) |

### 3.1 `RagStatsPanel` — `components/admin/rag/RagStatsPanel.tsx`

- `RangeSelect` → `useAdminRagStats(days)`; ตอนโหลดแสดง RangeSelect + Skeleton (ไม่ซ่อนตัวเลือก)
- 8 `StatTile`: คำถาม (accent), ผู้ถาม, ตอบได้ครบจากคลัง % (accent; `—` ถ้าไม่มีคำตอบ), คำตอบที่ค้นเว็บเพิ่ม,
  ตอบจากแคช, แต้มที่ใช้ (accent; hint บอกราคาจาก `costs`), ค่าใช้จ่าย AI ฿ (accent), เวลาตอบเฉลี่ย วินาที
- `DailyColumns` "คำถามต่อวัน" (ม่วง)
- การ์ดคู่: `BarList` coverage (ตอบได้ครบ/บางส่วน/ไม่พบ; เพิ่มแถว "ไม่ได้บันทึกไว้" เฉพาะเมื่อ `unknown > 0`)
  และ "เอกสารที่ถูกอ้างอิงมากที่สุด" (ชื่อเอกสาร + n คำตอบ)
- การ์ดคู่: "ผู้ที่ถามมากที่สุด" และ "คลังเอกสารและข้อจำกัดการถาม" (`Facts` 2 คอลัมน์: library counts,
  policy ต่อผู้ใช้)
- helper ในไฟล์: `fmtThb`, `fmtTokens`, `Facts`

### 3.2 `RagDocumentsPanel` — `components/admin/rag/RagDocumentsPanel.tsx`

- `useAdminDocuments({q, status, scope, offset})` หน้าละ 25; **poll ทุก 4 วิ** ขณะ `by_status.processing > 0`
- ตัวกรอง: ค้นหา, `<select>` คลัง (ทุกคลัง/รายวิชา/ส่วนตัว), `Segmented` สถานะพร้อมตัวนับจาก `by_status`
- ตาราง `min-w-[760px]` (`data-document-id`): เอกสาร (ชื่อ `truncate` + บรรทัดชนิด·ไฟล์·ขนาด +
  ข้อความ error สีแดงถ้า failed), คลัง (ไอคอน `Users` + รหัสวิชา หรือ `Lock` ส่วนตัว), เจ้าของ,
  สถานะ `StatusMark` (เขียว/หมุน/แดง), ชิ้นข้อความ, อัปเดต, ปุ่ม
- ปุ่ม "ลองใหม่" เฉพาะ `status === 'failed' && kind !== 'text'` (ข้อความที่วางไว้ไม่มีไฟล์ให้อ่านซ้ำ)
  → `useDocumentAction({action: 'retry'})`; ปุ่มลบ → `AlertDialog` (เตือนพิเศษถ้า `scope === 'personal'`)
  → `useDocumentAction({action: 'delete'})`

### 3.3 `RagKnowledgePanel` — `components/admin/rag/RagKnowledgePanel.tsx`

- `useKnowledge()` (staleTime 60 วิ) — admin ได้ทั้ง notebook ที่แชร์ (`visibility: 'shared'`) และส่วนตัว
  (`'private'`) จาก backend อยู่แล้ว
- หัวการ์ด: จำนวน notebook/เอกสาร, ทุกคนถามได้ n, เห็นเฉพาะผู้ดูแล n, "ยังค้นไม่ได้ n เอกสาร"
  (source ที่ `chunks === 0`)
- notebook ละ `<details>`: summary มี `ChevronRight` (หมุน 90° เมื่อเปิด; `list-none` ซ่อน marker เดิม),
  ไอคอน `Globe`/`Lock`, ชื่อ, ป้ายชนิด (`KIND_LABEL`: staff/course/personal/student), ป้ายสิทธิ์,
  จำนวนเอกสาร; เปิดแล้วเห็น owner_label + description + รายการ source พร้อมจำนวนชิ้นข้อความ
- โน้ตท้าย: ซ่อน notebook จากผู้ใช้ = archive ที่หน้า Notebooks (ไม่มีปุ่มในหน้านี้)

---

## 4. `/admin/roadmap` — จัดการ AI Roadmap

ไฟล์: `app/(dashboard)/admin/roadmap/page.tsx`; ไอคอน `Map`; ชื่อเดิม "จัดการ Road Map" เปลี่ยนเป็น "จัดการ AI Roadmap"

| แท็บ | component | endpoint |
|---|---|---|
| `overview` ภาพรวม | `roadmap/RoadmapStatsPanel` | `GET /admin/roadmaps/stats` |
| `all` Roadmap ทั้งหมด | `roadmap/RoadmapListPanel` | `GET /admin/roadmaps`, `DELETE /admin/roadmaps/{id}` |
| `shared` ที่แชร์ในฟีด | `roadmap/SharedRoadmapsPanel` | `GET /admin/roadmaps/shared`, moderate posts |

### 4.1 `RoadmapStatsPanel`

ถูกเขียนใหม่ให้ใช้ชิ้นส่วนร่วม (เดิมมี `StatTile`/กราฟ/แท่งของตัวเองในไฟล์): `RangeSelect` →
`useAdminRoadmapStats(days)`; 6 `StatTile` (สร้าง, แต้มที่ใช้ = accent); `DailyColumns` "Roadmap ที่สร้างต่อวัน";
`BarList` "อ้างอิงจากอะไร" (คลัง/คลัง+เว็บ/เว็บ/ความรู้ทั่วไป); อันดับ "มีคนเดินตามมากที่สุด"

### 4.2 `RoadmapListPanel`

ค้นหา + `Segmented` ทั้งหมด/สร้างเอง/เดินตามจากฟีด (`origin`), แถว (`data-roadmap-id`) มีหัวข้อ, ป้าย
origin, ป้าย "แชร์แล้ว"/"โพสต์ถูกซ่อน", meta (เจ้าของ · n ด่าน · grounding · เวลา), จำนวนคนเดินตาม;
ปุ่มขวา: "ดูโพสต์" (ถ้าแชร์) / "โพสต์ต้นทาง" (ถ้า followed) / "ยังไม่แชร์" (ไอคอน `Lock`); ปุ่ม "ลบ"
→ `AlertDialog` (ข้อความเพิ่มว่าโพสต์ที่แชร์เก็บสำเนาไว้) → `useDeleteRoadmap`

### 4.3 `SharedRoadmapsPanel`

`Segmented` สถานะ; แถว (`data-post-id`) มีหัวข้อ, ผู้เขียน · เวลา · ห้อง, n ด่าน (ด่านย่อย n) · grounding ·
`PostCounts`; ขวา: `Footprints` n คนเดินตาม, เปิดโพสต์, ซ่อน/กู้คืน → `useModeratePost`

---

## 5. `/admin/quiz` — จัดการ Quiz

ไฟล์: `app/(dashboard)/admin/quiz/page.tsx`; ไอคอน `BrainCircuit`; โครงเหมือน Roadmap ทุกประการ

| แท็บ | component | endpoint |
|---|---|---|
| `overview` ภาพรวม | `quiz/QuizStatsPanel` | `GET /admin/quizzes/stats` |
| `all` Quiz ทั้งหมด | `quiz/QuizListPanel` | `GET /admin/quizzes`, `DELETE /admin/quizzes/{id}` |
| `shared` ที่แชร์ในฟีด | `quiz/SharedQuizzesPanel` | `GET /admin/quizzes/shared`, moderate posts |

### 5.1 `QuizStatsPanel`

- export `scoreLabel(pct)` → `'—'` เมื่อ `null` (ยังไม่มีใครทำจบ) มิฉะนั้น `'67%'`; ใช้ร่วมกับ `SharedQuizzesPanel`
- 8 `StatTile`: Quiz ทั้งหมด, สร้าง (accent), นำเข้าจากฟีด, โพสต์ Quiz ในฟีด (hint เล่นสะสม), ทำควิซ
  (hint ทำจนจบ n ครั้ง · n คน), คะแนนเฉลี่ย, แต้มที่ใช้ (accent), แต้มคืนให้เจ้าของควิซ (accent)
- `DailyColumns` "Quiz ที่สร้างต่อวัน"; `BarList` "สร้างจากอะไร" (คลังความรู้ / ความรู้ทั่วไปของ AI —
  Quiz ไม่มีโหมดเว็บ); อันดับ "Quiz ที่มีคนเล่นมากที่สุด" (n ข้อ · เฉลี่ย %, n ครั้ง)

### 5.2 `QuizListPanel`

เหมือน `RoadmapListPanel` แต่ origin เป็น ทั้งหมด/สร้างเอง/นำเข้าจากฟีด (`imported`), มีป้ายเพิ่ม
"จากคลังความรู้" เมื่อ `from_library`, จำนวนครั้งที่เล่น (`Gamepad2`), แถว `data-quiz-id` → `useDeleteQuiz`

### 5.3 `SharedQuizzesPanel`

เหมือน `SharedRoadmapsPanel` แต่ meta แสดง n ข้อ · ทำจนจบ a จาก b ครั้ง · n คน · คะแนนเฉลี่ย · คืนแต้มเจ้าของ n ·
`PostCounts`; ขวา `Gamepad2` เล่น n ครั้ง

---

## 6. เช็กลิสต์เมื่อเพิ่มแท็บหรือหน้า admin ใหม่

1. ตัดสินก่อนว่าอยู่ส่วนไหนตามกติกาใน [01-overview.md](01-overview.md) ข้อ 4 (ข้ามหลายส่วน → จัดการระบบ)
2. backend: route ใน `admin.py` เรียก `_require_admin`, query ใน `repository.py`/`library.py`,
   ตอบเฉพาะข้อมูลที่ผ่านเส้นแบ่งความเป็นส่วนตัว, สถิติรายวันรับ `days` + `tz_offset` ผ่าน `_viewer_window`
3. frontend: type + ฟังก์ชันใน `lib/api/admin.ts` → query key + hook ใน `use-admin.ts` (ระบุว่า mutation
   ไหนต้อง invalidate key ไหน) → panel ใน `components/admin/<area>/` → แท็บในไฟล์ page
4. ใช้ชิ้นส่วนร่วม: `StatTile` (accent เฉพาะเรื่อง AI/แต้ม), `DailyColumns`/`BarList`
   (`tone="neutral"` ในหน้า Community), `Segmented`/`Pager`/`RangeSelect`/`EmptyState`, `PostCounts`
5. ป้ายภาษาไทยผ่าน `community-format.ts` (`postTypeLabel`, `kindLabel`, `roleLabel`, `displayName`, `timeAgo`)
6. ปุ่มลบในแถว = ghost เทา/แดงตอนชี้ + `AlertDialog`; ใส่ `data-<thing>-id` บนแถวเพื่อให้ automation จับได้
7. ถ้าเพิ่มลิงก์ใน sidebar: เพิ่มใน `getNavigation` ของ `AppSidebar.tsx` และอัปเดต
   `AppSidebar.test.tsx` (test "groups the admin consoles …" ตรวจ href ตามกลุ่มแบบตายตัว)
8. ตรวจตาม [06-testing-and-verification.md](06-testing-and-verification.md)
