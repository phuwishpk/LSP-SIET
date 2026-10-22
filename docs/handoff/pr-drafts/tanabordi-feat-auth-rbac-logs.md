<!-- ร่างสำหรับ Tanabordi: ตรวจทุกข้อ แก้ส่วนที่ไม่ตรง แล้วเปิด PR ด้วย
gh pr create --base staging --head feat/auth-rbac-logs --title "Google sign-in + RBAC 4 ระดับ" --body-file docs/handoff/pr-drafts/tanabordi-feat-auth-rbac-logs.md -->

## ทำอะไร
- หน้า login เปลี่ยนเป็น Google OAuth อย่างเดียว
- RBAC 4 ระดับ (admin / teacher / student / pending) + whitelist อาจารย์ + ล็อกเฉพาะรหัสคณะ (`KMITL_FACULTY_CODE`, ค่าเริ่มต้น 03)
- หน้า pending สำหรับบัญชีที่ยังไม่ได้รับสิทธิ์ + route guard ใน dashboard layout
- admin ที่ login ด้วย Google จะไปหน้า `/admin` ทันที
- ปุ่ม Google reset ตัวเองเมื่อกด back ในเบราว์เซอร์
- ขยาย `users.avatar_url` เป็น TEXT

## ใครทำอะไร
| คน | งาน | ไฟล์/โฟลเดอร์หลัก |
|---|---|---|
| Tanabordi | Google login, RBAC, pending screen | `api/routers/google_auth.py`, `api/auth_roles.py`, `components/auth/*`, `app/(auth)/*`, `lib/auth-redirect.ts`, `lib/roles.ts` |

## เปลี่ยนฐานข้อมูล / env / config ไหม
- ตารางใหม่: `allowed_teachers` (email, role, department)
- `users.role` เพิ่มค่า `pending`, `users.avatar_url` เปลี่ยนเป็น TEXT
- ทั้งหมดสร้างตอน startup ผ่าน `community/schema.py` และอยู่ใน `docker/mariadb-init.sql` ด้วย
- env ใหม่ใน `docker-compose.yml` / `docker-compose-dev.yml`: `ADMIN_EMAILS`, `TEACHER_EMAILS`, `KMITL_FACULTY_CODE`
- ต้องรันคำสั่งเพิ่มไหม: (Tanabordi ระบุ)

## ทดสอบยังไง
- (Tanabordi ระบุ: login ด้วยอีเมลนักศึกษา / อาจารย์ใน whitelist / อีเมลนอกคณะ แล้วได้ผลอะไร)

## ยังไม่เสร็จ / ห้ามแตะ
- (Tanabordi ระบุ)

## Merge ownership
<!-- merge-ownership:start -->
```yaml
branch: feat/auth-rbac-logs
merge-order: 2
depends-on: [refactor/course-repo]
owns:
  - login / Google OAuth: open-notebook/api/routers/google_auth.py, open-notebook/frontend/src/components/auth/**, open-notebook/frontend/src/app/(auth)/**
  - roles / RBAC: open-notebook/api/auth_roles.py, open-notebook/frontend/src/lib/roles.ts, open-notebook/frontend/src/lib/auth-redirect.ts
  - dashboard route guard: open-notebook/frontend/src/app/(dashboard)/layout.tsx
defers-to: []
shared:
  - open-notebook/open_notebook/domain/user.py: ชนกับ refactor/course-repo (ทั้งสองฝั่งเพิ่มฟังก์ชันท้ายไฟล์) ให้เก็บทั้งสองฝั่ง
  - open-notebook/open_notebook/community/schema.py: เก็บทั้งสองฝั่ง (git merge เองได้)
  - docker-compose.yml, docker-compose-dev.yml, docker/mariadb-init.sql: เก็บทั้งสองฝั่ง
```
<!-- merge-ownership:end -->
