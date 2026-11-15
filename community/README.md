# community (siet-community)

SIET Space: ห้องวิชาและห้องพูดคุย, ฟีด, คอมเมนต์และรีแอ็กชัน, การ์ดควิซ/roadmap,
รายงานเนื้อหา, คอนโซลอาจารย์ และคอนโซลผู้ดูแลส่วนชุมชน

- Python: `siet_community` · หน้าเว็บ: `@siet/community/...` → `frontend/src`
- เสียบเข้า platform ที่ `siet_community/extension.py` และ `frontend/src/extension.tsx`
- ชั้นบนสุด: import ได้ทั้ง `siet_core`, `siet_platform`, `kmitl_rag`, `siet_quiz` และ `siet_roadmap`
- เพิ่มหน้าใหม่: เขียนใน `frontend/src/app/` แล้วรัน `make frontend-routes` (สร้าง stub ใน `platform/frontend/src/app`)

โครงสร้างทั้งหมดและกฎ: `docs/ARCHITECTURE.md`
