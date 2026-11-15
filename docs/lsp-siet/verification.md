# การตรวจบนสำเนาข้อมูล production และขั้นตอน deploy / rollback

วันที่ตรวจ: 2026-11-15 · branch `refactor/lsp-siet` (af1f19f) เทียบกับ `main` (8efc391)

เอกสารนี้มีสองส่วน: (1) ผลการตรวจว่าโค้ดใหม่ทำงานเหมือนโค้ดเดิมบนข้อมูลจริง (2) ขั้นตอน deploy
และ rollback สำหรับเจ้าของระบบ **การ merge เข้า `main` และการ deploy ขึ้น production เป็นการตัดสินใจ
ของเจ้าของระบบ** เอกสารนี้ไม่ได้ deploy อะไร

---

## 1. ตรวจอะไร และตรวจอย่างไร

ทุกอย่างรันบน stack ทดสอบที่แยกขาดจาก production: network `lsptest-net`, คอนเทนเนอร์ชื่อ `lsptest-*`,
พอร์ตผูกกับ `127.0.0.1` เท่านั้น (API 25055, frontend 28502, quiz 23001, roadmap 23002)
production (compose project `kmitlai`) ไม่ถูกหยุด ไม่ถูก restart และไม่ถูกเขียน

| ขั้น | ทำอะไร |
|---|---|
| คัดลอกข้อมูล (อ่านอย่างเดียว) | `surreal export` ส่งออกทาง stdout มาที่เครื่อง host (ไม่เขียนไฟล์ในคอนเทนเนอร์ production), `mariadb-dump --single-transaction`, env ของ API จาก `docker inspect`, `cp -Rp` ของ `open-notebook/notebook_data` (uploads + LangGraph checkpoints) |
| DB ทดสอบ | `lsptest-surreal` (surrealdb v2 = 2.6.5, memory engine), `lsptest-mariadb` (mariadb:11), `lsptest-redis` — import แล้วนับแถวทุกตาราง SurrealDB เทียบกับ production: ตรงกันทั้ง 20 ตาราง; MariaDB users/posts/llm_usage ตรงกัน |
| baseline | image `lsp-baseline:test` build จาก `git archive 8efc391` ด้วย `docker/open-notebook/Dockerfile` ของมันเอง รันด้วย env ของ production (แก้เฉพาะค่า host/URL ให้ชี้ `lsptest-*`) |
| ใหม่ | image `lsp-siet:restructure-test` build จาก HEAD ด้วย `docker/platform/Dockerfile` รันด้วย **env ชุดเดียวกันทุกตัวอักษร** — ชื่อตัวแปรเดิม `OPEN_NOTEBOOK_*` ทั้งหมด ไม่มี `LSP_SIET_*` แม้แต่ตัวเดียว |
| snapshot | `scripts/lsp-siet/get_snapshot.py save` เรียก GET 102 endpoint ด้วย JWT ของ admin, 93 ของ teacher, 84 ของ student (JWT สร้างด้วย secret ที่คัดลอกมา เหมือนที่ `siet_platform.auth_jwt` ทำ, ใช้กับ stack ทดสอบเท่านั้น) แล้ว `diff` |
| ความนิ่งของ snapshot | baseline สองรอบติดกัน: 102/93/84 เหมือนกันทุก endpoint (หลังตัด uptime, ตัวนับ cache, OAuth state ที่สุ่มทุกครั้ง) |

ค่า env ที่แก้ (ชื่อตัวแปรไม่เปลี่ยน): `SURREAL_URL`, `MARIADB_HOST`, `REDIS_URL`, `NO_PROXY`/`no_proxy`
→ ชื่อ `lsptest-*`; `API_URL`, `NEXT_PUBLIC_API_URL`, `FRONTEND_URL`, `MY_AI_QUIZ_URL`, `AI_ROADMAP_URL`
→ พอร์ตทดสอบ (ไม่ให้เบราว์เซอร์หรือ OAuth วิ่งไป production)

## 2. ผล

