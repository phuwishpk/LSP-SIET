# KMITL RAG AI: semantic answer cache, web on demand, KMITL-only verified web sources

Date: 2026-11-27 · Status: approved by the owner ("โอเค") · Branch: `feat/rag-owl-m3`

## Why

The owner wants KMITL RAG AI (`POST /community/ask`, page `/community/ask`) to cost less **without
losing answer quality**, and wants every web fact to come from KMITL itself, from a page that
really exists: "scope ทั้งหมด ให้ search ภายใต้ kmitl หรือ สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบังเท่านั้น",
"ต้องตรวจสอบด้วยว่าข้อมูลที่ดึงมานั้นเว็บนั้นมีอยู่จริง". Acceptance test named by the owner: ask
institution-scope questions such as the number of students; the answer must carry correct
references.

## Today (main 6be88b3 + this branch)

- `kmitl-rag/kmitl_rag/routers/ask.py` `ask()`: single questions (no session) use an **exact**
  cache: `answer_cache_key()` (lower-cased, whitespace-collapsed question + notebook ids + source ids
  + fallback flag + web mode + language + model) → `rag:answer:v1:<sha1>`, TTL `RAG_ANSWER_CACHE_TTL`
  600 s; a hit refunds the point (`cached: true`); `_INFLIGHT` makes simultaneous identical
  questions share one provider call. Not invalidated when a document is added.
- `kmitl-rag/kmitl_rag/ask.py` `quick_ask()`: retrieve ≤6 chunks → LLM call 1 (library only, emits a
  coverage line full/partial/none + "missing") → if `wants_web(mode, coverage)` (auto: partial or
  none; always: every time) LLM call 2 with Gemini `google_search` (`grounding.invoke_chat(...,
  use_search=True)`), web text appended under a heading, sources `[Wn]` from
  `grounding.web_sources()` (`grounding_chunks[].web.uri` = Google redirect URL, `title` usually the
  domain), markers via `insert_web_markers()`.
- `WEB_SYSTEM_PROMPT` asks for `site:kmitl.ac.th` first but allows one unrestricted search and
  only *flags* non-KMITL facts.
- Notebook chat (`routers/notebook_ask.py`) already has a 3-tier semantic cache in
  `platform/siet_platform/cache/answer_cache.py` (exact; semantic ≥0.97 reuse; 0.92–0.97 reuse only
  if `intent_validator.validate_intent_match` says yes; else miss), scope = `context_fingerprint`
  incl. per-notebook `knowledge_version` from `compute_notebook_knowledge_version()`
  (SurrealDB `fn::compute_notebook_knowledge_version`).

## Goals

1. **Semantic answer cache for single questions on /community/ask**, reusing
   `siet_platform.cache.answer_cache` (exact + semantic-high + intent-validated semantic-mid).
   Shared only within the same scope; a new/changed document in the scope makes old answers
   unusable at once (knowledge version in the key). TTL 1 h (`LSP_SIET_ANSWER_CACHE_TTL`). A hit
   costs no points (as today) and the response says `cached: true` with how it matched.
2. **Web only when needed.** Web mode `auto`: search automatically only when the library coverage is
   `none`. Coverage `partial` → the answer is returned library-only with `web_offer: true`; the page
   shows a **"ค้นเว็บเพิ่ม"** button under that answer. Pressing it runs the web step for that answer,
   appends the web section to the shown answer and to the stored conversation message.
   Free (no points), **once per answer** (server-enforced). Mode `always` unchanged (always
   searches); mode `off` unchanged.
3. **Web results cache**: the web step's result (text + verified sources) is cached by the
   *missing-topic* text (semantic, same 3 tiers) per language, TTL 24 h, shared across users and
   scopes (web facts do not depend on the library scope).
4. **KMITL only.** The web step searches only KMITL: prompt requires every query to start with
   `site:kmitl.ac.th` (or a `*.kmitl.ac.th` subdomain) and forbids unrestricted searches; and the
   server **filters**: any source whose verified final host is not `kmitl.ac.th` or a subdomain is
   dropped, with the sentences that cite only dropped sources. If no KMITL source survives, the web
   section is the fixed sentence "ไม่พบข้อมูลจากเว็บไซต์ของ สจล." (and its English twin for `en`),
   never an unreferenced claim.
