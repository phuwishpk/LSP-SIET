# platform

ฐานร่วมของ LSP-SIET (พื้นที่เรียนรู้ของ KMITL SIET): แกน Python ที่ทุกส่วนใช้ร่วมกัน และแอป Next.js ตัวหลัก (host)
ส่วนอื่น (`kmitl-rag/`, `community/`, `my-ai-quiz/`, `ai-roadmap/`) เสียบเข้ามาที่นี่

| โฟลเดอร์ | คืออะไร |
|---|---|
| `siet_core/` | ฐานข้อมูล (SurrealDB), โมเดล AI, embedding, ask/chat graphs, pipeline ของ source, `extensions.py` (hook points), `env.py` (ค่า `LSP_SIET_*`) |
| `api/` | FastAPI host (พอร์ต 5055): `main.py`, auth, config, models, credentials, providers, settings |
| `commands/` | งานเบื้องหลังของ surreal-commands (embed, process source) |
| `siet_platform/` | บัญชีและ JWT, สิทธิ์ตามบทบาท, กระเป๋าแต้ม, คิวเรียก AI provider, Redis cache, คลังเอกสาร + การค้นในคลัง, audit log, การแจ้งเตือน, migration track k1–k9 ของ SurrealDB |
| `prompts/` | prompt ของ graphs (ภาษาไทยของแชตอยู่ที่ `siet_platform/prompts`) |
| `frontend/` | แอป Next.js (host, พอร์ต 3000): ชั้นข้อมูลที่ทุกหน้าใช้, auth, เมนู, คอนโซลผู้ดูแลหลัก, ธีม; หน้าของส่วนอื่นเป็น stub ที่สร้างด้วย `make frontend-routes` |
| `tests/`, `tests-platform/` | test ของ core และของ `siet_platform` |

- Python: ใช้ uv project เดียวที่ `pyproject.toml` (ติดตั้งส่วนอื่นเป็น path dependency แบบ editable) · import เป็น `siet_core`, `api`, `commands`, `siet_platform`
- หน้าเว็บ: `@/...` → `frontend/src`
- ส่วนอื่นเสียบเข้า platform ที่ hook points ใน `siet_core/extensions.py` และ `frontend/src/lib/extensions.ts` — ห้าม import แพ็กเกจ SIET เข้า `siet_core`, `api`, `commands`
- ลิขสิทธิ์: [`NOTICE`](NOTICE) คือข้อความ MIT ของโค้ดต้นทางที่โปรเจกต์นี้นำมาใช้

## รัน

จากรากของ repo (ต้องมี Docker):

```bash
make up            # build + start ทั้ง stack (เว็บ :3000, API :5055)
make up-dev        # stack สำหรับ dev (hot reload)
make logs          # ตาม log ทุก service
```

ขั้นตอนติดตั้งเต็มและวิธีไล่หาปัญหา: [`docs/RUNBOOK.md`](../docs/RUNBOOK.md) · ตั้งค่า: `.env.example` ที่รากของ repo และ [`.env.example`](.env.example) ของ platform

## ทดสอบ

```bash
make test-backend    # pytest ของ platform + ทุกส่วน (ปิดการโหลด .env)
make test-frontend   # tsc + vitest ของ host และของทุกส่วน
```

test ที่แดงอยู่ก่อนแล้วอยู่ใน `docs/lsp-siet/known-failures.txt`

โครงสร้างทั้งหมดและกฎการ import: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) · กติกาสำหรับคนและ agent: [`AGENTS.md`](AGENTS.md)