| ตรวจ | ผล |
|---|---|
| k9 บน image ใหม่ | log: `Running SIET migration k9` → `SIET migrations applied: k9` ครั้งเดียว; `_siet_migrations` = 1..9; ตาราง `episode_profile` (0 แถว) หายไป core ยังเป็น 25 ไม่มี migration อื่น |
| restart image ใหม่ | ไม่มี `Running SIET migration` อีก; `applied_at` ของ k9 ไม่เปลี่ยน |
| ชื่อ env เดิม | log เตือนครั้งเดียวต่อชื่อ: `OPEN_NOTEBOOK_ENCRYPTION_KEY is deprecated; rename it to LSP_SIET_ENCRYPTION_KEY (the old name still works)` และอีก 8 ชื่อ (`MAX_UPLOAD_SIZE_MB`, `ANSWER_CACHE_*`) — ค่าทุกตัวถูกใช้ (`Max request body size: 2048MB`) |
| JWT เดิม | token ที่เซ็นด้วย secret เดิม (`JWT_SECRET` ว่าง → ใช้ encryption key) ผ่านทั้งสอง image: `/api/users/me` ได้ id/role ถูก |
| credential ที่เก็บไว้ | credential Google ตัวเดียวในฐานข้อมูลถอดรหัสได้ด้วยชื่อเดิม: embedding และ Dense Summary เรียก Gemini สำเร็จ (บันทึกลง `llm_usage` ของ DB ทดสอบ รวม ~$0.00001) |
| `apply_default` | บนสำเนามี **1** ตัว: `Dense Summary` (`transformation:uej24ljtws362js1iutr`, `apply_default = true`) จาก 37 ตัว (6 ตัวมาตรฐาน + 31 ตัว `probe …` ที่เหลือจากการทดสอบเก่า) |
| upload ไม่ส่ง `transformations` | source ข้อความสั้น 1 ชิ้น → `process_source` → `create_insight` → `embed_insight` ครบ; ได้ insight `Dense Summary` 1 ชิ้น (= จำนวน transformation ที่ `apply_default`) |
| LangGraph checkpoint | chat session เดิม (`chat_session:uhaojkv013775h5xzco9`, 2 ข้อความ) และ global chat เปิดได้บน image ใหม่ ข้อความเหมือน baseline ทุกตัวอักษร; log มี `Deserializing unregistered type open_notebook.domain.notebook.Notebook from checkpoint` — **เหมือนกันใน baseline** และโหลดได้แม้ module `open_notebook` ไม่มีแล้ว (ได้ dict แทน class) |
| คำสั่งค้างใน `command` | production ไม่มี `generate_podcast` ค้าง (0 แถว); ทั้ง 21 แถวเป็น completed 20 / failed 1 |
| worker เจอคำสั่งที่ถูกลบ | ใส่แถว `generate_podcast` สถานะ `new` ลงสำเนาเพื่อลอง: worker ใหม่ log `ValueError: Command not found: open_notebook.generate_podcast` แล้วทำงานต่อ (process_source หลังจากนั้นสำเร็จ) แถวค้างเป็น `new` ไปตลอด |
| rollback (image เดิมบน DB ที่ผ่าน k9) | baseline image ขึ้นได้ ไม่สร้างตาราง podcast กลับ ไม่ติดใจ `_siet_migrations` version 9; snapshot ต่างจาก baseline แรกเฉพาะผลของ source ที่ upload ไป (+1 source, ตัวนับ, `llm_usage`) |
| หน้าเว็บ (curl) | ดูตารางข้อ 2.2 |
| quiz / roadmap | image build จาก HEAD รันด้วย env **ชื่อเดิม** แบบที่ production ส่ง (`OPEN_NOTEBOOK_API_URL`): `/quiz`, `/quiz/solo`, `/quiz/play`, `/roadmap` = 200; `/quiz/api/me` และ `/roadmap/api/ws/users/me`, `/roadmap/api/ws/community/roadmaps/mine` ไปถึง API ได้ข้อมูลจริง; log เตือน `OPEN_NOTEBOOK_API_URL is deprecated` |

### 2.1 ความต่างของ GET (baseline → ใหม่)

admin: 96 เหมือน / 6 ต่าง · teacher: 88 / 5 · student: 81 / 3 · ไม่มี endpoint ที่หายหรือเพิ่ม (ใน 102 ตัวที่เรียก)

| endpoint | ต่างอย่างไร | เหตุผล |
|---|---|---|
| `GET /` | `"Open Notebook API is running"` → `"LSP-SIET API is running"` | เปลี่ยนชื่อผลิตภัณฑ์ (ตั้งใจ) |
| `GET /api/config` | `latestVersion` `"1.15.1"` → `null`, `hasUpdate` `true` → `false` | R14: ปิดการเช็กเวอร์ชันกับ GitHub ของ upstream (shape เดิม) |
| `GET /api/commands/registry/debug` | ไม่มี `open_notebook.generate_podcast`; `total_commands` 8 → 7 | ลบ podcast (ตั้งใจ) |
| `GET /api/transformations/default-prompt` | 200 → **400** `No class found for table default-prompt` | route ถูกลบพร้อมหน้า /transformations; path นี้ตอนนี้ตรงกับ `GET /api/transformations/{transformation_id}` จึงได้ 400 แทน 404 ไม่มี client ไหนเรียกแล้ว (student ได้ 403 ทั้งสองฝั่ง) |
| `GET /api/providers` | `docs_url` ของ oMLX / OpenAI Compatible / Anthropic Compatible: ลิงก์ docs ของ upstream → `null` | R19: ลบลิงก์ไปเอกสาร upstream ที่ลบไปแล้ว (shape เดิม, field เป็น Optional อยู่แล้ว) |
| `GET /api/admin/llm-throttle` | `lanes.embedding` มีใน baseline, `{}` ในใหม่ | สถิติในหน่วยความจำของ process: baseline เพิ่งเรียก embedding ตอน search ส่วน process ใหม่ยังไม่ได้เรียก ไม่ใช่ความต่างของโค้ด |

อื่นที่ต่างแต่ไม่อยู่ใน snapshot: FastAPI title `Open Notebook API` → `LSP-SIET API` (`/openapi.json`),
`<title>` ของหน้าเว็บ `Open Notebook` → `LSP-SIET`

### 2.2 หน้าเว็บ (curl: status, redirect, `<title>`; ไม่มีเบราว์เซอร์อัตโนมัติในรอบนี้)

| path | baseline | ใหม่ |
|---|---|---|
| `/` | 307 → `/login` | 307 → `/login` |
| `/login`, `/community`, `/notebooks`, `/sources`, `/search`, `/admin/rag`, `/admin/quiz`, `/admin/roadmap`, `/admin/community`, `/settings/models` | 200 `Open Notebook` | 200 `LSP-SIET` |
| `/podcasts`, `/advanced`, `/transformations` | 200 | 307 → `/` |
| `/config`, `/config/apps` | 200 | 200 (`apiUrl`, `quizUrl`, `roadmapUrl` ตาม env) |

ไฟล์ JS/CSS ทุกไฟล์ที่ 8 หน้าหลักอ้างถึงตอบ 200; bundle ของ `/admin/rag` มีปุ่ม/ข้อความ rebuild
(`rebuildEmbeddingsDesc`, `getRebuildStatus`) หน้าเหล่านี้ render ฝั่ง client จึงยืนยันได้แค่ว่า shell
และ bundle โหลดได้ — **ยังไม่ได้กดใช้งานจริงในเบราว์เซอร์**

### 2.3 ข้อสังเกต (findings)

1. **checkout ของ production ไม่ใช่ `main`** — `/Users/phuwish/kmitlAI` อยู่บน `feat/rag-community-search`
   (df82cc19) ซึ่งแตกมาก่อน `main` 8efc391 และ `docker-compose.yml` ต่างจาก `main` 78 บรรทัด: production
   ยังเป็น compose แบบ local ports (`3000:8502`, `5055`, `3001`, `3002`, PocketBase, Traefik gate-auth)
   ส่วน `main` และ `refactor/lsp-siet` เป็น compose ของ lsp-siet.site (ไม่เปิดพอร์ตแอปบน host, ไม่มี
   PocketBase) ความต่างนี้มีอยู่ก่อน restructure แต่กำหนดว่า deploy แบบไหนได้ (ข้อ 3)
2. คำสั่ง `/surreal export … -` เขียน log `INFO … exported successfully` ต่อท้ายไฟล์ทาง stdout ด้วย:
   ต้องตัดบรรทัดนั้นทิ้งก่อน import (`grep -v $'\x1b'`) ไม่งั้น import ล้มที่บรรทัดสุดท้าย
3. คำสั่งที่ handler ถูกลบ (`generate_podcast`) ที่ยังเป็น `new` จะค้างอยู่ตลอดและ worker พยายามรันใหม่
   ทุกครั้งที่ start (log traceback แล้วทำต่อ) ตอนนี้ production มี 0 แถว — ข้อ 3.1 มีคำสั่งเช็กก่อน deploy
4. `deploy/migrate-to-allinone.sh` (ทางไป all-in-one บน server) ถ้ารันจาก checkout ใหม่: ค่า default
   `OLD_SURREAL_DIR=platform/surreal_data` / `OLD_APP_DIR=platform/notebook_data` ต้องย้ายโฟลเดอร์ก่อน
   หรือส่ง `OLD_SURREAL_DIR=open-notebook/surreal_data OLD_APP_DIR=open-notebook/notebook_data`; และ
   `docker compose -f docker-compose.yml down` ด้วยไฟล์ compose ใหม่จะ **ไม่** หยุดคอนเทนเนอร์ที่ชื่อ service
   เปลี่ยน (`kmitl_open_notebook_api`, `kmitl_ai_roadmap_pocketbase` กลายเป็น orphan) และลบ network ไม่ได้
   (`Resource is still in use` — ลองกับ project ทดสอบแล้ว) ให้หยุด stack เก่าด้วยไฟล์ compose เก่าก่อน checkout
   หรือใส่ `--remove-orphans`; สคริปต์นี้ยัง export ลง `/tmp/export.surql` ในคอนเทนเนอร์ SurrealDB เก่า
   (ทิ้งไฟล์ไว้ใน writable layer ของมัน — ไม่อันตรายแต่ไม่ใช่ read-only)
5. worktree ของ restructure เองบน macOS มีโฟลเดอร์ชื่อ `My-ai-quiz/` ทั้งที่ git เก็บเป็น `my-ai-quiz/`
   (กับดัก R22 ของดิสก์ที่ไม่แยกตัวพิมพ์เล็ก-ใหญ่) — ยืนยันว่าข้อ 3.3 ขั้น case-rename จำเป็นจริง
6. `prompts/` ที่ production mount เข้าไป (`open-notebook/prompts`) ต่างจาก `platform/prompts` ใหม่แค่มีโฟลเดอร์
   `podcast/` เพิ่ม — ไม่มีผล
7. image all-in-one จาก HEAD **ไม่ได้** ทดสอบกับสำเนาข้อมูลรอบนี้ (Task 14 smoke ไว้กับข้อมูลว่าง)

---

## 3. PRODUCTION DEPLOY RUNBOOK

> **เจ้าของระบบเป็นผู้ตัดสินใจ deploy** รันทีละบล็อก อ่านผลก่อนไปบล็อกถัดไป คำสั่งทั้งหมดรันที่
> `/Users/phuwish/kmitlAI` (เครื่องนี้) zsh: เขียน `kmitlai/${i}:local` ไม่ใช่ `kmitlai/$i:local`

มีสองทาง เลือกทางเดียว:

- **ทาง A — สลับ image อย่างเดียว** (แนะนำสำหรับเครื่องนี้ตอนนี้): ไม่แตะ checkout, compose, `.env`,
  โฟลเดอร์ข้อมูล build image จากโค้ดใหม่แล้ว tag เป็นชื่อ image เดิมที่ compose เก่าใช้ ข้อ 2 ของเอกสารนี้
  ทดสอบสภาพนี้ตรง ๆ (image ใหม่ + env ชื่อเดิม + compose เก่าส่ง `OPEN_NOTEBOOK_*`) และเป็นวิธีเดียวกับที่ deploy
  ครั้งก่อน ๆ บนเครื่องนี้
- **ทาง B — เปลี่ยน checkout เป็น layout ใหม่ทั้งหมด**: ชื่อ service/คอนเทนเนอร์/image ใหม่, โฟลเดอร์ข้อมูลย้าย,
  `.env` เปลี่ยนชื่อ และได้ compose ของ `main` (lsp-siet.site, ไม่มีพอร์ต 3000/3001/3002/5055 บน host,
  ไม่มี PocketBase) — ทำเมื่อพร้อมเปลี่ยนรูปแบบเครื่องนี้ไปเป็นแบบ `main` แล้วเท่านั้น

### 3.1 ก่อนเริ่ม (ทั้งสองทาง)

