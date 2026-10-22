# open-notebook กับ upstream

> `open-notebook/` คือสำเนาของ [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook)
> ที่เรา vendor ไว้ในรีโปนี้ เอกสารนี้บอกว่าตอนนี้เราอิงเวอร์ชันไหน แก้ไฟล์ของ upstream ไปตรงไหนบ้าง
> และดึงเวอร์ชันใหม่ของ upstream เข้ามาอย่างไร โครงสร้างของโค้ด KMITL อยู่ใน `docs/ARCHITECTURE.md`
>
> อัปเดตล่าสุด: 23 ตุลาคม 2026 (แยกโค้ด KMITL ออกจาก open-notebook — branch `refactor/siet-split`)

## 1. เวอร์ชันที่อิงอยู่

| | |
|---|---|
| upstream base | `8889087e317177d7b6e286342ab34e0c9c01d43e` (`v1.10.0-31-g8889087`, 3 ก.ค. 2026) |
| upstream ล่าสุดที่ตรวจ | `v1.15.0` (`315d525`), `main` = `a0f6f30` (4 ต.ค. 2026) — ห่างจาก base 215 commits |
| branch upstream ล้วน | `vendor/open-notebook` (commit `e59542d` = tree ของ base ตรง ๆ ไม่มีโค้ด KMITL) |
| จุดเชื่อม subtree | merge commit `f890a34` "Add 'open-notebook/' from commit '8889087…'" (`-s ours` — tree ไม่เปลี่ยน) |

base หามาจากการเทียบ snapshot ตอน vendor (`1f62367`) กับทุก commit ของ upstream ตั้งแต่ v1.9.0 ถึง v1.12.0
`8889087` ต่างน้อยที่สุด (88 ไฟล์ ทั้งหมดเป็นส่วนที่ KMITL เพิ่มหรือแก้) และ `CHANGELOG.md` ตรงกันทุกไบต์
submodule SHA เดิม (`dc45a4d`) เป็น commit ใน fork ส่วนตัวที่ upstream ไม่มี จึงใช้อ้างอิงไม่ได้

## 2. กฎ

- โค้ดของ KMITL อยู่ใน `siet-platform/`, `kmitl-rag/`, `community/` ที่ root ของรีโป ไม่อยู่ใน `open-notebook/`
- ใน `open-notebook/` แก้ไฟล์ของ upstream ได้เฉพาะแบบที่อยู่ในข้อ 4 และต้องจดไว้ที่นั่นทุกครั้ง
  1. **hook point** — บรรทัดเรียก `open_notebook/extensions.py` หรือ `frontend/src/lib/extensions.ts`
  2. **patch ที่ทำเป็น hook ไม่ได้** — owner scoping, replaced modules ของ auth, การแก้เล็กที่ upstream ควรรับ
- ไฟล์ใหม่ใน `open-notebook/` (เช่น `extensions.py`, route stub) ไม่ชนกับ upstream แต่ให้มีเท่าที่จำเป็น
- ห้ามลบไฟล์ของ upstream ถ้าไม่อยากใช้ให้ปิดด้วย hook (การลบทำให้ชนแบบ modify/delete ทุกครั้งที่ดึง)
- ห้ามแก้ migration ของ upstream และห้ามใช้เลข migration ของ core migration ของ KMITL อยู่ใน track ของตัวเอง (ข้อ 5)
- มี test กันไว้: `siet-platform/tests/test_layering.py` และ `siet-platform/frontend/src/layering.test.ts`
  แดงทันทีถ้าโค้ดของ open-notebook ไป import แพ็กเกจของ KMITL

## 3. วิธีดึง upstream เวอร์ชันใหม่

```bash
git remote add upstream https://github.com/lfnovo/open-notebook.git   # ครั้งแรกเท่านั้น
git fetch --no-tags upstream tag v1.15.0

# 1) ลองก่อนใน worktree ชั่วคราว ไม่แตะ branch ปัจจุบัน — ได้รายการไฟล์ที่ชน
scripts/upstream/dryrun-sync.sh v1.15.0

# 2) ดึงจริงบน branch ใหม่
git switch -c chore/upstream-v1.15.0 staging
git subtree pull --prefix=open-notebook --squash upstream v1.15.0
#    แก้ conflict ตามข้อ 4 →
#    cd open-notebook && uv lock                   (uv.lock ชนทุกครั้ง: lock ใหม่ ไม่ต้องแก้มือ)
#    cd frontend && npm install                    (package-lock.json เช่นกัน) && cd ../.. && make frontend-links
#    make test-backend test-frontend
#    ตรวจ migration ใหม่ของ upstream (ข้อ 5)

# 3) เลื่อน branch upstream ล้วนตาม (parent ที่ 2 ของ merge commit คือ squash commit ใหม่)
git branch -f vendor/open-notebook HEAD^2
```

`git subtree` หา base จากบรรทัด `git-subtree-split:` ใน commit message จึงห้าม squash หรือ rebase
commit `e59542d`/`f890a34` ทิ้ง (`scripts/upstream/lib.sh` ก็อ่านค่า base จากบรรทัดเดียวกัน)

