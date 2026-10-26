-- Executar após 20260801220000_agent_product_metrics.sql.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000001',
 'authenticated', 'authenticated', 'metrics-editor@example.test', '', now(),
 '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000002',
 'authenticated', 'authenticated', 'metrics-observer@example.test', '', now(),
 '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

INSERT INTO public.workspaces (id, name, slug)
VALUES ('27000000-0000-0000-0000-000000000001', 'Product metrics', 'product-metrics-test');
INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES
('27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', 'editor'),
('27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000002', 'observer');
INSERT INTO public.agents (id, workspace_id, name)
VALUES ('37000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'Lara métricas');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"17000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE
    event_count INTEGER;
BEGIN
    PERFORM public.record_agent_product_event(
        '37000000-0000-0000-0000-000000000001', 'setup_started', 'business',
        '{"source":"assistant"}'::jsonb
    );
    SELECT count(*) INTO event_count FROM public.agent_audit_log
     WHERE agent_id = '37000000-0000-0000-0000-000000000001'
       AND action = 'agent.product.setup_started';
    IF event_count <> 1 THEN
        RAISE EXCEPTION 'Evento de produto não foi persistido';
    END IF;
    BEGIN
        PERFORM public.record_agent_product_event(
            '37000000-0000-0000-0000-000000000001', 'arbitrary_event', NULL, '{}'::jsonb
        );
        RAISE EXCEPTION 'Nome de evento arbitrário foi aceito';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'Evento de produto inválido' THEN RAISE; END IF;
    END;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"17000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
    BEGIN
        PERFORM public.record_agent_product_event(
            '37000000-0000-0000-0000-000000000001', 'setup_started', 'business', '{}'::jsonb
        );
        RAISE EXCEPTION 'Observador não deveria registrar evento de produto';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

ROLLBACK;
