# 🗄️ Database Architecture & ER Diagram Guide (Full Report)

เอกสารฉบับนี้เป็นการรวมศูนย์ข้อมูล **(1) Master Data Dictionary (โครงสร้างคอลัมน์ทั้งหมด)**, **(2) Entity Relationship Guide (หน้าที่และการเชื่อมโยง)** และ **(3) DBML Code สำหรับใช้สร้าง ER Diagram** ของฐานข้อมูลทั้ง 4 ระบบในโปรเจกต์ KMITL AI เอาไว้ในที่เดียว เพื่อให้ทีม Data หรือ System Analyst ใช้เป็น **Single Source of Truth** 

---

## 📖 ส่วนที่ 1: Master Data Dictionary (ฉบับสมบูรณ์ ทุกตาราง ทุกคอลัมน์)

### 🐘 1. MariaDB (Core SQL Database)
> เก็บข้อมูลบัญชีผู้ใช้, ระบบโซเชียล, และการโอนแต้มทั้งหมด

#### 1.1 `users`
| Column | Type | Null | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | INT (PK) | ❌ | - | รหัสผู้ใช้ (Auto Increment) |
| `username` | VARCHAR(32) | ❌ | - | ชื่อบัญชี |
| `password_hash` | VARCHAR(255) | ✅ | NULL | รหัสผ่าน (เข้ารหัสแล้ว) |
| `display_name` | VARCHAR(128) | ✅ | NULL | ชื่อที่แสดงผล |
| `role` | ENUM | ❌ | 'student' | admin, student, teacher |
| `email` | VARCHAR(191) | ✅ | NULL | อีเมล |
| `google_sub` | VARCHAR(64) | ✅ | NULL | รหัสผู้ใช้จาก Google (OAuth) |
| `avatar_url` | VARCHAR(512) | ✅ | NULL | ลิงก์รูปโปรไฟล์ |
| `student_code` | VARCHAR(32) | ✅ | NULL | รหัสนักศึกษา |
| `points_balance` | INT | ❌ | 0 | แต้มสะสมปัจจุบัน |
| `library_notebook_id`| VARCHAR(128) | ✅ | NULL | ID โยงหาสมุดโน้ตฝั่ง SurrealDB |
| `disabled` | TINYINT(1) | ❌ | 0 | สถานะระงับบัญชี (0=ปกติ) |
| `created_at` | DATETIME | ✅ | NOW() | วันที่สมัคร |
| `updated_at` | DATETIME | ✅ | ON UPDATE | วันที่แก้ไขล่าสุด |
| `last_login_at` | DATETIME | ✅ | NULL | วันที่ล็อกอินล่าสุด |

#### 1.2 `point_transactions`
| Column | Type | Null | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | BIGINT (PK)| ❌ | - | รหัสธุรกรรม (Auto Increment) |
| `user_id` | INT | ❌ | - | รหัสเจ้าของแต้ม |
| `delta` | INT | ❌ | - | แต้มที่เพิ่มหรือลด |
| `balance_after` | INT | ❌ | - | แต้มคงเหลือสุทธิหลังทำรายการ |
| `kind` | VARCHAR(32)| ❌ | - | ประเภท (rag_session, quiz_import, ฯลฯ) |
| `ref_type` | VARCHAR(32)| ✅ | NULL | ประเภทอ้างอิง (เช่น post) |
| `ref_id` | VARCHAR(128)| ✅ | NULL | ID ของสิ่งที่ใช้อ้างอิง |
| `note` | VARCHAR(255)| ✅ | NULL | หมายเหตุเพิ่มเติม |
| `created_at` | DATETIME | ✅ | NOW() | เวลาที่ทำรายการ |

#### 1.3 `rooms` (อดีต courses)
| Column | Type | Null | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | INT (PK) | ❌ | - | รหัสห้อง (Auto Increment) |
| `code` | VARCHAR(32) | ❌ | - | รหัสวิชา (Unique) |
| `name` | VARCHAR(128) | ❌ | - | ชื่อห้องเต็ม |
| `description` | VARCHAR(255) | ✅ | NULL | คำอธิบาย |
| `kind` | ENUM | ❌ | 'course' | course หรือ club |
| `library_notebook_id`| VARCHAR(128) | ✅ | NULL | ID สมุดโน้ตห้องใน SurrealDB |
| `created_by` | INT | ✅ | NULL | ผู้สร้างห้อง |
| `created_at` | DATETIME | ✅ | NOW() | เวลาสร้างห้อง |

#### 1.4 `room_members`
| Column | Type | Null | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `room_id` | INT (PK 1) | ❌ | - | รหัสห้อง |
| `user_id` | INT (PK 2) | ❌ | - | รหัสผู้เข้าร่วม |
| `joined_at` | DATETIME | ✅ | NOW() | เวลาที่กดเข้าห้อง |

