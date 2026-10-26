-- =============================================================================
-- TELEGRAM MINI APP - SCHEMA
-- Data: 2026-01-22
-- Versão: 1.0
-- Modelo: Single-tenant, Multi-atendente
-- =============================================================================
--
-- Este schema suporta múltiplos atendentes (telegram_users) na mesma instância
-- Dispara. Não há account_id pois é single-tenant.
--
-- Compliance: Supabase Best Practices (Opção A - Backend-First)
-- - RLS habilitado com policies permissivas (backend usa service_role)
-- - Índices em todas as colunas de filtro
-- - CHECK constraints para validação de dados
-- - Triggers para updated_at
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABELA: telegram_users
-- Armazena os atendentes que podem acessar o Mini App
-- =============================================================================

CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação Telegram (imutável após criação)
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  language_code TEXT DEFAULT 'pt',
  is_premium BOOLEAN DEFAULT false,
  photo_url TEXT,

  -- Configurações do atendente
  notifications_enabled BOOLEAN DEFAULT true,

  -- Role do atendente (para futuras permissões)
  role TEXT DEFAULT 'operator',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_telegram_users_role CHECK (role IN ('admin', 'operator', 'viewer'))
);

COMMENT ON TABLE telegram_users IS 'Atendentes vinculados ao Mini App. Multi-atendente, single-tenant.';
COMMENT ON COLUMN telegram_users.telegram_id IS 'ID único do usuário no Telegram (imutável)';
COMMENT ON COLUMN telegram_users.role IS 'Papel do atendente: admin (tudo), operator (atender), viewer (apenas ver)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_id ON telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_role ON telegram_users(role);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_telegram_users_updated_at ON telegram_users;
CREATE TRIGGER update_telegram_users_updated_at
BEFORE UPDATE ON telegram_users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- TABELA: telegram_link_codes
-- Códigos temporários para vincular Telegram ao Dispara
-- =============================================================================

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Código de vinculação (ex: "ABC-123-XYZ")
  code TEXT UNIQUE NOT NULL,

  -- Quem gerou o código (opcional, para auditoria)
  generated_by TEXT,

  -- Controle de uso
  used BOOLEAN DEFAULT false,
  used_by_telegram_id BIGINT,
  used_at TIMESTAMPTZ,

  -- Expiração
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Constraints
  CONSTRAINT chk_telegram_link_codes_expiration CHECK (expires_at > created_at)
);

COMMENT ON TABLE telegram_link_codes IS 'Códigos temporários para vincular Telegram. Expiram em 5 minutos.';
COMMENT ON COLUMN telegram_link_codes.code IS 'Código formatado (ex: ABC-123-XYZ). Único e case-insensitive.';
COMMENT ON COLUMN telegram_link_codes.generated_by IS 'Identificador de quem gerou (IP, user agent, etc.)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON telegram_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_expires ON telegram_link_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_used ON telegram_link_codes(used) WHERE used = false;

-- =============================================================================
-- RLS POLICIES (Backend-First: permissivas pois backend usa service_role)
-- =============================================================================

-- telegram_users
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_users_select_authenticated"
ON telegram_users FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_users_insert_authenticated"
ON telegram_users FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "telegram_users_update_authenticated"
ON telegram_users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "telegram_users_delete_authenticated"
ON telegram_users FOR DELETE TO authenticated USING (true);

-- telegram_link_codes
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_link_codes_select_authenticated"
ON telegram_link_codes FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_link_codes_insert_authenticated"
ON telegram_link_codes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "telegram_link_codes_update_authenticated"
ON telegram_link_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "telegram_link_codes_delete_authenticated"
ON telegram_link_codes FOR DELETE TO authenticated USING (true);

-- =============================================================================
-- REALTIME (opcional - habilitar se precisar de updates em tempo real)
-- =============================================================================

-- Descomentar se quiser notificações realtime de novos atendentes
-- ALTER PUBLICATION supabase_realtime ADD TABLE telegram_users;

-- =============================================================================
-- FUNÇÃO: Limpar códigos expirados (para cron job)
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_telegram_link_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_link_codes
  WHERE expires_at < now()
  RETURNING 1 INTO deleted_count;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON FUNCTION cleanup_expired_telegram_link_codes IS 'Remove códigos de vinculação expirados. Executar via pg_cron ou manualmente.';

-- =============================================================================
-- FUNÇÃO: Gerar código de vinculação
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_telegram_link_code(
  p_generated_by TEXT DEFAULT NULL,
  p_expires_in_minutes INTEGER DEFAULT 5
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Gerar código único no formato ABC-123-XYZ
  LOOP
    v_code := upper(
      substr(md5(random()::text), 1, 3) || '-' ||
      substr(md5(random()::text), 1, 3) || '-' ||
      substr(md5(random()::text), 1, 3)
    );

    -- Verificar se já existe
    SELECT EXISTS(SELECT 1 FROM telegram_link_codes WHERE code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  -- Inserir código
  INSERT INTO telegram_link_codes (code, generated_by, expires_at)
  VALUES (v_code, p_generated_by, now() + (p_expires_in_minutes || ' minutes')::interval);

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION generate_telegram_link_code IS 'Gera código de vinculação único. Formato: ABC-123-XYZ. Expira em 5 min por padrão.';

-- =============================================================================
-- FUNÇÃO: Usar código de vinculação
-- =============================================================================

CREATE OR REPLACE FUNCTION use_telegram_link_code(
  p_code TEXT,
  p_telegram_id BIGINT,
  p_first_name TEXT,
  p_last_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_language_code TEXT DEFAULT 'pt',
  p_is_premium BOOLEAN DEFAULT false,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code_record telegram_link_codes%ROWTYPE;
  v_user_id UUID;
BEGIN
  -- Buscar código
  SELECT * INTO v_code_record
  FROM telegram_link_codes
  WHERE code = upper(p_code)
  FOR UPDATE;

  -- Validações
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Código não encontrado', NULL::UUID;
    RETURN;
  END IF;

  IF v_code_record.used THEN
    RETURN QUERY SELECT false, 'Código já foi utilizado', NULL::UUID;
    RETURN;
  END IF;

  IF v_code_record.expires_at < now() THEN
    RETURN QUERY SELECT false, 'Código expirado', NULL::UUID;
    RETURN;
  END IF;

  -- Verificar se telegram_id já está vinculado
  SELECT id INTO v_user_id
  FROM telegram_users
  WHERE telegram_id = p_telegram_id;

  IF FOUND THEN
    -- Atualizar dados do usuário existente
    UPDATE telegram_users
    SET
      telegram_username = p_username,
      first_name = p_first_name,
      last_name = p_last_name,
      language_code = p_language_code,
      is_premium = p_is_premium,
      photo_url = p_photo_url,
      last_active_at = now()
    WHERE id = v_user_id;
  ELSE
    -- Criar novo usuário
    INSERT INTO telegram_users (
      telegram_id, telegram_username, first_name, last_name,
      language_code, is_premium, photo_url
    )
    VALUES (
      p_telegram_id, p_username, p_first_name, p_last_name,
      p_language_code, p_is_premium, p_photo_url
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- Marcar código como usado
  UPDATE telegram_link_codes
  SET
    used = true,
    used_by_telegram_id = p_telegram_id,
    used_at = now()
  WHERE id = v_code_record.id;

  RETURN QUERY SELECT true, 'Vinculação realizada com sucesso', v_user_id;
END;
$$;

COMMENT ON FUNCTION use_telegram_link_code IS 'Valida e usa código de vinculação. Cria ou atualiza telegram_user.';

COMMIT;
