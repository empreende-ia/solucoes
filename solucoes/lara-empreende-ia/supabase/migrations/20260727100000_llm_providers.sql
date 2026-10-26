-- Provedores de LLM selecionáveis (OpenAI / Anthropic).
-- hardening de 24/jul); o motor lê via service role.
--
-- ai_provider: 'openai' | 'anthropic'
-- ai_model:    id do modelo dentro do provedor, ou 'adaptive' (alterna por
--              contexto), ou NULL (default do provedor). Quando NULL, o motor
--              ainda honra o legado ai_model_mode ('flash'/'pro'/'pro3'/'adaptive').
ALTER TABLE public.lara_settings
    ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'openai',
    ADD COLUMN IF NOT EXISTS ai_model TEXT,
    ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT,
    ADD COLUMN IF NOT EXISTS openai_api_key TEXT;

ALTER TABLE public.lara_settings
    DROP CONSTRAINT IF EXISTS lara_settings_ai_provider_check;
ALTER TABLE public.lara_settings
    ADD CONSTRAINT lara_settings_ai_provider_check
    CHECK (ai_provider IN ('anthropic', 'openai'));

-- View pública sanitizada ganha as flags dos novos provedores (sem segredos).
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
    (anthropic_api_key IS NOT NULL) AS has_anthropic,
    (openai_api_key IS NOT NULL) AS has_openai,
    is_active,
    updated_at
FROM public.lara_settings;

REVOKE ALL ON public.lara_settings_public FROM anon, public;
GRANT SELECT ON public.lara_settings_public TO authenticated;