#### 1.5 `posts`
| Column | Type | Null | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | BIGINT (PK) | ❌ | - | รหัสโพสต์ (Auto Increment) |
| `author_id` | INT | ❌ | - | ผู้สร้างโพสต์ |
| `room_id` | INT | ✅ | NULL | ห้องที่โพสต์ลง |
| `type` | ENUM | ❌ | - | summary, quiz, roadmap, question, material |
| `title` | VARCHAR(200) | ✅ | NULL | หัวข้อ |
| `content` | TEXT | ✅ | NULL | เนื้อหา |
| `tags` | VARCHAR(255) | ✅ | NULL | แฮชแท็ก |
| `attachment_name` | VARCHAR(255) | ✅ | NULL | ชื่อไฟล์แนบ |
| `attachment_path` | VARCHAR(512) | ✅ | NULL | ที่อยู่ไฟล์แนบ |
| `attachment_size` | INT | ✅ | NULL | ขนาดไฟล์ |
| `attachment_mime` | VARCHAR(128) | ✅ | NULL | ประเภทไฟล์ |
| `linked_type` | VARCHAR(32) | ✅ | NULL | สิ่งที่แนบมา (quiz, roadmap) |
| `linked_id` | VARCHAR(128) | ✅ | NULL | ID ของสิ่งที่แนบ (Polymorphic) |
| `linked_snapshot` | LONGTEXT | ✅ | NULL | ข้อมูล JSON แนบ |
| `like_count` | INT | ❌ | 0 | ยอด Like |
| `helpful_count` | INT | ❌ | 0 | ยอด Helpful |
| `comment_count` | INT | ❌ | 0 | ยอดคอมเมนต์ |
| `share_count` | INT | ❌ | 0 | ยอดแชร์ |
| `quiz_play_count` | INT | ❌ | 0 | ยอดคนเข้าเล่น Quiz จากโพสต์ |
| `roadmap_follow_count`| INT | ❌ | 0 | ยอดคนก๊อปปี้ Roadmap จากโพสต์ |
| `cashback_earned` | INT | ❌ | 0 | รายได้ที่โพสต์ทำได้ |
| `content_hash` | CHAR(32) | ✅ | NULL | รหัส MD5 กันโพสต์ซ้ำ |
| `is_deleted` | TINYINT(1) | ❌ | 0 | Soft Delete (1=ลบ) |
| `created_at` | DATETIME | ✅ | NOW() | เวลาตั้งโพสต์ |
| `updated_at` | DATETIME | ✅ | ON UPDATE | เวลาแก้ไข |

#### 1.6 กลุ่ม Interaction (Reactions, Shares, Comments, Saved)
*   **`post_reactions`**: `post_id` (PK), `user_id` (PK), `kind` (PK: like, helpful), `created_at`
*   **`post_shares`**: `post_id` (PK), `user_id` (PK), `created_at`
*   **`post_comments`**: `id` (PK), `post_id`, `author_id`, `content`, `created_at`
*   **`saved_posts`**: `user_id` (PK), `post_id` (PK), `created_at`

#### 1.7 `quiz_attempts`
| Column | Type | Null | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | BIGINT (PK) | ❌ | - | รหัสรอบสอบ |
| `post_id` | BIGINT | ❌ | - | รหัสโพสต์ข้อสอบ |
| `user_id` | INT | ❌ | - | ผู้สอบ |
| `score` | INT | ✅ | NULL | คะแนนที่ได้ |
| `question_count`| INT | ✅ | NULL | จำนวนข้อสอบทั้งหมด |
| `completed` | TINYINT(1) | ❌ | 0 | สถานะ 1=สอบเสร็จ |
| `cashback_paid` | TINYINT(1) | ❌ | 0 | สถานะจ่ายเงินทอนให้ผู้โพสต์ |
| `created_at` | DATETIME | ✅ | NOW() | เวลาเริ่มทำ |
| `completed_at` | DATETIME | ✅ | NULL | เวลาสอบเสร็จ |

#### 1.8 กลุ่ม AI Quota & Chat History
*   **`rag_credit_sessions`**: `id` (VARCHAR 64 PK), `user_id` (INT), `credits_left` (INT), `messages` (LONGTEXT), `created_at`, `updated_at`
*   **`rag_conversations`**: `id` (VARCHAR 64 PK), `user_id` (INT), `title` (VARCHAR 200), `scope_label` (VARCHAR 255), `message_count` (INT), `created_at`, `updated_at`
*   **`rag_messages`**: `id` (BIGINT PK), `conversation_id` (VARCHAR 64), `role` (VARCHAR 16: user/assistant), `content` (LONGTEXT), `answer_meta` (LONGTEXT), `created_at`

#### 1.9 `library_documents`
| Column | Type | Null | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | BIGINT (PK) | ❌ | - | รหัสเอกสาร |
| `owner_id` | INT | ❌ | - | เจ้าของเอกสาร |
| `scope` | ENUM | ❌ | 'personal'| course หรือ personal |
| `room_id` | INT | ✅ | NULL | รหัสห้อง (ถ้าเป็น course) |
| `notebook_id` | VARCHAR(128)| ❌ | - | รหัสสมุดใน SurrealDB |
| `source_id` | VARCHAR(128)| ✅ | NULL | รหัสเอกสารฝั่ง SurrealDB |
| `title` | VARCHAR(200)| ❌ | - | ชื่อเอกสาร |
| `kind` | ENUM | ❌ | 'file' | file, url, text |
| `filename` | VARCHAR(255)| ✅ | NULL | ชื่อไฟล์ |
| `file_path` | VARCHAR(512)| ✅ | NULL | ที่อยู่ไฟล์ |
| `mime` | VARCHAR(128)| ✅ | NULL | ประเภทไฟล์ |
| `size` | INT | ✅ | NULL | ขนาดไฟล์ |
| `status` | ENUM | ❌ |'processing'| processing, ready, failed |
| `error` | VARCHAR(500)| ✅ | NULL | ข้อความ Error |
| `chunk_count` | INT | ❌ | 0 | จำนวนข้อความที่หั่นไว้ |
| `char_count` | INT | ❌ | 0 | ความยาวตัวอักษรทั้งหมด |
| `content_hash` | CHAR(32) | ✅ | NULL | MD5 Fingerprint |
| `post_id` | BIGINT | ✅ | NULL | รหัสโพสต์ที่โยงมา |
| `created_at` | DATETIME | ✅ | NOW() | เวลานำเข้า |
| `updated_at` | DATETIME | ✅ | ON UPDATE | เวลาอัปเดต |

