# ผังฐานข้อมูล SIET Space (ER Diagram)

สร้างจากซอร์สของ schema จริง (`open-notebook/open_notebook/community/schema.py` และ
`open_notebook/database/migrations/*.surrealql`) และตรวจกับฐานข้อมูลที่รันอยู่เมื่อ 19 ตุลาคม 2569
ชื่อตารางและคอลัมน์เป็นชื่อ**หลังการเปลี่ยนชื่อเมื่อ 24 กันยายน 2569** (`rooms`, `room_id`, `linked_*`,
`student_code`, `quiz_attempts`, `saved_posts`, `rag_credit_sessions`, `answer_meta`, ฯลฯ)
ผังทั้งสองผ่าน parser ของ Mermaid และ render เป็นภาพไว้ที่ `docs/report/images/fig-4.3-er-diagram.png`
และ `fig-4.4-surreal-collections.png`

คำอธิบายประกอบ (ชนิดความสัมพันธ์ พฤติกรรมเมื่อลบ ดัชนี และพจนานุกรมข้อมูลทุกคอลัมน์) อยู่ใน
[report/4.1-infrastructure-database.md](report/4.1-infrastructure-database.md) หัวข้อ 4.1.2–4.1.3

**สัญลักษณ์ที่ใช้**

| สัญลักษณ์ | ความหมาย |
|---|---|
| `\|\|--o{` | หนึ่ง ต่อ ศูนย์หรือหลาย (ฝั่งขวาต้องมีฝั่งซ้ายเสมอ) |
| `\|o--o{` | ศูนย์หรือหนึ่ง ต่อ ศูนย์หรือหลาย (คอลัมน์นั้นเป็น NULL ได้) |
| `\|o--o\|` | ศูนย์หรือหนึ่ง ต่อ ศูนย์หรือหนึ่ง (1:1 แบบไม่บังคับ) |
| `PK` `FK` `UK` | Primary key · Foreign key เชิงตรรกะ · Unique key |

> **หมายเหตุสำคัญ:** `FK` ในผังนี้เป็นความสัมพันธ์**เชิงตรรกะ** ฐานข้อมูลจริง
> ไม่ได้ประกาศ `FOREIGN KEY` constraint ไว้สักตัว ความถูกต้องของข้อมูลบังคับ
> ด้วยโค้ดแอปพลิเคชันทั้งหมด (ตารางพฤติกรรม cascade / set-null อยู่ในรายงานหัวข้อ 4.1.2 ข้อ 3)

---

## 1. ฐานข้อมูลหลัก — MariaDB (`workspace`, 16 ตาราง)

