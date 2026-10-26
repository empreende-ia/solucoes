-- Fix the unique constraint on tag_definitions to be per-user
-- Drop the old constraint that only checks 'key'
ALTER TABLE public.tag_definitions DROP CONSTRAINT IF EXISTS tag_definitions_key_key;

-- Add a new constraint that checks (user_id, key) for multi-tenant support
ALTER TABLE public.tag_definitions ADD CONSTRAINT tag_definitions_user_key_unique UNIQUE (user_id, key);