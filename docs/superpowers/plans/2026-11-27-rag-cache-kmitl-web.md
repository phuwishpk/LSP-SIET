# KMITL RAG AI: semantic cache, web on demand, KMITL-only verified sources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/community/ask` reuses answers to similar questions per scope, searches the web only when needed (button for partial coverage), and shows only verified, live `*.kmitl.ac.th` web references.

**Architecture:** Extend `siet_platform.cache.answer_cache` with a stored payload and per-call TTL; a new `kmitl_rag/answer_reuse.py` builds scope keys (with a batched content fingerprint per notebook) and runs the 3-tier lookup; a new `kmitl_rag/web_verify.py` resolves Google redirect links safely, keeps only live KMITL pages and rebuilds the web text from grounding supports; `kmitl_rag/ask.py` gets a reusable `web_step()`; the router adds `POST /community/ask/web`; the page gets a "ค้นเว็บเพิ่ม" button.

**Tech Stack:** FastAPI, Redis (cache_service), SurrealDB, httpx, Gemini google_search grounding; Next.js/React (host app + kmitl-rag package), Vitest, pytest.

**Spec:** docs/superpowers/specs/2026-11-27-rag-cache-kmitl-web-design.md

## Global Constraints

- KMITL host rule: host == `kmitl.ac.th` or endswith `.kmitl.ac.th` (case-insensitive, no port tricks).
- Fixed Thai copy: `ไม่พบข้อมูลจากเว็บไซต์ของ สจล.` · `บางส่วนไม่พบแหล่งอ้างอิงบนเว็บไซต์ของ สจล. จึงไม่แสดง` · cache notes `คำตอบเดียวกับที่เพิ่งถามไปเมื่อสักครู่ ไม่ตัดแต้ม` (exact) / `ใช้คำตอบของคำถามที่คล้ายกัน ไม่ตัดแต้ม` (similar) · button `ค้นเว็บเพิ่ม (เว็บ สจล.)` · hint `เอกสารตอบได้บางส่วน ค้นข้อมูลเพิ่มจากเว็บไซต์ของ สจล. ได้ (ไม่ตัดแต้ม)`. English twins for `en`: `No information was found on KMITL websites.` / `Some parts had no reference on KMITL websites and are not shown.`
- TTLs: answer cache 3600 s (existing `LSP_SIET_ANSWER_CACHE_TTL`); web cache 86400 s; link check ok 86400 s, failed 3600 s.
- Prompt version string in the scope key: `rag-ask-v2`. Web cache context key: `rag-web:kmitl:v1`.
- Async only; every cache/network failure degrades to "no cache"/"source dropped", never a 500.
- AI Roadmap (`community/siet_community/roadmap_plan.py`) and notebook chat behaviour must not change.
- Backend tests: `cd platform && PYTHON_DOTENV_DISABLED=1 uv run --no-sync python -m pytest -q <paths>`; known baseline failures: `docs/lsp-siet/known-failures.txt`. Frontend: `cd platform/frontend && npx vitest run <paths>`.
- Commits in the owner's name, no attribution lines.

## Review Focus

- Adding a document to a course/personal library → the next identical question in that scope is answered fresh. The existing `fn::compute_notebook_knowledge_version` = notebook version + MAX(source versions): a **new** source (default version 1) does not change it. Task 3 fingerprints each notebook with (knowledge_version, number of referenced sources, latest source `updated`) and tests that a new source changes the key.
- A redirect chain that leaves Google/KMITL hosts (or points at 127.0.0.1 / 10.x / a hostname resolving to a private IP) → rejected without a request to that host. Task 2 tests each.
- Two different scopes asking the same question → never share an entry (Task 3 test).
- "ค้นเว็บเพิ่ม" pressed twice / on someone else's message / on a message without an offer → 409 / 404 / 409, no LLM call (Task 5 tests).
- A grounding segment cited by both a dropped and a kept source → kept with only the kept source's renumbered marker (Task 2 test).

---

### Task 1: answer_cache stores a payload and takes a per-call TTL

**Files:** Modify `platform/siet_platform/cache/answer_cache.py` (`_entry_metadata`, semantic-mid candidate dict, `set_cached_answer`). Test: `kmitl-rag/tests/test_answer_cache_payload.py` (follow the Redis fakes in `test_answer_cache_phase4.py`).

