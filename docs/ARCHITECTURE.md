# โครงสร้างโค้ด — platform กับอีกสี่ส่วนของ LSP-SIET

> เอกสารนี้อธิบายว่าโค้ดของ LSP-SIET อยู่ตรงไหน แต่ละส่วน import กันได้แค่ไหน
> และส่วนต่าง ๆ เสียบเข้ากับ platform ผ่านจุดไหน (ข้อความลิขสิทธิ์ MIT ของโค้ดต้นทางที่เรานำมาใช้อยู่ที่ `platform/NOTICE`)
>
> อัปเดตล่าสุด: 15 พฤศจิกายน 2026 (โครงสร้างแบบ `platform/` + 4 ส่วน — branch `refactor/lsp-siet`)

## 1. ภาพรวม

```
kmitlAI/
├── platform/      ← ฐานร่วมของทุกส่วน: siet_core, api, commands, siet_platform และแอป Next.js ตัวหลัก (host)
├── kmitl-rag/     ← KMITL RAG AI: quick-ask, ประวัติแชต, notebook ask, global chat, notebooks/sources/notes, ตัวกรองคำตอบ
├── community/     ← SIET Space: ห้องวิชา ฟีด คอมเมนต์ moderation คอนโซลอาจารย์/ผู้ดูแล
├── my-ai-quiz/    ← AI Quiz: แอป Next.js (`app/`), `siet_quiz` (API), `frontend/` (/admin/quiz)
├── ai-roadmap/    ← AI Roadmap: แอป Next.js (`app/`), `siet_roadmap` (API), `frontend/` (/admin/roadmap, /go/roadmap)
├── shared/        ← ของใช้ร่วม (มาสคอต)
└── docs/ scripts/ docker/ deploy/ Makefile
```

ทั้งหมด **รันเป็นโปรเซสเดียวต่อชั้น**: FastAPI ตัวเดียว (พอร์ต 5055) และ Next.js ตัวเดียว (host) ส่วน AI Quiz (3001)
กับ AI Roadmap (3002) เป็นแอปแยกที่เรียก API ตัวเดียวกัน แต่ละส่วนเขียนโค้ดเฉพาะในโฟลเดอร์ของตัวเอง
ส่วนอื่นลงทะเบียนตัวเองเข้า platform ผ่าน hook points (ข้อ 4)

| โฟลเดอร์ | Python (import เป็น) | หน้าเว็บ (import เป็น) | test |
|---|---|---|---|
| `platform/` | `siet_core`, `api`, `commands`, `siet_platform` | `@/...` (`platform/frontend/src`) | `platform/tests` (core) + `platform/tests-platform` (siet_platform) + `*.test.ts(x)` |
| `kmitl-rag/` | `kmitl_rag` | `@siet/kmitl-rag/...` | `kmitl-rag/tests` |
| `community/` | `siet_community` | `@siet/community/...` | `community/tests` |
| `my-ai-quiz/` | `siet_quiz` | `@siet/quiz/...` (`my-ai-quiz/frontend/src`) | `my-ai-quiz/tests` |
| `ai-roadmap/` | `siet_roadmap` | `@siet/roadmap/...` (`ai-roadmap/frontend/src`) | `ai-roadmap/tests` |

ไม่มี `@siet/platform` — โค้ดหน้าเว็บของ platform คือตัว host เอง ใช้ `@/...`

## 2. กฎการ import (layering)

```
siet_core / api / commands  ←  siet_platform  ←  kmitl_rag     ←  siet_community
                               siet_platform  ←  siet_quiz     ←  siet_community
                               siet_platform  ←  siet_roadmap  ←  siet_community
```

- แต่ละชั้น import ได้เฉพาะชั้นของตัวเองหรือชั้นทางซ้ายที่ลูกศรชี้มา
- `kmitl_rag`, `siet_quiz`, `siet_roadmap` **ไม่รู้จักกัน** มีแต่ `siet_community` ที่ import ได้ทั้งสามตัว
- **`siet_core`, `api`, `commands` ไม่ import แพ็กเกจ SIET เลย** (เข้าถึงผ่าน `siet_core.extensions` เท่านั้น)
  หน้าเว็บของ host import `@siet/*` ได้เฉพาะ
  - route stub ใน `src/app/**` (ไฟล์บรรทัดเดียว `export { default } from '@siet/...'` ที่ **สร้างอัตโนมัติ**, ข้อ 6)
  - `src/lib/extensions.installed.ts` (รายชื่อแพ็กเกจที่ติดตั้ง)
