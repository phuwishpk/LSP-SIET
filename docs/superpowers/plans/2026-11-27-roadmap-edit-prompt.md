# Roadmap Edit-by-Instruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner of a roadmap types an instruction and the AI changes that roadmap in place, with a free one-step undo.

**Architecture:** A new module `community/siet_community/roadmap_edit.py` holds a pure operation applier, the LLM call + grounding of new nodes, and the Redis undo. Two routes in `community/siet_community/routers/community.py` charge, call it and sync the feed post. The ai-roadmap viewer gets an edit panel.

**Tech Stack:** FastAPI, SurrealDB (`RoadmapSession.save_graph`), Redis (`cache_service`), MariaDB points, Next 13 pages app (ai-roadmap/app), node --test.

**Spec:** docs/superpowers/specs/2026-11-27-roadmap-edit-prompt-design.md

## Global Constraints

- Instruction 1–500 characters; owner only (`_my_roadmap_or_404`).
- Point kind `roadmap_edit`, 3 pt, env `POINTS_COST_ROADMAP_EDIT`; refunded on AI failure, no change, or rule break.
- Depth ≤ 2 below a main node (`roadmap_plan.MAX_DEPTH`), ≤ 200 nodes (`roadmap_plan.MAX_NODES`), ≥ 3 main nodes (`roadmap_plan.MIN_MAIN_NODES`).
- Existing node ids are kept; new nodes get ids from `roadmap_plan.next_node_ids`.
- Undo key `roadmap:undo:<session id>`, TTL 7 days (604800 s), valid only while `graph_fingerprint(current) == after`.
- UI copy: button "สั่งแก้ด้วย AI", undo "ย้อนการแก้ล่าสุด", summary "เพิ่ม N · ลบ N · แก้ N" (parts with 0 left out).
- Commits in the owner's name, no Claude attribution lines; no push.

## Review Focus

- Model output that references unknown ids, or a `ref` before it is defined → that op is skipped, the rest still apply.
- `move` of a node under its own descendant (cycle) or that would push its subtree past depth 2 → skipped.
- Ops that would leave < 3 main nodes → `InvalidInputError`, nothing saved, points refunded.
- An expansion after an edit → undo answers 409 and does not erase the expansion.
- Malformed model answer (no JSON, `ops` not a list) → `ExternalServiceError`, refund.

---

### Task 1: Pure operation applier

**Files:**
- Create: `community/siet_community/roadmap_edit.py`
- Test: `community/tests/test_roadmap_edit.py`

**Interfaces:**
- Produces: `apply_edit_ops(nodes: list[dict], ops: list) -> tuple[list[dict], dict]` returning `(new_nodes, {"added": [ids], "removed": [ids], "updated": [ids]})`; raises `InvalidInputError` when fewer than 3 mains remain or nothing changed. Also `rebuild(nodes) -> (nodes, edges)` helper used by Task 2 (renumber + `roadmap_plan.derive_edges`).

- [ ] **Step 1: Write failing tests** (base fixture: mains n1 พื้นฐาน, n2 แนวคิดหลัก, n3 ฝึกปฏิบัติ, n4 child of n2, each with `sources`):
  - `test_add_main_after_node_takes_its_stage_and_renumbers` — add `{op:add, ref:"a", label:"Docker", after:"n2"}` → new id `n5`, category แนวคิดหลัก, mains' `order` = 1..4 with n5 right after n2, edge n2→n5 and n5→n3.
  - `test_add_children_under_a_node_added_in_the_same_answer` — add ref "a" main + add `{parent:"a"}` → child parent == new id, level 1.
  - `test_remove_takes_descendants` — remove n2 → n4 gone, `removed == ["n2","n4"]`.
  - `test_update_keeps_sources_and_id` — update n1 label → same id, sources unchanged, `updated == ["n1"]`.
  - `test_move_child_to_main` — move n4 parent null after n1 → level 0, category พื้นฐาน.
  - `test_unknown_ids_and_cycles_are_skipped` — remove "zz", move n2 under n4, plus one valid update → only the update applies.
  - `test_depth_limit` — add under a level-2 node is skipped.
  - `test_too_few_mains_is_refused` — remove n1 and n2 → `InvalidInputError`.
  - `test_nothing_changed_is_refused` — `[]` or update with same text → `InvalidInputError`.
  - `test_untouched_nodes_are_identical` — after an add, n1/n3/n4 dicts equal the input except `order`.