ดูว่าตอนนี้เราต่างจาก upstream แค่ไหน: `scripts/upstream/diff-report.sh > /tmp/report.md`

## 4. สิ่งที่ KMITL แก้ในไฟล์ของ upstream

### 4.1 ก่อนและหลังแยก

| | ก่อนแยก (`f890a34`) | หลังแยก |
|---|---:|---:|
| ไฟล์ upstream ที่ถูกแก้ | 79 | 45 |
| ไฟล์ upstream ที่ถูกลบ | 32 | 0 |
| ไฟล์ที่ KMITL เพิ่มใน `open-notebook/` | 192 | 28 (hook, route stub, helper ของ owner scoping) |
| **ไฟล์ที่ชนเมื่อลองดึง v1.15.0** | **72** (AA 14 · DU 24 · UU 34) | **20** (UU 20) |

ไฟล์รายงานเต็ม: `docs/upstream/{diff-report,dryrun-v1.15.0}-{before,after}-split.md`

20 ไฟล์ที่ยังชนคือไฟล์ที่ upstream แก้หนักช่วง v1.10→v1.15 และเรามี hook หรือ patch อยู่ในไฟล์เดียวกัน
(`api/main.py`, `routers/chat.py` …) ส่วนใหญ่แก้ได้ด้วยการวางบรรทัด hook กลับเข้าไปในโค้ดใหม่ของ upstream
`uv.lock` กับ `package-lock.json` แก้ด้วยการ lock ใหม่

### 4.2 hook points

ตาราง hook ทั้งหมด (ชื่อ ที่เรียก ใครลงทะเบียน) อยู่ใน `docs/ARCHITECTURE.md` ข้อ 4 บรรทัดเรียกในไฟล์ upstream
มีคอมเมนต์ `KMITL hook` กำกับไว้ทุกจุด — ค้นด้วย `grep -rn "KMITL" open-notebook --include='*.py' --include='*.ts*' --include='*.css'`

backend: `api/main.py`, `api/auth.py`, `api/routers/{chat,source_chat,notebooks,sources,models}.py`,
`commands/source_commands.py`, `open_notebook/domain/notebook.py`, `open_notebook/graphs/{chat,source_chat}.py`,
`open_notebook/utils/{embedding,context_builder}.py`

frontend: `(dashboard)/layout.tsx`, `(dashboard)/search/page.tsx`, `components/layout/{AppShell,AppSidebar}.tsx`,
`components/source/ChatPanel.tsx`, `lib/hooks/{use-create-dialogs,use-version-check,useNotebookChat}.ts*`,
`lib/i18n.ts`, `app/globals.css`, `app/layout.tsx`, `components/layout/AppSidebar.test.tsx` (mock รายชื่อแพ็กเกจเป็นว่าง)

ตอนแก้ conflict: เอาโค้ดของ upstream เป็นหลัก แล้ววางบรรทัด hook กลับเข้าไปที่ตำแหน่งที่มีความหมายเดียวกัน

### 4.3 patch ที่ทำเป็น hook ไม่ได้

**owner scoping (backend)** — upstream ไม่มีระบบหลายผู้ใช้ เรากรองข้อมูลตาม `owner_id` ทุก query
- helper อยู่ไฟล์เดียว: `api/dependencies.py` (`get_owner_id`, `_resolve_owner_id`, `owner_can_access`)
- จุดเรียก: `api/routers/{notebooks,notes,sources,source_chat,chat}.py` (พารามิเตอร์ `owner_id = Depends(...)`
  + เงื่อนไข `WHERE owner_id = $owner_id OR "default"` + ตรวจ `owner_can_access`)
- field: `owner_id` บน `Notebook`, `Source`, `Note`, `ChatSession` และ `knowledge_version` บน `Notebook`, `Source`
  ใน `open_notebook/domain/notebook.py` (ใช้คู่กับ hook ล้าง answer cache)

**replaced modules (frontend)** — upstream ล็อกอินด้วยรหัสผ่านเดียว ของเราเป็น JWT + Google Workspace
ไฟล์ upstream กลายเป็น re-export บรรทัดเดียว โค้ดจริงอยู่ใน `@siet/platform`:
`lib/stores/auth-store.ts`, `lib/hooks/use-auth.ts`, `components/auth/LoginForm.tsx`
ตอนแก้ conflict: เก็บ re-export ไว้ แล้วอ่านว่า upstream เปลี่ยนอะไรใน auth เพื่อตามไปแก้ใน `@siet/platform` ถ้าจำเป็น

