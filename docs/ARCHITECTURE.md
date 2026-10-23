# โครงสร้างโค้ด — open-notebook กับแพ็กเกจของ SIET

> เอกสารนี้อธิบายว่าโค้ดของ KMITL อยู่ตรงไหน แต่ละส่วน import กันได้แค่ไหน
> และเสียบเข้ากับ open-notebook ผ่านจุดไหน ใช้คู่กับ `docs/UPSTREAM.md`
> (วิธีดึง upstream และรายการไฟล์ upstream ที่เราแก้)
>
> อัปเดตล่าสุด: 23 ตุลาคม 2026 (แยก community และ KMITL RAG ออกจาก open-notebook — branch `refactor/siet-split`)

## 1. ภาพรวม

```
kmitlAI/
├── open-notebook/     ← fork ของ lfnovo/open-notebook: โค้ด upstream + hook points + patch ที่จดไว้
├── siet-platform/     ← ชั้นล่างสุดของ SIET: บัญชี JWT สิทธิ์ แต้ม throttle cache คลังเอกสาร ควิซ/roadmap
├── kmitl-rag/         ← KMITL RAG AI: quick-ask, ประวัติแชต, notebook ask, global chat, ตัวกรองคำตอบ
├── community/         ← SIET Space: ห้องวิชา ฟีด คอมเมนต์ moderation คอนโซลอาจารย์/ผู้ดูแล
├── My-ai-quiz/  ai-roadmap-generator/   ← แอปแยก (เหมือนเดิม)
└── docs/ scripts/ docker/ Makefile
```

ทั้งหมดยัง **รันเป็นโปรเซสเดียว** เหมือนเดิม: FastAPI ตัวเดียว (พอร์ต 5055) และ Next.js ตัวเดียว
path ของ API ตาราง และข้อมูลไม่เปลี่ยน ที่เปลี่ยนคือ **โค้ดอยู่คนละโฟลเดอร์** และ open-notebook
ไม่ import โค้ดของ KMITL เลย แพ็กเกจของ KMITL เป็นฝ่ายลงทะเบียนตัวเองเข้าไปที่ hook points

แต่ละแพ็กเกจมีสองส่วน:

| โฟลเดอร์ | Python (import เป็น) | หน้าเว็บ (import เป็น) | test |
|---|---|---|---|
| `siet-platform/` | `siet_platform` | `@siet/platform/...` (`siet-platform/frontend/src`) | `siet-platform/tests` + `*.test.tsx` ในแพ็กเกจ |
| `kmitl-rag/` | `kmitl_rag` | `@siet/kmitl-rag/...` | `kmitl-rag/tests` |
| `community/` | `siet_community` | `@siet/community/...` | `community/tests` |

## 2. กฎการ import (layering)

```
open-notebook  ←  siet-platform  ←  kmitl-rag  ←  community
```

- แต่ละชั้น import ได้เฉพาะชั้นของตัวเองหรือชั้นทางซ้าย
- **open-notebook ไม่ import SIET** (Python: ห้ามทั้ง `api/`, `open_notebook/`, `commands/`)
  หน้าเว็บของ open-notebook import `@siet/*` ได้เฉพาะ
  - route stub ใน `src/app/**` (ไฟล์บรรทัดเดียว `export { default } from '@siet/...'`)
  - `src/lib/extensions.installed.ts` (รายชื่อแพ็กเกจที่ติดตั้ง)
  - replaced modules: `lib/stores/auth-store.ts`, `lib/hooks/use-auth.ts`, `components/auth/LoginForm.tsx`
  - `app/layout.tsx` (ตัวแปรฟอนต์)
- test ข้ามชั้นได้

มีการตรวจอัตโนมัติ ถ้าใครเขียน import ผิดชั้น test จะแดง:

- backend: `siet-platform/tests/test_layering.py`
- frontend: `siet-platform/frontend/src/layering.test.ts`

