# open-notebook กับ upstream

> `open-notebook/` คือสำเนาของ [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook)
> ที่เรา vendor ไว้ในรีโปนี้ เอกสารนี้บอกว่าตอนนี้เราอิงเวอร์ชันไหน แก้ไฟล์ของ upstream ไปตรงไหนบ้าง
> และดึงเวอร์ชันใหม่ของ upstream เข้ามาอย่างไร
>
> อัปเดตล่าสุด: 22 ตุลาคม 2026 (เฟส 0 ของการแยกโค้ด KMITL ออกจาก open-notebook — branch `refactor/siet-split`)

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

- โค้ดของ KMITL ไม่อยู่ใน `open-notebook/` อีกต่อไป มันอยู่ที่ `siet-platform/`, `kmitl-rag/`, `community/`
  ที่ root ของรีโป (ดู `docs/ARCHITECTURE.md` เมื่อแยกเสร็จ)
- ใน `open-notebook/` แก้ไฟล์ของ upstream ได้เฉพาะสองแบบ และต้องจดไว้ในข้อ 4 ทุกครั้ง
  1. **hook point** — จุดเล็ก ๆ ที่ให้แพ็กเกจของ KMITL ลงทะเบียนตัวเองเข้าไป
  2. **patch ที่ทำเป็น hook ไม่ได้** — ตอนนี้มีแค่ owner scoping (กรองข้อมูลตาม `owner_id`)
- ห้ามลบไฟล์ของ upstream ถ้าไม่อยากใช้ให้ปิดด้วย flag หรือซ่อนจาก nav (การลบทำให้ชนแบบ modify/delete ทุกครั้งที่ดึง)
- ห้ามแก้ migration ของ upstream และห้ามใช้เลข migration ของ core migration ของ KMITL อยู่ใน track ของตัวเอง

## 3. วิธีดึง upstream เวอร์ชันใหม่

```bash
git remote add upstream https://github.com/lfnovo/open-notebook.git   # ครั้งแรกเท่านั้น
git fetch --no-tags upstream tag v1.15.0

# 1) ลองก่อนใน worktree ชั่วคราว ไม่แตะ branch ปัจจุบัน — ได้รายการไฟล์ที่ชน
scripts/upstream/dryrun-sync.sh v1.15.0

# 2) ดึงจริงบน branch ใหม่
git switch -c chore/upstream-v1.15.0 staging
git subtree pull --prefix=open-notebook --squash upstream v1.15.0
#    แก้ conflict → รัน backend/frontend tests → ตรวจ migration ของ upstream ที่เพิ่มมา (ข้อ 5)

# 3) เลื่อน branch upstream ล้วนตาม (parent ที่ 2 ของ merge commit คือ squash commit ใหม่)
git branch -f vendor/open-notebook HEAD^2
```

`git subtree` หา base จากบรรทัด `git-subtree-split:` ใน commit message จึงห้าม squash หรือ rebase
commit `e59542d`/`f890a34` ทิ้ง (`scripts/upstream/lib.sh` ก็อ่านค่า base จากบรรทัดเดียวกัน)

ดูว่าตอนนี้เราต่างจาก upstream แค่ไหน:

```bash
scripts/upstream/diff-report.sh > /tmp/report.md
```

## 4. สิ่งที่ KMITL แก้ในไฟล์ของ upstream

### 4.1 ก่อนแยก (เฟส 0)

ตัวเลขวัดที่ commit `f890a34` ผลเต็มอยู่ใน `docs/upstream/`

| | ก่อนแยก |
|---|---:|
| ไฟล์ upstream ที่ถูกแก้ | 79 |
| ไฟล์ upstream ที่ถูกลบ | 32 |
| ไฟล์ที่ KMITL เพิ่มใน `open-notebook/` | 192 |
| ไฟล์ที่ชนเมื่อลองดึง v1.15.0 | **72** (AA 14 · DU 24 · UU 34) |

- **AA 14** — migration 19–25 (และ `_down`) ของเรากับของ upstream ใช้เลขเดียวกันแต่เนื้อหาคนละเรื่อง
- **DU 24** — ไฟล์ที่เราลบแต่ upstream ยังแก้: ระบบ podcast, `Dockerfile`, `docker-compose.yml`,
  `supervisord.conf`, `.dockerignore`, `api/routers/auth.py`, `use-ask.ts`, `StreamingResponse.tsx`
- **UU 34** — ไฟล์ที่ทั้งสองฝั่งแก้ เช่น `api/main.py`, `api/routers/chat.py`, `search.py`, `sources.py`,
  `AppSidebar.tsx`, `auth-store.ts`, `globals.css`, `pyproject.toml`, `uv.lock`

ไฟล์รายงาน: `docs/upstream/diff-report-before-split.md`, `docs/upstream/dryrun-v1.15.0-before-split.md`

### 4.2 hook points

_(เพิ่มในเฟส 1)_

### 4.3 owner scoping patch

_(จดในเฟส 1 — `notebooks.py`, `sources.py`, `notes.py`, `source_chat.py`, `domain/notebook.py`, `lib/api/client.ts`)_

## 5. migration

_(เฟส 2 — ย้าย migration 19–25 และส่วนที่เราเพิ่มใน 9 ไป track `k1–k8`, ถอย version ของ core กลับเป็น 18,
คำสั่ง `make migrate-split`)_
