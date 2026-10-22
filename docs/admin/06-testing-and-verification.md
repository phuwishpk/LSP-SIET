# 06 — การทดสอบและการตรวจงานส่วน admin

> สิ่งที่มีอยู่, วิธีรัน, baseline ที่ "พังอยู่แล้ว" (อย่าตกใจ), และสูตรตรวจกับ stack จริง
> ทุกคำสั่งรันจากรากโปรเจกต์ `/…/kmitlAI` เว้นแต่ระบุ

## 1. ชุดทดสอบที่มี

| ชุด | ไฟล์ | ครอบคลุม |
|---|---|---|
| vitest | `open-notebook/frontend/src/components/layout/AppSidebar.test.tsx` (8 เคส) | กลุ่มเมนู admin ครบ 3 กลุ่ม + href, ซ่อนจาก teacher/student, ไฮไลต์เฉพาะหน้าปัจจุบัน (`/admin/quiz` ไม่ติด `/admin`), พับ/กาง |
| pytest | `open-notebook/tests/test_admin_consoles.py` (27 เคส) | `summarize_rag_answers` (coverage, unknown, web/cache flags, การจัดอันดับเอกสาร, นับซ้ำ), `_pct`, `_naive_utc`, `_quiz_origin`, `_viewer_window`/`_viewer_day` (เที่ยงคืนของผู้ดู, 17:30Z = วันถัดไปที่กรุงเทพ) |
| สคริปต์เรียก API (ไม่ได้อยู่ใน repo) | แบบใน ข้อ 4 | ทุก endpoint ใหม่ 200 ด้วย admin, 403 ด้วยนักศึกษา, 404/422 ตามที่ตั้งใจ |
| ภาพหน้าจอ (ไม่ได้อยู่ใน repo) | แบบใน ข้อ 5 | ทุกแท็บของทุกหน้า + dialog + sidebar ทั้งสองบทบาท |

query SQL ใน `repository.py` **ไม่มี unit test** — ตรวจด้วยข้อ 4 กับฐานข้อมูลจริงแทน

## 2. Frontend

```bash
cd open-notebook/frontend
npx tsc --noEmit -p .                           # type-check ต้องผ่าน (exit 0)
npx eslint "src/app/(dashboard)/admin" src/components/admin src/components/layout src/lib/api/admin.ts src/lib/hooks/use-admin.ts
npx vitest run src/components/layout            # 8/8
npx vitest run                                   # ทั้งชุด
npx next build                                   # ยืนยันว่าหน้า /admin/* ถูก build (ดู ○ /admin/community ฯลฯ ในสรุป)
```

**Baseline ที่พังอยู่ก่อนแล้ว (ไม่ใช่ของงานนี้):**

- `src/lib/locales/index.test.ts` — 14 เคส locale parity (คีย์ที่ไม่ได้ใช้ของ podcasts ฯลฯ)
- `npx eslint src` ทั้งโปรเจกต์มี 1 error ใน `src/lib/types/api.ts:247` (empty interface)
- ถ้าเพิ่มคีย์ `navigation.*` ลง locale ต้องเพิ่มครบทุกภาษา มิฉะนั้นชุด parity จะพังเพิ่ม

## 3. Backend (pytest ในคอนเทนเนอร์)

`.venv` บนเครื่อง Mac นี้ใช้ไม่ได้ (ชี้ python ที่ไม่มี) ให้รันใน image ของ API แทน โดย **ไม่แตะ `/app`**:

```bash
C=kmitl_open_notebook_api; S=/tmp/stage_admin
docker exec $C mkdir -p $S
docker exec $C cp -r /app/api /app/open_notebook /app/tests $S/
# ทับด้วยไฟล์ที่แก้
for f in community/siet_community/routers/admin.py community/siet_community/repository.py siet-platform/siet_platform/library.py \
         siet-platform/siet_platform/features/domain.py tests/test_admin_consoles.py; do
  docker cp -q open-notebook/$f $C:$S/$f
done
# pytest ไม่อยู่ใน image (--no-dev) ติดตั้งลง /tmp/pt ครั้งเดียว
docker exec $C uv pip install -q --python /app/.venv/bin/python --target /tmp/pt pytest pytest-asyncio python-dotenv
docker exec -w $S -e PYTHONPATH=$S:/app:/tmp/pt $C /app/.venv/bin/python -m pytest tests/test_admin_consoles.py -q
```

- `PYTHONPATH` ต้องมี `/app` ด้วย ไม่อย่างนั้น `api/routers/sources.py` import `commands` ไม่เจอ (collection error)
- ชุดเต็ม: `pytest tests -q --ignore=tests/test_domain.py --ignore=tests/test_podcast_path.py` → **baseline
  53 failed / 388 passed** (ที่ fail คือ `test_*_api.py` ได้ 401 เพราะ conftest ไม่ได้ล้าง env auth ของคอนเทนเนอร์)
  เปรียบเทียบด้วยการ diff รายชื่อ FAILED ไม่ใช่นับจำนวน