**การแก้เล็ก ๆ ที่เก็บเป็น patch** (ส่ง PR ไป upstream ได้)
| ไฟล์ | เรื่อง |
|---|---|
| `open_notebook/database/repository.py` | `ensure_record_id` รับ id ที่มี prefix ซ้ำ (`source:source:x`) |
| `open_notebook/ai/connection_tester.py` | โมเดล Gemini ที่ใช้ทดสอบ |
| `frontend/src/lib/api/client.ts`, `lib/config.ts` | ตัด `/api` ที่ซ้ำท้าย base URL; ส่ง `X-Owner-Id` |
| `frontend/src/lib/api/source-chat.ts` | 401 → ล้าง session แล้วไป `/login` |
| `frontend/src/lib/utils/source-references.tsx` | อ้างอิงแบบ `[url:...]` และตัวเลือก `appendList` |
| `frontend/src/components/source/ChatPanel.tsx` | prop `references`/`hasRagContext`, ป้าย RAG, คลิกอ้างอิง URL |
| `frontend/src/components/source/SessionManager.tsx` | ปุ่ม New Chat สร้างเซสชันทันที |
| `frontend/src/components/layout/AppSidebar.tsx` | ไม่มีโลโก้, เมนูเลื่อนได้, ไฮไลต์เมนูที่ path ยาวสุด |
| `frontend/src/proxy.ts`, `app/page.tsx` | `/` ไป `/login` แทน `/notebooks` |
| `pyproject.toml`, `uv.lock` | dependency สามแพ็กเกจของ SIET |
| `frontend/{tsconfig.json,next.config.ts,vitest.config.ts}` | path `@siet/*`, `externalDir`, ขนาดอัปโหลด, test ของแพ็กเกจ |
| `frontend/package.json`, `package-lock.json` | `dev -p 3500`, `build --webpack` |

### 4.4 ไฟล์ของ upstream ที่เก็บไว้แต่ปิดไว้

podcasts (backend + หน้าเว็บ), `Dockerfile`, `docker-compose.yml`, `supervisord.conf` ของ upstream
(เราใช้ของ `docker/` ที่ root), `api/routers/auth.py` (route `/api/auth/status` ของมันถูกถอดตอน `finalize`
เพราะ `siet_platform.routers.users` ตอบ path เดียวกันแบบ JWT) เปิด podcasts ได้ด้วย `SIET_ENABLE_PODCASTS=1`
(API) + `NEXT_PUBLIC_SIET_ENABLE_PODCASTS=1` (หน้าเว็บ)

## 5. migration

| | ตาราง version | ไฟล์ |
|---|---|---|
| open-notebook | `_sbl_migrations` (1, 2, …) | `open-notebook/open_notebook/database/migrations/` — ของ upstream ล้วน |
| KMITL | `_siet_migrations` (k1, k2, …) | `siet-platform/siet_platform/migrations/` |

| k | เดิมคือ | เรื่อง |
|---|---|---|
| k1 | ส่วนที่ KMITL เติมใน core 9 | `fn::vector_search_in_notebook` |
| k2–k8 | core 19–25 | quiz/roadmap session, user (SurrealDB), knowledge_version, global chat + owner_id index, flexible object, ลบตารางที่ไม่ใช้, roadmap settings |

API รัน k-migration ต่อจากของ core ทุกครั้งที่ start (`siet_platform.startup.run_migrations`) ถ้า k-migration
พัง API จะไม่ start เหมือน core

**ฐานข้อมูลที่ migrate ก่อนการแยก** ยังจด KMITL เป็น core 19–25 — API จะ **ไม่ยอม start** (บอกให้รันคำสั่งด้านล่าง)
เพราะถ้าปล่อยไว้ ตอนดึง upstream ตัวจัดการ migration จะคิดว่า 19–25 ของ upstream รันไปแล้วและข้ามทั้งหมด

```bash
docker compose -p kmitlai build open_notebook_api   # image ต้องมีโค้ดของ branch นี้
make migrate-split                                  # อธิบายสิ่งที่จะทำ
make migrate-split CONFIRM=1                        # stack dev: เติม STACK=dev
make up
```

`migrate-split` หยุด SurrealDB กับ API → copy `open-notebook/surreal_data` ไป `backups/surreal_data-<เวลา>` →
start SurrealDB → `python -m siet_platform.migrations.split --dry-run` แล้ว `--backup-done`
ซึ่งใน transaction เดียว ลบ `_sbl_migrations` 19–25 และเขียน `_siet_migrations` k2–k8 (k1 จะรันซ้ำตอน start
เพราะรันซ้ำได้ปลอดภัย) ข้อมูลอื่นไม่ถูกแตะ prod กับ dev ใช้ `surreal_data` ชุดเดียวกัน รันครั้งเดียวพอ
ทดสอบแล้วกับฐานข้อมูลที่ migrate ด้วยโค้ดก่อนแยก (ถึง 25) และฐานข้อมูลใหม่ — ได้ตารางชุดเดียวกัน

**ตอนดึง upstream ที่มี migration ใหม่ (เช่น 19–25 ของ v1.15)** ให้ตรวจก่อนว่าไม่ชนกับ schema ของเรา
โดยเฉพาะ 20–22 ของ upstream ที่แก้ตาราง podcast ซึ่ง k7 ลบไปแล้ว