```bash
cd /Users/phuwish/kmitlAI
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'      # จดไว้เทียบหลัง deploy
git status --short; git branch --show-current                  # รู้ว่า checkout อยู่ที่ไหน
REF=main                                                       # หรือ commit ที่จะ deploy (หลัง merge refactor/lsp-siet)
TS=$(date +%Y%m%d-%H%M%S); BK=backups/pre-lsp-siet-$TS; mkdir -p "$BK"

# backup SurrealDB ทาง stdout (ไม่เขียนไฟล์ในคอนเทนเนอร์) แล้วตัดบรรทัด log ท้ายไฟล์
docker exec kmitlai-surrealdb-1 /surreal export --conn http://localhost:8000 --user root --pass "$(grep '^SURREAL_PASSWORD=' .env | cut -d= -f2-)" --ns open_notebook --db open_notebook - | grep -v $'\x1b' > "$BK/surreal.surql"
# backup MariaDB
docker exec kmitl_mariadb sh -c 'mariadb-dump --single-transaction --routines --triggers -uroot -p"$MARIADB_ROOT_PASSWORD" --databases workspace' > "$BK/mariadb.sql"
ls -la "$BK"                                                   # สองไฟล์ต้องไม่ว่าง

# คำสั่งที่ handler ถูกลบ: ควรเป็น 0 (ถ้าไม่ใช่ 0 ดูหมายเหตุด้านล่าง)
echo "SELECT name, status, count() AS n FROM command WHERE name = 'generate_podcast' AND status IN ['new','running'] GROUP BY name, status;" | docker exec -i kmitlai-surrealdb-1 /surreal sql --conn http://localhost:8000 --user root --pass "$(grep '^SURREAL_PASSWORD=' .env | cut -d= -f2-)" --ns open_notebook --db open_notebook --json --hide-welcome

# transformation ที่ใส่ summary ให้ source ใหม่อัตโนมัติ (ตอน 2026-11-15 มี 1 ตัว: Dense Summary)
echo "SELECT name, apply_default FROM transformation WHERE apply_default = true;" | docker exec -i kmitlai-surrealdb-1 /surreal sql --conn http://localhost:8000 --user root --pass "$(grep '^SURREAL_PASSWORD=' .env | cut -d= -f2-)" --ns open_notebook --db open_notebook --json --hide-welcome
```

ถ้ามี `generate_podcast` ค้าง: ไม่ทำอะไรก็ได้ (worker จะ log error ทุกครั้งที่ start แล้วทำงานต่อ) หรือปิดมัน
ด้วยมือ — เป็นการเปลี่ยนข้อมูล เจ้าของระบบตัดสินใจ:
`UPDATE command SET status = 'failed', error_message = 'podcast feature removed' WHERE name = 'generate_podcast' AND status IN ['new','running'];`

ถ้า `apply_default` ไม่มีสักตัว: source ที่ upload ใหม่จะไม่มี summary — ตั้ง Dense Summary เป็น default ก่อน
(หน้า /transformations ถูกลบแล้ว ต้องทำทาง SurrealDB) หรือยอมรับ

### 3.2 ทาง A — สลับ image (compose เก่า, `.env` เดิม, ข้อมูลอยู่ที่เดิม)

```bash
cd /Users/phuwish/kmitlAI
SRC=$(mktemp -d /tmp/lsp-siet-src.XXXX); git archive "$REF" | tar -x -C "$SRC"

# tag ของเดิมไว้ rollback
for i in open-notebook my-ai-quiz ai-roadmap-generator; do docker tag kmitlai/${i}:local kmitlai/${i}:pre-lsp-siet-$TS; done

# build จากโค้ดใหม่ แล้วใช้ "ชื่อ image เดิม" ที่ compose เก่าอ้าง
docker build -f "$SRC/docker/platform/Dockerfile"   -t kmitlai/open-notebook:local        "$SRC"
docker build -f "$SRC/my-ai-quiz/app/Dockerfile"    -t kmitlai/my-ai-quiz:local           "$SRC"
docker build -f "$SRC/ai-roadmap/app/Dockerfile"    -t kmitlai/ai-roadmap-generator:local "$SRC"

docker compose -p kmitlai up -d --no-deps --no-build open_notebook_api my_ai_quiz ai_roadmap_generator
```

ตรวจหลัง deploy:

```bash
docker logs kmitl_open_notebook_api 2>&1 | grep -E 'SIET migration|deprecated|ERROR' | head -20
#   ต้องเห็น: "Running SIET migration k9" และ "SIET migrations applied: k9" ครั้งเดียว
#   และ "OPEN_NOTEBOOK_ENCRYPTION_KEY is deprecated ... (the old name still works)" — ปกติในทาง A
echo "SELECT version FROM _siet_migrations ORDER BY version;" | docker exec -i kmitlai-surrealdb-1 /surreal sql --conn http://localhost:8000 --user root --pass "$(grep '^SURREAL_PASSWORD=' .env | cut -d= -f2-)" --ns open_notebook --db open_notebook --json --hide-welcome   # 1..9
curl -s http://localhost:5055/ ; echo                       # {"message":"LSP-SIET API is running"}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login          # 200 (title LSP-SIET)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/podcasts   # 307 -> /
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/quiz            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3002/roadmap         # 200
docker logs kmitl_my_ai_quiz 2>&1 | grep deprecated          # OPEN_NOTEBOOK_API_URL is deprecated ... = ปกติ
```

