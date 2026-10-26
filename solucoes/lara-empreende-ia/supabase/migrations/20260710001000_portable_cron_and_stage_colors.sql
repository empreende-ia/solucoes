-- Portabilidade para remixes + correções:
-- 1. ensure_edge_secrets: edge functions seedam project_url/service_role_key no
--    Vault (elas têm os valores corretos no env em QUALQUER projeto — remix incluído)
-- 2. Cron jobs de varredura reescritos para ler do Vault em vez de URL/chave
--    hardcoded. Isso também corrige um bug da migration 20260709230000: os jobs
--    usavam a anon key, mas o requireAuth do orchestrator/sender só aceita
--    service role ou JWT de usuário — o sweep tomava 401.
-- 3. pipeline_stages.color: migra classes Tailwind herdadas (cyan/violet/amber…)
--    para os tokens Empreende.IA usados pelo picker do PipelineSettingsModal.

-- ============================================================
-- 1. RPC que replica os secrets do ambiente das edge functions para o Vault.
--    Idempotente: só escreve quando o valor mudou. Executável apenas pelo
--    service role (as edge functions).
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_edge_secrets(
  p_project_url text,
  p_service_role_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_current text;
BEGIN
  IF coalesce(p_project_url, '') = '' OR coalesce(p_service_role_key, '') = '' THEN
    RETURN;
  END IF;

  -- Serializa chamadas concorrentes (duas execuções simultâneas fariam
  -- vault.create_secret duplo no primeiro seed → unique violation)
  PERFORM pg_advisory_xact_lock(hashtextextended('ensure_edge_secrets', 42));

  SELECT id, decrypted_secret INTO v_id, v_current
  FROM vault.decrypted_secrets WHERE name = 'edge_project_url';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_project_url, 'edge_project_url');
  ELSIF v_current IS DISTINCT FROM p_project_url THEN
    PERFORM vault.update_secret(v_id, p_project_url);
  END IF;

  SELECT id, decrypted_secret INTO v_id, v_current
  FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_service_role_key, 'edge_service_role_key');
  ELSIF v_current IS DISTINCT FROM p_service_role_key THEN
    PERFORM vault.update_secret(v_id, p_service_role_key);
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_edge_secrets(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_edge_secrets(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_edge_secrets(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_edge_secrets(text, text) TO service_role;

-- ============================================================
-- 2. Cron jobs lendo do Vault. Enquanto os secrets não existem (projeto recém
--    remixado, antes do primeiro signup/mensagem), o WHERE curto-circuita e o
--    job não faz nada — se auto-ativa assim que ensure_edge_secrets rodar.
-- ============================================================
DO $do$
BEGIN
  PERFORM cron.unschedule('lara-orchestrator-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job não existia
END;
$do$;

DO $do$
BEGIN
  PERFORM cron.unschedule('send-queue-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$do$;

SELECT cron.schedule(
  'lara-orchestrator-sweep',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_project_url')
           || '/functions/v1/lara-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key')
    ),
    body := '{"triggered_by": "cron-sweep"}'::jsonb,
    timeout_milliseconds := 30000
  )
  WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'edge_project_url')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key')
    AND EXISTS (
      SELECT 1 FROM public.lara_processing_queue
      WHERE status = 'pending'
        AND (scheduled_for IS NULL OR scheduled_for <= now())
    );
  $job$
);

SELECT cron.schedule(
  'send-queue-sweep',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_project_url')
           || '/functions/v1/whatsapp-sender',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key')
    ),
    body := '{"triggered_by": "cron-sweep"}'::jsonb,
    timeout_milliseconds := 30000
  )
  WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'edge_project_url')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key')
    AND EXISTS (
      SELECT 1 FROM public.send_queue
      WHERE status = 'pending'
        AND (scheduled_at IS NULL OR scheduled_at <= now())
    );
  $job$
);

-- ============================================================
-- 3. Cores dos estágios do pipeline: classes herdadas → tokens Empreende.IA.
--    Mesmo vocabulário do picker (src/lib/stageColors.ts espelha este mapa
--    no front como defesa para dados que escapem desta migração).
-- ============================================================
UPDATE public.pipeline_stages SET color = CASE
  WHEN color ~ '^border-(slate|gray|zinc|neutral|stone)-'   THEN 'border-muted-foreground'
  WHEN color ~ '^border-(cyan|sky|blue|teal)-'              THEN 'border-chart-2'
  WHEN color ~ '^border-(violet|purple|indigo|fuchsia)-'    THEN 'border-chart-3'
  WHEN color ~ '^border-(orange|amber|yellow)-'             THEN 'border-primary'
  WHEN color ~ '^border-(emerald|green|lime)-'              THEN 'border-success'
  WHEN color ~ '^border-(red|rose|pink)-'                   THEN 'border-destructive'
  ELSE color
END
WHERE color ~ '^border-(slate|gray|zinc|neutral|stone|cyan|sky|blue|teal|violet|purple|indigo|fuchsia|orange|amber|yellow|emerald|green|lime|red|rose|pink)-';

ALTER TABLE public.pipeline_stages ALTER COLUMN color SET DEFAULT 'border-muted-foreground';
