// Evaluation corpus for report section 4.6.3: three course documents whose facts exist nowhere
// else, so a correct answer can only come from retrieval (not from the model's prior knowledge).
// The facts are made up for the test (course IT46-201, internship unit IT46); questions and
// expected answers live in ../eval/rag_questions.json.
//
//   node make-eval-corpus.mjs        # writes ../eval/corpus/*.pdf
//
// Thonburi keeps Thai tone marks intact when the PDF text is extracted (see make-demo-files.mjs).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const DIR = new URL('../eval/corpus/', import.meta.url).pathname
fs.mkdirSync(DIR, { recursive: true })
const shell = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell')

const css = `<style>
  @page { size: A4; margin: 18mm 20mm }
  body { font-family: 'Thonburi', sans-serif; font-size: 12.5pt; line-height: 1.65; color: #1f2933 }
  h1 { font-size: 19pt; margin: 0 0 2mm } h2 { font-size: 14.5pt; margin: 6mm 0 2mm; color: #8a1f4c }
  .meta { color: #52606d; margin-bottom: 4mm } table { border-collapse: collapse; width: 100% }
  td, th { border: 1px solid #9aa5b1; padding: 1.5mm 3mm; text-align: left; vertical-align: top } th { background: #f5f7fa }
</style>`

