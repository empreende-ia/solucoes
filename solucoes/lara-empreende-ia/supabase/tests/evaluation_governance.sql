-- Executar após 20260801160000_evaluation_governance.sql. Toda a validação
-- ocorre em transação e não deixa usuários ou avaliações residuais.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
(
    '00000000-0000-0000-0000-000000000000',
    '13000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'eval-editor@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000',
    '13000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'eval-observer@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

INSERT INTO public.workspaces (id, name, slug) VALUES
    ('23000000-0000-0000-0000-000000000001', 'Avaliação permitida', 'eval-test-allowed'),
    ('23000000-0000-0000-0000-000000000002', 'Avaliação isolada', 'eval-test-isolated');

INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES
    ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'editor'),
    ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'observer');

INSERT INTO public.agents (id, workspace_id, name) VALUES
    ('33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'Agente A'),
    ('33000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 'Agente B');
INSERT INTO public.agent_drafts (id, workspace_id, agent_id, config) VALUES
    ('43000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '{"schemaVersion":1}'),
    ('43000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002', '{"schemaVersion":1}');

INSERT INTO public.golden_cases (id, workspace_id, title, query, expected_behavior, category) VALUES
    ('53000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'Situação A', 'Mensagem A', 'recusar', 'seguranca'),
    ('53000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 'Situação B', 'Mensagem B', 'recusar', 'seguranca');
INSERT INTO public.eval_runs (id, workspace_id, agent_id, draft_id, draft_revision, status, total_cases) VALUES
    ('63000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', 1, 'completed', 1),
    ('63000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000002', 1, 'completed', 1);
INSERT INTO public.eval_results (
    id, run_id, workspace_id, case_id, query, expected_behavior, category,
    verdict, severity, result_status
) VALUES
    ('73000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'Mensagem A', 'recusar', 'seguranca', 'aprovado', 'warning', 'passed'),
    ('73000000-0000-0000-0000-000000000002', '63000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000002', 'Mensagem B', 'recusar', 'seguranca', 'aprovado', 'warning', 'passed');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"13000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

DO $$
DECLARE scenarios INTEGER; runs INTEGER; results INTEGER;
BEGIN
    SELECT count(*) INTO scenarios FROM public.golden_cases WHERE id IN ('53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002');
    SELECT count(*) INTO runs FROM public.eval_runs WHERE id IN ('63000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002');
    SELECT count(*) INTO results FROM public.eval_results WHERE id IN ('73000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002');
    IF scenarios <> 1 OR runs <> 1 OR results <> 1 THEN
        RAISE EXCEPTION 'RLS de avaliações vazou dados: situações %, rodadas %, resultados %', scenarios, runs, results;
    END IF;
END;
$$;

INSERT INTO public.golden_cases (workspace_id, title, query, expected_behavior)
VALUES ('23000000-0000-0000-0000-000000000001', 'Criada pelo editor', 'Mensagem', 'responder');

DO $$
BEGIN
    BEGIN
        INSERT INTO public.golden_cases (workspace_id, title, query, expected_behavior)
        VALUES ('23000000-0000-0000-0000-000000000002', 'Invasão', 'Mensagem', 'responder');
        RAISE EXCEPTION 'Editor não deveria escrever no outro workspace';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO public.eval_runs (workspace_id, agent_id)
        VALUES ('23000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'Cliente não deveria criar eval_runs';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO public.eval_results (run_id, workspace_id, query, expected_behavior, category, verdict)
        VALUES ('63000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'Mensagem', 'recusar', 'seguranca', 'aprovado');
        RAISE EXCEPTION 'Cliente não deveria criar eval_results';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"13000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
    BEGIN
        UPDATE public.golden_cases SET title = 'Alterado' WHERE id = '53000000-0000-0000-0000-000000000001';
        IF FOUND THEN RAISE EXCEPTION 'Observador não deveria alterar situações'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

ROLLBACK;
