# RUNBOOK — วิธีรัน KMITL AI Workspace บนเครื่องใหม่

เอกสารนี้เดินตามได้จบในตัว ตั้งแต่เครื่องเปล่าจนเปิดเว็บใช้งานได้
ถ้าอยากเข้าใจว่าระบบทำงานอย่างไรให้อ่าน [SYSTEM-GUIDE.md](SYSTEM-GUIDE.md)
ถ้าอยากแค่ให้มันรันได้ อ่านไฟล์นี้พอ

> **สรุปสั้นที่สุด**
> `git clone` → ตรวจ line ending → `cp .env.example .env` แล้วแก้ 3 บรรทัด →
> `make up` → ตรวจ 3 ชั้น → ตั้งโมเดล AI
>
> ขั้น "ตรวจ line ending" กับ "ตรวจ 3 ชั้น" คือสองขั้นที่คนข้ามแล้วเสียเวลาเป็นชั่วโมง
> เหตุผลอยู่ในข้อ 2.2 และข้อ 4

---

## 1. ระบบนี้ประกอบด้วยอะไรบ้าง

รู้ไว้ก่อนเพื่อจะได้รู้ว่าตอนพังต้องไปดูที่ไหน — ทั้งหมดเป็น **8 คอนเทนเนอร์**

| คอนเทนเนอร์ | หน้าที่ | พอร์ตที่เครื่องคุณ |
|---|---|---|
| `kmitl_open_notebook_api` | **ตัวหลัก** — เว็บหน้าบ้าน + API + worker | `3000` (เว็บ), `5055` (API) |
| `kmitl_my_ai_quiz` | แอปสร้างควิซ | `3001` |
| `kmitl_ai_roadmap_generator` | แอปสร้าง roadmap | `3002` |
| `kmitl_traefik` | ตัวรวมทุกแอปไว้โดเมนเดียว | `80` |
| `kmitl_mariadb` | ผู้ใช้ แต้ม ฟีด ห้องเรียน | ไม่เปิดออกมา |
| `kmitlai-surrealdb-1` | notebook, เอกสาร, embedding | ไม่เปิดออกมา |
| `kmitlai-redis-1` | คิวงาน + แคช | ไม่เปิดออกมา |
| `kmitl_ai_roadmap_pocketbase` | ฐานข้อมูลของแอป roadmap | ไม่เปิดออกมา |

### ข้อที่ทำให้ debug ยากที่สุด

`kmitl_open_notebook_api` **ไม่ได้รันโปรแกรมเดียว** ข้างในมี supervisord คุม 3 โปรเซส:

```
supervisord
├── api       → FastAPI ที่พอร์ต 5055   (รัน migration ตอน start)
├── worker    → ตัวประมวลผลงานเบื้องหลัง
└── frontend  → Next.js ที่พอร์ต 8502   (map ออกมาเป็น 3000)
```

**ถ้า `frontend` ตาย คอนเทนเนอร์ยังรายงานว่า `Up` เหมือนเดิม** เพราะ supervisord
ซึ่งเป็นโปรเซสหลักยังมีชีวิตอยู่ ผลคือ `docker ps` เขียวหมดแต่เปิดเว็บไม่ได้
นี่คือเหตุผลที่ข้อ 4 ต้องตรวจ 3 ชั้น ไม่ใช่ชั้นเดียว

### ลำดับการ start

```
mariadb + surrealdb + redis   (ต้องพร้อมก่อน)
        ↓
api        รัน migration ฐานข้อมูล → ถ้า migration พัง api จะออกทันที แล้ววน restart ไม่จบ
        ↓
frontend   รอ api ตอบ /health ก่อน (สูงสุด 5 นาที) แล้วค่อยเปิดพอร์ต 3000
```

อ่านลำดับนี้ให้ขึ้นใจ เพราะเวลา **พอร์ต 3000 ไม่ขึ้น สาเหตุมักไม่ได้อยู่ที่ frontend
แต่อยู่ที่ api หรือฐานข้อมูลที่อยู่ก่อนหน้ามัน**

---