- [ ] **Step 2:** `cd platform && uv run --no-sync pytest ../community/tests/test_roadmap_edit.py -q` → FAIL (module missing).
- [ ] **Step 3: Implement.** Work on a tree (ordered mains list + parent→ordered children); `after` positions among the target's siblings (end when not a sibling); a main's stage = `stage_of(op.stage)` else the `after` node's stage else the last main's; children take the parent's category; label via `_one_line(…, MAX_LABEL_CHARS)`, description via `_clip(…, MAX_DESCRIPTION_CHARS)`; stop adding at 200 nodes. Rebuild: mains sorted by (stage index, position), `order` 1..n, children `order` 1..k per parent, `level` from depth, edges from `derive_edges`.
- [ ] **Step 4:** same command → PASS; also `test_roadmap_plan.py` still passes.
- [ ] **Step 5:** commit `feat(roadmap): apply AI edit operations to a roadmap`.

### Task 2: LLM edit, grounding of new nodes, undo

**Files:**
- Modify: `community/siet_community/roadmap_edit.py`
- Test: `community/tests/test_roadmap_edit.py`

**Interfaces:**
- Consumes: Task 1; `roadmap_plan` (`_passage_block`, `relevant_passages`, `attach_library_sources`, `web_topics`, `web_note_ids`, `research_on_web`, `merge_research`, `grounding_label`, `graph_fingerprint`, `STAGES`); `rag.retrieve`; `_invoke_chat`; `_extract_json`; `cache_service`.
- Produces: `async edit_roadmap(*, session, instruction, notebook_ids=None, source_ids=None, web_mode="auto") -> dict` (`{"added","removed","updated","summary"}`, saves via `session.save_graph()` and writes the undo snapshot); `async undo_edit(session) -> None` (raises `InvalidInputError` when no valid snapshot); `async can_undo(session) -> bool` (False on any cache error). Constants `UNDO_TTL = 604800`, `EDIT_SYSTEM_PROMPT`.