5. **Verified existence.** Every web source is resolved server-side before it is shown: follow the
   Google redirect to the final URL, require HTTP 2xx, final host under `kmitl.ac.th`. The reference
   shows the **real final URL** (not the expiring Google redirect). Failing / timing-out sources are
   dropped (with their sentences). Verification results are cached (ok 24 h, failed 1 h).

## Non-goals

- AI Roadmap and Notebook chat keep searching the general web (owner did not ask to change them;
  restricting Roadmap would remove reading links for general topics). Their code paths must not
  change behaviour; shared helpers get new opt-in parameters.
- Checking that the page *text* supports each sentence (an extra LLM read per question) – later, if
  wanted. Sentences already map to Google grounding chunks taken from that page.
- Session mode (`mode: session`) answers are not cached (they depend on history).
- Image/video sources, OCR.

## Anti-goals

- An answer from another scope, or from before a document was added, shown as current.
- A web fact without a working KMITL link next to it, or a link that 404s.
- The "ค้นเว็บเพิ่ม" button becoming a free unlimited LLM endpoint.
- Server-side link checks reachable for arbitrary hosts (SSRF).

## Approaches considered

1. **Reuse `siet_platform.cache.answer_cache` + a small web-verify module in kmitl-rag** (chosen):
   one cache implementation (metrics, intent validation, circuit breaker, analytics already exist);
   only adds a payload/TTL extension and a KMITL link verifier.
2. Own semantic cache inside kmitl-rag: duplicates embeddings/thresholds/validation; two systems to
   tune. Rejected.
3. Vertex AI Search data store over kmitl.ac.th for a true domain-restricted search: separate Google
   Cloud project, crawl setup, extra cost; Gemini API `google_search` has no include-domain option
   (only Vertex documents `exclude_domains`). Rejected for now; the prompt + server filter gives
   KMITL-only output.

## Design

### A. Answer cache (single questions)

- Scope key: `context_fingerprint`-style hash of: sorted readable `notebook_ids` **with each one's
  knowledge version**, sorted `source_ids`, `allow_global_fallback`, web mode, language, model id,
  a prompt version string (`rag-ask-v2`). Knowledge versions are fetched for all notebooks **in one
  SurrealDB query** (auto scope can be dozens of notebooks); on failure use 0 (looser but working).
  **Global fallback (builder-check ruling):** `_resolve_scope` sets `allow_global_fallback=True` for
  every `auto` request, and `quick_ask` searches the whole workspace only when the scoped search
  finds nothing. `retrieve()`/`quick_ask()` therefore report `fell_back: bool`; an answer built from
  the global fallback is **not stored** (its context is outside the knowledge-version key). Lookups
  still run for every single question, so `auto` (most traffic) benefits. `allow_global_fallback`
  stays in the key so a fallback-capable scope never shares entries with a strict one.
- Must confirm while building that adding/removing a library document (course, personal, staff
  notebook) changes `fn::compute_notebook_knowledge_version` for that notebook; if not, bump it from
  library ingest/delete (there is an `invalidate_after_notebook_change` helper).