จากนั้นเข้าเว็บจริง: login, เปิด notebook + chat เก่า 1 อัน, upload ข้อความสั้น 1 ชิ้นแล้วรอ summary,
/admin/rag, /admin/quiz, /admin/roadmap, ทำ quiz และ roadmap อย่างละครั้ง

**Rollback ทาง A** (ข้อมูลไม่ต้องคืน: k9 ลบแค่ตาราง podcast ที่ว่าง และ image เดิมทำงานบน DB ที่ผ่าน k9 ได้ —
ซ้อมแล้วในข้อ 2):

```bash
cd /Users/phuwish/kmitlAI
for i in open-notebook my-ai-quiz ai-roadmap-generator; do docker tag kmitlai/${i}:pre-lsp-siet-$TS kmitlai/${i}:local; done
docker compose -p kmitlai up -d --no-deps --no-build open_notebook_api my_ai_quiz ai_roadmap_generator
```

### 3.3 ทาง B — เปลี่ยน checkout เป็น layout ใหม่

ชื่อที่เปลี่ยน:

| เดิม | ใหม่ |
|---|---|
| service `open_notebook_api`, คอนเทนเนอร์ `kmitl_open_notebook_api` | `lsp_siet_api`, `lsp_siet_api` |
| image `kmitlai/open-notebook:local` | `kmitlai/lsp-siet:local` |
| image `kmitlai/ai-roadmap-generator:local` | `kmitlai/ai-roadmap:local` (`kmitlai/my-ai-quiz:local` ชื่อเดิม) |
| `open-notebook/{surreal_data,notebook_data,redis_data}` | `platform/{surreal_data,notebook_data,redis_data}` |
| `ai-roadmap-generator/pb_data` | `ai-roadmap/app/pb_data` (PocketBase ไม่ได้ใช้แล้ว — เก็บไว้ให้ export-data.sh) |
| `My-ai-quiz/` | `my-ai-quiz/app/` |
| Traefik router/service `open-notebook` / `open-notebook-svc` | `web` / `web-svc` (ชี้ `lsp_siet_api:8502`) |
| dev: `kmitlai_dev_open_notebook_api`, `kmitlai_dev_open_notebook_frontend` | `kmitlai_dev_lsp_siet_api`, `kmitlai_dev_lsp_siet_frontend` |
| all-in-one: quiz อยู่ที่ `/opt/quiz/My-ai-quiz/…` | `/opt/quiz/my-ai-quiz/app/…` |
| `OPEN_NOTEBOOK_*` ใน `.env` | `LSP_SIET_*` (ชื่อเดิมยังใช้ได้ผ่าน fallback) |

ขั้นตอน:

```bash
cd /Users/phuwish/kmitlAI
# 1) หยุด stack ด้วยไฟล์ compose "เก่า" ก่อน checkout — ถ้า down ทีหลังด้วยไฟล์ใหม่
#    kmitl_open_notebook_api / kmitl_ai_roadmap_pocketbase จะค้างเป็น orphan
docker compose -p kmitlai down          # named volume kmitlai_mariadb_data ยังอยู่ (ไม่มี -v)
cp -a open-notebook/surreal_data "$BK/surreal_data-files"     # สำเนาไฟล์ SurrealDB ตอนหยุดแล้ว

# 2) checkout (branch ปัจจุบันเป็นของเพื่อน: feat/rag-community-search — ตัดสินใจเองว่าจะไป branch ไหน)
git checkout main && git pull --ff-only

# 3) macOS ไม่แยกตัวพิมพ์: ถ้ายังเห็น My-ai-quiz ให้ rename สองจังหวะ
/bin/ls -d */ | grep -i quiz
git ls-files My-ai-quiz | head -1        # ต้องว่าง (git เก็บเป็น my-ai-quiz/)
[ -d My-ai-quiz ] && /bin/ls -d */ | grep -q '^My-ai-quiz/$' && mv My-ai-quiz my-ai-quiz.tmp && mv my-ai-quiz.tmp my-ai-quiz
rm -f my-ai-quiz/tsconfig.tsbuildinfo   # ไฟล์ ignored ของแอปเก่าที่ค้างอยู่ระดับบน (ตอนนี้มีแค่ไฟล์นี้)

# 4) ย้ายโฟลเดอร์ข้อมูล (ignored จึงไม่ย้ายตาม git) — ต้องทำก่อน compose up ไม่งั้น SurrealDB ขึ้นมาว่าง
for d in surreal_data notebook_data redis_data; do [ -n "$(ls -A platform/$d 2>/dev/null)" ] && echo "STOP: platform/$d มีข้อมูลอยู่แล้ว"; done
#    ถ้ามีบรรทัด STOP อย่าทำต่อ — ตรวจก่อนว่าข้อมูลชุดไหนถูก
mkdir -p platform ai-roadmap/app
for d in surreal_data notebook_data redis_data; do rmdir "platform/$d" 2>/dev/null; mv "open-notebook/$d" "platform/$d"; done
[ -d ai-roadmap-generator/pb_data ] && mv ai-roadmap-generator/pb_data ai-roadmap/app/pb_data
ls platform/surreal_data platform/notebook_data | head        # ต้องมีไฟล์
#    ที่เหลือใน open-notebook/ และ ai-roadmap-generator/ เป็นไฟล์ ignored (.venv, .next, node_modules,
#    data/, surreal_data_dev/) — เก็บไว้จนพ้นช่วง rollback แล้วค่อยลบ

# 5) เปลี่ยนชื่อบรรทัดใน .env "ในที่เดิม" (ห้ามเพิ่ม LSP_SIET_ENCRYPTION_KEY ใหม่คู่กับบรรทัดเก่า:
#    ถ้าค่าต่างกัน ชื่อใหม่ชนะเงียบ ๆ แล้ว credential ที่เก็บไว้ถอดรหัสไม่ได้ และทุกคนถูก logout)
cp .env "$BK/env.before"
sed -i '' -E 's/^OPEN_NOTEBOOK_/LSP_SIET_/' .env
grep -c '^OPEN_NOTEBOOK_' .env; grep -E '^LSP_SIET_' .env | cut -d= -f1    # 0 บรรทัดเก่า; ENCRYPTION_KEY, PASSWORD, ANSWER_CACHE_TUNER_ENABLED
grep -E '^(LSP_SIET|OPEN_NOTEBOOK)_ENCRYPTION_KEY=' .env | wc -l          # ต้องเป็น 1

# 6) build + start (quiz ใช้ชื่อ image เดิม: tag ของเดิมไว้ก่อน build ทับ)
docker tag kmitlai/my-ai-quiz:local kmitlai/my-ai-quiz:pre-lsp-siet-$TS
docker compose -p kmitlai build lsp_siet_api my_ai_quiz ai_roadmap_generator
docker compose -p kmitlai up -d
```