**ทำไมบางอย่างอยู่ชั้นล่างกว่าที่คิด**
- *audit log, notifications, ตัวช่วยแถวข้อมูล (`siet_platform.db`), ตัวช่วย HTTP (`siet_platform.http`)* — ทุกแพ็กเกจใช้
- *retrieval (`search_in_notebooks`)* อยู่ใน platform ข้างคลังเอกสาร เพราะควิซ/roadmap (platform) ก็ค้นคลังเหมือน RAG
- *ชั้นข้อมูลของหน้าเว็บ* (`lib/api/*`, `use-community`, `use-library` ฯลฯ) อยู่ใน `@siet/platform`
  ทั้งหมด เพราะหน้าจอของทุกแพ็กเกจเรียกใช้ (หน้า `/community/ask` ของ RAG ก็อ่าน `use-community`)
- *คอนโซลผู้ดูแล* แยกตามเจ้าของ backend: บัญชี/แต้ม/สุขภาพระบบ → platform, `/admin/rag` → kmitl-rag,
  ที่เหลือ (โพสต์ ห้อง รายงาน หมวดหมู่ ควิซ/roadmap ที่แชร์) → community
- `POST /features/quiz/generate` อยู่ใน community เพราะสร้างควิซจาก "โพสต์ที่บันทึกไว้" ได้

## 3. แต่ละแพ็กเกจมีอะไร

### `siet_platform`

| โมดูล | หน้าที่ |
|---|---|
| `users`, `auth_jwt`, `auth_backend`, `auth_roles`, `login_guard` | บัญชี (MariaDB), JWT, ตรวจทุก request แทนรหัสผ่านเดี่ยว, สิทธิ์ตาม path, กันเดารหัส |
| `routers/users`, `routers/google_auth` | `/api/users/*`, `/api/auth/status`, `/api/auth/google/*` |
| `points`, `pricing`, `usage`, `throttle`, `ratelimit` | กระเป๋าแต้ม, ราคา, บันทึกการใช้ AI, คิวเรียก provider, กันสแปม |
| `schema`, `config`, `db`, `migrations/` | DDL ของ MariaDB, ค่าตั้งของ KMITL, ตัวช่วยแถวข้อมูล, migration track k1–k8 |
| `cache/` | Redis cache + answer cache (ดู `cache/CLAUDE.md`) |
| `library`, `retrieval` | คลังเอกสาร → Source + embedding, ค้น vector เฉพาะ notebook |
| `features/` | ควิซ/roadmap (service, domain, schemas, README) |
| `audit`, `notifications`, `http` | บันทึกผู้ดูแล, กระดิ่งแจ้งเตือน, ตัวช่วยของ router |
| `routers/admin`, `routers/features`, `routers/cache_admin` | `/api/admin` ส่วนบัญชี/แต้ม/สุขภาพ, `/api/features/*`, `/api/config/redis` ฯลฯ |
| `startup`, `hooks`, `extension` | ขั้นตอนตอน API start, สิ่งที่เสียบเข้า open-notebook, entry point |
| `prompts/` | prompt ภาษาไทยของ chat / source chat (ทับของ upstream) |

หน้าเว็บ (`siet-platform/frontend/src`): ชั้นข้อมูล (`lib/api`, `lib/hooks`), auth (`lib/stores/auth-store`,
`lib/hooks/use-auth`, หน้า `(auth)/*`, `components/auth/*`), เมนูของ workspace (`lib/navigation.ts`),
header/แจ้งเตือน/กระเป๋าแต้ม, `LibraryPanel`, คอนโซลผู้ดูแลหลัก, หน้า `/dashboard`, ฟอนต์และธีม (`styles/siet-theme.css`),
คำแปลที่เพิ่ม (`lib/translations.ts`)

### `kmitl_rag`

