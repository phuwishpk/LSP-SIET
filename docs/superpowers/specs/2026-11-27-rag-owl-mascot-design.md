# KMITL RAG AI: animated owl replaces the PNG owl

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

## Left to the builder

Exact sizes (avatar ~36px wide, header ~40px), and the test shape for the new props.