#### 1.10 `notifications`
*   **`notifications`**: `id` (BIGINT PK), `recipient_id` (INT), `kind` (VARCHAR 32), `message` (VARCHAR 255), `post_id` (BIGINT NULL), `actor_id` (INT NULL), `is_read` (TINYINT 0/1), `created_at`

---

### 🌌 2. SurrealDB (NoSQL & Vector Database)
> โครงสร้างไม่ได้นิยามแบบ SQL Table แต่ถูกบังคับโครงสร้างด้วย Python Class Pydantic Models ใน Back-end ของระบบ

#### 2.1 `notebook`
| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | RecordID | รหัสสมุดโน้ต (ใช้เชื่อมกับ `library_notebook_id`) |
| `name` | String | ชื่อสมุด |
| `description` | String | คำอธิบาย |
| `archived` | Boolean | สถานะซ่อนสมุด |
| `last_viewed_at`| Datetime | เวลาที่เปิดล่าสุด |
| `knowledge_version`| Integer | เวอร์ชันของเนื้อหา (ใช้เคลียร์ Cache) |
| `owner_id` | String | เจ้าของสมุด |

#### 2.2 `source`
| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | RecordID | รหัสเอกสาร (ใช้เชื่อมกับ `source_id`) |
| `asset` | Object | ข้อมูลไฟล์ (`file_path`, `url`) |
| `title` | String | ชื่อเอกสาร |
| `topics` | Array(String) | หัวข้อเรื่อง |
| `full_text` | String | ข้อความดั้งเดิมทั้งหมดของไฟล์ |
| `last_viewed_at`| Datetime | เวลาที่เปิดดูครั้งล่าสุด |
| `command` | RecordID | รหัส Background Job เวลาทำ Index AI |
| `knowledge_version`| Integer | แคชเวอร์ชัน |
| `owner_id` | String | รหัสผู้ใช้งาน (แยกข้อมูลผู้ใช้) |

#### 2.3 `source_embedding` (ตัว Vector Chunk)
| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | RecordID | รหัส Chunk |
| `content` | String | เนื้อหาที่ถูกหั่นแล้ว (ไม่เกิน 400 Token) |
| `[HIDDEN]` | Array(Float)| ข้อมูล Vector Embedding ที่ซ่อนอยู่หลังบ้าน SurrealDB |
*(มี Edge Relation `<-reference->` เชื่อมไปยัง `source`)*

#### 2.4 `source_insight` และ `note`
*   **`source_insight`**: `id`, `insight_type` (String), `content` (String)
*   **`note`**: `id`, `title` (String), `note_type` (String: human/ai), `content` (String), `owner_id` (String)

#### 2.5 กลุ่ม Chat & Background Sessions
*   **`chat_session`**: `id`, `title`, `model_override` (String), `owner_id` (String)
*   **`global_chat_session`**: `id`, `title`, `model_override` (String), `owner_id` (String)
*   **`quiz_session`**: `id` (ใช้เก็บ State ว่า AI กำลังสร้าง Quiz ถึงไหนแล้ว)
*   **`roadmap_session`**: `id` (ใช้เก็บ State ของ AI ตอนสร้าง Roadmap)

---

### 🗄️ 3. PocketBase / SQLite (Roadmap Database)
> ทำหน้าที่เป็น Micro-backend ฐานข้อมูลอยู่ภายในไฟล์ `pb_data/data.db` 

#### 3.1 `users` (ตารางระบบ PB)
*   `id` (TEXT PK), `email` (TEXT), `password` (TEXT), `name` (TEXT), `avatar` (TEXT), `verified` (BOOLEAN), `created`, `updated`
*(ระบบใช้ Access Token จาก API กลางมาตรวจสอบสิทธิ์ ไม่ได้ใช้รหัสผ่าน PocketBase จริง)*

#### 3.2 Collections (สร้างเอง)
*   **`roadmaps`**: `id`, `user_id` (อิงตามระบบแม่), `title`, `description`, `is_public`
*   **`nodes`**: `id`, `roadmap_id` (ผูกกับ roadmaps.id), `label` (หัวข้อความรู้), `status` (สถานะว่าเรียนหรือยัง)
*   **`edges`**: `id`, `roadmap_id`, `source_node` (เริ่มจากไหน), `target_node` (ไปกล่องไหน)

---

### ⚡ 4. Redis (In-Memory Cache)
> **❌ ไม่มี Table ❌ ไม่มี Entity ❌ ไม่มี Schema หรือ Column**
การจัดเก็บจะใช้ **"ชื่อกุญแจ (Key)"** จับคู่กับ **"ข้อมูล (Value)"** โดยทำหน้าที่เป็น In-Memory Data Store หลักๆ ใน 3 เรื่อง:

1. **ระบบลดภาระ AI (Cache Service)**
   * **Vector Search Cache** (`search:vector:<notebook_id>:<query_hash>`)
   * **Context Build Cache** (`context:<notebook_id>:<config_hash>`)
   * **Embedding Cache** (`embed:<source_id>:<chunk_idx>`)
2. **ระบบป้องกันการโจมตี (Login Guard / Rate Limiting)**
   * สร้าง Sliding Window Counter กันสแปม: `auth:throttle:user:<username>`, `auth:throttle:ip:<ip_address>`, `auth:throttle:reg:<ip_address>`
3. **ระบบตัดวงจรเมื่อ AI ล่ม (Circuit Breaker)**
   * ถ้า Server ของ AI (Gemini/OpenAI) ล่ม ระบบจะสับสวิตช์เป็น OPEN เก็บสถานะไว้ใน Redis (`cache:intent_validator:circuit`) เพื่อลดโหลด

<br><br>

---

## 🧩 ส่วนที่ 2: คู่มือออกแบบ ER Diagram และหน้าที่ของ Entity 

เอกสารส่วนนี้อธิบายหน้าที่ของทุก Entity ลึกซึ้งระดับ Business Role 

### 🐘 1. กลุ่มฐานข้อมูล MariaDB (Relational)

#### 1.1 `users` (บัญชีผู้ใช้งานกลาง)
*   **หน้าที่:** เป็นแกนกลาง (Hub) ของระบบที่ระบุตัวตนบุคคล ใช้สำหรับการเข้าสู่ระบบ, แสดงโปรไฟล์หน้าเว็บ, และเก็บแต้มสุทธิ
*   **การเชื่อมต่อ:**
    *   [1:N] โยงไปยัง `point_transactions`, `room_members`, `posts`
    *   [1:1] **[CROSS-DB]** `library_notebook_id` โยงข้ามไปหา `notebook.id` ใน SurrealDB (1 คน มีสมุดโน้ตส่วนตัว 1 เล่ม)

#### 1.2 `point_transactions` (สมุดบัญชีแยกประเภท)
*   **หน้าที่:** บันทึกประวัติแต้มแบบ Immutable (ห้ามแก้ไขย้อนหลัง)
*   **เพิ่มเติม:** ใช้ **Polymorphic Relation** (`ref_type` และ `ref_id`) ทำให้โยงไปหาใครก็ได้ เช่น ถ้าได้แต้มจากการโพสต์ `ref_type='post'`, `ref_id=123`

#### 1.3 `rooms` (ห้องเรียน/รายวิชา)
*   **หน้าที่:** เป็น Container จัดกลุ่มเนื้อหา
*   **เพิ่มเติม:** การกำหนดสิทธิ์ (Permission) ของ RAG AI จะใช้ห้องเป็นเกณฑ์ ถ้า AI ถูกเรียกในห้องนี้ มันจะอ่านได้เฉพาะเอกสารในสมุดโน้ตของห้องนี้เท่านั้น
*   **การเชื่อมต่อ:**
    *   [1:N] โยงไปหา `room_members`, `posts`
    *   [1:1] **[CROSS-DB]** `library_notebook_id` โยงไปหา `notebook.id` ใน SurrealDB (สมุดโน้ตส่วนรวมประจำวิชา)

#### 1.4 `posts` (ศูนย์กลางคอนเทนต์คอมมูนิตี้)
*   **หน้าที่:** เก็บเนื้อหาทุกอย่างที่แสดงบนหน้า Feed (คำถาม, สรุป, โชว์คะแนนควิซ) 
*   **การเชื่อมต่อ:**
    *   [N:1] โยงกลับไปหา `users` และ `rooms`
    *   [1:N] แตกออกเป็น Interaction Tables: `post_reactions`, `post_shares`, `post_comments`, `saved_posts`, `quiz_attempts` 

#### 1.5 `library_documents` (ตารางจัดการคิวเอกสาร)
*   **หน้าที่:** รับจบเรื่องสถานะการอัปโหลด (รออ่าน, กำลังประมวลผล, เสร็จแล้ว) เพื่อแสดงหลอด Loading
*   **การเชื่อมต่อ:**
    *   [1:1] **[CROSS-DB]** `source_id` จะโยงไปหา `source.id` ใน SurrealDB (ตัวเอกสารจริงๆ)

### 🌌 2. กลุ่มฐานข้อมูล SurrealDB (Graph & Vector)

#### 2.1 `notebook` (สมุดโน้ต)
*   **หน้าที่:** เปรียบเสมือน "โฟลเดอร์" ជាตัวชี้เป้าหลักว่า AI จะต้องไปอ่านไฟล์ไหนบ้าง (AI จะไม่มองทะลุข้ามสมุดโน้ตเล่มอื่น)

#### 2.2 `source` และ `source_embedding`
*   **หน้าที่ `source`:** เก็บ Text ข้อความยาวๆ ทั้งหมดที่ดึงออกมาจาก PDF หรือเว็บไซต์
*   **หน้าที่ `source_embedding`:** **(หัวใจของ AI)** เก็บข้อความที่หั่นสั้นๆ พร้อมกับแกนตัวเลข (Vector) เวลาค้นหา AI จะยิง Vector เข้ามาเทียบในตารางนี้

### 🗄️ 3. กลุ่ม PocketBase (AI Roadmap)

