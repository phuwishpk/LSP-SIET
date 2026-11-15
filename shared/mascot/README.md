# 🦉 KMITL SIET Shared Mascot Package

โฟลเดอร์สำหรับเก็บ Assets และ Component มาสคอตส่วนกลางของระบบ เพื่อให้ทุก Service (`platform`, `my-ai-quiz`, `ai-roadmap`) สามารถนำไปใช้ร่วมกันได้

---

## 📂 โครงสร้าง

```text
shared/
└── mascot/
    ├── PinkOwlMascot.tsx   # React Component มาสคอตนกฮูกสีชมพู (SVG + Pure CSS)
    ├── index.ts            # Index export
    └── README.md           # คู่มือและตัวอย่างโค้ด
```

---

## 🚀 วิธีนำไปใช้ข้ามโปรเจกต์

คัดลอกโฟลเดอร์ `shared/mascot` นี้ ไปวางไว้ที่:
- **`my-ai-quiz`**: `app/components/mascot/`
- **`platform/frontend`**: `src/components/mascot/`
- **`ai-roadmap`**: `app/src/components/mascot/`

### ตัวอย่างโค้ดเรียกใช้:
```tsx
import { PinkOwlMascot } from '@/components/mascot';

// 1. ท่าปกติ (Idle)
<PinkOwlMascot mood="idle" size={160} />

// 2. ท่าโบกปีกทักทาย (Wave)
<PinkOwlMascot mood="wave" size={160} />

// 3. ท่าอ่านหนังสือ/ตั้งใจทำโจทย์ (Study)
<PinkOwlMascot mood="study" size={160} />
```

