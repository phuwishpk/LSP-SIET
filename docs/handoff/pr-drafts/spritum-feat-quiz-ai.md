> **เอกสารประวัติ** — เขียนก่อนการจัดโครงสร้างใหม่เป็น `platform/` + 4 ส่วน (15 พ.ย. 2026) path และชื่อในไฟล์นี้ (`open-notebook/`, `siet-platform/`, `My-ai-quiz/`, `open_notebook_api` ฯลฯ) เป็นของโครงสร้างเดิม ไม่ใช่ปัจจุบัน — โครงสร้างปัจจุบันอยู่ที่ `docs/ARCHITECTURE.md` และตารางเทียบ path เดิม → ใหม่อยู่ที่ `scripts/lsp-siet/moves.py`

<!-- ร่างสำหรับ SpritUm: ตรวจทุกข้อ แก้ส่วนที่ไม่ตรง แล้วเปิด PR ด้วย
gh pr create --base staging --head feat/quiz-ai --title "Quiz AI: ปรับประสบการณ์โหมดเล่นคนเดียว" --body-file docs/handoff/pr-drafts/spritum-feat-quiz-ai.md -->

## ทำอะไร
- ปรับหน้า Quiz Arena และหน้าตั้งค่าโหมดเล่นคนเดียว
- เพิ่ม `QuizNavbar` (navbar ของแอป quiz), ชุดไอคอน `ui/Icons.tsx`
- หน้าเล่น `/solo/play` ใหม่ พร้อม loading skeleton

## ใครทำอะไร
| คน | งาน | ไฟล์/โฟลเดอร์หลัก |
|---|---|---|
| SpritUm | solo quiz, navbar ของ quiz | `My-ai-quiz/app/components/*`, `My-ai-quiz/app/solo/**` |

## เปลี่ยนฐานข้อมูล / env / config ไหม
- ไม่มีการแก้ฐานข้อมูลหรือ env
- `package-lock.json` เปลี่ยน: หลัง merge ต้อง `npm install` ใน `My-ai-quiz` (SpritUm ยืนยัน)

## ทดสอบยังไง
- (SpritUm ระบุ)

## ยังไม่เสร็จ / ห้ามแตะ
- (SpritUm ระบุ)

## Merge ownership
<!-- merge-ownership:start -->
```yaml
branch: feat/quiz-ai
merge-order: 3            # ไม่ชนกับ branch ไหนเลย merge ตอนไหนก็ได้
depends-on: []
owns:
  - quiz app ทั้งหมด รวม navbar ของ quiz: My-ai-quiz/**
defers-to: []
shared: []
```
<!-- merge-ownership:end -->
