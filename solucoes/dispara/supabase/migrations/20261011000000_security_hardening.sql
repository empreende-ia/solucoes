-- =============================================================================
-- Hardening de segurança do banco (2026-10-11)
-- =============================================================================
--
-- O que esta migration faz:
--
-- 1. Fecha a leitura anônima. O init criava policies `FOR SELECT TO anon USING (true)`
--    em campaigns, contacts, templates, flows, inbox_conversations, inbox_messages e
--    account_alerts. Como a chave publishable (role anon) vai no bundle do browser,
--    qualquer pessoa conseguia GET /rest/v1/contacts ou /rest/v1/inbox_messages.
--    Aqui anon/authenticated perdem TODO privilégio em TODAS as tabelas/views/sequences
--    de public (inventário dinâmico, não lista manual) e as policies são removidas.
--    O app não usa Supabase Auth: todo acesso legítimo é service role no servidor
--    (rotas de API, server actions e lib/supabase-server.ts), com a autorização
--    feita pelo proxy.ts (sessão do dashboard, API key, cron, atendente).
--
-- 2. Fecha as RPCs. Funções SECURITY DEFINER das migrations 2026* (claim_campaign_batch,
--    reap_stuck_campaign_sending, try_lock_campaign_dispatch, release_campaign_dispatch_lock,
--    dispara_cron_tick, increment_campaign_auto_reply_counters...) ficaram executáveis
--    por anon via /rest/v1/rpc/*. Aqui EXECUTE é revogado de PUBLIC/anon/authenticated
--    em TODAS as funções de public (e nas futuras via default privileges); só
--    service_role mantém EXECUTE. SECURITY DEFINER sem search_path fixo ganha um.
--
-- 3. Realtime via Broadcast from Database. O realtime do dashboard usava
--    postgres_changes com a chave anon, que dependia exatamente das policies acima.
--    Agora uma trigger (dispara_broadcast_change) publica no canal público
--    'dispara-db' (evento 'db_change') um payload com SÓ colunas não sensíveis
--    (ids, status, contadores, timestamps). NUNCA inclua PII (nome, telefone, email,
--    conteúdo de mensagem, custom_fields): quem tem a chave publishable pode ouvir
--    (e também emitir) mensagens nesse canal. O frontend trata o evento como um
--    "sinal de invalidação" e busca os dados reais pelas APIs autenticadas.
--    Cada evento vira 1 linha em realtime.messages (o Realtime só apaga a partição
--    diária dias depois), então o volume é controlado aqui, e o disparo de campanha
--    NÃO gera evento por contato:
--    - campaign_contacts NÃO tem trigger (o progresso vem de campaigns +
--      lib/realtime-broadcast-server.ts, que não grava em realtime.messages);
--    - campaigns: INSERT/DELETE sempre; UPDATE só quando muda status/conclusão/
--      cancelamento/pasta, ou contadores no máximo 1x a cada 2s por campanha
--      (increment_campaign_stat faz 1 UPDATE por delivered/read/failed). UPDATE que só
--      mexe em dispatch_lock_* não publica;
--    - inbox_messages: a cópia do template de campanha que syncCampaignTemplateToInbox
--      grava a cada envio (payload.type = 'campaign_template') não publica — nem o
--      INSERT nem os UPDATEs de status (sent/delivered/read de cada webhook). As demais
--      mensagens publicam o INSERT e o UPDATE que MUDA delivery_status (webhook repetido
--      com o mesmo status não publica). DELETE por STATEMENT (apagar uma conversa apaga
--      N mensagens em cascata);
--    - inbox_conversations: INSERT não publica (a conversa nova aparece pelo INSERT da
--      primeira mensagem, que o CentralizedRealtimeProvider também usa para invalidar a
--      lista). UPDATE só quando muda o estado do atendimento (status, modo, prioridade,
--      não lidas, agente, pausa, expiração do modo humano): o contador de saída
--      (increment_conversation_counters: total_messages/last_message_*) e o SET NULL de
--      contact_id do bulk_delete_contacts não publicam;
--    - contacts usa trigger por STATEMENT (um evento por import/bulk update);
--    - flow_submissions só INSERT (o frontend só usa isso; o SET NULL em massa de
--      bulk_delete_contacts não gera eventos);
--    - templates, flows e template_project_items: INSERT/DELETE sempre; UPDATE só quando
--      muda uma coluna que a UI mostra (WHEN explícito por tabela). O sync de templates
--      (GET /api/templates, refresh do template no disparo) faz upsert de TODOS os
--      templates com fetched_at/updated_at novos; o sync de projetos regrava meta_id/
--      meta_status de cada item; e updated_at/meta_last_checked_at de flows mudam a cada
--      salvar/checar. Sem mudança real, nada disso publica (antes: 1 evento por linha).
--    Por contato de campanha (envio e webhooks sent/delivered/read): 0 linhas em
--    realtime.messages (antes ~5-6: INSERT da conversa e da mensagem, UPDATE dos
--    contadores da conversa e um UPDATE por webhook de status — ~300 MB numa campanha
--    de 100k). Sobra o throttle de campaigns (≤ 1 evento a cada 2s por campanha).
--    Mensagem recebida, resposta humana/IA, mudança de atendimento e status de entrega
--    das mensagens fora de campanha continuam ao vivo.
--    O payload é montado com colunas explícitas (NEW.col), nunca com to_jsonb(NEW): não
--    destoasta template_snapshot, components, content, response_json etc. a cada escrita.
--    As tabelas saem da publicação supabase_realtime (postgres_changes não é mais usado).
--
--    PREMISSA do realtime.send: a trigger chama realtime.send FORA de bloco de exceção
--    (uma subtransação por evento, não duas), contando que ele tenha o próprio
--    EXCEPTION WHEN OTHERS — o do Supabase tem: o INSERT em realtime.messages fica num
--    BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING 'WarnSendingBroadcastMessage'.
--    Isso é verificado, não presumido: as triggers só são criadas se o fonte de
--    realtime.send(jsonb,text,text,boolean) (pg_proc.prosrc, sem literais e comentários)
--    tiver EXCEPTION WHEN OTHERS THEN e nenhum comando que lance erro (só RAISE
--    DEBUG/LOG/INFO/NOTICE/WARNING: um handler que relança com RAISE; reprova), e
--    dispara_broadcast_change refaz a checagem a cada evento (se o Supabase trocar a
--    função depois, a trigger para de publicar em vez de derrubar a escrita). A guarda
--    também confere USAGE no schema realtime e EXECUTE no send antes de usá-lo.
--    Preferimos ficar sem realtime a arriscar derrubar escritas do app.
--    LIMITAÇÃO da guarda (heurística sobre o texto do fonte, não análise de fluxo): ela
--    não trata dollar-quotes nem E'...' com \' ao remover literais, não sabe se o INSERT
--    está DENTRO do bloco protegido e não detecta erro lançado por outro caminho no
--    handler (ex.: 1/0). Um fonte escrito para enganá-la passaria e uma falha no INSERT
--    derrubaria a escrita. O alvo é o realtime.send do próprio Supabase (versões
--    conhecidas: handler com RAISE WARNING 'WarnSendingBroadcastMessage' — a atual, conferida
--    num projeto real em 2026-10 —, 'ErrorSendingBroadcastMessage' ou PERFORM
--    pg_notify('realtime:system', ...): todas passam e não relançam); confira o fonte real
--    com o modo --verify-only do scripts/check-migrations.mjs.
--    realtime.messages é particionada por dia e quem cria as partições é o servidor
--    Realtime, quando um cliente conecta. Se ninguém abriu o dashboard há dias, não há
--    partição para hoje: o send só avisa e nada é publicado (não chegaria a ninguém) até a
--    próxima conexão recriar a janela. Nada a fazer aqui; o --verify-only informa.
--    Efeito colateral conhecido do throttle de campaigns: o BEFORE set_updated_at grava
--    updated_at também nos UPDATEs só de dispatch_lock_* (try_lock/release do dreno), que
--    não publicam mas "gastam" a janela de 2s — um contador logo depois pode não publicar.
--    A tela de campanha cobre isso com polling (useCampaignDetails/useCampaignsQuery).
--    Sem realtime.send (Broadcast from Database indisponível) ou sem o tratamento de
--    erro, a migration aplica o resto normalmente, NÃO cria as triggers e emite um
--    WARNING: o dashboard fica só no polling até esta migration ser reaplicada depois
--    que o Realtime estiver ativo. Se o dono da função não puder chamar o send ou gravar
--    em realtime.messages (privilégio ou RLS), as triggers são criadas e a migration
--    emite um WARNING com o GRANT/policy que falta (o send engoliria o erro em silêncio).
--
-- EXIGE a versão correspondente do frontend (realtime via broadcast em
-- lib/supabase-realtime.ts + CentralizedRealtimeProvider, useUnreadCount via
-- /api/inbox/unread-count e lib/supabase-server.ts com service role). Com o frontend
-- antigo o realtime do dashboard para de atualizar (as listas seguem funcionando
-- por polling/refetch), e as leituras diretas do browser passam a falhar.
-- Exige Postgres 14+ (CREATE OR REPLACE TRIGGER); o Supabase roda 15+.
--
-- Idempotente e SEGURO DE RE-EXECUTAR: pode rodar mais de uma vez (o installer aplica
-- todas as migrations em ordem em instalações novas; em produção é aplicada
-- manualmente). Re-executar recria a função; cada trigger só é (re)criada quando a
-- definição deste arquivo muda ou quando foi alterada/desabilitada à mão (marca com o md5
-- da definição e o do pg_get_triggerdef no COMMENT da trigger), então uma re-execução
-- sem mudança não trava nenhuma tabela por causa das triggers — e reaplicar conserta
-- uma trigger mexida à mão.
--
-- COMO APLICAR EM PRODUÇÃO (operacional):
-- - Rode numa janela de BAIXO TRÁFEGO, fora de um disparo de campanha: ENABLE ROW LEVEL
--   SECURITY e DROP POLICY pegam ACCESS EXCLUSIVE, e CREATE OR REPLACE TRIGGER pega
--   SHARE ROW EXCLUSIVE (bloqueia escrita, não leitura), todos até o COMMIT. Por isso o
--   DROP POLICY fica no fim do arquivo (as 7 tabelas quentes ficam travadas por
--   milissegundos, não pela migration inteira).
-- - Antes, confira no pg_stat_activity se há transação longa ou 'idle in transaction'
--   (ex.: export, ANALYZE manual, aba esquecida no SQL editor) e encerre-a.
-- - Aplique como UMA transação (SQL editor do Supabase, o installer, ou
--   `psql --single-transaction -f`). O `SET LOCAL lock_timeout` abaixo limita a espera
--   por lock a 5s: se estourar, a transação inteira faz rollback (nada fica pela
--   metade: nenhum bloco de exceção deste arquivo engole erro de lock — 55P03 — ou
--   deadlock) e basta aplicar de novo. Fora de uma transação o SET LOCAL só avisa.
--
-- Rollback (emergência): recriar as policies anon_select_* e o GRANT SELECT nessas
-- 7 tabelas reabre o vazamento — prefira voltar o frontend e manter este arquivo.
-- =============================================================================

-- Nunca esperar indefinidamente por lock (nem segurar os já obtidos enquanto isso):
-- com tráfego, um ALTER TABLE na fila bloqueia até os SELECTs de quem chega depois.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';


-- -----------------------------------------------------------------------------
-- 1) Leitura anônima: privilégios (sem lock pesado; as policies saem na seção 6)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.campaigns FROM anon, authenticated;
REVOKE ALL ON TABLE public.contacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.templates FROM anon, authenticated;
REVOKE ALL ON TABLE public.flows FROM anon, authenticated;
REVOKE ALL ON TABLE public.inbox_conversations FROM anon, authenticated;
REVOKE ALL ON TABLE public.inbox_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.account_alerts FROM anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2) Inventário dinâmico: nenhuma tabela/view/sequence de public para anon/authenticated
--    + RLS ligado em todas as tabelas (defesa em profundidade: sem policy, nega).
--    service_role tem BYPASSRLS e segue com os grants que já tinha.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, c.relkind, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      -- objetos de extensão instalada em public não são nossos
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.relname);

    -- ENABLE ROW LEVEL SECURITY pede ACCESS EXCLUSIVE mesmo quando o RLS já está ligado:
    -- só roda nas tabelas que ainda não têm (as do init já têm).
    IF r.relkind IN ('r', 'p') AND NOT r.relrowsecurity THEN
      BEGIN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
      -- Só a tabela de outro dono é pulada. lock_timeout (lock_not_available), deadlock
      -- e qualquer outro erro abortam a migration inteira: nenhuma tabela fica sem RLS
      -- com a migration "aplicada".
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE WARNING 'security_hardening: não foi possível ligar RLS em public.% (%)', r.relname, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Objetos futuros criados pelo role que roda as migrations (postgres no Supabase).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3) SECURITY DEFINER sem search_path fixo (ex.: increment_campaign_auto_reply_counters)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.signature);
    EXCEPTION
      -- Lock/deadlock nunca é engolido: aborta a migration inteira.
      WHEN lock_not_available OR deadlock_detected THEN
        RAISE;
      WHEN OTHERS THEN
        RAISE WARNING 'security_hardening: não foi possível fixar search_path em % (%)', r.signature, SQLERRM;
    END;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 4) Realtime: Broadcast from Database (canal público 'dispara-db', evento 'db_change')
-- -----------------------------------------------------------------------------
-- Payload: { table, eventType, new, old, commit_timestamp }
--   new = colunas whitelisted da linha nova (INSERT/UPDATE), senão null
--   old = só as chaves da linha antiga (UPDATE/DELETE): id + coluna de filtro/transição
--         que o frontend usa (conversation_id, project_id, campaign_id, status...)
--   Trigger por STATEMENT (contacts, DELETE de inbox_messages): new = old = null.
-- As projeções abaixo (uma por tabela, com NEW.col/OLD.col explícitos) são a ÚNICA
-- fonte das colunas que saem do banco por este canal. Nunca use to_jsonb(NEW): ele
-- destoasta a linha inteira (template_snapshot, components, content...) a cada escrita.
-- Ao adicionar coluna: só ids, status, contadores e timestamps. Nada de PII.
CREATE OR REPLACE FUNCTION public.dispara_broadcast_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_send regprocedure;
  v_new jsonb := NULL;
  v_old jsonb := NULL;
BEGIN
  -- Sem USAGE no schema realtime, sem realtime.send, sem EXECUTE nele (a função é
  -- SECURITY DEFINER: vale o dono) ou sem o tratamento de erro próprio dele (o PERFORM
  -- abaixo fica fora de bloco de exceção: ver a PREMISSA no cabeçalho), não publica e
  -- nunca derruba a escrita. Checado fora de qualquer bloco de exceção, a cada evento (o
  -- Supabase pode trocar a função ou os privilégios depois desta migration).
  -- USAGE ANTES do to_regprocedure: sem ele, to_regprocedure ERRA (42501 "permission
  -- denied for schema realtime") em vez de devolver NULL — e derrubaria a escrita.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n
    WHERE n.nspname = 'realtime' AND has_schema_privilege(n.oid, 'USAGE')
  ) THEN
    RETURN NULL;
  END IF;
  v_send := to_regprocedure('realtime.send(jsonb,text,text,boolean)');
  IF v_send IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT has_function_privilege(v_send::oid, 'EXECUTE') THEN
    RETURN NULL;
  END IF;
  -- Fonte de realtime.send, sem literais e comentários: tem de ter EXCEPTION WHEN OTHERS
  -- THEN e nenhum comando que lance erro — só RAISE DEBUG/LOG/INFO/NOTICE/WARNING. Um
  -- handler que relança (RAISE;), RAISE EXCEPTION/SQLSTATE/condição, RAISE sem nível
  -- (= EXCEPTION) ou ASSERT, em qualquer ponto do fonte, reprova (conservador: não dá
  -- para localizar o handler por regex, e preferimos ficar sem realtime).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p,
         LATERAL (SELECT regexp_replace(p.prosrc, '''(?:[^'']|'''')*''|-{2}[^\n]*|/\*(?:[^*]|\*+[^/*])*\*+/', ' ', 'g') AS src) s
    WHERE p.oid = v_send::oid
      AND s.src ~* '\mexception\s+when\s+others\s+then\M'
      AND s.src !~* '\m(?:assert|raise(?!\s+(?:debug|log|info|notice|warning)\M))\M'
  ) THEN
    RETURN NULL;
  END IF;

  -- Bloco de exceção SÓ na projeção: realtime é best-effort e uma coluna renomeada não
  -- pode derrubar a escrita no banco. Ele não escreve nada, então a subtransação dele
  -- não recebe XID: a única subtransação com XID por evento é a do realtime.send.
  BEGIN
    IF TG_LEVEL = 'ROW' THEN
      IF TG_TABLE_NAME = 'campaigns' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'status', NEW.status,
            'total_recipients', NEW.total_recipients,
            'sent', NEW.sent,
            'delivered', NEW.delivered,
            'read', NEW.read,
            'failed', NEW.failed,
            'skipped', NEW.skipped,
            'auto_reply_sent_count', NEW.auto_reply_sent_count,
            'quick_reply_match_count', NEW.quick_reply_match_count,
            'fallback_sent_count', NEW.fallback_sent_count,
            'folder_id', NEW.folder_id,
            'flow_id', NEW.flow_id,
            'ab_test_enabled', NEW.ab_test_enabled,
            'scheduled_date', NEW.scheduled_date,
            'started_at', NEW.started_at,
            'first_dispatch_at', NEW.first_dispatch_at,
            'last_sent_at', NEW.last_sent_at,
            'completed_at', NEW.completed_at,
            'cancelled_at', NEW.cancelled_at,
            'created_at', NEW.created_at,
            'updated_at', NEW.updated_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          -- status/completed_at antigos: useRealtimeNotifications detecta a TRANSIÇÃO
          -- para Concluído/Falhou (sem eles, todo update de contador viraria toast).
          v_old := jsonb_build_object(
            'id', OLD.id,
            'status', OLD.status,
            'completed_at', OLD.completed_at
          );
        END IF;

      ELSIF TG_TABLE_NAME = 'templates' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'status', NEW.status,
            'category', NEW.category,
            'language', NEW.language,
            'parameter_format', NEW.parameter_format,
            'fetched_at', NEW.fetched_at,
            'created_at', NEW.created_at,
            'updated_at', NEW.updated_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id);
        END IF;

      ELSIF TG_TABLE_NAME = 'flows' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'status', NEW.status,
            'meta_status', NEW.meta_status,
            'meta_flow_id', NEW.meta_flow_id,
            'meta_last_checked_at', NEW.meta_last_checked_at,
            'meta_published_at', NEW.meta_published_at,
            'created_at', NEW.created_at,
            'updated_at', NEW.updated_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id);
        END IF;

      ELSIF TG_TABLE_NAME = 'inbox_conversations' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'contact_id', NEW.contact_id,
            'ai_agent_id', NEW.ai_agent_id,
            'status', NEW.status,
            'mode', NEW.mode,
            'priority', NEW.priority,
            'unread_count', NEW.unread_count,
            'total_messages', NEW.total_messages,
            'last_message_at', NEW.last_message_at,
            'automation_paused_until', NEW.automation_paused_until,
            'human_mode_expires_at', NEW.human_mode_expires_at,
            'created_at', NEW.created_at,
            'updated_at', NEW.updated_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id);
        END IF;

      ELSIF TG_TABLE_NAME = 'inbox_messages' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'conversation_id', NEW.conversation_id,
            'direction', NEW.direction,
            'message_type', NEW.message_type,
            'source_type', NEW.source_type,
            'delivery_status', NEW.delivery_status,
            'created_at', NEW.created_at,
            'delivered_at', NEW.delivered_at,
            'read_at', NEW.read_at,
            'failed_at', NEW.failed_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id, 'conversation_id', OLD.conversation_id);
        END IF;

      ELSIF TG_TABLE_NAME = 'account_alerts' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'type', NEW.type,
            'code', NEW.code,
            'dismissed', NEW.dismissed,
            'created_at', NEW.created_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id);
        END IF;

      ELSIF TG_TABLE_NAME = 'template_projects' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'status', NEW.status,
            'template_count', NEW.template_count,
            'approved_count', NEW.approved_count,
            'created_at', NEW.created_at,
            'updated_at', NEW.updated_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id);
        END IF;

      ELSIF TG_TABLE_NAME = 'template_project_items' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'project_id', NEW.project_id,
            'status', NEW.status,
            'meta_status', NEW.meta_status,
            'category', NEW.category,
            'language', NEW.language,
            'submitted_at', NEW.submitted_at,
            'created_at', NEW.created_at,
            'updated_at', NEW.updated_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id, 'project_id', OLD.project_id);
        END IF;

      ELSIF TG_TABLE_NAME = 'flow_submissions' THEN
        IF TG_OP <> 'DELETE' THEN
          v_new := jsonb_build_object(
            'id', NEW.id,
            'campaign_id', NEW.campaign_id,
            'flow_id', NEW.flow_id,
            'flow_local_id', NEW.flow_local_id,
            'created_at', NEW.created_at
          );
        END IF;
        IF TG_OP <> 'INSERT' THEN
          v_old := jsonb_build_object('id', OLD.id, 'campaign_id', OLD.campaign_id);
        END IF;
      END IF;
      -- Tabela sem projeção: new/old ficam null (o evento vira só um sinal).
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispara_broadcast_change(%): %', TG_TABLE_NAME, SQLERRM;
    RETURN NULL;
  END;

  -- Fora do bloco de exceção: realtime.send tem o próprio BEGIN ... EXCEPTION WHEN OTHERS
  -- em volta do INSERT em realtime.messages (engole o erro e só avisa, inclusive partição
  -- ausente — verificado pela guarda do início), então o envio também é best-effort, com
  -- uma subtransação, não duas.
  PERFORM realtime.send(
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'eventType', TG_OP,
      'new', v_new,
      'old', v_old,
      'commit_timestamp', now()
    ),
    'db_change',
    'dispara-db',
    false
  );

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.dispara_broadcast_change() IS
  'Realtime do dashboard: publica no canal público dispara-db (evento db_change) só colunas whitelisted (sem PII), projetadas coluna a coluna. Ver 20261011000000_security_hardening.sql.';

-- Triggers só onde existe realtime.send (Supabase com Broadcast from Database) E ele tem
-- o próprio EXCEPTION WHEN OTHERS (a PREMISSA do cabeçalho); senão, WARNING e nenhuma
-- trigger — o resto da migration aplica normalmente.
-- Lista = tabelas que o frontend escuta (CentralizedRealtimeProvider + hooks/*).
-- Cada evento é 1 INSERT em realtime.messages: o recorte por tabela/evento/WHEN abaixo
-- controla o volume (ver o cabeçalho).
--
-- Lock: CREATE OR REPLACE TRIGGER pega SHARE ROW EXCLUSIVE (bloqueia escrita, não
-- leitura) até o COMMIT — DROP TRIGGER pegaria ACCESS EXCLUSIVE. E cada trigger só é
-- (re)criada quando a definição deste arquivo muda ou quando alguém alterou/desabilitou
-- a trigger à mão: a marca 'dispara_broadcast:<md5 da definição>:<md5 do
-- pg_get_triggerdef>' fica no COMMENT da trigger, então re-executar sem mudança não
-- toca nas tabelas (o xmin da linha em pg_trigger não muda: scripts/check-migrations.mjs).
-- CREATE OR REPLACE também troca eventos, WHEN e nível (ROW/STATEMENT) de uma trigger
-- de mesmo nome. Nenhuma trigger deixou de existir entre as versões deste arquivo (só
-- mudaram eventos/WHEN), por isso não há DROP TRIGGER.
DO $$
DECLARE
  r record;
  v_send regprocedure;
  v_realtime oid;
  v_messages oid;
  v_fn_owner oid;
  v_inserter oid;
  v_search_path text;
  v_definition text;
  v_spec_md5 text;
  v_trigger oid;
  v_enabled "char";
  v_current text;
  v_marker text;
BEGIN
  -- Mesma ordem da guarda de dispara_broadcast_change: USAGE antes do to_regprocedure.
  SELECT n.oid INTO v_realtime FROM pg_catalog.pg_namespace n WHERE n.nspname = 'realtime';
  IF v_realtime IS NOT NULL AND has_schema_privilege(v_realtime, 'USAGE') THEN
    v_send := to_regprocedure('realtime.send(jsonb,text,text,boolean)');
  END IF;
  IF v_send IS NULL THEN
    RAISE WARNING 'security_hardening: realtime.send indisponível (schema realtime ou função ausente, ou % sem USAGE no schema realtime) — triggers de broadcast NÃO criadas e o realtime do dashboard fica só no polling. Reaplique esta migration depois que o Realtime estiver ativo (Broadcast from Database).',
      current_user;
    RETURN;
  END IF;
  -- Mesmo critério da guarda de dispara_broadcast_change (ver o comentário lá).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p,
         LATERAL (SELECT regexp_replace(p.prosrc, '''(?:[^'']|'''')*''|-{2}[^\n]*|/\*(?:[^*]|\*+[^/*])*\*+/', ' ', 'g') AS src) s
    WHERE p.oid = v_send::oid
      AND s.src ~* '\mexception\s+when\s+others\s+then\M'
      AND s.src !~* '\m(?:assert|raise(?!\s+(?:debug|log|info|notice|warning)\M))\M'
  ) THEN
    RAISE WARNING 'security_hardening: realtime.send não trata os próprios erros (falta o bloco EXCEPTION ... WHEN OTHERS, ou o fonte relança/lança erro: RAISE;, RAISE EXCEPTION, RAISE sem nível, ASSERT) — triggers de broadcast NÃO criadas: a trigger chama realtime.send fora de bloco de exceção e uma falha no envio derrubaria a escrita do app (preferimos ficar sem realtime; o dashboard fica só no polling). Triggers de uma aplicação anterior não publicam (a função refaz esta checagem a cada evento). Reaplique esta migration quando realtime.send voltar a tratar os próprios erros.';
    RETURN;
  END IF;

  -- Privilégios do caminho do envio. Quem CHAMA realtime.send é o DONO de
  -- dispara_broadcast_change (SECURITY DEFINER; pode não ser quem roda esta migration:
  -- CREATE OR REPLACE FUNCTION mantém o dono). Quem INSERE em realtime.messages é esse
  -- dono, ou o dono do send se ele for SECURITY DEFINER (no Supabase é SECURITY INVOKER).
  -- Sem USAGE/EXECUTE a trigger não publica; sem INSERT, ou barrado pelo RLS de
  -- realtime.messages, o send engole o erro (WARNING WarnSendingBroadcastMessage a cada
  -- escrita) e o realtime morre em silêncio. Nenhum dos casos derruba escrita, então as
  -- triggers são criadas assim mesmo (corrigido o privilégio, o realtime volta sem
  -- reaplicar) — mas avisa aqui. `npm run db:check -- --verify-only` confere o mesmo.
  SELECT f.proowner, CASE WHEN s.prosecdef THEN s.proowner ELSE f.proowner END,
         (SELECT c.oid FROM pg_catalog.pg_class c WHERE c.relnamespace = v_realtime AND c.relname = 'messages')
    INTO v_fn_owner, v_inserter, v_messages
  FROM pg_catalog.pg_proc f, pg_catalog.pg_proc s
  WHERE f.oid = 'public.dispara_broadcast_change()'::regprocedure AND s.oid = v_send::oid;

  IF NOT (has_schema_privilege(v_fn_owner, v_realtime, 'USAGE') AND has_function_privilege(v_fn_owner, v_send::oid, 'EXECUTE')) THEN
    RAISE WARNING 'security_hardening: % (dono de dispara_broadcast_change) sem USAGE no schema realtime ou sem EXECUTE em realtime.send — as triggers não publicam nada e o realtime do dashboard fica só no polling. Corrija com GRANT USAGE ON SCHEMA realtime TO %; GRANT EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) TO % (não precisa reaplicar esta migration).',
      v_fn_owner::regrole, v_fn_owner::regrole, v_fn_owner::regrole;
  ELSIF v_messages IS NULL
     OR NOT (has_schema_privilege(v_inserter, v_realtime, 'USAGE') AND has_table_privilege(v_inserter, v_messages, 'INSERT')) THEN
    RAISE WARNING 'security_hardening: % sem INSERT em realtime.messages — realtime.send engole o erro (WARNING WarnSendingBroadcastMessage a cada escrita) e o realtime do dashboard morre em silêncio (fica só no polling). Corrija com GRANT INSERT ON realtime.messages TO % (não precisa reaplicar esta migration).',
      v_inserter::regrole, v_inserter::regrole;
  ELSIF EXISTS (
    -- RLS ligado em realtime.messages (o Supabase liga, para os canais privados) e nada que
    -- libere o INSERT de quem insere: superusuário/BYPASSRLS, dono da tabela (sem FORCE) ou
    -- uma policy PERMISSIVE de INSERT (ou ALL) para ele, PUBLIC ou um role de que ele herda.
    SELECT 1
    FROM pg_catalog.pg_class c, pg_catalog.pg_roles a
    WHERE c.oid = v_messages AND a.oid = v_inserter
      AND c.relrowsecurity
      AND NOT a.rolsuper AND NOT a.rolbypassrls
      AND NOT (pg_has_role(v_inserter, c.relowner, 'USAGE') AND NOT c.relforcerowsecurity)
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy pol
        WHERE pol.polrelid = c.oid AND pol.polcmd IN ('a', '*') AND pol.polpermissive
          AND (0::oid = ANY (pol.polroles)
               OR EXISTS (SELECT 1 FROM unnest(pol.polroles) AS pr(role) WHERE pr.role <> 0 AND pg_has_role(v_inserter, pr.role, 'USAGE')))
      )
  ) THEN
    RAISE WARNING 'security_hardening: realtime.messages tem RLS ligado e % não tem BYPASSRLS nem policy de INSERT — realtime.send engole o erro (WARNING WarnSendingBroadcastMessage a cada escrita) e o realtime do dashboard morre em silêncio (fica só no polling). Corrija com CREATE POLICY dispara_broadcast_insert ON realtime.messages FOR INSERT TO % WITH CHECK (topic = ''dispara-db'') (não precisa reaplicar esta migration).',
      v_inserter::regrole, v_inserter::regrole;
  END IF;

  -- pg_get_triggerdef qualifica o nome da função conforme o search_path: as marcas abaixo
  -- são calculadas (e as triggers criadas) com um search_path canônico — só pg_catalog — e
  -- o do chamador volta no fim do bloco.
  v_search_path := current_setting('search_path');
  PERFORM set_config('search_path', 'pg_catalog', true);

  FOR r IN
    SELECT t.table_name, t.trigger_name, t.definition
    FROM (VALUES
      -- Volume baixo: por linha, em INSERT/UPDATE/DELETE.
      ('account_alerts', 'dispara_realtime_broadcast',
        $d$AFTER INSERT OR UPDATE OR DELETE ON public.account_alerts
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('template_projects', 'dispara_realtime_broadcast',
        $d$AFTER INSERT OR UPDATE OR DELETE ON public.template_projects
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),

      -- templates / flows / template_project_items: INSERT/DELETE sempre; UPDATE só quando
      -- muda coluna que a UI mostra (lista/detalhe refazem o fetch pela API). Ficam de fora
      -- só as colunas de controle que mudam sem mudança visível:
      --   templates: updated_at, fetched_at e spec_hash (o sync da Meta regrava todos a cada
      --     GET /api/templates e o disparo faz refresh do template), created_at e
      --     header_media_preview_* (URL assinada do preview, regravada pelo disparo);
      --   flows: updated_at e meta_last_checked_at (a cada salvar/checar na Meta);
      --   template_project_items: updated_at e created_at (o sync de projetos regrava
      --     meta_id/meta_status iguais em todos os itens).
      -- `(OLD.a, OLD.b) IS DISTINCT FROM (NEW.a, NEW.b)` vira um OR coluna a coluna (com
      -- curto-circuito): as jsonb ficam por último e só são comparadas quando o resto é igual.
      -- Coluna nova que a UI mostra entra no WHEN (lib/security-hardening-migration.test.ts
      -- falha enquanto a coluna não for classificada).
      ('templates', 'dispara_realtime_broadcast',
        $d$AFTER INSERT OR DELETE ON public.templates
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('templates', 'dispara_realtime_broadcast_update',
        $d$AFTER UPDATE ON public.templates
          FOR EACH ROW
          WHEN (
            (OLD.name, OLD.status, OLD.category, OLD.language, OLD.parameter_format, OLD.components)
            IS DISTINCT FROM
            (NEW.name, NEW.status, NEW.category, NEW.language, NEW.parameter_format, NEW.components)
          )
          EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('flows', 'dispara_realtime_broadcast',
        $d$AFTER INSERT OR DELETE ON public.flows
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('flows', 'dispara_realtime_broadcast_update',
        $d$AFTER UPDATE ON public.flows
          FOR EACH ROW
          WHEN (
            (OLD.name, OLD.status, OLD.meta_flow_id, OLD.meta_status, OLD.meta_preview_url,
             OLD.meta_published_at, OLD.template_key, OLD.flow_version,
             OLD.meta_validation_errors, OLD.mapping, OLD.spec, OLD.flow_json)
            IS DISTINCT FROM
            (NEW.name, NEW.status, NEW.meta_flow_id, NEW.meta_status, NEW.meta_preview_url,
             NEW.meta_published_at, NEW.template_key, NEW.flow_version,
             NEW.meta_validation_errors, NEW.mapping, NEW.spec, NEW.flow_json)
          )
          EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('template_project_items', 'dispara_realtime_broadcast',
        $d$AFTER INSERT OR DELETE ON public.template_project_items
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('template_project_items', 'dispara_realtime_broadcast_update',
        $d$AFTER UPDATE ON public.template_project_items
          FOR EACH ROW
          WHEN (
            (OLD.project_id, OLD.name, OLD.status, OLD.meta_status, OLD.meta_id, OLD.rejected_reason,
             OLD.submitted_at, OLD.category, OLD.language, OLD.content,
             OLD.header, OLD.footer, OLD.buttons, OLD.variables, OLD.sample_variables,
             OLD.marketing_variables, OLD.components)
            IS DISTINCT FROM
            (NEW.project_id, NEW.name, NEW.status, NEW.meta_status, NEW.meta_id, NEW.rejected_reason,
             NEW.submitted_at, NEW.category, NEW.language, NEW.content,
             NEW.header, NEW.footer, NEW.buttons, NEW.variables, NEW.sample_variables,
             NEW.marketing_variables, NEW.components)
          )
          EXECUTE FUNCTION public.dispara_broadcast_change()$d$),

      -- campaigns: increment_campaign_stat faz 1 UPDATE por delivered/read/failed de cada
      -- contato, e o dreno faz try_lock/release_campaign_dispatch_lock (só dispatch_lock_*).
      -- INSERT/DELETE publicam sempre. UPDATE só publica quando:
      --   (a) muda status, completed_at, cancelled_at ou folder_id (nunca pode se perder); ou
      --   (b) muda algo que a UI mostra (contadores, agenda, nome...) E é o primeiro UPDATE
      --       da campanha nesta janela fixa de 2s (OLD.updated_at, gravado pelo BEFORE
      --       trigger set_updated_at, caiu em outra janela). Sob fluxo contínuo de webhooks
      --       isso dá no máximo 1 evento a cada 2s por campanha.
      -- Não existe "último evento" da janela: o que cair depois do primeiro fica para o
      -- polling condicional da lista (useCampaignsQuery: refetchInterval enquanto houver
      -- campanha enviando ou com envio recente), o polling de 30s do dashboard e, no
      -- detalhe, messageStats + broadcast campaign_progress.
      -- UPDATE que só mexe em dispatch_lock_* (e updated_at) não entra em nenhum dos dois.
      ('campaigns', 'dispara_realtime_broadcast',
        $d$AFTER INSERT OR DELETE ON public.campaigns
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('campaigns', 'dispara_realtime_broadcast_update',
        $d$AFTER UPDATE ON public.campaigns
          FOR EACH ROW
          WHEN (
            OLD.status IS DISTINCT FROM NEW.status
            OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
            OR OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at
            OR OLD.folder_id IS DISTINCT FROM NEW.folder_id
            OR (
              (OLD.sent, OLD.delivered, OLD.read, OLD.failed, OLD.skipped, OLD.total_recipients,
               OLD.auto_reply_sent_count, OLD.quick_reply_match_count, OLD.fallback_sent_count,
               OLD.scheduled_date, OLD.started_at, OLD.name, OLD.flow_id, OLD.ab_test_enabled)
              IS DISTINCT FROM
              (NEW.sent, NEW.delivered, NEW.read, NEW.failed, NEW.skipped, NEW.total_recipients,
               NEW.auto_reply_sent_count, NEW.quick_reply_match_count, NEW.fallback_sent_count,
               NEW.scheduled_date, NEW.started_at, NEW.name, NEW.flow_id, NEW.ab_test_enabled)
              AND (
                OLD.updated_at IS NULL
                OR floor(extract(epoch FROM OLD.updated_at) / 2) <> floor(extract(epoch FROM now()) / 2)
              )
            )
          )
          EXECUTE FUNCTION public.dispara_broadcast_change()$d$),

      -- inbox_messages: a cópia do template de campanha (syncCampaignTemplateToInbox, 1 por
      -- contato, payload.type = 'campaign_template' — payload pequeno, fica inline) não
      -- publica. UPDATE só quando o status de entrega MUDA (o webhook repete sent/delivered/
      -- read). DELETE por STATEMENT: apagar uma conversa apaga as N mensagens em cascata, e
      -- um evento por linha seriam N INSERTs em realtime.messages dentro do DELETE.
      ('inbox_messages', 'dispara_realtime_broadcast',
        $d$AFTER INSERT ON public.inbox_messages
          FOR EACH ROW
          WHEN ((NEW.payload ->> 'type') IS DISTINCT FROM 'campaign_template')
          EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('inbox_messages', 'dispara_realtime_broadcast_update',
        $d$AFTER UPDATE ON public.inbox_messages
          FOR EACH ROW
          WHEN (
            OLD.delivery_status IS DISTINCT FROM NEW.delivery_status
            AND (NEW.payload ->> 'type') IS DISTINCT FROM 'campaign_template'
          )
          EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('inbox_messages', 'dispara_realtime_broadcast_delete',
        $d$AFTER DELETE ON public.inbox_messages
          FOR EACH STATEMENT EXECUTE FUNCTION public.dispara_broadcast_change()$d$),

      -- inbox_conversations: sem INSERT (a conversa criada pela campanha não publica; as
      -- demais aparecem pelo INSERT da primeira mensagem). UPDATE só quando muda o estado
      -- do atendimento: increment_conversation_counters de saída (total_messages,
      -- last_message_*) e o SET NULL de contact_id do bulk_delete_contacts não publicam.
      -- Mensagem recebida muda unread_count (publica).
      ('inbox_conversations', 'dispara_realtime_broadcast',
        $d$AFTER DELETE ON public.inbox_conversations
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),
      ('inbox_conversations', 'dispara_realtime_broadcast_update',
        $d$AFTER UPDATE ON public.inbox_conversations
          FOR EACH ROW
          WHEN (
            (OLD.status, OLD.mode, OLD.priority, OLD.unread_count, OLD.ai_agent_id,
             OLD.automation_paused_until, OLD.human_mode_expires_at)
            IS DISTINCT FROM
            (NEW.status, NEW.mode, NEW.priority, NEW.unread_count, NEW.ai_agent_id,
             NEW.automation_paused_until, NEW.human_mode_expires_at)
          )
          EXECUTE FUNCTION public.dispara_broadcast_change()$d$),

      -- flow_submissions: o frontend só usa INSERT (CampaignFlowPanel). UPDATE/DELETE em
      -- massa (ON DELETE SET NULL de contact_id no bulk_delete_contacts) não publicam.
      ('flow_submissions', 'dispara_realtime_broadcast',
        $d$AFTER INSERT ON public.flow_submissions
          FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()$d$),

      -- contacts: import/bulk update mexe em milhares de linhas por statement.
      -- Um evento por statement basta (o frontend só invalida a lista/estatísticas).
      ('contacts', 'dispara_realtime_broadcast',
        $d$AFTER INSERT OR UPDATE OR DELETE ON public.contacts
          FOR EACH STATEMENT EXECUTE FUNCTION public.dispara_broadcast_change()$d$)
    ) AS t(table_name, trigger_name, definition)
  LOOP
    IF to_regclass(format('public.%I', r.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    v_definition := regexp_replace(btrim(r.definition), '\s+', ' ', 'g');
    v_spec_md5 := md5(v_definition);

    -- Marca no COMMENT: 'dispara_broadcast:<md5 da definição deste arquivo>:<md5 do
    -- pg_get_triggerdef logo depois de criar>'. A 1ª parte diz que a trigger é a versão
    -- deste arquivo; a 2ª, que ninguém mexeu nela depois: CREATE OR REPLACE TRIGGER manual
    -- mantém OID e COMMENT, então só a 1ª parte não provaria nada. Divergiu qualquer uma
    -- (ou a trigger foi desabilitada), recria — o CREATE OR REPLACE também a reabilita.
    SELECT tg.oid, obj_description(tg.oid, 'pg_trigger'), tg.tgenabled
      INTO v_trigger, v_current, v_enabled
    FROM pg_trigger tg
    WHERE tg.tgrelid = to_regclass(format('public.%I', r.table_name))
      AND tg.tgname = r.trigger_name
      AND NOT tg.tgisinternal;

    -- Intacta, habilitada e com a definição deste arquivo: nenhum lock na tabela.
    IF v_trigger IS NOT NULL AND v_enabled IN ('O', 'A')
       AND v_current = 'dispara_broadcast:' || v_spec_md5 || ':' || md5(pg_get_triggerdef(v_trigger)) THEN
      CONTINUE;
    END IF;

    EXECUTE format('CREATE OR REPLACE TRIGGER %I %s', r.trigger_name, v_definition);
    SELECT 'dispara_broadcast:' || v_spec_md5 || ':' || md5(pg_get_triggerdef(tg.oid)) INTO v_marker
    FROM pg_trigger tg
    WHERE tg.tgrelid = to_regclass(format('public.%I', r.table_name))
      AND tg.tgname = r.trigger_name
      AND NOT tg.tgisinternal;
    EXECUTE format('COMMENT ON TRIGGER %I ON public.%I IS %L', r.trigger_name, r.table_name, v_marker);
  END LOOP;

  PERFORM set_config('search_path', v_search_path, true);
END $$;

-- postgres_changes não é mais usado: tira as tabelas de public da publicação do Realtime
-- (evita decodificar WAL à toa, inclusive de campaign_contacts, e fecha o caminho caso
-- algum grant a anon volte no futuro).
DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND NOT puballtables
  ) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', r.schemaname, r.tablename);
    -- Só "já não está/não existe" e falta de permissão são pulados. lock_timeout
    -- (lock_not_available), deadlock e o resto abortam a migration inteira.
    EXCEPTION WHEN undefined_object OR undefined_table OR insufficient_privilege THEN
      RAISE WARNING 'security_hardening: não foi possível tirar %.% da publicação (%)', r.schemaname, r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 5) Funções: EXECUTE só para service_role (cobre também a função acima)
-- -----------------------------------------------------------------------------
-- Inventário (grep em todas as migrations) de funções de public SEM REVOKE próprio até aqui:
--   claim_campaign_batch, reap_stuck_campaign_sending, try_lock_campaign_dispatch,
--   release_campaign_dispatch_lock (20260705000600_campaign_queue — SECURITY DEFINER),
--   dispara_cron_tick (20260705000100_cron_infra — SECURITY DEFINER, lê o Vault),
--   increment_campaign_auto_reply_counters (20260422000000 — SECURITY DEFINER sem search_path),
--   dispara_broadcast_change (esta migration).
-- As demais (init, 20260225*, 20260430*) já tinham REVOKE explícito; o REVOKE geral cobre todas.
-- Triggers não checam EXECUTE ao disparar; pg_cron roda dispara_cron_tick como o dono.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Desfaz o GRANT por schema que o Supabase dá a anon/authenticated em funções futuras.
-- ATENÇÃO: o EXECUTE a PUBLIC é um default GLOBAL do Postgres e NÃO pode ser revogado
-- por schema (a parte "FROM PUBLIC" abaixo não tem efeito). Toda função nova em public
-- precisa de `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` explícito
-- na própria migration (lib/security-hardening-migration.test.ts verifica isso).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;


-- -----------------------------------------------------------------------------
-- 6) Policies de leitura anônima (por último)
-- -----------------------------------------------------------------------------
-- DROP POLICY pega ACCESS EXCLUSIVE na tabela quando a policy existe (1ª aplicação) e
-- segura até o COMMIT: no fim do arquivo, as 7 tabelas quentes ficam travadas por
-- milissegundos, não durante a migration inteira (nem durante as esperas de até 5s das
-- seções anteriores). Já sem a policy (re-execução), o IF EXISTS só pega ACCESS SHARE,
-- que não bloqueia leitura nem escrita. O acesso de anon já foi fechado pelo REVOKE da
-- seção 1 — mesmo quem aplicar fora de uma transação não fica com a janela aberta.
DROP POLICY IF EXISTS "anon_select_campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "anon_select_contacts" ON public.contacts;
DROP POLICY IF EXISTS "anon_select_templates" ON public.templates;
DROP POLICY IF EXISTS "anon_select_flows" ON public.flows;
DROP POLICY IF EXISTS "anon_select_inbox_conversations" ON public.inbox_conversations;
DROP POLICY IF EXISTS "anon_select_inbox_messages" ON public.inbox_messages;
DROP POLICY IF EXISTS "anon_select_account_alerts" ON public.account_alerts;
