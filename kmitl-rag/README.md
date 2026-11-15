# kmitl-rag

KMITL RAG AI: ถาม-ตอบจากคลังเอกสาร (1 แต้ม/คำถาม, เซสชัน 5 ข้อความ) พร้อมค้นเว็บเสริม,
ประวัติแชตของแต่ละคน, notebook ask (`/search/ask/notebooks`), global chat (`/chat/global/*`),
API คลัง notebook / source / note และตัวกรองคำตอบที่ทุกหน้าแชตใช้ (ตัดลิงก์ที่ AI แต่ง, ตรวจรหัสวิชา, ปักข้อความที่ตรงคำถาม)

- Python: `kmitl_rag` · หน้าเว็บ: `@siet/kmitl-rag/...` → `frontend/src` (`/community/ask`, `/notebooks`, `/sources`, `/search`, `/admin/rag`)
- เสียบเข้า platform ที่ `kmitl_rag/extension.py` + `hooks.py` และ `frontend/src/extension.tsx`
- import ได้เฉพาะ `siet_core`/`api`/`commands` และ `siet_platform` (ห้าม import `siet_quiz`, `siet_roadmap`, `siet_community`)
- เพิ่มหน้าใหม่: เขียนใน `frontend/src/app/` แล้วรัน `make frontend-routes` (สร้าง stub ใน `platform/frontend/src/app`)

โครงสร้างทั้งหมดและกฎ: `docs/ARCHITECTURE.md`
