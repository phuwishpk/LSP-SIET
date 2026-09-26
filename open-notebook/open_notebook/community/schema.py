"""
Idempotent MariaDB schema for the KMITL workspace community + point wallet.

``docker/mariadb-init.sql`` only runs the first time the MariaDB volume is
created, so every statement here must be safe to re-run on every API start
(``CREATE TABLE IF NOT EXISTS`` / ``ADD COLUMN IF NOT EXISTS`` – both are
supported by MariaDB 10.2+).
"""

from __future__ import annotations

from loguru import logger
from sqlalchemy import text

from open_notebook.domain.user import _get_engine

_TABLE_OPTS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"

# Tables and columns renamed on 2026-09-24 so the schema says what it stores:
# a "course" row is also a student discussion room, "embed" clashed with the
# RAG's vector embeddings, "student_id" looked like a foreign key, and so on.
# Each statement is a no-op once applied (and on a fresh database), and they
# run before the CREATE TABLEs so existing rows move instead of an empty table
# appearing under the new name. The Python layer and the API keep the older
# keys - reads alias the new columns back to them.
RENAMES: list[str] = [
    "RENAME TABLE IF EXISTS courses TO rooms",
    "RENAME TABLE IF EXISTS course_members TO room_members",
    "RENAME TABLE IF EXISTS saved_items TO saved_posts",
    "RENAME TABLE IF EXISTS quiz_plays TO quiz_attempts",
    "RENAME TABLE IF EXISTS rag_sessions TO rag_credit_sessions",
    "ALTER TABLE IF EXISTS users RENAME COLUMN IF EXISTS student_id TO student_code",
    "ALTER TABLE IF EXISTS rooms RENAME COLUMN IF EXISTS notebook_id TO library_notebook_id",
    "ALTER TABLE IF EXISTS room_members RENAME COLUMN IF EXISTS course_id TO room_id",
    "ALTER TABLE IF EXISTS posts RENAME COLUMN IF EXISTS course_id TO room_id",
    "ALTER TABLE IF EXISTS posts RENAME COLUMN IF EXISTS embed_type TO linked_type",
    "ALTER TABLE IF EXISTS posts RENAME COLUMN IF EXISTS embed_id TO linked_id",
    "ALTER TABLE IF EXISTS posts RENAME COLUMN IF EXISTS embed_snapshot TO linked_snapshot",
    "ALTER TABLE IF EXISTS quiz_attempts RENAME COLUMN IF EXISTS total TO question_count",
    "ALTER TABLE IF EXISTS rag_messages RENAME COLUMN IF EXISTS meta TO answer_meta",
    "ALTER TABLE IF EXISTS library_documents RENAME COLUMN IF EXISTS course_id TO room_id",
    "ALTER TABLE IF EXISTS library_documents RENAME COLUMN IF EXISTS chunks TO chunk_count",
    "ALTER TABLE IF EXISTS library_documents RENAME COLUMN IF EXISTS chars TO char_count",
    "ALTER TABLE IF EXISTS notifications RENAME COLUMN IF EXISTS user_id TO recipient_id",
    # play_count → quiz_play_count: ชัดเจนว่านับการเริ่มทำ quiz ไม่ใช่ media player
    "ALTER TABLE IF EXISTS posts RENAME COLUMN IF EXISTS play_count TO quiz_play_count",
    # follow_count → roadmap_follow_count: ชัดเจนว่านับการ copy Roadmap ไปใช้งาน
    "ALTER TABLE IF EXISTS posts RENAME COLUMN IF EXISTS follow_count TO roadmap_follow_count",
]

