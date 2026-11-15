# ย้าย branch ของคุณไปโครงสร้างใหม่ (LSP-SIET)

> สำหรับ **SpriteUm** (quiz), **Poh** (community) และ **Tanabordi** (auth) · เขียนโดย Phuwish · 15 พ.ย. 2026
> โครงสร้างใหม่อยู่บน branch `refactor/lsp-siet` · เครื่องมือย้ายอยู่ที่ `scripts/lsp-siet/`
> ผลลองรันบน branch จริงของพวกเรา: `docs/lsp-siet/dryrun.md` · ภาพรวมโครงสร้าง: `docs/ARCHITECTURE.md`
>
> **ไฟล์นี้ตั้งใจเขียนชื่อเก่า (`open-notebook/`, `OPEN_NOTEBOOK_*`, `OpenNotebookError` …) เพราะเป็นคู่มือแปลงของเก่าเป็นของใหม่**
> (test ที่ห้ามมีชื่อเก่าในโปรเจกต์ข้ามไฟล์นี้ไว้โดยเจตนา)

โฟลเดอร์ย้ายที่ราว 900 ไฟล์ แต่คุณ **ไม่ต้องย้ายเอง**: สคริปต์ย้ายและแก้ import ให้เฉพาะไฟล์ที่ branch ของคุณแก้หรือเพิ่ม
ส่วนไฟล์ที่คุณไม่ได้แตะ จะมาเองตอน merge (ไม่ต้องมี conflict กับไฟล์พวกนั้น)

## 1. ทำ 3 ขั้น

**ผู้ดูแล (Phuwish) ต้องทำก่อนทีมเริ่ม:** `refactor/lsp-siet` ต้อง **มี `main` ล่าสุดอยู่แล้ว** (merge `origin/main` เข้า branch แล้ว push) —
ถ้า branch นั้นขาดคอมมิตของ `main` สคริปต์จะนับไฟล์ที่คนอื่นแก้บน `main` เป็นของ branch คุณด้วย ตรวจเองได้ด้วย `git merge-base --is-ancestor origin/main $R`
(exit 0 = ใช้ได้; ไม่ใช่ = บอกพี่ก่อน)

ก่อนเริ่ม commit งานค้างให้หมด **รวมไฟล์ใหม่ที่ยังไม่เคย commit** (สคริปต์ไม่ยอมรันบน working tree ที่มีของค้าง; ไฟล์ใหม่ที่สคริปต์ย้ายแล้ว stage ให้
จะถูก `git reset --hard` ลบตอน undo) อย่าใช้ `git stash`: `git stash pop` หลังย้ายแล้วจะคืนไฟล์ไปไว้ที่ path ของโครงสร้างเดิม
(สคริปต์ไม่รู้จัก stash) · ไฟล์ที่เป็น CRLF ที่สคริปต์เขียนทับอาจกลายเป็น LF — ถ้า `git diff --stat` โชว์ว่าทั้งไฟล์เปลี่ยน ให้แปลงกลับเป็น CRLF

### 1a. ตอนนี้: `refactor/lsp-siet` ยังไม่ได้รวมเข้า `main`

```bash
git fetch origin
R=origin/refactor/lsp-siet
git rev-parse --verify -q $R >/dev/null || echo "ไม่มี $R: พี่ยังไม่ได้ push branch โครงสร้างใหม่ — รอก่อน อย่ารันกับ ref อื่น"
git ls-tree origin/main platform/siet_core   # ต้องไม่พิมพ์อะไร; ถ้าพิมพ์ = main รวมแล้ว ไปที่ 1b

# 1) เอา main ล่าสุดเข้า branch ก่อน — ยังเป็นโครงสร้างเดิม แก้ conflict แบบที่เคยทำ
git merge origin/main

# 2) เอาสคริปต์มาวางใน branch แล้วรัน (ดูก่อนด้วย --check ได้ มันไม่เขียนอะไร)
git checkout $R -- scripts/lsp-siet
python3 scripts/lsp-siet/codemod.py --since $R --check
python3 scripts/lsp-siet/codemod.py --since $R
git add -A && git commit -m "chore: LSP-SIET codemod"

# 3) รวมโครงสร้างใหม่
git merge $R
```

