# KMITL RAG AI: animated owl + sources split by where they come from

Date: 2026-11-27 · Status: approved by the owner ("ย้าย ... ไป branch ใหม่ก่อนแล้วค่อยมาทำ")

## Why

The owner wants the old owl in KMITL RAG AI (/community/ask) taken out and the animated owl
(`PinkOwlMascot`, already on the login page and in AI Quiz) put in its place, so the AI page
feels like the rest of the product. This is the first, small slice of a larger request
(Material 3 + nicer, friendlier Roadmap and RAG UI), which is brainstormed separately.

## Goals

- /community/ask shows `PinkOwlMascot` everywhere it showed the PNG `OwlMascot`.
- The old PNG owl is gone: `kmitl-rag/.../common/OwlMascot.tsx`, its test, the `owl-think`
  keyframes in `platform/frontend/src/styles/siet-theme.css`, and
  `platform/frontend/public/mascot/owl-{idle,thinking}.png` (nothing else uses them;
  `my-ai-quiz/app/public/mascot/owl-idle.png` belongs to the quiz app and stays).

## Non-goals / anti-goals

- No Material 3 or layout redesign in this slice.
- A chat where every bubble's owl bobs at once would be busy and harder to read: avoid.
- Must not ignore the visitor's "reduce motion" setting.

## Approaches

1. **Use the shared `PinkOwlMascot` (`@shared/mascot`) directly in the ask page, with two small
   additions to it** (chosen): one owl for the whole product, fixes land everywhere.
2. Wrap it in a new kmitl-rag `OwlMascot` with the old `idle|thinking` API: keeps call sites, but
   adds a layer whose only job is renaming moods.
3. Copy the SVG into kmitl-rag: a third owl copy to keep in sync (quiz already has one). Rejected.

## Design

| Spot on /community/ask | Before | After |
|---|---|---|
| Header next to "KMITL RAG AI" | PNG idle / thinking | `idle`, `study` while an answer is being written |
| Empty state "เริ่มถามได้เลย" | PNG idle 72px | `wave`, ~120px |
| "กำลังค้นคลังความรู้…" bubble | PNG thinking | `study` |
| Avatar beside each answer | PNG idle | latest answer `idle` (moving), older answers still |

Additions to `shared/mascot/PinkOwlMascot.tsx`:
- `still?: boolean` – keeps the pose, stops every animation.
- `@media (prefers-reduced-motion: reduce)` stops every animation (affects login and anywhere else
  the shared owl is used – intended).
- `label?: string` – when given, the owl is `role="img"` with that `aria-label`; otherwise
  `aria-hidden` (decorative). The ask page labels the avatar owls as before
  ("น้องฮูก ผู้ช่วย AI" / "น้องฮูกกำลังคิดคำตอบ").

Import rule: `@shared/*` is allowed from kmitl-rag (the layering test only restricts `@siet/*`).

## Part 2: the source picker split by where it comes from

Owner's words: "ตรง filter ตรงเอกสาร ทำให้แยก filter แยกหมวดหมู่ที่ชัดเจน", then chose **แยกแหล่งที่มา**
(split by source type) over also splitting courses by study programme.

Today the "ค้นคำตอบจาก" card has 4 buttons (ทุกแหล่งของฉัน / รายวิชา / ไฟล์ของฉัน / เจาะจงเอกสาร) and
"เจาะจงเอกสาร" opens one native `<select>` mixing my files, every course library (~80 locally) and
teacher/admin notebooks with no headings beyond optgroups.

New card: one row of source tabs, each with its own list.

| Tab | Shows | "All of it" choice → request | One item → request |
|---|---|---|---|
| ทุกแหล่ง | the explainer text only | `scope: 'auto'` | – |
| ไฟล์ของฉัน | my ready personal uploads | `scope: 'personal'` (default) | `doc:<id>` pick → `scope: 'document'` |
| รายวิชา | course libraries (`kind === 'course'`) | per course: `scope: 'course', course_id` | a source in it: `src:<id>` pick |
| จากอาจารย์/ผู้ดูแล | `kind === 'staff'` notebooks | per notebook: `nb:<id>` pick → `scope: 'notebook'` | `src:<id>` pick |
| ของผู้ใช้ (admin only, `sees_everything`) | `kind` personal/student | `nb:<id>` | `src:<id>` |

- Lists are a radio list (one choice across the tab), notebooks/courses expandable to their documents;
  a search box filters by name/title when the tab has more than 6 entries. Sources with
  `chunks === 0` stay visible but disabled ("ยังไม่พร้อมค้น"). Empty tab → a short line saying why
  plus the existing "เพิ่มเนื้อหาให้ AI อ่าน" button.
- Requests sent to `/community/ask` keep today's shapes (no API contract change for asking).
- Backend: `list_shared_notebooks` adds `course_id: int | null` to each item (set for course
  libraries from `owner_id = course:<id>`), so the รายวิชา tab can send `scope: 'course'` with the
  right id and `?course=<id>` deep links open that course selected. `KnowledgeNotebook` gains the field.
- Deep links keep working: `?course=` → รายวิชา tab with it selected; `?doc=` → ไฟล์ของฉัน; `?notebook=`
  / `?source=` → the tab that owns that notebook (fallback: จากอาจารย์/ผู้ดูแล).
- The explainer line under the tabs stays and keeps saying exactly what the AI will read.
- Not in this slice: grouping courses by study programme (owner declined), Material 3 restyle.

## Left to the builder

Exact sizes (avatar ~36px wide, header ~40px), and the test shape for the new props.
