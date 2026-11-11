# 3.7 การออกแบบฐานข้อมูลและสถาปัตยกรรมแบบหลายโมเดล

## 3.7.1 แนวคิดสถาปัตยกรรมฐานข้อมูล

ระบบใช้ฐานข้อมูลหลายรูปแบบเพื่อเลือกชนิดการจัดเก็บให้เหมาะกับลักษณะข้อมูล MariaDB ใช้สำหรับข้อมูลบัญชี ธุรกรรม และข้อมูลคอมมูนิตี้ที่ต้องการโครงสร้างเชิงสัมพันธ์ SurrealDB ใช้จัดเก็บข้อมูล notebook, source, embedding และเซสชันที่เกี่ยวข้องกับ AI ส่วน Redis ทำหน้าที่สนับสนุนการแคช และพื้นที่จัดเก็บไฟล์แบบ persistent ใช้เก็บไฟล์ที่อัปโหลดและข้อมูลประกอบการทำงานของบริการ

ในแผนภาพ Data Store ที่ใช้ในบทนี้ D1 (Users DB) และ D2 (Community DB) เป็นโดเมนข้อมูลเชิงตรรกะที่อยู่บนบริการ MariaDB เดียวกัน ไม่ใช่ฐานข้อมูล MariaDB สองเครื่อง D3 (Storage) หมายถึงพื้นที่ไฟล์และข้อมูลถาวรของบริการ โดย PocketBase ที่ติดตั้งคู่กับแอป Roadmap แบบ standalone มีพื้นที่จัดเก็บของตนเอง ส่วน D4 (AI Vector DB) หมายถึง SurrealDB ซึ่งเป็นแหล่งข้อมูลหลักสำหรับ notebook, source และเวกเตอร์ที่ใช้ค้นคืน ในการติดตั้งมี Redis เพิ่มเติมเป็น cache layer แต่ไม่ควรจัดรวมกับ D4 เนื่องจากมีหน้าที่และรูปแบบการจัดเก็บต่างกัน

## 3.7.2 พจนานุกรมข้อมูล MariaDB

สคีมาปัจจุบันเปลี่ยนชื่อบางตารางจากแบบจำลองในเอกสารเดิม โดย `courses` เปลี่ยนเป็น `rooms`, `course_members` เป็น `room_members`, `saved_items` เป็น `saved_posts`, `quiz_plays` เป็น `quiz_attempts` และ `rag_sessions` ที่ใช้บันทึกเครดิตเปลี่ยนเป็น `rag_credit_sessions` ดังนั้นในเนื้อหาต่อไปนี้ใช้ชื่อที่ตรงกับ implementation ปัจจุบัน และระบุชื่อเดิมเฉพาะเพื่อให้เทียบกับเอกสารก่อนหน้าได้

