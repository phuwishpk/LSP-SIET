# docs/report/eval — ชุดทดสอบของหัวข้อ 4.6

สคริปต์และผลการทดสอบที่ใช้ในเล่มหัวข้อ 4.6 (`../4.6-integration-testing.md`) รันกับสภาพแวดล้อมทดสอบที่แยกจากระบบใช้งานจริง

| ไฟล์ | ใช้ทำอะไร | ผลลัพธ์ |
|---|---|---|
| `test_stack.py` | ตั้ง/ลบคอนเทนเนอร์ทดสอบ `siet46-*` บนฐานข้อมูล `siettest-*` สร้างบัญชี `it46.*` และห้องวิชา IT46-201 พร้อมเอกสาร | – |
| `api_contract.py` | 4.6.1: จับคู่ทุกคำสั่งเรียก API ในโค้ดฝั่งหน้ากับ OpenAPI ของระบบ | `results/api_contract.json`, `.txt` |
| `integration_test.py` | 4.6.1: เรียก API ตามสถานการณ์ใช้งานทุกโมดูลและทุกบทบาท แล้วลบข้อมูลที่สร้าง | `results/integration_test.json`, `.log` |
| `../tools/e2e-4.6.mjs` | 4.6.1: เปิดทุกหน้าจอในเบราว์เซอร์และตรวจคำขอ API / ข้อผิดพลาด JS | `results/e2e.json`, รูป 4.22 |
| `../tools/lcp-4.6.mjs` | 4.6.1: วัด Largest Contentful Paint ของหน้าจอชุดเดียวกัน 3 รอบ เทียบเกณฑ์ Core Web Vitals | `results/lcp.json` |
| `rag_eval.py` + `rag_questions.json` | ประเมิน KMITL RAG AI 30 คำถาม × 2 รูปแบบ + แคช (ไม่อยู่ในเล่ม หัวข้อ 4.6.3 ถูกตัดออก) | `results/rag_eval.json`, `.log` |
| `ai_features_eval.py` | ประเมินการค้นหาเอกสาร, AI Quiz, AI Roadmap, My-ai-quiz (ไม่อยู่ในเล่ม) | `results/{search,quiz,roadmap,solo}_eval.json` |
| `cleanup_test_data.py` | ลบข้อมูลที่การทดสอบทิ้งไว้ (`--all` ลบห้องและบัญชีทดสอบทั้งหมด) | – |
| `corpus/` | เอกสาร 3 ฉบับที่สร้างด้วย `../tools/make-eval-corpus.mjs` | – |
| `results/*_manual_review.json` | ผลการตรวจคำตอบและข้อสอบทีละข้อเทียบกับเอกสาร (ของการประเมิน AI ซึ่งไม่อยู่ในเล่ม) | – |

ผลการทดสอบระดับหน่วย (4.6.2) อยู่ใน `results/backend-*` และ `results/frontend-*` ได้จาก `make test-backend` (ตั้ง `PYTHON_DOTENV_DISABLED=1` เสมอ) และ `make test-frontend` บนเครื่อง ห้ามรันชุดทดสอบภายในคอนเทนเนอร์ของระบบใช้งานจริง

## รันซ้ำ

```bash
cd docs/report/eval
python3 test_stack.py up
export IT46_PW='<รหัสผ่านบัญชีทดสอบ>' IT46_ADMIN_PW='<รหัสผ่าน it46.admin>'
python3 test_stack.py accounts
python3 test_stack.py corpus          # พิมพ์ --course และ --docs ที่ต้องใช้ต่อ
curl -s http://localhost:25055/openapi.json -o results/openapi.json && python3 api_contract.py
python3 integration_test.py --course <id>
(cd ../tools && node e2e-4.6.mjs && node lcp-4.6.mjs)
# ไม่บังคับ (ไม่อยู่ในเล่ม): ประเมินโมเดล AI
python3 rag_eval.py --course <id> --docs syllabus=<id>,intern=<id>,ds=<id>
python3 ai_features_eval.py search quiz roadmap --course <id> --docs syllabus=<id>,intern=<id>,ds=<id>
python3 cleanup_test_data.py --all && python3 test_stack.py down
```

ต้องมี Python 3 + `requests` และ `playwright-core` ใน `../tools/node_modules` คำตอบของโมเดลไม่คงที่ ผลการรันแต่ละรอบจึงต่างกันได้เล็กน้อย