STATEMENTS: list[str] = RENAMES + [
    # ------------------------------------------------------------------ users
    f"""
    CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        username      VARCHAR(32)  NOT NULL UNIQUE,
        password_hash VARCHAR(255) NULL,
        display_name  VARCHAR(128) DEFAULT NULL,
        role          ENUM('admin', 'student', 'teacher') NOT NULL DEFAULT 'student',
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login_at DATETIME DEFAULT NULL,
        INDEX idx_username (username),
        INDEX idx_role (role)
    ) {_TABLE_OPTS}
    """,
    "ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL",
    "ALTER TABLE users MODIFY COLUMN role ENUM('admin','student','teacher') NOT NULL DEFAULT 'student'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(191) NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512) NULL",
    # The 8-digit student number from the KMITL e-mail - not a foreign key.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS student_code VARCHAR(32) NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS points_balance INT NOT NULL DEFAULT 0",
    # Suspended accounts keep their data but cannot sign in.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD UNIQUE INDEX IF NOT EXISTS idx_users_email (email)",
    "ALTER TABLE users ADD UNIQUE INDEX IF NOT EXISTS idx_users_google_sub (google_sub)",
    # ------------------------------------------------------------ points
    f"""
    CREATE TABLE IF NOT EXISTS point_transactions (
        id            BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id       INT NOT NULL,
        delta         INT NOT NULL,
        balance_after INT NOT NULL,
        kind          VARCHAR(32) NOT NULL,
        ref_type      VARCHAR(32) NULL,
        ref_id        VARCHAR(128) NULL,
        note          VARCHAR(255) NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pt_user (user_id, created_at),
        INDEX idx_pt_kind (kind, created_at)
    ) {_TABLE_OPTS}
    """,
    # ------------------------------------------------------------- rooms
    # One table for both kinds of room: kind='course' is an official course
    # room, kind='club' a discussion room any student may open.
    f"""
    CREATE TABLE IF NOT EXISTS rooms (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        code        VARCHAR(32) NOT NULL UNIQUE,
        name        VARCHAR(128) NOT NULL,
        description VARCHAR(255) NULL,
        created_by  INT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) {_TABLE_OPTS}
    """,
    # Open Notebook notebook backing a course room's shared knowledge library.
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS library_notebook_id VARCHAR(128) NULL",
    # 'course' = official room created by staff; 'club' = free-form discussion
    # room any student may open (no shared library, so it never feeds the RAG).
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kind "
    "ENUM('course','club') NOT NULL DEFAULT 'course'",
    "ALTER TABLE rooms ADD INDEX IF NOT EXISTS idx_courses_creator (created_by, created_at)",
    # Personal knowledge library (one Open Notebook notebook per user).
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS library_notebook_id VARCHAR(128) NULL",
    f"""
    CREATE TABLE IF NOT EXISTS room_members (
        room_id   INT NOT NULL,
        user_id   INT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (room_id, user_id),
        INDEX idx_cm_user (user_id)
    ) {_TABLE_OPTS}
    """,
    # ------------------------------------------------------------- posts
    # linked_* is the quiz/roadmap attached to a post (not a vector embedding).
    f"""
    CREATE TABLE IF NOT EXISTS posts (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        author_id       INT NOT NULL,
        room_id         INT NULL,
        type            ENUM('summary','quiz','roadmap','question','material') NOT NULL,
        title           VARCHAR(200) NULL,
        content         TEXT NULL,
        tags            VARCHAR(255) NULL,
        attachment_name VARCHAR(255) NULL,
        attachment_path VARCHAR(512) NULL,
        attachment_size INT NULL,
        attachment_mime VARCHAR(128) NULL,
        linked_type     VARCHAR(32) NULL,
        linked_id       VARCHAR(128) NULL,
        linked_snapshot LONGTEXT NULL,
        like_count           INT NOT NULL DEFAULT 0,
        helpful_count        INT NOT NULL DEFAULT 0,
        comment_count        INT NOT NULL DEFAULT 0,
        share_count          INT NOT NULL DEFAULT 0,
        -- จำนวนครั้งที่ผู้ใช้เริ่มทำ quiz ที่แนบมากับโพสต์นี้
        quiz_play_count      INT NOT NULL DEFAULT 0,
        -- จำนวนผู้ใช้ที่ copy Roadmap ของโพสต์นี้ไปใช้งาน (roadmap posts เท่านั้น)
        roadmap_follow_count INT NOT NULL DEFAULT 0,
        cashback_earned      INT NOT NULL DEFAULT 0,
        is_deleted      TINYINT(1) NOT NULL DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_posts_created (is_deleted, id),
        INDEX idx_posts_course (room_id, id),
        INDEX idx_posts_author (author_id, id),
        INDEX idx_posts_type (type, id),
        INDEX idx_posts_embed (linked_type, linked_id)
    ) {_TABLE_OPTS}
    """,
    # MD5(title + content + linked_id) fingerprint ใช้กรอง duplicate/spam posts
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_hash CHAR(32) NULL",
    "ALTER TABLE posts ADD INDEX IF NOT EXISTS idx_posts_dupe (author_id, content_hash, created_at)",
    "ALTER TABLE posts ADD INDEX IF NOT EXISTS idx_posts_author_time (author_id, created_at)",
    f"""
    CREATE TABLE IF NOT EXISTS post_reactions (
        post_id    BIGINT NOT NULL,
        user_id    INT NOT NULL,
        kind       ENUM('like','helpful') NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (post_id, user_id, kind)
    ) {_TABLE_OPTS}
    """,
    # One row per (post, user): the authoritative record of who already shared
    # what. Inferring this from the points ledger missed self-shares and shares
    # made after the daily point cap, which let the share count be inflated.
    f"""
    CREATE TABLE IF NOT EXISTS post_shares (
        post_id    BIGINT NOT NULL,
        user_id    INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (post_id, user_id),
        INDEX idx_ps_user (user_id, created_at)
    ) {_TABLE_OPTS}
    """,
    f"""
    CREATE TABLE IF NOT EXISTS post_comments (
        id         BIGINT AUTO_INCREMENT PRIMARY KEY,
        post_id    BIGINT NOT NULL,
        author_id  INT NOT NULL,
        content    TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pc_post (post_id, id)
    ) {_TABLE_OPTS}
    """,
    "ALTER TABLE post_comments ADD INDEX IF NOT EXISTS idx_pc_author_time (author_id, created_at)",
    # One row per attempt at a quiz shared in a post (a quiz can be retaken).
    f"""
    CREATE TABLE IF NOT EXISTS quiz_attempts (
        id             BIGINT AUTO_INCREMENT PRIMARY KEY,
        post_id        BIGINT NOT NULL,
        user_id        INT NOT NULL,
        score          INT NULL,
        question_count INT NULL,
        completed      TINYINT(1) NOT NULL DEFAULT 0,
        cashback_paid  TINYINT(1) NOT NULL DEFAULT 0,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at   DATETIME NULL,
        INDEX idx_qp_post_user (post_id, user_id)
    ) {_TABLE_OPTS}
    """,
    f"""
    CREATE TABLE IF NOT EXISTS saved_posts (
        user_id    INT NOT NULL,
        post_id    BIGINT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, post_id)
    ) {_TABLE_OPTS}
    """,
    # A paid 5-message RAG session: credits_left counts the messages still
    # covered by the points already spent. Not the chat history (see below).
    f"""
    CREATE TABLE IF NOT EXISTS rag_credit_sessions (
        id           VARCHAR(64) PRIMARY KEY,
        user_id      INT NOT NULL,
        credits_left INT NOT NULL,
        messages     LONGTEXT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rs_user (user_id, updated_at)
    ) {_TABLE_OPTS}
    """,
    # ------------------------------------------------- RAG chat history
    # Every question a user asks KMITL RAG AI (single or session mode, ask page
    # or sidebar widget) is appended to a conversation the user can reopen,
    # continue, rename or delete. Private to its owner - admins included.
    f"""
    CREATE TABLE IF NOT EXISTS rag_conversations (
        id            VARCHAR(64) PRIMARY KEY,
        user_id       INT NOT NULL,
        title         VARCHAR(200) NOT NULL,
        scope_label   VARCHAR(255) NULL,
        message_count INT NOT NULL DEFAULT 0,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rc_user (user_id, updated_at)
    ) {_TABLE_OPTS}
    """,
    f"""
    CREATE TABLE IF NOT EXISTS rag_messages (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL,
        role            VARCHAR(16) NOT NULL,
        content         LONGTEXT NOT NULL,
        answer_meta     LONGTEXT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rm_conv (conversation_id, id)
    ) {_TABLE_OPTS}
    """,
    # ------------------------------------------------- knowledge library
    f"""
    CREATE TABLE IF NOT EXISTS library_documents (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        owner_id    INT NOT NULL,
        scope       ENUM('course','personal') NOT NULL DEFAULT 'personal',
        room_id     INT NULL,
        notebook_id VARCHAR(128) NOT NULL,
        source_id   VARCHAR(128) NULL,
        title       VARCHAR(200) NOT NULL,
        kind        ENUM('file','url','text') NOT NULL DEFAULT 'file',
        filename    VARCHAR(255) NULL,
        file_path   VARCHAR(512) NULL,
        mime        VARCHAR(128) NULL,
        size        INT NULL,
        status      ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
        error       VARCHAR(500) NULL,
        chunk_count INT NOT NULL DEFAULT 0,
        char_count  INT NOT NULL DEFAULT 0,
        post_id     BIGINT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lib_owner (owner_id, id),
        INDEX idx_lib_course (room_id, scope, id),
        INDEX idx_lib_status (status)
    ) {_TABLE_OPTS}
    """,
    # Fingerprint of the uploaded payload, used to reject re-uploads.
    "ALTER TABLE library_documents ADD COLUMN IF NOT EXISTS content_hash CHAR(32) NULL",
    "ALTER TABLE library_documents ADD INDEX IF NOT EXISTS idx_lib_dupe (owner_id, content_hash)",
    "ALTER TABLE library_documents ADD INDEX IF NOT EXISTS idx_lib_owner_time (owner_id, created_at)",
    f"""
    CREATE TABLE IF NOT EXISTS notifications (
        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
        recipient_id INT NOT NULL,
        kind         VARCHAR(32) NOT NULL,
        message      VARCHAR(255) NOT NULL,
        post_id      BIGINT NULL,
        actor_id     INT NULL,
        is_read      TINYINT(1) NOT NULL DEFAULT 0,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_user (recipient_id, is_read, id)
    ) {_TABLE_OPTS}
    """,
]


async def ensure_schema() -> None:
    """Create / upgrade every community table. Safe to call on every boot."""
    engine = _get_engine()
    async with engine.begin() as conn:
        for statement in STATEMENTS:
            await conn.execute(text(statement))
    logger.info("Community MariaDB schema is up to date")
