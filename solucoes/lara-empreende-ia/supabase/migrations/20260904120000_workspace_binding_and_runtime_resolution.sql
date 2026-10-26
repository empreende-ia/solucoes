-- Vínculo de workspace no cadastro e no runtime.
--
-- Dois defeitos de origem, ambos observados no primeiro deploy real:
--
-- 1. workspace_members nascia VAZIA. O seed de 20260801100000 popula a tabela
--    com `FROM auth.users`, mas migrations rodam antes de existir qualquer
--    usuário — num projeto novo o SELECT varre uma tabela vazia e não insere
--    nada. Sem membership, get_current_agent_context devolve vazio e a tela
--    Configurações → Agente fica morta: não dá para configurar nem publicar.
--
-- 2. Nenhuma mensagem real seria respondida. Os webhooks criam a conversa com
--    user_id NULL (o lead não é usuário do sistema) e o orquestrador resolvia a
--    versão publicada a partir desse campo — o resolvedor começa com
--    `if (!userId) return null`. Toda mensagem terminava em failed, e sem
--    contexto de workspace nem o evento de erro era registrado.
--
-- A correção troca o eixo de resolução: a conversa passa a carregar o
-- workspace, preenchido por trigger em qualquer caminho de inserção (webhook
-- da Meta, webhook da Zernio, simulador ou insert manual).
--
-- 3. De quebra, fecha a porta de entrada: o papel de admin deixa de ser "quem
--    chegar primeiro" e passa a depender de allowlist. O app ficou no ar com
--    cadastro aberto e recebeu um cadastro de terceiro em 04/09/2026.

-- ============================================================
-- 1. Allowlist de cadastro (também é a base do convite de equipe)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.signup_allowlist (
    email             TEXT PRIMARY KEY,
    workspace_role    public.workspace_member_role NOT NULL DEFAULT 'editor',
    can_publish_agent BOOLEAN NOT NULL DEFAULT false,
    app_role          public.app_role NOT NULL DEFAULT 'user',
    invited_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    note              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at        TIMESTAMPTZ
);

COMMENT ON TABLE public.signup_allowlist IS
    'Quem pode entrar e com que papel. O e-mail é sempre gravado em minúsculas.';

ALTER TABLE public.signup_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam a allowlist" ON public.signup_allowlist;
CREATE POLICY "Admins gerenciam a allowlist"
    ON public.signup_allowlist FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON TABLE public.signup_allowlist FROM anon;

-- Semeia com quem já é admin do app (num projeto novo, ninguém — a allowlist
-- só entra em jogo a partir do segundo cadastro).
INSERT INTO public.signup_allowlist (email, workspace_role, can_publish_agent, app_role, note)
SELECT lower(trim(u.email)), 'admin', true, 'admin', 'Semeado pela migration de vínculo de workspace'
  FROM auth.users u
  JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'admin'
 WHERE u.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 2. Vínculo de workspace, idempotente e à prova do impasse de RLS
-- ============================================================
-- SECURITY DEFINER porque a policy de workspace_members exige um admin de
-- workspace para inserir — e no primeiro cadastro esse admin é justamente a
-- linha que estamos tentando criar. Sem definer, o impasse é por construção.
CREATE OR REPLACE FUNCTION public.ensure_workspace_membership(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id  UUID;
    v_email         TEXT;
    v_allow         public.signup_allowlist%ROWTYPE;
    v_is_app_admin  BOOLEAN;
    v_role          public.workspace_member_role;
    v_can_publish   BOOLEAN;
BEGIN
    IF _user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'default' LIMIT 1;
    IF v_workspace_id IS NULL THEN
        SELECT id INTO v_workspace_id
          FROM public.workspaces
         WHERE status = 'active'
         ORDER BY created_at
         LIMIT 1;
    END IF;
    IF v_workspace_id IS NULL THEN
        INSERT INTO public.workspaces (name, slug, created_by)
        VALUES (
            COALESCE(
                (SELECT NULLIF(trim(company_name), '') FROM public.lara_settings ORDER BY updated_at DESC LIMIT 1),
                'Empreende.IA'
            ),
            'default',
            _user_id
        )
        RETURNING id INTO v_workspace_id;
    END IF;

    SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = _user_id;
    SELECT * INTO v_allow FROM public.signup_allowlist WHERE email = v_email;
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
    ) INTO v_is_app_admin;

    IF v_is_app_admin THEN
        v_role := 'admin';
        v_can_publish := true;
    ELSIF v_allow.email IS NOT NULL THEN
        v_role := v_allow.workspace_role;
        v_can_publish := v_allow.can_publish_agent;
    ELSE
        -- Conta autenticada que ninguém convidou: entra sem vínculo, e portanto
        -- sem acesso à configuração da agente.
        RETURN NULL;
    END IF;

    INSERT INTO public.workspace_members (workspace_id, user_id, role, can_publish_agent, status)
    VALUES (v_workspace_id, _user_id, v_role, v_can_publish, 'active')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    UPDATE public.workspaces
       SET created_by = _user_id
     WHERE id = v_workspace_id AND created_by IS NULL;

    UPDATE public.signup_allowlist
       SET claimed_at = now()
     WHERE email = v_email AND claimed_at IS NULL;

    RETURN v_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_workspace_membership(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_workspace_membership(UUID) TO service_role;

-- ============================================================
-- 3. Cadastro: papel por allowlist, não por ordem de chegada
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email      TEXT := lower(trim(NEW.email));
    v_allow_role public.app_role;
    v_is_first   BOOLEAN;
BEGIN
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');

    SELECT app_role INTO v_allow_role FROM public.signup_allowlist WHERE email = v_email;
    v_is_first := (SELECT COUNT(*) FROM public.user_roles) = 0;

    -- Admin apenas no bootstrap de um projeto novo ou por convite explícito.
    IF v_is_first OR v_allow_role = 'admin' THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    ELSE
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
    END IF;

    PERFORM public.ensure_workspace_membership(NEW.id);

    RETURN NEW;
END;
$$;

-- Backfill: quem já é admin do app ganha o vínculo que a migration de agosto
-- não conseguiu criar. Contas fora da allowlist continuam sem vínculo.
DO $backfill$
DECLARE
    v_user_id UUID;
BEGIN
    FOR v_user_id IN
        SELECT u.id FROM auth.users u ORDER BY u.created_at
    LOOP
        PERFORM public.ensure_workspace_membership(v_user_id);
    END LOOP;
END;
$backfill$;

-- ============================================================
-- 4. A conversa passa a carregar o workspace
-- ============================================================
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_last_message
    ON public.conversations (workspace_id, last_message_at DESC);

-- Trigger em vez de correção nos três webhooks: cobre todo caminho de inserção,
-- inclusive os que ainda não existem.
CREATE OR REPLACE FUNCTION public.assign_conversation_workspace()
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
              FROM public.workspaces
             WHERE status = 'active'
             ORDER BY created_at
             LIMIT 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_conversation_workspace ON public.conversations;
CREATE TRIGGER set_conversation_workspace
    BEFORE INSERT ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.assign_conversation_workspace();

UPDATE public.conversations
   SET workspace_id = COALESCE(
        (SELECT id FROM public.workspaces WHERE slug = 'default' LIMIT 1),
        (SELECT id FROM public.workspaces WHERE status = 'active' ORDER BY created_at LIMIT 1)
   )
 WHERE workspace_id IS NULL;
