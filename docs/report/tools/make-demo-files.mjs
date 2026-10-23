// Demo teaching files for DEMO101 (chapter 4: functions): a slide PDF and a flowchart PNG.
// The PDF uses Thonburi: with other macOS Thai fonts the extracted text loses tone marks.
// The sample-code ZIP was made by hand (`zip -r` of three .py files: grade, is_prime, average).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const DIR = new URL('./demo-files/', import.meta.url).pathname
fs.mkdirSync(DIR, { recursive: true })
const shell = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell')
const browser = await chromium.launch({ executablePath: shell })
const page = await browser.newPage()

const font = `font-family: 'Thonburi', sans-serif;`
const slide = (title, body) => `
  <section><div class="bar">DEMO101 การเขียนโปรแกรมคอมพิวเตอร์ · บทที่ 4</div>
  <h1>${title}</h1>${body}</section>`

const html = `<!doctype html><meta charset="utf-8"><style>
  @page { size: 297mm 167mm; margin: 0 }
  body { margin: 0; ${font} color: #1f2933 }
  section { width: 297mm; height: 167mm; box-sizing: border-box; padding: 14mm 18mm; page-break-after: always; position: relative }
  .bar { font-size: 11pt; color: #2f6b4f; border-bottom: 2px solid #2f6b4f; padding-bottom: 3mm; margin-bottom: 6mm }
  h1 { font-size: 26pt; margin: 0 0 6mm }
  li { font-size: 15pt; line-height: 1.6 }
  pre { font-size: 13pt; background: #f3f5f4; border-left: 4px solid #2f6b4f; padding: 4mm 6mm; line-height: 1.5 }
  .cover { display: flex; flex-direction: column; justify-content: center; background: #2f6b4f; color: #fff }
  .cover h1 { font-size: 34pt } .cover p { font-size: 16pt; margin: 0 }
</style>
<section class="cover"><p>DEMO101 การเขียนโปรแกรมคอมพิวเตอร์</p><h1>บทที่ 4: ฟังก์ชัน</h1><p>อ.ธนากร วงศ์สวัสดิ์ · ภาคการศึกษาที่ 2/2569</p></section>
${slide('ฟังก์ชันคืออะไร', `<ul>
  <li>ฟังก์ชัน (function) คือกลุ่มคำสั่งที่ตั้งชื่อไว้ เรียกใช้ซ้ำได้หลายครั้ง</li>
  <li>ช่วยแบ่งโปรแกรมใหญ่เป็นส่วนย่อย อ่านง่าย และแก้ไขจุดเดียว</li>
  <li>ใน Python ประกาศด้วยคำสั่ง <b>def</b> ตามด้วยชื่อฟังก์ชันและพารามิเตอร์</li>
  <li>คำสั่ง <b>return</b> ส่งค่ากลับไปยังจุดที่เรียกใช้</li></ul>`)}
${slide('พารามิเตอร์และค่าที่ส่งกลับ', `<pre>def area_of_rectangle(width, height):
    """คืนค่าพื้นที่ของสี่เหลี่ยมผืนผ้า"""
    return width * height

print(area_of_rectangle(4, 5))   # 20</pre><ul>
  <li>พารามิเตอร์ (parameter) คือตัวแปรที่รับค่าเข้ามาในฟังก์ชัน</li>
  <li>อาร์กิวเมนต์ (argument) คือค่าจริงที่ส่งตอนเรียกใช้</li></ul>`)}
${slide('ขอบเขตของตัวแปร (scope)', `<ul>
  <li>ตัวแปรที่สร้างในฟังก์ชันเป็นตัวแปรเฉพาะที่ (local) ใช้ได้เฉพาะในฟังก์ชันนั้น</li>
  <li>ตัวแปรที่สร้างนอกฟังก์ชันเป็นตัวแปรส่วนกลาง (global)</li>
  <li>ควรส่งค่าผ่านพารามิเตอร์และ return แทนการแก้ตัวแปร global</li></ul>
  <pre>def add_vat(price):
    vat = price * 0.07      # vat เป็นตัวแปร local
    return price + vat</pre>`)}
${slide('แบบฝึกหัดท้ายบท', `<ul>
  <li>เขียนฟังก์ชัน <b>grade(score)</b> คืนเกรด A–F ตามช่วงคะแนน</li>
  <li>เขียนฟังก์ชัน <b>is_prime(n)</b> ตรวจว่าเป็นจำนวนเฉพาะหรือไม่</li>
  <li>เขียนฟังก์ชัน <b>average(numbers)</b> หาค่าเฉลี่ยของลิสต์ตัวเลข</li>
  <li>ส่งงานเป็นไฟล์ .py ในห้อง DEMO101 ภายในสัปดาห์ที่ 6</li></ul>`)}`
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({ path: DIR + 'DEMO101-บทที่4-ฟังก์ชัน.pdf', width: '297mm', height: '167mm', printBackground: true })

// Flowchart of a for loop, as a teaching image.
await page.setViewportSize({ width: 900, height: 620 })
await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;${font}">
<svg width="900" height="620" viewBox="0 0 900 620" xmlns="http://www.w3.org/2000/svg" font-size="18" fill="#1f2933">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#2f6b4f"/></marker></defs>
  <text x="450" y="40" text-anchor="middle" font-size="24" font-weight="700">ผังงานการทำงานของลูป for</text>
  <g stroke="#2f6b4f" stroke-width="2.5" fill="#eef5f1">
    <rect x="370" y="70" width="160" height="50" rx="25"/>
    <rect x="320" y="160" width="260" height="56"/>
    <path d="M450 250 L570 310 L450 370 L330 310 Z"/>
    <rect x="320" y="410" width="260" height="56"/>
    <rect x="370" y="530" width="160" height="50" rx="25"/>
  </g>
  <g text-anchor="middle">
    <text x="450" y="101">เริ่มต้น</text>
    <text x="450" y="194">i = ค่าแรกใน range(n)</text>
    <text x="450" y="306">ยังมีค่า i</text><text x="450" y="328">เหลืออยู่?</text>
    <text x="450" y="444">ทำคำสั่งในลูป</text>
    <text x="450" y="561">จบการทำงาน</text>
    <text x="465" y="397" text-anchor="start" fill="#2f6b4f">ใช่</text>
    <text x="640" y="300" fill="#b42318">ไม่ใช่</text>
    <text x="175" y="300" fill="#2f6b4f">i = ค่าถัดไป</text>
  </g>
  <g stroke="#2f6b4f" stroke-width="2.5" fill="none" marker-end="url(#a)">
    <path d="M450 120 V158"/><path d="M450 216 V248"/><path d="M450 370 V408"/>
    <path d="M320 438 H170 V310 H328"/>
    <path d="M570 310 H700 V555 H532"/>
  </g>
</svg></body>`)
await page.screenshot({ path: DIR + 'ผังงานลูป-for.png' })
await browser.close()
console.log(fs.readdirSync(DIR))
