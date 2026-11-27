# AI Roadmap: edit a roadmap with a typed instruction

Date: 2026-11-27 · Branch: feat/rag-owl-m3 · Approved in conversation ("สั่งแก้ทั้ง roadmap", go-ahead given)

## Why

Today the only way to change a generated roadmap is "ขยายหัวข้อ" on one node. A student who
wants "add Docker after Backend", "drop the testing part" or "make it shorter" has to generate
a whole new roadmap (15 pt) and loses the sources, the feed post and any expansions.

## Goals

- A box on the roadmap page where the owner types an instruction; the AI changes the roadmap
  in place (same id, same link, same feed post).
- Parts the instruction does not touch stay exactly as they were, sources included.
- One-step undo, free.
- A roadmap already shared in the feed updates its post by itself (as expansion does).

Non-goals: renaming the roadmap title, editing someone else's roadmap, version history beyond
one step, editing nodes by hand (drag/drop, inline text).

Anti-goals: the AI silently rewriting or dropping nodes the user did not ask about; a roadmap
left in a shape the viewer cannot draw (depth > 2, > 200 nodes, < 3 main nodes).

## Approaches

- A. The AI returns the whole roadmap again. Simple, but it can drift on parts nobody asked
  about, loses per-node sources, and is slow/expensive for big roadmaps.
- **B. (picked) The AI returns a list of operations** — add / remove / update / move — that the
  server validates and applies. Untouched nodes are never rewritten; the answer is short.

## Design

- `POST /api/community/roadmaps/mine/{id}/edit` `{instruction: 1–500 chars}`, owner only.
  Charged `roadmap_edit` (new kind, 3 pt, `POINTS_COST_ROADMAP_EDIT`), refunded when the AI
  fails or its operations change nothing / break the rules.
- The model sees the title, the five stages, every node as `id | parent | stage | label —
  short description`, the library passages for the instruction (same saved scope as
  expansion) and the instruction. It replies
  `{"summary": str, "ops": [...]}`:
  - `add {ref, label, description, parent|null, after|null, stage?}` — `ref` lets later ops
    put children under a node added in the same answer;
  - `remove {id}` — the node and everything under it;
  - `update {id, label?, description?}`;
  - `move {id, parent|null, after|null, stage?}`.
- Applying (pure function): unknown ids and ops that would go deeper than 2 levels are
  skipped; ids are kept for existing nodes, new nodes get fresh `n<k>` ids; main nodes are
  re-sorted by stage then position and renumbered, children renumbered per parent, levels and
  edges re-derived. Fewer than 3 main nodes → refused. Nothing changed → refused. Ceiling
  200 nodes.
- New nodes get library sources from the passages and web research exactly like expanded
  nodes (`web_topics` / `merge_research`, saved web mode).
- Undo: before saving, `{after: graph_fingerprint(new), nodes, edges, grounding}` of the old
  roadmap goes to Redis `roadmap:undo:<id>` for 7 days.
  `POST .../edit/undo` restores it only while the roadmap is still exactly the edited version
  (an expansion after the edit ends the undo). The detail response carries `can_undo`.
- Frontend (ai-roadmap app, roadmap page): a "สั่งแก้ด้วย AI" button in the header opens a
  panel with the textarea (500 chars), example chips, the cost, and "ย้อนการแก้ล่าสุด" when
  `can_undo`. After an edit: toast "เพิ่ม 2 · ลบ 1 · แก้ 3" and the changed nodes are
  highlighted on the graph.
- Labels for the new point kind in the wallet history and the admin usage panel; roadmap
  point stats count it.

## Builder's calls (mine)

- Undo lives in Redis, not a new SurrealDB field: `roadmap_session` is SCHEMAFULL and a
  migration for a convenience is not worth it. If Redis is down the edit still works, undo
  is just not offered.
- A changed description keeps the node's existing sources.
- 3 pt: more than an expansion (2) because the model reads the whole roadmap.
