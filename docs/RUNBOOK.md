# RUNBOOK — วิธีรัน KMITL AI Workspace บนเครื่องใหม่ (macOS และ Windows)

เอกสารนี้เดินตามได้จบในตัว ตั้งแต่เครื่องเปล่าจนเปิดเว็บใช้งานได้ ทั้งบน **macOS** และ **Windows**
ถ้าอยากเข้าใจว่าระบบทำงานอย่างไรให้อ่าน [SYSTEM-GUIDE.md](SYSTEM-GUIDE.md)
ถ้าอยากแค่ให้มันรันได้ อ่านไฟล์นี้พอ

> **สรุปสั้นที่สุด**
> ติดตั้ง Docker → `git clone` → ตรวจ line ending → สร้าง `.env` แล้วแก้ 3 บรรทัด →
> start stack → ตรวจ 3 ชั้น → ตั้งโมเดล AI
>
> ขั้น "ตรวจ line ending" กับ "ตรวจ 3 ชั้น" คือสองขั้นที่คนข้ามแล้วเสียเวลาเป็นชั่วโมง
> เหตุผลอยู่ในข้อ 2.3 และข้อ 4

## 0. อ่านก่อน: คำสั่งในเอกสารนี้มีสองแบบ

ระบบรันใน Docker เหมือนกันทุกเครื่อง สิ่งที่ต่างกันคือ**เชลล์ที่คุณพิมพ์คำสั่ง** ทุกบล็อกคำสั่งในเอกสารนี้
จึงมีสองแบบ เลือกใช้แบบเดียวตลอด:

| ป้าย | ใช้กับ | เปิดจาก |
|---|---|---|
| **bash** | macOS (Terminal), Linux, และ Windows ที่ใช้ **Git Bash** | macOS: Terminal.app · Windows: คลิกขวาในโฟลเดอร์ → "Open Git Bash here" |
| **PowerShell** | Windows (PowerShell 5.1 หรือ 7 ก็ได้) | Start → พิมพ์ `PowerShell` (ไม่ต้อง Run as administrator) |

ข้อแตกต่างสำคัญ:

- `make` มีบน macOS แต่ **ไม่มีบน Windows** ตามค่าเริ่มต้น — บล็อก PowerShell จึงใช้คำสั่ง `docker compose`
  ตัวเต็มที่ `make` เรียกให้ (ตารางเทียบอยู่ในข้อ 3) ถ้าอยากใช้ `make` บน Windows ให้ติดตั้งด้วย
  `winget install GnuWin32.Make` แล้วใช้บล็อก bash ใน Git Bash ได้เลย
- ใน PowerShell คำว่า `curl` คือ `Invoke-WebRequest` ไม่ใช่ curl จริง — เอกสารนี้ใช้ `curl.exe` เสมอ
  (มีใน Windows 10 1803 ขึ้นไป)
- ทุกคำสั่งรันจาก**โฟลเดอร์โปรเจกต์** (`kmitlAI`) เว้นแต่ระบุ

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
| Docker ที่มี compose v2 | ตรวจด้วย `docker compose version` ต้องขึ้น `v2.x` |
| Git | macOS มีมากับ Xcode Command Line Tools · Windows ติดตั้ง [Git for Windows](https://git-scm.com/download/win) (ได้ Git Bash มาด้วย) |
| RAM | 8 GB (16 GB จะลื่นกว่ามาก) — ต้องเหลือให้ Docker อย่างน้อย 6 GB |
| พื้นที่ว่าง | ~15 GB — image ตัวหลักอย่างเดียว ~4 GB |
| อินเทอร์เน็ต | ต้องมีตอน build และตอนเรียกโมเดล AI |

**macOS**

- ติดตั้ง [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) หรือ [OrbStack](https://orbstack.dev)
  (เบากว่า ใช้ได้ทั้ง Intel และ Apple Silicon) — image ทั้งหมด build บนเครื่องคุณเอง จึงไม่มีปัญหา arm64
- ตั้ง memory ของ Docker VM ≥ 6 GB (Docker Desktop: Settings → Resources) stack นี้ใช้ ~4–5 GB ตอนรัน
  **อย่ารัน stack นี้ซ้อนกับ stack อื่นใน VM เดียวที่มี 12 GB** — เคยทำให้ VM ค้างทั้งตัว

**Windows**

- ติดตั้ง [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) แบบ **WSL 2 backend**
  (ตัวติดตั้งจะเปิด WSL 2 ให้ถ้ายังไม่มี; ต้องรีสตาร์ตเครื่องหนึ่งครั้ง) ตรวจว่า Docker Desktop
  เปิดอยู่ (ไอคอนวาฬใน tray) ก่อนพิมพ์คำสั่ง docker ทุกครั้ง
- clone โค้ดไว้ใน**ไดรฟ์ Windows ปกติ** เช่น `C:\Users\<คุณ>\kmitlAI` (ไม่ใช่ `\\wsl$\…`) — เอกสารนี้ยึดแบบนี้
- ถ้า Docker Desktop ขึ้นว่าต้องเปิด "Virtualization" ให้เปิด VT-x/AMD-V ใน BIOS/UEFI ก่อน

ตรวจทั้งสองระบบ (คำสั่งเดียวกันทุกเชลล์):

```bash
docker --version
docker compose version
git --version
```

### 2.2 ดาวน์โหลดโค้ด

**bash**

```bash
git clone https://github.com/phuwishpk/LSP-SIET.git kmitlAI
cd kmitlAI
```

**PowerShell**

```powershell
git clone https://github.com/phuwishpk/LSP-SIET.git kmitlAI
Set-Location kmitlAI
```

### 2.3 ตรวจ line ending ทันที (Windows ห้ามข้าม — macOS ตรวจเผื่อไว้)

คำสั่งนี้เหมือนกันทุกเชลล์:

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

repo มี `.gitattributes` pin ไฟล์กลุ่มนี้ (`*.sh`, `Dockerfile`, `*.yml`, `*.conf`, `*.surrealql`, `Makefile`)
เป็น LF ไว้แล้ว จึงไม่ต้องไปแก้ค่า `core.autocrlf` ของเครื่อง แต่ถ้าตรวจแล้วได้ `w/crlf`
(เช่น clone มาตั้งแต่ก่อนมีไฟล์นี้) ให้บังคับ checkout ใหม่เฉพาะสองไฟล์:

**bash**

```bash
rm docker/open-notebook/wait-for-api.sh open-notebook/dev-init.sh
git checkout -- docker/open-notebook/wait-for-api.sh open-notebook/dev-init.sh
git ls-files --eol docker/open-notebook/wait-for-api.sh
```

**PowerShell**

```powershell
Remove-Item docker/open-notebook/wait-for-api.sh, open-notebook/dev-init.sh
git checkout -- docker/open-notebook/wait-for-api.sh open-notebook/dev-init.sh
git ls-files --eol docker/open-notebook/wait-for-api.sh
```

ถ้า build image ไปแล้วก่อนแก้ **ต้อง build ใหม่** เพราะไฟล์ CRLF ถูกอบเข้า image ไปแล้ว

</details>

### 2.4 สร้างและแก้ `.env`

**bash**

```bash
cp .env.example .env
openssl rand -hex 32        # คัดลอกผลลัพธ์ไปใส่ OPEN_NOTEBOOK_ENCRYPTION_KEY
```

**PowerShell**

```powershell
Copy-Item .env.example .env
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })   # คัดลอกผลลัพธ์ไปใส่ OPEN_NOTEBOOK_ENCRYPTION_KEY
```

เปิด `.env` ด้วย editor (แนะนำ VS Code; บน Windows **อย่าใช้ Notepad รุ่นเก่า** ที่บันทึกเป็น UTF-8 with BOM —
ถ้าใช้ VS Code ให้ดูมุมขวาล่างว่าเป็น `UTF-8` และ `LF`) แก้อย่างน้อย 3 บรรทัด:

| ตัวแปร | ใส่อะไร | ถ้าไม่แก้ |
|---|---|---|
| `OPEN_NOTEBOOK_ENCRYPTION_KEY` | ข้อความสุ่ม ≥16 ตัว (จากคำสั่งข้างบน) | ใครก็ปลอม token เข้าระบบได้ เพราะคีย์นี้ใช้เซ็น JWT ด้วยเมื่อ `JWT_SECRET` ว่าง |
| `GOOGLE_GENERATIVE_AI_API_KEY` **หรือ** `OPENAI_API_KEY` | API key จริง | สร้างควิซ / roadmap / ถาม RAG ไม่ได้ |
| `GOOGLE_OAUTH_MOCK` | `1` ตอนพัฒนา, `0` ตอนใช้จริง | `1` = ล็อกอิน Google แบบจำลอง ไม่ต้องตั้ง OAuth client |

> คีย์ `OPEN_NOTEBOOK_ENCRYPTION_KEY` **ห้ามเปลี่ยนหลังใช้งานไปแล้ว** ไม่งั้น API key
> ของผู้ให้บริการ AI ที่เก็บไว้จะถอดรหัสไม่ออก และผู้ใช้ทุกคนจะถูกเตะออกจากระบบ

### 2.5 build และ start

**bash**

```bash
make up
```

**PowerShell**

```powershell
docker compose -p kmitlai -f docker-compose.yml --env-file .env up -d --build
```

ครั้งแรกใช้เวลา **10–20 นาที** (ต้อง `apt-get install`, `npm ci` และ build Next.js 3 แอป)
บน Windows อาจนานกว่านั้นเล็กน้อยเพราะ bind mount ผ่าน WSL 2 ครั้งต่อไปเร็วขึ้นมากเพราะมี layer cache

ระหว่างรอ ดูความคืบหน้าได้ที่หน้าต่างอื่น: **bash** `make logs` · **PowerShell**
`docker compose -p kmitlai logs -f`

> Windows: ถ้า Docker Desktop ถามเรื่อง "Share folder" หรือไฟร์วอลล์ถามให้ `com.docker.backend`
> เข้าถึงเครือข่าย ให้กดอนุญาต ไม่งั้นพอร์ต 3000/5055 จะไม่ออกมาที่เครื่อง

### 2.6 รอให้ระบบพร้อม

**bash**

```bash
until curl -sf http://localhost:5055/health >/dev/null; do sleep 3; done
echo "API พร้อมแล้ว"
```

**PowerShell**

```powershell
while (-not (curl.exe -sf http://localhost:5055/health)) { Start-Sleep 3 }
"API พร้อมแล้ว"
```

ตอน api start จะทำ 2 อย่างให้เองอัตโนมัติ **ไม่ต้องรันคำสั่ง migrate เอง**:
สร้าง/อัปเดตตาราง MariaDB ทั้งหมด และรัน migration ของ SurrealDB จนถึงเวอร์ชันล่าสุด

### 2.7 เข้าใช้งานครั้งแรก

เปิด <http://localhost:3000> → ระบบจะพาไปหน้า `/login` เอง → ล็อกอิน `admin1` / `admin1`

| บัญชี | รหัสผ่าน | สิทธิ์ |
|---|---|---|
| `admin1` | `admin1` | ผู้ดูแลระบบ |
| `student1` … `student5` | เหมือนชื่อผู้ใช้ | นักศึกษา |

> ถ้าเข้าทาง <http://localhost/> (ผ่าน Traefik) เบราว์เซอร์จะถาม basic auth ก่อน
> ค่าเริ่มต้น `admin` / `123` — เป็นคนละชั้นกับการล็อกอินของเว็บ

### 2.8 ตั้งโมเดล AI (ห้ามข้าม)

ติดตั้งเสร็จแล้ว AI ยังตอบไม่ได้จนกว่าจะผูกโมเดล ทำครั้งเดียวด้วยบัญชี admin —
ขั้นตอนละเอียดอยู่ที่ [SYSTEM-GUIDE.md](SYSTEM-GUIDE.md) §5.3 สรุปคือ
**Models → Add credential → Test → Discover models → Register** แล้วตั้ง 2 ช่อง:
*Default chat model* และ *Default embedding model*

---

## 3. คำสั่งที่ใช้ประจำ

`make` แต่ละเป้าหมายคือคำสั่ง `docker compose` ด้านขวา — บน Windows (PowerShell) พิมพ์คอลัมน์ขวาตรง ๆ
ตัวย่อ `DC` ด้านล่างหมายถึง `docker compose -p kmitlai -f docker-compose.yml --env-file .env`

| ทำอะไร | bash (make) | PowerShell / ทุกที่ |
|---|---|---|
| build + start (ครั้งแรกและครั้งต่อ ๆ ไป) | `make up` | `DC up -d --build` |
| ดูว่า service ไหนรันอยู่ | `make ps` | `DC ps` |
| ตาม log ทุก service | `make logs` | `DC logs -f` |
| หยุด (ข้อมูลยังอยู่) | `make down` | `DC down` |
| รีสตาร์ตทุก service | `make restart` | `DC restart` |
| build ใหม่โดยไม่ใช้ cache | `make rebuild` | `DC build --no-cache` |
| หยุด + ลบ volume — **ข้อมูลใน MariaDB หายหมด** | `make nuke` | `DC down --remove-orphans --volumes` |
| stack พัฒนา (hot reload) | `make up-dev` / `make down-dev` | `docker compose -p kmitlai_dev -f docker-compose-dev.yml --env-file .env up` / `… down` |

ตัวอย่างเต็มสำหรับ PowerShell (ตั้งตัวแปรครั้งเดียวต่อหน้าต่าง แล้วใช้สั้น ๆ ได้):

```powershell
function DC { docker compose -p kmitlai -f docker-compose.yml --env-file .env @args }
DC ps
DC logs -f open_notebook_api
```

แก้โค้ดของ open-notebook แล้วอยากให้มีผล (คำสั่งเดียวกันทุกเชลล์):

```bash
docker compose -p kmitlai build open_notebook_api
docker compose -p kmitlai up -d --force-recreate open_notebook_api
```

---

## 4. ตรวจว่าติดตั้งสำเร็จ — ต้องตรวจ 3 ชั้น

ตรวจชั้นเดียวไม่พอ เพราะแต่ละชั้นซ่อนปัญหาของชั้นถัดไป

### ชั้นที่ 1 — คอนเทนเนอร์ยังอยู่ไหม

```bash
docker compose -p kmitlai ps        # หรือ make ps
```

ควรเห็นครบ 8 ตัวเป็น `Up`

### ชั้นที่ 2 — โปรเซสข้างในคอนเทนเนอร์หลักยังอยู่ไหม

**ชั้นนี้คือชั้นที่คนลืมตรวจ**

**bash**

```bash
docker logs kmitl_open_notebook_api 2>&1 | grep -E "entered RUNNING|FATAL"
```

**PowerShell**

```powershell
docker logs kmitl_open_notebook_api 2>&1 | Select-String "entered RUNNING|FATAL"
```

ต้องเห็นครบ 3 ตัว และ**ต้องไม่มีคำว่า FATAL**:

```
INFO success: api entered RUNNING state, process has stayed up for > than 1 seconds
INFO success: worker entered RUNNING state, process has stayed up for > than 3 seconds
INFO success: frontend entered RUNNING state, process has stayed up for > than 10 seconds
```

### ชั้นที่ 3 — ตอบ HTTP จริงไหม

**bash**

```bash
curl -o /dev/null -w 'web      %{http_code}\n' -L http://localhost:3000/
curl -o /dev/null -w 'api      %{http_code}\n'    http://localhost:5055/health
curl -o /dev/null -w 'quiz     %{http_code}\n' -L http://localhost:3001/quiz
curl -o /dev/null -w 'roadmap  %{http_code}\n' -L http://localhost:3002/roadmap
```

**PowerShell**

```powershell
curl.exe -s -o NUL -w "web      %{http_code}`n" -L http://localhost:3000/
curl.exe -s -o NUL -w "api      %{http_code}`n"    http://localhost:5055/health
curl.exe -s -o NUL -w "quiz     %{http_code}`n" -L http://localhost:3001/quiz
curl.exe -s -o NUL -w "roadmap  %{http_code}`n" -L http://localhost:3002/roadmap
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

อย่าเดา ให้ไล่จากชั้นในออกมาชั้นนอก (คำสั่ง `grep` ของ bash แทนด้วย `Select-String` ใน PowerShell
เหมือนข้อ 4 ชั้นที่ 2)

### ขั้นที่ 1 — คอนเทนเนอร์ตายหรือเปล่า

```bash
docker ps -a --filter name=kmitl_open_notebook_api
```

- ไม่เห็นเลย → ยังไม่ได้ start ให้ start ตามข้อ 2.5
- ขึ้น `Restarting` หรือ `Exited` → ข้ามไปขั้นที่ 3

### ขั้นที่ 2 — `Up` แต่เว็บไม่ขึ้น (กรณีที่เจอบ่อยที่สุด)

```bash
docker logs kmitl_open_notebook_api 2>&1 | grep -E "FATAL|exit status"            # bash
docker logs kmitl_open_notebook_api 2>&1 | Select-String "FATAL|exit status"      # PowerShell
```

| สิ่งที่เห็น | แปลว่า | แก้อย่างไร |
|---|---|---|
| `cannot execute: required file not found` + `exit status 127` | สคริปต์เป็น CRLF (ข้อ 2.3) — เจอบ่อยที่สุดบน Windows | แก้ line ending แล้ว **build ใหม่** |
| `gave up: frontend entered FATAL state` | frontend ตายเกิน 4 ครั้งติด supervisord เลิกพยายาม | ดูบรรทัดก่อนหน้าว่าตายเพราะอะไร |
| ไม่มี FATAL เลย และเพิ่ง start ไม่ถึง 1 นาที | ยังไม่พร้อม frontend รอ api อยู่ | รอแล้วค่อยตรวจใหม่ |

### ขั้นที่ 3 — api รันไม่ขึ้น

```bash
docker logs kmitl_open_notebook_api 2>&1 | grep -iE "migration|startup failed" | tail -20          # bash
docker logs kmitl_open_notebook_api 2>&1 | Select-String "migration|startup failed" | Select-Object -Last 20   # PowerShell
```

| สิ่งที่เห็น | แปลว่า | แก้อย่างไร |
|---|---|---|
| `Failed to run database migrations` + `Parse error: Invalid function/constant path` | migration ใช้ไวยากรณ์ SurrealQL ที่ถูกถอดออกใน SurrealDB v2 | `git pull` ให้ได้โค้ดล่าสุด แล้ว build ใหม่ |
| `Application startup failed` วน ๆ | api ออกตอน start ทุกครั้ง | อ่านบรรทัด `RuntimeError` ที่อยู่เหนือขึ้นไป |
| `Temporary failure in name resolution` | คอนเทนเนอร์ไม่ได้ผูก network | `docker compose -p kmitlai up -d --force-recreate` (`docker restart` ไม่ผูก network กลับ) |

### ขั้นที่ 4 — พอร์ตชนกับโปรแกรมอื่น

ถ้า start แล้วขึ้น `bind: address already in use` (macOS) หรือ
`ports are not available` / `An attempt was made to access a socket in a way forbidden by its access permissions` (Windows)
แปลว่ามีอย่างอื่นจองพอร์ตไว้:

- มักเป็น stack dev (`make up-dev`) ที่ยังไม่ได้ปิด เพราะ **dev กับ prod ใช้พอร์ตชุดเดียวกัน**
- หาตัวจอง: **bash** `lsof -iTCP:3000 -sTCP:LISTEN` · **PowerShell** `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`
- Windows: บางครั้งพอร์ต 3000–3002 ถูก Hyper-V/WinNAT จองเป็นช่วงสำรอง ตรวจด้วย
  `netsh interface ipv4 show excludedportrange protocol=tcp` ถ้าใช่ให้ `net stop winnat` → start stack → `net start winnat` (ต้อง PowerShell แบบ administrator)

### ขั้นที่ 5 (Windows) — ปัญหาเฉพาะ Docker Desktop

| อาการ | แก้ |
|---|---|
| `docker: error during connect` / `The system cannot find the file specified` | Docker Desktop ยังไม่เปิด หรือยัง start ไม่เสร็จ — รอไอคอนวาฬหยุดกระพริบ |
| build ช้ามากหรือค้างตอน `npm ci` | ยกเว้นโฟลเดอร์โปรเจกต์จาก Windows Defender (Virus & threat protection → Exclusions) และเพิ่ม memory ให้ WSL 2 ใน `%UserProfile%\.wslconfig` (`[wsl2]` → `memory=8GB`) แล้ว `wsl --shutdown` |
| `.env` ถูกอ่านไม่ครบ / ค่าแปลก | ไฟล์ถูกบันทึกเป็น UTF-8 with BOM หรือ UTF-16 — เปิดด้วย VS Code แล้ว Save with Encoding → UTF-8 |

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

**3. `make nuke` (`down --volumes`) ลบข้อมูลจริง**

ลบ volume ของ MariaDB (ผู้ใช้ แต้ม ฟีด ห้องเรียน) แต่ **ไม่ได้ลบ** โฟลเดอร์
`open-notebook/surreal_data/` กับ `notebook_data/` เพราะสองตัวนั้นเป็น bind mount
อยู่ในโฟลเดอร์โปรเจกต์ — ผลคือหลัง nuke ฐานข้อมูลสองฝั่งจะไม่ตรงกัน ถ้าจะเริ่มใหม่จริง ๆ
ต้องลบโฟลเดอร์พวกนั้นด้วยมือด้วย (**bash** `rm -rf open-notebook/surreal_data open-notebook/notebook_data` ·
**PowerShell** `Remove-Item -Recurse -Force open-notebook/surreal_data, open-notebook/notebook_data`)

**4. อย่ารัน dev กับ prod พร้อมกัน**

ใช้พอร์ตชุดเดียวกัน (3000/3001/3002/5055) ต้องหยุดตัวหนึ่งก่อนเสมอ
ดูว่าคุยกับตัวไหนอยู่ด้วย `docker ps` — `kmitl_*` คือ prod, `kmitlai_dev_*` คือ dev

**5. `docker ps` ขึ้น `Up` ไม่ได้แปลว่าใช้งานได้**

ตรวจ 3 ชั้นตามข้อ 4 เสมอ

---

## 7. ย้ายข้อมูลข้ามเครื่อง (รวมข้าม Mac ↔ Windows)

โค้ดอยู่ใน git ครบ แต่ **ข้อมูลไม่ได้อยู่ใน git** ถ้าต้องยกข้อมูลไปด้วย
ดูขั้นตอน backup / restore ที่ [SYSTEM-GUIDE.md](SYSTEM-GUIDE.md) §5.5
(สคริปต์ `deploy/export-data.sh` / `deploy/import-data.sh` เป็น bash — บน Windows รันใน Git Bash)

สรุปที่เก็บข้อมูล:

| ข้อมูล | เก็บที่ |
|---|---|
| ผู้ใช้ แต้ม ฟีด ห้อง คลังเอกสาร | docker volume `kmitlai_mariadb_data` |
| notebook / เอกสาร / embedding / ควิซ / roadmap | `open-notebook/surreal_data/` |
| ไฟล์ที่อัปโหลด | `open-notebook/notebook_data/` |
| ข้อมูลแอป roadmap | `ai-roadmap-generator/pb_data/` |

โฟลเดอร์ bind mount ทั้งสามคัดลอกข้ามระบบปฏิบัติการได้ตรง ๆ (เป็นไฟล์ที่คอนเทนเนอร์ Linux
เขียน ไม่ขึ้นกับ OS ของเครื่อง) ส่วน volume ของ MariaDB ต้องผ่าน dump ของสคริปต์ export เท่านั้น