- โฟลเดอร์ stage หายเมื่อ `make up` ครั้งถัดไป
- ทดลอง query ใหม่กับข้อมูลจริงแบบอ่านอย่างเดียว: เขียนสคริปต์ `asyncio.run(main())` ที่ import
  `repository`/`library`/`features` จาก stage แล้ว `docker cp` เข้าไปรันแบบเดียวกัน

## 4. ตรวจ endpoint กับ API จริง

หลังแก้ backend ต้อง `make up` (API เป็น image ที่ bake) จากนั้น:

```python
# โครงสคริปต์ (Python 3 มาตรฐาน ไม่ต้องติดตั้งอะไร)
import json, urllib.request
API = "http://localhost:5055/api"
def call(method, path, token=None, body=None):
    r = urllib.request.Request(API + path, method=method)
    if token: r.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    if data: r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, data=data, timeout=60) as resp: return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e: return e.code, e.read()[:200]
def login(u, p): return call("POST", "/users/login", body={"username": u, "password": p})[1]["access_token"]
```

เช็กลิสต์ที่เคยรันผ่าน (36 ข้อ):

1. admin `GET` ทุก endpoint ใหม่ → 200 และ key ครบตาม [05-backend-api.md](05-backend-api.md)
2. `/quizzes` ไม่มี `questions` ใน item; `/rag/documents` ไม่มี `file_path`; `/rag/stats` ไม่มีข้อความคำถาม
3. `quizzes/stats`: `generated + imported ≤ total` และ `sum(per_day) == generated`
4. `DELETE /comments/999999999`, `DELETE /quizzes/quiz_session:xxx`, `DELETE /quizzes/roadmap_session:abc`,
   `DELETE /rag/documents/999999999`, `POST …/retry` → **404** (ไม่ลบอะไร)
5. `?origin=bogus`, `?status=bogus`, `?days=0` → **422**
6. ล็อกอิน `demo.student1` / `Demo@2026` → ทุก route ด้านบน **403**

บัญชี admin: `WORKSPACE_SEED_ADMIN_USERNAME` / `WORKSPACE_SEED_ADMIN_PASSWORD` ใน `.env`

## 5. ตรวจด้วยภาพ (headless Chromium)

ใช้ `playwright-core` + Chromium ที่ cache ไว้ที่ `~/Library/Caches/ms-playwright/chromium_headless_shell-*`
(ติดตั้ง `playwright-core` ใน scratchpad ไม่ใช่ใน repo)

```js
const browser = await chromium.launch({ executablePath: '<cache>/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })).newPage()
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
// หน้า login ซ่อนช่อง #username ไว้หลัง "เข้าสู่ระบบด้วยชื่อผู้ใช้" เมื่อเปิด Google sign-in
if (!(await page.locator('#username').isVisible())) await page.getByText('เข้าสู่ระบบด้วยชื่อผู้ใช้').first().click()
await page.fill('#username', U); await page.fill('#password', P); await page.keyboard.press('Enter')
await page.waitForURL(u => !u.pathname.startsWith('/login'))
await page.goto(BASE + '/admin/rag', { waitUntil: 'domcontentloaded' })      // ห้ามรอ networkidle — มี polling
await page.getByRole('tab', { name: 'ภาพรวม', exact: true }).waitFor()
await page.getByRole('tab', { name: 'เอกสารที่ AI อ่าน', exact: true }).click()
```

สิ่งที่ควรจับทุกครั้ง: `page.on('console')` error, `page.on('response')` ที่ `/api/` และ status ≥ 400,
sidebar entry ที่มี class `bg-sidebar-accent` (ต้องมีอันเดียว = หน้าปัจจุบัน), ขนาด dialog
(`sm:max-w-lg` — ถ้ากว้างเกือบเต็มจอแปลว่ามีข้อความไม่ตัดบรรทัดดันอยู่), และ `document.body.classList`
ไม่มี `theme-siet` หลังออกจาก `/admin`

แถวข้อมูลมี `data-post-id`, `data-comment-id`, `data-document-id`, `data-quiz-id`, `data-roadmap-id`
ให้ selector จับได้โดยไม่พึ่งข้อความ; ปุ่มยืนยันใน `AlertDialog` ชื่อ "ลบถาวร" — ใน automation ให้กด "ยกเลิก"

## 6. ก่อนบอกว่าเสร็จ

- [ ] `tsc` + `eslint` ของไฟล์ที่แก้ + `vitest` sidebar ผ่าน
- [ ] pytest `test_admin_consoles.py` ผ่าน (และชุดเต็มไม่มี FAILED ใหม่เทียบ baseline)
- [ ] `make up` แล้วสคริปต์ข้อ 4 ผ่าน
- [ ] เปิดทุกแท็บของหน้าที่แตะบนพอร์ต 3500 (dev) หรือ 3000 (หลัง `make up`) ไม่มี console error / API ≥ 400
- [ ] ดูภาพจริงอย่างน้อยหน้าที่แก้ (ข้อความตัดบรรทัด, แท็บล้น, dialog กว้าง เป็น bug ที่ตาเท่านั้นเห็น)
