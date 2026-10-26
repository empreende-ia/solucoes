-- Fix the unique constraint on teams to be per-user
-- Drop the old constraint that only checks 'name'
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_name_key;

-- Add a new constraint that checks (user_id, name) for multi-tenant support
ALTER TABLE public.teams ADD CONSTRAINT teams_user_name_unique UNIQUE (user_id, name);