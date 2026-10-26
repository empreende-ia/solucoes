-- Executar após 20260801170000_assisted_learning.sql. Valida revisão humana,
-- isolamento e bloqueio de criação direta pelo cliente.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'learning-editor@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'learning-observer@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

INSERT INTO public.workspaces (id, name, slug) VALUES
('24000000-0000-0000-0000-000000000001', 'Aprendizado A', 'learning-test-a'),
('24000000-0000-0000-0000-000000000002', 'Aprendizado B', 'learning-test-b');
INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES
('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'editor'),
('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000002', 'observer');
INSERT INTO public.agents (id, workspace_id, name) VALUES
('34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'Agente A'),
('34000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', 'Agente B');
INSERT INTO public.agent_suggestions (
    id, workspace_id, agent_id, suggestion_type, title, rationale,
    proposed_change, evidence, fingerprint
) VALUES
('44000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'new_fact', 'Sugestão A', 'Evidência A', '{"content":"Revisar A"}', '{"quote":"A"}', 'fingerprint-a'),
('44000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 'new_fact', 'Sugestão B', 'Evidência B', '{"content":"Revisar B"}', '{"quote":"B"}', 'fingerprint-b');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"14000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE visible INTEGER; reviewed public.agent_suggestions;
BEGIN
    SELECT count(*) INTO visible FROM public.agent_suggestions WHERE id IN ('44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002');
    IF visible <> 1 THEN RAISE EXCEPTION 'RLS de sugestões vazou dados: %', visible; END IF;
    SELECT * INTO reviewed FROM public.review_agent_suggestion('44000000-0000-0000-0000-000000000001', 'accepted');
    IF reviewed.status <> 'accepted' OR reviewed.reviewed_by <> '14000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'Revisão humana não foi auditada';
    END IF;
    BEGIN
        INSERT INTO public.agent_suggestions (workspace_id, agent_id, suggestion_type, title, rationale, fingerprint)
        VALUES ('24000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'new_fact', 'Forjada', 'Forjada', 'client-forged');
        RAISE EXCEPTION 'Cliente não deveria criar sugestões diretamente';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"14000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
    BEGIN
        PERFORM public.review_agent_suggestion('44000000-0000-0000-0000-000000000001', 'rejected');
        RAISE EXCEPTION 'Observador não deveria revisar sugestão';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

ROLLBACK;