## 2. ติดตั้งครั้งแรก

### 2.1 เตรียมเครื่อง

| รายการ | ขั้นต่ำ |
|---|---|
| Docker Desktop / Docker Engine ที่มี compose v2 | ตรวจด้วย `docker compose version` ต้องขึ้น `v2.x` |
| RAM | 8 GB (16 GB จะลื่นกว่ามาก) |
| พื้นที่ว่าง | ~15 GB — image ตัวหลักอย่างเดียว ~4 GB |
| อินเทอร์เน็ต | ต้องมีตอน build และตอนเรียกโมเดล AI |

```bash
docker --version
docker compose version
```

### 2.2 ดาวน์โหลดโค้ด แล้วตรวจ line ending ทันที

```bash
git clone https://github.com/phuwishpk/LSP-SIET.git kmitlAI
cd kmitlAI
```

**ห้ามข้ามขั้นนี้ถ้าใช้ Windows:**

```bash
git ls-files --eol docker/open-notebook/wait-for-api.sh open-notebook/dev-init.sh
```

ต้องได้ `w/lf` ทั้งสองบรรทัด:

```
i/lf    w/lf    attr/text eol=lf        docker/open-notebook/wait-for-api.sh
i/lf    w/lf    attr/text eol=lf        open-notebook/dev-init.sh
```

<details>
<summary><b>ทำไมต้องตรวจ และถ้าได้ w/crlf ต้องทำอะไร</b></summary>

Git for Windows ตั้ง `core.autocrlf=true` มาให้อัตโนมัติ ทุกไฟล์ที่ checkout ออกมา
จะถูกแปลงจาก LF เป็น CRLF ซึ่งไม่มีปัญหากับโค้ดทั่วไป **แต่มีปัญหามากกับเชลล์สคริปต์
ที่คอนเทนเนอร์ Linux ต้องรัน**

บรรทัดแรกของ `wait-for-api.sh` คือ `#!/bin/sh` เมื่อกลายเป็น CRLF มันจะเป็น
`#!/bin/sh\r` — เคอร์เนล Linux อ่าน `\r` เป็นส่วนหนึ่งของชื่อไฟล์ จึงไปหาโปรแกรมชื่อ
`/bin/sh\r` ซึ่งไม่มีอยู่จริง ผลคือ:

```
bash: line 1: /app/scripts/wait-for-api.sh: cannot execute: required file not found
WARN exited: frontend (exit status 127; not expected)
INFO gave up: frontend entered FATAL state, too many start retries too quickly
```

`frontend` ตาย แต่ `api` กับ `worker` ยังอยู่ supervisord จึงไม่ตาย คอนเทนเนอร์เลยยัง
`Up` — **เว็บที่พอร์ต 3000 ตายสนิทโดยที่ทุกอย่างดูปกติ**

repo มี `.gitattributes` pin ไฟล์กลุ่มนี้เป็น LF ไว้แล้ว จึงไม่ต้องไปแก้ค่า
`core.autocrlf` ของเครื่อง แต่ถ้าตรวจแล้วได้ `w/crlf` (เช่น clone มาตั้งแต่ก่อนมีไฟล์นี้)
ให้บังคับ checkout ใหม่เฉพาะสองไฟล์:

```bash
rm docker/open-notebook/wait-for-api.sh open-notebook/dev-init.sh
git checkout -- docker/open-notebook/wait-for-api.sh open-notebook/dev-init.sh
git ls-files --eol docker/open-notebook/wait-for-api.sh
```

ถ้า build image ไปแล้วก่อนแก้ **ต้อง build ใหม่** เพราะไฟล์ CRLF ถูกอบเข้า image ไปแล้ว

</details>

### 2.3 สร้างและแก้ `.env`

```bash
cp .env.example .env
```

แก้อย่างน้อย 3 บรรทัด:

