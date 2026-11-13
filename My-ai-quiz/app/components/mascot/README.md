# 🦉 Pink Owl Mascot (มาสคอตนกฮูกชมพู KMITL SIET)

คอมโพเนนต์มาสคอตนกฮูกสีชมพูสไตล์ Duo + หมวกปริญญาบัตร ที่ทำด้วย **Pure React + SVG + CSS Animations** เบา ไม่พึ่งพา library อื่น นำไปวางในแพ็กเกจหรือหน้าเว็บไหนก็ได้ทันที

---

## 📦 การนำไปใช้ในโปรเจกต์อื่น

สามารถคัดลอกทั้งโฟลเดอร์ `mascot` นี้ ไปวางไว้ที่โฟลเดอร์คอมโพเนนต์ของโปรเจกต์คุณ เช่น:
- `open-notebook/frontend/src/components/mascot/`
- `ai-roadmap-generator/app/components/mascot/`
- `siet-platform/frontend/src/components/mascot/`

---

## 🚀 วิธีเรียกใช้งาน

```tsx
import { PinkOwlMascot } from './mascot'; // หรือ path ที่คุณวางไว้

export default function MyPage() {
  return (
    <div className="flex gap-6 items-center">
      {/* 1. ท่าปกติ ยืนลอย กะพริบตา */}
      <PinkOwlMascot mood="idle" size={160} />

      {/* 2. ท่าโบกปีกทักทาย + ยิ้มขยิบตา */}
      <PinkOwlMascot mood="wave" size={160} />

      {/* 3. ท่าอ่านหนังสือ / สมาธิทำแบบฝึกหัด */}
      <PinkOwlMascot mood="study" size={160} />
    </div>
  );
}
```

---

## 🎨 Props

| Prop | ชนิด | ค่าเริ่มต้น | รายละเอียด |
| :--- | :--- | :--- | :--- |
| `mood` | `'idle'` \| `'wave'` \| `'study'` | `'idle'` | ท่าทางของนกฮูก |
| `size` | `number` \| `string` | `200` | ขนาดความกว้าง (px หรือ string) |
| `className` | `string` | `''` | คลาส CSS เพิ่มเติมของคอนเทนเนอร์ |

---

## 💡 ท่าทาง (Moods)

- **`idle`**: ยืนน่ารัก ลอยขึ้น-ลงอย่างนุ่มนวล พู่หมวกแกว่ง และกะพริบตาเป็นระยะ
- **`wave`**: เอียงตัว ขยิบตาขวา 1 ข้าง และยกปีกขวาขึ้นมาโบกทักทาย/แสดงความยินดี
- **`study`**: ก้มหน้าเล็กน้อย ลูกตาโฟกัสลง และถือหนังสือกางอ่านพร้อมดินสอ

