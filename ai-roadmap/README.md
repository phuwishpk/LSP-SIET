# ai-roadmap

AI Roadmap: สร้างแผนการเรียน/โปรเจกต์เป็นกราฟด้วย AI จากคำอธิบายหรือจากคลังเอกสารของวิชา
เก็บแผนที่สร้างตอนล็อกอินไว้ใน SurrealDB (`roadmap_session`) และให้ผู้ดูแลลบได้

| โฟลเดอร์ | คืออะไร |
|---|---|
| `siet_roadmap/` | ฝั่ง API (Python): service เรียก AI, domain (`RoadmapSession`), `/api/features/roadmap/*`, `DELETE /api/admin/roadmaps/{id}` |
| `frontend/src/` | หน้าเว็บของ host: `@siet/roadmap/...` (`/admin/roadmap`, `/go/roadmap`) |
| `app/` | แอป Next.js แยก + PocketBase (พอร์ต 3002, path `/roadmap`) มี Dockerfile ของตัวเอง เรียก API ผ่าน `LSP_SIET_API_URL` |
| `tests/` | test ของ `siet_roadmap` |

- เสียบเข้า platform ที่ `siet_roadmap/extension.py` และ `frontend/src/extension.tsx`
- import ได้เฉพาะ `siet_core`/`api`/`commands` และ `siet_platform`

โครงสร้างทั้งหมดและกฎ: `docs/ARCHITECTURE.md`