| ตัวแปร | ใส่อะไร | ถ้าไม่แก้ |
|---|---|---|
| `OPEN_NOTEBOOK_ENCRYPTION_KEY` | ข้อความสุ่ม ≥16 ตัว (`openssl rand -hex 32`) | ใครก็ปลอม token เข้าระบบได้ เพราะคีย์นี้ใช้เซ็น JWT ด้วยเมื่อ `JWT_SECRET` ว่าง |
| `GOOGLE_GENERATIVE_AI_API_KEY` **หรือ** `OPENAI_API_KEY` | API key จริง | สร้างควิซ / roadmap / ถาม RAG ไม่ได้ |
| `GOOGLE_OAUTH_MOCK` | `1` ตอนพัฒนา, `0` ตอนใช้จริง | `1` = ล็อกอิน Google แบบจำลอง ไม่ต้องตั้ง OAuth client |

> คีย์ `OPEN_NOTEBOOK_ENCRYPTION_KEY` **ห้ามเปลี่ยนหลังใช้งานไปแล้ว** ไม่งั้น API key
> ของผู้ให้บริการ AI ที่เก็บไว้จะถอดรหัสไม่ออก และผู้ใช้ทุกคนจะถูกเตะออกจากระบบ

### 2.4 build และ start

```bash
make up
```

ครั้งแรกใช้เวลา **10–20 นาที** (ต้อง `apt-get install`, `npm ci` และ build Next.js 3 แอป)
ครั้งต่อไปเร็วขึ้นมากเพราะมี layer cache

ระหว่างรอ ดูความคืบหน้าได้ที่หน้าต่างอื่นด้วย `make logs`

### 2.5 รอให้ระบบพร้อม

```bash
until curl -sf http://localhost:5055/health >/dev/null; do sleep 3; done
echo "API พร้อมแล้ว"
```

ตอน api start จะทำ 2 อย่างให้เองอัตโนมัติ **ไม่ต้องรันคำสั่ง migrate เอง**:
สร้าง/อัปเดตตาราง MariaDB ทั้งหมด และรัน migration ของ SurrealDB จนถึงเวอร์ชันล่าสุด

### 2.6 เข้าใช้งานครั้งแรก

เปิด <http://localhost:3000> → ระบบจะพาไปหน้า `/login` เอง → ล็อกอิน `admin1` / `admin1`

| บัญชี | รหัสผ่าน | สิทธิ์ |
|---|---|---|
| `admin1` | `admin1` | ผู้ดูแลระบบ |
| `student1` … `student5` | เหมือนชื่อผู้ใช้ | นักศึกษา |

> ถ้าเข้าทาง <http://localhost/> (ผ่าน Traefik) เบราว์เซอร์จะถาม basic auth ก่อน
> ค่าเริ่มต้น `admin` / `123` — เป็นคนละชั้นกับการล็อกอินของเว็บ

### 2.7 ตั้งโมเดล AI (ห้ามข้าม)

ติดตั้งเสร็จแล้ว AI ยังตอบไม่ได้จนกว่าจะผูกโมเดล ทำครั้งเดียวด้วยบัญชี admin —
ขั้นตอนละเอียดอยู่ที่ [SYSTEM-GUIDE.md](SYSTEM-GUIDE.md) §5.3 สรุปคือ
**Models → Add credential → Test → Discover models → Register** แล้วตั้ง 2 ช่อง:
*Default chat model* และ *Default embedding model*

---

## 3. คำสั่งที่ใช้ประจำ

```bash
make up            # build + start (ใช้ได้ทั้งครั้งแรกและครั้งต่อ ๆ ไป)
make ps            # ดูว่า service ไหนรันอยู่
make logs          # ตาม log ทุก service
make down          # หยุด (ข้อมูลยังอยู่)
make rebuild       # build ใหม่โดยไม่ใช้ cache
make nuke          # หยุด + ลบ volume — ข้อมูลใน MariaDB หายหมด
```

แก้โค้ดของ open-notebook แล้วอยากให้มีผล:

```bash
docker compose -p kmitlai build open_notebook_api
docker compose -p kmitlai up -d --force-recreate open_notebook_api
```

---

## 4. ตรวจว่าติดตั้งสำเร็จ — ต้องตรวจ 3 ชั้น

ตรวจชั้นเดียวไม่พอ เพราะแต่ละชั้นซ่อนปัญหาของชั้นถัดไป

