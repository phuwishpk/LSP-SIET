# ย้ายโค้ด KMITL ออกจาก open-notebook — สิ่งที่ทีมต้องรู้

> branch `refactor/siet-split` · 23 ตุลาคม 2026 · โครงสร้างเต็มอยู่ใน `docs/ARCHITECTURE.md`

## สรุปสั้น ๆ

โค้ดที่ทีมเขียนเพิ่มทั้งหมดย้ายออกจาก `open-notebook/` ไปอยู่ 3 โฟลเดอร์ที่ root ของรีโป
**พฤติกรรมไม่เปลี่ยน** — URL, API, ตาราง, หน้าเว็บ เหมือนเดิมทุกอย่าง (ตรวจแล้ว: route ของ API 238 เส้นตรงกัน,
หน้าเว็บ 33 route ตรงกัน, CSS ที่ build ได้ selector ชุดเดียวกัน, test ผลเท่าเดิมหรือดีขึ้น)

| ของเดิมใน open-notebook | ตอนนี้อยู่ที่ |
|---|---|
| `open_notebook/domain/user.py`, `api/auth_jwt.py`, `api/auth_roles.py`, `api/login_guard.py` | `siet-platform/siet_platform/{users,auth_jwt,auth_roles,login_guard}.py` |
| `api/routers/{users,google_auth,features}.py` | `siet-platform/siet_platform/routers/` |
| `open_notebook/cache/`, `open_notebook/features/`, `domain/features.py` | `siet-platform/siet_platform/{cache,features}/` |
| `open_notebook/community/{points,throttle,usage,pricing,ratelimit,schema,library,retrieval}.py` | `siet-platform/siet_platform/` |
| `open_notebook/community/{ask,grounding}.py` | `kmitl-rag/kmitl_rag/` |
| `open_notebook/community/{repository,moderation,catalog,roadmap_plan}.py` | `community/siet_community/` |
| `api/routers/community.py` | `community/siet_community/routers/community.py` (ส่วน `/knowledge`, `/ask*` → `kmitl-rag/kmitl_rag/routers/ask.py`) |
| `api/routers/admin.py` | แยกเป็น 3: บัญชี/แต้ม/สุขภาพ → `siet_platform/routers/admin.py`, `/admin/rag/*` → `kmitl_rag/routers/admin.py`, ที่เหลือ → `siet_community/routers/admin.py` |
| global chat ใน `api/routers/chat.py`, notebook ask ใน `search.py` | `kmitl-rag/kmitl_rag/routers/{global_chat,notebook_ask}.py` |
| `frontend/src/components/community/*` | ส่วนใหญ่ `community/frontend/src/components/community/` — header/แจ้งเตือน/กระเป๋าแต้ม/คลัง → `siet-platform/frontend/...`, widget AI/ประวัติ/อ้างอิง → `kmitl-rag/frontend/...` |
| `frontend/src/components/admin/*` | ตามเจ้าของ: `siet-platform/frontend` (คอนโซลหลัก), `kmitl-rag/frontend` (rag), `community/frontend` (community/quiz/roadmap) |
| `frontend/src/lib/api/*`, `lib/hooks/use-{community,admin,courses,library,moderation,features}.ts`, `lib/roles.ts` ฯลฯ | `siet-platform/frontend/src/lib/...` |
| หน้าใน `frontend/src/app/(dashboard)/{community,teacher,admin,features}` | ตัวจริงอยู่ในแพ็กเกจ ไฟล์เดิมเหลือเป็น stub บรรทัดเดียว |

ฝั่งหน้าเว็บ import ด้วย `@siet/platform/...`, `@siet/kmitl-rag/...`, `@siet/community/...` แทน `@/...`
(path ภายในเหมือนเดิม เช่น `@/lib/roles` → `@siet/platform/lib/roles`)

## มี branch ค้างอยู่ — ทำอย่างไร

