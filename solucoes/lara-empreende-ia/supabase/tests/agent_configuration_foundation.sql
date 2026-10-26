-- Executar após as migrations em um banco Supabase descartável.
-- O teste usa transação e não deixa usuários ou workspaces residuais.
BEGIN;

INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES
(
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'agent-editor@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
),
(
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'agent-observer@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
);

INSERT INTO public.workspaces (id, name, slug)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'Workspace permitido', 'rls-test-allowed'),
    ('20000000-0000-0000-0000-000000000002', 'Workspace isolado', 'rls-test-isolated');

INSERT INTO public.workspace_members (
    workspace_id, user_id, role, can_publish_agent
) VALUES
(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'editor',
    false
),
(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'observer',
    false
);

INSERT INTO public.agents (id, workspace_id, name)
VALUES
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Agente permitido'),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Agente isolado');

INSERT INTO public.agent_drafts (id, workspace_id, agent_id, config)
VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '{
      "schemaVersion": 1,
      "identity": {"agentName": "Agente permitido", "companyName": "Teste"},
      "migration": {"legacyPrompt": "Você é um agente de teste."}
    }'
),
(
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    '{"schemaVersion": 1}'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
    true
);

DO $$
DECLARE
    visible_agents INTEGER;
BEGIN
    SELECT count(*) INTO visible_agents
    FROM public.agents
    WHERE id IN (
        '30000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002'
    );

    IF visible_agents <> 1 THEN
        RAISE EXCEPTION 'RLS deveria expor exatamente um agente, retornou %', visible_agents;
    END IF;
END;
$$;

-- Escrita direta é proibida mesmo para editor: toda alteração passa pela RPC.
DO $$
BEGIN
    BEGIN
        UPDATE public.agent_drafts
        SET revision = 99
        WHERE id = '40000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'UPDATE direto no rascunho deveria ser proibido';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

SELECT public.save_agent_draft(
    '30000000-0000-0000-0000-000000000001',
    '{
      "schemaVersion": 1,
      "identity": {"agentName": "Agente salvo", "companyName": "Teste"},
      "migration": {"legacyPrompt": "Você é um agente de teste."}
    }',
    1
);

DO $$
BEGIN
    BEGIN
        PERFORM public.publish_agent_draft(
            '30000000-0000-0000-0000-000000000001',
            2
        );
        RAISE EXCEPTION 'Editor sem can_publish_agent não deveria publicar';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

DO $$
BEGIN
    BEGIN
        PERFORM public.publish_compiled_agent_draft(
            '30000000-0000-0000-0000-000000000001',
            2,
            'Artefato que não pode ser publicado pelo cliente.',
            'agent-config-v1',
            '10000000-0000-0000-0000-000000000001'
        );
        RAISE EXCEPTION 'A publicação compilada deve ser privada ao backend';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;

UPDATE public.workspace_members
SET can_publish_agent = true
WHERE workspace_id = '20000000-0000-0000-0000-000000000001'
  AND user_id = '10000000-0000-0000-0000-000000000001';

SELECT public.publish_compiled_agent_draft(
    '30000000-0000-0000-0000-000000000001',
    2,
    'Você é um agente de teste compilado.',
    'agent-config-v1',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    'Versão do teste',
    '[]'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
    true
);

SELECT public.save_agent_draft(
    '30000000-0000-0000-0000-000000000001',
    '{
      "schemaVersion": 1,
      "identity": {"agentName": "Alteração não publicada", "companyName": "Teste"},
      "migration": {"legacyPrompt": "Prompt ainda em rascunho."}
    }',
    2
);

SELECT public.restore_agent_version_to_draft(
    '30000000-0000-0000-0000-000000000001',
    (
        SELECT id
        FROM public.agent_versions
        WHERE agent_id = '30000000-0000-0000-0000-000000000001'
        ORDER BY version_number DESC
        LIMIT 1
    ),
    3
);

DO $$
DECLARE
    restored_revision INTEGER;
    restored_name TEXT;
BEGIN
    SELECT revision, config #>> '{identity,agentName}'
      INTO restored_revision, restored_name
      FROM public.agent_drafts
     WHERE agent_id = '30000000-0000-0000-0000-000000000001';

    IF restored_revision <> 4 OR restored_name <> 'Agente salvo' THEN
        RAISE EXCEPTION 'Restauração não recompôs o snapshot publicado';
    END IF;
END;
$$;

-- Observador enxerga, mas não salva.
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
    true
);

DO $$
BEGIN
    BEGIN
        PERFORM public.save_agent_draft(
            '30000000-0000-0000-0000-000000000001',
            '{"schemaVersion": 1}',
            4
        );
        RAISE EXCEPTION 'Observador não deveria salvar o rascunho';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;

-- A versão publicada é realmente append-only, inclusive fora da RLS.
DO $$
BEGIN
    BEGIN
        UPDATE public.agent_versions
        SET label = 'mutação indevida'
        WHERE agent_id = '30000000-0000-0000-0000-000000000001';
        RAISE EXCEPTION 'Versão publicada deveria ser imutável';
    EXCEPTION
        WHEN object_not_in_prerequisite_state THEN NULL;
    END;
END;
$$;

ROLLBACK;