### ชั้นที่ 1 — คอนเทนเนอร์ยังอยู่ไหม

```bash
make ps
```

ควรเห็นครบ 8 ตัวเป็น `Up`

### ชั้นที่ 2 — โปรเซสข้างในคอนเทนเนอร์หลักยังอยู่ไหม

**ชั้นนี้คือชั้นที่คนลืมตรวจ**

```bash
docker logs kmitl_open_notebook_api 2>&1 | grep -E "entered RUNNING|FATAL"
```

ต้องเห็นครบ 3 ตัว และ**ต้องไม่มีคำว่า FATAL**:

```
INFO success: api entered RUNNING state, process has stayed up for > than 1 seconds
INFO success: worker entered RUNNING state, process has stayed up for > than 3 seconds
INFO success: frontend entered RUNNING state, process has stayed up for > than 10 seconds
```

### ชั้นที่ 3 — ตอบ HTTP จริงไหม

```bash
curl -o /dev/null -w 'web      %{http_code}\n' -L http://localhost:3000/
curl -o /dev/null -w 'api      %{http_code}\n'    http://localhost:5055/health
curl -o /dev/null -w 'quiz     %{http_code}\n' -L http://localhost:3001/quiz
curl -o /dev/null -w 'roadmap  %{http_code}\n' -L http://localhost:3002/roadmap
```

ต้องได้ `200` ทั้ง 4 บรรทัด (เปิด `http://localhost:3000/` ตรง ๆ โดยไม่ใส่ `-L`
จะได้ `307` ก่อนเด้งไป `/login` ซึ่งถูกต้องแล้ว)

### เช็กลิสต์ในเว็บ

- [ ] ล็อกอิน `admin1` ได้ และเห็นเมนู "จัดการระบบ"
- [ ] ล็อกอิน `student1` ได้ และเห็นเฉพาะหน้าชุมชน
- [ ] หน้า `/community` แสดงห้องวิชา CS101–CS302
- [ ] กระเป๋าแต้มมุมขวาบนขึ้น 20 แต้มสำหรับผู้ใช้ใหม่

---

## 5. เมื่อพอร์ต 3000 ไม่ขึ้น — ไล่ตามลำดับนี้

อย่าเดา ให้ไล่จากชั้นในออกมาชั้นนอก

### ขั้นที่ 1 — คอนเทนเนอร์ตายหรือเปล่า

```bash
docker ps -a --filter name=kmitl_open_notebook_api
```

- ไม่เห็นเลย → ยังไม่ได้ start ให้ `make up`
- ขึ้น `Restarting` หรือ `Exited` → ข้ามไปขั้นที่ 3

### ขั้นที่ 2 — `Up` แต่เว็บไม่ขึ้น (กรณีที่เจอบ่อยที่สุด)

```bash
docker logs kmitl_open_notebook_api 2>&1 | grep -E "FATAL|exit status"
```

| สิ่งที่เห็น | แปลว่า | แก้อย่างไร |
|---|---|---|
| `cannot execute: required file not found` + `exit status 127` | สคริปต์เป็น CRLF (ข้อ 2.2) | แก้ line ending แล้ว **build ใหม่** |
| `gave up: frontend entered FATAL state` | frontend ตายเกิน 4 ครั้งติด supervisord เลิกพยายาม | ดูบรรทัดก่อนหน้าว่าตายเพราะอะไร |
| ไม่มี FATAL เลย และเพิ่ง start ไม่ถึง 1 นาที | ยังไม่พร้อม frontend รอ api อยู่ | รอแล้วค่อยตรวจใหม่ |

### ขั้นที่ 3 — api รันไม่ขึ้น

```bash
docker logs kmitl_open_notebook_api 2>&1 | grep -iE "migration|startup failed" | tail -20
```