- Stored value: the full result dict (answer, citations, web_sources, web_used, web_queries,
  web_mode, coverage, web_offer). `answer_cache.set_cached_answer` stores only `answer`; extend it
  with an optional `payload: dict` stored alongside (returned on hit) and an optional per-call
  `ttl`. Notebook chat callers are unaffected (defaults keep today's behaviour).
- Lookup order in `ask()`: answer cache (exact → semantic-high → semantic-mid validated with
  `validate_intent_match`) → `_INFLIGHT` coalescing (keyed by exact key as today) → `quick_ask`.
- Hit: refund the point (as today), `cached: true`, `cache_match: "exact"|"similar"`; the page
  keeps its note "คำตอบเดียวกับที่เพิ่งถามไปเมื่อสักครู่ ไม่ตัดแต้ม" for exact and shows
  "ใช้คำตอบของคำถามที่คล้ายกัน ไม่ตัดแต้ม" for similar. The old `rag:answer:v1` cache goes away.
- If a cached answer had `web_offer: true` and someone already added web to it, the cached payload is
  updated so the next asker gets the web part too (best effort).

### B. Web step

- `wants_web`: `always` → yes; `auto` → only `coverage == "none"`; `off` → no.
  `auto` + `partial` → `web_offer: true` in the result (not when `off`, not when web already ran).
- New endpoint `POST /community/ask/web` body `{conversation_id, message_id}` (the stored assistant
  message). Server loads that message (must belong to the caller), requires
  `meta.web_offer == true` and `meta.web_added` not set, rebuilds the web prompt from the stored user
  question + `meta.missing` (store `missing` in meta when offering) + scope label + language, runs
  the web step, appends the web section to the message content, sets `web_added: true`,
  `web_sources`, `web_used`; returns `{answer, web_sources}`. Same per-user spam guard as ask.
  No points. Second call → 409.
- Web result cache: key = language + normalized missing-topic text (fall back to the question),
  semantic tiers as in A, TTL 24 h, context key constant `rag-web:kmitl:v1`.
- Prompt (`WEB_SYSTEM_PROMPT`): every query must start with `site:kmitl.ac.th` or a KMITL subdomain;
  never search without it; answer only from KMITL pages; if they lack the answer say so. Keep the
  current-year hint.
- **Question-independent web text (builder-check ruling):** the web prompt is built from the
  missing topic (`missing`, or the question when there is none, e.g. coverage `none` or mode
  `always`) + language + current year only - not the full question or scope label - so a cached
  web section fits any question with the same gap. The library part already answers the question
  itself.

### C. KMITL filter + existence check (`kmitl_rag/web_verify.py`)

- Input: `grounding.web_sources()` result + metadata. For each source URL (max 5, concurrent,
  ~4 s total budget per source): follow redirects **manually** (max 5 hops); allowed hop hosts:
  the Google grounding redirect host (`vertexaisearch.cloud.google.com`) and `kmitl.ac.th` /
  `*.kmitl.ac.th`; any other host, a non-http(s) scheme, an IP literal, or a private address →
  reject (SSRF guard; resolve the host and refuse private/loopback/link-local addresses). GET,
  streamed, body not read beyond a few KB, browser-like User-Agent.
- **What counts as "exists" (builder-check ruling):** final status 2xx → exists. 401/403/429 → the
  server answered for that path but blocks bots: counted as exists (a real student can open it).
  404/410, other 4xx, 5xx, DNS failure, connection error, timeout → does not exist → drop. Plain
  `http://` KMITL pages are accepted. TLS certificate errors on `*.kmitl.ac.th` are retried once
  without certificate verification (status only, no content used); still failing → drop.
- **Text kept (builder-check ruling, owner wants correct references):** the web section is rebuilt
  from grounding supports only: each supported segment whose sources include at least one surviving
  KMITL source is kept, followed by its renumbered `[Wn]` markers; every other sentence (unsupported
  intros, links, the model's own "not found" lines, segments backed only by dropped sources) is
  removed. When anything was removed and something survived, add the fixed line
  "บางส่วนไม่พบแหล่งอ้างอิงบนเว็บไซต์ของ สจล. จึงไม่แสดง". When nothing survives: the fixed
  "ไม่พบข้อมูลจากเว็บไซต์ของ สจล." only.
- Cache per original URL: ok → final URL 24 h; fail → 1 h.
- Reference list shows title (page title if Google gave one, else host) + the real URL.

### D. Page (`/community/ask`)

- Under an assistant answer with `meta.web_offer && !meta.web_added`: button "ค้นเว็บเพิ่ม (เว็บ สจล.)"
  with a one-line hint "เอกสารตอบได้บางส่วน ค้นข้อมูลเพิ่มจากเว็บไซต์ของ สจล. ได้ (ไม่ตัดแต้ม)".
  Pressing shows the study owl in that bubble while waiting, then the appended web part and its
  references. Error → toast, button stays.
- The web-mode card text says searches are limited to KMITL websites.

## Acceptance (owner)

Ask institution-scope questions on the branch stack, e.g. "สจล. มีนักศึกษาทั้งหมดกี่คน",
"ค่าเทอมคณะครุศาสตร์อุตสาหกรรมฯ เท่าไร": every `[Wn]` opens a live page on `*.kmitl.ac.th`; no
non-KMITL reference; when KMITL pages lack it the answer says so. Ask a paraphrase → served from the
cache (no points, `cache_match: similar`) with the same references. Add a document to the scope →
the same question is answered fresh.

## Left to the builder

Exact module/function names beyond those above, test shapes, the SurrealDB batch query for
knowledge versions, how the payload is stored next to the existing answer-cache entry.