| โมดูล | หน้าที่ |
|---|---|
| `ask`, `grounding`, `history` | pipeline ของ quick-ask, ค้นเว็บเสริม, เซสชัน/ประวัติแชตใน MariaDB |
| `routers/ask` | `/api/community/knowledge`, `/api/community/ask*` |
| `routers/admin` | `/api/admin/rag/*` |
| `notebook_ask`, `routers/notebook_ask` | `/api/search/ask/notebooks` |
| `domain`, `routers/global_chat` | `GlobalChatSession`, `/api/chat/global/*`, ตั้งชื่อเซสชันอัตโนมัติ |
| `chat_filters`, `source_chat`, `hooks` | ตัดลิงก์ที่ AI แต่ง, ตรวจรหัสวิชา, ปักข้อความที่ตรงคำถาม, Gemini google_search |

หน้าเว็บ: `/community/ask`, `AiQuickWidget`, ประวัติแชต, `AnswerReferences`, `MessageReferences`, นกฮูก,
หน้า `/search` แบบ global chat (`WorkspaceSearchPage`), `/admin/rag`

### `siet_community`

`repository` (ห้อง โพสต์ คอมเมนต์ รีแอ็กชัน การเล่นควิซ), `moderation` (รายงานเนื้อหา), `catalog` (หมวดหมู่ + ห้องตัวอย่าง),
`roadmap_plan`, `routers/community` (`/api/community/*`), `routers/admin` (ส่วนชุมชนของ `/api/admin`),
`routers/features` (`/api/features/quiz/generate`)

หน้าเว็บ: `/community`, โปรไฟล์, `/community/search`, `/teacher/*`, `/admin/{community,quiz,roadmap}`, `/features`,
คอมโพเนนต์ฟีดทั้งหมดใน `components/community/*`

## 4. เสียบเข้า open-notebook อย่างไร

### 4.1 backend — `open_notebook/extensions.py`

แพ็กเกจประกาศตัวใน `pyproject.toml`:

```toml
[project.entry-points."open_notebook.extensions"]
siet_platform = "siet_platform.extension"
```

โมดูลนั้นมีได้ `ORDER` (platform 10, rag 20, community 30), `register()` (ลงทะเบียน hook — รันครั้งเดียวต่อโปรเซส
รวมถึง worker), `install(app)` (router/middleware ก่อนของ open-notebook) และ `finalize(app)` (หลังสุด)
ถ้าไม่มีแพ็กเกจติดตั้ง ทุก hook ไม่ทำอะไร open-notebook ทำงานแบบ upstream

| hook | ชนิด | ถูกเรียกที่ (upstream) | ใครลงทะเบียน → ทำอะไร |
|---|---|---|---|
| `install_app` / `finalize_app` | app | `api/main.py` | ทุกแพ็กเกจ → router; platform → RoleAccessMiddleware, error 429/503, ปิด `/auth/status` ของ upstream และ podcasts |
| `app.startup` / `app.shutdown` | event | `api/main.py` lifespan | platform → migration k-track (critical), schema, seed, tuner; community → `siet.seed_demo_data` |
| auth backend | auth | `api/auth.py` `PasswordAuthMiddleware.dispatch` | platform → JWT (`WorkspaceAuthBackend`) |
| `call_provider` / `is_final_provider_error` | provider | `utils/embedding.py` | platform → throttle + usage |
| `vector_search` / `provider_availability` | cache | `domain/notebook.py`, `routers/models.py` | platform → Redis |
| `notebook.changed` / `source.changed` / `models.changed` | event | `routers/notebooks.py`, `sources.py`, `commands/source_commands.py`, `routers/models.py` | platform → bump `knowledge_version` + ล้าง answer cache |
| `source.context` | filter | `Source.get_context` | platform → `asset_url` |
| `chat.prompt_data` / `chat.model` | filter | `graphs/chat.py` | platform → วันที่ (พ.ศ.); rag → Gemini google_search |
| `chat.context` / `chat.message` / `chat.messages` | filter | `routers/chat.py`, `routers/source_chat.py` | rag → ปักข้อความ, ตัด URL/รหัสวิชาที่ไม่มีในบริบท (`chat.messages` = ทั้งรายการตอน replay) |
| `source_chat.prompt_data` | filter | `graphs/source_chat.py` | rag → ปักข้อความ |
| prompts | — | `ai_prompter` อ่าน `$PROMPTS_PATH` | platform ต่อ `siet_platform/prompts` ไว้หน้าสุด |

