# 02 — ธีม SIET และเลย์เอาต์ของหน้า admin

> ครอบคลุม: โทเค็นสี ฟอนต์ การ scope ธีม sidebar และแบรนด์ "LSP-SIET"
> ไฟล์หลัก: `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`,
> `siet-platform/frontend/src/app/(dashboard)/admin/layout.tsx`, `frontend/src/components/layout/AppSidebar.tsx`

> **อัปเดต 23 ต.ค. 2026:** หน้า `/admin` เลิกใช้ `.theme-siet` แล้ว ทุกหน้าใน dashboard
> (admin, Notebooks, Sources, Ask and Search, AI Features, `/teacher`, Community) ใช้ธีมชมพู
> `.community-theme` ชุดเดียวกัน ดูข้อ 3 ส่วนข้อ 1–2 เก็บไว้เป็นประวัติของสเปก Minimal/Clean Light
> class `.theme-siet` ยังอยู่ใน `siet-theme.css` แต่ไม่มีหน้าไหนใช้แล้ว

## 1. สเปกดีไซน์ที่ได้รับ (8 ต.ค. 2026)

เจ้าของระบบส่งแนว **Minimal / Clean Light** มาให้:

- โครงแบบ web app / dashboard: sidebar, feed, การ์ดมุมมน เส้นขอบบาง ไอคอนเส้น
- หน้า Community เป็น **monochrome** (ขาว–เทา–ดำ) ส่วนหน้า AI ใช้ **สีม่วง** เป็นจุดเน้น
- สี: `#FFFFFF` การ์ด/พื้นที่เนื้อหา · `#F2F2F2`, `#F8F9FB` พื้นหลัง/พื้นที่รอง · `#E7E7E7` เส้นขอบ ·
  `#262626` ข้อความหลัก · `#686868`, `#8A8A8A` ข้อความรอง/ไอคอน · ม่วง/ม่วงอ่อน สำหรับ AI
- ฟอนต์: **Inter** (อังกฤษ/UI), **IBM Plex Sans Thai** (ไทย), **Noto Sans Thai** (ไทย สำรอง)
  น้ำหนัก Regular / Medium / SemiBold เท่านั้น — **ไม่มี Bold** (`font-bold` ถูกถอดออกจากหน้า admin)
- สเปกไม่ได้ระบุรหัสสีม่วง: เลือกใช้ `#7C3AED` (ม่วง) กับ `#F3EFFE` (ม่วงอ่อน) ถ้าได้รหัสจริงมาให้แก้ที่ `.theme-siet` ที่เดียว

## 2. ธีมถูก scope ไม่ใช่ global

ธีมนี้ใช้เฉพาะหน้า `/admin*` ส่วนที่เหลือของแอป (Community, Notebooks, Settings …) ยังใช้
โทเค็นเดิมของ Open Notebook (ธีมน้ำเงิน) จึงทำเป็น class `.theme-siet` ที่เขียนทับตัวแปร
shadcn/Tailwind ภายใน subtree

### 2.1 ตัวแปรที่ `.theme-siet` กำหนด (light)

| ตัวแปร | ค่า | ใช้กับ |
|---|---|---|
| `--canvas` | `#f8f9fb` | พื้นหลังทั้งหน้า (class `bg-canvas`) — **โทเค็นใหม่** |
| `--background` / `--card` / `--popover` | `#ffffff` | พื้นการ์ด, dialog, dropdown |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `#262626` | ข้อความหลัก |
| `--primary` / `--primary-foreground` | `#262626` / `#ffffff` | ปุ่มหลัก, segment ที่เลือก, แถบกราฟ monochrome |
| `--secondary`, `--muted`, `--accent` | `#f2f2f2` | ชิป พื้นที่รอง hover |
| `--muted-foreground` | `#686868` | ข้อความรอง |
| `--subtle-foreground` | `#8a8a8a` | ไอคอนประกอบ (class `text-subtle-foreground`) — **โทเค็นใหม่** |
| `--border` / `--input` | `#e7e7e7` | เส้นขอบ |
| `--ring` | `#8a8a8a` | focus ring |
| `--ai` / `--ai-soft` / `--ai-foreground` | `#7c3aed` / `#f3effe` / `#ffffff` | จุดเน้นของหน้า AI (class `text-ai`, `bg-ai`, `bg-ai-soft`, `fill-ai`, `border-ai`) — **โทเค็นใหม่** |
| `--sidebar*` | ขาว/เทา/ดำ ชุดเดียวกัน | sidebar ซ้าย |
| `--radius` | `0.75rem` | การ์ด 16px (radius-xl), ปุ่ม/ช่องกรอก 10px |

