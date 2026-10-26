-- Remover campos legados que não são mais utilizados no sistema
-- Cal.com: agendamento é nativo via Lara, não usa Cal.com
-- OpenAI: a chave era desnecessária na época (gateway gerenciado)

ALTER TABLE public.lara_settings DROP COLUMN IF EXISTS calcom_api_key;
ALTER TABLE public.lara_settings DROP COLUMN IF EXISTS openai_api_key;
ALTER TABLE public.lara_settings DROP COLUMN IF EXISTS openai_model;
ALTER TABLE public.lara_settings DROP COLUMN IF EXISTS openai_assistant_id;