### 4.2 หน้าเว็บ — `src/lib/extensions.ts`

`src/lib/extensions.installed.ts` คือรายชื่อแพ็กเกจ (ของ upstream จะเป็นรายการว่าง) แต่ละแพ็กเกจ
export default object ชนิด `FrontendExtension` จาก `<pkg>/frontend/src/extension.tsx`

| hook | ถูกเรียกที่ | ใครให้ → อะไร |
|---|---|---|
| `useNavigationExtensions` | `AppSidebar` | platform → เมนูของ workspace (ตามบทบาท) |
| `getSlot('sidebar.footer')` | `AppSidebar` | platform → ปุ่มกระเป๋าแต้ม |
| `useRouteGate` | `(dashboard)/layout.tsx` | platform → pending → `/pending`, หน้าที่บทบาทเข้าไม่ได้ → `/community` |
| `useGate(...)` | layout, `AppShell`, `AppSidebar`, `use-create-dialogs` | platform → `command-palette`, `create-dialogs` (staff), `setup-banner` (admin), `version-check` (ปิด), `podcasts` (ปิด เว้น `NEXT_PUBLIC_SIET_ENABLE_PODCASTS=1`) |
| `getSlot('search.page')` | `search/page.tsx` | rag → หน้า `/search` แบบ global chat |
| `getSlot('chat.message-footer')` | `ChatPanel` | rag → รายการอ้างอิงใต้คำตอบ |
| `emitExtensionEvent('notebook-chat.first-reply')` | `useNotebookChat` | rag → ตั้งชื่อเซสชันอัตโนมัติ |
| `extendI18n` | `lib/i18n.ts` | platform → ชื่อแอป "LSP-SIET", คำของหน้า AI Features |
| `@import "./siet.css"` | `globals.css` | ชี้ Tailwind ไปสแกนแพ็กเกจ (`@source`) + ธีมของ platform |

### 4.3 แอปแยก (AI Roadmap, AI Quiz) — ธีมสว่าง/มืด

แอปแยกทำตามธีมที่ผู้ใช้เลือกใน SIET Space (ปุ่มธีมในเมนูโปรไฟล์ของ Community) โดยไม่ต้องล็อกอินซ้ำ:

| ทาง | ใครเขียน | ใช้เมื่อ |
|---|---|---|
| `theme-storage` (localStorage ของ SIET Space) | theme store ของ open-notebook | แอปอยู่ origin เดียวกับ SIET Space (หลัง Traefik) — อ่านตรง ๆ และสำคัญที่สุด |
| cookie `siet-theme` = `<light\|dark\|system>~<เวลา ms>` | `@siet/platform/lib/theme-cookie` (เรียกจาก route gate ทุกหน้า dashboard) | แอปคนละพอร์ต (cookie ไม่แยกตามพอร์ต) |
| `?theme=` ในลิงก์ hand-off | `openRoadmapApp` / `openQuizApp` | ตอนกดเข้าแอป — แอปเก็บไว้พร้อมเวลาที่มาถึง |

แอปเลือกค่าที่ "ใหม่กว่า" ระหว่าง cookie กับ `?theme=` (ไม่มีทั้งคู่ = `system`) และอ่านใหม่ทุกครั้งที่แท็บกลับมาแสดง
SIET Space เขียน cookie เฉพาะตอนผู้ใช้เปลี่ยนธีมจริง (หรือยังไม่มี cookie) ไม่ใช่ทุกครั้งที่เปิดหน้า
เพราะเมื่อมี SIET Space หลายชุดบนเครื่องเดียว (prod :3000, ชุดทดสอบ :18502) ทุกชุดใช้ cookie ตัวเดียวกัน
โค้ดฝั่งแอป: `ai-roadmap-generator/src/lib/theme.js`, `My-ai-quiz/app/lib/theme.ts` (ฟังก์ชันเดียวกัน ใช้ทั้งเป็น inline script ก่อน paint และตอน runtime)

