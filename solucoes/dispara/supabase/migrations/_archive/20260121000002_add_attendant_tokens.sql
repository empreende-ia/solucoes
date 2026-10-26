-- ============================================================================
-- Migration: Tokens de Atendentes
-- Permite criar links de acesso para atendentes sem conta
-- ============================================================================

-- Tabela de tokens de atendentes
CREATE TABLE IF NOT EXISTS attendant_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  name TEXT NOT NULL,                    -- Nome do atendente (ex: "João - Suporte")
  token TEXT NOT NULL UNIQUE,            -- Token único para URL

  -- Permissões
  permissions JSONB NOT NULL DEFAULT '{"canView": true, "canReply": true, "canHandoff": false}'::jsonb,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Tracking
  last_used_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,

  -- Expiração (opcional)
  expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_attendant_tokens_token ON attendant_tokens(token);
CREATE INDEX IF NOT EXISTS idx_attendant_tokens_active ON attendant_tokens(is_active) WHERE is_active = true;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_attendant_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_attendant_tokens_updated_at ON attendant_tokens;
CREATE TRIGGER trigger_attendant_tokens_updated_at
  BEFORE UPDATE ON attendant_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_attendant_tokens_updated_at();

-- RLS (desabilitado por enquanto - single tenant)
ALTER TABLE attendant_tokens ENABLE ROW LEVEL SECURITY;

-- Política permissiva para service role
CREATE POLICY "Service role has full access to attendant_tokens"
  ON attendant_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comentários
COMMENT ON TABLE attendant_tokens IS 'Tokens de acesso para atendentes (versão web do monitor)';
COMMENT ON COLUMN attendant_tokens.name IS 'Nome do atendente para identificação';
COMMENT ON COLUMN attendant_tokens.token IS 'Token único usado na URL de acesso';
COMMENT ON COLUMN attendant_tokens.permissions IS 'Permissões: canView, canReply, canHandoff';
COMMENT ON COLUMN attendant_tokens.access_count IS 'Contador de acessos para auditoria';
