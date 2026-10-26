-- Envio manual pelo Chat estava quebrado desde o hardening de 24/jul.
--
-- Aquela migration revogou as policies de send_queue (com razão: a fila carrega
-- a operação inteira) mas não deixou substituta. Resultado: o front insere a
-- mensagem em messages, tenta enfileirar em send_queue e leva RLS na cara —
-- o operador escreve, vê a mensagem aparecer e ela nunca sai. Sem erro visível.
--
-- Em vez de reabrir a fila para authenticated, abre-se uma porta estreita:
-- uma RPC que valida a membership no workspace da conversa e enfileira.

CREATE OR REPLACE FUNCTION public.enqueue_outbound_message(
    _conversation_id UUID,
    _content         TEXT DEFAULT NULL,
    _message_id      UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_contact_id   UUID;
    v_message_id   UUID;
    v_content      TEXT;
BEGIN
    SELECT c.workspace_id, c.contact_id
      INTO v_workspace_id, v_contact_id
      FROM public.conversations c
     WHERE c.id = _conversation_id;

    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'Conversa não encontrada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members wm
         WHERE wm.workspace_id = v_workspace_id
           AND wm.user_id = auth.uid()
           AND wm.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta conversa';
    END IF;

    IF _message_id IS NOT NULL THEN
        -- Reenvio: a mensagem já existe e precisa pertencer a esta conversa.
        SELECT m.id, m.content INTO v_message_id, v_content
          FROM public.messages m
         WHERE m.id = _message_id AND m.conversation_id = _conversation_id;

        IF v_message_id IS NULL THEN
            RAISE EXCEPTION 'Mensagem não pertence a esta conversa';
        END IF;

        UPDATE public.messages
           SET status = 'processing', sent_at = now()
         WHERE id = v_message_id;
    ELSE
        IF _content IS NULL OR length(trim(_content)) = 0 THEN
            RAISE EXCEPTION 'Mensagem vazia';
        END IF;
        v_content := _content;

        INSERT INTO public.messages (
            conversation_id, content, type, from_type, status, sent_at
        )
        VALUES (
            _conversation_id, v_content, 'text', 'human', 'processing', now()
        )
        RETURNING id INTO v_message_id;
    END IF;

    INSERT INTO public.send_queue (
        conversation_id, contact_id, message_id, content, message_type, from_type, status
    )
    VALUES (
        _conversation_id, v_contact_id, v_message_id, v_content, 'text', 'human', 'pending'
    );

    UPDATE public.conversations
       SET last_message_at = now()
     WHERE id = _conversation_id;

    RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_outbound_message(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_message(UUID, TEXT, UUID) TO authenticated, service_role;

-- Deal também passa a carregar o workspace, pelo mesmo motivo da conversa:
-- o dia em que houver mais de um workspace, filtrar por ele será possível.
-- A policy segue authenticated-all de propósito — o template é single-tenant e
-- o isolamento real é por banco, não por linha.
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.assign_deal_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        SELECT id INTO NEW.workspace_id FROM public.workspaces WHERE slug = 'default' LIMIT 1;
        IF NEW.workspace_id IS NULL THEN
            SELECT id INTO NEW.workspace_id
              FROM public.workspaces WHERE status = 'active' ORDER BY created_at LIMIT 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_deal_workspace ON public.deals;
CREATE TRIGGER set_deal_workspace
    BEFORE INSERT ON public.deals
    FOR EACH ROW EXECUTE FUNCTION public.assign_deal_workspace();

UPDATE public.deals
   SET workspace_id = COALESCE(
        (SELECT id FROM public.workspaces WHERE slug = 'default' LIMIT 1),
        (SELECT id FROM public.workspaces WHERE status = 'active' ORDER BY created_at LIMIT 1))
 WHERE workspace_id IS NULL;