| ตาราง | คีย์และฟิลด์สำคัญ | หน้าที่ |
|---|---|---|
| `users` | `id`, `username`, `password_hash`, `display_name`, `role`, `email`, `google_sub`, `avatar_url`, `student_code`, `points_balance`, `library_notebook_id`, `disabled`, `suspend_reason`, `suspended_until`, `created_at`, `updated_at`, `last_login_at` | ข้อมูลบัญชี บทบาท สถานะ และยอดแต้มของผู้ใช้ |
| `allowed_teachers` | `id`, `email`, `role`, `department`, `created_at` | รายชื่อและข้อมูลผู้สอนที่ได้รับอนุญาต |
| `point_transactions` | `id`, `user_id`, `delta`, `balance_after`, `kind`, `ref_type`, `ref_id`, `note`, `created_at` | สมุดบัญชีการรับ ใช้ คืน หรือปรับแต้ม |
| `rooms` | `id`, `code`, `name`, `description`, `kind`, `category_id`, `term`, `join_code`, `status`, `is_private`, `created_by`, `library_notebook_id`, `created_at`, `archived_at` | ห้องรายวิชาหรือห้องชมรม ตลอดจนสถานะและการตั้งค่าการเข้าถึง |
| `categories` | `id`, `slug`, `name`, `name_en`, `sort_order`, `created_at` | หมวดหมู่สำหรับจัดกลุ่มห้อง |
| `room_members` | `room_id`, `user_id`, `role`, `joined_at` | สมาชิกห้องและสถานะ `member` หรือ `ta` |
| `posts` | `id`, `author_id`, `room_id`, `type`, `title`, `content`, `tags`, `visibility`, ฟิลด์ไฟล์แนบ, `linked_type`, `linked_id`, `linked_snapshot`, ตัวนับกิจกรรม, `cashback_earned`, `content_hash`, `is_deleted`, `created_at`, `updated_at` | โพสต์เนื้อหา คำถาม สื่อการสอน และโพสต์ที่เชื่อมกับ Quiz/Roadmap |
| `post_comments` | `id`, `post_id`, `author_id`, `parent_id`, `content`, `created_at` | ความคิดเห็นและการตอบกลับความคิดเห็นหลัก |
| `post_reactions` | `post_id`, `user_id`, `kind`, `created_at` | รีแอ็กชัน `like` หรือ `helpful` โดยคีย์ประกอบป้องกันการบันทึกซ้ำ |
| `post_shares` | `post_id`, `user_id`, `created_at` | ระเบียนการแชร์ โดยมีคีย์ประกอบระหว่างโพสต์กับผู้แชร์ |
| `saved_posts` | `user_id`, `post_id`, `created_at` | รายการโพสต์ที่ผู้ใช้บันทึกไว้ (ชื่อเดิม `saved_items`) |
| `saved_collections` | `id`, `user_id`, `name`, `created_at` | กลุ่มรายการบันทึกซึ่งมีชื่อไม่ซ้ำภายในเจ้าของคนเดียว |
| `saved_collection_posts` | `collection_id`, `user_id`, `post_id`, `created_at` | ความสัมพันธ์ระหว่างกลุ่มรายการบันทึกกับโพสต์ |
| `quiz_attempts` | `id`, `post_id`, `user_id`, `score`, `question_count`, `completed`, `cashback_paid`, `created_at`, `completed_at` | ประวัติการทำ Quiz ที่เชื่อมจากโพสต์ |
| `notifications` | `id`, `recipient_id`, `kind`, `message`, `post_id`, `actor_id`, `is_read`, `created_at` | การแจ้งเตือนกิจกรรมในระบบ |
| `library_documents` | `id`, `owner_id`, `scope`, `room_id`, `notebook_id`, `source_id`, `title`, `kind`, `filename`, `file_path`, `mime`, `size`, `status`, `error`, `chunk_count`, `char_count`, `post_id`, `content_hash`, `created_at`, `updated_at` | ข้อมูลกำกับเอกสารและสถานะการนำเข้า โดยเชื่อมไปยัง notebook/source ใน SurrealDB |
| `rag_credit_sessions` | `id`, `user_id`, `credits_left`, `messages`, `created_at`, `updated_at` | จำนวนเครดิตข้อความที่เหลือในเซสชัน RAG แบบคิดแต้ม ไม่ใช่ตารางประวัติสนทนาหลัก |
| `rag_conversations` | `id`, `user_id`, `title`, `scope_label`, `message_count`, `created_at`, `updated_at` | ข้อมูลเซสชันสนทนา RAG ที่ผู้ใช้สามารถกลับมาเปิดต่อ |
| `rag_messages` | `id`, `conversation_id`, `role`, `content`, `answer_meta`, `created_at` | ข้อความในบทสนทนาและเมตาดาต้าคำตอบ/การอ้างอิง |
| `llm_usage` | `id`, `user_id`, `feature`, `kind`, `provider`, `model`, จำนวน token และการค้นเว็บ, `cost_usd`, `latency_ms`, `estimated`, `created_at` | บันทึกการใช้งานโมเดลและข้อมูลประกอบการวิเคราะห์การใช้ทรัพยากร |
| `content_reports` | `id`, `reporter_id`, `target_type`, `target_id`, `room_id`, `reason`, `detail`, `status`, `action`, `reviewed_by`, `reviewed_at`, `created_at` | รายงานโพสต์ ความคิดเห็น ผู้ใช้ หรือเอกสาร พร้อมสถานะการตรวจสอบ |
| `admin_audit_log` | `id`, `actor_id`, `action`, `target_type`, `target_id`, `detail`, `created_at` | ประวัติการดำเนินการของผู้ดูแลหรือผู้จัดการห้อง |

