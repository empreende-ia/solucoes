-- Executar após 20260814120000_nylas_calendar_provider.sql. Transacional:
-- valida o CHECK ampliado de provider e a coluna grant_id sem deixar resíduo.
BEGIN;

-- Dono das conexões (owner_user_id é NOT NULL na tabela).
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'calendar-owner@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

-- 1. Provedor nylas passa a ser aceito, com grant_id e grant_provider.
INSERT INTO public.calendar_integrations (provider, status, grant_id, grant_provider, account_email, owner_user_id)
VALUES ('nylas', 'active', 'grant-teste-1', 'google', 'agenda@example.test', '31000000-0000-0000-0000-000000000001');

-- 2. A transição admite google e nylas simultâneos (UNIQUE por provider intacto).
INSERT INTO public.calendar_integrations (provider, status, account_email, owner_user_id)
VALUES ('google', 'active', 'legado@example.test', '31000000-0000-0000-0000-000000000001');

-- 3. Segundo registro do mesmo provider continua bloqueado pelo UNIQUE.
DO $$
BEGIN
    BEGIN
        INSERT INTO public.calendar_integrations (provider, status, owner_user_id)
        VALUES ('nylas', 'active', '31000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'UNIQUE(provider) deveria ter bloqueado o segundo registro nylas';
    EXCEPTION WHEN unique_violation THEN
        NULL; -- esperado
    END;
END $$;

-- 4. Provedor fora da lista continua rejeitado pelo CHECK.
DO $$
BEGIN
    BEGIN
        INSERT INTO public.calendar_integrations (provider, status, owner_user_id)
        VALUES ('outlook_direct', 'active', '31000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'CHECK de provider deveria ter rejeitado outlook_direct';
    EXCEPTION WHEN check_violation THEN
        NULL; -- esperado
    END;
END $$;

ROLLBACK;
