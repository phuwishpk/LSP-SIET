<!-- ร่างสำหรับ Poh: ตรวจทุกข้อ แก้ส่วนที่ไม่ตรง แล้วเปิด PR ด้วย
gh pr create --base staging --head dev-poh --title "Community: แก้ไขโปรไฟล์ + ปรับ UI" --body-file docs/handoff/pr-drafts/poh-dev-poh.md -->

## ทำอะไร
- แก้ไขโปรไฟล์ได้ พร้อมอัปโหลดรูปและตรวจข้อมูล (`community/profile/[userId]`)
- ปรับ UI ของ community (commit "แก้ไข uiix"): `PostCard`, `PostDetailModal`, `CommunityHeader`, `CreatorBox`, `InstructorMediaView`, `SavedSummariesView`
- `globals.css`: ซ่อน scrollbar ใน `.community-theme` (เดิมเป็น scrollbar สีชมพูบาง)

## ใครทำอะไร
| คน | งาน | ไฟล์/โฟลเดอร์หลัก |
|---|---|---|
| Poh | แก้ไขโปรไฟล์ | `app/(dashboard)/community/profile/[userId]/page.tsx` |
| Poh | ปรับ UI community | `components/community/*`, `globals.css` (`.community-theme`) |

## เปลี่ยนฐานข้อมูล / env / config ไหม
- ไม่มี (Poh ยืนยัน: อัปโหลดรูปโปรไฟล์ใช้ endpoint เดิมหรือไม่)

## ทดสอบยังไง
- (Poh ระบุ)

## ยังไม่เสร็จ / ห้ามแตะ
- hook ที่รอ Poh ต่อเข้า UI อยู่ใน `docs/handoff/for-poh.md` (ปุ่มรายงาน, ตัวเลือกการมองเห็น, ปุ่มดาวน์โหลด, ช่องรหัสเข้าห้อง)
- (Poh ระบุเพิ่ม)

## Merge ownership
<!-- merge-ownership:start -->
```yaml
branch: dev-poh
merge-order: 5
depends-on: []
owns:                     # ⚠ ต้องตกลงกับ SpritUm ก่อน: 4 ไฟล์ด้านล่างชนกับ refactor/community
  - หน้าโปรไฟล์: open-notebook/frontend/src/app/(dashboard)/community/profile/**
  - scrollbar ของ community: .community-theme ใน open-notebook/frontend/src/app/globals.css
  - navbar ของ community: open-notebook/frontend/src/components/community/CommunityHeader.tsx    # Poh หรือ SpritUm?
defers-to:
  - (ใส่ส่วนที่ยอมให้ refactor/community เป็นตัวหลัก เช่น สีหน้า community)
shared:
  - open-notebook/frontend/src/components/community/CreatorBox.tsx: ชนกับ refactor/community, ระบุว่าเก็บของใคร
  - open-notebook/frontend/src/components/community/InstructorMediaView.tsx: ชนกับ refactor/community, ระบุว่าเก็บของใคร
  - open-notebook/frontend/src/components/community/SavedSummariesView.tsx: ชนกับ refactor/community, ระบุว่าเก็บของใคร
  - open-notebook/frontend/src/app/globals.css: refactor/course-repo เพิ่ม `.theme-adventure` ไว้ เก็บทั้งสองฝั่ง
```
<!-- merge-ownership:end -->
