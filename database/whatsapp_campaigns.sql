-- =============================================================================
-- WhatsApp Campaigns — MySQL 8 Schema
-- =============================================================================

CREATE DATABASE IF NOT EXISTS whatsapp_campaigns
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE whatsapp_campaigns;

-- =============================================================================
-- DROP TABLES (reverse FK dependency order)
-- =============================================================================

DROP TABLE IF EXISTS send_logs;
DROP TABLE IF EXISTS message_targets;
DROP TABLE IF EXISTS message_translations;
DROP TABLE IF EXISTS campaign_messages;
DROP TABLE IF EXISTS series_targets;
DROP TABLE IF EXISTS campaign_series;
DROP TABLE IF EXISTS `groups`;
DROP TABLE IF EXISTS users;

-- =============================================================================
-- CREATE TABLES (dependency order)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. users
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name           VARCHAR(255)     NOT NULL,
    email          VARCHAR(255)     NOT NULL,
    password       VARCHAR(255)     NOT NULL,
    role           ENUM('admin','viewer') NOT NULL DEFAULT 'admin',
    locale         VARCHAR(10)      NOT NULL DEFAULT 'fr'
                                    COMMENT 'UI language preference',
    remember_token VARCHAR(100)     NULL,
    created_at     TIMESTAMP        NULL,
    updated_at     TIMESTAMP        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. groups
-- -----------------------------------------------------------------------------
CREATE TABLE `groups` (
    id                 BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    whatsapp_group_id  VARCHAR(100)     NOT NULL,
    name               VARCHAR(255)     NOT NULL,
    language           VARCHAR(10)      NOT NULL,
    country            VARCHAR(100)     NULL,
    continent          VARCHAR(100)     NULL,
    member_count       INT UNSIGNED     NOT NULL DEFAULT 0,
    is_active          BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP        NULL,
    updated_at         TIMESTAMP        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_groups_whatsapp_group_id (whatsapp_group_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. campaign_series
-- -----------------------------------------------------------------------------
CREATE TABLE campaign_series (
    id                BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name              VARCHAR(255)     NOT NULL,
    type              ENUM('drip','one_shot') NOT NULL DEFAULT 'drip',
    status            ENUM('draft','scheduled','active','completed','paused','failed')
                                       NOT NULL DEFAULT 'draft',
    targeting_mode    ENUM('by_language','by_group','hybrid')
                                       NOT NULL DEFAULT 'by_language',
    target_languages  JSON             NULL
                                       COMMENT 'Array of language codes ex: ["fr","en","de"]',
    send_days         JSON             NULL
                                       COMMENT 'Array of day names ex: ["monday","wednesday","friday"]',
    messages_per_week SMALLINT UNSIGNED NULL
                                       COMMENT 'Derived from count(send_days), stored for display',
    send_time         TIME             NOT NULL DEFAULT '09:00:00',
    timezone          VARCHAR(50)      NOT NULL DEFAULT 'Europe/Paris',
    starts_at         DATE             NOT NULL,
    ends_at           DATE             NULL,
    total_messages    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    sent_messages     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    translation_mode  ENUM('auto','manual') NOT NULL DEFAULT 'auto',
    source_language   VARCHAR(10)      NULL DEFAULT 'fr',
    notes             TEXT             NULL,
    created_by        BIGINT UNSIGNED  NULL,
    created_at        TIMESTAMP        NULL,
    updated_at        TIMESTAMP        NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_campaign_series_created_by
        FOREIGN KEY (created_by) REFERENCES users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. series_targets
-- -----------------------------------------------------------------------------
CREATE TABLE series_targets (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    series_id  BIGINT UNSIGNED NOT NULL,
    group_id   BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP       NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_series_targets_series_group (series_id, group_id),
    CONSTRAINT fk_series_targets_series_id
        FOREIGN KEY (series_id) REFERENCES campaign_series (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_series_targets_group_id
        FOREIGN KEY (group_id) REFERENCES `groups` (id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. campaign_messages
-- -----------------------------------------------------------------------------
CREATE TABLE campaign_messages (
    id           BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    series_id    BIGINT UNSIGNED  NOT NULL,
    order_index  TINYINT UNSIGNED NOT NULL
                                  COMMENT 'Position in series starting at 1',
    scheduled_at TIMESTAMP        NOT NULL
                                  COMMENT 'Calculated send datetime in UTC',
    status       ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
    sent_at      TIMESTAMP        NULL,
    created_at   TIMESTAMP        NULL,
    updated_at   TIMESTAMP        NULL,
    PRIMARY KEY (id),
    INDEX idx_campaign_messages_scheduled (scheduled_at, status),
    CONSTRAINT fk_campaign_messages_series_id
        FOREIGN KEY (series_id) REFERENCES campaign_series (id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. message_translations
-- -----------------------------------------------------------------------------
CREATE TABLE message_translations (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    message_id     BIGINT UNSIGNED NOT NULL,
    language       VARCHAR(10)     NOT NULL,
    content        TEXT            NOT NULL,
    translated_by  ENUM('manual','gpt4o') NOT NULL DEFAULT 'manual',
    created_at     TIMESTAMP       NULL,
    updated_at     TIMESTAMP       NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_message_translations_message_lang (message_id, language),
    CONSTRAINT fk_message_translations_message_id
        FOREIGN KEY (message_id) REFERENCES campaign_messages (id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. message_targets
-- -----------------------------------------------------------------------------
CREATE TABLE message_targets (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    message_id     BIGINT UNSIGNED NOT NULL,
    group_id       BIGINT UNSIGNED NOT NULL,
    custom_content TEXT            NULL
                                   COMMENT 'Custom message for this group — if NULL uses translation',
    created_at     TIMESTAMP       NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_message_targets_message_group (message_id, group_id),
    CONSTRAINT fk_message_targets_message_id
        FOREIGN KEY (message_id) REFERENCES campaign_messages (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_message_targets_group_id
        FOREIGN KEY (group_id) REFERENCES `groups` (id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. send_logs
-- -----------------------------------------------------------------------------
CREATE TABLE send_logs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    message_id    BIGINT UNSIGNED NOT NULL,
    group_id      BIGINT UNSIGNED NOT NULL,
    language      VARCHAR(10)     NOT NULL,
    content_sent  TEXT            NOT NULL
                                  COMMENT 'Exact content snapshot sent',
    status        ENUM('sent','failed') NOT NULL,
    sent_at       TIMESTAMP       NULL,
    error_message TEXT            NULL,
    PRIMARY KEY (id),
    INDEX idx_send_logs_message (message_id),
    INDEX idx_send_logs_group (group_id),
    CONSTRAINT fk_send_logs_message_id
        FOREIGN KEY (message_id) REFERENCES campaign_messages (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_send_logs_group_id
        FOREIGN KEY (group_id) REFERENCES `groups` (id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Schema version: 1.0.0 — 2026-03-13
-- =============================================================================
