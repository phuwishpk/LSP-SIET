# kmitl-rag

KMITL RAG AI: ถาม-ตอบจากคลังเอกสาร (1 แต้ม/คำถาม, เซสชัน 5 ข้อความ) พร้อมค้นเว็บเสริม,
ประวัติแชตของแต่ละคน, notebook ask (`/search/ask/notebooks`), global chat (`/chat/global/*`)
และตัวกรองคำตอบที่ทุกหน้าแชตใช้ (ตัดลิงก์ที่ AI แต่ง, ตรวจรหัสวิชา, ปักข้อความที่ตรงคำถาม)

- Python: `kmitl_rag` · หน้าเว็บ: `@siet/kmitl-rag/...` → `frontend/src`
- เสียบเข้า open-notebook ที่ `kmitl_rag/extension.py` + `hooks.py` และ `frontend/src/extension.tsx`
- import ได้เฉพาะ open-notebook และ `siet_platform`

โครงสร้างทั้งหมดและกฎ: `docs/ARCHITECTURE.md`
