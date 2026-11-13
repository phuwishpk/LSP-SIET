-- First-boot seed for the MariaDB volume (runs once, on an empty volume).
-- Only the users table is created here; every other table, and every later
-- column, is created and upgraded by open_notebook/community/schema.py on
-- each API start. Keep this in step with that file.

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(32)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,          -- NULL for Google sign-in accounts
    display_name  VARCHAR(128) DEFAULT NULL,
    role          ENUM('admin', 'student', 'teacher', 'pending') NOT NULL DEFAULT 'student',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at     DATETIME DEFAULT NULL,
    pdpa_consented_at DATETIME DEFAULT NULL,
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS allowed_teachers (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(191) NOT NULL UNIQUE,
    role          VARCHAR(32)  NOT NULL DEFAULT 'teacher',
    department    VARCHAR(128) NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_teacher_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