- [ ] **Step 1: Failing tests** (monkeypatch `_invoke_chat`, `rag.retrieve`, `research_on_web`, `library.source_metadata`, a dict-backed `cache_service`, `session.save_graph`):
  - `test_edit_saves_new_graph_and_snapshot` — reply adds one node → `save_graph` called, snapshot `nodes` == old nodes, `after` == fingerprint of new nodes, ttl 604800.
  - `test_prompt_lists_nodes_and_instruction` — prompt contains `n2 |`, the instruction text and every stage.
  - `test_new_nodes_get_web_research_only_they` — `research_on_web` topics ids == added ids.
  - `test_malformed_answer_raises_external_error` — reply `"no json"` / `{"ops": "x"}` → `ExternalServiceError`, no save.
  - `test_undo_restores_and_clears` / `test_undo_after_expansion_is_refused` (fingerprint mismatch → `InvalidInputError`, nothing saved) / `test_can_undo_false_when_cache_fails`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Passages: `rag.retrieve(instruction, notebook_ids, allow_global_fallback=False, source_ids=…)` only with notebook_ids. Prompt: title, stages, node lines `id | parent or - | stage | label — description[:160]`, `_passage_block`, instruction; ask for `{"summary": str, "ops": [...]}` with the four op shapes from the spec and "change only what the instruction asks". Added nodes: `refs`/`from_library` from the op (as `build_children` does) then `attach_library_sources`; web like `expand_node`; grounding merged like `expand_node`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(roadmap): AI edits a roadmap from an instruction, with one-step undo`.

### Task 3: Points kind and routes

**Files:**
- Modify: `platform/siet_platform/points.py` (COSTS + docstring), `community/siet_community/repository.py` (`roadmap_point_stats` kinds), `community/siet_community/routers/community.py` (`RoadmapEditBody`, `POST /roadmaps/mine/{id}/edit`, `POST /roadmaps/mine/{id}/edit/undo`, `can_undo` in `_roadmap_detail`), `platform/frontend/src/lib/utils/community-format.ts`, `platform/frontend/src/components/admin/UsagePanel.tsx` (label `แก้ Roadmap ด้วย AI`)
- Test: `community/tests/test_roadmap_edit_router.py`

**Interfaces:**
- Consumes: Task 2.
- Produces: edit response = `_roadmap_detail(...)` + `{"changes": {added, removed, updated}, "summary", "synced_post_id", "charged", "balance"}`; undo response = detail + `{"synced_post_id"}`; detail gains `can_undo: bool`.

- [ ] **Step 1: Failing tests** (pattern of `test_roadmap_sync.py`): edit charges `roadmap_edit` and syncs a shared post; `InvalidInputError` → 400 + refund; `ExternalServiceError` → 502 + refund; instruction "" or 501 chars → 422; undo with nothing → 409; undo syncs a shared post; `points.COSTS["roadmap_edit"] == 3`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement, mirroring `expand_my_roadmap` (scope via `_expansion_scope`, same exception→refund mapping).
- [ ] **Step 4:** run new + `test_roadmap_sync.py` + `test_roadmap_scope.py` → PASS; frontend `npx tsc --noEmit` in platform/frontend clean.
- [ ] **Step 5:** commit `feat(roadmap): edit and undo routes, roadmap_edit point kind`.

### Task 4: Edit panel in the roadmap viewer

**Files:**
- Create: `ai-roadmap/app/src/lib/roadmap-edit.js`, `ai-roadmap/app/src/lib/roadmap-edit.test.mjs`, `ai-roadmap/app/src/components/EditPanel.jsx`
- Modify: `ai-roadmap/app/src/pages/roadmap/[id].jsx`, `ai-roadmap/app/src/components/RoadmapGraph.jsx` (`changedIds` prop → class `node-changed`), `ai-roadmap/app/src/styles/app.css`

**Interfaces:**
- Consumes: Task 3 responses.
- Produces: `changeSummary({added, removed, updated}) -> string`; `editBlockedReason({text, cost, balance, exempt}) -> string|null`; `EDIT_MAX = 500`; `EDIT_EXAMPLES` (array of Thai strings).

- [ ] **Step 1: Failing tests:** `changeSummary({added:['a','b'],removed:['c'],updated:['d','e','f']}) === 'เพิ่ม 2 · ลบ 1 · แก้ 3'`; zero parts left out; all zero → `'ไม่มีการเปลี่ยนแปลง'`; `editBlockedReason` → `'พิมพ์สิ่งที่อยากให้แก้ก่อน'` for blank, `'ขาดอีก 2 แต้ม'` for balance 1 cost 3, null when exempt.
- [ ] **Step 2:** `node --test ai-roadmap/app/src/lib/*.test.mjs` → FAIL.
- [ ] **Step 3:** implement lib, `EditPanel` (textarea maxLength 500 with counter, example chips that fill the box, submit "แก้ด้วย AI · 3 แต้ม" / "แก้ด้วย AI · ฟรี" when exempt, owl `study` while busy, undo button when `can_undo`), header toggle "สั่งแก้ด้วย AI", toast with `changeSummary`, highlight changed (added + updated) nodes until the next selection/edit; Material 3 styling in the existing layer.
- [ ] **Step 4:** lib tests PASS; `npx next build` in ai-roadmap/app passes (then restart the :3006 dev server); live check with Playwright against :3006 + test API :5056 (admin1, real LLM): edit, see summary + highlight, undo.
- [ ] **Step 5:** commit `feat(ai-roadmap): สั่งแก้ด้วย AI panel with undo`.
