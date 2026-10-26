-- Fix the unique constraint on team_functions to be per-user
-- Drop the old constraint that only checks 'name'
ALTER TABLE public.team_functions DROP CONSTRAINT IF EXISTS team_functions_name_key;

-- Add a new constraint that checks (user_id, name) for multi-tenant support
ALTER TABLE public.team_functions ADD CONSTRAINT team_functions_user_name_unique UNIQUE (user_id, name);