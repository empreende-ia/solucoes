ALTER TABLE public.lara_settings
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS anthropic_api_key text,
  ADD COLUMN IF NOT EXISTS openai_api_key text;

ALTER TABLE public.lara_settings
  DROP CONSTRAINT IF EXISTS lara_settings_ai_provider_check;

ALTER TABLE public.lara_settings
  ADD CONSTRAINT lara_settings_ai_provider_check
  CHECK (ai_provider IN ('anthropic', 'openai'));

-- Backfill do modelo a partir do enum legado ai_model_mode (tiers OpenAI)
UPDATE public.lara_settings
SET ai_model = CASE ai_model_mode
    WHEN 'adaptive' THEN 'adaptive'
    WHEN 'pro' THEN 'gpt-5.6-sol'
    WHEN 'pro3' THEN 'gpt-5.6-sol'
    ELSE 'gpt-5.6-terra'
  END
WHERE ai_model IS NULL;