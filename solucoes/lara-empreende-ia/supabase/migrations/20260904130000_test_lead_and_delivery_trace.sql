-- Lead de teste e rastro de entrega.
--
-- Quando uma mensagem não é respondida, hoje ninguém consegue descobrir por quê:
-- o hardening de 24/jul revogou as policies de lara_processing_queue e
-- send_queue sem colocar nada no lugar, então nenhum usuário autenticado lê
-- essas tabelas — e nenhuma tela tenta. O operador vê silêncio.
--
-- Em vez de reabrir as filas (elas contêm dados de toda a operação), expõe-se
-- uma leitura estreita: o rastro de UMA conversa, para quem é membro ativo do
-- workspace dela.

-- ============================================================
-- 1. Rastro de entrega de uma conversa
-- ============================================================
CREATE OR REPLACE FUNCTION public.conversation_delivery_trace(_conversation_id UUID)
RETURNS TABLE (
    etapa        TEXT,
    situacao     TEXT,
    detalhe      TEXT,
    tentativas   INTEGER,
    em           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    SELECT c.workspace_id INTO v_workspace_id
      FROM public.conversations c
     WHERE c.id = _conversation_id;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Conversa não encontrada ou sem workspace';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members wm
         WHERE wm.workspace_id = v_workspace_id
           AND wm.user_id = auth.uid()
           AND wm.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta conversa';
    END IF;

    RETURN QUERY
    -- 1. a mensagem do lead chegou
    SELECT
        'recebida'::TEXT,
        CASE WHEN count(*) > 0 THEN 'ok' ELSE 'pendente' END::TEXT,
        CASE WHEN count(*) > 0 THEN 'Mensagem do lead registrada' ELSE 'Nenhuma mensagem recebida' END::TEXT,
        0,
        max(m.created_at)
      FROM public.messages m
     WHERE m.conversation_id = _conversation_id AND m.from_type = 'user'

    UNION ALL
    -- 2. entrou na fila do orquestrador
    SELECT
        'na fila'::TEXT,
        COALESCE(
            (SELECT CASE q.status
                        WHEN 'completed' THEN 'ok'
                        WHEN 'failed' THEN 'erro'
                        ELSE 'processando'
                    END
               FROM public.lara_processing_queue q
              WHERE q.conversation_id = _conversation_id
              ORDER BY q.created_at DESC LIMIT 1),
            'pendente'
        )::TEXT,
        COALESCE(
            (SELECT COALESCE(q.error_message, 'Item processado')
               FROM public.lara_processing_queue q
              WHERE q.conversation_id = _conversation_id
              ORDER BY q.created_at DESC LIMIT 1),
            'A mensagem ainda não entrou na fila'
        )::TEXT,
        COALESCE((SELECT q.retry_count FROM public.lara_processing_queue q
                   WHERE q.conversation_id = _conversation_id
                   ORDER BY q.created_at DESC LIMIT 1), 0),
        (SELECT COALESCE(q.processed_at, q.created_at) FROM public.lara_processing_queue q
          WHERE q.conversation_id = _conversation_id ORDER BY q.created_at DESC LIMIT 1)

    UNION ALL
    -- 3. a Lara redigiu resposta
    SELECT
        'respondida'::TEXT,
        CASE WHEN count(*) > 0 THEN 'ok' ELSE 'pendente' END::TEXT,
        CASE WHEN count(*) > 0
             THEN left(max(m.content), 120)
             ELSE 'A agente ainda não produziu resposta' END::TEXT,
        0,
        max(m.created_at)
      FROM public.messages m
     WHERE m.conversation_id = _conversation_id AND m.from_type = 'lara'

    UNION ALL
    -- 4. saiu para o canal
    SELECT
        'enviada'::TEXT,
        COALESCE(
            (SELECT CASE s.status
                        WHEN 'completed' THEN 'ok'
                        WHEN 'failed' THEN 'erro'
                        ELSE 'processando'
                    END
               FROM public.send_queue s
              WHERE s.conversation_id = _conversation_id
              ORDER BY s.created_at DESC LIMIT 1),
            'pendente'
        )::TEXT,
        COALESCE(
            (SELECT COALESCE(s.error_message, 'Entregue ao canal')
               FROM public.send_queue s
              WHERE s.conversation_id = _conversation_id
              ORDER BY s.created_at DESC LIMIT 1),
            'Nada enfileirado para envio'
        )::TEXT,
        COALESCE((SELECT s.retry_count FROM public.send_queue s
                   WHERE s.conversation_id = _conversation_id
                   ORDER BY s.created_at DESC LIMIT 1), 0),
        (SELECT COALESCE(s.sent_at, s.created_at) FROM public.send_queue s
          WHERE s.conversation_id = _conversation_id ORDER BY s.created_at DESC LIMIT 1);
END;
$$;

REVOKE ALL ON FUNCTION public.conversation_delivery_trace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_delivery_trace(UUID) TO authenticated, service_role;

-- ============================================================
-- 2. Remover um lead de teste sem deixar rastro no CRM
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_test_conversation(_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contact_id UUID;
    v_is_test    BOOLEAN;
BEGIN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Apenas administradores removem conversas de teste';
    END IF;

    SELECT c.contact_id, COALESCE((c.metadata->>'test')::BOOLEAN, false)
      INTO v_contact_id, v_is_test
      FROM public.conversations c
     WHERE c.id = _conversation_id;

    IF v_contact_id IS NULL THEN
        RETURN false;
    END IF;
    -- Trava deliberada: a função só apaga o que ela mesma marcou como teste.
    IF NOT v_is_test THEN
        RAISE EXCEPTION 'Esta conversa não é um teste e não pode ser removida por aqui';
    END IF;

    DELETE FROM public.lara_processing_queue WHERE conversation_id = _conversation_id;
    DELETE FROM public.send_queue WHERE conversation_id = _conversation_id;
    DELETE FROM public.messages WHERE conversation_id = _conversation_id;
    DELETE FROM public.conversation_states WHERE conversation_id = _conversation_id;
    DELETE FROM public.conversations WHERE id = _conversation_id;
    DELETE FROM public.deals WHERE contact_id = v_contact_id;
    DELETE FROM public.appointments WHERE contact_id = v_contact_id;
    DELETE FROM public.contacts WHERE id = v_contact_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_test_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_test_conversation(UUID) TO authenticated, service_role;

-- ============================================================
-- 3. Conversa de teste é reconhecível
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_conversations_test
    ON public.conversations ((metadata->>'test'))
    WHERE metadata->>'test' = 'true';
