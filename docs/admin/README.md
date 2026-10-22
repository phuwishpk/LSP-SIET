# เอกสารส่วนผู้ดูแล (Admin Console) — สารบัญและวิธีใช้ชุดเอกสารนี้

โฟลเดอร์ `docs/admin/` อธิบายส่วนผู้ดูแลของ LSP-SIET / SIET Space (`/admin`, `/admin/community`,
`/admin/rag`, `/admin/roadmap`, `/admin/quiz`) ทั้ง frontend, backend, ธีม, การทดสอบ และงาน Figma
เขียนสำหรับ **คนและ agent ในทีมที่ต้องแก้หรือต่อยอดส่วนนี้โดยไม่เคยเห็นโค้ดมาก่อน**

- ภาษาไทยทั้งชุด ชื่อไฟล์/ฟังก์ชัน/คำสั่งคงเป็นอังกฤษ
- path ที่ไม่ขึ้นต้นด้วย `docs/` หรือ `open-notebook/` ให้ถือว่าอยู่ใต้ `open-notebook/frontend/src/`
- อ้างอิงโค้ด ณ commit `ebffe06` บน `main` (19 ต.ค. 2026) และงานหมวดหมู่/ห้องวิชาบน `refactor/course-repo` (22 ต.ค. 2026 — 03 §2.4–2.5, 05 §3.3); ถ้าโค้ดกับเอกสารไม่ตรงกัน **โค้ดถูก** และให้แก้เอกสารตาม

## ไฟล์ในชุดนี้

| ไฟล์ | ตอบคำถามว่า | อ่านเมื่อ |
|---|---|---|
| [01-overview.md](01-overview.md) | ส่วน admin มีหน้าอะไร แบ่งอย่างไร ใครเห็น กติกาความเป็นส่วนตัว อำนาจลบ ตัวเลขที่ดูแปลก จะเปิดดูหน้าจริงอย่างไร | **เริ่มที่นี่เสมอ** |
| [02-theme-and-layout.md](02-theme-and-layout.md) | สเปกดีไซน์ Minimal/Clean Light, โทเค็นสีและฟอนต์ของ `.theme-siet`, การ scope ธีมไว้เฉพาะ `/admin`, sidebar และแบรนด์ LSP-SIET | แก้หน้าตา สี ฟอนต์ ระยะ หรือจะใช้ธีมนี้กับส่วนอื่น |
| [03-frontend-pages.md](03-frontend-pages.md) | แต่ละหน้า → แต่ละแท็บ → component ไหน ดึงข้อมูลจาก hook/endpoint ไหน มีพฤติกรรมอะไร พร้อมเช็กลิสต์เพิ่มหน้า/แท็บใหม่ | แก้หรือเพิ่มสิ่งที่ผู้ใช้เห็นในหน้าใดหน้าหนึ่ง |
| [04-frontend-shared.md](04-frontend-shared.md) | ชิ้นส่วนร่วม (`StatTile`, `StatCharts`, `controls`, `PostCounts`, `AdminPageHeader`), `lib/api/admin.ts`, `use-admin.ts` (query keys, invalidate), `community-format.ts` | สร้าง panel ใหม่, เพิ่ม API call, สงสัยว่า cache ไหนต้อง refresh |
| [05-backend-api.md](05-backend-api.md) | ทุก endpoint ใต้ `/api/admin` พารามิเตอร์และ response shape, หน้าต่างเวลาของผู้ดู, ฟังก์ชัน SQL ใน `repository.py`/`library.py`/`features.py`, ตารางที่แตะ, ตัวอย่าง curl | เพิ่มหรือแก้ endpoint, แก้ query, สอบสวนตัวเลข |
| [06-testing-and-verification.md](06-testing-and-verification.md) | ชุดทดสอบที่มี, คำสั่งรัน, baseline ที่พังอยู่ก่อน, สูตรรัน pytest ในคอนเทนเนอร์, สคริปต์ตรวจ API จริง, สูตร screenshot headless, เช็กลิสต์ก่อนบอกว่าเสร็จ | ก่อนส่งงานทุกครั้ง |
| [07-figma.md](07-figma.md) | ไฟล์ Figma "LSP-SIET Admin" มีอะไรแล้ว/ขาดอะไร, ทำไมหยุด (โควตา Starter), วิธีรันปลั๊กอิน `docs/figma-admin-plugin/` ให้ครบ, ข้อควรระวังของ Plugin API | งานออกแบบ/prototype |
| [08-file-index.md](08-file-index.md) | ตารางทุกไฟล์ที่เกี่ยวข้อง: path, ใหม่/แก้, หน้าที่หนึ่งบรรทัด, เอกสารที่อธิบาย | หาไฟล์ หรืออยากรู้ว่า commit นี้แตะอะไรบ้าง |

