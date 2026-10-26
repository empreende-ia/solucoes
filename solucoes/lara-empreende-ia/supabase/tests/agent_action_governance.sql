-- Executar após 20260801150000_agent_action_governance.sql. A transação não
-- deixa usuários, agendas ou registros de ação residuais.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
(
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'action-editor@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'action-observer@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

INSERT INTO public.workspaces (id, name, slug)
VALUES
    ('22000000-0000-0000-0000-000000000001', 'Ações permitidas', 'action-test-allowed'),
    ('22000000-0000-0000-0000-000000000002', 'Ações isoladas', 'action-test-isolated');

INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES
    ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'editor'),
    ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002', 'observer');

INSERT INTO public.appointments (
    id, workspace_id, user_id, title, date, time, duration, type, status
) VALUES
(
    '32000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000002', NULL,
    'Agenda isolada', '2030-02-04', '10:00', 60, 'meeting', 'scheduled'
);

INSERT INTO public.agent_action_runs (
    id, workspace_id, action_key, idempotency_key, status, output
) VALUES
(
    '42000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'register_opt_out', 'action-test-a', 'succeeded', '{"success":true}'
),
(
    '42000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'create_appointment', 'action-test-b', 'succeeded', '{"success":true}'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"12000000-0000-0000-0000-000000000001","role":"authenticated"}',
    true
);

-- O trigger descobre o workspace pelo usuário; o cliente não escolhe tenant.
INSERT INTO public.appointments (
    id, user_id, title, date, time, duration, type, status
) VALUES (
    '32000000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000001',
    'Reunião permitida', '2030-02-04', '10:00', 60, 'meeting', 'scheduled'
);

DO $$
DECLARE
    assigned_workspace UUID;
    visible_appointments INTEGER;
    visible_runs INTEGER;
BEGIN
    SELECT workspace_id INTO assigned_workspace
      FROM public.appointments
     WHERE id = '32000000-0000-0000-0000-000000000002';
    SELECT count(*) INTO visible_appointments
      FROM public.appointments
     WHERE id IN (
        '32000000-0000-0000-0000-000000000001',
        '32000000-0000-0000-0000-000000000002'
     );
    SELECT count(*) INTO visible_runs
      FROM public.agent_action_runs
     WHERE id IN (
        '42000000-0000-0000-0000-000000000001',
        '42000000-0000-0000-0000-000000000002'
     );

    IF assigned_workspace <> '22000000-0000-0000-0000-000000000001'
       OR visible_appointments <> 1 OR visible_runs <> 1 THEN
        RAISE EXCEPTION
            'Isolamento de ações falhou: workspace %, agendas %, runs %',
            assigned_workspace, visible_appointments, visible_runs;
    END IF;
END;
$$;

-- Nem o editor grava auditoria de execução; somente o backend de serviço.
DO $$
BEGIN
    BEGIN
        INSERT INTO public.agent_action_runs (
            workspace_id, action_key, idempotency_key
        ) VALUES (
            '22000000-0000-0000-0000-000000000001',
            'human_handoff', 'client-forbidden'
        );
        RAISE EXCEPTION 'Cliente não deveria gravar agent_action_runs';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

-- A exclusão impede duas reservas concorrentes que se sobrepõem.
DO $$
BEGIN
    BEGIN
        INSERT INTO public.appointments (
            user_id, title, date, time, duration, type, status
        ) VALUES (
            '12000000-0000-0000-0000-000000000001',
            'Conflito', '2030-02-04', '10:30', 30, 'meeting', 'scheduled'
        );
        RAISE EXCEPTION 'Horários sobrepostos deveriam ser rejeitados';
    EXCEPTION
        WHEN exclusion_violation THEN NULL;
    END;
END;
$$;

-- Observador pode ler a agenda do workspace, mas não alterá-la.
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"12000000-0000-0000-0000-000000000002","role":"authenticated"}',
    true
);

DO $$
BEGIN
    BEGIN
        INSERT INTO public.appointments (
            user_id, title, date, time, duration, type, status
        ) VALUES (
            '12000000-0000-0000-0000-000000000002',
            'Tentativa do observador', '2030-02-05', '10:00', 60, 'meeting', 'scheduled'
        );
        RAISE EXCEPTION 'Observador não deveria criar agendamento';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

ROLLBACK;