- test ข้ามชั้นได้

มีการตรวจอัตโนมัติ ถ้าใครเขียน import ผิดชั้น test จะแดง:

- backend: `platform/tests-platform/test_layering.py`
- frontend: `platform/frontend/src/layering.test.ts`

**ทำไมบางอย่างอยู่ชั้นล่างกว่าที่คิด**
- *audit log, notifications, ตัวช่วยแถวข้อมูล (`siet_platform.db`), ตัวช่วย HTTP (`siet_platform.http`)* — ทุกส่วนใช้
- *retrieval (`search_in_notebooks`) และ `ai_helpers`* อยู่ใน platform ข้างคลังเอกสาร เพราะควิซ/roadmap ก็ค้นคลังเหมือน RAG
- *ชั้นข้อมูลของหน้าเว็บ* (`lib/api/*`, `use-community`, `use-library` ฯลฯ) อยู่ใน host (`platform/frontend/src`)
  เพราะหน้าจอของทุกส่วนเรียกใช้ (หน้า `/community/ask` ของ RAG ก็อ่าน `use-community`)
- *คอนโซลผู้ดูแล* แยกตามเจ้าของ backend: บัญชี/แต้ม/สุขภาพระบบ → platform, `/admin/rag` → kmitl-rag,
  `/admin/quiz` → my-ai-quiz, `/admin/roadmap` → ai-roadmap, ที่เหลือ (โพสต์ ห้อง รายงาน หมวดหมู่) → community
- `POST /api/features/quiz/generate` ที่สร้างควิซจาก "โพสต์ที่บันทึกไว้" อยู่ใน community เพราะต้องรู้จักโพสต์

## 3. แต่ละส่วนมีอะไร

### `platform/` — `siet_core`, `api`, `commands`

| โฟลเดอร์ | หน้าที่ |
|---|---|
| `siet_core/` | ฐานข้อมูล (SurrealDB repository + migration 1…), โมเดล AI (Esperanto), embedding, ask/chat graphs, pipeline ของ source, `extensions.py` (hook points), `env.py` (อ่านค่า `LSP_SIET_*`) |
| `api/` | FastAPI host (`main.py`, `auth.py`, `config`, `models`, `credentials`, `providers`, `settings`, `commands`) |
| `commands/` | งานเบื้องหลังของ surreal-commands (embed, process source) |
| `prompts/` | prompt ของ graphs |

### `platform/siet_platform`

| โมดูล | หน้าที่ |
|---|---|
| `users`, `auth_jwt`, `auth_backend`, `auth_roles`, `login_guard` | บัญชี (MariaDB), JWT, ตรวจทุก request แทนรหัสผ่านเดี่ยว, สิทธิ์ตาม path, กันเดารหัส |
| `routers/users`, `routers/google_auth` | `/api/users/*`, `/api/auth/status`, `/api/auth/google/*` |
| `points`, `pricing`, `usage`, `throttle`, `ratelimit` | กระเป๋าแต้ม, ราคา, บันทึกการใช้ AI, คิวเรียก provider, กันสแปม |
| `schema`, `config`, `db`, `migrations/` | DDL ของ MariaDB, ค่าตั้งของ workspace, ตัวช่วยแถวข้อมูล, migration track k1–k9 |
| `cache/` | Redis cache + answer cache (ดู `cache/CLAUDE.md`) |
| `library`, `retrieval`, `ai_helpers` | คลังเอกสาร → Source + embedding, ค้น vector เฉพาะ notebook, ตัวช่วยเรียก AI ที่ควิซ/roadmap ใช้ร่วมกัน |
| `audit`, `notifications`, `http` | บันทึกผู้ดูแล, กระดิ่งแจ้งเตือน, ตัวช่วยของ router |
| `routers/admin`, `routers/cache_admin` | `/api/admin` ส่วนบัญชี/แต้ม/สุขภาพ, `/api/config/redis` ฯลฯ |
| `startup`, `hooks`, `extension` | ขั้นตอนตอน API start, สิ่งที่เสียบเข้า core, entry point |
| `prompts/` | prompt ภาษาไทยของ chat / source chat (ต่อไว้หน้าสุดของ `$PROMPTS_PATH`) |

