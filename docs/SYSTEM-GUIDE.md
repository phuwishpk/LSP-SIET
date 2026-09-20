# คู่มือโครงสร้างระบบ — KMITL AI Workspace / SIET Space

> เอกสารนี้อธิบายว่าระบบประกอบด้วยอะไรบ้าง ใช้เทคโนโลยีอะไร รันอย่างไร
> เนื้อหาในระบบถูกจัดโครงสร้างแบบไหน และผู้ใช้แต่ละบทบาททำอะไรได้บ้าง
>
> อัปเดตล่าสุด: 15 กันยายน 2026

## สารบัญ

1. [ระบบนี้คืออะไร](#1-ระบบนี้คืออะไร)
2. [สถาปัตยกรรมภาพรวม](#2-สถาปัตยกรรมภาพรวม)
3. [Tech stack](#3-tech-stack)
4. [โครงสร้างโฟลเดอร์](#4-โครงสร้างโฟลเดอร์)
5. [การติดตั้ง ย้ายเครื่อง และวิธีรันระบบ](#5-การติดตั้งและวิธีรันระบบ)
6. [โครงสร้างเนื้อหา](#6-โครงสร้างเนื้อหา)
7. [บทบาทผู้ใช้ (Roles) โดยละเอียด](#7-บทบาทผู้ใช้-roles-โดยละเอียด)
8. [ระบบแต้ม (Token Economy)](#8-ระบบแต้ม-token-economy)
9. [ระบบกันสแปม](#9-ระบบกันสแปม)
10. [แผนผัง API](#10-แผนผัง-api)
11. [ฐานข้อมูล](#11-ฐานข้อมูล)
12. [จะแก้อะไร ต้องแก้ไฟล์ไหน](#12-จะแก้อะไร-ต้องแก้ไฟล์ไหน)
13. [การทดสอบ](#13-การทดสอบ)
14. [เช็กลิสต์ก่อนขึ้น production](#14-เช็กลิสต์ก่อนขึ้น-production)

---

## 1. ระบบนี้คืออะไร

**KMITL AI Workspace** คือการรวม 3 โปรเจกต์เข้าเป็นระบบเดียวด้วย Docker Compose ชุดเดียว
โดยมี **SIET Space** เป็นหน้าชุมชนแบบ Facebook สำหรับนักศึกษา KMITL ที่วางทับอยู่บน
open-notebook อีกที

| ส่วน | ทำหน้าที่ |
|---|---|
| **open-notebook** | หัวใจของระบบ — FastAPI + Next.js + SurrealDB + MariaDB เก็บผู้ใช้ แต้ม ฟีด คลังความรู้ และเป็นตัวกลางเรียก AI ให้ทุกแอป |
| **My-ai-quiz** | แอปสร้างข้อสอบ/ควิซด้วย AI (แยกหน้าเป็นของตัวเอง) |
| **ai-roadmap-generator** | แอปสร้างแผนการเรียน (roadmap) ด้วย AI (แยกหน้าเป็นของตัวเอง) |

แนวคิดหลัก 3 ข้อ:

1. **AI มีที่เดียว** — `open_notebook_api` เป็นแหล่งเรียกโมเดลเพียงจุดเดียว
   อีกสองแอปยิงเข้ามาผ่าน `OPEN_NOTEBOOK_API_URL` ไม่ถือ API key เอง
2. **ทุกการใช้ AI มีต้นทุนเป็นแต้ม** — นักศึกษาได้แต้มคืนจากการมีส่วนร่วมในชุมชน
   ไม่ใช่จากการเติมเงิน
3. **สิทธิ์บังคับที่ API ไม่ใช่ที่หน้าจอ** — หน้าเว็บแค่ซ่อนเมนู แต่ตัวที่ปฏิเสธจริงคือ middleware

---

## 2. สถาปัตยกรรมภาพรวม

### 2.1 มองจากภายนอก (ผู้ใช้เข้าเว็บ)

```
                        ┌──────────────────────────────┐
   Browser  ───────────▶│  Traefik v2.11  :80          │  Basic auth (gate-auth)
                        │  file provider + labels      │  ครอบทุก route
                        └──────┬───────┬───────┬───────┘
                               │       │       │
              PathPrefix(`/`)  │       │       │  PathPrefix(`/quiz`)
                               ▼       │       ▼
                   ┌────────────────┐  │  ┌──────────────────┐
                   │ Next.js UI     │  │  │ My-ai-quiz       │
                   │ (ใน container  │  │  │ Next.js          │
                   │  open_notebook)│  │  └──────────────────┘
                   └────────────────┘  │
                                       │  PathPrefix(`/roadmap`) , `/pb`
                                       ▼
                               ┌──────────────────────┐
                               │ ai-roadmap-generator │
                               │ + PocketBase (/pb)   │
                               └──────────────────────┘
   PathPrefix(`/api`,`/docs`) ────────▶ FastAPI :5055
```

> หมายเหตุ: ตอนนี้ยังเปิด host port ตรง (3000/3001/3002/5055) ไว้ด้วย
> ซึ่ง **ข้าม** basic auth ของ Traefik — ดูข้อ 14

### 2.2 มองจากภายใน (open-notebook 3 ชั้น)

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend — Next.js 16 / React 19 (App Router)               │
│ /community  /admin  /features  /notebooks  /settings ...    │
│ TanStack Query (cache) + Zustand (auth) + Tailwind v4       │
└───────────────────────────┬─────────────────────────────────┘
                            │  REST + JWT (Bearer)
┌───────────────────────────▼─────────────────────────────────┐
│ API — FastAPI (Python 3.11)                                 │
│                                                             │
│  middleware:  RoleAccessMiddleware  →  PasswordAuthMiddleware│
│  routers:     community / admin / google_auth / features /  │
│               notebooks / sources / models / ...            │
│  services:    community/{points,repository,library,         │
│               retrieval,ask,ratelimit,schema}.py            │
└──────┬───────────────────────────┬──────────────────┬───────┘
       │                           │                  │
       ▼                           ▼                  ▼
┌─────────────┐            ┌────────────────┐   ┌──────────┐
│ MariaDB 11  │            │ SurrealDB v2   │   │ Redis 7  │
│ ผู้ใช้/แต้ม/  │            │ notebook,      │   │ cache    │
│ ฟีด/ห้อง/    │            │ source, note,  │   └──────────┘
│ คลังเอกสาร   │            │ embedding,     │
│             │            │ quiz/roadmap   │
└─────────────┘            │ session        │
                           └────────────────┘
```

**จุดที่ต้องเข้าใจ:** ข้อมูลผู้ใช้กับชุมชนอยู่ใน **MariaDB** ส่วนเนื้อหา AI
(เอกสารที่ embed แล้ว, ควิซ, roadmap) อยู่ใน **SurrealDB** ทั้งสองผูกกันด้วย
คอลัมน์ `notebook_id` / `library_notebook_id` ที่เก็บ record id ของ SurrealDB ไว้เป็นข้อความ

### 2.3 ลำดับการทำงานของ middleware

Starlette รัน middleware **ย้อนลำดับการลงทะเบียน** ดังนั้นใน `api/main.py`
ต้องลงทะเบียน `RoleAccessMiddleware` **ก่อน** `PasswordAuthMiddleware`
เพื่อให้ตอนรันจริง auth ทำงานก่อนแล้ว role ค่อยอ่าน `request.state.owner_id` ได้

---

## 3. Tech stack

### Backend

| รายการ | เวอร์ชัน / ไลบรารี | ใช้ทำอะไร |
|---|---|---|
| ภาษา | Python 3.11–3.12 | — |
| Web framework | FastAPI ≥0.104 + Uvicorn | REST API ที่ `:5055` |
| Validation | Pydantic v2 | schema ของ request/response |
| ฐานข้อมูลผู้ใช้ | MariaDB 11 ผ่าน SQLAlchemy 2 (async) + aiomysql | users, points, feed |
| ฐานข้อมูลเนื้อหา | SurrealDB v2 (async driver) | notebook/source/note + vector embedding |
| Cache | Redis 7 | ผลการค้นหา, context, embedding |
| Auth | PyJWT (HS256) + Google OAuth 2.0 | JWT ของ workspace + SSO |
| AI provider layer | Esperanto ≥2.20 | คุยกับ OpenAI/Gemini/Anthropic/Ollama ฯลฯ ด้วย interface เดียว |
| Workflow | LangGraph ≥1.0 | chat / ask / transformation graph (ของเดิม) |
| Logging | Loguru | log ทั้งระบบ |

### Frontend (open-notebook)

| รายการ | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| Next.js | 16 (App Router) | หน้าเว็บทั้งหมด |
| React | 19 | — |
| TypeScript | 5 | — |
| Tailwind CSS | v4 + shadcn/ui (Radix) | UI |
| TanStack Query | 5 | ดึง/แคชข้อมูลจาก API |
| Zustand | 5 | เก็บ auth ใน `localStorage` key `auth-storage` |
| axios | 1.x | HTTP client + interceptor แนบ Bearer token |
| sonner | 2.x | toast แจ้งเตือน |
| lucide-react | 0.525 | ไอคอน |

### แอปแยก

| แอป | Stack | หมายเหตุ |
|---|---|---|
| My-ai-quiz | Next.js 16 / React 19 | มี fallback model ของตัวเอง (`QUIZ_FALLBACK_MODEL`) |
| ai-roadmap-generator | Next.js 13 / React 18 + PocketBase | แผนที่สร้างตอนล็อกอินถูกเก็บใน open-notebook ไม่ใช่ PocketBase |

### Infrastructure

Docker Compose, Traefik v2.11 (reverse proxy + basic auth), supervisord ใน container
`open_notebook_api` ที่คุม 3 process: `api` (uvicorn), `worker` (surreal-commands)
และ `frontend` (Next.js standalone)

> ในไฟล์ยังมี `[program:streamlit]` แต่ปิด `autostart` ไว้แล้ว เพราะ `streamlit_app.py`
> ไม่ได้อยู่ใน repo นี้ — ก่อนหน้านี้มัน exit 127 แล้ววนรีสตาร์ท 8 ครั้งทุกครั้งที่บูต

---

## 4. โครงสร้างโฟลเดอร์

```
kmitlAI/
├── docker-compose.yml           ← นิยาม service ทั้งหมด (production)
├── docker-compose-dev.yml       ← stack สำหรับ dev (hot reload)
├── Makefile                     ← make up / down / logs / ps ...
├── .env / .env.example          ← ค่า config ทั้งหมด
├── docker/
│   ├── open-notebook/           ← Dockerfile + supervisord.conf
│   └── traefik/                 ← traefik.yml + dynamic/all.yml (router, basic auth)
│
├── open-notebook/               ← แอปหลัก
│   ├── api/
│   │   ├── main.py              ← ลงทะเบียน router, middleware, seed ข้อมูลเริ่มต้น
│   │   ├── auth_jwt.py          ← get_current_user (ปฏิเสธบัญชีที่ถูกระงับ)
│   │   ├── auth_roles.py        ← RoleAccessMiddleware (RBAC ตาม prefix)
│   │   └── routers/
│   │       ├── community.py     ← ฟีด ห้อง โพสต์ คลังความรู้ RAG (ไฟล์ใหญ่สุด)
│   │       ├── admin.py         ← คอนโซลผู้ดูแล
│   │       ├── google_auth.py   ← SSO /auth/google/{start,exchange}
│   │       ├── features.py      ← สร้างควิซ/roadmap (หักแต้ม)
│   │       └── ... (notebooks, sources, models, settings ...)
│   ├── open_notebook/
│   │   ├── community/
│   │   │   ├── schema.py        ← DDL ของ MariaDB (idempotent รันทุกครั้งที่ API start)
│   │   │   ├── repository.py    ← SQL ของฟีด/ห้อง/คอมเมนต์/รีแอ็กชัน
│   │   │   ├── points.py        ← ราคา โบนัส เพดานรายวัน กระเป๋าแต้ม
│   │   │   ├── library.py       ← คลังความรู้ → สร้าง Source + notebook
│   │   │   ├── retrieval.py     ← ค้น vector เฉพาะ notebook (เขียนเอง)
│   │   │   ├── ask.py           ← KMITL RAG AI
│   │   │   └── ratelimit.py     ← กันสแปม (cooldown + โควตา + ลายนิ้วมือเนื้อหา)
│   │   ├── domain/user.py       ← โมเดล User + query MariaDB
│   │   └── database/migrations/ ← migration ของ SurrealDB
│   └── frontend/src/
│       ├── app/(dashboard)/community/page.tsx   ← หน้า 3 คอลัมน์
│       ├── app/(dashboard)/community/ask/page.tsx ← หน้าเต็มของ KMITL RAG AI
│       ├── app/(dashboard)/admin/page.tsx       ← คอนโซลผู้ดูแล
│       ├── app/(dashboard)/teacher/page.tsx     ← คอนโซลอาจารย์
│       ├── components/community/                ← 14 คอมโพเนนต์ (ดูข้อ 12)
│       └── lib/{api,hooks,stores,utils}/        ← เรียก API + state
│
├── My-ai-quiz/                  ← Next.js (มี Dockerfile อย่างเดียว)
├── ai-roadmap-generator/        ← Next.js + PocketBase
└── docs/SYSTEM-GUIDE.md         ← เอกสารนี้
```

---

## 5. การติดตั้งและวิธีรันระบบ

### 5.1 ความต้องการของเครื่อง

| รายการ | ขั้นต่ำ | หมายเหตุ |
|---|---|---|
| Docker | Docker Desktop หรือ Docker Engine ที่มี **compose v2** | ตรวจด้วย `docker compose version` (ต้องขึ้น `v2.x`) |
| RAM | 8 GB | ระบบรัน 8 container พร้อมกัน — 16 GB จะลื่นกว่ามาก |
| พื้นที่ว่าง | ~15 GB | image ของ open-notebook อย่างเดียว ~4.2 GB |
| git | มี | ใช้ clone โปรเจกต์ |
| อินเทอร์เน็ต | ต้องมี | ตอน build และตอนเรียกโมเดล AI |
| ระบบปฏิบัติการ | macOS / Linux / Windows (ผ่าน WSL2) | — |

### 5.2 ติดตั้งครั้งแรก (ทีละขั้น)

**ขั้นที่ 1 — ตรวจว่ามี Docker พร้อมใช้**

```bash
docker --version
docker compose version      # ต้องเป็น v2 ขึ้นไป
```

**ขั้นที่ 2 — ดาวน์โหลดโปรเจกต์**

ทั้ง 3 แอปอยู่ใน repo เดียวกัน ไม่ต้อง clone แยก ไม่มี submodule

```bash
git clone https://github.com/phuwishpk/LSP-SIET.git kmitlAI
cd kmitlAI
```

**ขั้นที่ 3 — สร้างไฟล์ `.env`**

```bash
cp .env.example .env
```

(ถ้าลืมขั้นนี้ `make up` จะ copy ให้เองอัตโนมัติ แต่จะได้ค่าตัวอย่างล้วน ๆ)

**ขั้นที่ 4 — แก้ `.env` อย่างน้อย 3 บรรทัด**

| ตัวแปร | ต้องใส่อะไร | ทำไมต้องแก้ |
|---|---|---|
| `OPEN_NOTEBOOK_ENCRYPTION_KEY` | ข้อความสุ่มยาว ≥16 ตัวอักษร | ใช้เข้ารหัส API key **และเป็นกุญแจเซ็น JWT เมื่อ `JWT_SECRET` ว่าง** ถ้าปล่อยค่าตัวอย่างไว้ = ใครก็ปลอม token ได้ |
| `GOOGLE_GENERATIVE_AI_API_KEY` *หรือ* `OPENAI_API_KEY` | API key ของผู้ให้บริการที่จะใช้ | ไม่มีคีย์ = สร้างควิซ/roadmap/ถาม RAG ไม่ได้ |
| `GOOGLE_OAUTH_MOCK` | `1` ตอนพัฒนา / `0` ตอนใช้จริง | `1` = ล็อกอิน Google แบบจำลอง ไม่ต้องตั้ง OAuth client |

สร้างค่าสุ่มสำหรับ secret:

```bash
openssl rand -hex 32
```

> ถ้าจะใช้ Google SSO ของจริง ให้ใส่ `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
> แล้วไปลงทะเบียน `http://localhost:3000/auth/google/callback` เป็น
> Authorised redirect URI ใน Google Cloud Console ด้วย

**ขั้นที่ 5 — build และ start**

```bash
make up
```

ครั้งแรกใช้เวลา **ประมาณ 10–20 นาที** (ต้อง `apt-get install` และ build Next.js
ทั้ง 3 แอป) ครั้งต่อ ๆ ไปจะเร็วเพราะมี cache แล้ว

**ขั้นที่ 6 — รอให้ API พร้อม**

```bash
until curl -sf http://localhost:5055/api/auth/status >/dev/null; do sleep 3; done; echo "API พร้อมแล้ว"
```

ตอน API start จะทำ 2 อย่างอัตโนมัติ: สร้าง/อัปเดตตาราง MariaDB ทั้งหมด
และรัน migration ของ SurrealDB — ไม่ต้องรันคำสั่ง migrate เอง

**ขั้นที่ 7 — เข้าใช้งานครั้งแรก**

เปิด <http://localhost:3000> แล้วล็อกอินด้วย `admin1` / `admin1`

> ถ้าเข้าทาง <http://localhost/> (ผ่าน Traefik) เบราว์เซอร์จะถาม basic auth ก่อน
> ค่าเริ่มต้นคือ `admin` / `123` — คนละชั้นกับการล็อกอินของเว็บ

### 5.3 ตั้งค่าโมเดล AI (ขั้นตอนที่ห้ามข้าม)

ติดตั้งเสร็จแล้วระบบจะยังตอบ AI ไม่ได้จนกว่าจะผูกโมเดล ทำครั้งเดียวโดยบัญชี **admin**

1. ล็อกอิน `admin1` → เมนูซ้าย **Models** (หรือเปิด <http://localhost:3000/settings/api-keys>)
2. กด **Add credential** เลือกผู้ให้บริการ (เช่น Google/Gemini หรือ OpenAI) แล้ววาง API key
3. กด **Test** ให้ขึ้นว่าเชื่อมต่อได้ → กด **Discover models** → เลือกโมเดลที่จะใช้ → **Register**
4. ตั้งค่าโมเดลเริ่มต้น อย่างน้อย 2 ช่อง:

| ช่อง | ใช้ทำอะไร | ไม่ตั้งแล้วเป็นอย่างไร |
|---|---|---|
| **Default chat model** | ตอบ RAG, สร้างควิซ, สร้าง roadmap | ฟีเจอร์ AI ทั้งหมดใช้ไม่ได้ |
| **Default embedding model** | แปลงเอกสารในคลังความรู้เป็นเวกเตอร์ | อัปโหลดเอกสารได้แต่ค้นไม่เจอ RAG ตอบว่าไม่มีข้อมูล |

API key ที่กรอกจะถูกเข้ารหัสด้วย `OPEN_NOTEBOOK_ENCRYPTION_KEY` ก่อนเก็บลง SurrealDB
(คีย์ใน `.env` เป็นเพียง fallback)

### 5.4 ตรวจว่าติดตั้งสำเร็จ

```bash
make ps                                                     # ควรเห็นทุก service เป็น Up
curl -o /dev/null -w 'frontend %{http_code}
' http://localhost:3000/community   # 200
curl -o /dev/null -w 'api      %{http_code}
' http://localhost:5055/api/auth/status  # 200
```

เช็กลิสต์ในเว็บ:

- [ ] ล็อกอิน `admin1` ได้ และเห็นเมนู "จัดการระบบ"
- [ ] ล็อกอิน `student1` ได้ และเห็น **เฉพาะ** หน้าชุมชน
- [ ] หน้า `/community` แสดงห้องวิชา CS101–CS302 (ข้อมูลตัวอย่างที่ seed ให้)
- [ ] กระเป๋าแต้มมุมขวาบนขึ้น 20 แต้ม สำหรับผู้ใช้ใหม่
- [ ] ถาม KMITL RAG AI แล้วได้คำตอบ (ถ้าเพิ่งติดตั้งจะตอบว่ายังไม่มีเอกสาร — ถือว่าผ่าน)

### 5.5 ย้ายไปรันเครื่องอื่น

**โค้ดอยู่ใน git ครบแล้ว** ทั้ง 3 แอปอยู่ใน repo เดียว ไม่มี submodule
เครื่องใหม่แค่ `git clone` → `cp .env.example .env` → แก้ 3 บรรทัด → `make up`

**แต่ข้อมูลไม่ได้อยู่ใน git** — ถ้าต้องการยกข้อมูลไปด้วยต้องคัดลอกเอง

| ข้อมูล | เก็บที่ | ขนาดตัวอย่าง |
|---|---|---|
| ผู้ใช้ แต้ม ฟีด ห้อง คลังเอกสาร | docker volume `kmitlai_mariadb_data` | ~90 KB (dump) |
| notebook / source / embedding / ควิซ / roadmap | `open-notebook/surreal_data/` | ~56 MB |
| ไฟล์ที่อัปโหลด | `open-notebook/notebook_data/` | ~168 MB |
| ข้อมูล PocketBase ของแอป roadmap | `ai-roadmap-generator/pb_data/` | ~9 MB |
| แคช (ไม่ต้องย้าย) | `open-notebook/redis_data/` | — |

**สำรองข้อมูล (รันที่เครื่องเดิม)**

```bash
mkdir -p backup
# MariaDB: dump เป็น SQL
docker exec kmitl_mariadb sh -c \
  'mariadb-dump -uworkspace -p"$MARIADB_PASSWORD" --single-transaction workspace' \
  > backup/workspace.sql
# ที่เหลือเป็นโฟลเดอร์ ปิด stack ก่อนคัดลอกเพื่อให้ไฟล์นิ่ง
make down
tar czf backup/data.tar.gz \
  open-notebook/surreal_data open-notebook/notebook_data ai-roadmap-generator/pb_data
```

**กู้คืน (ที่เครื่องใหม่ หลัง `make up` ครั้งแรก)**

```bash
tar xzf backup/data.tar.gz            # วางทับโฟลเดอร์ที่ docker สร้างไว้
docker compose -p kmitlai restart
docker exec -i kmitl_mariadb sh -c \
  'mariadb -uworkspace -p"$MARIADB_PASSWORD" workspace' < backup/workspace.sql
docker compose -p kmitlai restart open_notebook_api
```

> ถ้าเครื่องใหม่ตั้ง `OPEN_NOTEBOOK_ENCRYPTION_KEY` ไม่ตรงกับเครื่องเดิม
> **API key ของผู้ให้บริการ AI ที่เก็บไว้จะถอดรหัสไม่ออก** ต้องกรอกใหม่ในหน้า Models
> และ token ที่ผู้ใช้ถืออยู่จะใช้ไม่ได้ (ต้องล็อกอินใหม่) เพราะกุญแจนี้ใช้เซ็น JWT ด้วย

**ไม่ต้องย้าย**: image ที่ build ไว้ — เครื่องใหม่ build เองจาก source ได้เลย
และ build ตาม architecture ของเครื่องนั้น (Apple Silicon / x86 ใช้ได้ทั้งคู่)

### 5.6 ปัญหาที่เจอบ่อยตอนติดตั้ง

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `bind: address already in use` | พอร์ต 3000/3001/3002/5055/80 ถูกใช้อยู่ | หา process ด้วย `lsof -i :3000` แล้วปิด หรือแก้ `ports:` ใน `docker-compose.yml` |
| `make up` ค้างนานมาก | ครั้งแรกต้อง `apt-get install` + build Next.js 3 แอป | ปกติ รอ 10–20 นาที ดูความคืบหน้าด้วย `make logs` |
| เปิด `localhost:8502` ไม่ขึ้น | พอร์ตนี้อยู่ **ในคอนเทนเนอร์** ไม่ได้ publish ออกมา | ใช้ <http://localhost:3000> |
| ล็อกอินแล้วเด้งออกตลอด | `OPEN_NOTEBOOK_ENCRYPTION_KEY` เปลี่ยนหลัง build | token เก่าใช้ไม่ได้ ให้ล็อกเอาต์แล้วล็อกอินใหม่ |
| AI ตอบว่าไม่มีโมเดล | ยังไม่ได้ทำขั้น 5.3 | ไปตั้ง default chat model |
| อัปโหลดเอกสารแล้วสถานะค้าง `failed` | ยังไม่ได้ตั้ง default **embedding** model | ตั้งแล้วกด retry ที่เอกสารนั้น |
| API ตอบ `Temporary failure in name resolution` | คอนเทนเนอร์ไม่ได้ต่อ network หลัง `docker compose down` | `docker compose -p kmitlai up -d --force-recreate` (`docker restart` ไม่ผูก network กลับ) |
| ไม่แน่ใจว่าคุยกับ stack ไหนอยู่ | dev กับ prod ใช้พอร์ตชุดเดียวกัน | `docker ps` ดูชื่อคอนเทนเนอร์ — `kmitl_*` คือ prod, `kmitlai_dev_*` คือ dev |

### 5.7 รันแบบ production (รันประจำวัน)

```bash
cd ~/kmitlAI
make up          # copy .env ถ้ายังไม่มี → build ทุก image → start แบบ detached
```

เปิดใช้งาน:

| URL | คืออะไร |
|---|---|
| <http://localhost:3000> | **หน้าเว็บหลัก** — ล็อกอิน / `/community` / `/admin` |
| <http://localhost:5055/docs> | Swagger ของ API |
| <http://localhost:3001> | My AI Quiz |
| <http://localhost:3002> | AI Roadmap Generator |
| <http://localhost/pb/_/> | PocketBase admin (มีเฉพาะผ่าน Traefik — พอร์ต 8090 ไม่ได้เปิดออกมาที่เครื่อง) |
| <http://localhost/> | ผ่าน Traefik (ถาม user/password ก่อน) |

### 5.8 คำสั่งที่ใช้บ่อย

```bash
make ps            # ดูว่า service ไหนรันอยู่
make logs          # ตาม log ทุก service
make restart       # รีสตาร์ททั้ง stack
make down          # หยุด (ข้อมูลยังอยู่)
make nuke          # หยุด + ลบ volume (ข้อมูลหายหมด)
make rebuild       # build ใหม่โดยไม่ใช้ cache
```

แก้เฉพาะ backend/frontend ของ open-notebook แล้วอยากให้มีผล:

```bash
docker compose -p kmitlai build open_notebook_api
docker compose -p kmitlai up -d --force-recreate open_notebook_api
```

### 5.9 รันแบบ dev (hot reload)

```bash
make up-dev        # docker-compose-dev.yml, project name kmitlai_dev
```

⚠️ **dev กับ prod ใช้ host port ชุดเดียวกัน (3000/5055/3001/3002)** ต้อง `make down`
ตัวหนึ่งก่อนเสมอ ไม่งั้นจะสับสนว่ากำลังคุยกับ stack ไหนอยู่ (เคยเสียเวลากับเรื่องนี้มาแล้ว)
dev mount ซอร์สเข้าไปในคอนเทนเนอร์และรัน `uvicorn --reload`

หลัง `docker compose down` แล้ว network อาจไม่ถูกผูกกลับ ให้ใช้
`up -d --force-recreate` ไม่ใช่ `docker restart`

### 5.10 บัญชีสำหรับทดสอบ

| ชื่อผู้ใช้ | รหัสผ่าน | บทบาท |
|---|---|---|
| `admin1` | `admin1` | ผู้ดูแลระบบ |
| `student1` … `student5` | เหมือนชื่อผู้ใช้ | นักศึกษา |

ล็อกอินด้วย Google ให้กด "เข้าสู่ระบบด้วย KMITL Google" — ตอนนี้ `GOOGLE_OAUTH_MOCK=1`
จึงขึ้นหน้าเลือกอีเมลจำลอง (ใส่อีเมลอะไรก็ได้ที่ลงท้าย `@kmitl.ac.th`)

**ทางเข้าระบบมี 3 ทาง**

| ทาง | ได้บทบาท | ใช้เมื่อไหร่ |
|---|---|---|
| Google ของ KMITL | student / teacher / admin ตามอีเมล | ทางหลักของผู้ใช้จริง |
| สมัครสมาชิกเอง (`/register`) | **student เสมอ** | ทดลองระบบ หรือคนที่ยังไม่มีอีเมล KMITL |
| ชื่อผู้ใช้ + รหัสผ่าน (`/login`) | ตามบัญชีที่มีอยู่ | บัญชีผู้ดูแลและบัญชีทดสอบ |

ลิงก์ "สมัครสมาชิก" อยู่บนหน้า `/login` (แสดงเมื่อ `WORKSPACE_DISABLE_REGISTRATION=false`)
สมัครแล้วได้ token ทันที ไม่ต้องล็อกอินซ้ำ และรับ 20 แต้มต้อนรับ

> อาจารย์**สมัครเองไม่ได้** — ต้องเข้าด้วย Google ที่ตัวหน้าอีเมลไม่ใช่รหัส 8 หลัก
> หรือให้ผู้ดูแลเปลี่ยนสิทธิ์ให้ที่ `/admin` (มีผลทันทีกับ token ที่ถืออยู่)

กติกาแปลงอีเมลเป็นบทบาท:

| อีเมล | ได้บทบาท |
|---|---|
| `67030123@kmitl.ac.th` (ตัวหน้า 8 หลัก) | **student** (เก็บรหัสนักศึกษาด้วย) |
| `somchai.su@kmitl.ac.th` (ไม่ใช่ 8 หลัก) | **teacher** |
| อีเมลที่อยู่ใน `WORKSPACE_ADMIN_EMAILS` | **admin** |
| โดเมนอื่นที่ไม่อยู่ใน `GOOGLE_OAUTH_ALLOWED_DOMAINS` | ถูกปฏิเสธ 403 |

### 5.11 ตัวแปรสำคัญใน `.env`

| กลุ่ม | ตัวแปร | ความหมาย |
|---|---|---|
| ความปลอดภัย | `JWT_SECRET` | กุญแจเซ็น JWT — ถ้าว่างจะใช้ `OPEN_NOTEBOOK_ENCRYPTION_KEY` แทน |
| | `OPEN_NOTEBOOK_ENCRYPTION_KEY` | เข้ารหัส credential ของ provider **และเซ็น JWT เมื่อ `JWT_SECRET` ว่าง** — ต้องเปลี่ยนจากค่าตัวอย่าง |
| | `WORKSPACE_DISABLE_REGISTRATION` | ปิดการสมัครเอง (ค่าเริ่มต้น `false` = เปิด) |
| SSO | `GOOGLE_OAUTH_CLIENT_ID/SECRET` | ของจริงจาก Google Cloud Console |
| | `GOOGLE_OAUTH_MOCK` | `1` = โหมดจำลอง (dev เท่านั้น) |
| | `GOOGLE_OAUTH_ALLOWED_DOMAINS` | ค่าเริ่มต้น `kmitl.ac.th` |
| | `WORKSPACE_ADMIN_EMAILS` | รายชื่ออีเมลที่จะได้สิทธิ์ admin |
| แต้ม | `POINTS_*` | ราคา/โบนัส/เพดาน (ดูข้อ 8) |
| กันสแปม | `SPAM_*` | cooldown และโควตา (ดูข้อ 9) |
| กันเดารหัส | `LOGIN_*`, `REGISTER_MAX_PER_IP` | จำนวนครั้งที่ยอมให้ผิด (ดูข้อ 9) |
| CORS | `CORS_ORIGINS` | โดเมนที่เรียก API ตรงได้ ค่าเริ่มต้นคือ localhost ของสแตก |
| ลิงก์แอป | `MY_AI_QUIZ_URL`, `AI_ROADMAP_URL` | อ่านตอน **runtime** ผ่าน `/config` เปลี่ยนโดเมนไม่ต้อง build ใหม่ |

---

## 6. โครงสร้างเนื้อหา

### 6.1 แผนผังความสัมพันธ์

```
users ─┬─< point_transactions       (ประวัติแต้มทุกใบ)
       ├─< posts ─┬─< post_comments
       │          ├─< post_reactions   (like / helpful — 1 คน 1 ครั้ง)
       │          ├─< post_shares      (1 คน 1 ครั้งต่อโพสต์)
       │          ├─< saved_items
       │          └─< quiz_plays       (ใครเล่นควิซจบ → เจ้าของได้แต้มคืน)
       ├─< course_members >─ courses ──< posts
       ├─< library_documents ─────────▶ SurrealDB Source (embedded)
       ├─< rag_sessions               (เซสชัน 5 ข้อความของ RAG)
       └─< notifications
```

### 6.2 ห้อง (rooms) — มี 2 ชนิดในตารางเดียว

แยกด้วยคอลัมน์ `courses.kind`

| | **ห้องวิชา** (`kind='course'`) | **ห้องพูดคุย** (`kind='club'`) |
|---|---|---|
| ใครเปิดได้ | อาจารย์ / ผู้ดูแล | **ทุกคน รวมนักศึกษา** |
| รหัสห้อง | รหัสวิชาจริง เช่น `CS101` | ระบบสร้างให้ `TALK-9F2C1B` (ไม่แสดงผล) |
| คลังความรู้ของห้อง | มี → ใช้เป็นแหล่งอ้างอิงของ RAG | **ไม่มีโดยตั้งใจ** |
| ใครปิดห้องได้ | ผู้ดูแล | คนที่เปิดห้อง หรือผู้ดูแล |
| ไอคอนในเว็บ | `#` | 💬 |

เหตุผลที่ห้องพูดคุยไม่มีคลังความรู้: ถ้ามี นักศึกษาจะอัปโหลดอะไรก็ได้เข้าไป
แล้วให้ AI ใช้ตอบ ซึ่งเลี่ยงการตรวจของอาจารย์ — บล็อกทั้งฝั่งหน้าเว็บและฝั่ง API

**ปิดห้องแล้วโพสต์ไม่หาย** — ระบบตั้ง `posts.course_id = NULL` โพสต์จะย้ายกลับไปฟีดรวม
เพื่อไม่ให้เจ้าของห้องลบงานของคนอื่นได้

ตั้งชื่อห้องซ้ำกับที่มีอยู่ → `409` พร้อม header `X-Existing-Room` ชี้ห้องเดิมให้เข้าร่วมแทน

### 6.3 โพสต์ — มี 5 ชนิด

| `type` | ใครโพสต์ได้ | หน้าตาในฟีด |
|---|---|---|
| `summary` | ทุกคน | สรุปบทเรียน (ได้โบนัสสูงสุด) |
| `question` | ทุกคน | คำถาม/ชวนคุย |
| `quiz` | ทุกคน | การ์ดควิซ **เล่นได้ในฟีดเลย** (`QuizEmbed`) |
| `roadmap` | ทุกคน | การ์ด roadmap กดติดตามได้ (`RoadmapEmbed`) |
| `material` | **อาจารย์/ผู้ดูแลเท่านั้น** | สื่อการสอน แสดงในเมนู "คลังสื่ออาจารย์" |

แต่ละโพสต์แนบไฟล์ได้ (`.pdf .png .jpg .webp .md .txt .docx .pptx .zip` สูงสุด 50 MB)
และมีตัวนับแยก: `like_count`, `helpful_count`, `comment_count`, `share_count`,
`play_count`, `follow_count`, `cashback_earned`

### 6.4 คลังความรู้ (Knowledge Library)

| ใคร | เพิ่มอะไรได้ | ใครเห็น | AI เอาไปใช้ตอนไหน |
|---|---|---|---|
| อาจารย์ / ผู้ดูแล | เอกสารของรายวิชา (`scope=course`) | ทุกคน | RAG / ควิซ / roadmap ของวิชานั้น |
| นักศึกษา | ไฟล์ ลิงก์ หรือข้อความของตัวเอง (`scope=personal`) | เฉพาะตัวเอง | RAG / ควิซ / roadmap ของตัวเอง |

ทุกไฟล์จะถูกดึงข้อความ → สร้างเป็น `Source` ใน SurrealDB → ฝัง embedding
โดยรันเป็น background task ของ FastAPI (ไม่ต้องรอ) แล้วดูสถานะที่
`GET /api/community/library/{id}`

**ขอบเขตการค้น (scope) ของ KMITL RAG AI:**

| scope | ค้นที่ไหน |
|---|---|
| `auto` | คลังส่วนตัว + ทุกวิชาที่ตัวเองเข้าร่วม (อาจารย์เห็นทุกวิชา) |
| `course` | คลังของวิชาเดียวที่เลือก |
| `personal` | เฉพาะไฟล์ของตัวเอง |
| `document` | เฉพาะเอกสารที่เลือก |

ถ้าเลือก scope ชัดเจนแล้วไม่มีเอกสาร ระบบ**จะตอบว่าไม่มีข้อมูล ไม่แอบขยายไปค้นทั้งระบบ**

### 6.5 หน้า `/community` (3 คอลัมน์)

```
┌──────────────────┬──────────────────────────────┬────────────────────┐
│ ซ้าย             │ กลาง                         │ ขวา                │
├──────────────────┼──────────────────────────────┼────────────────────┤
│ ฟีดรวม           │ แถบ "เลือกผลงานขึ้นฟีด"       │ 🤖 KMITL RAG AI    │
│ ยอดนิยม          │ CreatorBox (กล่องเขียนโพสต์)  │    (ถาม/เซสชัน)    │
│ ห้องที่เข้าร่วม   │                              │                    │
│ คลังความรู้       │ PostCard                     │ 🏆 อันดับผู้แชร์    │
│ คลังสื่ออาจารย์   │  ├ ควิซเล่นได้ในการ์ด         │                    │
│ สรุปที่บันทึกไว้   │  ├ roadmap กดติดตาม          │ 🗺️ roadmap ยอดนิยม │
│ กฎชุมชน & แต้ม   │  ├ ไลก์ / helpful / แชร์      │                    │
│                  │  ├ คอมเมนต์ / บันทึก          │                    │
│ ── ห้องวิชา ──   │  └ แก้ไข / ลบ (ของตัวเอง)     │                    │
│ + สร้างห้องวิชา  │                              │                    │
│ ── ห้องพูดคุย ── │                              │                    │
│ + เปิดห้องพูดคุย │                              │                    │
│ ── เครื่องมือ AI │                              │                    │
│ ถาม RAG / Quiz / │                              │                    │
│ Roadmap          │                              │                    │
└──────────────────┴──────────────────────────────┴────────────────────┘
```

**บนมือถือ (จอแคบกว่า 1024px)** คอลัมน์ซ้ายจะย้ายไปอยู่ใน **ลิ้นชักเมนู**
กดปุ่ม ☰ มุมซ้ายบนเพื่อเปิด · เลือกเมนูหรือห้องแล้วลิ้นชักปิดเอง ·
คอลัมน์ขวา (RAG / อันดับ / roadmap ยอดนิยม) ไหลลงไปอยู่ใต้ฟีด
คอมโพเนนต์: `components/ui/sheet.tsx` (สร้างบน Radix Dialog)

> กับดักที่เจอ: Radix ส่ง dialog ซ้อนไปไว้ที่ `document.body` การคลิกในกล่อง
> "สร้างห้อง" จึงถูกนับว่าคลิกนอกลิ้นชัก แล้วลิ้นชักจะปิดตัวเอง พา state ของ
> กล่องนั้นหายไปด้วย — `SheetContent` จึงเช็กก่อนว่าเป้าหมายอยู่ใน floating
> layer อื่นหรือไม่ ถ้าใช่จะไม่ปิด

**หน้าเต็มของ KMITL RAG AI — `/community/ask`**

กล่องทางขวาไว้ถามสั้น ๆ ส่วนหน้าเต็มไว้นั่งอ่านจริงจัง กดเข้าได้จาก
"ถาม KMITL RAG AI" ในเครื่องมือ AI หรือลิงก์ "เปิดหน้าเต็ม" บนกล่อง

| ส่วน | มีอะไร |
|---|---|
| คอลัมน์ซ้าย | เลือกขอบเขต 4 แบบ (ทุกแหล่ง / รายวิชา / ไฟล์ของฉัน / เจาะจงเอกสาร) พร้อมคำอธิบายว่าจะค้นจากที่ไหน |
| | เลือกรูปแบบ: คำถามเดี่ยว หรือเซสชันต่อเนื่อง พร้อมราคาแต้ม และปุ่มล้างบทสนทนา |
| คอลัมน์ขวา | บทสนทนาแบบเต็มจอ, คำถามตัวอย่างให้กดเริ่ม, แหล่งอ้างอิงกดขยายอ่านข้อความต้นฉบับได้ |

บทสนทนาถูกเก็บไว้ใน `localStorage` ของเบราว์เซอร์ (40 ข้อความล่าสุด) ออกจากหน้าแล้วกลับมาไม่หาย
ไม่ได้ส่งขึ้นเซิร์ฟเวอร์ · รองรับลิงก์ตรง `?course=<id>` และ `?doc=<id>`

> หมายเหตุใต้คำตอบมี 3 แบบ: **📚 อ้างอิงจาก …** (เจอในขอบเขตที่เลือก),
> **ℹ️ ไม่พบใน … ตอบจากคลังทั้งหมดแทน** (เกิดเฉพาะโหมด `auto` ที่ยอมให้ขยายขอบเขต)
> และ **⚠️ ไม่พบเอกสารใน …** (ขอบเขตที่เจาะจงไว้ไม่มีเอกสารเลย)

---

## 7. บทบาทผู้ใช้ (Roles) โดยละเอียด

ระบบมี 3 บทบาท จัดลำดับสิทธิ์เป็น **student < teacher < admin**
บังคับที่ `api/auth_roles.py` แบบ *ปิดไว้ก่อน* — router ใหม่ที่ขึ้น prefix เดิมจะถูกล็อกอัตโนมัติ
ถูกปฏิเสธจะได้ `403` พร้อม header `X-Required-Role`

### 7.1 ตารางสรุปสิทธิ์

| ความสามารถ | นักศึกษา | อาจารย์ | ผู้ดูแล |
|---|:---:|:---:|:---:|
| ดูฟีด / โพสต์ / คอมเมนต์ / ไลก์ / แชร์ / บันทึก | ✅ | ✅ | ✅ |
| เล่นควิซของเพื่อน, ติดตาม roadmap ของเพื่อน | ✅ | ✅ | ✅ |
| ใช้ KMITL RAG AI, สร้างควิซ, สร้าง roadmap | ✅ (หักแต้ม) | ✅ (ฟรี) | ✅ (ฟรี) |
| อัปโหลดไฟล์เข้าคลัง **ส่วนตัว** | ✅ | ✅ | ✅ |
| **เปิดห้องพูดคุย** และปิดห้องที่ตัวเองเปิด | ✅ | ✅ | ✅ |
| สร้าง **ห้องวิชา** | ❌ | ✅ | ✅ |
| แก้ไข/ปิดห้องที่ **ตัวเองสร้าง** | ✅ | ✅ | ✅ |
| คอนโซลอาจารย์ `/teacher` (ห้อง เอกสาร ผลควิซ สื่อการสอน) | ❌ | ✅ | ✅ |
| อัปโหลดเข้า **คลังความรู้ของวิชา** | ❌ | ✅ | ✅ |
| โพสต์ประเภท `material` (สื่อการสอน) | ❌ | ✅ | ✅ |
| เข้าส่วน Open Notebook (notebooks, sources, notes, chat, search, podcasts, transformations) | ❌ | ✅ | ✅ |
| ตั้งค่าโมเดล AI / API credential / settings | ❌ | ❌ | ✅ |
| คอนโซลผู้ดูแล `/admin` | ❌ | ❌ | ✅ |
| ลบโพสต์ของคนอื่น | ❌ | ❌ | ✅ |
| แก้ไข/ปิดห้องของคนอื่น | ❌ | ❌ | ✅ |
| ถูกหักแต้ม | ✅ | ❌ | ❌ |

### 7.2 นักศึกษา (student)

**เห็นอะไร:** เฉพาะ `/community` และหน้าย่อยของมัน — เมนู Open Notebook, Settings,
Models ถูกซ่อนทั้งหมด (สำคัญ: `CommandPalette` เรียก `/api/notebooks` และ
`SetupBanner` เรียก `/api/credentials` จึงต้องซ่อนสองตัวนี้ด้วย ไม่งั้นหน้า community จะ 403)

**ทำอะไรได้ตามปกติ:**

1. ล็อกอิน Google ครั้งแรก → ได้ **20 แต้ม** ต้อนรับ
2. เข้าร่วมห้องวิชาเองได้ทันที (ไม่ต้องรออนุมัติ)
3. เปิด **ห้องพูดคุย** ของตัวเอง เช่น "ติวเลข 1 ก่อนสอบ" — จำกัด 1 ห้อง/นาที, 2 ห้อง/ชม., 5 ห้อง/วัน
4. โพสต์สรุป/คำถาม แนบไฟล์ แชร์ควิซหรือ roadmap ที่ตัวเองทำขึ้นฟีด
5. อัปโหลดชีท/ลิงก์เข้าคลัง **ส่วนตัว** แล้วให้ AI อ่านเฉพาะของตัวเอง
6. ใช้ AI โดยเสียแต้ม แล้วหาแต้มคืนจากการโพสต์/มีคนไลก์/มีคนแชร์

**ทำไม่ได้:** สร้างห้องวิชา, เพิ่มเนื้อหาเข้าคลังของวิชา, โพสต์สื่อการสอน,
เข้าหลังบ้าน Open Notebook, แก้ค่าโมเดล

### 7.3 อาจารย์ (teacher)

**หน้าหลักของอาจารย์: `/teacher`** (เมนู "จัดการการสอน") รวม 4 แท็บ

| แท็บ | ทำอะไรได้ |
|---|---|
| ห้องของฉัน | ห้องที่ตัวเองสร้าง พร้อมจำนวนสมาชิก/โพสต์/เอกสาร · **แก้ชื่อ รหัส คำอธิบาย และปิดห้องได้เอง** |
| เอกสารแยกตามวิชา | เอกสารในคลังของแต่ละวิชา พร้อมสถานะ embed และทางลัดไปเพิ่มเนื้อหา |
| ผลการเล่นควิซ | ใครเล่นควิซในห้องของเรา ได้กี่คะแนน กี่ % เฉลี่ยเท่าไร กรองตามวิชาได้ |
| สื่อการสอนของฉัน | โพสต์ชนิด `material` ที่ตัวเองโพสต์ พร้อมยอดไลก์/คอมเมนต์ |

การ์ดสรุปด้านบน: ห้องวิชาของฉัน · สมาชิกรวม · เอกสารในคลัง · โพสต์ในห้องของฉัน

**ได้เพิ่มจากนักศึกษา:**

1. **สร้างห้องวิชา** พร้อมรหัสวิชาจริง — นักศึกษาจะเห็นในแถบซ้ายและกดเข้าร่วมได้เอง
   และ **แก้ไข/ปิดห้องที่ตัวเองสร้างได้** (ห้องที่คนอื่นสร้างต้องให้แอดมินจัดการ)
2. **เพิ่มเนื้อหาเข้าคลังของวิชา** (PDF / ลิงก์ / ข้อความ) → กลายเป็นแหล่งอ้างอิงที่
   KMITL RAG AI, AI Quiz และ AI Roadmap ของวิชานั้นใช้ตอบ
3. โพสต์ `material` ซึ่งไปรวมในเมนู "คลังสื่ออาจารย์"
4. เข้าส่วน Open Notebook เต็มรูปแบบ (notebook, source, note, chat, search, podcast, transformation)
5. **ไม่ถูกหักแต้ม** และได้โควตากันสแปม ×4 เท่าของนักศึกษา (`SPAM_STAFF_MULTIPLIER`)
   เพราะการอัปโหลดสื่อทั้งเทอมรวดเดียวเป็นเรื่องปกติ

**ทำไม่ได้:** แก้บทบาทผู้ใช้, เติม/หักแต้ม, รีเซ็ตรหัสผ่าน, ตั้งค่าโมเดล AI,
ลบโพสต์ของคนอื่น, จัดการห้องที่คนอื่นสร้าง

### 7.4 ผู้ดูแลระบบ (admin)

**ได้เพิ่มจากอาจารย์ — คอนโซลที่ `/admin`** แบ่งเป็น 6 แท็บ

| แท็บ | ทำอะไรได้ |
|---|---|
| **ภาพรวม** | การ์ดสถิติ 5 ใบ + **สถานะระบบ**: ตรวจ MariaDB / SurrealDB / Redis / โมเดล AI เริ่มต้น พร้อมนับเอกสารที่ embed ล้มเหลว โพสต์ที่ซ่อนไว้ และห้องที่ไม่มีเจ้าของ |
| **ผู้ใช้** | ค้น/กรอง · เปลี่ยนบทบาท · เติม-หักแต้ม (`admin_grant`/`admin_deduct`) · รีเซ็ตรหัสผ่าน · ระงับ-คืนสิทธิ์ · **ลบบัญชีถาวร** ทีละคนหรือติ๊กเลือกหลายคน |
| **เนื้อหา** | โพสต์ทุกอันในระบบ ค้น/กรองตามชนิด · ซ่อนโพสต์ที่ผิดกฎ · ดูรายการที่ซ่อนไว้และ **กู้คืนได้** |
| **ห้อง** | ห้องวิชาและห้องพูดคุยทุกห้อง พร้อมเจ้าของ สมาชิก โพสต์ เอกสาร และเวลาโพสต์ล่าสุด · ปิดห้องได้จากตาราง |
| **แต้ม** | ledger ทั้งระบบ แยกตามช่วงเวลา/ประเภท · ยอดแจกกับยอดใช้ · อันดับคนใช้แต้มมากสุด |
| **นำเข้า CSV** | สร้างรายวิชาและบัญชีผู้ใช้ทีละหลายรายการ มีปุ่ม "ตรวจก่อน (ไม่บันทึก)" |

นอกจากนี้ยังมีปุ่ม **สร้างบัญชี** บนหัวหน้า — จำเป็นเมื่อปิดการสมัครเอง เพราะ
Google SSO ให้บทบาทตามรูปแบบอีเมลเท่านั้น ถ้าไม่มีปุ่มนี้จะสร้างบัญชีอาจารย์ไม่ได้เลย

**หลักการของการลบ**

| | ระงับบัญชี | ลบบัญชีถาวร |
|---|---|---|
| ใช้เมื่อ | พักการใช้งานชั่วคราว | บัญชีที่ไม่ควรมีอยู่ (ทดสอบ, ซ้ำ) |
| ข้อมูล | อยู่ครบ | แต้ม/ประวัติ/แจ้งเตือน/สมาชิกห้อง ถูกลบ |
| โพสต์ของเขา | ยังแสดง | ถูก**ซ่อน** ไม่ได้ลบทิ้ง |
| ห้องที่เขาเปิด | ยังอยู่ | ยังอยู่ แต่กลายเป็นห้องไม่มีเจ้าของ |
| ตัวนับไลก์/คอมเมนต์ของคนอื่น | คงเดิม | คำนวณใหม่ให้ตรงกับข้อมูลจริง |
| ย้อนกลับ | ได้ | **ไม่ได้** |

นอกจากนี้ยังตั้งค่าโมเดล AI / credential / settings, ลบโพสต์ของใครก็ได้ และแก้ไข/ปิดห้องของใครก็ได้

> `/admin` เน้นเรื่อง **บัญชีผู้ใช้** ส่วนเรื่อง **เนื้อหาการสอน** อยู่ที่ `/teacher`
> ซึ่งแอดมินเข้าได้เหมือนกัน (แต่จะเห็นเฉพาะห้องที่ตัวเองสร้าง)

**ราวกันตก (guard rails)** — ระบบปฏิเสธด้วย `400` เมื่อ:
- ผู้ดูแลพยายามลดบทบาท**ตัวเอง**
- ผู้ดูแลพยายามระงับ**ตัวเอง**
- จะเหลือผู้ดูแลคนสุดท้ายแล้วลดบทบาททิ้ง

### 7.5 การกันหน้าเว็บ (route guard)

ทุกหน้าใต้ `(dashboard)` ผ่าน `app/(dashboard)/layout.tsx` ซึ่งทำ 2 อย่าง:

1. **ยังไม่ล็อกอิน** → เก็บ path ปัจจุบันไว้ใน `sessionStorage` แล้วส่งไป `/login`
   ล็อกอินเสร็จเด้งกลับมาหน้าเดิม
2. **ล็อกอินแล้วแต่สิทธิ์ไม่ถึง** → `canAccessRoute()` ใน `lib/roles.ts` ส่งกลับ `/community`

`STAFF_ROUTES` (student เข้าไม่ได้): `/admin` `/teacher` `/notebooks` `/sources`
`/search` `/podcasts` `/transformations` `/advanced` `/settings`
· `ADMIN_ROUTES`: `/admin` `/settings` `/advanced`

ทั้งหมดนี้เป็นแค่การกันหน้าจอ — ตัวบังคับจริงคือ middleware ฝั่ง API (ข้อ 7.6)

### 7.6 ขอบเขตของ API ตาม prefix

| Prefix | ต้องเป็นอย่างน้อย |
|---|---|
| `/api/community/*`, `/api/features/*`, `/api/users/*`, `/api/auth/*`, `/api/config` | ล็อกอิน (student) |
| `/api/notebooks`, `/api/sources`, `/api/notes`, `/api/insights`, `/api/context`, `/api/transformations`, `/api/podcasts`, `/api/episode-profiles`, `/api/speaker-profiles`, `/api/chat`, `/api/search`, `/api/commands` | teacher |
| `/api/admin`, `/api/credentials`, `/api/settings`, `/api/models`, `/api/embeddings` | admin |

---

## 8. ระบบแต้ม (Token Economy)

### 8.1 จ่ายแต้มเมื่อไหร่

| การใช้งาน | แต้ม |
|---|---|
| KMITL RAG AI — ถาม 1 คำถาม | 1 |
| KMITL RAG AI — เซสชันต่อเนื่อง 5 ข้อความ | 4 |
| สร้าง AI Quiz 1 ชุด | 8 (คืนแต้มถ้าดึงจากแคช) |
| สร้าง AI Roadmap 1 แผน | 15 (คืนแต้มถ้าดึงจากแคช) |
| นำเข้าควิซของเพื่อนเข้าคลังตัวเอง | 1 |
| เล่นควิซของเพื่อนในฟีด / ติดตาม roadmap ของเพื่อน | **ฟรี** (ควิซละ 1 ครั้ง) |

### 8.2 ได้แต้มคืนเมื่อไหร่

| เหตุการณ์ | แต้ม | เพดาน/วัน |
|---|---|---|
| ล็อกอินครั้งแรก | +20 | ครั้งเดียว |
| โพสต์เนื้อหาลงฟีด | +2 | 6 |
| แชร์สรุปบทเรียน | +2 | 6 |
| มีคนกดไลก์โพสต์เรา | +1 | 10 |
| มีคนกด Helpful โพสต์เรา | +1 | 10 |
| มีคนแชร์โพสต์เรา | +2 | 10 |
| แก้ไขโพสต์ของตัวเองให้ดีขึ้น | +1 | 2 |
| เพื่อนเล่นควิซที่เราแชร์จนจบ | +1/คน | 15 ต่อควิซ |

**กติกากันการปั่นแต้ม:**
- ไลก์/แชร์นับ **1 คนต่อ 1 โพสต์** เท่านั้น (ตาราง `post_reactions`, `post_shares`)
- แชร์โพสต์ตัวเอง **ไม่ได้แต้ม** และไม่เพิ่มยอดแชร์
- ทุกใบมีบันทึกใน `point_transactions` พร้อม `balance_after` ตรวจย้อนหลังได้
- อาจารย์และผู้ดูแลไม่ถูกหักและไม่ต้องหาแต้ม

ปรับทุกค่าได้ผ่าน `POINTS_*` ใน `.env`

---

## 9. ระบบกันสแปม

อยู่ใน `open_notebook/community/ratelimit.py` มี 3 ด่าน

**ด่านที่ 1 — cooldown + โควตา** (นับจากตารางเนื้อหาโดยตรง ไม่มีตารางบันทึกเพิ่ม)

| | โพสต์ | คอมเมนต์ | อัปโหลดคลัง | เปิดห้องพูดคุย |
|---|---|---|---|---|
| เว้นระยะขั้นต่ำ | 20 วิ | 5 วิ | 15 วิ | 60 วิ |
| ต่อชั่วโมง | 10 | 30 | 10 | 2 |
| ต่อวัน | 40 | 150 | 30 | 5 |

**ด่านที่ 2 — ลายนิ้วมือเนื้อหา** MD5 ของเนื้อหาเก็บใน `content_hash`
โพสต์/ไฟล์เดิมซ้ำภายใน 24 ชม. → `409` พร้อม `X-Duplicate-Of` ชี้ของเดิม

**ด่านที่ 3 — ความยาวขั้นต่ำ** โพสต์ ≥15 ตัวอักษร, เอกสาร ≥80, ชื่อห้อง ≥3

อาจารย์/ผู้ดูแลได้โควตา ×4 · ถูกจำกัดจะได้ `429` พร้อม `Retry-After`

---

### การป้องกันการเดารหัสผ่าน

ระบบกันสแปมด้านบนนับจากตารางเนื้อหา ซึ่งใช้กับการล็อกอินไม่ได้ (การเดารหัสไม่เขียนอะไรลงฐานข้อมูล)
จึงมีตัวนับแยกอยู่ใน `api/login_guard.py` เก็บใน Redis (รอดการรีสตาร์ท ใช้ร่วมกันหลาย worker)
ถ้า Redis ล่มจะถอยไปนับในหน่วยความจำแทน ไม่ปล่อยผ่าน

| ตัวนับ | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| รหัสผิดต่อ **บัญชี** | 5 ครั้ง / 15 นาที | ด่านหลัก — เปลี่ยน IP หนีไม่ได้ เพราะบัญชีที่กำลังเดาเปลี่ยนไม่ได้ |
| รหัสผิดต่อ **IP** | 100 ครั้ง / 15 นาที | ด่านรอง อ่านจาก `X-Forwarded-For` |
| สมัครสมาชิกต่อ **IP** | 20 ครั้ง / ชั่วโมง | กันสคริปต์สร้างบัญชีรัว |

ถูกจำกัดจะได้ `429` พร้อม `Retry-After` · **ล็อกอินสำเร็จจะล้างตัวนับของบัญชีนั้นทันที**
และ **แอดมินตั้งรหัสผ่านใหม่ = ปลดล็อกให้ด้วย** (ทางออกเมื่อมีคนจงใจกดผิดใส่บัญชีคนอื่น)

> ทำไมค่าต่อ IP ถึงหลวม: มหาวิทยาลัยใช้ NAT นักศึกษาหลายร้อยคนออกเน็ตด้วย IP เดียวกัน
> ถ้าตั้งแน่นจะล็อกทั้งคณะเพราะคนอื่นพิมพ์ผิด · ตั้งเป็น `0` เพื่อปิดตัวนับ IP

### CORS

`CORS_ORIGINS` กำหนดว่าเว็บจากโดเมนไหนเรียก API ตรง ๆ ได้ ค่าเริ่มต้นคือสแตกในเครื่อง
(`localhost:3000/3001/3002` + Traefik ที่ `:80`) — **ไม่ใช่ `*` อีกต่อไป**

หน้าเว็บหลักไม่ได้รับผลกระทบเพราะเรียก `/api` ผ่าน Next.js ของตัวเอง (same-origin)
ที่ต้องใช้ CORS จริง ๆ มีที่เดียวคือแอป roadmap ซึ่งเรียก `/api/users/me` จากหน้าเว็บโดยตรง
ตอนย้ายโดเมนจริงต้องตั้ง `CORS_ORIGINS` เป็นโดเมนนั้น

## 10. แผนผัง API

ทุก endpoint ขึ้นต้นด้วย `/api` · ดูเอกสารสดที่ `http://localhost:5055/docs`

### เข้าสู่ระบบ / สมัครสมาชิก
```
POST /users/login                  · POST /users/register  (201 + token, role=student)
GET  /auth/status                  · GET  /auth/google/start
POST /auth/google/exchange
```

### ชุมชน — โปรไฟล์และห้อง
```
GET    /community/me               · GET    /community/wallet
GET    /community/courses          · POST   /community/courses
PATCH  /community/courses/{id}     · DELETE /community/courses/{id}
POST   /community/courses/{id}/join · DELETE /community/courses/{id}/join
```

### ชุมชน — ฟีด
```
GET    /community/posts            · POST   /community/posts
GET    /community/posts/{id}       · PUT    /community/posts/{id}
DELETE /community/posts/{id}       · GET    /community/posts/{id}/attachment
POST   /community/posts/{id}/reactions
GET    /community/posts/{id}/comments  · POST /community/posts/{id}/comments
POST   /community/posts/{id}/save  · POST   /community/posts/{id}/share
```

### ชุมชน — ควิซ / roadmap ในฟีด
```
POST /community/posts/{id}/quiz/start   · POST /community/posts/{id}/quiz/submit
POST /community/posts/{id}/quiz/import  · POST /community/posts/{id}/roadmap/follow
```

### ชุมชน — คลังความรู้ และ AI
```
GET  /community/library            · POST   /community/library
GET  /community/library/{id}       · DELETE /community/library/{id}
POST /community/library/{id}/retry
POST /community/ask                (scope = auto | course | personal | document)
POST /community/study/quiz         · POST /community/study/roadmap
```

### ชุมชน — อื่น ๆ
```
GET  /community/leaderboard        · GET  /community/roadmaps/popular
GET  /community/notifications      · POST /community/notifications/read
GET  /community/search             · GET  /community/materials
```

### อาจารย์ (teacher / admin)
```
GET  /community/teacher/overview      (ห้องของฉัน + ตัวเลขสรุป)
GET  /community/teacher/quiz-results  (?course_id=&limit=)
```

### ผู้ดูแล (admin เท่านั้น)
```
GET    /admin/overview             · GET    /admin/health
GET    /admin/users                · POST   /admin/users          (สร้างบัญชี)
GET    /admin/users/{id}           · PATCH  /admin/users/{id}
DELETE /admin/users/{id}           · POST   /admin/users/bulk-delete
POST   /admin/users/{id}/points    · POST   /admin/users/{id}/reset-password
GET    /admin/posts                · DELETE /admin/posts/{id}
POST   /admin/posts/{id}/restore   · GET    /admin/courses
GET    /admin/points/log           · POST   /admin/import/courses
POST   /admin/import/users
```

---

## 11. ฐานข้อมูล

> ผัง ER ฉบับเต็มพร้อมคีย์และความสัมพันธ์ทุกเส้น (Mermaid ใช้ได้เลย):
> **[docs/ER-DIAGRAM.md](ER-DIAGRAM.md)**

### MariaDB — ฐาน `workspace` (13 ตาราง)

| ตาราง | เก็บอะไร |
|---|---|
| `users` | บัญชี, บทบาท, อีเมล, `google_sub`, รหัสนักศึกษา, ยอดแต้ม, `disabled`, `library_notebook_id` |
| `point_transactions` | ทุกการเคลื่อนไหวของแต้ม + `balance_after` |
| `courses` | ห้องวิชา/ห้องพูดคุย (`kind`) + `notebook_id` |
| `course_members` | ใครอยู่ห้องไหน |
| `posts` | โพสต์ทั้งหมด + ตัวนับ + `content_hash` + ข้อมูลไฟล์แนบ |
| `post_reactions` | like / helpful (PK: post + user + kind) |
| `post_shares` | การแชร์ (PK: post + user) |
| `post_comments` | คอมเมนต์ |
| `saved_items` | โพสต์ที่บันทึกไว้ |
| `quiz_plays` | การเล่นควิซและคะแนน |
| `library_documents` | เอกสารในคลัง + สถานะการ embed |
| `rag_sessions` | เซสชัน RAG 5 ข้อความ |
| `notifications` | แจ้งเตือน |

Schema เป็น **idempotent DDL** ใน `community/schema.py` รันทุกครั้งที่ API start
เพิ่มคอลัมน์ใหม่ให้เพิ่มที่นี่ **และ** ที่ `_UserRow` + โมเดล `User` ใน
`domain/user.py` ไม่งั้นจะพังตอน runtime

### SurrealDB — namespace/database `open_notebook`

เก็บ `notebook`, `source`, `note`, `insight`, `chat_session`, `credential`,
`quiz_session`, `roadmap_session` พร้อม vector embedding
Migration รันอัตโนมัติตอน API start (`database/migrations/*.surrealql`)

> ข้อควรระวัง: ตาราง SCHEMAFULL ที่มีฟิลด์ `array<object>` ต้องประกาศ `FLEXIBLE`
> ไม่งั้น key ที่ซ้อนอยู่ข้างในจะถูกทิ้งเงียบ ๆ (migration 23 แก้เรื่องนี้ให้
> `quiz_session.questions` และ `roadmap_session.nodes/edges`)

---

## 12. จะแก้อะไร ต้องแก้ไฟล์ไหน

| อยากแก้ | ไฟล์ |
|---|---|
| ราคา/โบนัส/เพดานแต้ม | `open_notebook/community/points.py` (หรือ `POINTS_*` ใน `.env`) |
| กติกากันสแปม | `open_notebook/community/ratelimit.py` (หรือ `SPAM_*`) |
| สิทธิ์ของแต่ละบทบาท | `api/auth_roles.py` (หลังบ้าน) + `frontend/src/lib/roles.ts` (หน้าบ้าน) |
| เพิ่มคอลัมน์ฐานข้อมูล | `community/schema.py` + `domain/user.py` |
| SQL ของฟีด/ห้อง | `community/repository.py` |
| endpoint ของชุมชน | `api/routers/community.py` |
| คอนโซลผู้ดูแล | `api/routers/admin.py` + `frontend/src/app/(dashboard)/admin/page.tsx` |
| แท็บย่อยของคอนโซลผู้ดูแล | `frontend/src/components/admin/{HealthPanel,ModerationPanel,RoomsPanel,PointsLogPanel,ImportPanel,CreateUserDialog}.tsx` |
| คอนโซลอาจารย์ | `frontend/src/app/(dashboard)/teacher/page.tsx` + endpoint `/community/teacher/*` |
| แถบซ้าย (เมนู/ห้อง/เครื่องมือ AI) | `frontend/src/components/community/CourseSidebar.tsx` |
| กล่องเขียนโพสต์ | `components/community/CreatorBox.tsx` |
| การ์ดโพสต์ | `components/community/PostCard.tsx` |
| กล่องถาม RAG ทางขวา | `components/community/AiQuickWidget.tsx` |
| หน้าเต็มของ RAG (`/community/ask`) | `app/(dashboard)/community/ask/page.tsx` |
| คลังความรู้ | `components/community/LibraryPanel.tsx` + `community/library.py` |
| ปุ่ม "เลือกผลงานขึ้นฟีด" | `components/community/ShareMyWorkDialog.tsx` |

คอมโพเนนต์ชุมชนทั้งหมด 14 ตัว: `AiQuickWidget`, `CommunityHeader`, `CourseSidebar`,
`CreatorBox`, `Leaderboard`, `LibraryPanel`, `NotificationsMenu`, `PointsWallet`,
`PostCard`, `QuizEmbed`, `RoadmapEmbed`, `ShareMyWorkDialog`, `ShareToFeedButton`,
`StudyDialog`

---

## 13. การทดสอบ

### ตรวจหน้าเว็บและ API เร็ว ๆ

```bash
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/community   # ควรได้ 200
curl -s http://localhost:5055/api/auth/status | head -c 200
```

### ชุดทดสอบฝั่งหน้าเว็บ

```bash
cd open-notebook/frontend && npx vitest run
```

10 ไฟล์ · ที่เกี่ยวกับ SIET Space คือ `components/community/mobile-nav.test.tsx`
(ปุ่มเมนูและลิ้นชักบนมือถือ) และ `components/layout/AppSidebar.test.tsx`
(เมนูตามบทบาท: นักศึกษาไม่เห็นส่วนของอาจารย์/ผู้ดูแล)

> `lib/locales/index.test.ts` ยังแดงอยู่ 14 เคส — เป็นคีย์แปลของหน้า `/features`
> ที่ไม่ได้ใส่ในภาษาอื่นอีก 13 ภาษา มีมาก่อนงาน SIET Space และไม่กระทบการใช้งาน
> (หน้าชุมชนเป็นภาษาไทยฝังในโค้ด ไม่ได้ผ่าน i18n)

### ชุดทดสอบ API (12 ชุด)

เขียนเป็นสคริปต์ Python ล้วน ยิงเข้า `http://localhost:5055`

| ชุด | ตรวจอะไร |
|---|---|
| `test_auth` | สมัครสมาชิก เข้าสู่ระบบ ชื่อซ้ำ และกำแพงของ `/teacher` |
| `test_throttle` | จำกัดการเดารหัสผ่าน ปลดล็อกด้วยการตั้งรหัสใหม่ และ CORS |
| `test_admin_tools` | สร้าง/ลบบัญชี · moderation · ห้อง · CSV · health · ledger |
| `test_rooms` | ห้องพูดคุย: ใครเปิดได้ ชื่อซ้ำ ลิมิต ปิดห้องแล้วโพสต์รอด |
| `test_teacher` | คอนโซลอาจารย์: สิทธิ์ แก้/ปิดห้องตัวเอง ผลควิซไม่รั่วข้ามอาจารย์ |
| `test_community_flow` | SSO, ฟีด, คอมเมนต์, ไลก์, บันทึก, ควิซ, roadmap, leaderboard |
| `test_library` | คลังความรู้ + RAG แบบจำกัดขอบเขต + สร้างควิซ/roadmap จากคลัง |
| `test_earning` | การได้แต้มคืนและเพดานรายวัน |
| `test_spam` | cooldown, โควตา, เนื้อหาซ้ำ, ความยาวขั้นต่ำ |
| `test_share_once` | 1 คนแชร์ได้ครั้งเดียวต่อโพสต์ |
| `test_roles` | RBAC ครบทั้ง 3 บทบาท |
| `test_admin` | คอนโซลผู้ดูแล + ราวกันตก |

**ข้อควรรู้เวลารันซ้ำ:** ชุดทดสอบเรียก container ตรง ๆ ตามชื่อ
(`kmitl_mariadb`, `kmitl_open_notebook_api`) ถ้าชี้ผิด stack ส่วนล้างข้อมูลจะเงียบไป
แล้วข้ออื่นจะพังแทน · และต้องใช้บัญชี SSO ใหม่ทุกรอบ เพราะเพดานแต้มรายวันติดมากับบัญชี
ทำให้รอบที่สองของวันได้ 0 แต้ม

---

## 14. เช็กลิสต์ก่อนขึ้น production

ยังไม่ได้ทำ — ต้องจัดการก่อนเปิดให้คนนอกใช้

| # | เรื่อง | สถานะตอนนี้ | ต้องทำ |
|---|---|---|---|
| 1 | กุญแจเซ็น JWT เป็นค่าตัวอย่าง | `JWT_SECRET` ว่าง ระบบจึงใช้ `OPEN_NOTEBOOK_ENCRYPTION_KEY` แทน ซึ่งยังเป็นค่า `change-me-...` จาก `.env.example` = ค่าที่ทุกคนบน GitHub เห็น → ปลอม token เป็น admin ได้ | ตั้ง `OPEN_NOTEBOOK_ENCRYPTION_KEY` (และ `JWT_SECRET` ถ้าอยากแยกกุญแจ) เป็นค่าสุ่ม เช่น `openssl rand -hex 32` |
| 2 | Google OAuth โหมดจำลอง | `GOOGLE_OAUTH_MOCK=1` ใครก็สวมเป็นใครก็ได้ | ใส่ client ID/secret จริง แล้วตั้งเป็น `0` |
| 3 | สมัครสมาชิกเองได้ | `WORKSPACE_DISABLE_REGISTRATION` ยังเป็น `false` | ตั้งเป็น `true` ให้เข้าผ่าน Google อย่างเดียว |
| 4 | ไม่มี HTTPS | Traefik เปิดแค่ `:80` | เพิ่ม entrypoint 443 + Let's Encrypt |
| 5 | host port ข้าม Traefik | 3000/3001/3002/5055 เข้าได้ตรงโดยไม่ผ่าน basic auth | ลบ `ports:` ออก ให้เข้าทาง Traefik อย่างเดียว |
| 6 | บัญชีทดลองยังอยู่ | `admin1`, `student1..5` รหัสเดาง่าย | ปิด `WORKSPACE_SEED_ADMIN` และลบบัญชีทิ้ง |
| 7 | รหัสฐานข้อมูลค่าเริ่มต้น | MariaDB / SurrealDB ใช้รหัสจาก `.env.example` | เปลี่ยนทั้งหมด |
| 8 | ~~CORS เปิดกว้าง~~ ✅ | จำกัดเป็น localhost ของสแตกแล้ว | ตอนขึ้นโดเมนจริงตั้ง `CORS_ORIGINS` เป็นโดเมนนั้น |
| 9 | ยังไม่มีแผนสำรองข้อมูล | — | ตั้ง cron dump MariaDB + SurrealDB |
| 10 | ~~เดารหัสผ่านได้ไม่จำกัด~~ ✅ | จำกัด 5 ครั้ง/บัญชี/15 นาทีแล้ว | ปรับค่าได้ด้วย `LOGIN_*` |

**เรื่องโดเมนจริง:** URL ของแอป Quiz/Roadmap อ่านตอน runtime จาก `/config` ของ frontend
ดังนั้นย้ายโดเมนแค่ตั้ง `MY_AI_QUIZ_URL` / `AI_ROADMAP_URL` บน container
`open_notebook_api` แล้วรีสตาร์ท **ไม่ต้อง build frontend ใหม่**
