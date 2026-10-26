-- Executar após 20260801140000_workspace_knowledge_governance.sql em um
-- banco Supabase descartável. A transação não deixa resíduos.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
(
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'knowledge-editor@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'knowledge-observer@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

INSERT INTO public.workspaces (id, name, slug)
VALUES
    ('21000000-0000-0000-0000-000000000001', 'Conhecimento permitido', 'knowledge-test-allowed'),
    ('21000000-0000-0000-0000-000000000002', 'Conhecimento isolado', 'knowledge-test-isolated');

INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES
    (
        '21000000-0000-0000-0000-000000000001',
        '11000000-0000-0000-0000-000000000001',
        'editor'
    ),
    (
        '21000000-0000-0000-0000-000000000001',
        '11000000-0000-0000-0000-000000000002',
        'observer'
    );

INSERT INTO public.knowledge_facts (
    id, workspace_id, title, category, question, fact, source,
    is_active, always_include, status, valid_from, expires_at
) VALUES
(
    '31000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'Política Orquídea A', 'politica', 'Qual é a política orquídea?',
    'A política orquídea permitida pertence ao workspace A.', 'teste',
    true, false, 'confirmed', now(), NULL
),
(
    '31000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'Política Orquídea B', 'politica', 'Qual é a política orquídea?',
    'A política orquídea secreta pertence ao workspace B.', 'teste',
    true, false, 'confirmed', now(), NULL
),
(
    '31000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000001',
    'Informação expirada', 'politica', 'Qual informação venceu?',
    'O código meteorito expirou e não pode ser usado.', 'teste',
    true, false, 'confirmed', now() - interval '1 day', now() - interval '1 minute'
);

INSERT INTO public.knowledge_documents (
    id, workspace_id, title, content, doc_type, status, chunk_count
) VALUES
(
    '41000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'Manual permitido', 'Conteúdo do workspace A.', 'texto', 'approved', 1
),
(
    '41000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'Manual isolado', 'Conteúdo do workspace B.', 'texto', 'approved', 1
);

INSERT INTO public.knowledge_chunks (
    id, document_id, workspace_id, chunk_index, content
) VALUES
(
    '51000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001', 0,
    'O manual permitido contém a palavra safira.'
),
(
    '51000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002', 0,
    'O manual isolado também contém a palavra safira.'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',
    true
);

DO $$
DECLARE
    visible_facts INTEGER;
    visible_documents INTEGER;
    visible_chunks INTEGER;
BEGIN
    SELECT count(*) INTO visible_facts
      FROM public.knowledge_facts
     WHERE id IN (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002'
     );
    SELECT count(*) INTO visible_documents
      FROM public.knowledge_documents
     WHERE id IN (
        '41000000-0000-0000-0000-000000000001',
        '41000000-0000-0000-0000-000000000002'
     );
    SELECT count(*) INTO visible_chunks
      FROM public.knowledge_chunks
     WHERE id IN (
        '51000000-0000-0000-0000-000000000001',
        '51000000-0000-0000-0000-000000000002'
     );

    IF visible_facts <> 1 OR visible_documents <> 1 OR visible_chunks <> 1 THEN
        RAISE EXCEPTION
            'RLS vazou dados: fatos %, documentos %, chunks %',
            visible_facts, visible_documents, visible_chunks;
    END IF;
END;
$$;

-- Editor pode registrar conhecimento apenas no próprio workspace.
INSERT INTO public.knowledge_facts (workspace_id, title, category, fact, source)
VALUES (
    '21000000-0000-0000-0000-000000000001',
    '', 'geral', 'Fato criado pelo editor.', 'teste de permissão'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO public.knowledge_facts (workspace_id, title, category, fact)
        VALUES (
            '21000000-0000-0000-0000-000000000002',
            'Tentativa indevida', 'geral', 'Não deve ser inserido.'
        );
        RAISE EXCEPTION 'Editor não deveria escrever em outro workspace';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

-- O cliente não pode escolher um workspace arbitrário para pesquisar.
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.search_workspace_knowledge(
            '21000000-0000-0000-0000-000000000002', 'orquídea', 10
        );
        RAISE EXCEPTION 'Busca privada por workspace deveria ser negada';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

DO $$
DECLARE
    result_count INTEGER;
    foreign_count INTEGER;
    expired_count INTEGER;
BEGIN
    SELECT count(*),
           count(*) FILTER (WHERE content LIKE '%workspace B%')
      INTO result_count, foreign_count
      FROM public.search_knowledge('orquídea', 10);

    SELECT count(*) INTO expired_count
      FROM public.search_knowledge('meteorito', 10);

    IF result_count < 1 OR foreign_count <> 0 OR expired_count <> 0 THEN
        RAISE EXCEPTION
            'Busca não falhou fechada: resultados %, estrangeiros %, expirados %',
            result_count, foreign_count, expired_count;
    END IF;
END;
$$;

-- Observador lê, mas não altera a base.
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}',
    true
);

DO $$
BEGIN
    BEGIN
        INSERT INTO public.knowledge_facts (workspace_id, title, category, fact)
        VALUES (
            '21000000-0000-0000-0000-000000000001',
            'Tentativa de observador', 'geral', 'Não deve ser inserido.'
        );
        RAISE EXCEPTION 'Observador não deveria escrever conhecimento';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

ROLLBACK;
