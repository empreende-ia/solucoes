-- A configuração direta da WhatsApp Cloud API só está completa com os três
-- identificadores fornecidos pela Meta: token, WABA ID e Phone Number ID.
DROP VIEW IF EXISTS public.lara_settings_public;
CREATE VIEW public.lara_settings_public
WITH (security_invoker = false) AS
SELECT
    id,
    company_name,
    sdr_name,
    onboarding_completed_at,
    onboarding_dismissed_at,
    (
      whatsapp_access_token IS NOT NULL
      AND whatsapp_business_account_id IS NOT NULL
      AND whatsapp_phone_number_id IS NOT NULL
    ) AS has_whatsapp_cloud,
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