| สิ่งที่เห็น | แปลว่า | แก้อย่างไร |
|---|---|---|
| `Failed to run database migrations` + `Parse error: Invalid function/constant path` | migration ใช้ไวยากรณ์ SurrealQL ที่ถูกถอดออกใน SurrealDB v2 | `git pull` ให้ได้โค้ดล่าสุด แล้ว build ใหม่ |
| `Application startup failed` วน ๆ | api ออกตอน start ทุกครั้ง | อ่านบรรทัด `RuntimeError` ที่อยู่เหนือขึ้นไป |
| `Temporary failure in name resolution` | คอนเทนเนอร์ไม่ได้ผูก network | `docker compose -p kmitlai up -d --force-recreate` (`docker restart` ไม่ผูก network กลับ) |

### ขั้นที่ 4 — พอร์ตชนกับโปรแกรมอื่น

ถ้า `make up` ขึ้น `bind: address already in use` แปลว่ามีอย่างอื่นจองพอร์ตไว้ —
มักเป็น stack dev (`make up-dev`) ที่ยังไม่ได้ปิด เพราะ **dev กับ prod ใช้พอร์ตชุดเดียวกัน**

---

## 6. กฎเหล็ก 5 ข้อ

**1. แก้ไฟล์ในคอนเทนเนอร์ด้วย `docker cp` ไม่นับว่าแก้แล้ว**

การแก้แบบนั้นอยู่บน writable layer ของคอนเทนเนอร์ — `docker restart` รอด แต่
`docker compose up` หรือ `--force-recreate` จะสร้างคอนเทนเนอร์ใหม่จาก image เดิม
ทำให้การแก้หายหมดและอาการเดิมกลับมาโดยไม่มีใครรู้ว่าเพราะอะไร
**แก้ที่ซอร์สแล้ว build ใหม่เสมอ**

**2. เครื่องใหม่ได้เฉพาะสิ่งที่ commit แล้ว**

ก่อนย้ายเครื่องให้ `git status --short` จนว่าง แล้ว `git push`
การแก้ที่ค้างใน working tree จะทำให้เครื่องใหม่พังด้วยอาการที่เครื่องเดิมไม่เจอ

**3. `make nuke` ลบข้อมูลจริง**

ลบ volume ของ MariaDB (ผู้ใช้ แต้ม ฟีด ห้องเรียน) แต่ **ไม่ได้ลบ** โฟลเดอร์
`open-notebook/surreal_data/` กับ `notebook_data/` เพราะสองตัวนั้นเป็น bind mount
อยู่ในโฟลเดอร์โปรเจกต์ — ผลคือหลัง nuke ฐานข้อมูลสองฝั่งจะไม่ตรงกัน ถ้าจะเริ่มใหม่จริง ๆ
ต้องลบโฟลเดอร์พวกนั้นด้วยมือด้วย

**4. อย่ารัน dev กับ prod พร้อมกัน**

ใช้พอร์ตชุดเดียวกัน (3000/3001/3002/5055) ต้อง `make down` ตัวหนึ่งก่อนเสมอ
ดูว่าคุยกับตัวไหนอยู่ด้วย `docker ps` — `kmitl_*` คือ prod, `kmitlai_dev_*` คือ dev

**5. `docker ps` ขึ้น `Up` ไม่ได้แปลว่าใช้งานได้**

ตรวจ 3 ชั้นตามข้อ 4 เสมอ

---

## 7. ย้ายข้อมูลข้ามเครื่อง

โค้ดอยู่ใน git ครบ แต่ **ข้อมูลไม่ได้อยู่ใน git** ถ้าต้องยกข้อมูลไปด้วย
ดูขั้นตอน backup / restore ที่ [SYSTEM-GUIDE.md](SYSTEM-GUIDE.md) §5.5

สรุปที่เก็บข้อมูล:

| ข้อมูล | เก็บที่ |
|---|---|
| ผู้ใช้ แต้ม ฟีด ห้อง คลังเอกสาร | docker volume `kmitlai_mariadb_data` |
| notebook / เอกสาร / embedding / ควิซ / roadmap | `open-notebook/surreal_data/` |
| ไฟล์ที่อัปโหลด | `open-notebook/notebook_data/` |
| ข้อมูลแอป roadmap | `ai-roadmap-generator/pb_data/` |