### 1b. หลัง `main` รวมโครงสร้างใหม่แล้ว (`origin/main` เป็นโครงสร้างใหม่)

branch ที่แตกจาก `main` หลังโครงสร้างใหม่อยู่แล้ว ไม่ต้องทำอะไรในหัวข้อนี้ — ใช้กับ branch ที่แตกก่อนนั้นเท่านั้น

ใช้ `origin/main` แทน `$R` และ **อย่า `git merge origin/main` ก่อนแปลง** (มันดึงโครงสร้างใหม่เข้ามาก่อนที่ไฟล์ของคุณจะถูกแปลง) —
ขั้น 1 เปลี่ยนเป็นรวมแท็ก `lsp-siet-base` แทน (= `8efc391`, คอมมิตสุดท้ายของ `main` ก่อนโครงสร้างใหม่ ยังเป็นโครงสร้างเดิม):

```bash
git fetch origin --tags
R=origin/main
git rev-parse --verify -q lsp-siet-base >/dev/null || echo "ไม่มีแท็ก lsp-siet-base: พี่ยังไม่ได้ push แท็ก — รอก่อน"

# 1) เอา main เท่าที่ยังเป็นโครงสร้างเดิมเข้า branch (แทน git merge main)
git merge lsp-siet-base

# 2) เหมือน 1a แต่ R คือ origin/main
git checkout $R -- scripts/lsp-siet
python3 scripts/lsp-siet/codemod.py --since $R --check
python3 scripts/lsp-siet/codemod.py --since $R
git add -A && git commit -m "chore: LSP-SIET codemod"

# 3) รวม main (โครงสร้างใหม่ + งานของคนอื่นที่เข้ามาหลังจากนั้น)
git merge $R
```

**พี่ (owner) ทำครั้งเดียวตอน push:** `git tag lsp-siet-base 8efc391 && git push origin lsp-siet-base`
(แท็กไม่ถูกสร้างล่วงหน้า เพราะ ref ใช้ร่วมกับเครื่อง production)

- `--since $R` = แปลงเฉพาะไฟล์ที่ branch คุณแก้หรือเพิ่มนับจากจุดที่แยกจาก `$R` (ไฟล์ใหม่ที่ยังไม่ commit ก็นับ)
  **อย่าลืมใส่** — ถ้าไม่ใส่ มันจะย้ายทั้ง repo แล้วชนกับไฟล์ที่โครงสร้างใหม่ลบทิ้งไปเป็นร้อยไฟล์ (rename/delete)
- ไฟล์ที่ `$R` มีอยู่แล้ว (เช่น `docker-compose.yml`, `community/siet_community/extension.py`) สคริปต์แปลง **เฉพาะบรรทัดที่คุณแก้/เพิ่ม**
  บรรทัดอื่นปล่อยไว้ให้ `git merge $R` เอาของโครงสร้างใหม่มาใส่ (กัน conflict ที่คุณไม่ได้ก่อ) และจะ **ไม่เปลี่ยนชื่อ env** ในไฟล์พวกนั้น
  (compose อ่านชื่อใหม่ก่อน แล้วค่อยถอยไปชื่อเก่า: `${LSP_SIET_X:-${OPEN_NOTEBOOK_X:-ค่าเริ่มต้น}}`) ถ้าบรรทัดใหม่ของคุณใช้ชื่อ `OPEN_NOTEBOOK_*` มันใช้ได้
  แต่สคริปต์เตือน — แก้เป็นรูปแบบข้างบนตอน resolve merge
