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
2. export รอบนี้ (`/surreal export … - > file` ผ่าน `docker exec`) มีบรรทัด log สี `INFO … exported successfully`
   ติดมาท้ายไฟล์ ทำให้ import ล้มที่บรรทัดสุดท้าย (ลองซ้ำกับฐานเล็กแล้ว log ไปทาง stderr — จึงไม่แน่ว่าจะติดมาทุกครั้ง)
   runbook ใช้ `--log none … 2>/dev/null` แล้วตัด **เฉพาะ** บรรทัดสุดท้ายที่มีรหัสสี ESC (ถ้ามี) และเช็กว่าไม่เหลือ
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
> `/Users/phuwish/kmitlAI` (เครื่องนี้)

มีสองทาง เลือกทางเดียว:

- **ทาง A — สลับ image อย่างเดียว** (แนะนำสำหรับเครื่องนี้ตอนนี้): ไม่แตะ checkout, compose, `.env`,
  โฟลเดอร์ข้อมูล build image จากโค้ดใหม่แล้ว tag เป็นชื่อ image เดิมที่ compose เก่าใช้ ข้อ 2 ของเอกสารนี้
  ทดสอบสภาพนี้ตรง ๆ (image ใหม่ + env ชื่อเดิม + compose เก่าส่ง `OPEN_NOTEBOOK_*`) และเป็นวิธีเดียวกับที่ deploy
  ครั้งก่อน ๆ บนเครื่องนี้
- **ทาง B — เปลี่ยน checkout เป็น layout ใหม่ทั้งหมด**: ชื่อ service/คอนเทนเนอร์/image ใหม่, โฟลเดอร์ข้อมูลย้าย,
  `.env` เปลี่ยนชื่อ **และตั้งค่าโดเมน** (`API_URL`, `FRONTEND_URL`, URL ของ quiz/roadmap, CORS, ปิด Google mock,
  รหัส admin1) และได้ compose ของ `main` (lsp-siet.site, ไม่มีพอร์ต 3000/3001/3002/5055 บน host, ไม่มี PocketBase) —
  ทำเมื่อพร้อมเปลี่ยนเครื่องนี้ไปเป็นแบบ `main` และโดเมนชี้มาที่เครื่องนี้แล้วเท่านั้น

### 3.0 วิธีใช้บล็อกคำสั่ง

ทุกบล็อกเขียนเป็น `cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF' … EOF`: วางทั้งบล็อกทีเดียวใน terminal
(zsh ก็ได้ — ตัวบล็อกรันด้วย bash เสมอ กับดัก zsh อย่าง `kmitlai/$i:local` หรือ glob ไม่เจอจึงไม่เกิด) ถ้าคำสั่งไหนล้ม
หรือเจอ `STOP:` บล็อกหยุดทันทีและ terminal ไม่ปิด **อ่านผลลัพธ์ก่อนไปบล็อกถัดไป**
ตัวแปรไม่ข้ามบล็อก: ทุกบล็อกหา backup ล่าสุดเองจาก `backups/pre-lsp-siet-*` จึงรันใน shell ใหม่ได้ (เช่น rollback
ตอนตีสองในหน้าต่างใหม่) บล็อกที่ต้องใช้รหัสอ่าน `.env` ด้วย `set -a; . ./.env; set +a` — ถ้าค่าใดใน `.env` มีช่องว่าง
หรือ `$` ต้องใส่ quote ให้ค่านั้นก่อน ตัว script มาทาง stdin (heredoc) อย่าแทรกคำสั่งที่อ่าน stdin (`docker compose` ในบล็อก
จึงมี `</dev/null`)

### 3.1 ก่อนเริ่ม: backup และเช็ก (ทั้งสองทาง)

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
set -a; . ./.env; set +a
TS=$(date +%Y%m%d-%H%M%S); BK=backups/pre-lsp-siet-$TS
[ ! -e "$BK" ] || die "$BK มีอยู่แล้ว"
mkdir -p "$BK"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > "$BK/docker-ps.txt"
git rev-parse HEAD > "$BK/git-head.txt"; git branch --show-current > "$BK/git-branch.txt"
cp -p .env "$BK/env.before"
# SurrealDB: export ทาง stdout (ไม่เขียนไฟล์ในคอนเทนเนอร์); ถ้ามีบรรทัด log สีต่อท้าย ตัดเฉพาะบรรทัดสุดท้ายนั้น
docker exec kmitlai-surrealdb-1 /surreal export --log none --conn http://localhost:8000 \
  --user "${SURREAL_USER:-root}" --pass "${SURREAL_PASSWORD:-root}" --ns open_notebook --db open_notebook - \
  2>/dev/null > "$BK/surreal.surql"
