# my-ai-quiz

AI Quiz: สร้างข้อสอบด้วย AI (ปรนัย เติมคำ จับคู่ หรือผสม ที่สามระดับ) จากหัวข้อหรือจากคลังเอกสารของวิชา
เก็บเซสชันที่บันทึกไว้ และให้ผู้ดูแลลบได้

| โฟลเดอร์ | คืออะไร |
|---|---|
| `siet_quiz/` | ฝั่ง API (Python): service เรียก AI, domain (`QuizSession`), `/api/features/quiz/*`, `DELETE /api/admin/quizzes/{id}` |
| `frontend/src/` | หน้าเว็บของ host: `@siet/quiz/...` (`/admin/quiz`) |
| `app/` | แอป Next.js แยก (พอร์ต 3001, path `/quiz`) มี Dockerfile ของตัวเอง เรียก API ผ่าน `LSP_SIET_API_URL` |
| `tests/` | test ของ `siet_quiz` |

- เสียบเข้า platform ที่ `siet_quiz/extension.py` และ `frontend/src/extension.tsx`
- import ได้เฉพาะ `siet_core`/`api`/`commands` และ `siet_platform`

โครงสร้างทั้งหมดและกฎ: `docs/ARCHITECTURE.md`
