-- Convite de acesso da equipe.
--
-- O cadastro público do Supabase foi desabilitado em 04/09/2026, depois de um
-- terceiro se cadastrar sozinho no app no ar. Com a porta fechada, o time
-- precisa de um caminho legítimo de entrada. A allowlist já existe
-- (public.signup_allowlist, criada em 20260904120000) e já é lida por
-- handle_new_user e por ensure_workspace_membership; o que falta é o convite
-- que a alimenta e a listagem que o admin enxerga na tela Equipe.
--
-- Esta migration NÃO recria signup_allowlist. Ela acrescenta apenas:
--   1. o rastro do convite (quem é, quem convidou, quando saiu);
--   2. um índice para a listagem de pendentes;
--   3. uma view estreita, para a tela ler sem receber a tabela inteira;
--   4. a revogação, com guarda de último administrador.
--
-- O envio do convite em si mora na edge function team-invite, porque criar
-- conta exige a Admin API do Supabase e isso não se faz de dentro do banco.

-- ============================================================
-- 1. Rastro do convite
-- ============================================================
-- invited_by_name é texto denormalizado de propósito: profiles só é legível
-- pelo próprio dono ("Users can view own profile"), então um join na view
-- devolveria NULL justamente para quem precisa ler — o admin que convidou
-- outra pessoa.
ALTER TABLE public.signup_allowlist
    ADD COLUMN IF NOT EXISTS invited_name    TEXT,
    ADD COLUMN IF NOT EXISTS invited_by_name TEXT,
    ADD COLUMN IF NOT EXISTS invite_sent_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.signup_allowlist.invited_name IS
    'Nome de quem foi convidado, para a lista de pendentes não mostrar só o e-mail.';
COMMENT ON COLUMN public.signup_allowlist.invited_by_name IS
    'Nome do admin que convidou, gravado em texto porque profiles não é legível por terceiros.';
COMMENT ON COLUMN public.signup_allowlist.invite_sent_at IS
    'Última vez que a edge function team-invite disparou o convite para este e-mail.';

-- ============================================================
-- 2. Índice da listagem de pendentes
-- ============================================================
CREATE INDEX IF NOT EXISTS signup_allowlist_pending_idx
    ON public.signup_allowlist (created_at DESC)
    WHERE claimed_at IS NULL;

-- ============================================================
-- 3. View estreita para a tela
-- ============================================================
-- security_invoker: a policy "Admins gerenciam a allowlist" continua sendo a
-- única autorização, então quem não é admin lê zero linhas. A view existe para
-- limitar o QUE se lê — note e invited_by (uuid cru de auth.users) ficam de
-- fora — e para nomear a situação em uma palavra só.
DROP VIEW IF EXISTS public.signup_invites;
CREATE VIEW public.signup_invites
WITH (security_invoker = true) AS
SELECT
    a.email,
    a.invited_name,
    a.workspace_role,
    a.can_publish_agent,
    a.app_role,
    a.invited_by_name,
    a.created_at,
    a.invite_sent_at,
    a.claimed_at,
    CASE WHEN a.claimed_at IS NULL THEN 'pendente' ELSE 'aceito' END AS situacao
FROM public.signup_allowlist a;

COMMENT ON VIEW public.signup_invites IS
    'Convites de acesso visíveis ao admin: sem a nota interna e sem o uuid de quem convidou.';

REVOKE ALL ON public.signup_invites FROM PUBLIC, anon;
GRANT SELECT ON public.signup_invites TO authenticated, service_role;

-- ============================================================
-- 4. Revogar convite
-- ============================================================
-- Revogar precisa valer também para convite já aceito, senão a tela repete a
-- mentira antiga: botão que diz que tirou o acesso sem tirar nada. Por isso a
-- função apaga a linha da allowlist E desativa a membership, quando existe.
--
-- _actor_id é parâmetro porque quem chama é a edge function com service_role,
-- e nesse contexto auth.uid() é nulo. A função revalida o papel do ator: ela é
-- SECURITY DEFINER, então não pode confiar em quem a invoca.
CREATE OR REPLACE FUNCTION public.revoke_signup_invite(_email TEXT, _actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email       TEXT := lower(trim(_email));
    v_actor_email TEXT;
    v_target_id   UUID;
    v_removed     BOOLEAN := false;
    v_disabled    INTEGER := 0;
    v_demoted     BOOLEAN := false;
BEGIN
    IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN
        RAISE EXCEPTION 'Apenas administradores revogam convites';
    END IF;

    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Informe o e-mail do convite';
    END IF;

    SELECT lower(trim(u.email)) INTO v_actor_email FROM auth.users u WHERE u.id = _actor_id;
    IF v_actor_email = v_email THEN
        RAISE EXCEPTION 'Não é possível revogar o próprio acesso';
    END IF;

    SELECT u.id INTO v_target_id FROM auth.users u WHERE lower(trim(u.email)) = v_email;

    -- Guarda do último administrador: revogar não pode deixar o workspace sem
    -- ninguém capaz de configurar e publicar a agente.
    IF v_target_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.workspace_members wm
         WHERE wm.user_id = v_target_id
           AND wm.status = 'active'
           AND wm.role = 'admin'
    ) AND (
        SELECT count(*) FROM public.workspace_members wm
         WHERE wm.status = 'active' AND wm.role = 'admin'
    ) <= 1 THEN
        RAISE EXCEPTION 'Este é o único administrador ativo do workspace';
    END IF;

    DELETE FROM public.signup_allowlist WHERE email = v_email;
    v_removed := FOUND;

    IF v_target_id IS NOT NULL THEN
        UPDATE public.workspace_members
           SET status = 'disabled', updated_at = now()
         WHERE user_id = v_target_id AND status <> 'disabled';
        GET DIAGNOSTICS v_disabled = ROW_COUNT;

        -- Desativar a membership não basta: quase trinta policies do app
        -- autorizam por has_role(uid,'admin'), e é esse papel que libera a
        -- própria tela de convites. Sem rebaixar o papel de app, revogar
        -- devolveria o acesso inteiro na primeira vez que a pessoa entrasse —
        -- inclusive o poder de se reconvidar. A conta continua existindo; o
        -- que sai é o privilégio.
        DELETE FROM public.user_roles WHERE user_id = v_target_id AND role = 'admin';
        v_demoted := FOUND;
        IF v_demoted THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_target_id, 'user')
            ON CONFLICT (user_id, role) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'email', v_email,
        'convite_removido', v_removed,
        'acessos_desativados', v_disabled,
        'papel_rebaixado', v_demoted
    );
END;
$$;

COMMENT ON FUNCTION public.revoke_signup_invite(TEXT, UUID) IS
    'Apaga o convite, desativa a membership e rebaixa o papel de app do e-mail. Recusa o próprio ator e o último admin ativo.';

REVOKE ALL ON FUNCTION public.revoke_signup_invite(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_signup_invite(TEXT, UUID) TO service_role;