perl -0pi -e 's/\n[^\n]*\e\[[^\n]*\n*\z/\n/' "$BK/surreal.surql"
[ -s "$BK/surreal.surql" ]                                || die "surreal.surql ว่าง"
grep -q '^OPTION IMPORT;' "$BK/surreal.surql"             || die "surreal.surql ไม่มีหัวไฟล์ export"
grep -q '^-- TABLE DATA: source$' "$BK/surreal.surql"     || die "surreal.surql ไม่มีข้อมูลตาราง source"
grep -v '^[[:space:]]*$' "$BK/surreal.surql" | tail -n 1 | grep -q ';$' || die "surreal.surql ถูกตัดกลางคัน"
! tail -n 3 "$BK/surreal.surql" | grep -q $'\e'           || die "ยังมี log ปนท้าย surreal.surql"
# MariaDB
docker exec kmitl_mariadb sh -c 'mariadb-dump --single-transaction --routines --triggers -uroot -p"$MARIADB_ROOT_PASSWORD" --databases workspace' > "$BK/mariadb.sql"
[ -s "$BK/mariadb.sql" ]                                  || die "mariadb.sql ว่าง"
tail -n 1 "$BK/mariadb.sql" | grep -q '^-- Dump completed' || die "mariadb.sql ไม่จบ"
echo "backup OK: $BK"; ls -la "$BK"
EOF
```

SurrealDB 2.6.5 ไม่เขียน `COMMIT TRANSACTION;` ท้าย export (ลองแล้ว) จึงเช็กหัวไฟล์ ตาราง `source` และ `;` ท้ายไฟล์แทน

เช็กข้อมูล (อ่านอย่างเดียว):

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
set -a; . ./.env; set +a
sq() { docker exec -i kmitlai-surrealdb-1 /surreal sql --conn http://localhost:8000 --user "${SURREAL_USER:-root}" --pass "${SURREAL_PASSWORD:-root}" --ns open_notebook --db open_notebook --json --hide-welcome; }
echo "-- generate_podcast ที่ค้าง (ควรว่าง):"
echo "SELECT name, status, count() AS n FROM command WHERE name = 'generate_podcast' AND status IN ['new','running'] GROUP BY name, status;" | sq
echo "-- transformation ที่ apply_default (2026-11-15: Dense Summary ตัวเดียว):"
echo "SELECT id, name, apply_default FROM transformation WHERE apply_default = true;" | sq
echo "-- migration: core ต้องเป็น 25, _siet_migrations 1..8 ก่อน deploy"
echo "SELECT count() FROM _sbl_migrations GROUP ALL; SELECT version FROM _siet_migrations ORDER BY version;" | sq
EOF
```

ถ้ามี `generate_podcast` ค้าง: ไม่ทำอะไรก็ได้ (worker จะ log error ทุกครั้งที่ start แล้วทำงานต่อ) หรือปิดมัน — เป็นการแก้ข้อมูล
เจ้าของระบบตัดสินใจ (ส่งผ่าน `sq` แบบเดียวกับข้างบน):
`UPDATE command SET status = 'failed', error_message = 'podcast feature removed' WHERE name = 'generate_podcast' AND status IN ['new','running'];`

ถ้า `apply_default` ว่าง: source ที่ upload ใหม่จะไม่มี summary (หน้า /transformations ถูกลบแล้ว) — ถ้าต้องการให้
Dense Summary เป็นค่าเริ่มต้น ดูก่อนว่ามีกี่แถว แล้วค่อยตั้ง (แก้ข้อมูล — เจ้าของระบบตัดสินใจ):
`SELECT id, name, apply_default FROM transformation WHERE name = 'Dense Summary';` แล้ว
`UPDATE transformation SET apply_default = true WHERE name = 'Dense Summary';`

