# KMITL RAG AI animated owl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /community/ask uses the animated shared `PinkOwlMascot` instead of the PNG `OwlMascot`, and the PNG owl is deleted.

**Architecture:** Give the shared SVG owl two small props (`still`, `label`) plus a reduced-motion rule, then swap the four call sites on the ask page and delete the old component, its keyframes and its images.

**Tech Stack:** Next.js (platform/frontend host app), React, styled-jsx, Tailwind, Vitest + Testing Library.

**Spec:** docs/superpowers/specs/2026-11-27-rag-owl-mascot-design.md

## Global Constraints

- Import the owl as `import { PinkOwlMascot } from '@shared/mascot'` (allowed for kmitl-rag; only `@siet/*` is layered).
- Owl labels, verbatim: `น้องฮูก ผู้ช่วย AI` (idle/wave), `น้องฮูกกำลังคิดคำตอบ` (study while pending).
- Keep `my-ai-quiz/app/public/mascot/owl-idle.png` and the quiz's own `PinkOwlMascot` copy untouched.
- Tests run from `platform/frontend` (`npm ci` first if `node_modules` is missing): `npx vitest run <paths>`.
- Commits in the user's name, no Claude attribution lines.

## Review Focus

- Visitor with "reduce motion" on → no owl moves anywhere (ask, login). Test: Task 1 checks the CSS contains the `prefers-reduced-motion: reduce` block.
- Several owls on one page → gradients (`url(#bodyGrad)` …) still resolve; duplicate SVG ids must not break the body fill. Task 1: ids made unique per instance with React `useId`; test asserts two rendered owls have different gradient ids and each `fill` points at its own.
- Long conversation → only the newest answer's owl animates. Task 2 test: two assistant messages → exactly one avatar owl without `owl-still`.
- Owl as a flex-row avatar must not stretch or shrink (the old PNG needed `shrink-0 self-start`). Task 2 passes `className="mr-2 mt-1 shrink-0 self-start"`.
- Screen readers: decorative owls are hidden, avatar owls are announced. Task 1 test covers both.

---

### Task 1: Shared owl gains `still`, `label`, reduced motion and unique ids

**Files:**
- Modify: `shared/mascot/PinkOwlMascot.tsx`
- Modify: `platform/frontend/vitest.config.ts` (add `'../../shared/**/*.{test,spec}.?(c|m)[jt]s?(x)'` to `include`)
- Test: `shared/mascot/PinkOwlMascot.test.tsx`

**Interfaces:**
- Produces: `PinkOwlMascot({ mood?: OwlMood; size?: number | string; className?: string; still?: boolean; label?: string })`. Root element: `role="img"` + `aria-label={label}` when `label` is set, else `aria-hidden="true"`. `still` adds class `owl-still` to the inner `action-*` div.

- [ ] **Step 1: Write the failing tests** in `shared/mascot/PinkOwlMascot.test.tsx`:
  - `labels the owl when label is given`: `render(<PinkOwlMascot label="น้องฮูก ผู้ช่วย AI" />)` → `screen.getByRole('img', { name: 'น้องฮูก ผู้ช่วย AI' })` exists.
  - `is decorative without a label`: `container.firstChild` has `aria-hidden="true"`; `queryByRole('img')` is null.
  - `still keeps the pose but marks it still`: `render(<PinkOwlMascot mood="wave" still />)` → an element with both classes `action-wave` and `owl-still`.
  - `gives each owl its own gradient ids`: render two owls; collect `radialGradient` ids → 2 distinct; each owl's body path `fill` equals `url(#<its own id>)`.
  - `stops motion for reduced-motion visitors`: the rendered `<style>` text contains `prefers-reduced-motion: reduce` and `.owl-still`.
- [ ] **Step 2: Run** `cd platform/frontend && npx vitest run ../../shared/mascot` → FAIL (no `label`/`still`, fixed ids).
- [ ] **Step 3: Implement.** Add the two props; `const uid = useId().replace(/:/g, '')` and suffix the four `<defs>` ids (`bodyGrad`, `softShadow`, `capTopGradFixed`, `tasselGoldGradFixed`) and their `url(#…)` users. Add to the styled-jsx block:
  ```css
  .owl-still *, .owl-still { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  ```
  (styled-jsx scopes `*` to this component.) Element ids used only as CSS hooks (`#leftEyeGroup` …) may stay.