หน้าเว็บ (`platform/frontend/src`): ชั้นข้อมูล (`lib/api`, `lib/hooks`), auth (`lib/stores/auth-store`,
`lib/hooks/use-auth`, หน้า `(auth)/*`, `components/auth/*`), เมนูของ workspace (`lib/navigation.ts`),
header/แจ้งเตือน/กระเป๋าแต้ม, `LibraryPanel`, คอนโซลผู้ดูแลหลัก, หน้า `/dashboard` และ `/features`, ฟอนต์และธีม
(`styles/siet-theme.css`), คำแปล (`lib/locales/en-US` — ภาษาเดียว — และ `lib/translations.ts`)

### `kmitl_rag`

| โมดูล | หน้าที่ |
|---|---|
| `ask`, `grounding`, `history` | pipeline ของ quick-ask, ค้นเว็บเสริม, เซสชัน/ประวัติแชตใน MariaDB |
| `routers/ask` | `/api/community/knowledge`, `/api/community/ask*` |
| `routers/admin` | `/api/admin/rag/*` |
| `notebook_ask`, `routers/notebook_ask` | `/api/search/ask/notebooks` |
| `domain`, `routers/global_chat` | `GlobalChatSession`, `/api/chat/global/*`, ตั้งชื่อเซสชันอัตโนมัติ |
| `routers/{notebooks,sources,notes,chat,source_chat,embedding,embedding_rebuild,insights,transformations,search}` | API คลัง notebook / source / note, แชต, embedding (path เดิมทั้งหมด) |
| `chat_filters`, `source_chat`, `hooks` | ตัดลิงก์ที่ AI แต่ง, ตรวจรหัสวิชา, ปักข้อความที่ตรงคำถาม, Gemini google_search |

หน้าเว็บ: `/community/ask`, `AiQuickWidget`, ประวัติแชต, `AnswerReferences`, `MessageReferences`, นกฮูก,
`/notebooks`, `/sources`, `/search` (global chat), `/admin/rag`

### `siet_community`

`repository` (ห้อง โพสต์ คอมเมนต์ รีแอ็กชัน การเล่นควิซ), `moderation` (รายงานเนื้อหา), `catalog` (หมวดหมู่ + ห้องตัวอย่าง),
`roadmap_plan`, `routers/community` (`/api/community/*`), `routers/admin` (ส่วนชุมชนของ `/api/admin`),
`routers/features` (`/api/features/quiz/generate` จากโพสต์)

หน้าเว็บ: `/community`, โปรไฟล์, `/community/search`, `/teacher/*`, `/admin/{community,...}`,
คอมโพเนนต์ฟีดทั้งหมดใน `components/community/*`

### `siet_quiz` และ `siet_roadmap`

แต่ละตัวเป็น extension ที่มี `install(app)` ของตัวเอง: service (เรียก AI), domain (เซสชันที่บันทึก), schemas,
`routers/features` (`/api/features/quiz/*` หรือ `/api/features/roadmap/*`) และ `routers/admin` (ลบเซสชัน)
ตัวช่วยที่ใช้ร่วมกัน (`_retrieve_rag_context`, `_invoke_chat`, `_extract_json`) อยู่ที่ `siet_platform.ai_helpers`
แอป Next.js ของแต่ละตัวอยู่ใน `my-ai-quiz/app` (3001, path `/quiz`) และ `ai-roadmap/app` (3002, path `/roadmap`)

## 4. เสียบเข้า platform อย่างไร

### 4.1 backend — `siet_core/extensions.py`

แพ็กเกจประกาศตัวใน `pyproject.toml`:

```toml
[project.entry-points."siet.extensions"]
siet_platform = "siet_platform.extension"
```

โมดูลนั้นมีได้ `ORDER` (platform 10, quiz 11, roadmap 12, rag 20, community 30), `register()` (ลงทะเบียน hook — รันครั้งเดียวต่อโปรเซส
รวมถึง worker), `install(app)` (router/middleware ก่อนของ core) และ `finalize(app)` (หลังสุด)
ถ้าไม่มีแพ็กเกจติดตั้ง ทุก hook ไม่ทำอะไร และ core ทำงานเดี่ยว ๆ ได้