### 3.2 ทาง A — สลับ image (compose เก่า, `.env` เดิม, ข้อมูลอยู่ที่เดิม)

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
BK=$(ls -d backups/pre-lsp-siet-* 2>/dev/null | tail -1 || true); [ -n "$BK" ] || die "ไม่มี backup — รัน 3.1 ก่อน"
TS=${BK##*-lsp-siet-}
[ -s "$BK/surreal.surql" ] && [ -s "$BK/mariadb.sql" ] && [ -s "$BK/env.before" ] || die "backup $BK ไม่ครบ"
git fetch origin
REF=origin/main                       # หรือ commit อื่นที่ตกลงจะ deploy
SRC=$(mktemp -d /tmp/lsp-siet-src.XXXX); git archive "$REF" | tar -x -C "$SRC"
[ -f "$SRC/docker/platform/Dockerfile" ] || die "$REF ยังไม่ใช่ layout ใหม่ (ไม่มี docker/platform/Dockerfile)"
for i in open-notebook my-ai-quiz ai-roadmap-generator; do
  docker image inspect "kmitlai/${i}:pre-lsp-siet-$TS" >/dev/null 2>&1 || docker tag "kmitlai/${i}:local" "kmitlai/${i}:pre-lsp-siet-$TS"
done
# build จากโค้ดใหม่ แล้วใช้ "ชื่อ image เดิม" ที่ compose เก่าอ้าง
docker build -f "$SRC/docker/platform/Dockerfile" -t kmitlai/open-notebook:local        "$SRC"
docker build -f "$SRC/my-ai-quiz/app/Dockerfile"  -t kmitlai/my-ai-quiz:local           "$SRC"
docker build -f "$SRC/ai-roadmap/app/Dockerfile"  -t kmitlai/ai-roadmap-generator:local "$SRC"
echo "$REF $(git rev-parse "$REF")" > "$BK/deployed-ref.txt"
docker compose -p kmitlai up -d --no-deps --no-build open_notebook_api my_ai_quiz ai_roadmap_generator </dev/null
EOF
```

**ระวังหลังทาง A:** checkout ยังเป็นโค้ดเก่า — `make up`, `make build`, `docker compose up --build` หรือ
`docker compose build` จาก `/Users/phuwish/kmitlAI` จะ build โค้ดเก่าทับ image ใหม่ (ชื่อ tag เดียวกัน) ใช้
`--no-build` เสมอจนกว่าจะเปลี่ยน checkout (ทาง B)

ตรวจหลัง deploy:

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
set -a; . ./.env; set +a
sq() { docker exec -i kmitlai-surrealdb-1 /surreal sql --conn http://localhost:8000 --user "${SURREAL_USER:-root}" --pass "${SURREAL_PASSWORD:-root}" --ns open_notebook --db open_notebook --json --hide-welcome; }
docker logs kmitl_open_notebook_api 2>&1 | grep -E 'SIET migration|deprecated|ERROR' | head -20 || true
#   ต้องเห็น "Running SIET migration k9" และ "SIET migrations applied: k9" ครั้งเดียว และ
#   "OPEN_NOTEBOOK_ENCRYPTION_KEY is deprecated ... (the old name still works)" — ปกติในทาง A
echo "SELECT version FROM _siet_migrations ORDER BY version;" | sq            # 1..9
curl -s http://localhost:5055/ || echo "curl failed: http://localhost:5055/" ; echo                                           # {"message":"LSP-SIET API is running"}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login || echo "curl failed: http://localhost:3000/login"            # 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/podcasts || echo "curl failed: http://localhost:3000/podcasts"   # 307 -> /
curl -s http://localhost:3000/config/apps || echo "curl failed: http://localhost:3000/config/apps" ; echo                                # quizUrl/roadmapUrl ตาม .env
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/quiz || echo "curl failed: http://localhost:3001/quiz"              # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3002/roadmap || echo "curl failed: http://localhost:3002/roadmap"           # 200
docker logs kmitl_my_ai_quiz 2>&1 | grep deprecated || true                   # OPEN_NOTEBOOK_API_URL is deprecated = ปกติ
EOF
```

จากนั้นในเบราว์เซอร์จริง: login, เปิด notebook + chat เก่า 1 อัน, upload ข้อความสั้น 1 ชิ้นแล้วรอ summary,
/admin/rag, /admin/quiz, /admin/roadmap, กดไป quiz และ roadmap จากเมนูของ SIET Space แล้วดูว่าเข้าได้โดยยัง login อยู่
และทำ quiz / roadmap อย่างละครั้ง

**Rollback ทาง A** (ข้อมูลไม่ต้องคืน: k9 ลบแค่ตาราง podcast ที่ว่าง และ image เดิมทำงานบน DB ที่ผ่าน k9 ได้ —
ซ้อมแล้วในข้อ 2):

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
BK=$(ls -d backups/pre-lsp-siet-* 2>/dev/null | tail -1 || true); [ -n "$BK" ] || die "ไม่มี backup"
TS=${BK##*-lsp-siet-}
for i in open-notebook my-ai-quiz ai-roadmap-generator; do
  docker image inspect "kmitlai/${i}:pre-lsp-siet-$TS" >/dev/null 2>&1 || die "ไม่มี kmitlai/${i}:pre-lsp-siet-$TS"
done
for i in open-notebook my-ai-quiz ai-roadmap-generator; do docker tag "kmitlai/${i}:pre-lsp-siet-$TS" "kmitlai/${i}:local"; done
docker compose -p kmitlai up -d --no-deps --no-build open_notebook_api my_ai_quiz ai_roadmap_generator </dev/null
EOF
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

**ทาง B เปลี่ยนวิธีเข้าเว็บด้วย** compose เก่าตั้งค่าพวกนี้ไว้ในตัวไฟล์ compose เอง ส่วน compose ใหม่อ่านจาก `.env`
และไม่เปิดพอร์ตบน host:

| ค่า | compose เก่า (ตอนนี้) | compose ใหม่ | ต้องตั้งใน `.env` สำหรับ lsp-siet.site |
|---|---|---|---|
| พอร์ต host | 3000, 5055, 3001, 3002, 80 | 80 เท่านั้น (Traefik ตอบเฉพาะ `Host(lsp-siet.site)`) | — |
| `API_URL` (ที่เบราว์เซอร์เรียก API, ส่งผ่าน `/config`) | ฝังไว้ `http://localhost:3000` | `${API_URL:-http://localhost:3000}` — `.env` ตอนนี้ไม่มีคีย์นี้ | `API_URL=https://lsp-siet.site` |
| `FRONTEND_URL` (OAuth redirect) | จาก `.env` (ค่าแบบพอร์ต local) | จาก `.env` | `FRONTEND_URL=https://lsp-siet.site` |
| `GOOGLE_OAUTH_REDIRECT_URI` | จาก `.env` | จาก `.env` | ว่าง (= `${FRONTEND_URL}/auth/google/callback`) หรือ `https://lsp-siet.site/auth/google/callback` และต้องลงทะเบียนใน Google Cloud |
| `MY_AI_QUIZ_URL`, `AI_ROADMAP_URL` | จาก `.env` (`http://localhost:3001/quiz`, `:3002/roadmap` แบบ) | จาก `.env` | `/quiz`, `/roadmap` (ลบบรรทัดก็ได้ — default เป็น path) |
| `CORS_ORIGINS` | จาก `.env` (localhost) | จาก `.env` | `https://lsp-siet.site` |
| `GOOGLE_OAUTH_MOCK` | `.env` ตอนนี้ตั้งไว้เปิด | จาก `.env` | `0` — **mock บนโดเมนสาธารณะ = ใครก็พิมพ์อีเมลอะไรก็ได้ รวมอีเมลใน `WORKSPACE_ADMIN_EMAILS` แล้วได้สิทธิ์ admin** |
| `WORKSPACE_SEED_ADMIN_PASSWORD` | ฝังไว้ `admin1` (ค่าใน `.env` ถูกเมิน) | `${WORKSPACE_SEED_ADMIN_PASSWORD:-admin1}` | รหัสที่แข็งแรง — **ทุกครั้งที่ API start รหัสของ `admin1` ถูกตั้งเป็นค่านี้** ค่าที่อยู่ใน `.env` ตอนนี้จะเริ่มมีผลทันทีที่ใช้ทาง B |

ถ้าโดเมน lsp-siet.site ยังไม่ได้ชี้มาที่เครื่องนี้ (tunnel) หลังทาง B จะเข้าเว็บจากเบราว์เซอร์ไม่ได้เลย — ใช้ทาง A

**B1 — build image ใหม่ก่อน (stack เดิมยังรันอยู่)**

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
BK=$(ls -d backups/pre-lsp-siet-* 2>/dev/null | tail -1 || true); [ -n "$BK" ] || die "ไม่มี backup — รัน 3.1 ก่อน"
TS=${BK##*-lsp-siet-}
[ -s "$BK/surreal.surql" ] && [ -s "$BK/mariadb.sql" ] && [ -s "$BK/env.before" ] || die "backup $BK ไม่ครบ"
git fetch origin
REF=origin/main
SRC=$(mktemp -d /tmp/lsp-siet-src.XXXX); git archive "$REF" | tar -x -C "$SRC"
[ -f "$SRC/docker/platform/Dockerfile" ] || die "$REF ยังไม่ใช่ layout ใหม่"
docker image inspect "kmitlai/my-ai-quiz:pre-lsp-siet-$TS" >/dev/null 2>&1 || docker tag kmitlai/my-ai-quiz:local "kmitlai/my-ai-quiz:pre-lsp-siet-$TS"
docker build -f "$SRC/docker/platform/Dockerfile" -t kmitlai/lsp-siet:local   "$SRC"
docker build -f "$SRC/my-ai-quiz/app/Dockerfile"  -t kmitlai/my-ai-quiz:local "$SRC"
docker build -f "$SRC/ai-roadmap/app/Dockerfile"  -t kmitlai/ai-roadmap:local "$SRC"
echo "$REF $(git rev-parse "$REF")" > "$BK/deployed-ref.txt"
echo "B1 OK"
EOF
```

**B2 — หยุด stack, checkout, ย้ายโฟลเดอร์ข้อมูล** (ทุกเช็กอยู่ก่อน `down`; หลัง `down` ถ้าบล็อกหยุดกลางทาง ให้รัน
Rollback ทาง B ซึ่งรับสภาพครึ่งทางได้)

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
BK=$(ls -d backups/pre-lsp-siet-* 2>/dev/null | tail -1 || true); [ -n "$BK" ] || die "ไม่มี backup"
[ -s "$BK/deployed-ref.txt" ] || die "ยังไม่ได้รัน B1"
SHA=$(cut -d' ' -f2 "$BK/deployed-ref.txt")          # commit ที่ B1 build ไว้ — ไม่ใช่ origin/main ณ ตอนนี้
git cat-file -e "$SHA^{commit}"                       || die "ไม่มี commit $SHA"
git merge-base --is-ancestor main "$SHA"              || die "main ไม่ fast-forward ไป $SHA ได้ — แก้ก่อน down"
for i in lsp-siet my-ai-quiz ai-roadmap; do docker image inspect "kmitlai/${i}:local" >/dev/null || die "ไม่มี image kmitlai/${i}:local"; done
for d in surreal_data notebook_data redis_data; do
  [ -d "open-notebook/$d" ] && [ -n "$(ls -A "open-notebook/$d")" ] || die "open-notebook/$d ไม่มีหรือว่าง"
  [ ! -e "platform/$d" ] || [ -z "$(ls -A "platform/$d")" ] || die "platform/$d มีข้อมูลอยู่แล้ว — ตรวจก่อนว่าชุดไหนถูก"
done
[ -f open-notebook/surreal_data/mydatabase.db/CURRENT ] || die "ไม่พบไฟล์ rocksdb ใน open-notebook/surreal_data/mydatabase.db"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "working tree มีไฟล์ที่แก้ค้าง — commit/stash ก่อน"

# 1) หยุดด้วยไฟล์ compose "เก่า" ก่อน checkout (down ทีหลังด้วยไฟล์ใหม่ = orphan ค้าง)
docker compose -p kmitlai down </dev/null            # named volume kmitlai_mariadb_data ยังอยู่ (ไม่มี -v)
cp -a open-notebook/surreal_data "$BK/surreal_data-files"

# 2) checkout (branch ตอนนี้เป็นของเพื่อน: feat/rag-community-search)
git switch main
git merge --ff-only "$SHA"
[ "$(git rev-parse HEAD)" = "$SHA" ]                  || die "HEAD ไม่ใช่ $SHA"
[ -f docker/platform/Dockerfile ] && grep -q 'container_name: lsp_siet_api' docker-compose.yml || die "checkout ไม่ใช่ layout ใหม่"

# 3) macOS ไม่แยกตัวพิมพ์: โฟลเดอร์ต้องชื่อ my-ai-quiz ตัวเล็ก
if /bin/ls -1 | grep -qx 'My-ai-quiz'; then mv My-ai-quiz my-ai-quiz.tmp && mv my-ai-quiz.tmp my-ai-quiz; fi
/bin/ls -1 | grep -qx 'my-ai-quiz' || die "ไม่มีโฟลเดอร์ my-ai-quiz"
[ -f my-ai-quiz/app/Dockerfile ] || die "my-ai-quiz/app/Dockerfile หาย"
rm -f my-ai-quiz/tsconfig.tsbuildinfo                # ไฟล์ ignored ของแอปเก่าที่ค้างระดับบน

# 4) ย้ายโฟลเดอร์ข้อมูล (ignored จึงไม่ย้ายตาม git)
mkdir -p platform ai-roadmap/app
for d in surreal_data notebook_data redis_data; do
  [ -e "platform/$d" ] && { rmdir "platform/$d" || die "platform/$d ไม่ว่าง"; }
  mv "open-notebook/$d" "platform/$d"
  [ -n "$(ls -A "platform/$d")" ] && [ ! -e "open-notebook/$d" ] || die "ย้าย $d ไม่สำเร็จ"
done
if [ -d ai-roadmap-generator/pb_data ]; then
  [ ! -e ai-roadmap/app/pb_data ] || die "ai-roadmap/app/pb_data มีอยู่แล้ว"
  mv ai-roadmap-generator/pb_data ai-roadmap/app/pb_data
fi
echo "B2 OK"; ls platform/surreal_data platform/notebook_data | head
#    ที่เหลือใน open-notebook/ และ ai-roadmap-generator/ เป็นไฟล์ ignored (.venv, .next, node_modules,
#    data/, surreal_data_dev/) — เก็บไว้จนพ้นช่วง rollback แล้วค่อยลบ
EOF
```

**B3 — `.env`: เปลี่ยนชื่อในที่เดิม + ค่าของโดเมน** (ห้ามเพิ่ม `LSP_SIET_ENCRYPTION_KEY` ใหม่คู่กับบรรทัดเก่า: ถ้าค่าต่างกัน
ชื่อใหม่ชนะเงียบ ๆ แล้ว credential ที่เก็บไว้ถอดรหัสไม่ได้และทุกคนถูก logout) ถ้าค่าที่ตกลงต่างจากนี้ แก้ในฟังก์ชัน
`want()` ก่อนรัน (ค่าห้ามมี `|` หรือ `&`) บล็อกเช็กหลังแก้ว่าแต่ละคีย์มีบรรทัดเดียวและค่าตรง จำนวนบรรทัดเพิ่มเท่ากับคีย์ที่
เพิ่มใหม่ และบรรทัดอื่นทุกบรรทัดเหมือน `env.before` (หลังเปลี่ยนชื่อ) ทุกตัวอักษร

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
BK=$(ls -d backups/pre-lsp-siet-* 2>/dev/null | tail -1 || true); [ -s "$BK/env.before" ] || die "ไม่มี $BK/env.before"
set -a; . ./.env; set +a
case "${WORKSPACE_SEED_ADMIN_PASSWORD:-admin1}" in admin1|'') die "ตั้ง WORKSPACE_SEED_ADMIN_PASSWORD ใน .env เป็นรหัสที่แข็งแรงก่อน (ใช้เป็นรหัส admin1 ทุกครั้งที่ start)";; esac
[ -n "${GOOGLE_OAUTH_CLIENT_ID:-}" ] || echo "หมายเหตุ: GOOGLE_OAUTH_CLIENT_ID ว่าง — ปุ่ม Google login จะใช้ไม่ได้ (admin1 ยัง login ได้)"
[ "$(grep -cE '^(LSP_SIET|OPEN_NOTEBOOK)_ENCRYPTION_KEY=' .env)" = 1 ]   || die "ENCRYPTION_KEY ต้องมีบรรทัดเดียว (ก่อนแก้)"
KEYS="API_URL FRONTEND_URL MY_AI_QUIZ_URL AI_ROADMAP_URL CORS_ORIGINS GOOGLE_OAUTH_REDIRECT_URI GOOGLE_OAUTH_MOCK"
want() { case "$1" in
  API_URL|FRONTEND_URL|CORS_ORIGINS) echo https://lsp-siet.site;;
  MY_AI_QUIZ_URL) echo /quiz;;  AI_ROADMAP_URL) echo /roadmap;;
  GOOGLE_OAUTH_REDIRECT_URI) echo '';;   # ว่าง = ${FRONTEND_URL}/auth/google/callback
  GOOGLE_OAUTH_MOCK) echo 0;;
  *) die "ไม่รู้จัก $1";; esac; }
