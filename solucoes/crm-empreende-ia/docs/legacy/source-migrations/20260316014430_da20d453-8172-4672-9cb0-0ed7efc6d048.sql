
-- Add onboarding columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 1;

-- Mark existing users who already have an org as completed
UPDATE public.profiles SET onboarding_completed = true WHERE org_id IS NOT NULL;

-- Create org_secrets table for secure API key storage (edge functions only via service role)
CREATE TABLE IF NOT EXISTS public.org_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_name text NOT NULL,
  key_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, key_name)
);

ALTER TABLE public.org_secrets ENABLE ROW LEVEL SECURITY;

-- Function to bootstrap org owner (bypasses user_roles RLS chicken-and-egg)
CREATE OR REPLACE FUNCTION public.initialize_org_owner(p_org_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND org_id = p_org_id AND role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (p_user_id, p_org_id, 'owner');
  END IF;
  UPDATE public.profiles SET org_id = p_org_id WHERE id = p_user_id AND org_id IS NULL;
END;
$$;
