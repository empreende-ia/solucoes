-- Adiciona coluna ai_model_mode à tabela lara_settings
ALTER TABLE public.lara_settings 
ADD COLUMN ai_model_mode TEXT DEFAULT 'flash' 
CHECK (ai_model_mode IN ('flash', 'pro', 'adaptive'));