[ -z "$(tail -c 1 .env)" ] || echo >> .env           # บรรทัดสุดท้ายต้องจบด้วย newline ก่อน append
sed -i '' -E 's/^OPEN_NOTEBOOK_/LSP_SIET_/' .env
before=$(wc -l < .env | tr -d ' '); added=0
for k in $KEYS; do
  [ "$(grep -c "^$k=" .env || true)" -le 1 ] || die "$k มีหลายบรรทัดใน .env — แก้ด้วยมือก่อน"
  v=$(want "$k")
  if grep -q "^$k=" .env; then sed -i '' -E "s|^$k=.*|$k=$v|" .env
  else printf '%s=%s\n' "$k" "$v" >> .env; added=$((added + 1)); fi
done
after=$(wc -l < .env | tr -d ' ')
[ "$after" -eq $((before + added)) ]                 || die ".env มี $after บรรทัด ควรเป็น $before + $added"
for k in $KEYS; do
  [ "$(grep -c "^$k=" .env || true)" = 1 ]           || die "$k ต้องมีบรรทัดเดียว"
  [ "$(grep "^$k=" .env | cut -d= -f2-)" = "$(want "$k")" ] || die "$k ค่าไม่ตรง"
done
pat="^($(echo $KEYS | tr ' ' '|'))="
diff <(sed -E 's/^OPEN_NOTEBOOK_/LSP_SIET_/' "$BK/env.before" | grep -vE "$pat") <(grep -vE "$pat" .env) \
  || die "บรรทัดอื่นใน .env ไม่เหมือน env.before (ดู diff ด้านบน)"
