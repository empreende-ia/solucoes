-- Nylas entra como provedor de agenda (substituição com transição): novos
-- vínculos usam o Nylas — que cobre Google, Outlook e iCloud num único fluxo —
-- e a conexão Google legada continua espelhando até ser reconectada.

-- O CHECK original é inline (provider = 'google'); o nome foi gerado pelo
-- Postgres, então localizamos pelo conteúdo em vez de assumir o nome.
DO $$
DECLARE
    provider_check TEXT;
BEGIN
    SELECT conname INTO provider_check
    FROM pg_constraint
    WHERE conrelid = 'public.calendar_integrations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%provider%';
    IF provider_check IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.calendar_integrations DROP CONSTRAINT %I', provider_check);
    END IF;
END $$;

ALTER TABLE public.calendar_integrations
    ADD CONSTRAINT calendar_integrations_provider_check
    CHECK (provider IN ('google', 'nylas'));

-- Identificador do grant no Nylas v3 (a autenticação por token/refresh do
-- provedor fica com o Nylas; nós guardamos apenas a referência do grant).
ALTER TABLE public.calendar_integrations
    ADD COLUMN IF NOT EXISTS grant_id TEXT;

-- Provedor real por trás do grant ('google' | 'microsoft' | 'icloud' | ...):
-- decide a sala de reunião automática (Meet/Teams) e a copy da interface.
ALTER TABLE public.calendar_integrations
    ADD COLUMN IF NOT EXISTS grant_provider TEXT;

COMMENT ON COLUMN public.calendar_integrations.grant_id IS
    'Grant do Nylas v3 dono desta conexão; NULL no provedor google legado.';
COMMENT ON COLUMN public.calendar_integrations.grant_provider IS
    'Provedor de agenda por trás do grant Nylas; NULL no provedor google legado.';
