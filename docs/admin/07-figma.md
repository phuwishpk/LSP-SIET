# 07 — ไฟล์ Figma "LSP-SIET Admin" และปลั๊กอินสร้างหน้า

> สถานะงานออกแบบใน Figma, ส่วนที่ยังค้าง, และวิธีทำให้ครบด้วยปลั๊กอินใน `docs/figma-admin-plugin/`
> อัปเดต: 19 ตุลาคม 2026 — ปลั๊กอิน**ยังไม่เคยถูกรันใน Figma จริง**

## 1. ไฟล์

- URL: https://www.figma.com/design/zfR0Omo5w4OMcEYLZWVahv — ชื่อ "LSP-SIET Admin" อยู่ใน drafts ของทีม
  "pphuwish's team" (plan key `team::1252220976248072896`, แผน **Starter**)
- สร้างผ่าน Figma MCP เมื่อ 9 ต.ค. 2026 มีหน้า (page) เดียวชื่อ `Admin`
- เป้าหมายตามคำขอ: ทุกหน้าของส่วน admin เป็นเฟรมที่แก้ไขได้ (ไม่ใช่ภาพแปะ) และ**โยงเส้น prototype**
  จากทุกปุ่มไปยังหน้า/หน้าต่างที่มันเปิด

## 2. สิ่งที่อยู่ในไฟล์แล้ว

เฟรม `Components` (x = −2400, y = 0) มี:

| กลุ่ม | รายการ |
|---|---|
| ตัวแปรสี | collection `SIET theme` โหมด `Light` 16 ตัว ชื่อตรงกับโทเค็น CSS (`canvas`, `background`, `card`, `muted`, `ai-soft`, `scrim`, `border`, `foreground`, `muted-foreground`, `subtle-foreground`, `primary`, `primary-foreground`, `ai`, `destructive`, `success`, `warning`) ทุก fill/stroke ในไฟล์ bind กับตัวแปรเหล่านี้ |
| ไอคอน | component `icon/<ชื่อ lucide>` 62 ตัว สร้างจาก SVG ของ `lucide-react` ใน `node_modules` (ชุดเดียวกับที่แอปใช้) ขนาด 16, stroke 2 |
| ปุ่ม/ป้าย/ช่อง | `Button/Primary|Outline|Ghost|Destructive` (child `Icon`, `Label`), `Badge/Outline|Secondary|Destructive|Solid`, `Input/Search`, `Select` |
| โครง | `StatTile` (child `Icon`, `Label`, `Value`, `Hint`), `PageHeader` (child `Icon`, `Title`, `Desc`, `Action` ซ่อนไว้), `Tabs/system|community|rag|roadmap|quiz` (child `tab/0..n` แต่ละอันมี `Label`), `Sidebar` (child `nav/<key>` ครบทุกเมนู admin), `Dialog/Confirm` (child `Title`, `Desc`, ปุ่ม `Cancel`, `Confirm`) |
| ฟอนต์ | Inter (Regular/Medium/Semi Bold) สำหรับอักษรละติน, IBM Plex Sans Thai (Regular/Medium/SemiBold) สำหรับไทย — สลับตาม run ของตัวอักษรใน text node เดียวกัน |

หน้าจอที่สร้างแล้ว 5 เฟรม ชื่อ `จัดการระบบ / <แท็บ>` กว้าง 1440 สูงขั้นต่ำ 1348 วางที่ y = 0, x = ลำดับแท็บ × 1560:
ภาพรวม · ผู้ใช้ · แต้ม · การใช้ AI · นำเข้า CSV (ข้อมูลตัวอย่างเป็นตัวเลขจริงจากระบบ ณ วันนั้น)

ข้อบกพร่องที่รู้: หัวการ์ดบางใบในหน้าจัดการระบบสูงเกิน เพราะเฟรม `Spacer` ที่ว่างเปล่าคงความสูง default 100px
(ปลั๊กอินแก้ให้ในขั้นแรก)

## 3. สิ่งที่ยังขาดและทำไมหยุด

ขาด: อีก 13 หน้าจอ (Community 4, RAG AI 3, AI Roadmap 3, Quiz 3), หน้าต่าง 6 อัน (สร้างบัญชี, รายละเอียดผู้ใช้,
ยืนยันลบ ×4) และการโยงเส้นทั้งหมด

หยุดเพราะ Figma MCP ตอบ `You've reached the Figma MCP tool call limit on the Starter plan` หลังเรียกไปประมาณ
11 ครั้ง (การอ่าน skill ผ่าน `get_figma_skill` และ `use_figma` นับทั้งคู่; `whoami`, `create_new_file` ไม่นับ)
เอกสารของ Figma ระบุ Starter ได้ 20 ครั้ง/เดือน ไม่ทราบวันรีเซ็ต — **ก่อนวางแผนงาน Figma หลายขั้นบนบัญชีนี้
ให้ตรวจโควตาก่อน** หรืออัปเกรดแผน

## 4. ปลั๊กอิน `docs/figma-admin-plugin/`

| ไฟล์ | หน้าที่ |
|---|---|
| `manifest.json` | manifest ปลั๊กอินแบบ development (`editorType: figma`, `documentAccess: dynamic-page`, ไม่ใช้เครือข่าย) |
| `code.js` (≈500 บรรทัด) | สคริปต์ Plugin API ทำงานครั้งเดียวแล้วปิดตัวเอง |

### 4.1 วิธีรัน (ต้องใช้ Figma desktop)

