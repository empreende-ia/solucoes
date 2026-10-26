ALTER TABLE public.lara_settings
  ADD COLUMN IF NOT EXISTS nylas_client_id TEXT,
  ADD COLUMN IF NOT EXISTS nylas_api_key TEXT,
  ADD COLUMN IF NOT EXISTS nylas_api_uri TEXT;