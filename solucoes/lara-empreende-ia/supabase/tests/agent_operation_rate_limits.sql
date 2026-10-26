-- Executar após 20260801200000_agent_operation_rate_limits.sql.
BEGIN;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'rate-limit@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);
INSERT INTO public.workspaces (id, name, slug)
VALUES ('25000000-0000-0000-0000-000000000001', 'Rate limit', 'rate-limit-test');

SET LOCAL ROLE service_role;
DO $$
BEGIN
    IF NOT public.consume_agent_rate_limit('25000000-0000-0000-0000-000000000001', 'subject-a', 'simulator', 2, 60)
       OR NOT public.consume_agent_rate_limit('25000000-0000-0000-0000-000000000001', 'subject-a', 'simulator', 2, 60)
       OR public.consume_agent_rate_limit('25000000-0000-0000-0000-000000000001', 'subject-a', 'simulator', 2, 60) THEN
        RAISE EXCEPTION 'O contador atômico não respeitou o limite';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $$
BEGIN
    BEGIN
        PERFORM public.consume_agent_rate_limit('25000000-0000-0000-0000-000000000001', 'forged', 'simulator', 99, 60);
        RAISE EXCEPTION 'O cliente não deveria controlar o próprio rate limit';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM 1 FROM public.agent_operation_rate_limits;
        RAISE EXCEPTION 'O cliente não deveria ler contadores internos';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

ROLLBACK;