! grep -q '^OPEN_NOTEBOOK_' .env                                         || die "ยังมีบรรทัด OPEN_NOTEBOOK_"
[ "$(grep -cE '^(LSP_SIET|OPEN_NOTEBOOK)_ENCRYPTION_KEY=' .env)" = 1 ]   || die "ENCRYPTION_KEY ต้องมีบรรทัดเดียว"
[ "$(grep '^LSP_SIET_ENCRYPTION_KEY=' .env | cut -d= -f2-)" = "$(grep '^OPEN_NOTEBOOK_ENCRYPTION_KEY=' "$BK/env.before" | cut -d= -f2-)" ] || die "ENCRYPTION_KEY เปลี่ยนค่า"
grep -E '^[A-Z_]+=' .env | cut -d= -f1 | tr '\n' ' '; echo; echo "B3 OK"
EOF
```

**B4 — ดูค่าที่ compose จะส่งจริง แล้วค่อย start**

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
BK=$(ls -d backups/pre-lsp-siet-* 2>/dev/null | tail -1 || true); [ -n "$BK" ] || die "ไม่มี backup"
docker compose -p kmitlai config </dev/null > "$BK/compose-rendered.yml"      # มี secret: อยู่ใน backups/ ที่ git ignore
R="$BK/compose-rendered.yml"
grep -qE '^ +API_URL: https://lsp-siet\.site$' "$R"        || die "API_URL ไม่ใช่ https://lsp-siet.site"
grep -qE '^ +FRONTEND_URL: https://lsp-siet\.site$' "$R"   || die "FRONTEND_URL"
grep -qE '^ +MY_AI_QUIZ_URL: /quiz$' "$R"                  || die "MY_AI_QUIZ_URL"
grep -qE '^ +AI_ROADMAP_URL: /roadmap$' "$R"               || die "AI_ROADMAP_URL"
grep -qE '^ +CORS_ORIGINS: https://lsp-siet\.site$' "$R"   || die "CORS_ORIGINS"
grep -qE '^ +GOOGLE_OAUTH_MOCK: "?0"?$' "$R"               || die "GOOGLE_OAUTH_MOCK ต้องเป็น 0"
grep -qE '^ +GOOGLE_OAUTH_REDIRECT_URI: (""|https://lsp-siet\.site/auth/google/callback)$' "$R" || die "GOOGLE_OAUTH_REDIRECT_URI"
! grep -q 'change-me-to-a-secret-string' "$R"              || die "ENCRYPTION_KEY เป็นค่า default"
grep -q "source: $PWD/platform/surreal_data$" "$R"          || die "compose ไม่ได้ mount platform/surreal_data"
grep -q 'localhost:300[0-2]' "$R" && grep -n 'localhost:300[0-2]' "$R"   # เหลือได้แค่ NEXT_PUBLIC_API_URL / CORS dev: อ่านดู
# ประตูสุดท้าย: โฟลเดอร์ข้อมูลต้องไม่ว่าง ไม่งั้น SurrealDB ขึ้นมาเป็นฐานว่าง
[ -f platform/surreal_data/mydatabase.db/CURRENT ]         || die "platform/surreal_data ว่าง"
[ -n "$(ls -A platform/notebook_data)" ]                   || die "platform/notebook_data ว่าง"
docker compose -p kmitlai up -d --no-build </dev/null
EOF
```

