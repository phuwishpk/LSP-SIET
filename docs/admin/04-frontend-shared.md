# 04 — ชิ้นส่วน frontend ที่หน้า admin ใช้ร่วมกัน

> component ร่วม, ชั้น API client, hooks ของ TanStack Query และตัวช่วยจัดรูปแบบ
> ทุก path ใต้ `open-notebook/frontend/src/`

## 1. Component ร่วมใน `components/admin/`

### 1.1 `AdminPageHeader.tsx`

```tsx
<AdminPageHeader icon={ShieldCheck} title="จัดการระบบ" description="…">
  {/* children = ปุ่มด้านขวา เช่น สร้างบัญชี */}
</AdminPageHeader>
```

แถวเดียว: กล่องไอคอน 40×40 (`rounded-xl border bg-card`), `h1.text-xl.font-semibold.tracking-tight`,
คำอธิบาย `text-sm text-muted-foreground`, children ชิดขวา. ไม่ใช่ server component (มี icon prop)

### 1.2 `StatTile.tsx`

```tsx
<StatTile icon={Coins} label="แต้มคงเหลือรวม" value={7417} hint="ใช้ไป 7 วัน 1354" accent />
```

| prop | ความหมาย |
|---|---|
| `icon` | lucide icon; สี `text-subtle-foreground` หรือ `text-ai` เมื่อ `accent` |
| `value` | `number` (จัด `toLocaleString()` ให้) หรือ `string` (เช่น `฿0.16`, `67%`, `—`) |
| `hint?` | บรรทัดเล็กใต้ตัวเลข |
| `accent?` | **ใช้เฉพาะเรื่อง AI และแต้ม/เครดิต** — เป็นสิ่งเดียวที่ทำให้สีม่วงปรากฏในหน้า monochrome |

การ์ดเป็น `Card.gap-0.py-0` + `CardContent.p-4` (ไม่ใช้ padding 24 ของ Card ปกติ)
แทนที่ `StatCard`/`Kpi`/`StatTile` ที่เคยซ้ำกันใน `admin/page.tsx`, `UsagePanel`, `RoadmapStatsPanel`

### 1.3 `StatCharts.tsx`

กราฟทำเอง (div/SVG ไม่ใช้ไลบรารี) ตามหลักของ `dataviz` skill: สีเดียวต่อซีรีส์, แท่งบาง ช่องไฟ 2px
มุมบน 4px, ตัวเลขเป็นสีตัวอักษร, อ่านค่าได้ด้วย hover/focus และมี "ดูเป็นตาราง" เสมอ

```ts
export type ChartTone = 'ai' | 'neutral'          // 'ai' = bg-ai (ม่วง), 'neutral' = bg-primary (ดำ)
export const dayLabel = (iso: string) => string     // '2026-10-08' → '8 ต.ค.' (th-TH)
export function DailyColumns({ days, rows: DayCount[], unit, tableHeading, emptyLabel, tone = 'ai' })
export function BarList({ rows: { label: string; value: number }[], tone = 'ai' })
```

- `DailyColumns`: เติมวันที่ไม่มีข้อมูลเป็น 0 ทุกวันใน `days`; ถ้า `days > 31` รวมเป็นรายสัปดาห์
  (สิ้นสุดวันนี้); แกน y ปัดด้วย `niceMax` (4, 5, 10, 20, 50 …); แถวข้อความด้านบน `aria-live`
  เปลี่ยนตามแท่งที่ชี้/โฟกัส; แต่ละแท่งเป็น `<button aria-label="วัน: n หน่วย">` จึงใช้คีย์บอร์ดได้
- `BarList`: แท่งแนวนอนยาวสูงสุด 85% ของพื้นที่ + ตัวเลขท้ายแท่ง; ค่า 0 ไม่วาดแท่ง
- ข้อยกเว้น: กราฟค่าใช้จ่ายใน `UsagePanel` (`DailyCostChart`) ยังเป็น SVG ของตัวเองเพราะมี tooltip
  แบบลอยและค่าเป็นทศนิยม — ถ้าจะรวมให้ย้ายมาที่นี่

### 1.4 `controls.tsx`

```ts
export const VISIBILITY_OPTIONS = [{ value: 'visible', label: 'แสดงอยู่' }, { value: 'deleted', label: 'ซ่อนไว้' }, { value: 'all', label: 'ทั้งหมด' }] as const
export type Visibility = 'visible' | 'deleted' | 'all'
export function Segmented<T extends string>({ value, onChange, options, label, className })   // role="group" aria-label={label}, ปุ่ม aria-pressed
export function Pager({ offset, pageSize, total, onChange })                                   // คืน null เมื่อหน้าเดียว; onChange(offsetใหม่)
export function RangeSelect({ value, onChange })                                              // <select> 7/30/90 วันล่าสุด พร้อมคำว่า "ช่วงเวลา"
export function EmptyState({ children })                                                      // กรอบเส้นประ ข้อความกลาง
```

