CREATE TABLE IF NOT EXISTS public.org_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_name text NOT NULL,
  key_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key_name)
);

GRANT ALL ON public.org_secrets TO service_role;

ALTER TABLE public.org_secrets ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: write-only via service role (edge functions).