```mermaid
erDiagram
    users ||--o{ point_transactions : "มีรายการแต้ม"
    users |o--o{ rooms : "เปิดห้อง (created_by)"
    users ||--o{ room_members : "เป็นสมาชิก"
    rooms ||--o{ room_members : "มีสมาชิก"
    users ||--o{ posts : "เขียน (author_id)"
    rooms |o--o{ posts : "อยู่ในห้อง (room_id)"
    posts ||--o{ post_comments : "มีความคิดเห็น"
    users ||--o{ post_comments : "เขียน"
    posts ||--o{ post_reactions : "ถูกใจ/Helpful"
    users ||--o{ post_reactions : "กด"
    posts ||--o{ post_shares : "ถูกแชร์"
    users ||--o{ post_shares : "แชร์"
    posts ||--o{ saved_posts : "ถูกบันทึก"
    users ||--o{ saved_posts : "บันทึก"
    posts ||--o{ quiz_attempts : "ถูกทำควิซ"
    users ||--o{ quiz_attempts : "ทำควิซ"
    users ||--o{ notifications : "ได้รับ (recipient_id)"
    users |o--o{ notifications : "เป็นผู้กระทำ (actor_id)"
    posts |o--o{ notifications : "เกี่ยวกับโพสต์"
    users ||--o{ library_documents : "อัปโหลด (owner_id)"
    rooms |o--o{ library_documents : "คลังของห้อง (room_id)"
    posts |o--o| library_documents : "โพสต์ที่สร้างจากเอกสาร"
    users ||--o{ rag_conversations : "สนทนา"
    rag_conversations ||--o{ rag_messages : "มีข้อความ"
    users ||--o{ rag_credit_sessions : "ซื้อเซสชัน"
    users |o--o{ llm_usage : "ใช้โมเดล"

    users {
        INT id PK
        VARCHAR(32) username UK
        VARCHAR(255) password_hash
        VARCHAR(128) display_name
        ENUM role "admin|student|teacher"
        VARCHAR(191) email UK
        VARCHAR(64) google_sub UK
        VARCHAR(512) avatar_url
        VARCHAR(32) student_code
        INT points_balance
        TINYINT disabled
        VARCHAR(128) library_notebook_id "→ SurrealDB notebook"
        DATETIME created_at
        DATETIME updated_at
        DATETIME last_login_at
    }
    point_transactions {
        BIGINT id PK
        INT user_id FK
        INT delta
        INT balance_after
        VARCHAR(32) kind
        VARCHAR(32) ref_type
        VARCHAR(128) ref_id
        VARCHAR(255) note
        DATETIME created_at
    }
    rooms {
        INT id PK
        VARCHAR(32) code UK
        VARCHAR(128) name
        VARCHAR(255) description
        ENUM kind "course|club"
        INT created_by FK
        VARCHAR(128) library_notebook_id "→ SurrealDB notebook"
        DATETIME created_at
    }
    room_members {
        INT room_id PK_FK
        INT user_id PK_FK
        DATETIME joined_at
    }
    posts {
        BIGINT id PK
        INT author_id FK
        INT room_id FK
        ENUM type "summary|quiz|roadmap|question|material"
        VARCHAR(200) title
        TEXT content
        VARCHAR(255) tags
        VARCHAR(255) attachment_name
        VARCHAR(512) attachment_path
        INT attachment_size
        VARCHAR(128) attachment_mime
        VARCHAR(32) linked_type
        VARCHAR(128) linked_id "→ SurrealDB quiz_session|roadmap_session"
        LONGTEXT linked_snapshot
        INT like_count
        INT helpful_count
        INT comment_count
        INT share_count
        INT quiz_play_count
        INT roadmap_follow_count
        INT cashback_earned
        CHAR(32) content_hash
        TINYINT is_deleted
        DATETIME created_at
        DATETIME updated_at
    }
    post_comments {
        BIGINT id PK
        BIGINT post_id FK
        INT author_id FK
        TEXT content
        DATETIME created_at
    }
    post_reactions {
        BIGINT post_id PK_FK
        INT user_id PK_FK
        ENUM kind "like|helpful"
        DATETIME created_at
    }
    post_shares {
        BIGINT post_id PK_FK
        INT user_id PK_FK
        DATETIME created_at
    }
    saved_posts {
        INT user_id PK_FK
        BIGINT post_id PK_FK
        DATETIME created_at
    }
    quiz_attempts {
        BIGINT id PK
        BIGINT post_id FK
        INT user_id FK
        INT score
        INT question_count
        TINYINT completed
        TINYINT cashback_paid
        DATETIME created_at
        DATETIME completed_at
    }
    notifications {
        BIGINT id PK
        INT recipient_id FK
        VARCHAR(32) kind
        VARCHAR(255) message
        BIGINT post_id FK
        INT actor_id FK
        TINYINT is_read
        DATETIME created_at
    }
    library_documents {
        BIGINT id PK
        INT owner_id FK
        ENUM scope "course|personal"
        INT room_id FK
        VARCHAR(128) notebook_id "→ SurrealDB notebook"
        VARCHAR(128) source_id "→ SurrealDB source"
        VARCHAR(200) title
        ENUM kind "file|url|text"
        VARCHAR(255) filename
        VARCHAR(512) file_path
        VARCHAR(128) mime
        INT size
        ENUM status "processing|ready|failed"
        VARCHAR(500) error
        INT chunk_count
        INT char_count
        BIGINT post_id FK
        CHAR(32) content_hash
        DATETIME created_at
        DATETIME updated_at
    }
    rag_conversations {
        VARCHAR(64) id PK
        INT user_id FK
        VARCHAR(200) title
        VARCHAR(255) scope_label
        INT message_count
        DATETIME created_at
        DATETIME updated_at
    }
    rag_messages {
        BIGINT id PK
        VARCHAR(64) conversation_id FK
        VARCHAR(16) role
        LONGTEXT content
        LONGTEXT answer_meta "JSON"
        DATETIME created_at
    }
    rag_credit_sessions {
        VARCHAR(64) id PK
        INT user_id FK
        INT credits_left
        LONGTEXT messages
        DATETIME created_at
        DATETIME updated_at
    }
    llm_usage {
        BIGINT id PK
        INT user_id FK
        VARCHAR(32) feature
        VARCHAR(16) kind
        VARCHAR(32) provider
        VARCHAR(96) model
        INT input_tokens
        INT output_tokens
        INT cached_tokens
        INT thinking_tokens
        INT search_queries
        DECIMAL cost_usd "(12,6)"
        INT latency_ms
        TINYINT estimated
        DATETIME created_at
    }
```

