-- Add WhatsApp Business Account ID column
ALTER TABLE public.lara_settings 
ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT;