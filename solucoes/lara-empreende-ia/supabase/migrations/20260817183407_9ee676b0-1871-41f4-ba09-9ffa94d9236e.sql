ALTER TABLE public.calendar_integrations
  ADD COLUMN IF NOT EXISTS grant_id text,
  ADD COLUMN IF NOT EXISTS grant_provider text;