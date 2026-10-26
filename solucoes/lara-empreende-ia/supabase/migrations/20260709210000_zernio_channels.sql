-- Integração Zernio: canais WhatsApp (coexistência) e Instagram DM
-- Contas conectadas via Zernio API + dedup de eventos de webhook + colunas de canal

-- 1. Contas de canal conectadas via Zernio
CREATE TABLE IF NOT EXISTS public.channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'instagram')),
    provider TEXT NOT NULL DEFAULT 'zernio',
    zernio_account_id TEXT NOT NULL,
    zernio_profile_id TEXT,
    username TEXT,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
    connected_at TIMESTAMPTZ DEFAULT now(),
    disconnected_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT channel_connections_provider_account_unique UNIQUE (provider, zernio_account_id)
);

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read channel connections" ON public.channel_connections;
CREATE POLICY "Authenticated can read channel connections"
    ON public.channel_connections FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage channel connections" ON public.channel_connections;
CREATE POLICY "Admins can manage channel connections"
    ON public.channel_connections FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_channel_connections_updated_at ON public.channel_connections;
CREATE TRIGGER update_channel_connections_updated_at
    BEFORE UPDATE ON public.channel_connections
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Dedup de eventos de webhook Zernio (entrega at-least-once)
CREATE TABLE IF NOT EXISTS public.zernio_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed BOOLEAN NOT NULL DEFAULT false,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT zernio_webhook_events_event_id_unique UNIQUE (event_id)
);

ALTER TABLE public.zernio_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read zernio webhook events" ON public.zernio_webhook_events;
CREATE POLICY "Admins can read zernio webhook events"
    ON public.zernio_webhook_events FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_zernio_webhook_events_created_at
    ON public.zernio_webhook_events(created_at);

-- 3. Canal nas conversas e mensagens
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
    ADD COLUMN IF NOT EXISTS zernio_conversation_id TEXT,
    ADD COLUMN IF NOT EXISTS zernio_account_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_zernio_conversation_id
    ON public.conversations(zernio_conversation_id)
    WHERE zernio_conversation_id IS NOT NULL;

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS zernio_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_zernio_message_id
    ON public.messages(zernio_message_id)
    WHERE zernio_message_id IS NOT NULL;

-- 4. Contatos de Instagram (sem telefone)
ALTER TABLE public.contacts
    ALTER COLUMN phone_number DROP NOT NULL;

ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS instagram_user_id TEXT,
    ADD COLUMN IF NOT EXISTS instagram_username TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_instagram_user_id
    ON public.contacts(instagram_user_id)
    WHERE instagram_user_id IS NOT NULL;

-- 5. Configuração Zernio + estado durável do onboarding
ALTER TABLE public.lara_settings
    ADD COLUMN IF NOT EXISTS zernio_api_key TEXT,
    ADD COLUMN IF NOT EXISTS zernio_profile_id TEXT,
    ADD COLUMN IF NOT EXISTS zernio_webhook_id TEXT,
    ADD COLUMN IF NOT EXISTS zernio_webhook_secret TEXT,
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ;

-- 6. View pública sanitizada: inclui estado do onboarding e flags de canal
--    (security definer para funcionar para não-admins; sem nenhum segredo)
DROP VIEW IF EXISTS public.lara_settings_public;
CREATE VIEW public.lara_settings_public
WITH (security_invoker = false) AS
SELECT
    id,
    company_name,
    sdr_name,
    onboarding_completed_at,
    onboarding_dismissed_at,
    (whatsapp_access_token IS NOT NULL AND whatsapp_phone_number_id IS NOT NULL) AS has_whatsapp_cloud,
    (zernio_api_key IS NOT NULL) AS has_zernio,
    (elevenlabs_api_key IS NOT NULL) AS has_elevenlabs,
    (system_prompt_override IS NOT NULL) AS has_custom_prompt,
    is_active,
    updated_at
FROM public.lara_settings;

REVOKE ALL ON public.lara_settings_public FROM anon, public;
GRANT SELECT ON public.lara_settings_public TO authenticated;

-- 7. Realtime para o painel de conexões
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_connections;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.channel_connections REPLICA IDENTITY FULL;