1. เปิดไฟล์ "LSP-SIET Admin" ในแอป Figma desktop
2. เมนู **Plugins → Development → Import plugin from manifest…** เลือก `docs/figma-admin-plugin/manifest.json`
3. รันปลั๊กอิน "LSP-SIET Admin - build remaining screens" หนึ่งครั้ง (ใช้เวลาไม่กี่สิบวินาที)
4. ดูผลใน notification; ถ้ามีขั้นไม่ผ่านให้เปิด **Plugins → Development → Open console** จะเห็นบรรทัด
   `FAIL <ชื่อขั้น>: <ข้อความ>` ต่อขั้น ขั้นที่ผ่านขึ้น `ok`

รันซ้ำได้: ทุกเฟรมที่ปลั๊กอินสร้างถูก**ลบแล้วสร้างใหม่ตามชื่อ** ไม่เกิดซ้ำ; มันไม่แตะเฟรม `Components`
และ 5 หน้าจอเดิมนอกจากแก้ `Spacer`

### 4.2 สิ่งที่ปลั๊กอินทำ (ตามลำดับ `step`)

1. ย่อ `Spacer` ที่สูง > 50 ในหน้าจัดการระบบให้เหลือ 1px
2. สร้าง 13 หน้าจอ: `จัดการ Community / ภาพรวม|โพสต์|ความคิดเห็น|ห้อง` (แถว y = 2600),
   `จัดการ RAG AI / …` (y = 5200), `จัดการ AI Roadmap / …` (y = 7800), `จัดการ Quiz / …` (y = 10400)
   — แต่ละหน้าจอ = instance `Sidebar` (ไฮไลต์เมนูของหน้านั้น) + `PageHeader` + `Tabs/<page>` (แท็บที่เลือก
   ขาว+เส้นขอบ) + เนื้อหาที่เลียนแบบ panel จริง (StatTile, กราฟแท่ง, ตาราง, รายการ, ปุ่มในแถว)
3. สร้าง overlay 6 อัน (เฟรม 1440×900 พื้นดำ 50% + dialog กลาง): `Overlay / สร้างบัญชี`, `Overlay / ผู้ใช้`,
   `Overlay / ลบความคิดเห็น`, `Overlay / ลบเอกสาร`, `Overlay / ลบ Roadmap`, `Overlay / ลบ Quiz`
4. วางป้ายชื่อแถว (`Label / จัดการ…`) ขนาด 64 เหนือแต่ละแถวบนแคนวาส
5. โยงเส้น prototype (`setReactionsAsync`, trigger `ON_CLICK`) รวม 57 จุด:
   - `nav/<key>` ใน component `Sidebar` → หน้าแรก (ภาพรวม) ของแต่ละส่วน (มีผลทุก instance)
   - `tab/<i>` ใน component `Tabs/<page>` → หน้าจอของแท็บนั้น
   - `PageHeader › Action` (ปุ่มสร้างบัญชี) → overlay สร้างบัญชี
   - แถว `user-row` ในหน้าผู้ใช้ → overlay ผู้ใช้; ปุ่ม `delete-comment` / `delete-document` /
     `delete-roadmap` / `delete-quiz` → overlay ยืนยันลบของตัวเอง (ทั้งหมดเปิดแบบ `OVERLAY`)
   - ปุ่ม `Cancel`/`Confirm` ใน `Dialog/Confirm`, `close` และ `submit-create` → `CLOSE` overlay
6. ตั้ง flow เริ่มที่ `จัดการระบบ / ภาพรวม` ชื่อ "Admin"

ปุ่มที่ไม่พาไปหน้าอื่นในแอปจริง (ซ่อนโพสต์, ตัวกรอง, เปลี่ยนหน้ารายการ, "ลองใหม่") ไม่มีเส้น

### 4.3 ข้อควรระวังตอนแก้ `code.js`

- ทดสอบได้เฉพาะในตัวจำลอง (`harness` ใน scratchpad ของเซสชันที่ทำ ไม่ได้เก็บไว้) ซึ่งตรวจว่าชื่อ node
  ที่อ้างมีจริง, ไม่มี null, `FILL` ถูกตั้งใต้ auto-layout เท่านั้น — มัน**ไม่**บอกว่า Figma จะยอมรับเลย์เอาต์
- สคริปต์ใช้ `figma.createAutoLayout` ถ้ามี (มีใน Figma รุ่นใหม่) ไม่งั้น fallback เป็น `createFrame` + layoutMode
- ตั้ง `figma.skipInvisibleInstanceChildren = false` ก่อนเสมอ ไม่งั้น `findOne` หา `Action` ที่ซ่อนอยู่ใน
  `PageHeader` ไม่เจอ (เคยพังด้วยสาเหตุนี้)
- ข้อความที่ต้องตัดบรรทัดต้อง `textAutoResize = 'HEIGHT'` + `resize()` ความกว้างชัดเจน — `FILL` บน TEXT
  จะยุบเป็นคอลัมน์กว้างหนึ่งตัวอักษร (เคยเกิดกับ `Dialog/Confirm › Desc`)
- Latin run ในข้อความไทยถูกตั้งเป็น Inter ด้วย `setRangeFontName` ผ่าน regex `[^฀-๿\s]+`
  ต้องโหลดฟอนต์ทั้ง 6 แบบก่อนแตะ text

### 4.4 ถ้าจะให้ agent ทำต่อผ่าน MCP แทน

เอาเนื้อหาใน `code.js` (ตัด IIFE/notify/closePlugin ออก) ส่งเป็น `use_figma` ทีละไม่เกิน 50k ตัวอักษร,
แยกการสร้างหน้าจอเป็นชุดละ 3–4 หน้าเพื่อให้ retry ได้, แล้วจบด้วย screenshot ตรวจแต่ละแถว
ต้องโหลด skill `figma-use` + `figma-generate-design` ก่อน และแต่ละ call นับโควตา