| hook | ชนิด | ถูกเรียกที่ | ใครลงทะเบียน → ทำอะไร |
|---|---|---|---|
| `install_app` / `finalize_app` | app | `platform/api/main.py` | ทุกแพ็กเกจ → router; platform → RoleAccessMiddleware, error 429/503, ปิด `/auth/status` ของ core; kmitl-rag → API คลัง notebook/source (หลังสุด) |
| `app.startup` / `app.shutdown` | event | `platform/api/main.py` lifespan | platform → migration k-track (critical), schema, seed, tuner; community → `siet.seed_demo_data` |
| auth backend | auth | `platform/api/auth.py` `PasswordAuthMiddleware.dispatch` | platform → JWT (`WorkspaceAuthBackend`) |
| `call_provider` / `is_final_provider_error` | provider | `siet_core/utils/embedding.py` | platform → throttle + usage |
| `vector_search` / `provider_availability` | cache | `siet_core/domain/notebook.py`, `api/routers/models.py` | platform → Redis |
| `notebook.changed` / `source.changed` / `models.changed` | event | `kmitl_rag/routers/{notebooks,sources}.py`, `commands/source_commands.py`, `api/routers/models.py` | platform → bump `knowledge_version` + ล้าง answer cache |
| `source.context` | filter | `Source.get_context` | platform → `asset_url` |
| `chat.prompt_data` / `chat.model` | filter | `siet_core/graphs/chat.py` | platform → วันที่ (พ.ศ.); rag → Gemini google_search |
| `chat.context` / `chat.message` / `chat.messages` | filter | `kmitl_rag/routers/chat.py`, `source_chat.py` | rag → ปักข้อความ, ตัด URL/รหัสวิชาที่ไม่มีในบริบท (`chat.messages` = ทั้งรายการตอน replay) |
| `source_chat.prompt_data` | filter | `siet_core/graphs/source_chat.py` | rag → ปักข้อความ |
| prompts | — | `ai_prompter` อ่าน `$PROMPTS_PATH` | platform ต่อ `siet_platform/prompts` ไว้หน้าสุด |

### 4.2 หน้าเว็บ — `platform/frontend/src/lib/extensions.ts`

`src/lib/extensions.installed.ts` คือรายชื่อแพ็กเกจ แต่ละแพ็กเกจ export default object ชนิด
`FrontendExtension` จาก `<pkg>/frontend/src/extension.tsx` (platform เอง: `platform/frontend/src/extension.tsx`)

| hook | ถูกเรียกที่ | ใครให้ → อะไร |
|---|---|---|
| `useNavigationExtensions` | `AppSidebar` | platform → เมนูของ workspace (ตามบทบาท) |
| `getSlot('sidebar.footer')` | `AppSidebar` | platform → ปุ่มกระเป๋าแต้ม |
| `getSlot('dashboard.navbar')` | `(dashboard)/layout.tsx` | platform → แถบนำทางด้านบนของทุกหน้า (`AppNavbar`) |
| `getSlot('dashboard.overlay')` | `(dashboard)/layout.tsx` | platform → กล่องขอความยินยอม PDPA (`PdpaConsentDialog`) |
| `useRouteGate` | `(dashboard)/layout.tsx` | platform → pending → `/pending`, หน้าที่บทบาทเข้าไม่ได้ → `/community` |
| `useGate(...)` | layout, `AppShell`, `AppSidebar`, `use-create-dialogs` | platform → `command-palette`, `create-dialogs` (staff), `setup-banner` (admin) |
| `getSlot('chat.message-footer')` | `ChatPanel` | rag → รายการอ้างอิงใต้คำตอบ |
| `emitExtensionEvent('notebook-chat.first-reply')` | `useNotebookChat` | rag → ตั้งชื่อเซสชันอัตโนมัติ |
| `extendI18n` | `lib/i18n.ts` | platform → คำของหน้า AI Features (ชื่อแอป "LSP-SIET" อยู่ใน locale en-US เอง) |
| `@import "./siet.css"` | `globals.css` | ชี้ Tailwind ไปสแกนแพ็กเกจ (`@source`) + ธีมของ platform |

### 4.3 แอปแยก (AI Roadmap, AI Quiz) — ธีมสว่าง/มืด

แอปแยกทำตามธีมที่ผู้ใช้เลือกใน SIET Space (ปุ่มธีมในเมนูโปรไฟล์ของ Community) โดยไม่ต้องล็อกอินซ้ำ:

| ทาง | ใครเขียน | ใช้เมื่อ |
|---|---|---|
| `theme-storage` (localStorage ของ SIET Space) | theme store ของ host | แอปอยู่ origin เดียวกับ SIET Space (หลัง Traefik) — อ่านตรง ๆ และสำคัญที่สุด |
| cookie `siet-theme` = `<light\|dark\|system>~<เวลา ms>` | `platform/frontend/src/lib/theme-cookie.ts` (เรียกจาก route gate ทุกหน้า dashboard) | แอปคนละพอร์ต (cookie ไม่แยกตามพอร์ต) |
| `?theme=` ในลิงก์ hand-off | `openRoadmapApp` / `openQuizApp` | ตอนกดเข้าแอป — แอปเก็บไว้พร้อมเวลาที่มาถึง |

แอปเลือกค่าที่ "ใหม่กว่า" ระหว่าง cookie กับ `?theme=` (ไม่มีทั้งคู่ = `system`) และอ่านใหม่ทุกครั้งที่แท็บกลับมาแสดง
SIET Space เขียน cookie เฉพาะตอนผู้ใช้เปลี่ยนธีมจริง (หรือยังไม่มี cookie) ไม่ใช่ทุกครั้งที่เปิดหน้า
เพราะเมื่อมี SIET Space หลายชุดบนเครื่องเดียว (prod :3000, ชุดทดสอบ :18502) ทุกชุดใช้ cookie ตัวเดียวกัน
โค้ดฝั่งแอป: `ai-roadmap/app/src/lib/theme.js`, `my-ai-quiz/app/app/lib/theme.ts` (ฟังก์ชันเดียวกัน ใช้ทั้งเป็น inline script ก่อน paint และตอน runtime)

**การเชื่อมกับระบบ:** ทั้งสองแอปรับ JWT ทาง `?token=` (เก็บใน localStorage `kmitlai-workspace-token`) และเรียก API ผ่านเซิร์ฟเวอร์ของตัวเองที่อนุญาตเฉพาะ `community/*` และ `users/me` (`/roadmap/api/ws/*`, `/quiz/api/ws/*`)
แอป AI Quiz สร้างข้อสอบผ่าน `/quiz/api/generate-quiz` → `POST /api/community/study/quiz` จึงใช้โมเดลของระบบ (Gemini) คลังความรู้ (RAG, ตัวเลือกแหล่งความรู้ชุดเดียวกับ Roadmap) และแต้มของระบบ (`quiz_generate`)
รองรับข้อสอบ ปรนัย / เติมคำ / จับคู่ / ผสม และระดับ ง่าย / ปานกลาง / ยาก — ฟีดและหน้า `/features` ใช้เฉพาะข้อปรนัย (`_quiz_snapshot`)

## 5. migration ของ SurrealDB

migration ของ core (1, 2, 3 ...) อยู่ใน `_sbl_migrations` ไฟล์อยู่ที่ `platform/siet_core/database/migrations/` ส่วนของ SIET อยู่ใน `_siet_migrations`
ชื่อ `k1`…`k9` (`k9` ลบตาราง podcast) ไฟล์อยู่ที่ `platform/siet_platform/migrations/` รันตอน API start ต่อจากของ core
**เพิ่ม migration ใหม่** = สร้าง `k10.surrealql` + `k10_down.surrealql` แล้วเพิ่ม 10 ใน `MIGRATION_IDS`
ห้ามแตะเลขของ core

namespace และ database ของ SurrealDB ยังชื่อ `open_notebook` ทั้งคู่ (ตั้งผ่าน `SURREAL_NAMESPACE` / `SURREAL_DATABASE`) — **อย่าเปลี่ยน**
เพราะจะชี้ API ไปที่ฐานข้อมูลเปล่า

**ฐานข้อมูลที่ migrate ก่อนการแยก** (ยังจด migration ของ SIET เป็น core 19–25 ใน `_sbl_migrations`) — API จะ **ไม่ยอม start**
(`MigrationSplitRequired` บอกให้รันคำสั่งด้านล่าง) ต้องย้ายเลข migration หนึ่งครั้ง:

```bash
docker compose -p kmitlai build lsp_siet_api   # image ต้องมีโค้ดของ branch นี้
make migrate-split                             # อธิบายสิ่งที่จะทำ
make migrate-split CONFIRM=1                   # stack dev: เติม STACK=dev
make up
```

`migrate-split` หยุด SurrealDB กับ API → copy `platform/surreal_data` ไป `backups/surreal_data-<เวลา>` →
start SurrealDB → `python -m siet_platform.migrations.split --dry-run` แล้ว `--backup-done`
ซึ่งใน transaction เดียว ลบ `_sbl_migrations` 19–25 และเขียน `_siet_migrations` k2–k8 (k1 จะรันซ้ำตอน start
เพราะรันซ้ำได้ปลอดภัย) ข้อมูลอื่นไม่ถูกแตะ prod กับ dev ใช้ `surreal_data` ชุดเดียวกัน รันครั้งเดียวพอ

