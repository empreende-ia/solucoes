
-- Create whatsapp_instance_secrets table
CREATE TABLE public.whatsapp_instance_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  api_url text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add missing columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
  ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'evolution_self_hosted',
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_code text,
  ADD COLUMN IF NOT EXISTS instance_id_external text;

-- Migrate existing data: copy server_url/api_key to secrets table
INSERT INTO public.whatsapp_instance_secrets (instance_id, api_url, api_key)
SELECT id, server_url, api_key FROM public.whatsapp_instances WHERE server_url IS NOT NULL AND api_key IS NOT NULL;

-- Enable RLS
ALTER TABLE public.whatsapp_instance_secrets ENABLE ROW LEVEL SECURITY;

-- RLS: Only accessible via service role (edge functions)
-- No direct user access to secrets
CREATE POLICY "No direct user access to instance secrets"
  ON public.whatsapp_instance_secrets
  FOR SELECT
  USING (false);
