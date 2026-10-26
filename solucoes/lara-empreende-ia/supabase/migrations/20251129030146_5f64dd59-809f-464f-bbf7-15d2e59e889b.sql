-- Add 'pro3' option to ai_model_mode constraint
ALTER TABLE public.lara_settings 
DROP CONSTRAINT IF EXISTS lara_settings_ai_model_mode_check;

ALTER TABLE public.lara_settings 
ADD CONSTRAINT lara_settings_ai_model_mode_check 
CHECK (ai_model_mode IN ('flash', 'pro', 'pro3', 'adaptive'));