## 6. ของใหม่ควรวางที่ไหน

1. ทุกส่วนของ LSP-SIET ใช้ (บัญชี แต้ม คลัง cache …) → `platform/siet_platform`
2. ฐานข้อมูล โมเดล AI embedding หรือ graphs ของ core → `platform/siet_core`
3. เกี่ยวกับการถาม-ตอบด้วย AI และคลัง notebook → `kmitl-rag`
4. หน้าจอ/ข้อมูลของชุมชน ห้อง ฟีด → `community`
5. ควิซ → `my-ai-quiz` · roadmap → `ai-roadmap`
6. ต้องเปลี่ยนพฤติกรรมของ core → ใช้ hook ที่มี ถ้าไม่มีให้เพิ่ม hook ใหม่ (เพิ่มฟังก์ชันใน
   `extensions.py`/`extensions.ts` + บรรทัดเรียกใน core แล้วเพิ่มแถวในตารางข้อ 4)
   อย่าเขียนตรรกะของส่วนอื่นลงใน `siet_core` / `api` / `commands`

**หน้าใหม่:** เขียนในส่วนของตัวเองที่ `<part>/frontend/src/app/(dashboard)/<route>/page.tsx` แล้วรัน `make frontend-routes`
— สคริปต์ `scripts/frontend-routes.mjs` สร้างไฟล์บรรทัดเดียว `export { default } from '@siet/<part>/app/...'` (ติดป้าย `// generated`)
ใน `platform/frontend/src/app/...` ให้ (Next.js หา route จากโฟลเดอร์ของแอปเท่านั้น) และลบไฟล์ที่ต้นทางหายไป
เจ้าของหน้าไม่ต้องแก้อะไรใน `platform/` เอง test ตัวหนึ่งจะแดงถ้าไฟล์ที่ commit ไว้ไม่ตรง (CI รัน `--check`)

## 7. build และรัน

- **Python**: ใช้ uv project เดียวที่ `platform/pyproject.toml` ซึ่งติดตั้งส่วนอื่นแบบ editable ผ่าน `[tool.uv.sources]`
  (`../kmitl-rag`, `../my-ai-quiz`, `../ai-roadmap`, `../community`) ใน image ส่วนต่าง ๆ อยู่ข้าง `/app`
  stack dev mount โฟลเดอร์เหล่านี้เข้า container และ uvicorn reload เมื่อแก้
- **หน้าเว็บ**: ทุกส่วนถูก compile รวมในแอป Next.js ของ `platform/frontend` (tsconfig `paths` `@siet/*`, `experimental.externalDir`)
  แต่ละส่วนมี `frontend/node_modules` เป็น symlink ไปที่ `platform/frontend/node_modules` เพื่อให้ใช้ React ชุดเดียวกัน
  — หลัง clone หรือ `npm install` ให้รัน `make frontend-links` (ใน image และ stack dev สร้าง/mount ให้แล้ว)
- **Tailwind** สแกนส่วนต่าง ๆ ผ่าน `@source` ใน `platform/frontend/src/app/siet.css` ถ้าเพิ่มส่วนใหม่ต้องเพิ่มบรรทัดที่นี่
- **Docker**: `docker/platform/Dockerfile` (compose, service และ container `lsp_siet_api`, image `kmitlai/lsp-siet:local`),
  `docker/allinone/Dockerfile` (image เดียวรันทุกอย่างด้วย s6-overlay)

## 8. ทดสอบ

```bash
make test-backend     # pytest ของ platform + kmitl-rag + my-ai-quiz + ai-roadmap + community (ปิดการโหลด .env ให้ผลไม่ขึ้นกับลำดับ)
make test-frontend    # tsc + vitest (รวม test ในทุกส่วน) หลังรัน frontend-links และ frontend-routes
python -m pytest scripts/lsp-siet -q   # codemod, เส้นทางของ infra และ guard ที่ห้ามมีชื่อเดิมหลงเหลือ
```

test ที่แดงอยู่ก่อนแล้ว (baseline) อยู่ใน `docs/lsp-siet/known-failures.txt` — CI ข้ามเฉพาะรายการนั้น ที่เหลือแดง = ผิดจริง
