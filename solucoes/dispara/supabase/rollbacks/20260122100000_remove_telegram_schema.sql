-- =============================================================================
-- ROLLBACK: Remove Telegram Mini App Schema
-- Data: 2026-01-22
-- Descrição: Remove todas as tabelas, funções e configurações do Telegram Mini App
-- =============================================================================
--
-- O sistema de atendentes via web (/atendimento) continua funcionando
-- pois usa a tabela attendant_tokens (não afetada por esta migração).
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- REMOVER RLS POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "telegram_users_select_authenticated" ON telegram_users;
DROP POLICY IF EXISTS "telegram_users_insert_authenticated" ON telegram_users;
DROP POLICY IF EXISTS "telegram_users_update_authenticated" ON telegram_users;
DROP POLICY IF EXISTS "telegram_users_delete_authenticated" ON telegram_users;

DROP POLICY IF EXISTS "telegram_link_codes_select_authenticated" ON telegram_link_codes;
DROP POLICY IF EXISTS "telegram_link_codes_insert_authenticated" ON telegram_link_codes;
DROP POLICY IF EXISTS "telegram_link_codes_update_authenticated" ON telegram_link_codes;
DROP POLICY IF EXISTS "telegram_link_codes_delete_authenticated" ON telegram_link_codes;

-- =============================================================================
-- REMOVER FUNÇÕES
-- =============================================================================

DROP FUNCTION IF EXISTS use_telegram_link_code(TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS generate_telegram_link_code(TEXT, INTEGER);
DROP FUNCTION IF EXISTS cleanup_expired_telegram_link_codes();

-- =============================================================================
-- REMOVER TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS update_telegram_users_updated_at ON telegram_users;

-- =============================================================================
-- REMOVER TABELAS
-- =============================================================================

DROP TABLE IF EXISTS telegram_link_codes;
DROP TABLE IF EXISTS telegram_users;

-- =============================================================================
-- LIMPAR CONFIGURAÇÕES NA TABELA SETTINGS
-- =============================================================================

DELETE FROM settings WHERE key IN (
  'telegram_bot_token',
  'telegram_bot_username',
  'telegram_webhook_url',
  'telegram_miniapp_url'
);

COMMIT;