## เส้นทางอ่านตามประเภทงาน

```
แก้ UI หน้าเดียว         01 §4-5 → 03 (หน้านั้น) → 04 (ชิ้นส่วนที่ใช้) → 06
เพิ่ม endpoint + แสดงผล  01 §5 (ความเป็นส่วนตัว) → 05 §1-2 → 05 §3 (ตัวอย่างใกล้เคียง) → 04 §2-3 → 03 → 06
เพิ่มหน้า admin ใหม่     01 §4 (อยู่ส่วนไหน) → 02 §3 → 03 §0 และ §6 → 04 → 05 → 06
ไล่ bug ตัวเลขไม่ตรง     01 §7 → 05 §2 และฟังก์ชันของตัวเลขนั้น → 06 §3-4
งาน Figma               07
```

## เอกสารอื่นในโปรเจกต์ที่เกี่ยวข้อง

| ไฟล์ | เนื้อหา | ความสัมพันธ์กับชุดนี้ |
|---|---|---|
| [`docs/SYSTEM-GUIDE.md`](../SYSTEM-GUIDE.md) | ภาพรวมทั้งระบบ KMITL AI Workspace / SIET Space: สถาปัตยกรรม, บทบาท, ระบบแต้ม, กันสแปม, แผนผัง API, ฐานข้อมูล (ไทย, 15 ก.ย. 2026) | บริบทใหญ่; ส่วน admin ในนั้นยังเป็นรุ่นก่อนการแยก 4 ส่วน |
| [`docs/RUNBOOK.md`](../RUNBOOK.md) | ติดตั้งและรันระบบบนเครื่องใหม่ (`make up`, `.env`, ตรวจ 3 ชั้น) | ต้องทำตามนี้ก่อนจึงจะเปิดหน้า admin ได้ |
| [`docs/DATABASE_ARCHITECTURE.md`](../DATABASE_ARCHITECTURE.md), [`docs/ER-DIAGRAM.md`](../ER-DIAGRAM.md) | โครงสร้างตาราง MariaDB/SurrealDB | ตารางที่ 05 §6 อ้างถึง (ชื่อคอลัมน์หลัง rename ดู `community/schema.py`) |
| `open-notebook/CLAUDE.md`, `open-notebook/frontend/src/CLAUDE.md`, `open-notebook/api/CLAUDE.md` | แนวทางสถาปัตยกรรมของ Open Notebook ต้นน้ำ | กติกา frontend/API ทั่วไปที่ส่วน admin ทำตาม |
| `docs/figma-admin-plugin/` | ปลั๊กอิน Figma | อธิบายใน 07 |

## การดูแลชุดเอกสารนี้

1. แก้โค้ดส่วน admin แล้วให้แก้ไฟล์ที่เกี่ยวข้องในตารางด้านบน และอัปเดตบรรทัด "อ้างอิงโค้ด ณ commit" ข้างต้น
2. เพิ่มไฟล์โค้ดใหม่ → เพิ่มแถวใน 08 และ (ถ้าเป็นหน้า/panel) หัวข้อใน 03
3. เพิ่ม endpoint → เพิ่มใน 05 §3 พร้อม response shape จริง (คัดจาก type ใน `lib/api/admin.ts`)
4. ตัดสินใจเชิงออกแบบใหม่ (เช่น ย้ายกลุ่มเมนู, เปิดสิทธิ์อาจารย์) → บันทึกใน 01 §4 หรือ §6 พร้อมวันที่และเหตุผล
5. ไม่ต้องคัดลอกโค้ดยาวลงเอกสาร — อ้าง path + ชื่อฟังก์ชันพอ ให้ผู้อ่านไปเปิดไฟล์จริง
