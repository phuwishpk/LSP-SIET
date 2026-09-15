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

STATEMENTS: list[str] = [
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
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id VARCHAR(32) NULL",
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
    # ----------------------------------------------------------- courses
    f"""
    CREATE TABLE IF NOT EXISTS courses (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        code        VARCHAR(32) NOT NULL UNIQUE,
        name        VARCHAR(128) NOT NULL,
        description VARCHAR(255) NULL,
        created_by  INT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) {_TABLE_OPTS}
    """,
    # Open Notebook notebook backing each course's shared knowledge library.
    "ALTER TABLE courses ADD COLUMN IF NOT EXISTS notebook_id VARCHAR(128) NULL",
    # 'course' = official room created by staff; 'club' = free-form discussion
    # room any student may open (no shared library, so it never feeds the RAG).
    "ALTER TABLE courses ADD COLUMN IF NOT EXISTS kind "
    "ENUM('course','club') NOT NULL DEFAULT 'course'",
    "ALTER TABLE courses ADD INDEX IF NOT EXISTS idx_courses_creator (created_by, created_at)",
    # Personal knowledge library (one Open Notebook notebook per user).
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS library_notebook_id VARCHAR(128) NULL",
    f"""
    CREATE TABLE IF NOT EXISTS course_members (
        course_id INT NOT NULL,
        user_id   INT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (course_id, user_id),
        INDEX idx_cm_user (user_id)
    ) {_TABLE_OPTS}
    """,
    # ------------------------------------------------------------- posts
    f"""
    CREATE TABLE IF NOT EXISTS posts (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        author_id       INT NOT NULL,
        course_id       INT NULL,
        type            ENUM('summary','quiz','roadmap','question','material') NOT NULL,
        title           VARCHAR(200) NULL,
        content         TEXT NULL,
        tags            VARCHAR(255) NULL,
        attachment_name VARCHAR(255) NULL,
        attachment_path VARCHAR(512) NULL,
        attachment_size INT NULL,
        attachment_mime VARCHAR(128) NULL,
        embed_type      VARCHAR(32) NULL,
        embed_id        VARCHAR(128) NULL,
        embed_snapshot  LONGTEXT NULL,
        like_count      INT NOT NULL DEFAULT 0,
        helpful_count   INT NOT NULL DEFAULT 0,
        comment_count   INT NOT NULL DEFAULT 0,
        share_count     INT NOT NULL DEFAULT 0,
        play_count      INT NOT NULL DEFAULT 0,
        follow_count    INT NOT NULL DEFAULT 0,
        cashback_earned INT NOT NULL DEFAULT 0,
        is_deleted      TINYINT(1) NOT NULL DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_posts_created (is_deleted, id),
        INDEX idx_posts_course (course_id, id),
        INDEX idx_posts_author (author_id, id),
        INDEX idx_posts_type (type, id),
        INDEX idx_posts_embed (embed_type, embed_id)
    ) {_TABLE_OPTS}
    """,
    # Fingerprint of title+content, used to reject duplicate/spam posts.
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
    f"""
    CREATE TABLE IF NOT EXISTS quiz_plays (
        id            BIGINT AUTO_INCREMENT PRIMARY KEY,
        post_id       BIGINT NOT NULL,
        user_id       INT NOT NULL,
        score         INT NULL,
        total         INT NULL,
        completed     TINYINT(1) NOT NULL DEFAULT 0,
        cashback_paid TINYINT(1) NOT NULL DEFAULT 0,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at  DATETIME NULL,
        INDEX idx_qp_post_user (post_id, user_id)
    ) {_TABLE_OPTS}
    """,
    f"""
    CREATE TABLE IF NOT EXISTS saved_items (
        user_id    INT NOT NULL,
        post_id    BIGINT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, post_id)
    ) {_TABLE_OPTS}
    """,
    f"""
    CREATE TABLE IF NOT EXISTS rag_sessions (
        id           VARCHAR(64) PRIMARY KEY,
        user_id      INT NOT NULL,
        credits_left INT NOT NULL,
        messages     LONGTEXT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rs_user (user_id, updated_at)
    ) {_TABLE_OPTS}
    """,
    # ------------------------------------------------- knowledge library
    f"""
    CREATE TABLE IF NOT EXISTS library_documents (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        owner_id    INT NOT NULL,
        scope       ENUM('course','personal') NOT NULL DEFAULT 'personal',
        course_id   INT NULL,
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
        chunks      INT NOT NULL DEFAULT 0,
        chars       INT NOT NULL DEFAULT 0,
        post_id     BIGINT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lib_owner (owner_id, id),
        INDEX idx_lib_course (course_id, scope, id),
        INDEX idx_lib_status (status)
    ) {_TABLE_OPTS}
    """,
    # Fingerprint of the uploaded payload, used to reject re-uploads.
    "ALTER TABLE library_documents ADD COLUMN IF NOT EXISTS content_hash CHAR(32) NULL",
    "ALTER TABLE library_documents ADD INDEX IF NOT EXISTS idx_lib_dupe (owner_id, content_hash)",
    "ALTER TABLE library_documents ADD INDEX IF NOT EXISTS idx_lib_owner_time (owner_id, created_at)",
    f"""
    CREATE TABLE IF NOT EXISTS notifications (
        id         BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        kind       VARCHAR(32) NOT NULL,
        message    VARCHAR(255) NOT NULL,
        post_id    BIGINT NULL,
        actor_id   INT NULL,
        is_read    TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_user (user_id, is_read, id)
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
