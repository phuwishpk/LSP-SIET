<!-- ร่างสำหรับ SpritUm: ตรวจทุกข้อ แก้ส่วนที่ไม่ตรง แล้วเปิด PR ด้วย
gh pr create --base staging --head refactor/community --title "Community: ปรับสไตล์และ UI ทั้งหน้า" --body-file docs/handoff/pr-drafts/spritum-refactor-community.md -->

## ทำอะไร
- ปรับสไตล์หน้า community ทั้งหน้า (`community/page.tsx`)
- navbar ของ community (`CommunityHeader`): โลโก้ gradient สี rose/pink, ช่องค้นหาแบบใหม่
- `CreatorBox` เพิ่มส่วนใหม่ (+58 บรรทัด), ปรับ `AiQuickWidget`, `CourseSidebar`, `LibraryPanel`, `PointsWallet`, `PostCard`, `InstructorMediaView`, `SavedSummariesView`

## ใครทำอะไร
| คน | งาน | ไฟล์/โฟลเดอร์หลัก |
|---|---|---|
| SpritUm | สไตล์และ UI ของ community | `components/community/*`, `app/(dashboard)/community/page.tsx` |

## เปลี่ยนฐานข้อมูล / env / config ไหม
- ไม่มี

## ทดสอบยังไง
- (SpritUm ระบุ: หน้าที่ควรเปิดดูทั้งโหมดสว่างและโหมดมืด)

## ยังไม่เสร็จ / ห้ามแตะ
- (SpritUm ระบุ)

## Merge ownership
<!-- merge-ownership:start -->
```yaml
branch: refactor/community
merge-order: 4
depends-on: []
owns:                     # ⚠ ต้องตกลงกับ Poh ก่อน: 4 ไฟล์ด้านล่างชนกับ dev-poh
  - navbar ของ community: open-notebook/frontend/src/components/community/CommunityHeader.tsx    # SpritUm หรือ Poh?
  - สีหน้า community: open-notebook/frontend/src/components/community/**, open-notebook/frontend/src/app/(dashboard)/community/page.tsx
  - CreatorBox: open-notebook/frontend/src/components/community/CreatorBox.tsx                   # SpritUm หรือ Poh?
defers-to:
  - หน้าโปรไฟล์: dev-poh (open-notebook/frontend/src/app/(dashboard)/community/profile/**)
shared:
  - open-notebook/frontend/src/components/community/InstructorMediaView.tsx: ชนกับ dev-poh, ระบุว่าเก็บของใคร
  - open-notebook/frontend/src/components/community/SavedSummariesView.tsx: ชนกับ dev-poh, ระบุว่าเก็บของใคร
  - open-notebook/frontend/src/components/community/PostCard.tsx, community/page.tsx: ทั้งสอง branch แก้ แต่ git merge เองได้ ตรวจหน้าตาหลัง merge
```
<!-- merge-ownership:end -->
