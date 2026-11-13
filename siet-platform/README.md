# siet-platform

ชั้นล่างสุดของโค้ด SIET ที่ทุกฟีเจอร์ใช้ร่วมกัน: บัญชีและ JWT, สิทธิ์ตามบทบาท, กระเป๋าแต้ม,
คิวเรียก AI provider และบันทึกการใช้, Redis cache, คลังเอกสาร + การค้นในคลัง, ควิซ/roadmap,
audit log, การแจ้งเตือน และ migration track k1–k8 ของ SurrealDB

- Python: `siet_platform` (ติดตั้งเข้า venv ของ open-notebook แบบ editable)
- หน้าเว็บ: `@siet/platform/...` → `frontend/src` (ชั้นข้อมูลที่ทุกหน้าใช้, auth, เมนู, คอนโซลผู้ดูแลหลัก, ธีม)
- เสียบเข้า open-notebook ที่ `siet_platform/extension.py` + `hooks.py` และ `frontend/src/extension.tsx`
- import ได้เฉพาะ open-notebook (ห้าม `kmitl_rag`, `siet_community`)

โครงสร้างทั้งหมดและกฎ: `docs/ARCHITECTURE.md` · test: `make test-backend`, `make test-frontend`
