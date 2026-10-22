# รายงาน: ดึง upstream v1.15.0 + deploy + PR ไป upstream

วันที่ 23 ตุลาคม 2026 · ทำต่อจากการแยกโค้ด KMITL ออกจาก open-notebook (`refactor/siet-split`)

## สรุป

| เรื่อง | สถานะ |
|---|---|
| ดึง open-notebook v1.15.0 เข้ามา | เสร็จ: `chore/upstream-v1.15.0` → staging `dc064a7` (ในเครื่อง ยังไม่ push) |
| Deploy prod | เสร็จ: 03:12 น. core migration 18 → 25 ผ่าน API ไม่มี error |
| ไฟล์ dump 40 MB ใน container SurrealDB | ลบแล้ว (สร้าง container ใหม่) |
| PR ไป lfnovo/open-notebook | เปิดแล้ว 2 PR: [#1521](https://github.com/lfnovo/open-notebook/pull/1521), [#1522](https://github.com/lfnovo/open-notebook/pull/1522) |
| Branch `refactor/community` ของ SpriteUm | ยังไม่ merge: ต้องรู้ก่อนว่าใครเป็นเจ้าของ 4 ไฟล์ที่ชน |

## 1. ดึง upstream v1.15.0

- ไฟล์ที่ชน **20** ไฟล์ (ก่อนแยกโค้ดจะชน 72) แก้ครบทุกไฟล์
- ไฟล์ upstream ที่เรายังแก้อยู่ลดจาก 45 เหลือ **43** รายงานเต็มอยู่ที่ `docs/upstream/diff-report-v1.15.0.md`
- commit: `22bf9ea` (squash upstream), `6d6151c` (merge), `380b819` (docs), `dc064a7` (เข้า staging)
- `vendor/open-notebook` ชี้ไปที่ `22bf9ea` แล้ว

### สิ่งที่แก้ระหว่างรวม

| เรื่อง | ทำอะไร |
|---|---|
| `get_source_or_404` ของ upstream คืนค่าเป็น `_source` | เปลี่ยนเป็น `source` เพราะการตรวจเจ้าของใช้ตัวแปรนี้ ไม่แก้จะพังทุก route ของ source chat (ruff F821 จับได้) |
| upstream ลบ `ContextBuilder` | ตัด cache hook `context` และ `siet_platform/cache/context.py` |
| upstream จำกัด full text ด้วย token budget เอง | ตัด hook `source_chat.full_text_limit` |
| replay ข้อความแชต | เปลี่ยนไปใช้ filter `chat.messages` ทั้งรายการ |
| `connection_tester.py` ของ upstream ใช้ provider registry | ไม่ต้องใช้ patch Gemini ของเราแล้ว |
| upstream ไฮไลต์เมนูที่ path ยาวสุดเอง | ตัดของเราทิ้ง; test ของเราเปลี่ยนไปเช็ก class `bg-popover` |
| `components/source/` ย้ายเป็น `components/sources/` | แก้ import ในแพ็กเกจของเรา |
| eslint `no-explicit-any` เป็น error แล้ว | `any` ที่ตั้งใจใน `lib/extensions.ts` ใส่คอมเมนต์ disable กำกับ |
| test `search/page.test.tsx` ของ upstream | mock รายชื่อแพ็กเกจเป็นว่าง (แบบเดียวกับ `AppSidebar.test.tsx`) |
| `api/dependencies.py` | ลบ import `Depends` ที่ไม่ได้ใช้ |

### ผลทดสอบ

- **Backend:** ผ่าน 1277 ไม่ผ่าน 79 ทั้งหมดเป็น 401 (owner scoping) หรือ 404 (ปิด podcasts) ซึ่งเป็นสาเหตุเดียวกับที่ staging ไม่ผ่านอยู่แล้ว
  - ไม่มี test ของแพ็กเกจ SIET ใหม่ที่ไม่ผ่าน
  - layering test ผ่าน
  - ruff เท่ากับ staging
- **Frontend:** ไม่ผ่าน 4 จาก 213
  - 3 ตัวเป็น markdown-editor ซึ่งไม่ผ่านบน upstream ล้วนด้วย
  - อีก 1 ตัวคือ locales unused-key ที่รู้อยู่แล้ว
  - tsc, lint, build ผ่าน
- **รีวิวการตรวจเจ้าของ:** ทุก route ใน chat, source_chat, sources, notes, notebooks ยังตรวจเจ้าของครบเหมือน staging
- **Migration กับสำเนาข้อมูล prod:** split แล้วรัน core 25 ต่อด้วย k1–k8 ได้ปกติ
  - จำนวนแถวไม่เปลี่ยน
  - ค้นแบบจำกัด notebook ได้เฉพาะ source ใน notebook นั้น
  - start ครั้งที่สองไม่รันอะไรเพิ่ม

## 2. Deploy prod

1. build image ระหว่างที่ระบบเดิมยังรัน
2. หยุด API กับ SurrealDB แล้วสำรองข้อมูลไว้ที่ **`backups/surreal_data-20261023-031144`**
3. สร้าง container SurrealDB ใหม่ ซึ่งลบไฟล์ `/tmp/siet-export.surql` ไปด้วย จากนั้น `up -d`
4. API รัน core migration 19–25 ของ upstream สำเร็จ (version 25) และ k-track ไม่ต้องรันเพิ่ม

**ตรวจหลัง deploy:** GET 66 endpoint ได้ผลเหมือนก่อน deploy 63 ตัว อีก 3 ตัวต่างตามที่คาด

| endpoint | ต่างเพราะ |
|---|---|
| `/api/config` | version 1.10.0 → 1.15.0 |
| `/api/settings` | ค่า default ของ docling (migration 23) และภาษา YouTube ของ upstream |
| `/api/admin/llm-throttle` | ตัวนับรีเซ็ตเพราะ restart |

ทุกหน้าผ่าน Traefik ตอบ 200 และ log ของ API ไม่มี error

ข้อสังเกต: migration 20 ของ upstream สร้างตาราง `episode_profile` (ว่าง) กลับมา ไม่มีผลเพราะปิด podcasts ไว้ ถ้าอยากลบให้ทำเป็น k9

### ถ้าต้องย้อนกลับ

```bash
cd /Users/phuwish/kmitlAI
git switch -c rollback a108090          # โค้ดก่อน v1.15
docker compose -p kmitlai -f docker-compose.yml --env-file .env stop open_notebook_api surrealdb
rm -rf open-notebook/surreal_data && cp -a backups/surreal_data-20261023-031144 open-notebook/surreal_data
make up
```

## 3. PR ไป upstream (lfnovo/open-notebook)

- **Fork:** https://github.com/phuwishpk/open-notebook-upstream
  - เป็น public เพราะ fork ของ repo public ต้องเป็น public
  - ชื่อนี้เพราะ `phuwishpk/open-notebook` เป็น repo private ของเราอยู่แล้ว
- **ขั้นตอนของ upstream:** อนุญาตให้ "small obvious fix" เปิด PR ได้โดยไม่ต้องมี issue ทั้งสอง PR ทำบน `main` ของ upstream และมีบรรทัด CHANGELOG

| PR | เรื่อง | ทดสอบ |
|---|---|---|
| [#1521](https://github.com/lfnovo/open-notebook/pull/1521) `fix: collapse double-prefixed record ids in ensure_record_id` | อ้างอิงแบบ `[source:source:abc]` เปิดไม่ได้ (404) | test ใหม่ 3 ตัว, ชุดเต็มของ upstream ผ่าน 1003, ruff และ mypy ผ่าน |
| [#1522](https://github.com/lfnovo/open-notebook/pull/1522) `fix: don't double /api when the API URL already ends with /api` | ถ้าตั้ง `NEXT_PUBLIC_API_URL=/api` จะเรียกไปที่ `/api/api/...` | test ใหม่ไม่ผ่านถ้าไม่มี fix และผ่านเมื่อมี fix, tsc และ eslint ผ่าน |

ไม่ได้ส่งเรื่องอ้างอิงแบบ `[url:...]` เพราะผูกกับ `asset_url` ของ KMITL upstream ใช้แยกไม่ได้

เมื่อ PR ถูก merge แล้ว ตอนดึง upstream รอบหน้าให้เอา patch สองตัวนี้ออกจากตาราง patch ใน `docs/UPSTREAM.md` ข้อ 4.3

## 4. ที่ยังค้าง

- **Branch ของ SpriteUm (`refactor/community`):** ชนกับ staging 4 ไฟล์คือ CommunityHeader, CreatorBox, InstructorMediaView, SavedSummariesView ต้องรู้ก่อนว่าโพธิ์หรือ SpriteUm เป็นเจ้าของ
  - ข้อความร่างถามโพธิ์ และประกาศถึงทีม อยู่ที่ `/private/tmp/claude-501/-Users-phuwish-kmitlAI/6b92a9d2-050a-4024-bcb1-5644800bce42/scratchpad/drafts-team-poh.md`
- **staging ยังไม่ push:** ตอนนี้ origin/staging ตามหลัง prod อยู่ (`a108090`, `dc064a7` ยังไม่ขึ้น GitHub)
- **siettest-\* stack:** ยังเก็บไว้ตามที่ขอ
