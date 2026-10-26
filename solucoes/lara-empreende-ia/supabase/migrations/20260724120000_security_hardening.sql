-- Hardening pré-publicação (achados de security scan, 24/jul/2026).
-- Contexto: o app tem cadastro aberto (Auth.tsx) — "qualquer usuário logado"
-- inclui qualquer pessoa que criar conta. O que é ferramenta de equipe
-- (contatos, conversas, mensagens, deals, agenda) continua legível pelo time;
-- o que é segredo ou infraestrutura interna fecha aqui.

-- 1. lara_settings guarda chaves de API (Zernio, WhatsApp Cloud, OpenAI…):
--    só admin lê e escreve. Usuário comum usa a view lara_settings_public
--    (security definer, só flags has_* — nenhum segredo).
DROP POLICY IF EXISTS "Authenticated users can access all lara_settings" ON public.lara_settings;
DROP POLICY IF EXISTS "Admins can manage lara_settings" ON public.lara_settings;
CREATE POLICY "Admins can manage lara_settings"
    ON public.lara_settings FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Filas internas do motor: nenhum papel de cliente precisa tocar nelas.
--    O motor usa service role, que bypassa RLS — sem policy substituta.
DROP POLICY IF EXISTS "Authenticated access message_grouping_queue" ON public.message_grouping_queue;
DROP POLICY IF EXISTS "Authenticated access message_processing_queue" ON public.message_processing_queue;
DROP POLICY IF EXISTS "Authenticated access lara_processing_queue" ON public.lara_processing_queue;
DROP POLICY IF EXISTS "Authenticated access send_queue" ON public.send_queue;

-- 3. unanswered_questions: o time lê (aba Treinamento), só admin resolve/ignora;
--    quem insere é o motor (service role).
DROP POLICY IF EXISTS "Authenticated can manage unanswered questions" ON public.unanswered_questions;
DROP POLICY IF EXISTS "Authenticated can read unanswered questions" ON public.unanswered_questions;
DROP POLICY IF EXISTS "Admins can manage unanswered questions" ON public.unanswered_questions;
CREATE POLICY "Authenticated can read unanswered questions"
    ON public.unanswered_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage unanswered questions"
    ON public.unanswered_questions FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Funções SECURITY DEFINER internas (triggers + batch do motor) estavam
--    executáveis até por anon via PostgREST — as claim_* bypassam RLS e
--    permitiriam ler/drenar as filas sem conta. Ninguém de fora executa.
DO $$
DECLARE fn record;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig,
               p.prorettype = 'trigger'::regtype AS is_trigger
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'auto_create_deal_on_contact', 'create_deal_for_new_contact',
            'handle_new_user', 'update_conversation_last_message',
            'update_client_memory', 'update_conversation_state',
            'get_or_create_conversation_state',
            'claim_message_processing_batch', 'claim_lara_processing_batch',
            'claim_send_queue_batch')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
        IF NOT fn.is_trigger THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
        END IF;
    END LOOP;
END $$;

-- 5. Helpers usados nas policies (has_role, get_auth_user_id) precisam do
--    EXECUTE para authenticated, mas não para anon/PUBLIC.
DO $$
DECLARE fn record;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('has_role', 'get_auth_user_id')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn.sig);
    END LOOP;
END $$;