#### 3.1 `roadmaps`, `nodes`, `edges`
*   **หน้าที่ `roadmaps`:** เก็บชื่อหัวข้อใหญ่ของแผนการเรียน (เช่น AI 101)
*   **หน้าที่ `nodes`:** เป็นกล่องความรู้
*   **หน้าที่ `edges`:** เป็นลูกศรชี้ว่าต้องเรียนกล่องไหนก่อนหลัง
*   **การเชื่อมต่อข้ามระบบ:** `roadmaps.user_id` จะเก็บ ID String เพื่ออ้างอิงกลับมาหา `MariaDB.users` (ไม่ได้ต่อเป็น SQL Foreign Key กันจริงๆ แต่เชื่อมทาง Logic)

<br><br>

---

## 💻 ส่วนที่ 3: โค้ด DBML ฉบับสมบูรณ์ (พร้อมสร้าง ER Diagram)
*(นำโค้ดทั้งหมดนี้ไปวางใน [dbdiagram.io](https://dbdiagram.io/d) ได้เลย)*

```dbml
// ==========================================
// ENUMS (สำหรับ MariaDB)
// ==========================================
Enum "user_role" {
  "admin"
  "student"
  "teacher"
}
Enum "room_kind" {
  "course"
  "club"
}
Enum "post_type" {
  "summary"
  "quiz"
  "roadmap"
  "question"
  "material"
}
Enum "doc_scope" {
  "course"
  "personal"
}
Enum "doc_kind" {
  "file"
  "url"
  "text"
}
Enum "doc_status" {
  "processing"
  "ready"
  "failed"
}

// ==========================================
// 1. MariaDB (Core SQL Database)
// ==========================================
Table "users" {
  "id" INT [pk, increment, note: 'รหัสผู้ใช้']
  "username" VARCHAR(32) [unique, note: 'ชื่อบัญชี']
  "password_hash" VARCHAR(255) [note: 'รหัสผ่าน (เข้ารหัสแล้ว)']
  "display_name" VARCHAR(128) [note: 'ชื่อที่แสดงผล']
  "role" user_role [default: 'student']
  "email" VARCHAR(191) [unique, note: 'อีเมล']
  "google_sub" VARCHAR(64) [note: 'รหัสผู้ใช้จาก Google (OAuth)']
  "avatar_url" VARCHAR(512) [note: 'ลิงก์รูปโปรไฟล์']
  "student_code" VARCHAR(32) [note: 'รหัสนักศึกษา']
  "points_balance" INT [default: 0, note: 'แต้มสะสมปัจจุบัน']
  "library_notebook_id" VARCHAR(128) [note: 'ID โยงหาสมุดโน้ตฝั่ง SurrealDB']
  "disabled" TINYINT(1) [default: 0, note: 'สถานะระงับบัญชี (0=ปกติ)']
  "created_at" DATETIME [default: `NOW()`]
  "updated_at" DATETIME
  "last_login_at" DATETIME
}

Table "point_transactions" {
  "id" BIGINT [pk, increment, note: 'รหัสธุรกรรม']
  "user_id" INT
  "delta" INT [note: 'แต้มที่เพิ่มหรือลด']
  "balance_after" INT [note: 'แต้มคงเหลือสุทธิหลังทำรายการ']
  "kind" VARCHAR(32) [note: 'ประเภท (rag_session, quiz_import, ฯลฯ)']
  "ref_type" VARCHAR(32) [note: 'ประเภทอ้างอิง (เช่น post)']
  "ref_id" VARCHAR(128) [note: 'ID ของสิ่งที่ใช้อ้างอิง (Polymorphic)']
  "note" VARCHAR(255) [note: 'หมายเหตุเพิ่มเติม']
  "created_at" DATETIME [default: `NOW()`]
}

Table "rooms" {
  "id" INT [pk, increment, note: 'รหัสห้อง']
  "code" VARCHAR(32) [unique, note: 'รหัสวิชา']
  "name" VARCHAR(128) [note: 'ชื่อห้องเต็ม']
  "description" VARCHAR(255) [note: 'คำอธิบาย']
  "kind" room_kind [default: 'course']
  "library_notebook_id" VARCHAR(128) [note: 'ID สมุดโน้ตห้องใน SurrealDB']
  "created_by" INT [note: 'ผู้สร้างห้อง']
  "created_at" DATETIME [default: `NOW()`]
}

Table "room_members" {
  "room_id" INT
  "user_id" INT
  "joined_at" DATETIME [default: `NOW()`]

  Indexes {
    (room_id, user_id) [pk]
  }
}

Table "posts" {
  "id" BIGINT [pk, increment, note: 'รหัสโพสต์']
  "author_id" INT [note: 'ผู้สร้างโพสต์']
  "room_id" INT [note: 'ห้องที่โพสต์ลง']
  "type" post_type
  "title" VARCHAR(200)
  "content" TEXT
  "tags" VARCHAR(255)
  "attachment_name" VARCHAR(255)
  "attachment_path" VARCHAR(512)
  "attachment_size" INT
  "attachment_mime" VARCHAR(128)
  "linked_type" VARCHAR(32) [note: 'สิ่งที่แนบมา (quiz, roadmap)']
  "linked_id" VARCHAR(128) [note: 'ID ของสิ่งที่แนบ (Polymorphic)']
  "linked_snapshot" LONGTEXT [note: 'ข้อมูล JSON แนบ']
  "like_count" INT [default: 0]
  "helpful_count" INT [default: 0]
  "comment_count" INT [default: 0]
  "share_count" INT [default: 0]
  "quiz_play_count" INT [default: 0]
  "roadmap_follow_count" INT [default: 0]
  "cashback_earned" INT [default: 0]
  "content_hash" CHAR(32) [note: 'รหัส MD5 กันโพสต์ซ้ำ']
  "is_deleted" TINYINT(1) [default: 0, note: 'Soft Delete']
  "created_at" DATETIME [default: `NOW()`]
  "updated_at" DATETIME
}

Table "post_reactions" {
  "post_id" BIGINT
  "user_id" INT
  "kind" VARCHAR(32) [note: 'like, helpful']
  "created_at" DATETIME [default: `NOW()`]

  Indexes {
    (post_id, user_id, kind) [pk]
  }
}

Table "post_shares" {
  "post_id" BIGINT
  "user_id" INT
  "created_at" DATETIME [default: `NOW()`]

  Indexes {
    (post_id, user_id) [pk]
  }
}

Table "post_comments" {
  "id" BIGINT [pk, increment]
  "post_id" BIGINT
  "author_id" INT
  "content" TEXT
  "created_at" DATETIME [default: `NOW()`]
}

Table "saved_posts" {
  "user_id" INT
  "post_id" BIGINT
  "created_at" DATETIME [default: `NOW()`]

  Indexes {
    (user_id, post_id) [pk]
  }
}

Table "quiz_attempts" {
  "id" BIGINT [pk, increment, note: 'รหัสรอบสอบ']
  "post_id" BIGINT [note: 'รหัสโพสต์ข้อสอบ']
  "user_id" INT [note: 'ผู้สอบ']
  "score" INT [note: 'คะแนนที่ได้']
  "question_count" INT [note: 'จำนวนข้อสอบทั้งหมด']
  "completed" TINYINT(1) [default: 0, note: 'สถานะ 1=สอบเสร็จ']
  "cashback_paid" TINYINT(1) [default: 0, note: 'สถานะจ่ายเงินทอน']
  "created_at" DATETIME [default: `NOW()`]
  "completed_at" DATETIME
}

Table "rag_credit_sessions" {
  "id" VARCHAR(64) [pk]
  "user_id" INT
  "credits_left" INT
  "messages" LONGTEXT
  "created_at" DATETIME [default: `NOW()`]
  "updated_at" DATETIME
}

Table "rag_conversations" {
  "id" VARCHAR(64) [pk]
  "user_id" INT
  "title" VARCHAR(200)
  "scope_label" VARCHAR(255)
  "message_count" INT
  "created_at" DATETIME [default: `NOW()`]
  "updated_at" DATETIME
}

Table "rag_messages" {
  "id" BIGINT [pk, increment]
  "conversation_id" VARCHAR(64)
  "role" VARCHAR(16) [note: 'user/assistant']
  "content" LONGTEXT
  "answer_meta" LONGTEXT
  "created_at" DATETIME [default: `NOW()`]
}

Table "library_documents" {
  "id" BIGINT [pk, increment, note: 'รหัสเอกสาร']
  "owner_id" INT [note: 'เจ้าของเอกสาร']
  "scope" doc_scope [default: 'personal']
  "room_id" INT [note: 'รหัสห้อง (ถ้าเป็น course)']
  "notebook_id" VARCHAR(128) [note: 'รหัสสมุดใน SurrealDB']
  "source_id" VARCHAR(128) [note: 'รหัสเอกสารฝั่ง SurrealDB']
  "title" VARCHAR(200)
  "kind" doc_kind [default: 'file']
  "filename" VARCHAR(255)
  "file_path" VARCHAR(512)
  "mime" VARCHAR(128)
  "size" INT
  "status" doc_status [default: 'processing']
  "error" VARCHAR(500)
  "chunk_count" INT [default: 0]
  "char_count" INT [default: 0]
  "content_hash" CHAR(32)
  "post_id" BIGINT [note: 'รหัสโพสต์ที่โยงมา']
  "created_at" DATETIME [default: `NOW()`]
  "updated_at" DATETIME
}

Table "notifications" {
  "id" BIGINT [pk, increment]
  "recipient_id" INT
  "kind" VARCHAR(32)
  "message" VARCHAR(255)
  "post_id" BIGINT
  "actor_id" INT
  "is_read" TINYINT(1) [default: 0]
  "created_at" DATETIME [default: `NOW()`]
}

// ==========================================
// 2. SurrealDB (NoSQL & Vector Database)
// ==========================================
Table "surreal_notebook" {
  "id" RecordID [pk]
  "name" String
  "description" String
  "archived" Boolean
  "last_viewed_at" Datetime
  "knowledge_version" Integer
  "owner_id" String [note: 'FK -> MariaDB users']
}

Table "surreal_source" {
  "id" RecordID [pk]
  "notebook_id" RecordID [note: 'Virtual Edge to Notebook']
  "asset" Object
  "title" String
  "topics" Array
  "full_text" String
  "last_viewed_at" Datetime
  "command" RecordID
  "knowledge_version" Integer
  "owner_id" String [note: 'FK -> MariaDB users']
}

Table "surreal_source_embedding" {
  "id" RecordID [pk]
  "source_id" RecordID [note: 'Virtual Edge to Source']
  "content" String [note: 'ไม่เกิน 400 Token']
  "vector_embedding" Array(Float) [note: 'HIDDEN in backend']
}

Table "surreal_source_insight" {
  "id" RecordID [pk]
  "source_id" RecordID [note: 'Virtual Edge to Source']
  "insight_type" String
  "content" String
}

Table "surreal_note" {
  "id" RecordID [pk]
  "notebook_id" RecordID [note: 'Virtual Edge to Notebook']
  "title" String
  "note_type" String [note: 'human/ai']
  "content" String
  "owner_id" String [note: 'FK -> MariaDB users']
}

Table "surreal_chat_session" {
  "id" RecordID [pk]
  "notebook_id" RecordID [note: 'Virtual Edge to Notebook']
  "title" String
  "model_override" String
  "owner_id" String [note: 'FK -> MariaDB users']
}

Table "surreal_global_chat_session" {
  "id" RecordID [pk]
  "title" String
  "model_override" String
  "owner_id" String [note: 'FK -> MariaDB users']
}

Table "surreal_quiz_session" {
  "id" RecordID [pk, note: 'State กาารสร้าง Quiz ของ AI']
}

Table "surreal_roadmap_session" {
  "id" RecordID [pk, note: 'State การสร้าง Roadmap ของ AI']
}

// ==========================================
// 3. PocketBase / SQLite (Roadmap Database)
// ==========================================
Table "pb_users" {
  "id" TEXT [pk]
  "email" TEXT
  "password" TEXT
  "name" TEXT
  "avatar" TEXT
  "verified" BOOLEAN
  "created" DATETIME
  "updated" DATETIME
}

Table "pb_roadmaps" {
  "id" TEXT [pk]
  "user_id" TEXT [note: 'อิงตามระบบแม่ MariaDB']
  "title" TEXT
  "description" TEXT
  "is_public" BOOLEAN
}

Table "pb_nodes" {
  "id" TEXT [pk]
  "roadmap_id" TEXT
  "label" TEXT
  "status" TEXT [note: 'สถานะว่าเรียนหรือยัง']
}

Table "pb_edges" {
  "id" TEXT [pk]
  "roadmap_id" TEXT
  "source_node" TEXT [note: 'เริ่มจากกล่องไหน']
  "target_node" TEXT [note: 'ไปกล่องไหน']
}

// ==========================================
// Relationships: MariaDB Internal
// ==========================================
Ref: "users"."id" < "point_transactions"."user_id"
Ref: "users"."id" < "rooms"."created_by"
Ref: "users"."id" < "room_members"."user_id"
Ref: "rooms"."id" < "room_members"."room_id"
Ref: "users"."id" < "posts"."author_id"
Ref: "rooms"."id" < "posts"."room_id"
Ref: "posts"."id" < "post_reactions"."post_id"
Ref: "users"."id" < "post_reactions"."user_id"
Ref: "posts"."id" < "post_shares"."post_id"
Ref: "users"."id" < "post_shares"."user_id"
Ref: "posts"."id" < "post_comments"."post_id"
Ref: "users"."id" < "post_comments"."author_id"
Ref: "users"."id" < "saved_posts"."user_id"
Ref: "posts"."id" < "saved_posts"."post_id"
Ref: "posts"."id" < "quiz_attempts"."post_id"
Ref: "users"."id" < "quiz_attempts"."user_id"
Ref: "users"."id" < "rag_credit_sessions"."user_id"
Ref: "users"."id" < "rag_conversations"."user_id"
Ref: "rag_conversations"."id" < "rag_messages"."conversation_id"
Ref: "users"."id" < "library_documents"."owner_id"
Ref: "rooms"."id" < "library_documents"."room_id"
Ref: "posts"."id" < "library_documents"."post_id"
Ref: "users"."id" < "notifications"."recipient_id"
Ref: "users"."id" < "notifications"."actor_id"
Ref: "posts"."id" < "notifications"."post_id"

// ==========================================
// Relationships: PocketBase Internal
// ==========================================
Ref: "pb_roadmaps"."id" < "pb_nodes"."roadmap_id"
Ref: "pb_roadmaps"."id" < "pb_edges"."roadmap_id"
Ref: "pb_nodes"."id" < "pb_edges"."source_node"
Ref: "pb_nodes"."id" < "pb_edges"."target_node"

// ==========================================
// Relationships: SurrealDB Internal (Graph Edges -> DBML Refs)
// ==========================================
Ref: "surreal_notebook"."id" < "surreal_source"."notebook_id"
Ref: "surreal_source"."id" < "surreal_source_embedding"."source_id" 
Ref: "surreal_source"."id" < "surreal_source_insight"."source_id" 
Ref: "surreal_notebook"."id" < "surreal_note"."notebook_id"
Ref: "surreal_notebook"."id" < "surreal_chat_session"."notebook_id"

// ==========================================
// Cross-Database & Polymorphic Connections
// ==========================================
// 1. โยงสมุดโน้ตข้ามระหว่าง MariaDB และ SurrealDB
Ref: "users"."library_notebook_id" - "surreal_notebook"."id"
Ref: "rooms"."library_notebook_id" - "surreal_notebook"."id"

// 2. โยงเอกสารข้ามระหว่าง MariaDB และ SurrealDB
Ref: "library_documents"."notebook_id" > "surreal_notebook"."id"
Ref: "library_documents"."source_id" - "surreal_source"."id"

// 3. ให้ SurrealDB อ้างอิงเจ้าของกลับมาที่ MariaDB
Ref: "surreal_notebook"."owner_id" > "users"."id"
Ref: "surreal_source"."owner_id" > "users"."id"
Ref: "surreal_note"."owner_id" > "users"."id"
Ref: "surreal_chat_session"."owner_id" > "users"."id"
Ref: "surreal_global_chat_session"."owner_id" > "users"."id"

// 4. ให้ PocketBase อ้างอิงเจ้าของกลับมาที่ MariaDB
Ref: "pb_roadmaps"."user_id" > "users"."id"

// 5. Polymorphic References
Ref: "posts"."linked_id" - "surreal_quiz_session"."id"
Ref: "posts"."linked_id" - "surreal_roadmap_session"."id"
Ref: "point_transactions"."ref_id" - "posts"."id"
```

<br><br>

---

## 🔄 ส่วนที่ 4: System Integration & Data Flow (การทำงานร่วมกันของทั้ง 4 ระบบ)

เพื่อให้เห็นภาพรวมว่าฐานข้อมูลทั้ง 4 ตัวทำงานเชื่อมโยงกันอย่างไรในสถานการณ์จริง (Real-world Scenarios) นี่คือ Flow การทำงานหลักของระบบ KMITL AI ครับ:

### 1. 🔑 Flow การยืนยันตัวตน (Identity & Auth)
*   **MariaDB เป็นศูนย์กลาง:** เมื่อนักศึกษาล็อกอิน ระบบจะตรวจสอบข้อมูลกับตาราง `MariaDB.users` และออก **JWT Token** ให้
*   **SurrealDB & PocketBase เป็นผู้รับ:** เมื่อนักศึกษาจะใช้งาน AI หรือวาด Roadmap, API จะเอา JWT Token นี้ไปอ้างอิง ระบบลูกทั้งสอง (SurrealDB, PocketBase) ไม่ต้องล็อกอินใหม่ แค่บันทึกรหัส `user_id` จาก MariaDB ลงไปในคอลัมน์ `owner_id` (Surreal) หรือ `user_id` (PB) เพื่อใช้แยกแยะว่าข้อมูลนี้เป็นของใคร

### 2. 📚 Flow การอัปโหลดและประมวลผลเอกสาร (Data Ingestion)
1.  **MariaDB รับคิว:** ผู้ใช้อัปโหลด PDF ระบบจะบันทึกสถานะลง `MariaDB.library_documents` ว่า `status = 'processing'` (โชว์หลอดโหลดหน้าเว็บ)
2.  **SurrealDB สับเอกสาร:** Background Worker นำไฟล์ไปอ่าน สับเป็นชิ้นๆ (Chunks) ส่งไปหาตัวทำ Embedding (แปลงเป็นตัวเลข Vector) แล้วบันทึกลง `SurrealDB.source_embedding` 
3.  **MariaDB อัปเดต:** เมื่อเสร็จ ระบบจะนำ `SurrealDB.source.id` กลับมาบันทึกที่ `MariaDB.library_documents.source_id` แล้วเปลี่ยนสถานะเป็น `ready`

### 3. 🤖 Flow การถาม-ตอบ AI (RAG - Retrieval-Augmented Generation)
1.  **Redis เช็คแคช (Speed):** ผู้ใช้พิมพ์คำถามปุ๊บ ระบบจะวิ่งไปถาม `Redis` ก่อนว่าคำถามนี้เคยมีคนถามและตอบไปหรือยัง? ถ้ามี ดึงคำตอบกลับไปเลย (เร็วมาก ไม่เสียเงิน)
2.  **SurrealDB ค้นหาความรู้ (Brain):** ถ้า Redis ไม่มี ระบบจะดึง `library_notebook_id` จาก `MariaDB.users` แล้ววิ่งไปหา `SurrealDB` เพื่อทำการ **Vector Search** หาก้อนความรู้ที่เกี่ยวข้องในสมุดโน้ตเล่มนั้น
3.  **Redis ตัดวงจร (Safety):** ส่งความรู้ให้ AI (เช่น Gemini) ตอบ ถ้า AI ล่ม ระบบจะใช้กลไก Circuit Breaker ใน `Redis` ตัดวงจรชั่วคราว
4.  **MariaDB บันทึกประวัติ (History):** เมื่อได้คำตอบมา ระบบจะหักโควต้าแต้ม และบันทึกประวัติแชทลง `MariaDB.rag_messages`

### 4. 🔗 Flow การแชร์ความรู้ลงโซเชียล (Polymorphic Cross-DB Sharing)
1.  **สร้างที่ระบบลูก:** ผู้ใช้สร้าง Roadmap ใน **PocketBase** ได้รหัสมาคือ `RM-999`
2.  **แชร์ที่ระบบแม่:** ผู้ใช้กดแชร์ลงฟีด ระบบจะสร้างแถวใน `MariaDB.posts` โดยกำหนด `linked_type = 'roadmap'` และ `linked_id = 'RM-999'`
3.  **หน้าเว็บประกอบร่าง:** หน้า Feed (UI) ดึงข้อมูล `posts` จาก MariaDB มาโชว์ พอเห็นว่าโพสต์นี้มีของแนบเป็น Roadmap มันจึงส่ง Request ไปหา PocketBase ว่า *"ขอดูข้อมูลของ RM-999 หน่อย"* เพื่อเอามาวาดกราฟบนหน้าไทม์ไลน์