## 2. SurrealDB — เอกสาร ชิ้นข้อความ เวกเตอร์ และเซสชัน AI

คอลัมน์ใน MariaDB ที่ชี้มาที่นี่: `users.library_notebook_id` และ `rooms.library_notebook_id` → `notebook`,
`library_documents.notebook_id` → `notebook`, `library_documents.source_id` → `source`,
`posts.linked_id` → `quiz_session` / `roadmap_session` ส่วน `owner_id` ใน `quiz_session`/`roadmap_session`
เก็บ `users.id` ของ MariaDB เป็นข้อความ

```mermaid
erDiagram
    notebook ||--o{ reference : "RELATION source→notebook"
    source ||--o{ reference : ""
    notebook ||--o{ artifact : "RELATION note→notebook"
    note ||--o{ artifact : ""
    source ||--o{ source_embedding : "1 chunk = 1 record"
    source ||--o{ source_insight : ""
    notebook |o--o{ quiz_session : "notebook_id (option)"
    notebook |o--o{ roadmap_session : "notebook_id (option)"

    notebook {
        record id PK "notebook:xxxx"
        string name
        string description
        string owner_id "users.id | course:<id> | default"
        bool archived
        int knowledge_version
        datetime created
        datetime updated
    }
    source {
        record id PK "source:xxxx"
        string title
        string owner_id "users.id ของผู้อัปโหลด"
        object asset "file_path | url"
        string full_text
        array_string topics
        int knowledge_version
        record command "งานประมวลผล"
        datetime created
        datetime updated
    }
    source_embedding {
        record id PK
        record source FK "record<source>"
        int order "ลำดับชิ้นในเอกสาร"
        string content "ข้อความของชิ้น (BM25 index)"
        array_float embedding "3072 มิติ (gemini-embedding-001)"
    }
    source_insight {
        record id PK
        record source FK
        string insight_type
        string content "BM25 index"
        array_float embedding "option"
    }
    note {
        record id PK
        string title
        string note_type "human | ai"
        string content "BM25 index"
        array_float embedding "option"
    }
    quiz_session {
        record id PK
        string owner_id "users.id ใน MariaDB"
        string topic
        int question_count
        array_object questions
        string prompt_hash "import:<post id> = คัดลอกจากฟีด"
    }
    roadmap_session {
        record id PK
        string owner_id "users.id ใน MariaDB"
        string title
        int node_count
        array_object nodes
        array_object edges
        object settings
        object grounding
    }
```

ตารางอื่นใน SurrealDB ที่ไม่อยู่ในผัง: `chat_session`, `global_chat_session`, `refers_to` (relation),
`transformation`, `credential`, และ record เดี่ยว `open_notebook:default_models`

## 3. ตารางสรุปคีย์

| ตาราง | คีย์หลัก | คีย์อ้างอิงเชิงตรรกะ | Unique |
|---|---|---|---|
| users | id | — | username, email, google_sub |
| point_transactions | id | user_id | — |
| rooms | id | created_by (NULL ได้) | code |
| room_members | (room_id, user_id) | room_id, user_id | — |
| posts | id | author_id, room_id (NULL ได้), linked_id → SurrealDB | — |
| post_comments | id | post_id, author_id | — |
| post_reactions | (post_id, user_id, kind) | post_id, user_id | — |
| post_shares | (post_id, user_id) | post_id, user_id | — |
| saved_posts | (user_id, post_id) | user_id, post_id | — |
| quiz_attempts | id | post_id, user_id | — |
| notifications | id | recipient_id, actor_id (NULL ได้), post_id (NULL ได้) | — |
| library_documents | id | owner_id, room_id (NULL ได้), post_id (NULL ได้), notebook_id/source_id → SurrealDB | — |
| rag_conversations | id (UUID) | user_id | — |
| rag_messages | id | conversation_id | — |
| rag_credit_sessions | id (UUID) | user_id | — |
| llm_usage | id | user_id (NULL ได้) | — |