- ขั้น 2 ต้อง `git add -A` รวม `scripts/lsp-siet/` ด้วย เพราะตอน merge ขั้น 3 ไฟล์ชุดเดียวกันจะมาจาก `$R` อยู่แล้ว
  (ถ้า `$R` มี commit ใหม่หลังจากที่คุณเอาสคริปต์มา แล้ว git บอกว่า `scripts/lsp-siet` ชนกัน ให้เลือกฝั่ง `$R`:
  `git checkout --theirs scripts/lsp-siet && git add scripts/lsp-siet`)
- `--check` คืน exit 1 เมื่อมีของให้แปลง (ไม่ใช่ error) และ 0 เมื่อไม่มีอะไรเหลือ
- ย้อนกลับได้ทุกจุด: ก่อน commit ขั้น 2 ใช้ `git reset --hard && git clean -fd scripts/lsp-siet` (ลบสคริปต์ที่เอามาวางด้วย: `git checkout $R -- scripts/lsp-siet`
  ใหม่ก่อนรันอีกรอบ; อย่าใช้ `git clean -fd scripts` — มันลบไฟล์ใหม่ของคุณใต้ `scripts/` อื่น ๆ ด้วย) · ขั้น 3 ที่ยังค้าง conflict ใช้ `git merge --abort` ·
  merge เสร็จแล้วใช้ `git reset --hard ORIG_HEAD`
  - macOS: หลัง `reset --hard` โฟลเดอร์บนดิสก์อาจยังสะกด `my-ai-quiz` (ตัวเล็ก) ทั้งที่ git บอก `My-ai-quiz/…` — **รันสคริปต์ซ้ำได้เลย** สคริปต์รู้จักสถานะนี้
    (บรรทัด `note: My-ai-quiz is spelled my-ai-quiz on this disk …`) ถ้าอยากให้ดิสก์ตรงกับดัชนีก่อน: `mv my-ai-quiz tmp-quiz && mv tmp-quiz My-ai-quiz`
- ถ้า `refactor/lsp-siet` ถูกรวมเข้า `main` ไปแล้ว ให้ใช้ 1b เท่านั้น (อย่าทำ `git merge origin/main` ในขั้น 1 ของ 1a)

## 2. อ่านผลของสคริปต์

บรรทัดที่ขึ้นต้นด้วย `check by hand:` คือสิ่งที่สคริปต์ **ไม่กล้าแก้เอง** — ไล่ทีละบรรทัดก่อน merge (ไม่มีผลต่อ exit code):