- [ ] **Step 4: Run** the same command → PASS. Also `npx vitest run src/components/auth` (login uses the owl) → PASS.
- [ ] **Step 5: Commit** `feat(mascot): owl can stand still, has a label and respects reduced motion`.

### Task 2: Ask page uses the animated owl; PNG owl deleted

**Files:**
- Modify: `kmitl-rag/frontend/src/app/(dashboard)/community/ask/page.tsx` (import at line ~31; call sites ~357, ~584, ~609, ~652)
- Delete: `kmitl-rag/frontend/src/components/common/OwlMascot.tsx`, `kmitl-rag/frontend/src/components/common/OwlMascot.test.tsx`, `platform/frontend/public/mascot/owl-idle.png`, `platform/frontend/public/mascot/owl-thinking.png`
- Modify: `platform/frontend/src/styles/siet-theme.css` (delete the `owl-think` keyframes and its comment, ~line 1057)
- Test: `kmitl-rag/frontend/src/app/(dashboard)/community/ask/owl.test.tsx` only if the page can be rendered in isolation; otherwise extract the avatar choice (below) and test that.

**Interfaces:**
- Consumes: Task 1's `PinkOwlMascot` props.
- Produces: nothing used elsewhere.

Mapping (from the spec):

| Spot | Props |
|---|---|
| Header | `mood={ask.isPending ? 'study' : 'idle'} size={40}` |
| Empty state | `mood="wave" size={120}` |
| Pending bubble | `mood="study" size={36} label="น้องฮูกกำลังคิดคำตอบ"` |
| Answer avatar | `mood="idle" size={36} label="น้องฮูก ผู้ช่วย AI" still={i !== lastAssistantIndex}` |

`lastAssistantIndex` = index of the last `m.role === 'assistant'` in `messages`. Avatars and pending owl get `className="mr-2 mt-1 shrink-0 self-start"`.

- [ ] **Step 1: Write the failing test.** Preferred: render the page with its hooks mocked the way existing kmitl-rag page tests do (see `admin/rag/page.test.tsx` for the mocking pattern) with two assistant messages; assert two `getAllByRole('img', { name: 'น้องฮูก ผู้ช่วย AI' })` and exactly one of them lacks a descendant with class `owl-still`. If mocking the page is too heavy, extract `function avatarIsStill(index: number, messages: { role: string }[]): boolean` into the page's folder (`ask/avatar.ts`) and test: `[user, assistant, user, assistant]` → index 1 true, index 3 false.
- [ ] **Step 2: Run** `cd platform/frontend && npx vitest run "../../kmitl-rag/frontend/src/app/(dashboard)/community/ask"` → FAIL.
- [ ] **Step 3: Implement** the mapping; delete the four files and the keyframes.
- [ ] **Step 4: Verify.**
  - Same vitest command → PASS.
  - `git grep -n -w -E "OwlMascot|owl-think|owl-idle\.png|owl-thinking\.png" -- ':!docs' ':!my-ai-quiz'` → no output (`-w` keeps `PinkOwlMascot` out of the match).
  - `npx tsc --noEmit -p .` in platform/frontend → no new errors; `npx vitest run src/layering.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(kmitl-rag): animated owl on KMITL RAG AI, PNG owl removed`.

### Task 3: See it in the browser

- [ ] Run the host app in dev (`cd platform/frontend && npm run dev`, API from the running local stack on :5055) or build the image the way `prod-deploy` does; open /community/ask signed in; check: header owl idle → study while asking; empty state waves; only the newest answer's owl moves; macOS "Reduce motion" on → nothing moves; dark mode still readable.
- [ ] No commit (verification only). Report screenshots/observations to the owner. Do not merge or push to main (push to main deploys lsp-siet.site).