โทเค็นใหม่ 3 ตัว (`canvas`, `subtle-foreground`, `ai*`) ถูกประกาศใน `@theme inline`
(`--color-canvas`, `--color-subtle-foreground`, `--color-ai`, `--color-ai-soft`, `--color-ai-foreground`)
ให้ Tailwind v4 สร้าง utility ได้ และมีค่า fallback ใน `:root` และ `.dark` ด้วย เพื่อให้
component ที่ใช้ class เหล่านี้ไม่พังถ้าถูกนำไปใช้นอก `/admin`

### 2.2 โหมดมืด

`.dark .theme-siet` กำหนดชุดเทาเข้มเอง (ไม่ใช่การกลับสีอัตโนมัติ): พื้น `#141414`,
การ์ด `#1c1c1c`, ข้อความ `#f2f2f2`, เส้นขอบ `#333333`, ม่วง `#9b78f8`
สีม่วงทั้ง light และ dark ผ่านตัวตรวจของ `dataviz` skill แล้ว (lightness band + contrast ≥ 3:1
บนพื้นของแต่ละโหมด) — ถ้าเปลี่ยนสีม่วง ให้รัน `scripts/validate_palette.js` ของ skill นั้นใหม่

### 2.3 พื้นผิวเรียบ ไม่มีเงา

```css
.theme-siet :is([data-slot='card'], [data-slot='tabs-list'], [data-slot='tabs-trigger'],
                [data-slot='button'], [data-slot='input'], [data-slot='textarea']) {
  --tw-shadow: 0 0 #0000;
}
```

ล้างเฉพาะ drop shadow ของ shadcn (`shadow-sm`, `shadow-xs`) โดยไม่แตะ focus ring ซึ่งใช้
`box-shadow` เหมือนกัน และ `.theme-siet .sidebar-menu-item:hover` ปิด `scale`/เงาตอน hover ของเมนู

### 2.4 ฟอนต์

ใน `app/layout.tsx`:

```ts
const inter    = Inter({ subsets: ["latin"], variable: "--font-inter" })
const plexThai = IBM_Plex_Sans_Thai({ weight: ["400","500","600"], variable: "--font-ibm-plex-thai", preload: false })
const notoThai = Noto_Sans_Thai({ variable: "--font-noto-thai", preload: false })   // ห้ามใส่ weight
```

- `<body>` ได้ `inter.className` (ฟอนต์เดิมของแอป) + ตัวแปร CSS ของทั้งสามฟอนต์
- `.theme-siet, body.theme-siet { font-family: var(--font-inter), var(--font-ibm-plex-thai), var(--font-noto-thai), system-ui, sans-serif }`
  — Latin ใช้ Inter, อักษรไทยตกไปที่ IBM Plex Sans Thai แล้ว Noto Sans Thai ตามลำดับ
  ต้องประกาศ `body.theme-siet` ด้วย เพราะ class ของ next/font บน `<body>` มี specificity เท่ากัน
- **กับดัก**: `Noto_Sans_Thai` เป็น variable font — ถ้าใส่ `weight: [...]` Turbopack จะ resolve
  ไฟล์ไม่ได้และหน้าเว็บทั้งแอป 500 ("next/font/google queries have exactly one entry")
  ปล่อยให้ไม่มี weight ตามที่เป็นอยู่
- `preload: false` เพื่อไม่ให้ทุกหน้าโหลดฟอนต์ไทยสองตัวทั้งที่ใช้เฉพาะ `/admin`

## 3. การใส่ธีมให้ทุกหน้าใน dashboard (ตั้งแต่ 23 ต.ค. 2026)

`siet-platform/frontend/src/lib/hooks/use-community-palette.ts` ถูกเรียกจาก `useRouteGate` ใน
`siet-platform/frontend/src/extension.tsx` ซึ่งทำงานทุกหน้าของ dashboard:

```ts
export function useCommunityPalette() {
  useLayoutEffect(() => {
    document.body.classList.add('community-theme')
    return () => document.body.classList.remove('community-theme')
  }, [])
}
```

- class อยู่บน `<body>` ตัวแปรสีจึงไหลลงทุกอย่าง: ตัวหน้า sidebar navbar และ Dialog / AlertDialog /
  DropdownMenu / Tooltip ของ Radix ที่ถูก portal ไปที่ `<body>`