ตรวจหลัง deploy:

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
set -a; . ./.env; set +a
sq() { docker exec -i kmitlai-surrealdb-1 /surreal sql --conn http://localhost:8000 --user "${SURREAL_USER:-root}" --pass "${SURREAL_PASSWORD:-root}" --ns open_notebook --db open_notebook --json --hide-welcome; }
docker logs lsp_siet_api 2>&1 | grep -E 'SIET migration|deprecated|ERROR' | head -20 || true   # k9 ครั้งเดียว, ไม่มี deprecated
echo "SELECT version FROM _siet_migrations ORDER BY version;" | sq                               # 1..9
H='Host: lsp-siet.site'
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" http://localhost/login || echo "curl failed: http://localhost/login"                          # 200
curl -s -H "$H" http://localhost/config || echo "curl failed: http://localhost/config" ; echo                    # {"apiUrl":"https://lsp-siet.site"} — ถ้าเป็น localhost:3000 = เบราว์เซอร์จะพัง
curl -s -H "$H" http://localhost/config/apps || echo "curl failed: http://localhost/config/apps" ; echo               # {"quizUrl":"/quiz","roadmapUrl":"/roadmap"}
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" http://localhost/quiz || echo "curl failed: http://localhost/quiz"                           # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" http://localhost/roadmap || echo "curl failed: http://localhost/roadmap"                        # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" http://localhost/api/auth/status || echo "curl failed: http://localhost/api/auth/status"                # 200
EOF
```

curl ผ่าน `Host:` ยืนยันได้แค่ว่า Traefik ส่งถึงคอนเทนเนอร์ **ต้องเช็กในเบราว์เซอร์จริงที่ https://lsp-siet.site ด้วย**:
login (Google ถ้าตั้งไว้ และ admin1), เปิด notebook + chat เก่า, upload ข้อความสั้นแล้วรอ summary, /admin/rag,
/admin/quiz, /admin/roadmap, กดไป quiz และ roadmap จากเมนูแล้วดูว่าเข้าได้โดยยัง login อยู่ (hand-off) และ DevTools →
Network ไม่มี request ไป `localhost`

**Rollback ทาง B** — คืน compose **และ** image **และ** `.env` พร้อมกันเสมอ: compose ใหม่ส่งเฉพาะ `LSP_SIET_*` เข้าคอนเทนเนอร์
ส่วน compose เก่าอ่านแค่ `OPEN_NOTEBOOK_ENCRYPTION_KEY` — ถ้าไม่คืน `.env` คอนเทนเนอร์เก่าจะได้ key default (credential
ถอดรหัสไม่ได้, JWT เดิมใช้ไม่ได้) บล็อกนี้รับสภาพครึ่งทางของ B2 ได้

```bash
cd /Users/phuwish/kmitlAI && bash -euo pipefail <<'EOF'
die() { echo "STOP: $*" >&2; exit 1; }
BK=$(ls -d backups/pre-lsp-siet-* 2>/dev/null | tail -1 || true); [ -n "$BK" ] || die "ไม่มี backup"
TS=${BK##*-lsp-siet-}
[ -s "$BK/env.before" ] && [ -s "$BK/git-branch.txt" ] || die "$BK ไม่มี env.before / git-branch.txt"
grep -q '^OPEN_NOTEBOOK_ENCRYPTION_KEY=' "$BK/env.before" || die "env.before ไม่มี OPEN_NOTEBOOK_ENCRYPTION_KEY"
docker compose -p kmitlai down --remove-orphans </dev/null
cp -p "$BK/env.before" .env
mkdir -p open-notebook
for d in surreal_data notebook_data redis_data; do
  if [ -d "platform/$d" ]; then
    [ ! -e "open-notebook/$d" ] || [ -z "$(ls -A "open-notebook/$d")" ] || die "open-notebook/$d มีข้อมูลอยู่แล้ว"
    [ -e "open-notebook/$d" ] && rmdir "open-notebook/$d"
    mv "platform/$d" "open-notebook/$d"
  fi
done
if [ -d ai-roadmap/app/pb_data ] && [ ! -e ai-roadmap-generator/pb_data ]; then mkdir -p ai-roadmap-generator; mv ai-roadmap/app/pb_data ai-roadmap-generator/pb_data; fi
if docker image inspect "kmitlai/my-ai-quiz:pre-lsp-siet-$TS" >/dev/null 2>&1; then docker tag "kmitlai/my-ai-quiz:pre-lsp-siet-$TS" kmitlai/my-ai-quiz:local; fi
git switch "$(cat "$BK/git-branch.txt")"
[ "$(git rev-parse HEAD)" = "$(cat "$BK/git-head.txt")" ] || echo "หมายเหตุ: HEAD ไม่ตรงกับตอน backup ($(cat "$BK/git-head.txt"))"
[ -f docker/open-notebook/Dockerfile ] || die "checkout ไม่ใช่ layout เดิม"
[ -f open-notebook/surreal_data/mydatabase.db/CURRENT ] || die "open-notebook/surreal_data ว่าง — อย่า up"
docker compose -p kmitlai up -d --no-build </dev/null   # kmitlai/open-notebook:local, kmitlai/ai-roadmap-generator:local ยังเป็นของเดิม
EOF
```

k9 ไม่ต้องย้อน (ลบแค่ตาราง podcast ที่ว่าง; image เก่าทำงานได้ — ซ้อมแล้ว) ถ้าต้องการ SurrealDB ตอนก่อน deploy ทุกไบต์:
หลัง rollback หยุด `surrealdb` แล้วคืน `$BK/surreal_data-files` เป็น `open-notebook/surreal_data`

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

`get_snapshot.py` ส่งแค่ GET แต่ GET บางตัวเขียนข้อมูล (เช่นการเปิด source/notebook ถูกบันทึกเป็น recently-viewed)
จึงใช้กับ stack ทดสอบเท่านั้น ห้ามชี้ไปที่ production

SurrealDB export → import (v2.6.5): ตัดบรรทัด log สีท้ายไฟล์ (ถ้ามี) แล้ว
`sed -E 's/^DEFINE FIELD /DEFINE FIELD OVERWRITE /'` (เหมือน `lsp-backup`) แล้ว `surreal import` ลงฐานว่าง
ไฟล์ export / dump / env / JWT ของรอบนี้มีข้อมูลส่วนบุคคลและ secret — ลบทิ้งแล้วหลังตรวจ ไม่ได้ commit