| ข้อความ | หมายถึง | ต้องทำ |
|---|---|---|
| `… has neither X nor Y` (หรือ `has no X`) `(the restructure deleted or split it)` | คุณแก้ไฟล์ที่โครงสร้างใหม่ **ลบหรือแตกเป็นหลายไฟล์** (ข้อ 5) | ย้ายสิ่งที่คุณแก้ไปไฟล์ใหม่ด้วยมือ; ใช้ `git diff <base> HEAD -- <ไฟล์เดิม>` (ในบรรทัดมีคำสั่งให้) ดูว่าคุณแก้อะไร **ก่อน commit ขั้น 2** |
| `imports siet_platform.features.service, which does not exist …` | import จากโมดูลที่ไม่มีแล้ว (เช่น คุณเพิ่มฟังก์ชันใหม่ใน `features/service.py`) | เปลี่ยนเป็นโมดูลใหม่ที่ฟังก์ชันนั้นไปอยู่ |
| `patch target "…" was not rewritten …` | string ใน `mock.patch(...)`/`monkeypatch.setattr(...)` (ข้อ 6) | patch ที่โมดูลที่ **ใช้** ฟังก์ชัน |
| `dropped … exports dynamic that the kept … lacks` | ไฟล์สองฝั่งชื่อซ้ำกัน (หน้า/โมดูลของ host กับของ `siet-platform`); ไฟล์ที่ไม่ถูกเก็บมี `export` ที่ไฟล์ที่เก็บไม่มี (`dynamic`, `revalidate`, `metadata`, `generateMetadata` …) | ถ้ายังต้องใช้ ให้เพิ่ม `export` นั้นในไฟล์ที่เก็บ (ตัวอย่างจริง: `/config/apps` ต้อง `export const dynamic = 'force-dynamic'`) |
| `collision: … kept A, dropped B` | โครงสร้างเดิมมีสองไฟล์ชื่อซ้ำกัน (`open-notebook/…` กับ `siet-platform/…`) ตอนนี้เหลือไฟล์เดียว | ถ้า B ที่ถูกทิ้งมีการแก้ของคุณ ให้เอามาใส่ A ด้วยมือ (`git show HEAD:B`) |
| `your edits stay in this file; … wins at …` | คุณแก้ไฟล์ที่ "แพ้" ในข้างบน | สคริปต์ไม่ลบ (กันงานคุณหาย) git จะฟ้อง conflict ตอนขั้น 3 — เอาส่วนที่แก้ไปใส่ไฟล์ที่ชนะ |
| `conflict: … is spelled … on this disk and git's index holds files of that directory under both spellings` | (macOS) ดัชนีมีไฟล์ในโฟลเดอร์เดียวกันสะกดสองแบบ (มักเกิดจาก `git add` ไฟล์ใหม่ใต้ `My-ai-quiz/` หลังโฟลเดอร์ถูกเปลี่ยนเป็น `my-ai-quiz/` แล้ว) สคริปต์เลยไม่ย้ายไฟล์นั้น (ไม่งั้นมันจะซ้อนลงไปอีกชั้น) | ในบรรทัดมีคำสั่งให้สองแบบ: ไฟล์ยังเป็นโครงสร้างเดิม → `git mv <เดิม> <path ใหม่>` ตามที่บรรทัดบอก · ไฟล์เป็นโครงสร้างใหม่อยู่แล้ว → `git mv` ผ่านชื่อชั่วคราวให้ดัชนีสะกดเหมือนดิสก์ แล้วรันใหม่ |
| `still mentions open-notebook (2x)` | ในไฟล์ข้อความ (Makefile, yml, md) ยังมีชื่อโฟลเดอร์เก่า | แก้เองตามตารางข้อ 3 |
| `note: ignored, not moved: …` | โฟลเดอร์ที่ git ไม่ track (`node_modules`, ข้อมูล dev) ไม่ถูกย้าย | ย้ายเอง ดูข้อ 7 |

สิ่งที่สคริปต์แก้ให้เองในไฟล์ของคุณ:

- `import` / `from … import` ของ Python ตามชื่อโมดูลใหม่ (`open_notebook` → `siet_core`) และแยกชื่อที่ย้ายไปโมดูลอื่นให้
  (เช่น `from siet_platform.features.service import generate_quiz, _invoke_chat` → `siet_quiz.service` กับ `siet_platform.ai_helpers`)
- `from . import x` ที่ `x` ย้ายไปอยู่คนละแพ็กเกจ → import แบบเต็ม
- `import` ใน TypeScript (`@siet/platform/lib/...` → `@/lib/...`; `./x` ที่ย้ายแล้วหายไปเป็น alias)
- ชื่อที่เปลี่ยน (ข้อ 4): `OpenNotebookError`, `open_notebook_error_handler`, `openNotebookDialog`
- ชื่อ env ใน `*.yml`, `Makefile`, `Dockerfile*`, `.env.example`, `*.sh`, `*.toml`, `*.json`
- **ไม่แตะ** ค่าที่ต้องคงชื่อเดิม: namespace/database ของ SurrealDB (`open_notebook`), ชื่อ app/คำสั่งของ surreal-commands
  (`app="open_notebook"`, `"open_notebook.process_source"`), `JWT_ISSUER`, ค่า salt ของการเข้ารหัส — ถ้าเห็นอยู่ในโค้ดใหม่ ถูกต้องแล้ว

## 3. อะไรย้ายไปไหน