```bash
git switch <branch-ของคุณ>
git merge origin/staging            # หลัง refactor/siet-split เข้า staging แล้ว
python3 scripts/siet-split/codemod.py --check   # ดูว่าไฟล์ไหนยัง import path เก่า
python3 scripts/siet-split/codemod.py           # แก้ import ให้อัตโนมัติ (Python + TypeScript)
make frontend-links                 # ครั้งแรกหลัง clone/npm install
make test-backend test-frontend
```

- **การแก้ในไฟล์ที่ย้าย** ส่วนใหญ่ git ตามไปไฟล์ใหม่ให้เอง (rename detection) — ลองแล้วกับ `refactor/community`
  (11 ไฟล์): 10 ไฟล์ตามไปที่ตำแหน่งใหม่เอง อีก 1 คือ `community/page.tsx` (ดูข้อถัดไป)
  ส่วน conflict ใน `CommunityHeader`, `CreatorBox`, `InstructorMediaView`, `SavedSummariesView`
  เป็นของเดิม — merge branch นี้เข้า staging ตอนนี้ก็ชน 4 ไฟล์นี้อยู่แล้ว
- **ถ้าแก้ "หน้า" (page.tsx) ที่ย้ายไปแพ็กเกจ** git จะชนกับ stub ที่ path เดิม ให้เก็บ stub ไว้
  แล้วยกการแก้ของคุณไปใส่ไฟล์ในแพ็กเกจ:
  ```bash
  git show MERGE_HEAD:'open-notebook/frontend/src/app/(dashboard)/community/page.tsx' \
    > 'community/frontend/src/app/(dashboard)/community/page.tsx'
  git checkout HEAD -- 'open-notebook/frontend/src/app/(dashboard)/community/page.tsx'   # stub
  python3 scripts/siet-split/codemod.py
  ```
- **ชื่อที่ย้ายออกจากโมดูลเดิม** (codemod แค่เตือน "check by hand" แก้เองตามนี้):
  - Python: ฟังก์ชัน RAG session/history ของ `repository` → `kmitl_rag.history`; notifications → `siet_platform.notifications`;
    `moderation.log_action/list_audit` → `siet_platform.audit`; `_uid`, `_internal_error`, `_resolve_scope` … ของ router → `siet_platform.http`
  - TypeScript: `globalChatApi`, `chatApi.autoTitleSession` → `@siet/kmitl-rag/lib/api/global-chat`;
    ชนิด `GlobalChat*` → `@siet/kmitl-rag/lib/types/global-chat`; `QUERY_KEYS.globalChat*` → ค่าคงที่ใน `useGlobalChat`;
    `extractCitedReferences` → `@siet/kmitl-rag/components/common/MessageReferences`

## กฎใหม่ (มี test บังคับ)

1. `open-notebook/` เป็นของ upstream — **อย่าเขียนตรรกะของ KMITL ลงไป** ถ้าต้องเปลี่ยนพฤติกรรมของมัน ให้ใช้ hook
   (`open_notebook/extensions.py`, `frontend/src/lib/extensions.ts`) ดูรายการใน `docs/ARCHITECTURE.md` ข้อ 4
2. import ได้แต่ชั้นเดียวกันหรือชั้นล่าง: `open-notebook ← siet-platform ← kmitl-rag ← community`
   (`test_layering.py` / `layering.test.ts` แดงถ้าผิด)
3. หน้าใหม่: เขียนในแพ็กเกจ + stub บรรทัดเดียวใน `open-notebook/frontend/src/app/...`
4. migration ใหม่ของ SurrealDB: `siet-platform/siet_platform/migrations/k9.surrealql` (ไม่ใช่โฟลเดอร์ของ core)
5. PR จะขอรีวิวจากเจ้าของโฟลเดอร์อัตโนมัติตาม `.github/CODEOWNERS`

## ก่อน deploy ครั้งแรกหลัง merge

ฐานข้อมูลเดิมต้องย้ายเลข migration หนึ่งครั้ง (API จะไม่ start และบอกให้ทำ):

```bash
docker compose -p kmitlai build open_notebook_api
make migrate-split CONFIRM=1      # สำรอง surreal_data ให้ก่อนเสมอ
make up
```

รายละเอียดใน `docs/UPSTREAM.md` ข้อ 5
