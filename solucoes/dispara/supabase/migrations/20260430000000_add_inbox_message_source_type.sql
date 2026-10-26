-- Marca a origem de uma mensagem inbound: texto livre, clique em botão, seleção em lista, etc.
-- Permite filtrar conversas no inbox por interações específicas (ex.: quem clicou em "Confirmar cadastro").

ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS button_payload text;

ALTER TABLE public.inbox_messages
  DROP CONSTRAINT IF EXISTS chk_inbox_messages_source_type;

ALTER TABLE public.inbox_messages
  ADD CONSTRAINT chk_inbox_messages_source_type
  CHECK (source_type = ANY (ARRAY['text'::text, 'button_reply'::text, 'list_reply'::text, 'media'::text, 'system'::text]));

-- Index parcial: aceleração para "lista todas as conversas com pelo menos uma button_reply X".
CREATE INDEX IF NOT EXISTS idx_inbox_messages_button_payload
  ON public.inbox_messages (button_payload, conversation_id)
  WHERE source_type = 'button_reply';

-- Atualiza RPC para aceitar source_type/button_payload.
DROP FUNCTION IF EXISTS public.process_inbound_message(text, text, text, text, text, jsonb, text);

CREATE FUNCTION public.process_inbound_message(
  p_phone TEXT,
  p_content TEXT,
  p_whatsapp_message_id TEXT DEFAULT NULL,
  p_message_type TEXT DEFAULT 'text',
  p_media_url TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_contact_id TEXT DEFAULT NULL,
  p_source_type TEXT DEFAULT 'text',
  p_button_payload TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conversation_id UUID;
  v_message_id UUID;
  v_conversation_status TEXT;
  v_conversation_mode TEXT;
  v_ai_agent_id UUID;
  v_human_mode_expires_at TIMESTAMPTZ;
  v_automation_paused_until TIMESTAMPTZ;
  v_is_new_conversation BOOLEAN := FALSE;
  v_message_preview TEXT;
  v_contact_id TEXT;
  v_current_contact_id TEXT;
BEGIN
  IF p_contact_id IS NULL THEN
    SELECT id INTO v_contact_id FROM contacts WHERE phone = p_phone LIMIT 1;
  ELSE
    v_contact_id := p_contact_id;
  END IF;

  v_message_preview := CASE
    WHEN LENGTH(p_content) > 100 THEN SUBSTRING(p_content, 1, 100) || '...'
    ELSE p_content
  END;

  SELECT
    id, status, mode, ai_agent_id, human_mode_expires_at, automation_paused_until, contact_id
  INTO
    v_conversation_id, v_conversation_status, v_conversation_mode,
    v_ai_agent_id, v_human_mode_expires_at, v_automation_paused_until, v_current_contact_id
  FROM inbox_conversations
  WHERE phone = p_phone
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO inbox_conversations (
      phone, contact_id, mode, status, total_messages, unread_count, last_message_at, last_message_preview
    ) VALUES (
      p_phone, v_contact_id, 'bot', 'open', 1, 1, NOW(), v_message_preview
    )
    RETURNING id, mode, ai_agent_id, human_mode_expires_at, automation_paused_until
    INTO v_conversation_id, v_conversation_mode, v_ai_agent_id,
         v_human_mode_expires_at, v_automation_paused_until;

    v_is_new_conversation := TRUE;
    v_conversation_status := 'open';
  ELSE
    UPDATE inbox_conversations
    SET
      total_messages = total_messages + 1,
      unread_count = unread_count + 1,
      last_message_at = NOW(),
      last_message_preview = v_message_preview,
      status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
      contact_id = COALESCE(contact_id, v_contact_id),
      updated_at = NOW()
    WHERE id = v_conversation_id
    RETURNING status INTO v_conversation_status;
  END IF;

  INSERT INTO inbox_messages (
    conversation_id, direction, content, message_type,
    whatsapp_message_id, media_url, delivery_status, payload,
    source_type, button_payload
  ) VALUES (
    v_conversation_id, 'inbound', p_content, p_message_type,
    p_whatsapp_message_id, p_media_url, 'delivered', p_payload,
    COALESCE(p_source_type, 'text'), p_button_payload
  )
  RETURNING id INTO v_message_id;

  RETURN json_build_object(
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'is_new_conversation', v_is_new_conversation,
    'conversation_status', v_conversation_status,
    'conversation_mode', v_conversation_mode,
    'ai_agent_id', v_ai_agent_id,
    'human_mode_expires_at', v_human_mode_expires_at,
    'automation_paused_until', v_automation_paused_until
  );
END;
$$;

COMMENT ON FUNCTION public.process_inbound_message IS
'Processa mensagem inbound atômica. v2 (2026-04-30): aceita source_type e button_payload.';

REVOKE ALL ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text, text, text) TO service_role;