| เดิม | ใหม่ |
|---|---|
| `open-notebook/open_notebook/` (แพ็กเกจ `open_notebook`) | `platform/siet_core/` (แพ็กเกจ `siet_core`) |
| `open-notebook/{api,commands,prompts,tests}/` | `platform/{api,commands,prompts,tests}/` |
| `open-notebook/frontend/` + `siet-platform/frontend/` (host สองชั้นที่ซ้อนกัน) | `platform/frontend/` ชั้นเดียว (`@/…`) |
| `siet-platform/siet_platform/`, `siet-platform/tests/` | `platform/siet_platform/`, `platform/tests-platform/` |
| `open-notebook/api/routers/{notebooks,sources,notes,chat,source_chat,embedding,insights,transformations,search}.py` | `kmitl-rag/kmitl_rag/routers/` |
| หน้า `/notebooks`, `/sources` ใน `open-notebook/frontend/src/app/(dashboard)/` (ทั้งโฟลเดอร์ `notebooks/components/` ยกเว้น `NoteEditorDialog`) | `kmitl-rag/frontend/src/app/(dashboard)/` |
| `siet-platform/siet_platform/features/` (quiz + roadmap + ตัวช่วย AI) | `my-ai-quiz/siet_quiz/`, `ai-roadmap/siet_roadmap/`, `platform/siet_platform/ai_helpers.py` |
| `siet-platform/siet_platform/routers/features.py` | `my-ai-quiz/siet_quiz/routers/features.py`, `ai-roadmap/siet_roadmap/routers/features.py`, `platform/siet_platform/http.py` |
| `My-ai-quiz/` (แอป Next.js) | `my-ai-quiz/app/` |
| `ai-roadmap-generator/` | `ai-roadmap/app/` |
| `community/frontend/src/…/admin/quiz` · `…/admin/roadmap` | `my-ai-quiz/frontend/src/…` · `ai-roadmap/frontend/src/…` |
| `siet-platform/frontend/src/app/(dashboard)/go/roadmap` | `ai-roadmap/frontend/src/app/(dashboard)/go/roadmap` |
| UI/ข้อมูลที่ community ใช้อย่างเดียว (`CommunityHeader`, `lib/api/courses.ts`, `use-courses`, `community-search` …) | `community/frontend/src/…` |
| `docker/open-notebook/` | `docker/platform/` |
| ข้อมูล dev (ไม่ track): `open-notebook/{surreal_data,notebook_data,redis_data}`, `ai-roadmap-generator/pb_data` | `platform/{surreal_data,notebook_data,redis_data}`, `ai-roadmap/app/pb_data` |

ถูก **ลบ**: podcast ทั้งชุด, หน้า `/advanced`, ภาษาอื่นนอกจาก `en-US`, เอกสาร/`.github`/`.maintainer` ของโปรเจกต์ต้นทาง

ไม่เปลี่ยน: path และ method ของ API, รูปแบบ request/response, JWT/cookie, พอร์ต (5055, 3000/8502, 3001, 3002),
โดเมน, namespace/database ของ SurrealDB, schema ของ MariaDB

## 4. ชื่อที่เปลี่ยน

| เดิม | ใหม่ | สคริปต์แก้ให้ |
|---|---|---|
| แพ็กเกจ Python `open_notebook` | `siet_core` | ใช่ |
| `OpenNotebookError`, `open_notebook_error_handler` | `SietError`, `siet_error_handler` | ใช่ |
| `openNotebookDialog` (ใน `useCreateDialogs()`) | `openCreateNotebookDialog` | ใช่ |
| alias `@siet/platform/…` | `@/…` (host เป็นตัวเดียว); ใหม่: `@siet/kmitl-rag/`, `@siet/community/`, `@siet/quiz/`, `@siet/roadmap/` | ใช่ |
| entry point group `open_notebook.extensions` | `siet.extensions` | ใช่ |
| `OPEN_NOTEBOOK_*`, `NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL` | `LSP_SIET_*`, `NEXT_PUBLIC_LSP_SIET_API_URL` | ในไฟล์ config ใช่ |
| container `kmitl_open_notebook_api`, image `kmitlai/open-notebook:local` | `lsp_siet_api`, `kmitlai/lsp-siet:local` | ไม่ (docs/RUNBOOK.md) |