`Segmented` ปุ่มที่เลือก `bg-primary text-primary-foreground`, มุม `rounded-sm`, `whitespace-nowrap`

### 1.5 `PostCounts.tsx`

`<PostCounts counts={{ like, comment, share }} />` → ไอคอนเส้น `Heart`/`MessageCircle`/`Repeat2` ขนาด 12px
พร้อมตัวเลข, มี `sr-only` ป้ายไทยให้ screen reader; แทนอีโมจิ ❤️ 💬 🔁 ที่เคยใช้

## 2. ชั้น API — `lib/api/admin.ts`

- ทุกฟังก์ชันใน `adminApi` ใช้ `apiClient` (axios ที่เติม `Bearer` token ให้อัตโนมัติ, base URL จาก `/config`)
  และคืน `response.data`
- `viewerWindow(days)` = `{ days, tz_offset: -new Date().getTimezoneOffset() }` — ใช้กับ endpoint สถิติทุกตัว
  (`roadmapStats`, `quizStats`, `communityStats`, `ragStats`) เพื่อให้ "วัน" ตัดตามเขตเวลาของผู้ดู
- `type Visibility = 'visible' | 'deleted' | 'all'` (ภายในไฟล์) ใช้กับ `roadmapPosts`, `quizPosts`

ฟังก์ชันและ type ที่เพิ่มรอบนี้ (ของเดิม: users, posts, courses, pointsLog, health, import, usage, throttle, roadmaps):

| ฟังก์ชัน | endpoint | type ที่คืน |
|---|---|---|
| `quizzes({ q, origin, limit, offset })` | `GET /admin/quizzes` | `AdminQuizList { items: AdminQuiz[], total, offset }` |
| `deleteQuiz(id)` | `DELETE /admin/quizzes/{id}` (encodeURIComponent เพราะ id มี `:`) | `{ ok, deleted }` |
| `quizPosts({ state, limit, offset })` | `GET /admin/quizzes/shared` | `AdminQuizPostList` |
| `quizStats(days)` | `GET /admin/quizzes/stats` | `AdminQuizStats` |
| `communityStats(days)` | `GET /admin/community/stats` | `AdminCommunityStats` |
| `comments({ q, limit, offset })` | `GET /admin/comments` | `AdminCommentList` |
| `deleteComment(id)` | `DELETE /admin/comments/{id}` | `{ ok, deleted }` |
| `ragStats(days)` | `GET /admin/rag/stats` | `AdminRagStats` |
| `documents({ q, status, scope, limit, offset })` | `GET /admin/rag/documents` | `AdminDocumentList { items, total, offset, by_status }` |
| `retryDocument(id)` | `POST /admin/rag/documents/{id}/retry` | `{ ok }` |
| `deleteDocument(id)` | `DELETE /admin/rag/documents/{id}` | `{ ok, deleted }` |

Type สำคัญ (ดู field เต็มใน [05-backend-api.md](05-backend-api.md)):

- `DayCount { day: 'YYYY-MM-DD'; count }` — ใช้กับ `DailyColumns`
- `Person { id; username?; display_name?; role? }` (ไม่ export) — ผู้ใช้แบบย่อในทุกสถิติ
- `AdminQuiz` — `origin: 'own' | 'imported'`, `from_library`, `shared_post: { post_id, is_deleted, play_count } | null`, `owner: Person | null` (null = บัญชีถูกลบ)
- `QuizAttempts { total; completed; players; avg_score_pct: number | null }`
- `AdminQuizPost` — เหมือน `AdminRoadmapPost` + `question_count`, `counts.play`, `counts.cashback`, `attempts`
- `AdminRagStats.coverage { full; partial; none; unknown }`, `.usage.cost_thb` (เติมฝั่ง router), `.policy` = `LlmThrottle['per_user_ask_policy']`
- `DocumentStatus = 'processing' | 'ready' | 'failed'`; `AdminDocument` ไม่มี `file_path`/`content_hash` โดยตั้งใจ

## 3. Hooks — `lib/hooks/use-admin.ts`

### 3.1 Query keys (`ADMIN_KEYS`)

ทุก key ขึ้นต้นด้วย `'admin'` จึง invalidate ทั้งก้อนได้ด้วย `ADMIN_KEYS.root`. key ที่เพิ่มรอบนี้:

```
quizzesRoot  ['admin','quizzes']        quizzes(params)  ['admin','quizzes','list',params]
quizPosts(params) ['admin','quizzes','posts',params]      quizStats(days) ['admin','quizzes','stats',days]
communityStats(days) ['admin','community','stats',days]
commentsRoot ['admin','comments']       comments(params) ['admin','comments',params]
ragStats(days) ['admin','rag','stats',days]
documentsRoot ['admin','rag','documents']  documents(params) ['admin','rag','documents',params]
```

### 3.2 Query hooks

| hook | พิเศษ |
|---|---|
| `useAdminQuizzes({q, origin, offset})`, `useAdminQuizPosts({state, offset})`, `useAdminComments({q, offset})`, `useAdminDocuments({q, status, scope, offset})` | หน้าละ 25 (`CONSOLE_PAGE`), `placeholderData: previous` เพื่อไม่กระพริบตอนเปลี่ยนหน้า/กรอง |
| `useAdminDocuments` | `refetchInterval` 4000ms เมื่อ `by_status.processing > 0` (ทำดัชนีเบื้องหลัง) |
| `useAdminQuizStats(days)`, `useAdminCommunityStats(days)`, `useAdminRagStats(days)` | key ผูกกับ `days` |
| `useSystemHealth` / `useAdminUsage` / `useLlmThrottle` (เดิม) | refetch 60s / 60s / 10s |

### 3.3 Mutation hooks และ cache ที่ถูก invalidate

| hook | ทำอะไร | invalidate |
|---|---|---|
| `useModeratePost({id, action: 'delete' \| 'restore'})` (เดิม, ขยาย) | ซ่อน/กู้คืนโพสต์ | `postsRoot`, `roadmapsRoot`, `quizzesRoot`, `commentsRoot`, `overview` — เพราะโพสต์โผล่ในหลายแท็บ |
| `useDeleteQuiz(id)` | ลบ quiz_session | `quizzesRoot` |
| `useDeleteComment(id)` | ลบความคิดเห็นถาวร | `commentsRoot`, `postsRoot` (comment_count เปลี่ยน) |
| `useDocumentAction({id, action: 'retry' \| 'delete'})` | ทำดัชนีใหม่/ลบเอกสาร | `documentsRoot`, `health`, `['community','library']` (คลังของผู้ใช้ก็เห็นผล) |
| `useUpdateUser` / `useAdjustPoints` / `useCreateUser` / `useDeleteUser` / `useBulkDeleteUsers` (เดิม) | บัญชี | `usersRoot`, `overview` ผ่าน `useInvalidate()` |
| `useCsvImport(kind)` (เดิม) | นำเข้า | `root` + `['community','courses']` (ไม่ invalidate เมื่อ dry run) |

ทุก mutation แจ้งผลด้วย `toast` (sonner) และส่ง error เข้า `toastApiError()` จาก `use-community.ts`
ซึ่งแปลสถานะ 402/409/429/503 เป็นข้อความไทย ที่เหลือใช้ `detail` จาก API

## 4. ตัวช่วยจัดรูปแบบ — `lib/utils/community-format.ts`

| ฟังก์ชัน | ใช้ทำอะไร |
|---|---|
| `parseServerDate(value)` | MariaDB DATETIME มาเป็น ISO ไม่มีโซน → ตีความเป็น UTC |
| `timeAgo(value)` | "15 วันที่ผ่านมา" (date-fns, locale th) |
| `roleLabel(role)` | admin/teacher/student → ผู้ดูแล/อาจารย์/นักศึกษา |
| `displayName(user)` | `display_name` → `username` → "ไม่ทราบชื่อ" |
| `KIND_LABELS`, `kindLabel(kind)` | ชนิดรายการ**แต้ม** (`rag_question`, `quiz_generate`, `admin_grant`, `balance_adjust` …) |
| `POST_TYPE_LABELS`, `postTypeLabel(type)` | ชนิด**โพสต์** summary/question/quiz/roadmap/material → สรุป/คำถาม/ควิซ/Roadmap/สื่อการสอน (**เพิ่มรอบนี้**; อย่าใช้ `kindLabel` กับชนิดโพสต์) |
| `formatBytes(size)` | ขนาดไฟล์ในตารางเอกสาร |
| `roomLabel(room)`, `answerSourceNote(...)` | ใช้ฝั่ง community |

## 5. ชิ้นส่วนนอกโฟลเดอร์ admin ที่ถูกแตะ

| ไฟล์ | การเปลี่ยน |
|---|---|
| `components/layout/AppSidebar.tsx` | กลุ่มเมนู admin 3 กลุ่ม, `activeHref` แบบ longest-match, ถอดโลโก้, ปุ่ม `Menu` ตอนพับ |
| `components/layout/AppSidebar.test.tsx` | mock `usePathname` เอง; test ใหม่: จัดกลุ่ม admin, ซ่อนกลุ่มจาก teacher, ไฮไลต์เฉพาะหน้าปัจจุบัน |
| `lib/locales/*/index.ts` (14 ภาษา) | `common.appName` = "LSP-SIET" |
| `app/layout.tsx` | โหลดฟอนต์ Inter + IBM Plex Sans Thai + Noto Sans Thai เป็นตัวแปร CSS |
| `app/globals.css` | ธีม `.theme-siet` (ดู 02) |
| `lib/hooks/use-library.ts` (`useKnowledge`) | ไม่ได้แก้ แต่ `RagKnowledgePanel` ใช้ซ้ำ |
| `lib/hooks/use-community.ts` (`useDeleteCourse`, `toastApiError`) | ไม่ได้แก้ แต่ `RoomsPanel` และทุก mutation ใช้ |