const docs = {
  'IT46-201-ประมวลรายวิชา.pdf': `<h1>ประมวลรายวิชา IT46-201 การพัฒนาเว็บแอปพลิเคชัน</h1>
<div class="meta">ภาคการศึกษาที่ 2 ปีการศึกษา 2569 · 3 หน่วยกิต (2-2-5) · หลักสูตรเทคโนโลยีสารสนเทศ</div>
<h2>1. ผู้สอนและเวลาเรียน</h2>
<p>ผู้สอน: อาจารย์ศิริพร มณีวงศ์ ห้องพักอาจารย์ อาคาร 12 ห้อง 1207 ชั่วโมงให้คำปรึกษาทุกวันพุธ เวลา 13:00–15:00 น. หรือนัดหมายล่วงหน้าทางอีเมล</p>
<p>เวลาเรียน: ภาคบรรยายวันอังคาร 09:00–12:00 น. และภาคปฏิบัติการวันพฤหัสบดี 13:00–15:00 น. ที่ห้อง 1204 อาคาร 12</p>
<h2>2. เกณฑ์การให้คะแนน</h2>
<table><tr><th>องค์ประกอบ</th><th>สัดส่วน</th></tr>
<tr><td>งานปฏิบัติการรายสัปดาห์</td><td>20%</td></tr><tr><td>โครงงานกลุ่ม</td><td>30%</td></tr>
<tr><td>สอบกลางภาค</td><td>20%</td></tr><tr><td>สอบปลายภาค</td><td>25%</td></tr>
<tr><td>การเข้าชั้นเรียน</td><td>5%</td></tr><tr><td>รวม</td><td>100%</td></tr></table>
<p>เกณฑ์ระดับคะแนน: A ตั้งแต่ 80 คะแนนขึ้นไป, B+ 75–79, B 70–74, C+ 65–69, C 60–64, D+ 55–59, D 50–54 และ F ต่ำกว่า 50 คะแนน</p>
<h2>3. ข้อกำหนดของรายวิชา</h2>
<p>นักศึกษาต้องเข้าชั้นเรียนไม่น้อยกว่าร้อยละ 80 ของเวลาเรียนทั้งหมดจึงจะมีสิทธิ์สอบปลายภาค</p>
<p>การส่งงานล่าช้าจะถูกหักคะแนนวันละ 10% ของคะแนนเต็มของงานชิ้นนั้น และรับงานล่าช้าได้ไม่เกิน 3 วัน หลังจากนั้นได้ 0 คะแนน</p>
<p>โครงงานกลุ่มทำกลุ่มละ 3–4 คน พัฒนาเว็บแอปพลิเคชันด้วย Next.js และ FastAPI และนำเสนอในสัปดาห์ที่ 15</p>
<h2>4. แผนการสอน</h2>
<table><tr><th>สัปดาห์</th><th>หัวข้อ</th></tr>
<tr><td>1</td><td>HTML และ CSS เบื้องต้น</td></tr><tr><td>2</td><td>JavaScript พื้นฐาน</td></tr>
<tr><td>3</td><td>DOM และการจัดการเหตุการณ์</td></tr><tr><td>4</td><td>คอมโพเนนต์ของ React</td></tr>
<tr><td>5</td><td>State และ Hooks</td></tr><tr><td>6</td><td>การกำหนดเส้นทางใน Next.js</td></tr>
<tr><td>7</td><td>การเรียก API ด้วย fetch</td></tr><tr><td>8</td><td>สอบกลางภาค (ครอบคลุมสัปดาห์ที่ 1–7)</td></tr>
<tr><td>9</td><td>สร้าง REST API ด้วย FastAPI</td></tr><tr><td>10</td><td>ฐานข้อมูลด้วย SQLAlchemy</td></tr>
<tr><td>11</td><td>การยืนยันตัวตนด้วย JWT</td></tr><tr><td>12</td><td>การทดสอบซอฟต์แวร์ด้วย pytest และ Vitest</td></tr>
<tr><td>13</td><td>คอนเทนเนอร์ด้วย Docker</td></tr><tr><td>14</td><td>การนำระบบขึ้นใช้งานจริง</td></tr>
<tr><td>15</td><td>นำเสนอโครงงานกลุ่ม</td></tr><tr><td>16</td><td>ทบทวนเนื้อหา</td></tr>
<tr><td>17</td><td>สอบปลายภาค</td></tr></table>`,

  'IT46-คู่มือการฝึกงาน-2569.pdf': `<h1>คู่มือการฝึกงานภาคฤดูร้อน ปีการศึกษา 2569</h1>
<div class="meta">หน่วยฝึกงาน IT46 · หลักสูตรเทคโนโลยีสารสนเทศ</div>
<h2>1. คุณสมบัติของผู้ฝึกงาน</h2>
<p>นักศึกษาชั้นปีที่ 3 ที่สอบผ่านรายวิชาสะสมไม่น้อยกว่า 90 หน่วยกิต และมีเกรดเฉลี่ยสะสมไม่ต่ำกว่า 2.00</p>
<h2>2. ระยะเวลาและการยื่นคำร้อง</h2>
<p>ต้องฝึกงานไม่น้อยกว่า 240 ชั่วโมง หรือประมาณ 6 สัปดาห์ ในสถานประกอบการที่หน่วยฝึกงานรับรอง</p>
<p>ยื่นคำร้องขอฝึกงานภายในวันที่ 31 มกราคม 2570 พร้อมเอกสารดังนี้</p>
<table><tr><th>แบบฟอร์ม</th><th>ชื่อเอกสาร</th><th>ส่งเมื่อ</th></tr>
<tr><td>IT46-F01</td><td>ใบสมัครฝึกงาน</td><td>พร้อมคำร้อง</td></tr>
<tr><td>IT46-F02</td><td>หนังสือตอบรับจากสถานประกอบการ</td><td>ก่อนเริ่มฝึกงาน 2 สัปดาห์</td></tr>
<tr><td>IT46-F03</td><td>บันทึกการปฏิบัติงานรายสัปดาห์</td><td>ทุกวันศุกร์ก่อนเวลา 18:00 น.</td></tr></table>
<h2>3. ระหว่างการฝึกงาน</h2>
<p>นักศึกษาลาป่วยได้ไม่เกิน 3 วันตลอดการฝึกงาน และต้องฝึกงานชดเชยให้ครบจำนวนชั่วโมง อาจารย์นิเทศจะติดตามการฝึกงานอย่างน้อย 1 ครั้ง ซึ่งอาจเป็นการนิเทศแบบออนไลน์</p>
<h2>4. การประเมินผล</h2>
<p>คะแนนประกอบด้วย การประเมินจากพี่เลี้ยงในสถานประกอบการ 60% รายงานฉบับสมบูรณ์ 25% และการนำเสนอผลการฝึกงาน 15% ผู้ที่ได้คะแนนรวมตั้งแต่ 60 คะแนนขึ้นไปได้ผลการเรียน S (ผ่าน) ต่ำกว่านั้นได้ U (ไม่ผ่าน)</p>
<p>ส่งรายงานฉบับสมบูรณ์ภายใน 2 สัปดาห์หลังสิ้นสุดการฝึกงาน</p>
<h2>5. ผู้ประสานงาน</h2>
<p>อาจารย์ประวิทย์ สุขสันต์ อีเมล internship@it46.example</p>`,

  'IT46-DS-Stacks-and-Queues.pdf': `<h1>Data Structures Handout: Stacks and Queues</h1>
<div class="meta">Course IT46-105 · Week 5 · All lab code in this course uses Python 3.12</div>
<h2>1. Stack</h2>
<p>A stack is a last-in, first-out (LIFO) collection. push, pop and peek all run in O(1) time. Typical uses are undo histories, the function call stack and evaluating postfix expressions. Example: the postfix expression "5 3 + 2 *" evaluates to 16.</p>
<h2>2. Queue</h2>
<p>A queue is a first-in, first-out (FIFO) collection. With a circular buffer, enqueue and dequeue run in O(1). Breadth-first search and print spooling use queues.</p>
<p>In our lab the circular queue has a capacity of 8 slots. One slot is always left empty to tell a full queue from an empty one, so it holds at most 7 items. The queue is full when (rear + 1) % capacity == front.</p>
<h2>3. Priority queue and deque</h2>
<p>A priority queue built on a binary heap inserts in O(log n) and removes the minimum in O(log n). A deque (double-ended queue) allows insertion and removal at both ends.</p>
<h2>4. Lab 5</h2>
<p>Implement a stack using two queues. Submit a single file named stack_queue.py before the end of week 6. Submissions are checked by an autograder that runs 12 hidden test cases.</p>`,
}

const browser = await chromium.launch({ executablePath: shell })
const page = await browser.newPage()
for (const [name, body] of Object.entries(docs)) {
  await page.setContent(`<!doctype html><meta charset="utf-8">${css}${body}`, { waitUntil: 'load' })
  await page.pdf({ path: path.join(DIR, name), format: 'A4', printBackground: true })
  console.log('wrote', name)
}
await browser.close()
