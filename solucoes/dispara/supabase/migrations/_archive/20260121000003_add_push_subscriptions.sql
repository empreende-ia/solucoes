-- Push Subscriptions Table
-- Armazena subscriptions de notificações push para PWA

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Endpoint único do subscription (URL do push service)
  endpoint TEXT NOT NULL UNIQUE,

  -- Keys para criptografia (p256dh e auth)
  keys JSONB NOT NULL,

  -- Opcional: associar a um attendant token
  attendant_token_id UUID REFERENCES attendant_tokens(id) ON DELETE SET NULL,

  -- User agent para identificar dispositivo
  user_agent TEXT,

  -- Metadados
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_keys CHECK (keys ? 'p256dh' AND keys ? 'auth')
);

-- Índices
CREATE INDEX idx_push_subscriptions_attendant ON push_subscriptions(attendant_token_id);
CREATE INDEX idx_push_subscriptions_created ON push_subscriptions(created_at DESC);

-- Comentários
COMMENT ON TABLE push_subscriptions IS 'Subscriptions de notificações push para PWA';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'URL única do push service para este subscription';
COMMENT ON COLUMN push_subscriptions.keys IS 'Chaves de criptografia (p256dh e auth)';
