-- Chave opcional incorporada à Callback URL da WhatsApp Cloud API.
-- NULL preserva URLs legadas. Depois da primeira rotação, somente a URL que
-- contém a chave atual é aceita pela Edge Function.
ALTER TABLE public.lara_settings
  ADD COLUMN IF NOT EXISTS whatsapp_webhook_key TEXT;

COMMENT ON COLUMN public.lara_settings.whatsapp_webhook_key IS
  'Identificador rotativo validado pela função whatsapp-webhook via query string.';