## 3.7.3 พจนานุกรมข้อมูล SurrealDB และบริการจัดเก็บประกอบ

| เอนทิตี | ข้อมูลสำคัญ | หน้าที่และความสัมพันธ์ |
|---|---|---|
| `notebook` | `id`, `name`, `description`, `owner_id`, `archived`, `knowledge_version`, เวลาสร้างและแก้ไข | กลุ่มสมุดความรู้ส่วนบุคคลหรือของรายวิชา มี source หรือ note ที่เกี่ยวข้อง |
| `source` | `id`, `notebook_id`, `owner_id`, `title`, `asset`, `full_text`, `topics`, `command`, `knowledge_version` | แหล่งข้อมูลที่ผ่านการนำเข้าและประมวลผล |
| `source_embedding` | `id`, `source`, `order`, `content`, `embedding` | ชิ้นข้อความที่เรียงตามลำดับและเวกเตอร์ที่ใช้ค้นความคล้ายคลึง |
| `source_insight` | `id`, `source_id`, `insight_type`, `content` และเวกเตอร์เมื่อมี | สรุปหรือข้อค้นพบจากแหล่งข้อมูล |
| `note` | `id`, `notebook_id`, `title`, `note_type`, `content`, `owner_id` | บันทึกของผู้ใช้หรือบันทึกที่ระบบสร้าง |
| `chat_session`, `global_chat_session` | `id`, `notebook_id` ตามประเภท, `title`, `model_override`, `owner_id` | เซสชันสนทนาที่เกี่ยวข้องกับ notebook หรือบทสนทนาทั่วไป |
| `quiz_session` | `id`, `owner_id`, `topic`, `language`, `question_count`, `questions`, `notebook_id`, `model_id`, `prompt_hash` | ผลลัพธ์และสถานะการสร้างแบบทดสอบ |
| `roadmap_session` | `id`, `owner_id`, `title`, `description`, `language`, `node_count`, `nodes`, `edges`, `notebook_id`, `model_id`, `settings`, `grounding` | แผนการเรียนแบบโหนดและเส้นเชื่อม พร้อมข้อมูลขอบเขตความรู้ที่ใช้สร้าง |
| `reference`, `artifact`, `refers_to` | ระเบียนความสัมพันธ์ระหว่างเอนทิตี | ใช้เชื่อมแหล่งข้อมูล สมุดความรู้ และวัตถุที่เกี่ยวข้องในแบบจำลองกราฟ |
| `credential`, `transformation`, `default_models` | ข้อมูลรับรอง ผู้ดำเนินการแปลงข้อมูล และการตั้งค่าโมเดล | องค์ประกอบประกอบการทำงานของ Open Notebook และการเรียกใช้โมเดล |

PocketBase มีฐานข้อมูลภายในของบริการและบันทึกข้อมูลถาวรใน `pb_data` โดยแอปพลิเคชันแบบ standalone สามารถใช้ collections เช่น `users`, `roadmaps`, `nodes` และ `edges` อย่างไรก็ดี เซสชัน Roadmap ของฟีเจอร์ที่รวมอยู่ใน API หลักถูกบันทึกเป็น `roadmap_session` ใน SurrealDB ตามโดเมนโมเดลปัจจุบัน จึงควรแยกการกล่าวถึง PocketBase ออกจากฐานข้อมูลหลักของ KMITL RAG และฟีเจอร์เซสชัน AI ที่รวมอยู่ในแพลตฟอร์ม