- layout ของ dashboard ไม่ถูก unmount ตอนเปลี่ยนหน้า class จึงหลุดเฉพาะตอนออกจาก dashboard (เช่นไป `/login`)
- `.community-theme` กำหนดโทเค็นครบชุดเดียวกับ `.theme-siet` (`canvas`, `subtle-foreground`, `ai*`,
  `sidebar*`) และเขียนทับสีเขียวของ open-notebook (`--fern*`, `--teal*` ของหน้า notebook, `--sage*` ของ
  sources; `--gold*` ของ notes คงเป็นสีทอง) ให้เป็นชมพู utility ในหน้า admin
  (`bg-canvas`, `bg-ai-soft`, `text-ai` ฯลฯ) จึงใช้ได้เหมือนเดิม แต่ได้สีชมพูแทนดำ/ม่วง
- ผลข้างเคียงที่ติดมากับ `.community-theme`: ซ่อน scrollbar ทุกที่ (ยังเลื่อนได้), การ์ดและปุ่มมีเงา
  (ข้อ 2.3 ใช้กับ `.theme-siet` เท่านั้น)
- layout ของ `/admin` (`siet-platform/.../admin/layout.tsx`) และ `CommunityThemeLayout` ของ `/teacher`,
  `/community/search` เหลือแค่ส่ง `children` ต่อ ห้ามให้ layout ไหนเพิ่มหรือถอด class นี้เอง เพราะการถอด
  ตอนออกจาก route จะทำให้หน้าถัดไปกลับเป็นสีเขียว
- `/community/ask` ยังมี `.theme-adventure` (ชมพู DESIGN.md) ซ้อนอยู่ด้านใน ซึ่งชนะเพราะอยู่ลึกกว่า

**อย่าแก้โทเค็น `:root`** ถ้าจะเปลี่ยนสีหลักให้แก้ที่ `.community-theme` / `.dark .community-theme`

## 4. Sidebar และแบรนด์

`components/layout/AppSidebar.tsx`

- แบรนด์เป็นข้อความ **LSP-SIET** (`t('common.appName')`, ตั้งเป็น "LSP-SIET" ในทุก locale ใน
  `lib/locales/*/index.ts`) ไม่มีโลโก้แล้ว; ไฟล์ `public/logo.svg` ยังอยู่แต่ไม่ถูกใช้
- ตอนพับ (collapsed) เหลือปุ่มไอคอน `Menu` สำหรับกางกลับ (เดิมต้องชี้ที่โลโก้ก่อน)
- `activeHref` = href ที่ยาวที่สุดที่ตรงกับ `pathname` → `/admin` ไม่ติดไฮไลต์ตอนอยู่ `/admin/quiz`
- โครงกลุ่มเมนู: ดู [01-overview.md](01-overview.md) ข้อ 4; key แปล `navigation.manageCommunity`,
  `navigation.manageAi`, `navigation.manageQuiz`, `navigation.adminCommunity/adminRag/adminRoadmap/adminQuiz`
  ยังไม่มีใน locale file — ใช้ค่า fallback ภาษาไทย/อังกฤษที่ส่งเป็นอาร์กิวเมนต์ที่สองของ `t()`
  (ถ้าเพิ่มเข้า locale ต้องเพิ่มครบทุกภาษา มิฉะนั้น `locales/index.test.ts` จะฟ้อง parity)
- ชื่อแท็บเบราว์เซอร์ (`metadata.title` ใน `app/layout.tsx`) ยังเป็น "Open Notebook" — ยังไม่ได้รับคำสั่งให้เปลี่ยน

## 5. หน่วยวัดที่ใช้ซ้ำในทุกหน้า admin

| สิ่งที่ | ค่า |
|---|---|
| ความกว้างเนื้อหา | `max-w-6xl` (1152px) กลางหน้า, padding `p-6` |
| ระยะระหว่างการ์ด | `space-y-5` ระหว่าง header/tabs/เนื้อหา, `gap-3`/`gap-4` ในกริด |
| กริด StatTile | `grid-cols-2 md:grid-cols-4` (5 ใบใช้ `lg:grid-cols-5`) |
| หัวข้อการ์ด | `text-base font-semibold` ใน `CardTitle` |
| ตัวเลขใหญ่ | `text-2xl font-semibold tabular-nums tracking-tight` |
| ข้อความ meta | `text-[11px] text-muted-foreground` |
| ปุ่มลบในแถว | `variant="ghost"` สี `text-muted-foreground hover:text-destructive` (แดงเฉพาะตอนชี้) |
| ปุ่มยืนยันลบใน dialog | `bg-destructive text-white` |
| ป้ายสถานะ (เขียว/เหลือง/แดง) | คงไว้เพราะบอกความหมาย: `text-emerald-600` (ok/+แต้ม), `text-amber-600` (เตือน), `text-destructive` (ผิด/−แต้ม) |
| อีโมจิ | ไม่ใช้ — จำนวนถูกใจ/คอมเมนต์/แชร์ใช้ `PostCounts` (ไอคอนเส้น) |
