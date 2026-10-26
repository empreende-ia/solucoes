-- Hardening pós-revisão adversarial (jul/2026)
-- 1. auto_create_deal_on_contact: title nunca NULL (contatos Instagram sem telefone)
-- 2. enqueue_lara_processing: debounce atômico por conversa (advisory lock)
-- 3. Varredura por cron do orchestrator/sender: itens órfãos quando o
--    EdgeRuntime.waitUntil morre antes de disparar

-- ============================================================
-- 1. deals.title é NOT NULL; contatos criados via Instagram DM podem ter
--    name e phone_number nulos — o COALESCE antigo estourava o trigger e
--    derrubava o INSERT do contato inteiro.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_create_deal_on_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_stage_id uuid;
BEGIN
  SELECT id INTO first_stage_id FROM public.pipeline_stages WHERE is_active = true ORDER BY position ASC LIMIT 1;

  IF first_stage_id IS NOT NULL THEN
    INSERT INTO public.deals (title, contact_id, stage_id, user_id)
    VALUES (
      COALESCE(NEW.name, NEW.instagram_username, NEW.phone_number, 'Novo contato'),
      NEW.id,
      first_stage_id,
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Debounce atômico: substitui o item pending da conversa e agenda o novo.
--    O advisory lock serializa webhooks concorrentes da MESMA conversa —
--    delete-then-insert em duas chamadas REST deixava dois itens pending
--    (Lara respondia duas vezes à mesma rajada).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_lara_processing(
  p_message_id uuid,
  p_conversation_id uuid,
  p_contact_id uuid,
  p_delay_seconds integer DEFAULT 10,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  -- Serializa por conversa até o fim da transação
  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 42));

  DELETE FROM public.lara_processing_queue
  WHERE conversation_id = p_conversation_id
    AND status = 'pending';

  INSERT INTO public.lara_processing_queue
    (message_id, conversation_id, contact_id, priority, scheduled_for, context_data)
  VALUES
    (p_message_id, p_conversation_id, p_contact_id, 1,
     now() + make_interval(secs => GREATEST(p_delay_seconds, 0)),
     p_context)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lara_processing(uuid, uuid, uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_lara_processing(uuid, uuid, uuid, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_lara_processing(uuid, uuid, uuid, integer, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lara_processing(uuid, uuid, uuid, integer, jsonb) TO service_role;

-- ============================================================
-- 3. Varredura de segurança: o disparo do orchestrator/sender via
--    EdgeRuntime.waitUntil morre se o isolate for reciclado — o item fica
--    órfão na fila e a Lara nunca responde. Um cron a cada minuto varre as
--    filas (as funções saem imediatamente quando não há nada elegível).
--    O agendamento dos dois sweeps (lara-orchestrator-sweep e
--    send-queue-sweep) acontece na migration 20260710001000, que lê a URL
--    do projeto e a service role key do Vault (RPC ensure_edge_secrets) —
--    nenhuma URL ou chave hardcoded aqui.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