## 3.7.4 ความสัมพันธ์ของข้อมูลและข้อกำหนดสำคัญ

รูปที่ 3.0.14 แสดงความสัมพันธ์ภายใน MariaDB เช่น ผู้ใช้หนึ่งคนมีรายการแต้มและโพสต์ได้หลายรายการ ห้องหนึ่งมีสมาชิกและโพสต์ได้หลายรายการ โพสต์หนึ่งรายการมีความคิดเห็น รีแอ็กชัน การแชร์ และรายการทำแบบทดสอบได้หลายรายการ และผู้ใช้หนึ่งคนมีบทสนทนา RAG ซึ่งประกอบด้วยข้อความหลายรายการ นอกจากนี้ `library_documents` เชื่อมกับเอกสารใน SurrealDB ส่วน `users.library_notebook_id` และ `rooms.library_notebook_id` ชี้ไปยัง notebook ที่เกี่ยวข้อง ขณะที่ `posts.linked_id` ใช้อ้างถึง `quiz_session` หรือ `roadmap_session` ตาม `linked_type`

การเชื่อมโยงระหว่าง MariaDB กับ SurrealDB เป็น **Logical Foreign Keys** ไม่ใช่ข้อกำหนด `FOREIGN KEY` ที่บังคับโดย relational engine ตัวอย่างเช่น `library_documents.notebook_id` และ `source_id` ใช้เก็บรหัสระเบียนใน SurrealDB และ `owner_id` ของเซสชัน AI เชื่อมกับรหัสผู้ใช้ใน MariaDB ในรูปข้อความ การตรวจสอบความมีอยู่ของข้อมูลปลายทาง การจำกัดเจ้าของ และการจัดการการลบหรือเปลี่ยนสถานะจึงดำเนินการโดยโค้ดแอปพลิเคชันและ repository ที่เกี่ยวข้อง

ข้อกำหนดสำคัญภายในฐานข้อมูลประกอบด้วยคีย์หลักของแต่ละตาราง ดัชนีสำหรับการค้นหาและกรอง และข้อกำหนด unique เช่น `users.username`, `users.email`, `users.google_sub`, `rooms.code` และชื่อกลุ่มบันทึกที่ไม่ซ้ำภายในผู้ใช้คนเดียว ตาราง `room_members`, `post_reactions`, `post_shares`, `saved_posts` และ `saved_collection_posts` ใช้คีย์หลักแบบประกอบเพื่อป้องกันการเพิ่มความสัมพันธ์เดิมซ้ำ ส่วนค่าประเภทเนื้อหา การมองเห็น สถานะเอกสาร บทบาทสมาชิก และสถานะรายงานถูกจำกัดด้วยชนิดข้อมูลหรือการตรวจสอบในชั้นแอปพลิเคชัน

ระบบยังใช้ข้อกำหนดระดับแอปพลิเคชันเพื่อรักษาความถูกต้องของข้อมูล ได้แก่ การตรวจสอบสิทธิ์เจ้าของ/ผู้ช่วยสอนก่อนจัดการคลังรายวิชา การตรวจเจ้าของเซสชันก่อนอ่านหรือลบ Quiz/Roadmap การตรวจสถานะสมาชิกก่อนอ่านเนื้อหาห้องส่วนตัว การจำกัดจำนวนคำถามและโหนดตาม schema ของ API และการตรวจยอดแต้มก่อนหัก ด้วยเหตุที่ไม่มี physical foreign key ครอบคลุมทุกความสัมพันธ์ จึงต้องพิจารณาทั้งโครงสร้างฐานข้อมูลและกฎใน service layer ประกอบกันเมื่ออธิบายความถูกต้องของข้อมูลและความสอดคล้องของ ER Diagram
