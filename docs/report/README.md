# docs/report — เนื้อหาเล่มโปรเจกต์ (ตามมาตรฐานเล่ม)

| หัวข้อ | Markdown (แก้ที่นี่) | Word | สถานะ |
|---|---|---|---|
| 4.1 การเตรียมความพร้อมโครงสร้างพื้นฐานและฐานข้อมูล | `4.1-infrastructure-database.md` | `4.1-infrastructure-database.docx` | 19 ต.ค. 2569 — ครบ 4.1.1–4.1.3 |

กติกา: ภาษาไทยทางการ ไม่ใช้สรรพนาม ศัพท์เทคนิคคงอังกฤษ นับ "ตารางที่ 4.x" / "รูปที่ 4.x" ต่อเนื่องในหัวข้อ
ทุกค่าตัวเลขต้องมาจากโค้ดหรือฐานข้อมูลจริง (ระบุวันที่ตรวจ) ค่าความลับใน `.env` ใส่เป็น `<placeholder>`

## สร้างภาพและไฟล์ Word ใหม่ (หลังแก้ Markdown)

```bash
cd docs/report/tools
npm i --silent playwright-core mermaid@11.4.1 docx      # ครั้งแรกเท่านั้น
# ภาพ terminal: ใส่ผลคำสั่งจริงไว้ที่ term/fig<N>.txt แล้วรัน (ดูรายชื่อไฟล์ในสคริปต์)
node render_figs.mjs                                    # TERM_ONLY=0 = render เฉพาะ Mermaid
node md2docx.mjs ../4.1-infrastructure-database.md ../4.1-infrastructure-database.docx
```

`render_figs.mjs` ใช้ Chromium ของ Playwright ที่ cache ไว้ใน `~/Library/Caches/ms-playwright/`
(path ในสคริปต์) และอ่าน Mermaid ทุกบล็อกจากไฟล์ Markdown ตามลำดับ
`md2docx.mjs` รองรับหัวข้อ ย่อหน้า ตาราง รายการ โค้ด รูป และ blockquote; บล็อก `<details>` ถูกตัดทิ้ง
ฟอนต์ตั้งเป็น TH Sarabun New 16pt ตามเล่ม
