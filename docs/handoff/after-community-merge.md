# หลัง merge `refactor/community` — ขั้นตอนที่ต้องทำต่อ

> merge เข้า staging เมื่อ 23 ต.ค. 2026 (`1a784b1`) และแก้ tsc ต่ออีก commit (`fd6db92`) รายงานบั๊กอยู่ที่ issue #5
> ภาพรวมการแยกโค้ดอ่านได้ที่ `docs/handoff/siet-split.md`

## สถานะตอนนี้

| | |
|---|---|
| งานของ SpriteUm (`254a779`) | อยู่ใน staging ครบ |
| 4 จุดที่ชนกับงานของ Poh (#4) | ใช้ของ Poh ไว้ก่อน และเก็บโค้ดของ SpriteUm ไว้ในคอมเมนต์ `MERGE-OWNER` |
| tsc / build | ผ่าน (`fd6db92` แก้ TS2367 ในหน้า "วิชาของฉัน") |
| prod | **ยังไม่ได้ deploy** commit ชุดนี้ |

## 1. ทุกคน: อัปเดตเครื่องตัวเอง

```bash
git fetch origin
git switch staging && git pull --ff-only
make frontend-links          # ครั้งแรกหลัง clone หรือ npm install
make test-frontend
```

ไฟล์หน้า community ย้ายไปแล้ว **อย่าแก้ที่ path เดิม**

| เดิม | ตอนนี้ |
|---|---|
| `open-notebook/frontend/src/app/(dashboard)/community/page.tsx` | `community/frontend/src/app/(dashboard)/community/page.tsx` (ที่เดิมเหลือ stub บรรทัดเดียว) |
| `open-notebook/frontend/src/components/community/*` | `community/frontend/src/components/community/*` ส่วนใหญ่; `CommunityHeader`, `LibraryPanel`, `PointsWallet` → `siet-platform/frontend/...`; `AiQuickWidget`, `AnswerReferences` → `kmitl-rag/frontend/...` |

## 2. SpriteUm: ทำงานต่อบน `refactor/community`

branch เดิมตามหลัง staging อยู่ ให้ดึง staging เข้ามาก่อนแก้อะไรต่อ ครั้งนี้จะไม่ชน เพราะงานของ SpriteUm อยู่ใน staging แล้ว

```bash
git switch refactor/community
git merge origin/staging
python3 scripts/siet-split/codemod.py --check   # ต้องไม่เหลือไฟล์ที่ import path เก่า
cd open-notebook/frontend && npx tsc --noEmit && npm run build
```

หรือจะแตก branch ใหม่จาก staging เลยก็ได้ (`git switch -c <ชื่อใหม่> origin/staging`)

## 3. Poh + SpriteUm: ตัดสินเจ้าของ 4 จุด `MERGE-OWNER`

ดูทุกจุดได้ด้วยคำสั่งนี้

```bash
grep -rn "MERGE-OWNER" siet-platform/frontend/src community/frontend/src
```

| ไฟล์ | จุดที่ต่าง |
|---|---|
| `siet-platform/frontend/src/components/community/CommunityHeader.tsx` | placeholder และ style ของช่องค้นหา |
| `community/frontend/src/components/community/CreatorBox.tsx` | style ของปุ่มเขียนโพสต์ |
| `community/frontend/src/components/community/InstructorMediaView.tsx` | หัวหน้าเพจ: ข้อความเปล่า vs Card ไล่สีชมพู |
| `community/frontend/src/components/community/SavedSummariesView.tsx` | หัวหน้าเพจ: ข้อความเปล่า vs Card ไล่สีเหลือง |

ตกลงกันได้แล้ว ทำทีละจุดดังนี้
- **ใช้ของ Poh (ที่ใช้อยู่ตอนนี้):** ลบคอมเมนต์ `MERGE-OWNER` ทั้งก้อนออก
- **ใช้ของ SpriteUm:** เอาโค้ดในคอมเมนต์ (ใต้บรรทัด "SpriteUm's version") มาแทนโค้ดที่อยู่ใต้คอมเมนต์ แล้วลบคอมเมนต์
  - `InstructorMediaView` กับ `SavedSummariesView` import `Card` ไว้แล้ว ไม่ต้องเพิ่ม import

จากนั้นตรวจแล้ว commit

```bash
cd open-notebook/frontend && npx tsc --noEmit && npm run lint && npm run test
grep -rn "MERGE-OWNER" ../../siet-platform/frontend/src ../../community/frontend/src   # ต้องไม่เหลือ
git commit -am "chore(community): settle MERGE-OWNER hunks (<ใครเป็นเจ้าของ>)"
```

แล้วเปิด PR เข้า staging พร้อม block `merge-ownership` บอกว่าใครเป็นเจ้าของไฟล์ไหน
ครั้งต่อไปที่ชนจะได้ตัดสินตาม block นี้ได้เลย

## 4. ตรวจก่อน deploy

```bash
make test-backend test-frontend
cd open-notebook/frontend && npm run build
```

ผลที่ถือว่าผ่าน (ณ 23 ต.ค. 2026)
- **frontend:** ไม่ผ่านได้ไม่เกิน 4 ตัวนี้
  - `markdown-editor.test.tsx` 3 ตัว (ไม่ผ่านบน upstream ล้วนเหมือนกัน)
  - `locales/index.test.ts` unused-key 1 ตัว
- **backend:** ไม่ผ่านได้แค่ test ที่ได้ 401 (owner scoping) หรือ 404 (ปิด podcasts ไว้)

ลองเปิดหน้าเหล่านี้: `/community`, `/community?view=mine`, `/community?view=saved`, `/community?view=materials`

## 5. Deploy ขึ้น prod

ชุดนี้แก้แค่ frontend ไม่มี migration แต่สำรองข้อมูลไว้ก่อนตามปกติ

```bash
cd /Users/phuwish/kmitlAI
git switch staging && git pull --ff-only
make build                                      # build ขณะที่ระบบเก่ายังรัน
docker compose -p kmitlai -f docker-compose.yml --env-file .env stop open_notebook_api surrealdb
cp -a open-notebook/surreal_data backups/surreal_data-$(date +%Y%m%d-%H%M%S)
docker compose -p kmitlai -f docker-compose.yml --env-file .env up -d
```

ตรวจหลัง deploy

```bash
docker logs --since 5m kmitl_open_notebook_api 2>&1 | grep -iE " error |traceback"   # ต้องว่าง
for p in / /community /admin /admin/community; do
  printf "%-18s %s\n" $p $(curl -s -o /dev/null -w "%{http_code}" -u admin:123 -L http://localhost$p)
done                                                                              # ต้องได้ 200 ทุกหน้า
```

### ถ้าต้องย้อนกลับ

prod ก่อนชุดนี้คือ `dc064a7`

```bash
git switch -c rollback-community dc064a7
make up
```

ข้อมูลไม่ต้องคืน เพราะชุดนี้ไม่ได้แตะฐานข้อมูล