ตรวจหลัง deploy เหมือนทาง A แต่: คอนเทนเนอร์ชื่อ `lsp_siet_api` (`docker logs lsp_siet_api`), ไม่มี warning
`deprecated` แล้ว, และ compose ใหม่ **ไม่เปิดพอร์ต 3000/3001/3002/5055 บน host** — ทดสอบผ่าน Traefik:
`curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: lsp-siet.site' http://localhost/login` (หรือผ่าน
https://lsp-siet.site ถ้า tunnel ต่ออยู่) ถ้ายังต้องการ :3000/:3001/:3002 บนเครื่องนี้ ใช้ทาง A

**Rollback ทาง B** — คืน compose **และ** image พร้อมกันเสมอ: compose ใหม่ส่งเฉพาะ `LSP_SIET_*` เข้าคอนเทนเนอร์
image เก่าภายใต้ compose ใหม่จะไม่เห็น key/password (ได้ key default → credential ถอดรหัสไม่ได้, JWT เดิมใช้ไม่ได้)

```bash
cd /Users/phuwish/kmitlAI
docker compose -p kmitlai down --remove-orphans
cp "$BK/env.before" .env                                    # คืนชื่อ OPEN_NOTEBOOK_* (compose เก่าอ่านแค่ชื่อเดิม)
for d in surreal_data notebook_data redis_data; do mkdir -p open-notebook; mv "platform/$d" "open-notebook/$d"; done
[ -d ai-roadmap/app/pb_data ] && mkdir -p ai-roadmap-generator && mv ai-roadmap/app/pb_data ai-roadmap-generator/pb_data
docker tag kmitlai/my-ai-quiz:pre-lsp-siet-$TS kmitlai/my-ai-quiz:local
git checkout feat/rag-community-search                      # หรือ ref ที่รันอยู่ก่อน deploy
/bin/ls -d */ | grep -i quiz                                # ถ้าเห็น my-ai-quiz ตัวเล็กแต่ git ต้องการ My-ai-quiz: mv my-ai-quiz x.tmp && mv x.tmp My-ai-quiz
docker compose -p kmitlai up -d --no-build                  # kmitlai/open-notebook:local, kmitlai/ai-roadmap-generator:local ยังอยู่ (ทาง B ใช้ชื่อใหม่ ไม่ได้ทับ)
```

k9 ไม่ต้องย้อน (ลบแค่ตาราง podcast ที่ว่าง; image เก่าทำงานได้ — ซ้อมแล้ว) ถ้าต้องการ DB ตอนก่อน deploy
ทุกไบต์: หยุด SurrealDB แล้วคืน `$BK/surreal_data-files` เป็น `open-notebook/surreal_data`

### 3.4 เรื่องที่ต้องรู้ (ทั้งสองทาง)

- **k9** รันเองครั้งเดียวตอน API start ครั้งแรก (production แยก migration แล้ว: core 25, `_siet_migrations` 1..8 →
  ไม่ต้อง `make migrate-split`) restart ครั้งต่อไปไม่รันซ้ำ
- **LangGraph checkpoint** ใน `notebook_data/sqlite-db/checkpoints.sqlite` เก็บ class path `open_notebook.domain.*`:
  หลังเปลี่ยนชื่อ package โหลดเป็น dict (log `Deserializing unregistered type …` — มีอยู่แล้วก่อน deploy) chat เก่า
  เปิดได้ปกติ ถ้าวันหนึ่ง LangGraph เปิด strict mode (`LANGGRAPH_STRICT_MSGPACK=true`) chat เก่าอาจเปิดไม่ได้
- **export bundle เก่า** (`deploy/kmitlai-data-2026*.tar.gz`) เก็บ path `open-notebook/…` และ
  `ai-roadmap-generator/pb_data`: `deploy/import-data.sh` ของ layout ใหม่แตกไฟล์ออกมาที่ path เก่า และเช็กกันทับแค่
  `platform/surreal_data` — หลัง import bundle เก่าต้อง `mv open-notebook/{surreal_data,notebook_data,redis_data} platform/`
  และ `mv ai-roadmap-generator/pb_data ai-roadmap/app/pb_data` เองก่อน `docker compose up`
- **image เก่า** `kmitlai/open-notebook:local`, `kmitlai/ai-roadmap-generator:local` (และ tag `pre-*`) ยังอยู่ — เก็บไว้
  rollback อย่างน้อยหนึ่งสัปดาห์ แล้วค่อย `docker image rm`
- **all-in-one บน server** (`deploy/migrate-to-allinone.sh`): ดู finding ข้อ 4 — ย้ายโฟลเดอร์ข้อมูลก่อน (หรือส่ง
  `OLD_SURREAL_DIR` / `OLD_APP_DIR`) และหยุด stack เก่าด้วย compose เก่า (หรือ `--remove-orphans`)
- `.env.example` มี `LSP_SIET_ENCRYPTION_KEY=`: อย่าคัดลอกบรรทัดนั้นมาเพิ่มใน `.env` ที่มีชื่อเดิมอยู่แล้ว
  (API ไม่เตือนเมื่อสองชื่อมีค่าต่างกัน)

---

## 4. ทำซ้ำการตรวจนี้

```bash
python3 scripts/lsp-siet/get_snapshot.py save http://127.0.0.1:25055 base-admin.json --token "$ADMIN_JWT" --frontend-url http://127.0.0.1:28502
python3 scripts/lsp-siet/get_snapshot.py save http://127.0.0.1:25055 new-admin.json  --token "$ADMIN_JWT" --frontend-url http://127.0.0.1:28502 --params-from base-admin.json
python3 scripts/lsp-siet/get_snapshot.py diff base-admin.json new-admin.json
```

SurrealDB export → import (v2.6.5): `grep -v $'\x1b'` ตัด log แล้ว
`sed -E 's/^DEFINE FIELD /DEFINE FIELD OVERWRITE /'` (เหมือน `lsp-backup`) แล้ว `surreal import` ลงฐานว่าง
ไฟล์ export / dump / env / JWT ของรอบนี้มีข้อมูลส่วนบุคคลและ secret — ลบทิ้งแล้วหลังตรวจ ไม่ได้ commit
