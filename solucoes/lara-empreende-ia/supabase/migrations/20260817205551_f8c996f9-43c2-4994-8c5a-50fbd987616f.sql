ALTER TABLE public.lara_settings
  ADD COLUMN IF NOT EXISTS demo_mode_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.lara_settings_public
WITH (security_invoker = true) AS
 SELECT id,
    company_name,
    sdr_name,
    onboarding_completed_at,
    onboarding_dismissed_at,
    whatsapp_access_token IS NOT NULL AND whatsapp_business_account_id IS NOT NULL AND whatsapp_phone_number_id IS NOT NULL AS has_whatsapp_cloud,
    zernio_api_key IS NOT NULL AS has_zernio,
    elevenlabs_api_key IS NOT NULL AS has_elevenlabs,
    system_prompt_override IS NOT NULL AS has_custom_prompt,
    anthropic_api_key IS NOT NULL AS has_anthropic,
    openai_api_key IS NOT NULL AS has_openai,
    is_active,
    updated_at,
    demo_mode_enabled
   FROM public.lara_settings;