-- Executar após 20260801190000_knowledge_ingestion_idempotency.sql. Valida
-- isolamento, imutabilidade dos eventos e deduplicação de fontes. Tudo volta
-- atrás no fim da transação.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'runtime-reader@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

INSERT INTO public.workspaces (id, name, slug) VALUES
('25000000-0000-0000-0000-000000000001', 'Runtime A', 'runtime-test-a'),
('25000000-0000-0000-0000-000000000002', 'Runtime B', 'runtime-test-b');
INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES
('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'observer');
INSERT INTO public.agents (id, workspace_id, name) VALUES
('35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'Agente A'),
('35000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', 'Agente B');
INSERT INTO public.agent_versions (
    id, workspace_id, agent_id, version_number, config, compiled_prompt,
    checksum, compiler_version
) VALUES
('45000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 1, '{"schemaVersion":1}', 'prompt A', 'checksum-a', 'agent-config-v1'),
('45000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000002', 1, '{"schemaVersion":1}', 'prompt B', 'checksum-b', 'agent-config-v1');
INSERT INTO public.agent_runtime_events (
    id, workspace_id, agent_id, agent_version_id, event_kind, compiler_version
) VALUES
('55000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 'response', 'agent-config-v1'),
('55000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000002', 'error', 'agent-config-v1');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

DO $$
DECLARE visible INTEGER;
BEGIN
    SELECT count(*) INTO visible FROM public.agent_runtime_events
     WHERE id IN ('55000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002');
    IF visible <> 1 THEN RAISE EXCEPTION 'RLS de observabilidade vazou dados: %', visible; END IF;

    BEGIN
        UPDATE public.agent_runtime_events SET route = 'forjado'
         WHERE id = '55000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Evento de runtime deveria ser imutável';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;

INSERT INTO public.knowledge_documents (
    workspace_id, title, content, doc_type, fingerprint
) VALUES (
    '25000000-0000-0000-0000-000000000001', 'Fonte A', 'Mesmo conteúdo', 'texto', 'same-source'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO public.knowledge_documents (
            workspace_id, title, content, doc_type, fingerprint
        ) VALUES (
            '25000000-0000-0000-0000-000000000001', 'Fonte A repetida', 'Mesmo conteúdo', 'texto', 'same-source'
        );
        RAISE EXCEPTION 'Fonte repetida deveria ser rejeitada pelo fingerprint';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END;
$$;

ROLLBACK;