## 5. migration ของ SurrealDB

migration ของ open-notebook (1, 2, 3 ...) อยู่ใน `_sbl_migrations` ของ KMITL อยู่ใน `_siet_migrations`
ชื่อ `k1`…`k8` ไฟล์อยู่ที่ `siet-platform/siet_platform/migrations/` รันตอน API start ต่อจากของ core
**เพิ่ม migration ใหม่** = สร้าง `k9.surrealql` + `k9_down.surrealql` แล้วเพิ่ม 9 ใน `MIGRATION_IDS`
ห้ามแตะเลขของ core รายละเอียดการย้ายฐานข้อมูลเก่าอยู่ใน `docs/UPSTREAM.md` ข้อ 5

## 6. ของใหม่ควรวางที่ไหน

1. เป็นของ open-notebook แท้ ๆ ที่ upstream น่าจะรับ → ส่ง PR ไป upstream ก่อน
2. ทุกฟีเจอร์ของ SIET ใช้ (บัญชี แต้ม คลัง cache …) → `siet-platform`
3. เกี่ยวกับการถาม-ตอบด้วย AI → `kmitl-rag`
4. หน้าจอ/ข้อมูลของชุมชน ห้อง ฟีด → `community`
5. ต้องเปลี่ยนพฤติกรรมของ open-notebook → ใช้ hook ที่มี ถ้าไม่มีให้เพิ่ม hook ใหม่ (เพิ่มฟังก์ชันใน
   `extensions.py`/`extensions.ts` + บรรทัดเรียกในไฟล์ upstream แล้วจดใน `docs/UPSTREAM.md` ข้อ 4.2)
   อย่าเขียนตรรกะของ KMITL ลงในไฟล์ upstream

หน้าใหม่: เขียนในแพ็กเกจที่ `<pkg>/frontend/src/app/(dashboard)/<route>/page.tsx` แล้วสร้าง stub บรรทัดเดียว
ที่ `open-notebook/frontend/src/app/(dashboard)/<route>/page.tsx` (Next.js หา route จากโฟลเดอร์ของแอปเท่านั้น)

## 7. build และรัน

- **Python**: open-notebook ติดตั้งทั้งสามแพ็กเกจแบบ editable ผ่าน `[tool.uv.sources]` ใน `open-notebook/pyproject.toml`
  (`../siet-platform` ฯลฯ) ใน image แพ็กเกจอยู่ที่ `/siet-platform`, `/kmitl-rag`, `/community` ข้าง `/app`
  stack dev mount โฟลเดอร์เหล่านี้เข้า container และ uvicorn reload เมื่อแก้
- **หน้าเว็บ**: แพ็กเกจถูก compile รวมในแอป Next.js ของ open-notebook (tsconfig `paths` `@siet/*`, `experimental.externalDir`)
  แต่ละแพ็กเกจมี `frontend/node_modules` เป็น symlink ไปที่ `open-notebook/frontend/node_modules` เพื่อให้ใช้ React ชุดเดียวกัน
  — หลัง clone หรือ `npm install` ให้รัน `make frontend-links` (ใน image และ stack dev สร้าง/mount ให้แล้ว)
- **Tailwind** สแกนแพ็กเกจผ่าน `@source` ใน `open-notebook/frontend/src/app/siet.css` ถ้าเพิ่มแพ็กเกจใหม่ต้องเพิ่มบรรทัดที่นี่

## 8. ทดสอบ

```bash
make test-backend     # pytest ของ open-notebook + 3 แพ็กเกจ (ปิดการโหลด .env ให้ผลไม่ขึ้นกับลำดับ)
make test-frontend    # tsc + vitest (รวม test ในแพ็กเกจ)
```

ผลที่ควรได้ตอนแยกเสร็จ (23 ต.ค. 2026): backend 566 ผ่าน / 25 แดงที่มีมาก่อนบน staging,
frontend 91 ผ่าน / 1 แดงที่มีมาก่อน (`locales/index.test.ts` — Unused Key Detection)
