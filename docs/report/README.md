# docs/report — เนื้อหาเล่มโปรเจกต์ (ตามมาตรฐานเล่ม)

| หัวข้อ | Markdown (แก้ที่นี่) | Word | สถานะ |
|---|---|---|---|
| 4.1 การเตรียมความพร้อมโครงสร้างพื้นฐานและฐานข้อมูล | `4.1-infrastructure-database.md` | `4.1-infrastructure-database.docx` | 23 ต.ค. 2569 — ปรับตาม schema 22 ตาราง, แพ็กเกจ `siet_platform`, migration k1–k8 (ตาราง 4.1–4.27, รูป 4.1–4.5) |
| 4.3 การพัฒนาระบบคลังข้อมูลและรายวิชา | `4.3-course-library.md` | `4.3-course-library.docx` | 23 ต.ค. 2569 — 4.3.1–4.3.5 (ตาราง 4.28–4.42, รูป 4.6–4.14) |
| 4.5 การพัฒนาระบบปัญญาประดิษฐ์ | `4.5-ai-features.md` | `4.5-ai-features.docx` | 23 ต.ค. 2569 — 4.5.1–4.5.2 (ตาราง 4.43–4.45, รูป 4.15–4.17) |
| 4.6 การบูรณาการระบบและการทดสอบเบื้องต้น | `4.6-integration-testing.md` | `4.6-integration-testing.docx` | 23 ต.ค. 2569 — 4.6.1–4.6.3 (ตาราง 4.46–4.63, รูป 4.18–4.25) สคริปต์และผลดิบใน `eval/` |

กติกา: ภาษาไทยทางการ ไม่ใช้สรรพนาม ศัพท์เทคนิคคงอังกฤษ นับ "ตารางที่ 4.x" / "รูปที่ 4.x" ต่อเนื่องในหัวข้อ
ทุกค่าตัวเลขต้องมาจากโค้ดหรือฐานข้อมูลจริง (ระบุวันที่ตรวจ) ค่าความลับใน `.env` ใส่เป็น `<placeholder>`

## สร้างภาพและไฟล์ Word ใหม่ (หลังแก้ Markdown)

```bash
cd docs/report/tools
npm i --silent playwright-core mermaid@11.4.1 docx      # ครั้งแรกเท่านั้น
# ภาพ terminal: ใส่ผลคำสั่งจริงไว้ที่ figma/term/fig<N>.txt แล้วรัน (ดูรายชื่อไฟล์ในสคริปต์)
node render_figs.mjs                                    # TERM_ONLY=0 = render เฉพาะ Mermaid
node md2docx.mjs ../4.1-infrastructure-database.md ../4.1-infrastructure-database.docx
```

`render_figs.mjs` ใช้ Chromium ของ Playwright ที่ cache ไว้ใน `~/Library/Caches/ms-playwright/`
(path ในสคริปต์) และอ่าน Mermaid ทุกบล็อกจากไฟล์ Markdown ตามลำดับ
`md2docx.mjs` รองรับหัวข้อ ย่อหน้า ตาราง รายการ โค้ด รูป และ blockquote; บล็อก `<details>` ถูกตัดทิ้ง
ฟอนต์ตั้งเป็น TH Sarabun New 16pt ตามเล่ม ขอบกระดาษ บน/ซ้าย 1.5 นิ้ว ล่าง/ขวา 1 นิ้ว เลขหน้ามุมขวาบน
คำบรรยาย **ตารางที่** อยู่เหนือตาราง **รูปที่** อยู่ใต้รูป (ผูกกับรูปไม่ให้ตกหน้า)
รูปกว้างมาก (ER diagram) ถูกจัดลงหน้าแนวนอนแยกต่างหาก ข้อความ `<placeholder>` ในตารางคงไว้ตามต้นฉบับ