**env:** `.env` เดิมของคุณใช้ต่อได้ทันที — โค้ดอ่านชื่อใหม่ก่อน ถ้าไม่มีค่อยอ่านชื่อเก่า (ค่าว่างของชื่อใหม่ไม่บังชื่อเก่า)
ค่อย ๆ เปลี่ยนชื่อ **ในบรรทัดเดิม** ได้ อย่าเพิ่ม `LSP_SIET_ENCRYPTION_KEY` ไว้ข้าง `OPEN_NOTEBOOK_ENCRYPTION_KEY` ด้วยค่าที่ต่างกัน
(ชื่อใหม่ชนะ แล้ว credential ที่เก็บไว้เดิมจะถอดรหัสไม่ได้ — API เตือนทุกครั้งที่สองชื่อต่างกัน และ **ไม่ยอมเริ่มทำงาน** ถ้าเป็น key ที่รันตรง ๆ ไม่ผ่าน docker compose;
compose ตัดสินให้ก่อนเงียบ ๆ) `SURREAL_NAMESPACE` / `SURREAL_DATABASE` ยังเป็น `open_notebook` ตามเดิม

## 5. โค้ดของแต่ละคนอยู่ที่ไหนตอนนี้

| คน | ที่อยู่ใหม่ | หมายเหตุ |
|---|---|---|
| **SpriteUm** (quiz) | `my-ai-quiz/app/` (แอปที่ 3001), `my-ai-quiz/siet_quiz/` (`service.py`, `schemas.py`, `domain.py`, `routers/`), `my-ai-quiz/frontend/` (หน้า `/admin/quiz` ใน host), `my-ai-quiz/tests/` | `siet_platform/features/service.py` ถูกแตก: ส่วนควิซ → `siet_quiz/service.py`, ตัวช่วย AI/RAG (`_invoke_chat`, `_retrieve_rag_context`, `_extract_json`, `_hash_prompt` …) → `platform/siet_platform/ai_helpers.py`, ส่วน roadmap → `ai-roadmap/siet_roadmap/service.py`; `features/schemas.py` และ `features/domain.py` แตกเป็น `siet_quiz/` กับ `siet_roadmap/` ตามชื่อคลาส; `routers/features.py` ของควิซ → `siet_quiz/routers/features.py` |
| **Poh** (community) | `community/siet_community/` (backend), `community/frontend/src/` (หน้าและ component), `community/tests/` | หน้า `/admin/quiz`, `/admin/roadmap` ไม่ใช่ของ community แล้ว (ย้ายไป quiz/roadmap) ส่วนที่ใช้ร่วมกันคือ `PostCounts` อยู่ใน `platform/frontend/src/components/admin/` |
| **Tanabordi** (auth) | `platform/siet_platform/{auth_jwt,auth_backend,auth_roles,login_guard,users,schema}.py`, `routers/{users,google_auth}.py`; หน้าบ้าน `platform/frontend/src/{app/(auth)/,components/auth/,lib/hooks/use-auth.ts,lib/stores/auth-store.ts,lib/roles.ts,lib/auth-redirect.ts}` | โมดูลเก่า `open-notebook/frontend/src/lib/hooks/use-auth.ts` (ไฟล์ shim สองบรรทัด) ถูกทิ้ง — ใช้ตัวของ `siet-platform` เป็นตัวจริง; test ของ auth อยู่ที่ `platform/tests-platform/` (`test_auth_roles.py`, `test_login_gate.py`) และ `platform/tests/test_auth.py` |

เจ้าของแต่ละโฟลเดอร์ดูได้ที่ `.github/CODEOWNERS`

## 6. ของที่ต้องระวังเป็นพิเศษ

**หน้าใหม่ → `make frontend-routes`** — หน้าเว็บใหม่เขียนในส่วนของตัวเองที่ `<ส่วน>/frontend/src/app/(dashboard)/<route>/page.tsx`
แล้วรัน `make frontend-routes` (สร้างไฟล์ stub บรรทัดเดียวใน `platform/frontend/src/app/…`; ติดป้าย `// generated` ห้ามแก้เอง)
ถ้าลืม CI จะแดงที่ `node scripts/frontend-routes.mjs --check`

**`mock.patch` ของฟังก์ชันที่ย้ายไป `ai_helpers` / `http`** — ชื่อต่อไปนี้ถูกย้ายไปโมดูลกลาง แล้วไฟล์ของ quiz/roadmap/community
`import` ชื่อนั้นเข้าไปเป็นตัวแปรของตัวเอง: `siet_platform.ai_helpers` (`_invoke_chat`, `_retrieve_rag_context`, `_extract_json`,
`_hash_prompt`, `_format_rag_chunks`, `model_manager`, `text_search`, `MAX_RAG_CONTEXT_CHARS`) และ `siet_platform.http`
(`_charge`, `_insufficient`, `_resolve_owner_id`, `DEFAULT_OWNER_ID`)
ดังนั้น `patch("siet_platform.ai_helpers._invoke_chat")` **ไม่ดักอะไรเลย** (test ผ่านแต่ไปเรียก LLM จริง)
ต้อง patch ที่โมดูลที่ใช้: `siet_quiz.service._invoke_chat`, `siet_roadmap.service._invoke_chat`,
`siet_community.roadmap_plan._invoke_chat`, `siet_quiz.routers.features._resolve_owner_id`, `siet_roadmap.routers.features._charge` …
สคริปต์เลยไม่แก้ string พวกนี้ (ปล่อยชื่อเดิมให้ test พังเสียงดัง) และพิมพ์ `patch target … was not rewritten` ให้เห็น

**ไฟล์ที่โครงสร้างใหม่แตกหรือลบ** — ถ้าคุณแก้ `siet_platform/features/{service,schemas,domain}.py` หรือ `siet_platform/routers/features.py`
git จะฟ้อง `modify/delete` ตอนขั้น 3 (และสคริปต์เตือนไว้แล้วในขั้น 2): เอาการแก้ไปใส่ไฟล์ใหม่ตามข้อ 5
(`git diff <base> HEAD -- <ไฟล์เดิม>` หาส่วนที่คุณแก้) แล้ว `git rm` ไฟล์เดิม

**ไฟล์ใหม่ใน `notebooks/components/`** — ตามไปอยู่ `kmitl-rag/frontend/src/app/(dashboard)/notebooks/components/` ทั้งโฟลเดอร์
(ยกเว้น `NoteEditorDialog` ที่ host ยังใช้เอง จึงอยู่ที่ `platform/frontend/src/app/(dashboard)/notebooks/components/`)

**ถ้าคุณ "ลบ" ไฟล์เดิม** — git จะฟ้อง `rename/delete` กับไฟล์ที่โครงสร้างใหม่ย้ายไว้ เลือกฝั่งลบได้เลย (`git rm <path ใหม่>`)

## 7. macOS และข้อมูลในเครื่อง

- **อย่า `git add` ไฟล์ใหม่ใต้ `My-ai-quiz/` ระหว่างขั้น 2 กับ 3** (macOS): ตราบที่ดัชนียังมีไฟล์ `My-ai-quiz/…` ที่ยังไม่ย้าย `git add` จะสะกดโฟลเดอร์ตามดัชนี
  ไม่ใช่ตามดิสก์ สคริปต์ stage ไฟล์ใหม่ที่มันย้ายไว้ให้เองด้วยชื่อที่ถูกแล้ว (`my-ai-quiz/app/…`); ไฟล์ที่คุณสร้างเพิ่มทีหลังให้รอ merge เสร็จก่อน
- **ตัวพิมพ์เล็ก/ใหญ่ (macOS):** `My-ai-quiz` → `my-ai-quiz/app` ต่างกันแค่ตัว `M` ดิสก์ macOS ไม่แยกตัวพิมพ์ ถ้าย้ายด้วย `git mv` ตรง ๆ
  โฟลเดอร์จะยังสะกดแบบเก่า (`My-ai-quiz/app/...`) แต่ git คิดว่าเป็น `my-ai-quiz/app/...` สคริปต์เปลี่ยนชื่อผ่านชื่อชั่วคราวให้แล้ว
  (บรรทัด `note: My-ai-quiz is spelled my-ai-quiz …`) ถ้าต้องทำเอง: `git mv My-ai-quiz tmp-quiz && mkdir my-ai-quiz && git mv tmp-quiz my-ai-quiz/app`
- **โฟลเดอร์ที่ git ไม่ track** สคริปต์ไม่ย้ายให้ (กันลบข้อมูล) แต่บอกชื่อไว้ในบรรทัด `note: ignored, not moved:`
  ย้ายเองก่อนรัน `docker compose` (ไม่งั้น SurrealDB จะเริ่มจากฐานว่าง):
  `mv open-notebook/surreal_data platform/` · `notebook_data`, `redis_data` เหมือนกัน · `mv ai-roadmap-generator/pb_data ai-roadmap/app/` ·
  `node_modules`/`.next` ของแอป quiz → `my-ai-quiz/app/` และของ host → `platform/frontend/` (หรือ `npm ci` ใหม่)
- venv ของ Python: ใช้ `cd platform && uv sync` (ทุกส่วนติดตั้งจาก `platform/` ที่เดียว)

## 8. ตรวจว่าเรียบร้อย

```bash
git status                       # ไม่ควรเหลือ conflict (UU/UD/AU)
git ls-files | grep -E '^(open-notebook|siet-platform|My-ai-quiz|ai-roadmap-generator)/'   # ต้องไม่พิมพ์อะไรเลย
make test-backend                # platform + kmitl-rag + quiz + roadmap + community
make test-frontend               # tsc + vitest (รัน frontend-links และ frontend-routes ให้ด้วย)
python3 scripts/lsp-siet/codemod.py --check   # ต้องไม่มีอะไรเหลือให้ทำ ("nothing to do")
```

บน macOS ให้ดูบรรทัด `git ls-files | grep …` โดยเฉพาะ: `git status` สะอาดได้แม้ git จะเก็บไฟล์ไว้ใต้ `My-ai-quiz/` (ตัว M ใหญ่)
เพราะดิสก์ไม่แยกตัวพิมพ์ — ถ้าบรรทัดนั้นพิมพ์อะไรออกมา ไฟล์พวกนั้นอยู่ผิดชื่อโฟลเดอร์ใน git (Linux/CI/Docker จะเห็นเป็นโฟลเดอร์แปลกปลอม)
แก้ด้วย `git mv <path> tmp-file && git mv tmp-file <path ที่สะกดถูก>` ทีละไฟล์

test ที่แดงอยู่แล้วก่อนโครงสร้างใหม่ (baseline) อยู่ใน `docs/lsp-siet/known-failures.txt` — CI ข้ามเฉพาะรายการนั้น
test ใหม่ที่แดงนอกรายการ = ของคุณ

## 9. ถ้าติด

- conflict เนื้อหา (`UU`) ในไฟล์ที่คุณและโครงสร้างใหม่แก้บรรทัดเดียวกัน: แก้แบบปกติ (ดูผลลองรันที่ `docs/lsp-siet/dryrun.md` ว่าเจอแบบไหนบ้าง)
- `AU … added by us` / `file location` ของไฟล์ใหม่ที่ยังอยู่ในโฟลเดอร์เก่า: สคริปต์พลาด — `git mv` ไปที่ git แนะนำ แล้วบอกพี่ (เพื่อให้เติมกฎใน `scripts/lsp-siet/moves.py`)
- อยากเริ่มใหม่: `git merge --abort` แล้ว `git reset --hard <commit ก่อนรันสคริปต์>`
- สคริปต์ทำงานผิดแปลก / ข้อความที่ไม่รู้จัก: อย่าแก้มือยาว ๆ — ส่ง output ของ `codemod.py --check` ให้พี่ดู
