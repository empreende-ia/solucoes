-- Executar após 20260801210000_knowledge_atomic_writes.sql.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000001',
 'authenticated', 'authenticated', 'atomic-editor@example.test', '', now(),
 '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000002',
 'authenticated', 'authenticated', 'atomic-observer@example.test', '', now(),
 '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

INSERT INTO public.workspaces (id, name, slug)
VALUES ('26000000-0000-0000-0000-000000000001', 'Atomic knowledge', 'atomic-knowledge-test');
INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES
('26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'editor'),
('26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002', 'observer');
INSERT INTO public.agents (id, workspace_id, name)
VALUES ('36000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'Lara atômica');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"16000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

DO $$
DECLARE
    first_write public.knowledge_documents;
    duplicate_write public.knowledge_documents;
    updated_write public.knowledge_documents;
    indexed INTEGER;
BEGIN
    SELECT * INTO first_write FROM public.write_knowledge_document(
        NULL, 'Manual', 'Conteúdo original', 'texto', NULL, 'atomic-fingerprint-a',
        'needs_review', false, '{"warnings":[]}', NULL, ARRAY['trecho um']
    );
    SELECT * INTO duplicate_write FROM public.write_knowledge_document(
        NULL, 'Manual duplicado', 'Conteúdo original', 'texto', NULL, 'atomic-fingerprint-a',
        'needs_review', false, '{}', NULL, ARRAY['não deve duplicar']
    );
    IF first_write.id IS NULL OR duplicate_write.id <> first_write.id THEN
        RAISE EXCEPTION 'A escrita idempotente duplicou o material';
    END IF;

    SELECT * INTO updated_write FROM public.write_knowledge_document(
        first_write.id, 'Manual revisado', 'Conteúdo aprovado', 'texto', NULL,
        'atomic-fingerprint-b', 'approved', true, '{"found_information":["preço"]}',
        NULL, ARRAY['trecho novo um', 'trecho novo dois']
    );
    SELECT count(*) INTO indexed FROM public.knowledge_chunks WHERE document_id = first_write.id;
    IF updated_write.status <> 'approved' OR NOT updated_write.is_active OR indexed <> 2 THEN
        RAISE EXCEPTION 'Documento e índice não foram substituídos atomicamente';
    END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"16000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
    BEGIN
        PERFORM public.write_knowledge_document(
            NULL, 'Forjado', 'Sem permissão', 'texto', NULL, 'atomic-forged',
            'approved', true, '{}', NULL, ARRAY['forjado']
        );
        RAISE EXCEPTION 'Observador não deveria criar material';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

ROLLBACK;