**Interfaces — Produces:**
- `set_cached_answer(..., payload: Optional[dict] = None, ttl: Optional[int] = None)`; `payload` stored on both the exact and semantic entries; `ttl` (default `ANSWER_CACHE_TTL`) used for both keys and `expires_at`.
- `get_cached_answer` match dicts carry `"payload"` (exact, semantic_high) and `"candidate_payload"` (semantic_mid); `None` when absent.

- [ ] Step 1 — tests: `test_exact_hit_returns_payload`, `test_semantic_high_hit_returns_payload`, `test_mid_candidate_carries_payload`, `test_custom_ttl_is_used` (assert the fake's recorded ttl == 86400 for both keys), `test_old_entries_without_payload_still_hit` (payload is None).
- [ ] Step 2 — run, expect FAIL (unexpected kwarg).
- [ ] Step 3 — implement; notebook chat callers unchanged.
- [ ] Step 4 — run new + `kmitl-rag/tests/test_answer_cache_phase2.py kmitl-rag/tests/test_answer_cache_phase4.py` → PASS.
- [ ] Step 5 — commit `feat(cache): answer cache keeps a result payload and a per-call TTL`.

### Task 2: KMITL link verification and web-text rebuild

**Files:** Create `kmitl-rag/kmitl_rag/web_verify.py`. Test: `kmitl-rag/tests/test_web_verify.py`.

**Interfaces — Produces:**
- `is_kmitl_host(host: str) -> bool`
- `async verify_url(url: str, *, fetch=None) -> Optional[str]` — final live URL or None. `fetch` is an injectable `async (url) -> (status:int, location:Optional[str])` for tests; default uses `httpx.AsyncClient(follow_redirects=False, timeout=4.0)`, GET with `stream`, browser-like `User-Agent`. Manual redirects ≤5 hops; allowed hosts: `vertexaisearch.cloud.google.com` (first hop only) and KMITL hosts; schemes http/https; IP literals and hosts resolving (via `asyncio.get_running_loop().getaddrinfo`) to private/loopback/link-local/reserved addresses rejected. Status 2xx/401/403/429 → exists; others/timeouts/errors → None. TLS error on a KMITL host → one retry with `verify=False`. Results cached in `cache_service` under `rag:web:url:<sha1>` (ok 86400 s stores final URL, fail 3600 s stores `""`).
- `async verify_sources(sources: list[dict]) -> dict[int, str]` — concurrent `verify_url` for each `{index,title,url}`; returns `{old_index: final_url}` for survivors.
- `rebuild_web_text(text: str, metadata: dict, chunk_to_index: dict[int,int], kept: dict[int,str], titles: dict[int,str], language: str) -> tuple[str, list[dict], bool]` — returns `(text, sources, removed_any)`. Text = supported segments (from `metadata["grounding_supports"]`, in order, de-duplicated) whose chunk indices map to at least one kept source, each followed by its renumbered `[Wn]` markers (renumbered 1..n in first-use order); `sources` = `[{index, title, url(final)}]` in that order; if anything was dropped and something survived, append the fixed partial line; if nothing survived, text = the fixed not-found line and sources = [].

- [ ] Step 1 — tests (fake `fetch`): `test_kmitl_hosts` (`kmitl.ac.th`, `REG.KMITL.AC.TH`, `siet.kmitl.ac.th` true; `kmitl.ac.th.evil.com`, `notkmitl.ac.th`, `kmutt.ac.th` false); `test_google_redirect_to_live_kmitl_page_returns_final_url`; `test_404_and_timeout_are_dropped`; `test_403_and_429_count_as_existing`; `test_redirect_to_other_host_is_rejected_without_fetching_it` (fetch call log has no non-allowed host); `test_private_ip_and_ip_literal_rejected`; `test_more_than_five_hops_rejected`; `test_result_is_cached` (second call makes no fetch); `test_rebuild_keeps_only_segments_backed_by_kept_sources` (segment backed by dropped+kept keeps only the kept marker, renumbered `[W1]`); `test_rebuild_adds_partial_line_when_something_was_dropped`; `test_rebuild_nothing_kept_gives_not_found_line` (th + en).
- [ ] Step 2 — run, expect FAIL (module missing).
- [ ] Step 3 — implement.
- [ ] Step 4 — run → PASS.
- [ ] Step 5 — commit `feat(kmitl-rag): verify web references are live KMITL pages and rebuild the web text from them`.

### Task 3: scope keys and answer reuse for /community/ask

**Files:** Create `kmitl-rag/kmitl_rag/answer_reuse.py`. Test: `kmitl-rag/tests/test_answer_reuse.py`.

**Interfaces — Consumes:** Task 1. **Produces:**
- `async notebook_fingerprints(notebook_ids: list[str]) -> dict[str, str]` — ONE SurrealDB query over all ids returning per notebook `"<knowledge_version>:<referenced source count>:<max source updated>"`; on error every id → `"0"`.
- `async scope_key(*, notebook_ids, source_ids, allow_global_fallback, web, language, model_id) -> str` — hash of `answer_cache_key(question="", ...)` + sorted `id=fingerprint` pairs + `rag-ask-v2`.
- `async lookup(question: str, key: str, language: str, model_id: str) -> Optional[tuple[dict, str]]` — `(payload, "exact"|"similar")`; tiers: exact/semantic_high return payload; semantic_mid → `validate_intent_match(...)` True → candidate_payload; else None. Entries without payload → None.
- `async store(question: str, key: str, language: str, payload: dict, model_id: str, ttl: Optional[int] = None) -> None` (best effort).
- `async default_model_id() -> str` — id of the default chat model (for validation/enrichment when the request has no `model_id`).

- [ ] Step 1 — tests (fake repo_query + fake cache): `test_new_source_changes_the_key` (same ids, source count 3→4 → different key); `test_different_scopes_never_share` ; `test_fingerprints_use_one_query_for_many_notebooks` (40 ids → repo_query called once); `test_fingerprint_failure_falls_back_to_zero`; `test_lookup_exact_and_similar_return_payload`; `test_mid_requires_intent_validation` (validator False/None → None, True → payload); `test_entry_without_payload_is_a_miss`.
- [ ] Step 2 — run, FAIL.
- [ ] Step 3 — implement.
- [ ] Step 4 — PASS.
- [ ] Step 5 — commit `feat(kmitl-rag): reuse answers to similar questions within the same scope`.

### Task 4: web step: KMITL-only, on demand, cached; retrieval reports fallback

**Files:** Modify `kmitl-rag/kmitl_rag/ask.py` (`retrieve`, `quick_ask`, `wants_web`, `WEB_SYSTEM_PROMPT`, new `web_step`), update `kmitl-rag/tests/test_community_grounding.py` (wants_web table, web tests use fake `verify_sources`). Test new behaviour in `kmitl-rag/tests/test_web_step.py`.

**Interfaces — Consumes:** Tasks 1–2. **Produces:**
- `wants_web(mode, coverage)`: always→True; auto→`coverage == "none"`; off→False. `offers_web(mode, coverage, web_ran) -> bool`: auto and partial and not web_ran.
- `async web_step(*, topic: str, language: str, owner_id, model_id) -> dict` → `{"text", "sources", "queries", "searched"}`; prompt from topic + language + current year only (no question/scope); web cache via `store/lookup`-style answer_cache calls with context `rag-web:kmitl:v1`, ttl 86400, payload = the result; after the LLM call: `verify_sources` → `rebuild_web_text`.
- `WEB_SYSTEM_PROMPT`: every query starts with `site:kmitl.ac.th` or a KMITL subdomain; never search without it; answer only from KMITL pages; say plainly when they lack it; keep the current-year hint.
- `retrieve()` returns citations plus sets a flag; `quick_ask` result gains `"fell_back": bool`, `"web_offer": bool`, `"missing": str`.

- [ ] Step 1 — tests: `test_auto_partial_offers_web_without_searching`; `test_auto_none_searches`; `test_always_searches_even_when_full`; `test_web_prompt_has_no_question_or_scope` (captured prompt lacks the question text and scope label, contains topic); `test_web_step_result_is_cached_by_topic` (second call, same topic → no LLM call); `test_web_step_drops_unverified_sources` (fake verify keeps 1 of 2); `test_fallback_is_reported` (scoped search empty → `fell_back` True); `test_system_prompt_requires_site_filter` (`"site:kmitl.ac.th"` in prompt and no "without the site: filter" allowance).
- [ ] Step 2 — FAIL. Step 3 — implement. Step 4 — run new + `test_community_grounding.py` → PASS.
- [ ] Step 5 — commit `feat(kmitl-rag): web only when the library has nothing, KMITL pages only, cached per topic`.

### Task 5: router: reuse in /ask, POST /ask/web, history update

**Files:** Modify `kmitl-rag/kmitl_rag/routers/ask.py`, `kmitl-rag/kmitl_rag/history.py` (add `get_message(conversation_id, message_id)` and `update_message(message_id, content, meta)`), update `kmitl-rag/tests/test_ask_cache_and_policy.py`. Test: `kmitl-rag/tests/test_ask_web_endpoint.py`, `kmitl-rag/tests/test_ask_reuse_router.py`.

**Interfaces — Consumes:** Tasks 3–4. **Produces:**
- `/ask` (single, no session): `key = scope_key(...)`, `lookup` before `_INFLIGHT`; hit → refund, response `cached: true`, `cache_match: "exact"|"similar"`; miss → `quick_ask`; store unless `fell_back` or session; drop the `rag:answer:v1` read/write (keep `answer_cache_key` for `_INFLIGHT`). Response + stored meta gain `web_offer`, `missing`, `cache_match`; stored meta also `message_id` is returned via `GET /ask/history/{id}` as today (messages carry `id`).
- `POST /community/ask/web` body `{conversation_id: str, message_id: int}` → `{answer, web_sources, message_id}`; 404 not caller's conversation/message; 409 `meta.web_offer` falsy or `meta.web_added`; spam guard `ask`; no points; appends `\n\n**<heading>**\n\n<text>` (same headings as quick_ask), sets meta `web_added: true, web_sources, web_used`.
- `POST /ask` returns `message_id` of the stored assistant message (needed by the button right after asking).

- [ ] Step 1 — tests (fakes for repo/points/quick_ask/web_step): `test_similar_question_served_from_cache_without_points`; `test_fallback_answers_are_not_stored`; `test_session_answers_skip_cache`; `test_web_button_appends_and_marks_added`; `test_web_button_twice_is_409_and_no_llm_call`; `test_web_button_on_other_users_message_is_404`; `test_web_button_without_offer_is_409`; update key tests (namespace assertion may stay).
- [ ] Step 2 — FAIL. Step 3 — implement. Step 4 — PASS + `kmitl-rag/tests` full dir (compare against known failures).
- [ ] Step 5 — commit `feat(kmitl-rag): similar questions reuse answers; ค้นเว็บเพิ่ม adds KMITL web info on demand`.

### Task 6: page: cache notes, "ค้นเว็บเพิ่ม" button, KMITL wording

**Files:** Modify `platform/frontend/src/lib/api/community.ts` (types: `AskResponse.cache_match?`, `web_offer?`, `message_id?`; `RagStoredMessage.meta.web_offer?/web_added?`; `askWeb(conversationId, messageId)`), `platform/frontend/src/lib/hooks/use-community.ts` (`useAskWeb` mutation), `kmitl-rag/frontend/src/app/(dashboard)/community/ask/page.tsx`, `kmitl-rag/frontend/src/components/community/AskWebButton.tsx` (+ test).

**Interfaces — Consumes:** Task 5 API.

- [ ] Step 1 — tests `AskWebButton.test.tsx`: renders `ค้นเว็บเพิ่ม (เว็บ สจล.)` + hint; click calls `onAsk`; while pending shows the study owl (`role=img` name `น้องฮูกกำลังคิดคำตอบ`) and disables; hidden when `webAdded`.
- [ ] Step 2 — FAIL. Step 3 — implement; page: messages keep `messageId`, `webOffer`, `webAdded`, `cacheMatch`; on success replace content/webSources of that bubble; cache note per Global Constraints copy; web card copy states searches are limited to KMITL websites.
- [ ] Step 4 — `npx tsc --noEmit -p .` + vitest on `../../kmitl-rag/frontend/src` → PASS.
- [ ] Step 5 — commit `feat(kmitl-rag): ค้นเว็บเพิ่ม button and similar-answer note on KMITL RAG AI`.

### Task 7: live check with institution questions (owner's acceptance)

- [ ] Restart `owltest-api` with the branch's changed backend files mounted (kmitl_rag package + siet_platform cache) and the `:3005` frontend.
- [ ] Ask with web `auto`, scope ทุกแหล่ง, as admin1: "สจล. มีนักศึกษาทั้งหมดกี่คน", "ค่าเทอมหลักสูตรครุศาสตร์อุตสาหกรรมฯ เท่าไร", "ปฏิทินการศึกษา สจล. ภาคเรียนที่ 2 ปีนี้เปิดเรียนวันไหน". For each `[Wn]`: open the final URL with curl → 2xx/403 on `*.kmitl.ac.th`; no other hosts. Record answers + URLs.
- [ ] Paraphrase one → `cache_match: similar`, no points, same references. Add a text document to admin1's ไฟล์ของฉัน, ask a personal-scope question twice around it → fresh answer after the add.
- [ ] Partial-coverage question → button appears; press → web part appended; press again (API) → 409.
- [ ] Report to owner with the actual answers and links. No commit.
