#!/usr/bin/env node
/**
 * Harness das migrations do Supabase num Postgres 17 REAL (PGlite = Postgres compilado para
 * WebAssembly, roda dentro do Node — sem Docker, sem instalar nada) + verificação SOMENTE
 * LEITURA do estado de segurança de um banco que já existe.
 *
 * USO
 *   npm run db:check
 *     Todos os cenários abaixo num PGlite. É o passo do CI.
 *
 *   DB_CHECK_URL='postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=<ca>.crt' \
 *     npm run db:check -- --verify-only
 *     Banco REAL (produção/staging), SOMENTE LEITURA: tudo roda numa única transação
 *     BEGIN READ ONLY … ROLLBACK (lock_timeout 2s, statement_timeout 30s) e as sondagens
 *     "como anon" usam SET LOCAL ROLE dentro de um SAVEPOINT desfeito com ROLLBACK TO. Nada
 *     é escrito e nenhuma migration é aplicada. Confere: privilégios de anon/authenticated
 *     (tabelas, views, sequences, funções), RLS, policies, search_path das SECURITY DEFINER,
 *     publicação supabase_realtime, a premissa do realtime.send, se o dono de
 *     dispara_broadcast_change consegue chamar o send (USAGE + EXECUTE) e GRAVAR em
 *     realtime.messages (INSERT + RLS: BYPASSRLS, dono ou policy de INSERT — senão o send
 *     engole o erro e o realtime morre em silêncio), o snapshot EXATO das triggers de
 *     broadcast, se elas e dispara_broadcast_change estão na versão deste repositório e se
 *     alguma trigger foi alterada à mão depois da migration (md5 do pg_get_triggerdef ×
 *     o registrado no COMMENT na criação), grants de service_role, default privileges
 *     (objetos futuros) e o job do pg_cron (inclusive EXECUTE de cron.job.username em
 *     dispara_cron_tick()). Imprime um relatório e sai com código 1 se algo falhar.
 *     - Connection string do Supabase (configurações de Database do projeto), role postgres,
 *       senha URL-encoded. Conexão direta ou pooler (até o transaction pooler serve: é uma
 *       transação só).
 *     - TLS: o certificado do Supabase é de CA própria; baixe-o nas configurações de
 *       Database (SSL) e aponte `sslrootcert`. O `pg` trata `sslmode=require` como
 *       verify-full; sem o certificado, `sslmode=no-verify` cifra mas não confere o servidor.
 *     - É o jeito de conferir um banco em que o installer PULOU as migrations (ele pula
 *       quando `settings` já existe) ou em que a migration de hardening foi aplicada à mão.
 *
 *   npm run db:check -- --verify-only            (sem DB_CHECK_URL)
 *     O mesmo relatório contra um PGlite com todas as migrations (autoteste rápido).
 *
 *   Também é importável: lib/realtime-db-change.contract.test.ts usa as funções exportadas
 *   (main() só roda quando este arquivo é executado direto).
 *
 * O que é simulado do Supabase (o PGlite é Postgres puro):
 *  - roles anon / authenticated / service_role (BYPASSRLS) e um dono NÃO-superusuário
 *    (`supabase_owner`) fazendo o papel do `postgres` do Supabase — as migrations rodam
 *    com ele, então erros de permissão aparecem como apareceriam no Supabase;
 *  - os default privileges do Supabase (tudo que o dono cria em `public` nasce com
 *    GRANT para o próprio dono, anon, authenticated e service_role) — é isso que torna o
 *    REVOKE relevante;
 *  - schemas `extensions` (vector, uuid-ossp), `realtime`, `vault`, `cron` e `net` (stubs).
 *    O `realtime` é o do Supabase: messages particionada por dia em inserted_at, com RLS
 *    ligado e a janela de partições (ontem … +3 dias) que o servidor Realtime cria quando um
 *    cliente conecta; send com o corpo EXATO do Supabase atual (copiado de um projeto real
 *    em 2026-10: põe `id` no payload e avisa WarnSendingBroadcastMessage). O cron.schedule é
 *    SECURITY INVOKER e grava current_user em cron.job.username, como o pg_cron (o job roda
 *    como esse usuário);
 *  - a publicação `supabase_realtime`.
 *  Conferido contra o projeto de produção (2026-10-12, só leitura): schema de public
 *  (colunas, funções com corpo, triggers, índices), donos, ACLs, RLS, policies e
 *  publicação idênticos ao que as migrations produzem aqui; default privileges iguais.
 *
 * Cenários (npm run db:check):
 *  0. estáticos: RPCs chamadas pelo código × SERVER_RPCS (com aviso para .rpc() de nome não
 *     literal); snapshot das triggers deste arquivo × definições da migration; critério do
 *     realtime.send deste arquivo = o da migration;
 *  1. instalação nova: todas as migrations em ordem, cada arquivo numa única chamada
 *     (transação implícita), igual a lib/installer/migrations.ts — mas sem engolir erro
 *     nem WARNING; depois o relatório do --verify-only (somente leitura);
 *  2. upgrade: banco no estado de produção (todas menos a de hardening) + dados → aplica
 *     a migration de hardening → confere dados e garantias. Controle do --verify-only: ele
 *     aponta o vazamento ANTES e passa inteiro DEPOIS, sem consumir XID;
 *  3. idempotência e drift: reaplica a migration de hardening com outro search_path (não
 *     pode falhar nem recriar triggers: mesmo OID E mesmo xmin em pg_trigger); trigger
 *     alterada à mão (CREATE OR REPLACE TRIGGER com outro WHEN, que mantém OID e COMMENT)
 *     ou desabilitada → o --verify-only aponta e reaplicar conserta só ela;
 *  4. realtime e resiliência: snapshot exato das triggers; matriz INSERT/UPDATE/DELETE por
 *     tabela (Δ de eventos, chaves exatas de new/old, PII semeada em toda coluna texto/jsonb
 *     fora da whitelist); RPCs reais como service_role; throttle de campaigns determinístico
 *     (incrementos na mesma transação, janela envelhecida em vez de esperar o relógio);
 *     disparo simulado de 50 contatos pela sequência real do app (realtime.messages cresce
 *     O(1), não O(contatos)); qualquer WARNING de dispara_broadcast_change ou
 *     Warn/ErrorSendingBroadcastMessage numa escrita FALHA o check (com controle positivo);
 *     escrita nunca falha se o realtime quebrar (inclusive sem USAGE no schema realtime);
 *     objetos futuros; pg_cron;
 *  5. realtime indisponível na instalação: bootstrap sem realtime.send, ou com um send sem
 *     o próprio EXCEPTION WHEN OTHERS → a migration aplica, avisa (WARNING) e não cria
 *     triggers; criar o send depois e reaplicar SÓ a hardening cria; sends trocados depois
 *     (sem handler, handler que relança com RAISE;, RAISE sem nível, só WHEN
 *     unique_violation, handler só em comentário/literal) são recusados pela guarda e não
 *     derrubam escrita; o send do Supabase com "raise" em comentário/literal é aceito;
 *  6. --verify-only pelo protocolo de rede: o cliente `pg` (o mesmo do modo real) contra o
 *     PGlite servido num socket local, com controle negativo;
 *  7. dono sem permissão de gravar em realtime.messages (INSERT revogado; RLS sem BYPASSRLS
 *     nem policy) ou sem USAGE no schema realtime: a escrita segue sem publicar, a migration
 *     avisa, o --verify-only aponta com o GRANT/policy que falta, e corrigir o privilégio
 *     volta a publicar sem reaplicar;
 *  8. realtime.messages sem partição para hoje (janela vencida: ninguém conectou ao Realtime
 *     há dias — o estado da produção em 2026-10-12): a escrita segue sem publicar, o
 *     --verify-only informa (sem falhar: é benigno) e, quando um cliente conecta e o
 *     Realtime recria a janela, volta a publicar sem reaplicar nada.
 *
 * Sai com código 1 se qualquer verificação falhar.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// DB_CHECK_MIGRATIONS_DIR permite testar uma cópia (ex.: testes de mutação do próprio harness)
const MIGRATIONS_DIR = process.env.DB_CHECK_MIGRATIONS_DIR || join(ROOT, 'supabase', 'migrations')
export const HARDENING = '20261011000000_security_hardening.sql'
export const OWNER = 'supabase_owner'

// RPCs que o código servidor chama com .rpc() (service_role). Mantido em sincronia por
// verifyRpcList(), que falha se o código passar a chamar uma RPC fora desta lista.
const SERVER_RPCS = [
  'analyze_table', 'bulk_delete_contacts', 'bulk_update_contact_tags', 'claim_campaign_batch', 'get_campaigns_with_all_tags',
  'get_ab_variant_metrics', 'get_agent_config', 'get_campaign_contact_stats', 'get_contact_stats',
  'get_contact_tag_counts', 'get_contact_tags', 'get_db_size', 'increment_campaign_auto_reply_counters',
  'increment_campaign_stat', 'increment_conversation_counters', 'process_inbound_message',
  'reap_stuck_campaign_sending', 'release_campaign_dispatch_lock', 'reset_unread_count',
  'search_embeddings', 'try_lock_campaign_dispatch',
]
// RPCs chamadas pelo código mas que (sabidamente) não existem no schema — o código tem fallback.
const KNOWN_MISSING_RPCS = new Set(['get_ab_variant_metrics', 'get_db_size'])

// ---------------------------------------------------------------------------
// Contrato do realtime (Broadcast from Database): o que cada tabela pode publicar
// ---------------------------------------------------------------------------

/**
 * Snapshot EXATO das triggers de broadcast (tabela.nome: momento eventos nível [WHEN]).
 * Qualquer trigger a mais, a menos ou diferente — inclusive em campaign_contacts — falha.
 * Mudou a migration? Atualize aqui (verifyTriggerSnapshotMatchesMigration compara os dois).
 */
export const EXPECTED_BROADCAST_TRIGGERS = [
  'account_alerts.dispara_realtime_broadcast: AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
  'campaigns.dispara_realtime_broadcast: AFTER INSERT OR DELETE FOR EACH ROW',
  'campaigns.dispara_realtime_broadcast_update: AFTER UPDATE FOR EACH ROW WHEN',
  'contacts.dispara_realtime_broadcast: AFTER INSERT OR UPDATE OR DELETE FOR EACH STATEMENT',
  'flow_submissions.dispara_realtime_broadcast: AFTER INSERT FOR EACH ROW',
  'flows.dispara_realtime_broadcast: AFTER INSERT OR DELETE FOR EACH ROW',
  'flows.dispara_realtime_broadcast_update: AFTER UPDATE FOR EACH ROW WHEN',
  'inbox_conversations.dispara_realtime_broadcast: AFTER DELETE FOR EACH ROW',
  'inbox_conversations.dispara_realtime_broadcast_update: AFTER UPDATE FOR EACH ROW WHEN',
  'inbox_messages.dispara_realtime_broadcast: AFTER INSERT FOR EACH ROW WHEN',
  'inbox_messages.dispara_realtime_broadcast_delete: AFTER DELETE FOR EACH STATEMENT',
  'inbox_messages.dispara_realtime_broadcast_update: AFTER UPDATE FOR EACH ROW WHEN',
  'template_project_items.dispara_realtime_broadcast: AFTER INSERT OR DELETE FOR EACH ROW',
  'template_project_items.dispara_realtime_broadcast_update: AFTER UPDATE FOR EACH ROW WHEN',
  'template_projects.dispara_realtime_broadcast: AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW',
  'templates.dispara_realtime_broadcast: AFTER INSERT OR DELETE FOR EACH ROW',
  'templates.dispara_realtime_broadcast_update: AFTER UPDATE FOR EACH ROW WHEN',
]

/**
 * Whitelist EXATA das chaves de `new` e `old` por tabela (projeção de
 * dispara_broadcast_change). Coluna a mais ou a menos no payload falha o check.
 */
export const BROADCAST_PAYLOAD_KEYS = {
  campaigns: {
    new: ['id', 'status', 'total_recipients', 'sent', 'delivered', 'read', 'failed', 'skipped',
      'auto_reply_sent_count', 'quick_reply_match_count', 'fallback_sent_count', 'folder_id', 'flow_id',
      'ab_test_enabled', 'scheduled_date', 'started_at', 'first_dispatch_at', 'last_sent_at', 'completed_at',
      'cancelled_at', 'created_at', 'updated_at'],
    old: ['id', 'status', 'completed_at'],
  },
  templates: {
    new: ['id', 'status', 'category', 'language', 'parameter_format', 'fetched_at', 'created_at', 'updated_at'],
    old: ['id'],
  },
  flows: {
    new: ['id', 'status', 'meta_status', 'meta_flow_id', 'meta_last_checked_at', 'meta_published_at', 'created_at', 'updated_at'],
    old: ['id'],
  },
  inbox_conversations: {
    new: ['id', 'contact_id', 'ai_agent_id', 'status', 'mode', 'priority', 'unread_count', 'total_messages',
      'last_message_at', 'automation_paused_until', 'human_mode_expires_at', 'created_at', 'updated_at'],
    old: ['id'],
  },
  inbox_messages: {
    new: ['id', 'conversation_id', 'direction', 'message_type', 'source_type', 'delivery_status', 'created_at',
      'delivered_at', 'read_at', 'failed_at'],
    old: ['id', 'conversation_id'],
  },
  account_alerts: { new: ['id', 'type', 'code', 'dismissed', 'created_at'], old: ['id'] },
  template_projects: { new: ['id', 'status', 'template_count', 'approved_count', 'created_at', 'updated_at'], old: ['id'] },
  template_project_items: {
    new: ['id', 'project_id', 'status', 'meta_status', 'category', 'language', 'submitted_at', 'created_at', 'updated_at'],
    old: ['id', 'project_id'],
  },
  flow_submissions: { new: ['id', 'campaign_id', 'flow_id', 'flow_local_id', 'created_at'], old: ['id', 'campaign_id'] },
  // trigger por STATEMENT: new = old = null
  contacts: { new: [], old: [] },
}

/** Eventos de trigger por STATEMENT (new/old nulos). */
const STATEMENT_LEVEL_EVENTS = { contacts: ['INSERT', 'UPDATE', 'DELETE'], inbox_messages: ['DELETE'] }

const PII_KEYS = ['phone', 'name', 'email', 'content', 'body', 'custom_fields', 'text', 'message', 'contact_name', 'last_message_preview']
export const PII_VALUES = ['5511987654321', 'Maria Teste', 'maria@teste.com', 'mensagem secreta do cliente']
const PII_SQL = `'Maria Teste <maria@teste.com> +5511987654321: mensagem secreta do cliente'`
const PII_JSONB_SQL = `jsonb_build_object('nome', 'Maria Teste', 'telefone', '5511987654321', 'email', 'maria@teste.com', 'texto', 'mensagem secreta do cliente')`

// Aviso do realtime.send quando o INSERT em realtime.messages falha: WarnSendingBroadcastMessage
// no Supabase atual, ErrorSendingBroadcastMessage em versões anteriores
const SEND_WARNING_RE = /(?:Warn|Error)SendingBroadcastMessage/
const BROADCAST_WARNING_RE = /dispara_broadcast_change|(?:Warn|Error)SendingBroadcastMessage/

/**
 * Critério da migration para realtime.send (guarda de dispara_broadcast_change e bloco das
 * triggers), como regex do Postgres (ARE). verifySendGuardMatchesMigration confere que a
 * migration usa exatamente estes três literais, nos dois lugares.
 *  - SEND_SOURCE_STRIP_RE tira literais '...' (com '' dentro), comentários -- e /* *\/ do
 *    fonte, num passe da esquerda para a direita (um '--' dentro de literal é literal);
 *  - SEND_HANDLER_RE: o fonte tem EXCEPTION WHEN OTHERS THEN;
 *  - SEND_THROWS_RE: nenhum comando que lance erro — RAISE sem nível (= EXCEPTION), RAISE
 *    EXCEPTION/SQLSTATE/condição/USING, RAISE; (relança) e ASSERT. Só RAISE DEBUG/LOG/INFO/
 *    NOTICE/WARNING passam.
 */
export const SEND_SOURCE_STRIP_RE = String.raw`'(?:[^']|'')*'|-{2}[^\n]*|/\*(?:[^*]|\*+[^/*])*\*+/`
export const SEND_HANDLER_RE = String.raw`\mexception\s+when\s+others\s+then\M`
export const SEND_THROWS_RE = String.raw`\m(?:assert|raise(?!\s+(?:debug|log|info|notice|warning)\M))\M`

/** CREATE OR REPLACE de realtime.send com o corpo dado (mesma assinatura do Supabase). */
function realtimeSendSql(body, declare = '') {
  return `
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $fn$
${declare ? `DECLARE\n${declare}\n` : ''}BEGIN
${body}
END;
$fn$`
}

const SEND_INSERT = `INSERT INTO realtime.messages (payload, event, topic, private, extension)
    VALUES (payload, event, topic, private, 'broadcast');`

// realtime.send do Supabase ATUAL, com o corpo exato de um projeto real (2026-10; md5 do
// prosrc lá: c12384e30dda994bf2e0d23daeaea20b): põe `id` no payload quando ele não tem, e o
// INSERT em realtime.messages fica num bloco EXCEPTION WHEN OTHERS próprio que só avisa
// (WarnSendingBroadcastMessage) — a migration de hardening exige esse bloco para criar as
// triggers.
const REALTIME_SEND_SQL = realtimeSendSql(`  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;`, `  generated_id uuid;
  final_payload jsonb;`)

// Versão anterior do send do Supabase (sem id no payload; avisa ErrorSendingBroadcastMessage)
const REALTIME_SEND_PREVIOUS_SQL = realtimeSendSql(`
  BEGIN
    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    ${SEND_INSERT}
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;`)

// Variante hipotética sem tratamento de erro: uma falha no INSERT propaga para quem chamou.
const REALTIME_SEND_UNSAFE_SQL = realtimeSendSql(`  ${SEND_INSERT}`)

/**
 * Variantes de realtime.send para a guarda (cenário 5): `safe` = a guarda deve aceitar (o
 * send nunca propaga a falha do INSERT); as demais propagam e a guarda deve recusar.
 */
const REALTIME_SEND_VARIANTS = [
  { key: 'sem handler', safe: false, sql: REALTIME_SEND_UNSAFE_SQL },
  {
    key: 'handler WHEN OTHERS que relança (RAISE;)', safe: false,
    sql: realtimeSendSql(`  BEGIN
    ${SEND_INSERT}
  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;`),
  },
  {
    key: 'handler WHEN OTHERS com RAISE sem nível (= EXCEPTION)', safe: false,
    sql: realtimeSendSql(`  BEGIN
    ${SEND_INSERT}
  EXCEPTION WHEN OTHERS THEN
    RAISE 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;`),
  },
  {
    key: 'handler só WHEN unique_violation', safe: false,
    sql: realtimeSendSql(`  BEGIN
    ${SEND_INSERT}
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;`),
  },
  {
    key: 'EXCEPTION WHEN OTHERS THEN só em comentário e literal', safe: false,
    sql: realtimeSendSql(`  -- antes: BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING ...; END;
  /* EXCEPTION WHEN OTHERS THEN
     RAISE WARNING */
  PERFORM 'EXCEPTION WHEN OTHERS THEN RAISE WARNING';
  ${SEND_INSERT}`),
  },
  { key: 'do Supabase, versão anterior (ErrorSendingBroadcastMessage, sem id no payload)', safe: true, sql: REALTIME_SEND_PREVIOUS_SQL },
  {
    key: 'do Supabase com "raise" em comentário e literal', safe: true,
    sql: realtimeSendSql(`  BEGIN
    -- nunca RAISE; aqui: um RAISE EXCEPTION derrubaria a escrita de quem chamou
    /* raise exception */
    ${SEND_INSERT}
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'ErrorSendingBroadcastMessage (não raise; -- só avisa): %', SQLERRM;
  END;`),
  },
]

/** md5 do prosrc de realtime.send no projeto real de onde REALTIME_SEND_SQL foi copiado. */
const SUPABASE_SEND_PROSRC_MD5 = 'c12384e30dda994bf2e0d23daeaea20b'

/**
 * A janela de partições de realtime.messages que o servidor Realtime cria quando um cliente
 * conecta (e o janitor renova enquanto houver conexões): ontem, hoje e os 3 dias seguintes.
 * Idempotente. O nome segue o do Supabase (messages_AAAA_MM_DD).
 */
const REALTIME_PARTITION_WINDOW_SQL = `
DO $window$
DECLARE d date;
BEGIN
  FOR i IN -1..3 LOOP
    d := localtimestamp::date + i;
    EXECUTE format('CREATE TABLE IF NOT EXISTS realtime.%I PARTITION OF realtime.messages FOR VALUES FROM (%L) TO (%L)',
                   'messages_' || to_char(d, 'YYYY_MM_DD'), d::timestamp, (d + 1)::timestamp);
  END LOOP;
END
$window$;`

// ---------------------------------------------------------------------------
// Bootstrap "Supabase" (roda como superusuário, antes das migrations)
// ---------------------------------------------------------------------------
function supabaseBootstrapSql({ realtimeSend = 'safe' } = {}) {
  const send = {
    safe: `${REALTIME_SEND_SQL};`,
    unsafe: `${REALTIME_SEND_UNSAFE_SQL};`,
    none: '-- sem realtime.send (projeto sem Broadcast from Database)',
  }[realtimeSend]
  if (send === undefined) throw new Error(`realtimeSend inválido: ${realtimeSend}`)
  return `
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE ${OWNER} LOGIN NOSUPERUSER CREATEROLE CREATEDB BYPASSRLS;
GRANT anon, authenticated, service_role TO ${OWNER};

ALTER SCHEMA public OWNER TO ${OWNER};
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA extensions;
CREATE EXTENSION vector WITH SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO ${OWNER}, anon, authenticated, service_role;

-- Default privileges do Supabase: objetos criados pelo dono em public nascem abertos
-- para as roles da API (é isso que a migration de hardening precisa desfazer). Como lá, o
-- próprio dono também é grantee explícito.
ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT ALL ON TABLES TO ${OWNER}, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT ALL ON SEQUENCES TO ${OWNER}, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${OWNER}, anon, authenticated, service_role;

-- realtime (Broadcast from Database), como no Supabase: particionada por dia
CREATE SCHEMA realtime;
GRANT USAGE ON SCHEMA realtime TO ${OWNER}, anon, authenticated, service_role;
CREATE TABLE realtime.messages (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp NOT NULL DEFAULT now(),
  inserted_at timestamp NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  binary_payload bytea,
  skip_broadcast boolean NOT NULL DEFAULT false,
  -- só do harness (não existe no Supabase): ordem de chegada dos eventos
  harness_seq bigserial,
  PRIMARY KEY (id, inserted_at)
) PARTITION BY RANGE (inserted_at);
${REALTIME_PARTITION_WINDOW_SQL}
GRANT SELECT, INSERT ON realtime.messages TO ${OWNER}, service_role;
GRANT USAGE ON SEQUENCE realtime.messages_harness_seq_seq TO ${OWNER}, service_role;
-- Como no Supabase (autorização dos canais privados): RLS ligado. O dono das migrations
-- grava pelo BYPASSRLS (o cenário 7 tira e confere o que acontece).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
${send}
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('realtime.topic', true), '')::text
$fn$;

-- vault (stub sem criptografia)
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  description text DEFAULT '',
  secret text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret, secret AS decrypted_secret, created_at, updated_at FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '')
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $fn$
  INSERT INTO vault.secrets (secret, name, description) VALUES (new_secret, new_name, new_description) RETURNING id
$fn$;
GRANT USAGE ON SCHEMA vault TO ${OWNER};
GRANT SELECT ON vault.secrets, vault.decrypted_secrets TO ${OWNER};

-- pg_cron (stub). Como no pg_cron: cron.schedule grava o usuário que agendou
-- (current_user) em cron.job.username, e o job roda como ESSE usuário. SECURITY INVOKER
-- de propósito: um stub SECURITY DEFINER gravaria o dono do stub, não quem agendou.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, schedule text NOT NULL, command text NOT NULL, jobname text UNIQUE, username text NOT NULL DEFAULT current_user, active boolean DEFAULT true);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
LANGUAGE sql SECURITY INVOKER AS $fn$
  INSERT INTO cron.job (jobname, schedule, command, username) VALUES (job_name, schedule, command, current_user)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command, username = EXCLUDED.username
  RETURNING jobid
$fn$;
GRANT USAGE ON SCHEMA cron TO ${OWNER};
GRANT SELECT, INSERT, UPDATE ON cron.job TO ${OWNER};
GRANT USAGE ON SEQUENCE cron.job_jobid_seq TO ${OWNER};

-- pg_net (stub: só enfileira)
CREATE SCHEMA net;
CREATE TABLE net.http_request_queue (id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb, timeout_milliseconds int, created timestamptz DEFAULT now());
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $fn$
  INSERT INTO net.http_request_queue (url, headers, body, timeout_milliseconds)
  VALUES (url, headers, body, timeout_milliseconds) RETURNING id
$fn$;
GRANT USAGE ON SCHEMA net TO ${OWNER};

CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime OWNER TO ${OWNER};

-- No Supabase pg_cron e pg_net já vêm instalados: registra no catálogo para que o
-- "create extension if not exists pg_cron/pg_net" das migrations seja no-op (como lá),
-- sem alterar o SQL testado. Os objetos de verdade são os stubs acima.
INSERT INTO pg_catalog.pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
SELECT 990001, 'pg_cron', 10, 'cron'::regnamespace, false, '1.6' WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');
INSERT INTO pg_catalog.pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
SELECT 990002, 'pg_net', 10, 'net'::regnamespace, false, '0.14' WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net');
`
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------
let reporter = { results: [], scenario: '', silent: false }

function check(name, ok, detail = '') {
  reporter.results.push({ scenario: reporter.scenario, name, ok: !!ok, detail })
  if (reporter.silent) return
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && detail ? `\n      ${detail}` : ''}`)
}

function info(message) {
  reporter.infos?.push(message)
  if (!reporter.silent) console.log(`  · ${message}`)
}

function scenario(title) {
  reporter.scenario = title
  if (!reporter.silent) console.log(`\n▶ ${title}`)
}

/**
 * Roda verificações sem imprimir e devolve os resultados (para controles do próprio harness).
 * `infos`, se passado, recebe as mensagens informativas emitidas.
 */
async function captureChecks(fn, infos) {
  const outer = reporter
  reporter = { results: [], scenario: outer.scenario, silent: true, infos }
  try {
    await fn()
    return reporter.results
  } finally {
    reporter = outer
  }
}

function printSummary() {
  const failed = reporter.results.filter((r) => !r.ok)
  console.log(`\n${reporter.results.length - failed.length}/${reporter.results.length} verificações passaram`)
  if (failed.length) {
    console.log('\nFALHAS:')
    for (const f of failed) console.log(` - [${f.scenario}] ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  }
  return failed.length === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------
// Executores de SQL: a mesma interface para o PGlite (in-process) e o pg (banco real),
// para que as verificações de estado sejam as mesmas nos dois.
//   query(sql, params?) → linhas · exec(sql) → vários comandos, sem parâmetros
//   notices: NOTICE/WARNING recebidos, em ordem · inTx: dentro da transação READ ONLY
// ---------------------------------------------------------------------------
function noticeFrom(n) {
  return { severity: n.severity, message: n.message, where: n.where ?? null }
}

export function pgliteExecutor(db) {
  const ex = {
    kind: 'pglite',
    db,
    notices: [],
    broadcastCursor: 0,
    inTx: false,
    async query(sql, params = []) {
      return (await db.query(sql, params, { onNotice: (n) => ex.notices.push(noticeFrom(n)) })).rows
    },
    async exec(sql) {
      await db.exec(sql, { onNotice: (n) => ex.notices.push(noticeFrom(n)) })
    },
    async close() {
      await db.close()
    },
  }
  return ex
}

export async function pgExecutor(connectionString) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString, application_name: 'dispara-db-check', connectionTimeoutMillis: 15000 })
  const ex = {
    kind: 'pg',
    client,
    notices: [],
    broadcastCursor: 0,
    inTx: false,
    async query(sql, params = []) {
      return (await client.query(sql, params)).rows
    },
    async exec(sql) {
      await client.query(sql)
    },
    async close() {
      await client.end()
    },
  }
  client.on('notice', (n) => ex.notices.push(noticeFrom(n)))
  client.on('error', (error) => console.error(`[pg] ${error.message}`))
  await client.connect()
  return ex
}

/** Consulta que pode falhar sem abortar a transação (SAVEPOINT quando dentro de uma). */
async function tryQuery(ex, sql, params = []) {
  if (!ex.inTx) {
    try {
      return { rows: await ex.query(sql, params) }
    } catch (error) {
      return { error }
    }
  }
  await ex.exec('SAVEPOINT dispara_try')
  try {
    const rows = await ex.query(sql, params)
    await ex.exec('RELEASE SAVEPOINT dispara_try')
    return { rows }
  } catch (error) {
    await ex.exec('ROLLBACK TO SAVEPOINT dispara_try; RELEASE SAVEPOINT dispara_try')
    return { error }
  }
}

// ---------------------------------------------------------------------------
// Banco "Supabase" no PGlite
// ---------------------------------------------------------------------------
export function listMigrations() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql') && !f.startsWith('.')).sort()
}

export function readMigration(file) {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
}

/** @param {{ realtimeSend?: 'safe' | 'unsafe' | 'none' }} [options] */
export async function createSupabaseLikeDb(options = {}) {
  const db = await PGlite.create({ extensions: { vector, uuid_ossp } })
  const ex = pgliteExecutor(db)
  await ex.exec(supabaseBootstrapSql(options))
  return ex
}

/** Banco "Supabase" com todas as migrations aplicadas (instalação nova). Volta como superusuário. */
export async function createMigratedDb(options = {}) {
  const ex = await createSupabaseLikeDb(options)
  await asOwner(ex)
  for (const file of listMigrations()) {
    const r = await applyMigration(ex, file)
    if (!r.ok) {
      await ex.close()
      throw new Error(`${file}: ${r.error}`)
    }
  }
  await asSuperuser(ex)
  return ex
}

/**
 * Troca para o dono não-superusuário (como o `postgres` do Supabase). SET ROLE e não
 * SET SESSION AUTHORIZATION: no PGlite (single-user) o RESET SESSION AUTHORIZATION não
 * volta ao superusuário. Com SET ROLE, current_user = dono: objetos nascem dele, default
 * privileges sem FOR ROLE valem para ele e as permissões são checadas sem superusuário.
 */
export async function asOwner(ex) {
  await ex.exec(`SET ROLE ${OWNER}; SET search_path = "$user", public, extensions;`)
}

export async function asSuperuser(ex) {
  await ex.exec(`RESET ROLE; SET search_path = "$user", public, extensions;`)
}

/** Aplica um arquivo como o installer: uma única chamada (transação implícita). */
export async function applyMigration(ex, file) {
  const start = ex.notices.length
  let error = null
  try {
    await ex.exec(readMigration(file))
  } catch (e) {
    error = e.message
  }
  const warnings = ex.notices.slice(start).filter((n) => n.severity === 'WARNING').map((n) => n.message)
  return error ? { ok: false, error, warnings } : { ok: true, warnings }
}

/** Aplica todas (como o dono); null se alguma falhar (já registrada como check). */
async function applyAll(ex, files, label) {
  await asOwner(ex)
  const results = {}
  for (const file of files) {
    const r = await applyMigration(ex, file)
    results[file] = r
    if (!r.ok) {
      check(`${label}: aplica ${file}`, false, r.error)
      await asSuperuser(ex)
      return null
    }
  }
  await asSuperuser(ex)
  return results
}

/** Executa como uma role (autocommit) e devolve o erro (ou null se passou). */
async function runAsRole(ex, role, sql) {
  try {
    await ex.exec(`SET ROLE ${role}; ${sql}`)
    return null
  } catch (error) {
    return error
  } finally {
    await ex.exec('RESET ROLE')
  }
}

/** Executa como uma role e devolve o código de erro (ou null se passou). */
export async function tryAsRole(ex, role, sql) {
  const error = await runAsRole(ex, role, sql)
  return error ? error.code || error.message : null
}

/** Escrita do app (como service_role, autocommit). Falha = exceção com o SQL. */
export async function writeAs(ex, role, sql) {
  const error = await runAsRole(ex, role, sql)
  if (error) throw new Error(`escrita como ${role} falhou (${error.code ?? '?'} ${error.message}): ${oneLine(sql).slice(0, 200)}`)
}

/** Consulta como uma role (autocommit, uma requisição do app). */
export async function queryAs(ex, role, sql, params = []) {
  await ex.exec(`SET ROLE ${role}`)
  try {
    return await ex.query(sql, params)
  } finally {
    await ex.exec('RESET ROLE')
  }
}

/** Monta `public.fn(NULL::tipo, ...)` a partir dos tipos reais dos argumentos. */
async function nullCallFor(ex, name) {
  const fns = await ex.query(`
    SELECT oidvectortypes(p.proargtypes) AS types FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = $1 LIMIT 1`, [name])
  if (fns.length === 0) return null
  const types = fns[0].types ? fns[0].types.split(', ') : []
  return `public.${name}(${types.map((t) => `NULL::${t}`).join(', ')})`
}

/**
 * Sondagem "como role" que não deixa rastro: dentro da transação READ ONLY, SET LOCAL ROLE
 * num SAVEPOINT desfeito com ROLLBACK TO. Devolve { code } (null = passou) ou { skipped }.
 */
async function probeAsRole(ex, role, sql) {
  if (!ex.inTx) throw new Error('probeAsRole só roda dentro da transação somente leitura (runVerifyOnly)')
  await ex.exec('SAVEPOINT dispara_probe')
  try {
    try {
      await ex.exec(`SET LOCAL ROLE ${role}`)
    } catch (error) {
      return { skipped: `${error.code ?? ''} ${error.message}`.trim() }
    }
    try {
      await ex.exec(sql)
      return { code: null }
    } catch (error) {
      return { code: error.code || error.message }
    }
  } finally {
    await ex.exec('ROLLBACK TO SAVEPOINT dispara_probe; RELEASE SAVEPOINT dispara_probe')
  }
}

function checkDenied(name, probe) {
  if (probe.skipped) {
    info(`${name}: não verificável por sondagem (SET ROLE recusado: ${probe.skipped}); os privilégios acima continuam valendo`)
    return
  }
  check(name, probe.code === '42501', `resultado: ${probe.code ?? 'PASSOU (vazamento!)'}`)
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
function oneLine(sql) {
  return sql.replace(/\s+/g, ' ').trim()
}

function countBy(items, keyFn) {
  const out = {}
  for (const item of items) {
    const key = keyFn(item)
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

function sameList(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function listDiff(actual, expected) {
  const missing = expected.filter((x) => !actual.includes(x))
  const extra = actual.filter((x) => !expected.includes(x))
  return [missing.length ? `faltam: ${missing.join('; ')}` : '', extra.length ? `sobram: ${extra.join('; ')}` : '']
    .filter(Boolean)
    .join(' | ')
}

function summarizeEvents(events) {
  return events.map((e) => `${e.payload?.table}/${e.payload?.eventType}`).join(', ') || '(nenhum)'
}

// Corpo de função comparável entre checkout CRLF/LF e o SQL editor (espaço no fim da linha)
const normalizeSource = (s) => (s ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()

/** Literal SQL ('...' com aspas dobradas). */
const sqlLiteral = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Identificador SQL (só põe aspas quando precisa), para os GRANT/POLICY sugeridos. */
const quoteIdent = (s) => (/^[a-z_][a-z0-9_$]*$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`)

/**
 * Roda `fn` com search_path = pg_catalog (o canônico da migration: pg_get_triggerdef
 * qualifica o nome da função conforme o search_path). Dentro da transação READ ONLY, num
 * SAVEPOINT desfeito no fim; fora dela, restaura o search_path da sessão.
 */
async function withCanonicalSearchPath(ex, fn) {
  if (ex.inTx) {
    await ex.exec('SAVEPOINT dispara_search_path; SET LOCAL search_path = pg_catalog')
    try {
      return await fn()
    } finally {
      await ex.exec('ROLLBACK TO SAVEPOINT dispara_search_path; RELEASE SAVEPOINT dispara_search_path')
    }
  }
  const [{ path }] = await ex.query(`SELECT current_setting('search_path') AS path`)
  await ex.exec('SET search_path = pg_catalog')
  try {
    return await fn()
  } finally {
    await ex.query(`SELECT set_config('search_path', $1, false)`, [path])
  }
}

// ---------------------------------------------------------------------------
// Triggers de broadcast: snapshot e versão
// ---------------------------------------------------------------------------
/** @type {ReadonlyArray<[number, string]>} bits de pg_trigger.tgtype */
const TRIGGER_EVENT_BITS = [[4, 'INSERT'], [16, 'UPDATE'], [8, 'DELETE'], [32, 'TRUNCATE']]

/** `tabela.nome: AFTER INSERT OR DELETE FOR EACH ROW [WHEN]` a partir de pg_trigger.tgtype. */
export function describeTrigger({ table, name, tgtype, hasWhen }) {
  const timing = tgtype & 2 ? 'BEFORE' : tgtype & 64 ? 'INSTEAD OF' : 'AFTER'
  const events = TRIGGER_EVENT_BITS.filter(([bit]) => tgtype & bit).map(([, event]) => event)
  return `${table}.${name}: ${timing} ${events.join(' OR ')} FOR EACH ${tgtype & 1 ? 'ROW' : 'STATEMENT'}${hasWhen ? ' WHEN' : ''}`
}

/**
 * Definições das triggers como a migration as cria (tuplas do VALUES do bloco DO), com o
 * md5 da definição que ela grava na 1ª parte da marca do COMMENT (mesma normalização:
 * btrim de espaços + \s+ → ' ').
 */
export function parseBroadcastTriggerDefinitions(sql) {
  const out = []
  for (const m of sql.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*\$d\$([\s\S]*?)\$d\$\s*\)/g)) {
    const [, table, name, raw] = m
    const definition = raw.replace(/^ +| +$/g, '').replace(/\s+/g, ' ')
    const head = /^(BEFORE|AFTER|INSTEAD OF) (.+?) ON public\.([a-z_]+) FOR EACH (ROW|STATEMENT)( WHEN )?/.exec(definition)
    const events = head ? head[2].split(' OR ') : []
    const tgtype = (head?.[4] === 'ROW' ? 1 : 0) | (head?.[1] === 'BEFORE' ? 2 : 0) | (head?.[1] === 'INSTEAD OF' ? 64 : 0)
      | TRIGGER_EVENT_BITS.reduce((acc, [bit, event]) => (events.includes(event) ? acc | bit : acc), 0)
    out.push({
      table,
      name,
      definition,
      specMd5: createHash('md5').update(definition).digest('hex'),
      description: describeTrigger({ table, name, tgtype, hasWhen: Boolean(head?.[5]) }),
      onTable: head?.[3] ?? null,
    })
  }
  return out
}

/** Corpo (prosrc) de dispara_broadcast_change como está na migration. */
function parseBroadcastFunctionSource(sql) {
  const m = /CREATE OR REPLACE FUNCTION public\.dispara_broadcast_change\(\)[\s\S]*?\nAS \$\$([\s\S]*?)\$\$;/.exec(sql)
  return m ? m[1] : null
}

/**
 * Triggers de broadcast no banco. `marker` = COMMENT ('dispara_broadcast:<md5 da
 * definição>:<md5 do pg_get_triggerdef na criação>'); `defMd5` = md5 do pg_get_triggerdef
 * AGORA, com o search_path canônico da migration; `xmin` muda a cada CREATE OR REPLACE
 * TRIGGER (o OID não: ele é mantido), então prova se uma trigger foi recriada.
 */
export async function readBroadcastTriggers(ex) {
  return withCanonicalSearchPath(ex, () => ex.query(`
    SELECT n.nspname AS schema, c.relname AS "table", t.tgname AS name, t.tgtype::int AS tgtype,
           (t.tgqual IS NOT NULL) AS "hasWhen", t.tgenabled::text AS enabled,
           pn.nspname || '.' || p.proname AS fn, obj_description(t.oid, 'pg_trigger') AS marker, t.oid::text AS oid,
           t.xmin::text AS xmin, md5(pg_get_triggerdef(t.oid)) AS "defMd5"
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal
      AND (t.tgname LIKE 'dispara_realtime%' OR (pn.nspname = 'public' AND p.proname = 'dispara_broadcast_change'))
    ORDER BY c.relname, t.tgname`))
}

function describeDbTriggers(triggers) {
  return triggers.map((t) => (t.schema === 'public' ? describeTrigger(t) : `${t.schema}.${describeTrigger(t)}`)).sort()
}

const triggerKey = (t) => `${t.table}.${t.name}`

const EXPECTED_SORTED = [...EXPECTED_BROADCAST_TRIGGERS].sort()

function verifyTriggerSnapshotMatchesMigration() {
  const defs = parseBroadcastTriggerDefinitions(readMigration(HARDENING))
  const described = defs.map((d) => d.description).sort()
  check(`snapshot das triggers no harness = definições da migration (${defs.length})`,
    sameList(described, EXPECTED_SORTED) && defs.every((d) => d.onTable === d.table), listDiff(described, EXPECTED_SORTED))
}

/** O critério do realtime.send deste arquivo é o da migration (função e bloco das triggers). */
function verifySendGuardMatchesMigration() {
  const sql = readMigration(HARDENING)
  const counts = [SEND_SOURCE_STRIP_RE, SEND_HANDLER_RE, SEND_THROWS_RE].map((re) => sql.split(sqlLiteral(re)).length - 1)
  check('critério do realtime.send no harness = o da migration (guarda de dispara_broadcast_change e bloco das triggers)',
    counts.every((n) => n === 2), `ocorrências na migration (esperado 2 de cada): ${counts.join(', ')}`)
}

// ---------------------------------------------------------------------------
// Verificações de ESTADO (somente leitura: rodam igual no PGlite e num banco real)
// ---------------------------------------------------------------------------
const NOT_EXTENSION_REL = `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')`
const NOT_EXTENSION_PROC = `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`

async function verifyPrivileges(ex) {
  const [{ relations }] = await ex.query(`
    SELECT count(*)::int AS relations FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f') AND ${NOT_EXTENSION_REL}`)
  check(`há tabelas/views em public (${relations})`, relations > 20)

  // has_any_column_privilege também pega GRANT por coluna (has_table_privilege não)
  const leaks = await ex.query(`
    SELECT r.role, c.relname, p.priv
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f') AND ${NOT_EXTENSION_REL}
      AND CASE WHEN p.priv IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
               THEN has_any_column_privilege(r.role, c.oid, p.priv)
               ELSE has_table_privilege(r.role, c.oid, p.priv) END
    ORDER BY 1, 2, 3`)
  for (const role of ['anon', 'authenticated']) {
    const mine = leaks.filter((l) => l.role === role).map((l) => `${l.relname}:${l.priv}`)
    check(`${role} sem nenhum privilégio de tabela/view em public`, mine.length === 0, mine.slice(0, 15).join(', '))
  }

  // OFFSET 0 impede o planner de avaliar has_sequence_privilege antes do filtro por relkind
  const seqLeaks = await ex.query(`
    SELECT r.role, s.relname, p.priv FROM (
      SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S' AND ${NOT_EXTENSION_REL} OFFSET 0
    ) s
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
    CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(priv)
    WHERE has_sequence_privilege(r.role, s.oid, p.priv)`)
  check('anon/authenticated sem privilégio em nenhuma sequence de public', seqLeaks.length === 0,
    seqLeaks.map((s) => `${s.role}:${s.relname}:${s.priv}`).slice(0, 10).join(', '))

  const noRls = await ex.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity AND ${NOT_EXTENSION_REL}`)
  check('RLS habilitado em todas as tabelas de public', noRls.length === 0, noRls.map((t) => t.relname).join(', '))

  const openPolicies = await ex.query(`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles) OR 'public' = ANY(roles))
      AND (qual = 'true' OR with_check = 'true')`)
  check('nenhuma policy USING/WITH CHECK (true) para anon/authenticated/public', openPolicies.length === 0,
    openPolicies.map((p) => `${p.tablename}.${p.policyname}`).join(', '))

  const [{ functions }] = await ex.query(`
    SELECT count(*)::int AS functions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND ${NOT_EXTENSION_PROC}`)
  const execLeaks = await ex.query(`
    SELECT r.role, p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
    WHERE n.nspname = 'public' AND ${NOT_EXTENSION_PROC} AND has_function_privilege(r.role, p.oid, 'EXECUTE')
    ORDER BY 1, 2`)
  for (const role of ['anon', 'authenticated']) {
    const mine = execLeaks.filter((l) => l.role === role).map((l) => l.sig)
    check(`${role} sem EXECUTE em nenhuma função de public (${functions} funções)`, mine.length === 0, mine.slice(0, 10).join(', '))
  }

  const definerNoPath = await ex.query(`
    SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND ${NOT_EXTENSION_PROC}
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')`)
  check('toda função SECURITY DEFINER de public fixa o search_path', definerNoPath.length === 0, definerNoPath.map((f) => f.sig).join(', '))

  // Objetos de outro dono: ali o REVOKE/ALTER da migration pode ter virado WARNING
  const foreign = await ex.query(`
    WITH app AS (SELECT relowner FROM pg_class WHERE oid = to_regclass('public.campaigns'))
    SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, app
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S') AND c.relowner <> app.relowner AND ${NOT_EXTENSION_REL}
    UNION ALL
    SELECT p.oid::regprocedure::text, pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, app
    WHERE n.nspname = 'public' AND p.proowner <> app.relowner AND ${NOT_EXTENSION_PROC}`)
  if (foreign.length) {
    info(`aviso: objetos de public com outro dono (os REVOKE/ALTER da migration podem ter virado WARNING; os checks acima valem mesmo assim): ${foreign.map((f) => `${f.name} (${f.owner})`).slice(0, 10).join(', ')}`)
  }

  // Tentativa real como anon/authenticated (equivalente ao PostgREST com a chave pública)
  for (const t of ['contacts', 'inbox_messages', 'inbox_conversations', 'campaigns', 'settings']) {
    checkDenied(`anon: SELECT em ${t} é negado`, await probeAsRole(ex, 'anon', `SELECT * FROM public.${t} LIMIT 1`))
  }
  checkDenied('authenticated: SELECT em contacts é negado', await probeAsRole(ex, 'authenticated', `SELECT * FROM public.contacts LIMIT 1`))
  for (const fn of ['claim_campaign_batch', 'try_lock_campaign_dispatch', 'dispara_cron_tick']) {
    const call = await nullCallFor(ex, fn)
    if (!call) continue
    checkDenied(`anon: RPC ${fn} é negada`, await probeAsRole(ex, 'anon', `SELECT ${call}`))
  }

  const pubs = await ex.query(`
    SELECT p.puballtables, coalesce((SELECT array_agg(pt.tablename::text ORDER BY pt.tablename) FROM pg_publication_tables pt
                                     WHERE pt.pubname = p.pubname AND pt.schemaname = 'public'), '{}') AS tables
    FROM pg_publication p WHERE p.pubname = 'supabase_realtime'`)
  if (pubs.length === 0) info('publicação supabase_realtime não existe (nada a conferir)')
  else {
    check('tabelas de public fora da publicação supabase_realtime (postgres_changes desligado)',
      !pubs[0].puballtables && pubs[0].tables.length === 0, pubs[0].puballtables ? 'FOR ALL TABLES' : pubs[0].tables.join(', '))
  }
}

async function verifyServiceRole(ex) {
  const missing = await ex.query(`
    SELECT c.relname, p.priv FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND ${NOT_EXTENSION_REL}
      AND NOT has_table_privilege('service_role', c.oid, p.priv)`)
  check('service_role com SELECT/INSERT/UPDATE/DELETE em todas as tabelas', missing.length === 0,
    missing.map((m) => `${m.relname}:${m.priv}`).slice(0, 15).join(', '))

  const views = await ex.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m') AND ${NOT_EXTENSION_REL}
      AND NOT has_table_privilege('service_role', c.oid, 'SELECT')`)
  check('service_role com SELECT em todas as views de public', views.length === 0, views.map((v) => v.relname).join(', '))

  const seqMissing = await ex.query(`
    SELECT s.relname FROM (
      SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S' AND ${NOT_EXTENSION_REL} OFFSET 0
    ) s WHERE NOT has_sequence_privilege('service_role', s.oid, 'USAGE')`)
  check('service_role com USAGE em todas as sequences', seqMissing.length === 0, seqMissing.map((s) => s.relname).join(', '))

  const noExec = await ex.query(`
    SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND ${NOT_EXTENSION_PROC} AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')`)
  check('service_role com EXECUTE em todas as funções de public', noExec.length === 0, noExec.map((f) => f.sig).slice(0, 10).join(', '))

  const rpcRows = await ex.query(`
    SELECT p.proname, p.oid::regprocedure::text AS sig, has_function_privilege('service_role', p.oid, 'EXECUTE') AS has
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`, [SERVER_RPCS])
  const rpcProblems = []
  for (const name of SERVER_RPCS) {
    const fns = rpcRows.filter((r) => r.proname === name)
    if (fns.length === 0 && !KNOWN_MISSING_RPCS.has(name)) rpcProblems.push(`${name}: não existe`)
    for (const f of fns) if (!f.has) rpcProblems.push(`${f.sig}: sem EXECUTE para service_role`)
  }
  check(`service_role executa todas as RPCs usadas pelo servidor (${SERVER_RPCS.length})`, rpcProblems.length === 0, rpcProblems.join('; '))
  for (const name of KNOWN_MISSING_RPCS) {
    if (!rpcRows.some((r) => r.proname === name)) info(`aviso: RPC ${name} é chamada pelo código mas não existe no schema (o código tem fallback)`)
  }

  const svcRead = await probeAsRole(ex, 'service_role', `SELECT 1 FROM public.contacts LIMIT 1; SELECT 1 FROM public.settings LIMIT 1;`)
  if (svcRead.skipped) info(`service_role: leitura não verificável por sondagem (${svcRead.skipped})`)
  else check('service_role lê contacts/settings (BYPASSRLS)', svcRead.code === null, `erro: ${svcRead.code}`)
}

/**
 * Default privileges (objetos FUTUROS): o dono das tabelas do app não pode dar nada a
 * anon/authenticated em public. O EXECUTE de PUBLIC em função nova é default GLOBAL do
 * Postgres (não aparece aqui): a defesa é o REVOKE explícito em cada migration.
 */
async function verifyDefaultPrivileges(ex) {
  const [app] = await ex.query(`SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid = to_regclass('public.campaigns')`)
  const rows = await ex.query(`
    SELECT pg_get_userbyid(d.defaclrole) AS role, coalesce(n.nspname, '(global)') AS schema, d.defaclobjtype::text AS objtype,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type AS priv
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
    WHERE n.nspname = 'public' OR d.defaclnamespace = 0`)
  const KINDS = { r: 'tabelas', S: 'sequences', f: 'funções' }
  const leaks = rows.filter((r) => ['anon', 'authenticated'].includes(r.grantee) && KINDS[r.objtype])
  const own = leaks.filter((r) => r.role === app?.owner)
  check(`default privileges de ${app?.owner ?? '(dono de campaigns)'} em public não abrem objetos futuros para anon/authenticated`,
    Boolean(app) && own.length === 0, own.map((r) => `${KINDS[r.objtype]}→${r.grantee}:${r.priv}`).slice(0, 10).join(', '))
  const others = [...new Set(leaks.filter((r) => r.role !== app?.owner).map((r) => `${r.role} (${KINDS[r.objtype]}→${r.grantee})`))]
  if (others.length) {
    info(`aviso: default privileges de OUTROS roles ainda abrem para anon/authenticated o que ELES criarem em public: ${others.slice(0, 8).join(', ')}`)
  }
}

/**
 * Estado do caminho do envio, só por catálogo (to_regprocedure em realtime ERRA sem USAGE
 * no schema). Quem chama realtime.send é o dono de dispara_broadcast_change (SECURITY
 * DEFINER; sem a função, current_user); quem INSERE em realtime.messages é esse dono, ou o
 * dono do send se ele for SECURITY DEFINER. `rlsAccess`: como o INSERT passa pelo RLS de
 * realtime.messages — off | superuser | bypassrls | owner | policy | blocked.
 */
async function readRealtimeSendState(ex) {
  const rows = await ex.query(`
    WITH ns AS (SELECT n.oid FROM pg_namespace n WHERE n.nspname = 'realtime'),
    send AS (
      SELECT p.oid, p.prosrc, p.prosecdef, p.proowner FROM pg_proc p JOIN ns ON p.pronamespace = ns.oid
      WHERE p.proname = 'send' AND oidvectortypes(p.proargtypes) = 'jsonb, text, text, boolean'
    ),
    caller AS (
      SELECT coalesce((SELECT f.proowner FROM pg_proc f WHERE f.oid = to_regprocedure('public.dispara_broadcast_change()')),
                      (SELECT r.oid FROM pg_roles r WHERE r.rolname = current_user)) AS oid
    ),
    msgs AS (SELECT c.oid, c.relrowsecurity, c.relforcerowsecurity, c.relowner FROM pg_class c JOIN ns ON c.relnamespace = ns.oid WHERE c.relname = 'messages')
    SELECT
      regexp_replace(send.prosrc, $1, ' ', 'g') ~* $2 AND NOT (regexp_replace(send.prosrc, $1, ' ', 'g') ~* $3) AS handles,
      pg_get_userbyid(caller.oid) AS caller,
      has_schema_privilege(caller.oid, ns.oid, 'USAGE') AND has_function_privilege(caller.oid, send.oid, 'EXECUTE') AS caller_can_call,
      pg_get_userbyid(ins.oid) AS inserter,
      send.prosecdef AS send_definer,
      msgs.oid IS NOT NULL AS messages_exists,
      CASE WHEN msgs.oid IS NULL THEN false
           ELSE has_schema_privilege(ins.oid, ns.oid, 'USAGE') AND has_table_privilege(ins.oid, msgs.oid, 'INSERT') END AS can_insert,
      CASE WHEN msgs.oid IS NULL OR NOT msgs.relrowsecurity THEN 'off'
           WHEN a.rolsuper THEN 'superuser'
           WHEN a.rolbypassrls THEN 'bypassrls'
           WHEN pg_has_role(ins.oid, msgs.relowner, 'USAGE') AND NOT msgs.relforcerowsecurity THEN 'owner'
           WHEN pol.names IS NOT NULL THEN 'policy'
           ELSE 'blocked' END AS rls_access,
      pol.names AS policies
    FROM send
    CROSS JOIN ns
    CROSS JOIN caller
    CROSS JOIN LATERAL (SELECT CASE WHEN send.prosecdef THEN send.proowner ELSE caller.oid END AS oid) ins
    JOIN pg_roles a ON a.oid = ins.oid
    LEFT JOIN msgs ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(p.polname, ', ' ORDER BY p.polname) AS names FROM pg_policy p
      WHERE p.polrelid = msgs.oid AND p.polcmd IN ('a', '*') AND p.polpermissive
        AND (0::oid = ANY (p.polroles)
             OR EXISTS (SELECT 1 FROM unnest(p.polroles) AS pr(role) WHERE pr.role <> 0 AND pg_has_role(ins.oid, pr.role, 'USAGE')))
    ) pol ON true`, [SEND_SOURCE_STRIP_RE, SEND_HANDLER_RE, SEND_THROWS_RE])
  if (rows.length === 0) return { exists: false, handlesErrors: false }
  const r = rows[0]
  return {
    exists: true,
    handlesErrors: r.handles === true,
    caller: r.caller,
    callerCanCall: r.caller_can_call === true,
    inserter: r.inserter,
    sendDefiner: r.send_definer === true,
    messagesExists: r.messages_exists === true,
    canInsert: r.can_insert === true,
    rlsAccess: r.rls_access,
    policies: r.policies,
  }
}

/**
 * Partições de realtime.messages (no Supabase, RANGE por dia em inserted_at, criadas pelo
 * servidor Realtime quando um cliente conecta). `coversNow`: alguma partição (ou a DEFAULT)
 * aceita uma linha inserida agora — inserted_at é timestamp sem fuso com DEFAULT now(), ou
 * seja, localtimestamp.
 */
export async function readRealtimePartitions(ex) {
  const [row] = await ex.query(`
    SELECT p.relkind::text = 'p' AS partitioned,
           count(b.bound)::int AS count,
           coalesce(bool_or(b.bound = 'DEFAULT'
                            OR (localtimestamp >= b.m[1]::timestamp AND localtimestamp < b.m[2]::timestamp)), false) AS "coversNow",
           max(b.m[2]::timestamp)::text AS "newestEnd"
    FROM pg_class p
    LEFT JOIN LATERAL (
      SELECT pg_get_expr(c.relpartbound, c.oid) AS bound,
             regexp_match(pg_get_expr(c.relpartbound, c.oid), $re$^FOR VALUES FROM \\('([^']+)'\\) TO \\('([^']+)'\\)$$re$) AS m
      FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = p.oid
    ) b ON true
    WHERE p.oid = to_regclass('realtime.messages')
    GROUP BY p.relkind`)
  return row ?? { partitioned: false, count: 0, coversNow: false, newestEnd: null }
}

/** Por que quem insere NÃO consegue gravar em realtime.messages (com a correção), ou null. */
function realtimeInsertProblem(send) {
  const role = quoteIdent(send.inserter)
  if (!send.messagesExists) return 'realtime.messages não existe (Realtime não instalado?)'
  if (!send.canInsert) return `${send.inserter} sem USAGE no schema realtime ou sem INSERT em realtime.messages — corrija com GRANT USAGE ON SCHEMA realtime TO ${role}; GRANT INSERT ON realtime.messages TO ${role}`
  if (send.rlsAccess === 'blocked') {
    return `realtime.messages tem RLS ligado e ${send.inserter} não tem BYPASSRLS nem policy de INSERT — corrija com CREATE POLICY dispara_broadcast_insert ON realtime.messages FOR INSERT TO ${role} WITH CHECK (topic = 'dispara-db') (ou ALTER ROLE ${role} BYPASSRLS)`
  }
  return null
}

async function verifyBroadcastTriggers(ex) {
  const migrationSql = readMigration(HARDENING)
  const send = await readRealtimeSendState(ex)
  const triggers = await readBroadcastTriggers(ex)
  check('realtime.send existe e trata os próprios erros (EXCEPTION WHEN OTHERS THEN, sem relançar: premissa da migration)',
    send.exists && send.handlesErrors,
    send.exists
      ? 'realtime.send sem EXCEPTION WHEN OTHERS THEN, ou com RAISE;/RAISE EXCEPTION/RAISE sem nível/ASSERT no fonte: a migration não cria triggers e as existentes não publicam (dashboard só no polling)'
      : 'realtime.send ausente: ative Broadcast from Database e REAPLIQUE a migration de hardening (dashboard só no polling)')

  if (send.exists) {
    const caller = quoteIdent(send.caller)
    check(`realtime.send: o dono de dispara_broadcast_change (${send.caller}) tem USAGE no schema realtime e EXECUTE no send`, send.callerCanCall,
      `sem isso as triggers não publicam nada (não derrubam escrita) — corrija com GRANT USAGE ON SCHEMA realtime TO ${caller}; GRANT EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) TO ${caller} (não precisa reaplicar a migration)`)
    const problem = realtimeInsertProblem(send)
    check(`realtime.messages: quem insere (${send.inserter}, ${send.sendDefiner ? 'dono do realtime.send SECURITY DEFINER' : 'dono de dispara_broadcast_change'}) consegue gravar (privilégio INSERT e RLS)`,
      problem === null,
      `${problem} — sem isso realtime.send engole o erro (WARNING WarnSendingBroadcastMessage/ErrorSendingBroadcastMessage ou pg_notify realtime:system, conforme a versão) e o realtime do dashboard morre em silêncio; não precisa reaplicar a migration`)
    if (problem === null && send.rlsAccess === 'policy') {
      info(`INSERT de ${send.inserter} em realtime.messages liberado pelo RLS via policy (${send.policies}); o WITH CHECK não é avaliado aqui: confira que aceita topic = 'dispara-db'`)
    }
    // Policies RESTRICTIVE não liberam nada, mas podem barrar o INSERT mesmo com uma PERMISSIVE.
    const restrictive = await ex.query(`
      SELECT string_agg(p.polname, ', ' ORDER BY p.polname) AS names FROM pg_policy p
      WHERE p.polrelid = to_regclass('realtime.messages') AND p.polcmd IN ('a', '*') AND NOT p.polpermissive`)
    if (restrictive[0]?.names) {
      info(`realtime.messages tem policy RESTRICTIVE de INSERT (${restrictive[0].names}): não é avaliada aqui — confira que aceita topic = 'dispara-db' para ${send.inserter}`)
    }
    // Mostra qual variante do realtime.send o banco tem (a guarda da migration é heurística: ver LIMITAÇÃO no cabeçalho)
    const src = await ex.query(`
      SELECT md5(prosrc) AS md5, prosrc ~* 'pg_notify' AS notifies, substring(prosrc from '(?:Warn|Error)SendingBroadcastMessage') AS warns
      FROM pg_proc WHERE oid = to_regprocedure('realtime.send(jsonb,text,text,boolean)')`)
    if (src[0]) {
      const kind = src[0].warns ? `RAISE WARNING '${src[0].warns}'` : src[0].notifies ? "pg_notify('realtime:system')" : 'outro formato'
      info(`realtime.send: falhas reportadas via ${kind} (md5 do fonte ${src[0].md5})`)
    }
    const parts = await readRealtimePartitions(ex)
    if (parts.partitioned && !parts.coversNow) {
      info(`realtime.messages sem partição para agora (${parts.count} partição(ões)${parts.newestEnd ? `; a mais nova termina em ${parts.newestEnd}` : ''}): normal se nenhum cliente conectou ao Realtime nos últimos dias — o servidor Realtime cria a janela (ontem … +3 dias) quando o dashboard conecta. Até lá o send só avisa e nada é publicado (sem ninguém conectado, não chegaria a ninguém); a escrita do app não é afetada`)
    }
  }

  const described = describeDbTriggers(triggers)
  check(`snapshot exato das triggers de broadcast (${EXPECTED_SORTED.length}, nenhuma em campaign_contacts)`,
    sameList(described, EXPECTED_SORTED),
    `${listDiff(described, EXPECTED_SORTED)}${triggers.length === 0 && send.exists && send.handlesErrors ? ' — triggers ausentes com o Realtime ativo: reaplique a migration de hardening' : ''}`)
  check('nenhuma trigger de broadcast em campaign_contacts (volume do disparo)', !triggers.some((t) => t.table === 'campaign_contacts'))
  if (triggers.length) {
    const wrong = triggers.filter((t) => !['O', 'A'].includes(t.enabled) || t.fn !== 'public.dispara_broadcast_change')
    check('triggers de broadcast habilitadas e chamando public.dispara_broadcast_change()', wrong.length === 0,
      `${wrong.map((t) => `${triggerKey(t)} (tgenabled=${t.enabled}, ${t.fn})`).join(', ')} — reaplique a migration de hardening (ela recria e reabilita)`)
    // Marca 'dispara_broadcast:<md5 da definição>:<md5 do pg_get_triggerdef na criação>'
    const specs = new Map(parseBroadcastTriggerDefinitions(migrationSql).map((d) => [`${d.table}.${d.name}`, d.specMd5]))
    const stale = []
    const drifted = []
    for (const t of triggers) {
      const marker = /^dispara_broadcast:([0-9a-f]{32}):([0-9a-f]{32})$/.exec(t.marker ?? '')
      if (!marker || marker[1] !== specs.get(triggerKey(t))) stale.push(triggerKey(t))
      else if (marker[2] !== t.defMd5) drifted.push(triggerKey(t))
    }
    check('triggers na versão deste repositório (md5 da definição na marca do COMMENT)', stale.length === 0,
      `desatualizadas: ${stale.join(', ')} — reaplique a migration de hardening`)
    check('triggers sem alteração manual desde a migration (md5 do pg_get_triggerdef = o registrado na criação)', drifted.length === 0,
      `alteradas à mão (ex.: CREATE OR REPLACE TRIGGER com outro WHEN, que mantém OID e COMMENT): ${drifted.join(', ')} — reaplique a migration de hardening (ela recria só as alteradas). Se TODAS aparecerem alteradas logo após um upgrade de major do Postgres, é só o formato do pg_get_triggerdef que mudou: reaplique numa janela de baixo tráfego`)
  }

  const fn = await ex.query(`SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.dispara_broadcast_change()')`)
  const expectedSrc = parseBroadcastFunctionSource(migrationSql)
  check('dispara_broadcast_change existe e está na versão deste repositório (corpo da função)',
    fn.length === 1 && expectedSrc !== null && normalizeSource(fn[0].prosrc) === normalizeSource(expectedSrc),
    fn.length === 0 ? 'função ausente: a migration de hardening não foi aplicada' : 'corpo diferente do arquivo: reaplique a migration de hardening')
}

async function verifyCronState(ex) {
  const jobs = await tryQuery(ex, `SELECT jobname, username, command, active FROM cron.job WHERE jobname = 'dispara-cron-tick'`)
  if (jobs.error) {
    check('pg_cron: job dispara-cron-tick agendado', false, `cron.job ilegível (${jobs.error.code ?? ''} ${jobs.error.message}) — pg_cron habilitado?`)
    return
  }
  const job = jobs.rows[0]
  check('pg_cron: job dispara-cron-tick agendado, ativo e chamando public.dispara_cron_tick()',
    job && job.active !== false && /dispara_cron_tick\(\)/.test(job.command), jobs.rows.length ? JSON.stringify(jobs.rows) : 'nenhum job visível (no Supabase, cron.job só mostra os jobs do usuário conectado: conecte como quem agendou, em geral postgres)')
  if (!job) return
  const can = await tryQuery(ex, `SELECT has_function_privilege($1, 'public.dispara_cron_tick()', 'EXECUTE') AS can`, [job.username])
  check(`pg_cron: o usuário do job (${job.username}) tem EXECUTE em dispara_cron_tick() — o REVOKE de PUBLIC não para o relógio`,
    can.rows?.[0]?.can === true, can.error?.message ?? 'sem EXECUTE: o job falha a cada minuto')
  const secrets = await tryQuery(ex, `SELECT name FROM vault.secrets WHERE name IN ('app_base_url', 'cron_secret')`)
  if (secrets.error) info(`vault: não foi possível listar os secrets (${secrets.error.message})`)
  else {
    const absent = ['app_base_url', 'cron_secret'].filter((n) => !secrets.rows.some((r) => r.name === n))
    if (absent.length) info(`aviso: Vault sem ${absent.join(' e ')} — o tick não faz nada até o installer gravá-los`)
  }
}

async function verifyStateChecks(ex) {
  await verifyPrivileges(ex)
  await verifyServiceRole(ex)
  await verifyDefaultPrivileges(ex)
  await verifyBroadcastTriggers(ex)
  await verifyCronState(ex)
}

/**
 * O modo --verify-only: verificações de estado numa transação READ ONLY desfeita no fim
 * (nada é escrito, nem por engano: o próprio Postgres recusaria com 25006).
 */
export async function runVerifyOnly(ex) {
  await ex.exec('BEGIN READ ONLY')
  ex.inTx = true
  try {
    await ex.exec(`SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '30s'`)
    const [{ ro }] = await ex.query(`SELECT current_setting('transaction_read_only') AS ro`)
    check('somente leitura: a verificação roda numa transação READ ONLY (desfeita no fim)', ro === 'on', `transaction_read_only=${ro}`)
    await verifyStateChecks(ex)
  } finally {
    ex.inTx = false
    try {
      await ex.exec('ROLLBACK')
    } catch (error) {
      console.error(`ROLLBACK falhou: ${error.message}`)
    }
  }
}

/** Próximo XID a ser atribuído: não muda se ninguém escreveu nada. */
async function nextXid(ex) {
  const [{ xmax }] = await ex.query(`SELECT pg_snapshot_xmax(pg_current_snapshot())::text AS xmax`)
  return xmax
}

/**
 * RPCs chamadas pelo código servidor × SERVER_RPCS. Só `.rpc('literal')` é verificável; uma
 * chamada com nome não literal (variável, template com ${}) é AVISADA (não falha): confira à
 * mão que a RPC está em SERVER_RPCS.
 */
function verifyRpcList() {
  const sources = ['app', 'lib', 'services', 'hooks', 'components']
  const found = new Set()
  const dynamic = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        const src = readFileSync(p, 'utf8')
        // .rpc( / .rpc<Tipo>( seguido do 1º argumento
        for (const m of src.matchAll(/\.rpc\s*(?:<[^>()]*>)?\s*\(\s*/g)) {
          const rest = src.slice(m.index + m[0].length)
          const literal = /^(['"`])([a-z_0-9]+)\1/.exec(rest)
          if (literal) found.add(literal[2])
          else {
            const line = src.slice(0, m.index).split('\n').length
            const arg = rest.slice(0, 40).split(/[\n,)]/)[0].trim()
            dynamic.push(`${relativePath(p)}:${line} (${arg || '?'})`)
          }
        }
      }
    }
  }
  for (const s of sources) walk(join(ROOT, s))
  const unknown = [...found].filter((n) => !SERVER_RPCS.includes(n))
  check(`lista de RPCs do servidor está em dia com o código (${found.size} chamadas com nome literal)`, unknown.length === 0, `novas: ${unknown.join(', ')}`)
  if (dynamic.length) {
    info(`aviso: .rpc() com nome NÃO literal (não verificável aqui; confira à mão que a RPC está em SERVER_RPCS): ${dynamic.join('; ')}`)
  }
}

function relativePath(p) {
  return relative(ROOT, p).replace(/\\/g, '/')
}

// ---------------------------------------------------------------------------
// Realtime: eventos, contrato do payload e WARNINGs
// ---------------------------------------------------------------------------
export async function realtimeMaxSeq(ex) {
  const [{ s }] = await ex.query(`SELECT coalesce(max(harness_seq), 0)::int AS s FROM realtime.messages`)
  return s
}

export async function realtimeEventsSince(ex, seq) {
  return ex.query(`
    SELECT harness_seq::int AS seq, topic, event, private, payload FROM realtime.messages
    WHERE harness_seq > $1 ORDER BY harness_seq`, [seq])
}

async function delta(ex, fn) {
  const before = await realtimeMaxSeq(ex)
  const result = await fn()
  return { result, events: await realtimeEventsSince(ex, before) }
}

/** WARNINGs de broadcast desde a última chamada (avança o cursor). */
export function takeBroadcastWarnings(ex) {
  const fresh = ex.notices.slice(ex.broadcastCursor)
  ex.broadcastCursor = ex.notices.length
  return fresh.filter((n) => n.severity === 'WARNING' && BROADCAST_WARNING_RE.test(n.message))
}

function checkNoBroadcastWarnings(ex, label) {
  const warnings = takeBroadcastWarnings(ex)
  check(`[${label}] nenhum WARNING de dispara_broadcast_change/Warn/ErrorSendingBroadcastMessage nas escritas`, warnings.length === 0,
    [...new Set(warnings.map((w) => w.message))].slice(0, 5).join(' | '))
}

export function findPii(payload, piiValues = PII_VALUES) {
  const hits = []
  const visit = (v, path) => {
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (PII_KEYS.includes(k)) hits.push(`chave ${path}${k}`)
        visit(val, `${path}${k}.`)
      }
    } else if (typeof v === 'string' && piiValues.some((pv) => v.includes(pv))) {
      hits.push(`valor em ${path}`)
    }
  }
  visit(payload, '')
  return hits
}

/** Problemas do payload frente ao contrato (chaves exatas por tabela, escalares, null por statement). */
export function validatePayloadShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['payload não é objeto']
  const problems = []
  // `id` não vem da migration: o realtime.send do Supabase atual o acrescenta (UUID do envio)
  const top = Object.keys(payload).filter((k) => k !== 'id').sort().join(',')
  if (top !== 'commit_timestamp,eventType,new,old,table') problems.push(`chaves do topo: ${top}`)
  if ('id' in payload && !(typeof payload.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(payload.id))) {
    problems.push(`id do topo não é o UUID do realtime.send: ${JSON.stringify(payload.id)}`)
  }
  const spec = BROADCAST_PAYLOAD_KEYS[payload.table]
  if (!spec) return [...problems, `tabela fora do contrato: ${payload.table}`]
  if (!['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) problems.push(`eventType inválido: ${payload.eventType}`)
  if (typeof payload.commit_timestamp !== 'string') problems.push('commit_timestamp ausente')
  const statementLevel = (STATEMENT_LEVEL_EVENTS[payload.table] ?? []).includes(payload.eventType)
  const expected = {
    new: statementLevel || payload.eventType === 'DELETE' ? null : spec.new,
    old: statementLevel || payload.eventType === 'INSERT' ? null : spec.old,
  }
  for (const side of ['new', 'old']) {
    const actual = payload[side]
    if (expected[side] === null) {
      if (actual !== null) problems.push(`${payload.table} ${payload.eventType}: ${side} deveria ser null`)
      continue
    }
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
      problems.push(`${payload.table} ${payload.eventType}: ${side} não é objeto`)
      continue
    }
    const keys = Object.keys(actual).sort()
    const want = [...expected[side]].sort()
    if (!sameList(keys, want)) problems.push(`${payload.table}.${side}: ${listDiff(keys, want)}`)
    for (const [k, v] of Object.entries(actual)) {
      if (v !== null && typeof v === 'object') problems.push(`${payload.table}.${side}.${k} não é escalar`)
    }
  }
  return problems
}

/** Todos os eventos desde `sinceSeq`: tópico/evento públicos, contrato exato e nenhuma PII. */
async function verifyAllPayloads(ex, label, sinceSeq = 0) {
  const events = await realtimeEventsSince(ex, sinceSeq)
  const shape = events.flatMap((e) => validatePayloadShape(e.payload).map((p) => `#${e.seq} ${p}`))
  const channel = events.filter((e) => e.topic !== 'dispara-db' || e.event !== 'db_change' || e.private !== false)
  check(`[${label}] os ${events.length} eventos seguem o contrato (dispara-db/db_change público; chaves exatas de new/old por tabela)`,
    events.length > 0 && shape.length === 0 && channel.length === 0,
    [...shape.slice(0, 6), ...channel.slice(0, 3).map((e) => `#${e.seq} canal ${e.topic}/${e.event}/private=${e.private}`)].join(' | ') || 'nenhum evento')
  const pii = events.flatMap((e) => findPii(e.payload).map((h) => `${e.payload?.table}: ${h}`))
  check(`[${label}] nenhum dos ${events.length} eventos contém PII`, pii.length === 0, [...new Set(pii)].slice(0, 10).join('; '))
}

/**
 * Joga OLD.updated_at da campanha para fora da janela de 2s do throttle. Como superusuário,
 * com session_replication_role = replica: nem o BEFORE set_updated_at nem as triggers de
 * broadcast disparam.
 */
export async function ageCampaignWindow(ex, campaignId, seconds = 10) {
  await asSuperuser(ex)
  await ex.exec(`SET session_replication_role = replica;
    UPDATE public.campaigns SET updated_at = now() - make_interval(secs => ${Number(seconds)}) WHERE id = '${campaignId.replace(/'/g, "''")}';
    SET session_replication_role = origin;`)
}

// ---------------------------------------------------------------------------
// Verificações com escrita (só no PGlite)
// ---------------------------------------------------------------------------
async function verifyRealtime(ex, label) {
  // Escreve como service_role (o que o app faz) — os triggers rodam como o dono.
  const write = (sql) => writeAs(ex, 'service_role', sql)

  const { events: inserted } = await delta(ex, () => write(`INSERT INTO public.campaigns (id, name, status) VALUES ('rt_c1', 'Campanha RT', 'Rascunho')`))
  check(`[${label}] INSERT em campaigns publica 1 evento`, inserted.length === 1, `eventos=${inserted.length}`)
  const [msg] = inserted
  check(`[${label}] evento no tópico público dispara-db/db_change`,
    msg && msg.topic === 'dispara-db' && msg.event === 'db_change' && msg.private === false, JSON.stringify(msg ?? {}))
  check(`[${label}] payload traz table/eventType`, msg?.payload?.table === 'campaigns' && msg?.payload?.eventType === 'INSERT', JSON.stringify(msg?.payload ?? {}))

  // Mudança de status sempre publica
  const { events: statusEvents } = await delta(ex, () => write(`UPDATE public.campaigns SET status = 'Enviando' WHERE id = 'rt_c1'`))
  check(`[${label}] mudança de status de campanha publica`, statusEvents.length === 1)

  // Rajada de contadores, 1 requisição (transação) por incremento como os webhooks. O
  // throttle publica quando o UPDATE cai numa janela de 2s diferente da do anterior: conta
  // essas trocas pelo updated_at que o BEFORE set_updated_at grava (= now() de cada
  // transação) e exige exatamente esse número — sem depender de quanto o CI demora.
  const windowOf = async () =>
    (await ex.query(`SELECT floor(extract(epoch FROM updated_at) / 2)::text AS w FROM public.campaigns WHERE id = 'rt_c1'`))[0].w
  let previousWindow = await windowOf()
  let crossings = 0
  const { events: burst } = await delta(ex, async () => {
    for (let i = 0; i < 10; i++) {
      await write(`SELECT public.increment_campaign_stat('rt_c1'::text, 'delivered'::text)`)
      const current = await windowOf()
      if (current !== previousWindow) crossings++
      previousWindow = current
    }
  })
  check(`[${label}] 10 incrementos seguidos (1 transação cada) publicam exatamente 1 evento por troca de janela de 2s (${crossings} nesta execução; sem throttle seriam 10)`,
    burst.length === crossings, `eventos=${burst.length} trocas=${crossings}`)

  // UPDATE só de lock (try_lock/release_campaign_dispatch_lock) não publica. Janela
  // envelhecida e valor NOVO de verdade: se dispatch_lock_* entrasse no WHEN, publicaria —
  // o throttle não mascara a regressão (na mesma janela do UPDATE anterior, mascararia).
  await ageCampaignWindow(ex, 'rt_c1')
  const { events: lockEvents } = await delta(ex, () =>
    write(`UPDATE public.campaigns SET dispatch_lock_until = now() + interval '6 minutes', dispatch_locked_by = 'rt_worker' WHERE id = 'rt_c1'`))
  check(`[${label}] UPDATE só de dispatch_lock_* (valor novo, janela do throttle aberta) não publica`, lockEvents.length === 0, `eventos=${lockEvents.length}`)
  await ageCampaignWindow(ex, 'rt_c1')
  const { events: lockControl } = await delta(ex, () =>
    write(`UPDATE public.campaigns SET dispatch_lock_until = NULL, dispatch_locked_by = NULL, sent = coalesce(sent, 0) + 1 WHERE id = 'rt_c1'`))
  check(`[${label}] (controle) o mesmo UPDATE de lock com um contador junto publica (a janela estava aberta)`, lockControl.length === 1, `eventos=${lockControl.length}`)

  // Contatos (statement-level, sem linha)
  const { events: contactEvents } = await delta(ex, () =>
    write(`INSERT INTO public.contacts (id, phone, name, email) VALUES ('rt_ct1', '5511987654321', 'Maria Teste', 'maria@teste.com')`))
  check(`[${label}] INSERT em contacts publica 1 sinal`, contactEvents.length === 1)

  // Inbox: mensagem recebida publica; cópia de template de campanha não
  await write(`INSERT INTO public.inbox_conversations (id, phone, contact_id) VALUES ('11111111-1111-1111-1111-111111111111', '5511987654321', 'rt_ct1')`)
  const { events: inbound } = await delta(ex, () =>
    write(`INSERT INTO public.inbox_messages (conversation_id, direction, content) VALUES ('11111111-1111-1111-1111-111111111111', 'inbound', 'mensagem secreta do cliente')`))
  check(`[${label}] mensagem recebida no inbox publica`, inbound.length === 1, `eventos=${inbound.length}`)
  const { events: copy } = await delta(ex, () =>
    write(`INSERT INTO public.inbox_messages (conversation_id, direction, content, payload) VALUES ('11111111-1111-1111-1111-111111111111', 'outbound', 'template', '{"type":"campaign_template"}'::jsonb)`))
  check(`[${label}] cópia de template de campanha no inbox NÃO publica (volume do disparo)`, copy.length === 0, `eventos=${copy.length}`)

  await verifyRealtimeUpdateFilters(ex, label, write)
  checkNoBroadcastWarnings(ex, label)
}

/**
 * WHEN do UPDATE de templates / flows / template_project_items: reescrita sem mudança
 * visível (sync da Meta, salvar/checar flow, sync de projeto) não publica.
 */
async function verifyRealtimeUpdateFilters(ex, label, write) {
  const count = async (sql) => (await delta(ex, () => write(sql))).events.length

  // templates: syncTemplatesToLocalDb faz upsert de TODOS (onConflict name,language) com
  // fetched_at/updated_at novos a cada GET /api/templates
  const templateSync = (rejectFirst) => `
    INSERT INTO public.templates (name, language, category, status, parameter_format, components, spec_hash, fetched_at, updated_at)
    SELECT 'rt_tpl_' || g, 'pt_BR', 'MARKETING', CASE WHEN g = 1 AND ${rejectFirst} THEN 'REJECTED' ELSE 'APPROVED' END,
           'positional', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', 'Olá {{1}} #' || g)), 'hash_' || g, now(), now()
    FROM generate_series(1, 20) AS g
    ON CONFLICT (name, language) DO UPDATE SET
      category = EXCLUDED.category, status = EXCLUDED.status, parameter_format = EXCLUDED.parameter_format,
      components = EXCLUDED.components, spec_hash = EXCLUDED.spec_hash,
      fetched_at = EXCLUDED.fetched_at, updated_at = EXCLUDED.updated_at`
  let n = await count(templateSync(false))
  check(`[${label}] templates: 1º sync (20 novos) publica 20 INSERTs`, n === 20, `eventos=${n}`)
  n = await count(templateSync(false))
  check(`[${label}] templates: sync sem mudança real (upsert dos 20) não publica`, n === 0, `eventos=${n}`)
  const rejected = await delta(ex, () => write(templateSync(true)))
  const tpl = rejected.events[0]
  check(`[${label}] templates: sync com 1 status mudado publica só 1 UPDATE (com id/status)`,
    rejected.events.length === 1 && tpl?.payload?.eventType === 'UPDATE' && tpl?.payload?.new?.status === 'REJECTED' && !!tpl?.payload?.new?.id,
    `eventos=${rejected.events.length} ${JSON.stringify(tpl?.payload ?? {})}`)
  n = await count(`UPDATE public.templates SET header_media_preview_url = 'https://exemplo.test/assinada?t=' || md5(random()::text), header_media_preview_updated_at = now() WHERE name = 'rt_tpl_2'`)
  check(`[${label}] templates: URL assinada do preview regravada pelo disparo não publica`, n === 0, `eventos=${n}`)
  n = await count(`UPDATE public.templates SET components = '[{"type":"BODY","text":"novo"}]'::jsonb WHERE name = 'rt_tpl_3'`)
  check(`[${label}] templates: conteúdo (components) mudado publica`, n === 1, `eventos=${n}`)
  n = await count(`DELETE FROM public.templates WHERE name = 'rt_tpl_20'`)
  check(`[${label}] templates: DELETE publica`, n === 1, `eventos=${n}`)

  // flows: salvar sem mudança e checar status na Meta só mexem em updated_at/meta_last_checked_at
  await write(`INSERT INTO public.flows (id, name) VALUES ('rt_fl1', 'Fluxo RT')`)
  n = await count(`UPDATE public.flows SET updated_at = now(), meta_last_checked_at = now() WHERE id = 'rt_fl1'`)
  check(`[${label}] flows: UPDATE só de updated_at/meta_last_checked_at não publica`, n === 0, `eventos=${n}`)
  n = await count(`UPDATE public.flows SET spec = '{"form":{"fields":[{"id":"nome"}]}}'::jsonb WHERE id = 'rt_fl1'`)
  check(`[${label}] flows: spec mudado publica`, n === 1, `eventos=${n}`)
  n = await count(`UPDATE public.flows SET meta_status = 'PUBLISHED', meta_flow_id = '123', meta_last_checked_at = now() WHERE id = 'rt_fl1'`)
  check(`[${label}] flows: status na Meta mudado publica`, n === 1, `eventos=${n}`)

  // template_project_items: o sync de projeto regrava meta_id/meta_status de todos os itens
  await write(`
    INSERT INTO public.template_projects (id, title) VALUES ('rt_tp1', 'Projeto RT');
    INSERT INTO public.template_project_items (id, project_id, name, content, meta_id, meta_status)
    SELECT 'rt_tpi' || g, 'rt_tp1', 'item_rt_' || g, 'Olá {{1}}', 'meta_' || g, 'PENDING' FROM generate_series(1, 10) AS g`)
  n = await count(`UPDATE public.template_project_items SET meta_id = meta_id, meta_status = meta_status WHERE project_id = 'rt_tp1'`)
  check(`[${label}] template_project_items: sync sem mudança (10 itens) não publica`, n === 0, `eventos=${n}`)
  const item = await delta(ex, () => write(`UPDATE public.template_project_items SET meta_status = 'APPROVED' WHERE id = 'rt_tpi1'`))
  const itemPayload = item.events[0]?.payload
  check(`[${label}] template_project_items: meta_status mudado publica 1 evento com project_id (filtro do detalhe)`,
    item.events.length === 1 && itemPayload?.new?.project_id === 'rt_tp1' && itemPayload?.old?.project_id === 'rt_tp1',
    `eventos=${item.events.length} ${JSON.stringify(itemPayload ?? {})}`)
}

// --- B. Matriz por tabela ---------------------------------------------------
const MX_CONV_1 = '33333333-3333-3333-3333-333333333331'
const MX_CONV_2 = '33333333-3333-3333-3333-333333333332'
const MX_MSG_1 = '44444444-4444-4444-4444-444444444441'
const MX_MSG_2 = '44444444-4444-4444-4444-444444444442'

/**
 * Por tabela com trigger: INSERT, UPDATEs (que publicam e que não publicam) e DELETE como
 * service_role, com o Δ de eventos esperado. `where` = linha onde a PII é semeada.
 * Passo com `expect: null` é preparo (não conta, mas os eventos entram no contrato/PII).
 */
function matrixSpecs() {
  return [
    {
      table: 'account_alerts', where: `id = 'mx_al1'`,
      insert: `INSERT INTO public.account_alerts (id, type, code, message, details) VALUES ('mx_al1', 'payment', 131042, ${PII_SQL}, ${PII_JSONB_SQL})`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE de dismissed', op: 'UPDATE', expect: 1, sql: `UPDATE public.account_alerts SET dismissed = true WHERE id = 'mx_al1'` },
        { label: 'UPDATE sem mudança (sem WHEN: publica)', op: 'UPDATE', expect: 1, sql: `UPDATE public.account_alerts SET dismissed = dismissed WHERE id = 'mx_al1'` },
        { label: 'DELETE', op: 'DELETE', expect: 1, sql: `DELETE FROM public.account_alerts WHERE id = 'mx_al1'` },
      ],
    },
    {
      table: 'template_projects', where: `id = 'mx_tp1'`,
      insert: `INSERT INTO public.template_projects (id, title, prompt, user_id) VALUES ('mx_tp1', ${PII_SQL}, ${PII_SQL}, 'mx_user')`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE de status', op: 'UPDATE', expect: 1, sql: `UPDATE public.template_projects SET status = 'submitted' WHERE id = 'mx_tp1'` },
        { label: 'UPDATE de contadores', op: 'UPDATE', expect: 1, sql: `UPDATE public.template_projects SET template_count = 3, approved_count = 1 WHERE id = 'mx_tp1'` },
        { label: 'DELETE', op: 'DELETE', expect: 1, sql: `DELETE FROM public.template_projects WHERE id = 'mx_tp1'` },
        { label: '(preparo) projeto com 3 itens', expect: null, sql: `
            INSERT INTO public.template_projects (id, title) VALUES ('mx_tp9', 'Projeto com itens');
            INSERT INTO public.template_project_items (id, project_id, name, content)
            SELECT 'mx_tp9_i' || g, 'mx_tp9', 'item_' || g, ${PII_SQL} FROM generate_series(1, 3) AS g` },
        { label: 'DELETE do projeto com 3 itens (cascata publica o projeto e cada item)', expect: 4,
          sql: `DELETE FROM public.template_projects WHERE id = 'mx_tp9'` },
      ],
    },
    {
      table: 'template_project_items', where: `id = 'mx_tpi1'`,
      setup: [`INSERT INTO public.template_projects (id, title) VALUES ('mx_tp2', 'Projeto matriz')`],
      insert: `INSERT INTO public.template_project_items (id, project_id, name, content, header, buttons) VALUES ('mx_tpi1', 'mx_tp2', 'item_matriz', ${PII_SQL}, ${PII_JSONB_SQL}, jsonb_build_array(${PII_JSONB_SQL}))`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE de meta_status', op: 'UPDATE', expect: 1, sql: `UPDATE public.template_project_items SET meta_status = 'APPROVED' WHERE id = 'mx_tpi1'` },
        { label: 'UPDATE só de updated_at', op: 'UPDATE', expect: 0, sql: `UPDATE public.template_project_items SET updated_at = now() WHERE id = 'mx_tpi1'` },
        { label: 'DELETE', op: 'DELETE', expect: 1, sql: `DELETE FROM public.template_project_items WHERE id = 'mx_tpi1'` },
      ],
    },
    {
      table: 'templates', where: `id = 'mx_tpl1'`,
      insert: `INSERT INTO public.templates (id, name, language, category, status, components) VALUES ('mx_tpl1', 'mx_template', 'pt_BR', 'MARKETING', 'APPROVED', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', ${PII_SQL})))`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE de status', op: 'UPDATE', expect: 1, sql: `UPDATE public.templates SET status = 'PAUSED' WHERE id = 'mx_tpl1'` },
        { label: 'UPDATE só de fetched_at/spec_hash/updated_at (sync)', op: 'UPDATE', expect: 0,
          sql: `UPDATE public.templates SET fetched_at = now(), spec_hash = md5(random()::text), updated_at = now() WHERE id = 'mx_tpl1'` },
        { label: 'UPDATE só de header_media_preview_*', op: 'UPDATE', expect: 0,
          sql: `UPDATE public.templates SET header_media_preview_url = 'https://exemplo.test/x', header_media_preview_expires_at = now(), header_media_preview_updated_at = now() WHERE id = 'mx_tpl1'` },
        { label: 'DELETE', op: 'DELETE', expect: 1, sql: `DELETE FROM public.templates WHERE id = 'mx_tpl1'` },
      ],
    },
    {
      table: 'flows', where: `id = 'mx_fl1'`,
      insert: `INSERT INTO public.flows (id, name, spec, flow_json) VALUES ('mx_fl1', ${PII_SQL}, ${PII_JSONB_SQL}, ${PII_JSONB_SQL})`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE de status', op: 'UPDATE', expect: 1, sql: `UPDATE public.flows SET status = 'PUBLISHED' WHERE id = 'mx_fl1'` },
        { label: 'UPDATE só de updated_at/meta_last_checked_at', op: 'UPDATE', expect: 0,
          sql: `UPDATE public.flows SET updated_at = now(), meta_last_checked_at = now() WHERE id = 'mx_fl1'` },
        { label: 'DELETE', op: 'DELETE', expect: 1, sql: `DELETE FROM public.flows WHERE id = 'mx_fl1'` },
      ],
    },
    {
      table: 'flow_submissions', where: `id = 'mx_fs1'`,
      setup: [`INSERT INTO public.campaigns (id, name) VALUES ('mx_c_fs', 'Campanha com flow'); INSERT INTO public.flows (id, name) VALUES ('mx_fl_fs', 'Flow da campanha')`],
      insert: `INSERT INTO public.flow_submissions (id, message_id, from_phone, response_json_raw, response_json, campaign_id, flow_id, flow_local_id)
               VALUES ('mx_fs1', 'wamid.mx_fs1', '5511987654321', ${PII_SQL}, ${PII_JSONB_SQL}, 'mx_c_fs', 'meta_flow_1', 'mx_fl_fs')`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE de mapped_data (sem trigger de UPDATE)', op: 'UPDATE', expect: 0,
          sql: `UPDATE public.flow_submissions SET mapped_data = ${PII_JSONB_SQL}, mapped_at = now() WHERE id = 'mx_fs1'` },
        { label: 'DELETE do flow (o SET NULL em flow_submissions não publica)', op: 'DELETE', table: 'flows', expect: 1,
          sql: `DELETE FROM public.flows WHERE id = 'mx_fl_fs'` },
        { label: 'DELETE (sem trigger de DELETE)', op: 'DELETE', expect: 0, sql: `DELETE FROM public.flow_submissions WHERE id = 'mx_fs1'` },
      ],
    },
    {
      table: 'inbox_conversations', where: `id = '${MX_CONV_1}'`,
      insert: `INSERT INTO public.inbox_conversations (id, phone, last_message_preview, handoff_summary, automation_paused_by)
               VALUES ('${MX_CONV_1}', '5511987654321', ${PII_SQL}, ${PII_SQL}, 'Maria Teste')`,
      insertExpect: 0,
      steps: [
        { label: 'contador de saída (increment_conversation_counters outbound)', op: 'UPDATE', expect: 0,
          sql: `SELECT public.increment_conversation_counters('${MX_CONV_1}'::uuid, 'outbound', ${PII_SQL})` },
        { label: 'UPDATE de status (fechar)', op: 'UPDATE', expect: 1, sql: `UPDATE public.inbox_conversations SET status = 'closed' WHERE id = '${MX_CONV_1}'` },
        { label: 'UPDATE de prioridade', op: 'UPDATE', expect: 1, sql: `UPDATE public.inbox_conversations SET priority = 'high' WHERE id = '${MX_CONV_1}'` },
        { label: 'modo humano (mode/human_mode_expires_at)', op: 'UPDATE', expect: 1,
          sql: `UPDATE public.inbox_conversations SET mode = 'human', human_mode_expires_at = now() + interval '1 hour' WHERE id = '${MX_CONV_1}'` },
        { label: 'UPDATE só de last_message_preview/updated_at', op: 'UPDATE', expect: 0,
          sql: `UPDATE public.inbox_conversations SET last_message_preview = ${PII_SQL}, updated_at = now() WHERE id = '${MX_CONV_1}'` },
        { label: '(preparo) 1 mensagem na conversa', expect: null,
          sql: `INSERT INTO public.inbox_messages (conversation_id, direction, content) VALUES ('${MX_CONV_1}', 'inbound', ${PII_SQL})` },
        { label: 'DELETE da conversa (1 por linha + 1 do DELETE em cascata das mensagens, por statement)', expect: 2,
          sql: `DELETE FROM public.inbox_conversations WHERE id = '${MX_CONV_1}'` },
      ],
    },
    {
      table: 'inbox_messages', where: `id = '${MX_MSG_1}'`,
      setup: [`INSERT INTO public.inbox_conversations (id, phone) VALUES ('${MX_CONV_2}', '5511987654321')`],
      insert: `INSERT INTO public.inbox_messages (id, conversation_id, direction, content, media_url, ai_sources, payload)
               VALUES ('${MX_MSG_1}', '${MX_CONV_2}', 'inbound', ${PII_SQL}, 'https://exemplo.test/midia.jpg', ${PII_JSONB_SQL}, ${PII_JSONB_SQL})`,
      insertExpect: 1,
      steps: [
        { label: 'status de entrega mudou', op: 'UPDATE', expect: 1, sql: `UPDATE public.inbox_messages SET delivery_status = 'delivered', delivered_at = now() WHERE id = '${MX_MSG_1}'` },
        { label: 'mesmo status de novo (webhook repetido)', op: 'UPDATE', expect: 0, sql: `UPDATE public.inbox_messages SET delivery_status = 'delivered' WHERE id = '${MX_MSG_1}'` },
        { label: 'cópia de template de campanha (INSERT)', op: 'INSERT', expect: 0,
          sql: `INSERT INTO public.inbox_messages (id, conversation_id, direction, content, message_type, delivery_status, payload)
                VALUES ('${MX_MSG_2}', '${MX_CONV_2}', 'outbound', ${PII_SQL}, 'template', 'sent',
                        jsonb_build_object('type', 'campaign_template', 'campaign_id', 'mx', 'resolved_values', jsonb_build_object('1', 'Maria Teste')))` },
        { label: 'status da cópia de template (webhook)', op: 'UPDATE', expect: 0,
          sql: `UPDATE public.inbox_messages SET delivery_status = 'read', read_at = now() WHERE id = '${MX_MSG_2}'` },
        { label: 'DELETE de 2 mensagens num statement (1 evento por statement)', op: 'DELETE', expect: 1,
          sql: `DELETE FROM public.inbox_messages WHERE conversation_id = '${MX_CONV_2}'` },
      ],
    },
    {
      table: 'contacts', where: `id = 'mx_ct1'`,
      insert: `INSERT INTO public.contacts (id, phone, name, email, notes, custom_fields, tags)
               SELECT 'mx_ct' || g, '+55119876500' || g, 'Maria Teste ' || g, 'maria' || g || '@teste.com', ${PII_SQL}, ${PII_JSONB_SQL}, '["vip"]'::jsonb
               FROM generate_series(1, 3) AS g`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE dos 3 num statement (bulk update)', op: 'UPDATE', expect: 1, sql: `UPDATE public.contacts SET tags = '["vip","novo"]'::jsonb WHERE starts_with(id, 'mx_ct')` },
        { label: 'UPDATE sem linha afetada (trigger por STATEMENT publica mesmo assim)', op: 'UPDATE', expect: 1,
          sql: `UPDATE public.contacts SET notes = 'x' WHERE id = 'mx_inexistente'` },
        { label: 'DELETE dos 3 num statement', op: 'DELETE', expect: 1, sql: `DELETE FROM public.contacts WHERE starts_with(id, 'mx_ct')` },
      ],
    },
    {
      table: 'campaigns', where: `id = 'mx_c1'`,
      insert: `INSERT INTO public.campaigns (id, name, status, template_name, template_variables, quick_reply_responses, fallback_response)
               VALUES ('mx_c1', ${PII_SQL}, 'Rascunho', 'promo', ${PII_JSONB_SQL}, ${PII_JSONB_SQL}, ${PII_SQL})`,
      insertExpect: 1,
      steps: [
        { label: 'UPDATE de status', op: 'UPDATE', expect: 1, sql: `UPDATE public.campaigns SET status = 'Enviando', started_at = now() WHERE id = 'mx_c1'` },
        // `age`: envelhece a janela do throttle antes do passo (senão ele mascararia um
        // UPDATE que não deveria publicar, e o de contador dependeria do relógio)
        { label: 'contador com a janela do throttle aberta', op: 'UPDATE', expect: 1, age: 'mx_c1',
          sql: `UPDATE public.campaigns SET sent = coalesce(sent, 0) + 1 WHERE id = 'mx_c1'` },
        { label: 'UPDATE só de dispatch_lock_* (valor novo, janela aberta)', op: 'UPDATE', expect: 0, age: 'mx_c1',
          sql: `UPDATE public.campaigns SET dispatch_lock_until = now() + interval '6 minutes', dispatch_locked_by = 'mx_worker' WHERE id = 'mx_c1'` },
        { label: 'fila em campaign_contacts (sem trigger)', expect: 0,
          sql: `INSERT INTO public.campaign_contacts (campaign_id, phone, name, status) SELECT 'mx_c1', '+55119000000' || g, 'Maria Teste', 'pending' FROM generate_series(1, 2) AS g` },
        { label: 'DELETE (a cascata em campaign_contacts não publica)', op: 'DELETE', expect: 1, sql: `DELETE FROM public.campaigns WHERE id = 'mx_c1'` },
      ],
    },
  ]
}

/** Semeia PII em toda coluna texto/jsonb que NÃO está na whitelist do payload (nem é PK/FK). */
async function seedPiiColumns(ex, table, where) {
  const allowed = new Set([...(BROADCAST_PAYLOAD_KEYS[table]?.new ?? []), ...(BROADCAST_PAYLOAD_KEYS[table]?.old ?? [])])
  const cols = await ex.query(`
    SELECT a.attname AS col, a.atttypid::regtype::text AS type
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.' || $1) AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      AND a.atttypid IN ('text'::regtype, 'varchar'::regtype, 'jsonb'::regtype, 'json'::regtype, 'text[]'::regtype)
      AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = a.attrelid AND k.contype IN ('p', 'f') AND a.attnum = ANY(k.conkey))
    ORDER BY a.attnum`, [table])
  const seeded = []
  const skipped = []
  for (const { col, type } of cols) {
    if (allowed.has(col)) continue
    const value = type === 'jsonb' ? PII_JSONB_SQL : type === 'json' ? `${PII_JSONB_SQL}::json` : type === 'text[]' ? `ARRAY[${PII_SQL}]` : PII_SQL
    const err = await tryAsRole(ex, 'service_role', `UPDATE public.${table} SET ${col} = ${value} WHERE ${where}`)
    if (err) skipped.push(`${table}.${col} (${err})`)
    else seeded.push(col)
  }
  return { seeded, skipped }
}

async function runMatrixStep(ex, label, table, step) {
  if (step.age) await ageCampaignWindow(ex, step.age)
  const { events } = await delta(ex, () => writeAs(ex, 'service_role', step.sql))
  if (step.expect === null) return
  const target = step.table ?? table
  const wrongKind = step.op ? events.filter((e) => e.payload?.table !== target || e.payload?.eventType !== step.op) : []
  check(`[${label}] ${target}: ${step.label} → ${step.expect} evento(s)`, events.length === step.expect && wrongKind.length === 0,
    `eventos=${events.length}: ${summarizeEvents(events)}`)
}

async function verifyBroadcastMatrix(ex, label) {
  const seq0 = await realtimeMaxSeq(ex)
  const seeded = {}
  const skipped = []
  for (const spec of matrixSpecs()) {
    for (const sql of spec.setup ?? []) await writeAs(ex, 'service_role', sql)
    await runMatrixStep(ex, label, spec.table, { label: 'INSERT', op: 'INSERT', expect: spec.insertExpect, sql: spec.insert })
    const s = await seedPiiColumns(ex, spec.table, spec.where)
    seeded[spec.table] = s.seeded
    skipped.push(...s.skipped)
    for (const step of spec.steps) await runMatrixStep(ex, label, spec.table, step)
  }
  const empty = Object.entries(seeded).filter(([, cols]) => cols.length === 0).map(([t]) => t)
  const total = Object.values(seeded).reduce((acc, cols) => acc + cols.length, 0)
  check(`[${label}] matriz: PII semeada em toda coluna texto/jsonb fora da whitelist (${total} colunas em ${Object.keys(seeded).length} tabelas)`,
    empty.length === 0 && Object.keys(seeded).length === Object.keys(BROADCAST_PAYLOAD_KEYS).length, `sem coluna semeada: ${empty.join(', ')}`)
  if (skipped.length) info(`colunas que recusaram o texto de PII pela própria restrição (CHECK): ${skipped.join(', ')}`)
  await verifyAllPayloads(ex, `${label}: matriz`, seq0)
  checkNoBroadcastWarnings(ex, `${label}: matriz`)
}

// --- D. RPCs reais como service_role ---------------------------------------
async function verifyRpcs(ex, label) {
  const svc = (sql, params) => queryAs(ex, 'service_role', sql, params)
  const write = (sql) => writeAs(ex, 'service_role', sql)
  const phone = '+5511900000101'
  const conversation = async (id) => (await ex.query(`SELECT contact_id, unread_count, total_messages, status FROM public.inbox_conversations WHERE id = $1`, [id]))[0]

  await write(`INSERT INTO public.contacts (id, phone, name, email) VALUES ('rpc_ct1', '${phone}', 'Maria Teste', 'maria@teste.com')`)

  // process_inbound_message
  let d = await delta(ex, () => svc(`SELECT public.process_inbound_message($1, $2, $3) AS r`, [phone, 'mensagem secreta do cliente', 'wamid.rpc.in1']))
  const first = d.result[0]?.r
  const convId = first?.conversation_id
  let conv = await conversation(convId)
  check(`[${label}] process_inbound_message: 1ª mensagem cria a conversa (ligada ao contato pelo telefone) e publica só o INSERT da mensagem`,
    first?.is_new_conversation === true && conv?.contact_id === 'rpc_ct1' && conv?.unread_count === 1
      && d.events.length === 1 && d.events[0].payload?.table === 'inbox_messages' && d.events[0].payload?.new?.conversation_id === convId,
    JSON.stringify({ first, conv, eventos: summarizeEvents(d.events) }))
  d = await delta(ex, () => svc(`SELECT public.process_inbound_message($1, $2, $3) AS r`, [phone, 'outra mensagem', 'wamid.rpc.in2']))
  const second = d.result[0]?.r
  conv = await conversation(convId)
  check(`[${label}] process_inbound_message: 2ª mensagem reaproveita a conversa (unread 2, total 2) e publica o UPDATE da conversa + o INSERT da mensagem`,
    second?.is_new_conversation === false && second?.conversation_id === convId && conv?.unread_count === 2 && conv?.total_messages === 2
      && sameList(d.events.map((e) => `${e.payload?.table}/${e.payload?.eventType}`).sort(), ['inbox_conversations/UPDATE', 'inbox_messages/INSERT']),
    JSON.stringify({ second, conv, eventos: summarizeEvents(d.events) }))

  // increment_conversation_counters (SELECT * FROM: a função roda uma vez só)
  d = await delta(ex, () => svc(`SELECT * FROM public.increment_conversation_counters($1::uuid, 'outbound', $2)`, [convId, 'resposta do atendente']))
  check(`[${label}] increment_conversation_counters (saída): total 3, não lidas inalteradas (2), nenhum evento`,
    d.result[0]?.total_messages === 3 && d.result[0]?.unread_count === 2 && d.events.length === 0, JSON.stringify({ r: d.result[0], eventos: summarizeEvents(d.events) }))
  d = await delta(ex, () => svc(`SELECT * FROM public.increment_conversation_counters($1::uuid, 'inbound', $2)`, [convId, 'mais uma do cliente']))
  check(`[${label}] increment_conversation_counters (entrada): total 4, não lidas 3, 1 UPDATE`,
    d.result[0]?.total_messages === 4 && d.result[0]?.unread_count === 3 && d.events.length === 1 && d.events[0].payload?.eventType === 'UPDATE',
    JSON.stringify({ r: d.result[0], eventos: summarizeEvents(d.events) }))

  // reset_unread_count
  d = await delta(ex, () => svc(`SELECT * FROM public.reset_unread_count($1::uuid)`, [convId]))
  const again = await delta(ex, () => svc(`SELECT * FROM public.reset_unread_count($1::uuid)`, [convId]))
  check(`[${label}] reset_unread_count: zera as não lidas e publica 1 UPDATE; repetir não publica`,
    d.result[0]?.unread_count === 0 && d.events.length === 1 && again.result[0]?.unread_count === 0 && again.events.length === 0,
    JSON.stringify({ r: d.result[0], eventos: summarizeEvents(d.events), repetido: summarizeEvents(again.events) }))

  // Campanha + fila
  await write(`
    INSERT INTO public.campaigns (id, name, status) VALUES ('rpc_c1', 'Campanha RPC', 'Enviando');
    INSERT INTO public.contacts (id, phone, name) SELECT 'rpc_q' || g, '+5511900001' || lpad(g::text, 3, '0'), 'Cliente ' || g FROM generate_series(1, 5) AS g;
    INSERT INTO public.campaign_contacts (campaign_id, contact_id, phone, status) SELECT 'rpc_c1', id, phone, 'pending' FROM public.contacts WHERE starts_with(id, 'rpc_q');
    INSERT INTO public.campaign_contacts (campaign_id, contact_id, phone, status) VALUES ('rpc_c1', NULL, '+5511900001999', 'pending')`)

  // try_lock / release_campaign_dispatch_lock
  const lockSeq = await realtimeMaxSeq(ex)
  const lockW1 = (await svc(`SELECT public.try_lock_campaign_dispatch('rpc_c1', 'w1', 360) AS ok`))[0].ok
  const lockW2 = (await svc(`SELECT public.try_lock_campaign_dispatch('rpc_c1', 'w2', 360) AS ok`))[0].ok
  await svc(`SELECT public.release_campaign_dispatch_lock('rpc_c1', 'w2')`)
  const [held] = await ex.query(`SELECT dispatch_locked_by, dispatch_lock_until > now() + interval '300 seconds' AS ttl_ok FROM public.campaigns WHERE id = 'rpc_c1'`)
  await svc(`SELECT public.release_campaign_dispatch_lock('rpc_c1', 'w1')`)
  const [released] = await ex.query(`SELECT dispatch_locked_by, dispatch_lock_until FROM public.campaigns WHERE id = 'rpc_c1'`)
  const relockW2 = (await svc(`SELECT public.try_lock_campaign_dispatch('rpc_c1', 'w2', 360) AS ok`))[0].ok
  await svc(`SELECT public.release_campaign_dispatch_lock('rpc_c1', 'w2')`)
  const lockEvents = await realtimeEventsSince(ex, lockSeq)
  check(`[${label}] try_lock/release_campaign_dispatch_lock: CAS por worker (w1 pega, w2 não; release de outro worker não solta; TTL ≥ 300s; solto, w2 pega) e nenhum evento`,
    lockW1 === true && lockW2 === false && held?.dispatch_locked_by === 'w1' && held?.ttl_ok === true
      && released?.dispatch_locked_by === null && released?.dispatch_lock_until === null && relockW2 === true && lockEvents.length === 0,
    JSON.stringify({ lockW1, lockW2, held, released, relockW2, eventos: summarizeEvents(lockEvents) }))

  // claim_campaign_batch
  const claimSeq = await realtimeMaxSeq(ex)
  const b1 = await svc(`SELECT * FROM public.claim_campaign_batch('rpc_c1', 3, 'trace_rpc', 'w1', 600)`)
  const b2 = await svc(`SELECT * FROM public.claim_campaign_batch('rpc_c1', 10, 'trace_rpc', 'w1', 600)`)
  const b3 = await svc(`SELECT * FROM public.claim_campaign_batch('rpc_c1', 10, 'trace_rpc', 'w1', 600)`)
  const b0 = await svc(`SELECT * FROM public.claim_campaign_batch('rpc_c1', 0, 'trace_rpc', 'w1', 600)`)
  const claimed = [...b1, ...b2]
  const claimEvents = await realtimeEventsSince(ex, claimSeq)
  check(`[${label}] claim_campaign_batch: lotes disjuntos (3 + 2) em 'sending' com lease/worker/tentativa; linha sem contact_id nunca é claimada; fila vazia e limite 0 devolvem 0; nenhum evento`,
    b1.length === 3 && b2.length === 2 && b3.length === 0 && b0.length === 0 && new Set(claimed.map((r) => r.id)).size === 5
      && claimed.every((r) => r.status === 'sending' && r.locked_by === 'w1' && r.attempts === 1 && r.trace_id === 'trace_rpc'
        && r.contact_id !== null && new Date(r.lease_until).getTime() > Date.now() + 500_000)
      && claimEvents.length === 0,
    JSON.stringify({ b1: b1.length, b2: b2.length, b3: b3.length, b0: b0.length, exemplo: claimed[0], eventos: summarizeEvents(claimEvents) }))

  // reap_stuck_campaign_sending
  const [sentId, poisonId] = claimed.map((r) => r.id)
  await write(`
    UPDATE public.campaign_contacts SET sending_at = now() - interval '20 minutes', lease_until = now() - interval '1 minute' WHERE campaign_id = 'rpc_c1' AND status = 'sending';
    UPDATE public.campaign_contacts SET message_id = 'wamid.rpc.enviado' WHERE id = '${sentId}';
    UPDATE public.campaign_contacts SET attempts = 5 WHERE id = '${poisonId}'`)
  const reaped = (await svc(`SELECT public.reap_stuck_campaign_sending(10, 5) AS n`))[0].n
  const reapedAgain = (await svc(`SELECT public.reap_stuck_campaign_sending(10, 5) AS n`))[0].n
  const statuses = Object.fromEntries((await ex.query(`SELECT id, status FROM public.campaign_contacts WHERE campaign_id = 'rpc_c1' AND contact_id IS NOT NULL`)).map((r) => [r.id, r.status]))
  const pendingCount = Object.values(statuses).filter((s) => s === 'pending').length
  check(`[${label}] reap_stuck_campaign_sending: enviado-sem-marcar → sent, poison → failed, órfãos → pending (5 linhas); 2ª passada não acha nada`,
    reaped === 5 && reapedAgain === 0 && statuses[sentId] === 'sent' && statuses[poisonId] === 'failed' && pendingCount === 3,
    JSON.stringify({ reaped, reapedAgain, statuses }))

  // increment_campaign_auto_reply_counters
  await svc(`SELECT public.increment_campaign_auto_reply_counters('rpc_c1', 'quick')`)
  await svc(`SELECT public.increment_campaign_auto_reply_counters('rpc_c1', 'fallback')`)
  const badMatch = await tryAsRole(ex, 'service_role', `SELECT public.increment_campaign_auto_reply_counters('rpc_c1', 'outro')`)
  const [auto] = await ex.query(`SELECT auto_reply_sent_count AS total, quick_reply_match_count AS quick, fallback_sent_count AS fallback FROM public.campaigns WHERE id = 'rpc_c1'`)
  const [cfg] = await ex.query(`SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.increment_campaign_auto_reply_counters(text, text)')`)
  check(`[${label}] increment_campaign_auto_reply_counters: quick e fallback contam (2/1/1), match_type inválido é recusado (P0001) e a função ganhou search_path fixo`,
    auto?.total === 2 && auto?.quick === 1 && auto?.fallback === 1 && badMatch === 'P0001' && (cfg?.proconfig ?? []).some((c) => c.startsWith('search_path=')),
    JSON.stringify({ auto, badMatch, proconfig: cfg?.proconfig }))

  // increment_campaign_stat (assinatura usada pelo app: text, text)
  for (const field of ['sent', 'delivered', 'delivered', 'read', 'failed', 'campo_desconhecido']) {
    await svc(`SELECT public.increment_campaign_stat($1::text, $2::text)`, ['rpc_c1', field])
  }
  const [stats] = await ex.query(`SELECT sent, delivered, read, failed FROM public.campaigns WHERE id = 'rpc_c1'`)
  check(`[${label}] increment_campaign_stat: sent 1, delivered 2, read 1, failed 1; campo desconhecido é ignorado`,
    stats?.sent === 1 && stats?.delivered === 2 && stats?.read === 1 && stats?.failed === 1, JSON.stringify(stats))

  // bulk_delete_contacts
  await write(`INSERT INTO public.flow_submissions (id, message_id, from_phone, response_json_raw, contact_id) VALUES ('rpc_fs1', 'wamid.rpc.fs1', '${phone}', '{}', 'rpc_ct1')`)
  d = await delta(ex, () => svc(`SELECT public.bulk_delete_contacts(ARRAY['rpc_ct1', 'rpc_q1']) AS n`))
  const [after] = await ex.query(`
    SELECT (SELECT count(*) FROM public.contacts WHERE id IN ('rpc_ct1', 'rpc_q1'))::int AS contacts,
           (SELECT contact_id FROM public.inbox_conversations WHERE id = $1) AS conv_contact,
           (SELECT count(*) FROM public.inbox_conversations WHERE id = $1)::int AS conversations,
           (SELECT count(*) FROM public.campaign_contacts WHERE campaign_id = 'rpc_c1' AND contact_id IS NULL)::int AS queue_unlinked,
           (SELECT contact_id FROM public.flow_submissions WHERE id = 'rpc_fs1') AS fs_contact`, [convId])
  check(`[${label}] bulk_delete_contacts: apaga 2 contatos, solta (SET NULL) conversa/fila/submissão e publica 1 evento (contacts, por statement)`,
    d.result[0]?.n === 2 && after.contacts === 0 && after.conversations === 1 && after.conv_contact === null && after.queue_unlinked === 2
      && after.fs_contact === null && d.events.length === 1 && d.events[0].payload?.table === 'contacts',
    JSON.stringify({ n: d.result[0]?.n, after, eventos: summarizeEvents(d.events) }))

  checkNoBroadcastWarnings(ex, `${label}: RPCs`)
}

// --- E. Throttle de campaigns: lado positivo -------------------------------
/**
 * Determinístico, sem esperar o relógio: os dois primeiros incrementos rodam na MESMA
 * transação (now() é o mesmo). O 1º publica porque OLD.updated_at foi envelhecido; o 2º
 * não, porque OLD.updated_at = now() da transação (mesma janela de 2s, onde quer que ela
 * caia). A "janela seguinte" é simulada envelhecendo o updated_at de novo.
 */
async function verifyThrottleWindow(ex, label) {
  const increment = () => writeAs(ex, 'service_role', `SELECT public.increment_campaign_stat('thr_c1'::text, 'delivered'::text)`)
  await writeAs(ex, 'service_role', `INSERT INTO public.campaigns (id, name, status) VALUES ('thr_c1', 'Campanha throttle', 'Enviando')`)

  await ageCampaignWindow(ex, 'thr_c1')
  let first
  let second
  let sameTransaction
  await ex.exec('BEGIN')
  try {
    first = await delta(ex, increment)
    second = await delta(ex, increment)
    ;[sameTransaction] = await ex.query(`SELECT updated_at = now() AS same_now, delivered FROM public.campaigns WHERE id = 'thr_c1'`)
    await ex.exec('COMMIT')
  } catch (error) {
    await ex.exec('ROLLBACK').catch(() => {})
    throw error
  }
  const p = first.events[0]?.payload
  check(`[${label}] throttle: 1º incremento com a janela envelhecida publica 1 UPDATE com old.status (transição detectável) e o contador novo`,
    first.events.length === 1 && p?.eventType === 'UPDATE' && p?.old?.status === 'Enviando' && p?.new?.delivered === 1 && p?.new?.status === 'Enviando',
    `eventos=${first.events.length} ${JSON.stringify(p ?? {})}`)
  check(`[${label}] throttle: 2º incremento na mesma transação (OLD.updated_at = now(): mesma janela de 2s) não publica`,
    second.events.length === 0 && sameTransaction?.same_now === true && sameTransaction?.delivered === 2,
    `eventos=${second.events.length} ${JSON.stringify(sameTransaction ?? {})}`)

  await ageCampaignWindow(ex, 'thr_c1')
  const third = await delta(ex, increment)
  check(`[${label}] throttle: na janela seguinte volta a publicar (delivered = 3)`,
    third.events.length === 1 && third.events[0].payload?.new?.delivered === 3, `eventos=${third.events.length} ${JSON.stringify(third.events[0]?.payload ?? {})}`)
  checkNoBroadcastWarnings(ex, `${label}: throttle`)
}

// --- C. Disparo real simulado ----------------------------------------------
/**
 * Um webhook de status como app/api/webhook/route.ts: recordStatusEvent (upsert por
 * dedupe_key) → applyStatusUpdateToCampaignContact (campaign_contacts + increment_campaign_stat)
 * → handleDeliveryStatus (inbox_messages) → markEventAttempt.
 */
async function simulateStatusWebhook(svc, wamid, status) {
  const [event] = await svc(`
    INSERT INTO public.whatsapp_status_events (message_id, status, event_ts, event_ts_raw, dedupe_key, payload, last_received_at)
    VALUES ($1, $2, now(), '1700000000', $3, '{"waba_id":"sim"}'::jsonb, now())
    ON CONFLICT (dedupe_key) DO UPDATE SET last_received_at = EXCLUDED.last_received_at RETURNING id`, [wamid, status, `${wamid}:${status}:1700000000`])

  const [row] = await svc(`SELECT id, status, campaign_id, phone, trace_id, delivered_at FROM public.campaign_contacts WHERE message_id = $1 LIMIT 1`, [wamid])
  const order = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 }
  let applied = false
  if (row && order[status] > (order[row.status] ?? 0)) {
    if (status === 'delivered') {
      const updated = await svc(`UPDATE public.campaign_contacts SET status = 'delivered', delivered_at = now() WHERE message_id = $1 AND status <> 'delivered' AND status <> 'read' RETURNING id`, [wamid])
      if (updated.length) {
        await svc(`SELECT public.increment_campaign_stat($1::text, 'delivered'::text)`, [row.campaign_id])
        applied = true
      }
    } else if (status === 'read') {
      const updated = await svc(`UPDATE public.campaign_contacts SET status = 'read', read_at = now() WHERE message_id = $1 AND status <> 'read' RETURNING id`, [wamid])
      if (updated.length) {
        if (!row.delivered_at) {
          const fixed = await svc(`UPDATE public.campaign_contacts SET delivered_at = now() WHERE message_id = $1 AND delivered_at IS NULL RETURNING id`, [wamid])
          if (fixed.length) await svc(`SELECT public.increment_campaign_stat($1::text, 'delivered'::text)`, [row.campaign_id])
        }
        await svc(`SELECT public.increment_campaign_stat($1::text, 'read'::text)`, [row.campaign_id])
        applied = true
      }
    }
  }

  const [message] = await svc(`SELECT id, conversation_id, delivery_status FROM public.inbox_messages WHERE whatsapp_message_id = $1`, [wamid])
  if (message) {
    const stamp = status === 'delivered' ? ', delivered_at = now()' : status === 'read' ? ', read_at = now()' : ''
    await svc(`UPDATE public.inbox_messages SET delivery_status = $2${stamp} WHERE id = $1`, [message.id, status])
  }

  await svc(`SELECT attempts FROM public.whatsapp_status_events WHERE id = $1`, [event.id])
  await svc(`
    UPDATE public.whatsapp_status_events
    SET apply_state = $2, applied = $3, applied_at = CASE WHEN $3 THEN now() END, last_attempt_at = now(), last_received_at = now(), attempts = attempts + 1
    WHERE id = $1`, [event.id, applied ? 'applied' : 'pending', applied])
}

/**
 * Uma campanha de N contatos pela sequência real do app (app/api/campaign/workflow/route.ts,
 * lib/inbox/*, lib/whatsapp-status-events.ts), cada chamada como uma requisição do
 * PostgREST (service_role, autocommit): lock → [claim → por contato: persistSentWithRetry,
 * syncCampaignTemplateToInbox (conversa + mensagem campaign_template +
 * increment_conversation_counters) → upsert em massa → métricas do lote → contadores] →
 * conclusão → release → webhooks sent/delivered/read de cada contato.
 */
async function verifyDispatchVolume(ex, label, { contacts: n = 50, batchSize = 10 } = {}) {
  const svc = (sql, params) => queryAs(ex, 'service_role', sql, params)
  const campaignId = 'sim_c1'
  const worker = 'sim_worker'
  const trace = 'sim_trace'

  // Preparo (fora da medição): import dos contatos, campanha, fila
  await svc(`
    INSERT INTO public.contacts (id, phone, name, email, custom_fields)
    SELECT 'sim_ct' || lpad(g::text, 3, '0'), '+55119' || lpad(g::text, 8, '0'), 'Maria Teste ' || g, 'maria' || g || '@teste.com', jsonb_build_object('cidade', 'São Paulo')
    FROM generate_series(1, ${n}) AS g`)
  await svc(`INSERT INTO public.campaigns (id, name, status, template_name, total_recipients) VALUES ($1, 'Campanha simulada', 'Agendado', 'promo', $2)`, [campaignId, n])
  await svc(`
    INSERT INTO public.campaign_contacts (campaign_id, contact_id, phone, name, email, custom_fields, status)
    SELECT $1, id, phone, name, email, custom_fields, 'pending' FROM public.contacts WHERE starts_with(id, 'sim_ct') ORDER BY id`, [campaignId])

  const t0 = Date.now()
  // campaignDb.start (dispatch) — o throttle conta a partir daqui
  await svc(`UPDATE public.campaigns SET status = 'Enviando', started_at = now(), updated_at = now() WHERE id = $1`, [campaignId])
  const seq0 = await realtimeMaxSeq(ex)

  const [lock] = await svc(`SELECT public.try_lock_campaign_dispatch($1, $2, 360) AS ok`, [campaignId, worker])
  let batches = 0
  for (;;) {
    await svc(`SELECT status FROM public.campaigns WHERE id = $1`, [campaignId])
    const claimed = await svc(`SELECT * FROM public.claim_campaign_batch($1, $2, $3, $4, 600)`, [campaignId, batchSize, trace, worker])
    if (claimed.length === 0) break
    batches++
    await svc(`SELECT status FROM public.campaigns WHERE id = $1`, [campaignId])
    for (const row of claimed) {
      const wamid = `wamid.sim.${row.contact_id}`
      // persistSentWithRetry → updateContactStatus('sent')
      await svc(`
        UPDATE public.campaign_contacts
        SET status = 'sent', sending_at = $3, message_id = $4, trace_id = $5, sent_at = now(), failed_at = NULL, skipped_at = NULL,
            error = NULL, skip_code = NULL, skip_reason = NULL, failure_code = NULL, failure_reason = NULL
        WHERE campaign_id = $1 AND contact_id = $2 AND status IN ('pending', 'sending', 'sent') RETURNING id`,
      [campaignId, row.contact_id, row.sending_at, wamid, trace])
      // syncCampaignTemplateToInbox: findMessageByWhatsAppId → getOrCreateConversation → createMessage
      await svc(`SELECT * FROM public.inbox_messages WHERE whatsapp_message_id = $1`, [wamid])
      let [conv] = await svc(`SELECT * FROM public.inbox_conversations WHERE phone = $1 AND status = 'open'`, [row.phone])
      if (!conv) {
        const [agent] = await svc(`SELECT id FROM public.ai_agents WHERE is_default = true AND is_active = true`)
        ;[conv] = await svc(`
          INSERT INTO public.inbox_conversations (phone, contact_id, ai_agent_id, status, mode)
          VALUES ($1, $2, $3, 'open', $4) RETURNING *`, [row.phone, row.contact_id, agent?.id ?? null, agent ? 'bot' : 'human'])
      }
      const preview = `Olá ${row.name}, mensagem secreta do cliente`
      await svc(`
        INSERT INTO public.inbox_messages (conversation_id, direction, content, message_type, whatsapp_message_id, delivery_status, payload)
        VALUES ($1, 'outbound', $2, 'template', $3, 'sent', $4::jsonb) RETURNING *`,
      [conv.id, preview, wamid, JSON.stringify({ type: 'campaign_template', campaign_id: campaignId, template_name: 'promo', template_language: 'pt_BR', resolved_values: { 1: row.name }, synced_at: new Date().toISOString() })])
      await svc(`SELECT * FROM public.increment_conversation_counters($1::uuid, 'outbound', $2)`, [conv.id, preview])
    }
    // persistência em massa do lote + métricas + contadores (campaignDb.getById/updateStatus)
    await svc(`
      INSERT INTO public.campaign_contacts (campaign_id, contact_id, phone, trace_id, status, sending_at, sent_at, message_id)
      SELECT campaign_id, contact_id, phone, $2, 'sent', sending_at, now(), message_id FROM public.campaign_contacts
      WHERE campaign_id = $1 AND contact_id = ANY($3::text[])
      ON CONFLICT (campaign_id, contact_id) DO UPDATE SET
        status = EXCLUDED.status, sent_at = EXCLUDED.sent_at, message_id = EXCLUDED.message_id, trace_id = EXCLUDED.trace_id`,
    [campaignId, trace, claimed.map((r) => r.contact_id)])
    await svc(`
      INSERT INTO public.campaign_batch_metrics (campaign_id, trace_id, batch_index, batch_size, concurrency, sent_count)
      VALUES ($1, $2, $3, $4, 1, $4)`, [campaignId, trace, batches - 1, claimed.length])
    const [current] = await svc(`SELECT sent, failed, skipped, first_dispatch_at FROM public.campaigns WHERE id = $1`, [campaignId])
    await svc(`
      UPDATE public.campaigns SET sent = $2, failed = $3, skipped = $4, first_dispatch_at = coalesce($5, now()), last_sent_at = now(), updated_at = now()
      WHERE id = $1`, [campaignId, current.sent + claimed.length, current.failed, current.skipped, current.first_dispatch_at])
  }
  // conclusão (fila vazia) + release
  await svc(`SELECT count(*)::int AS n FROM public.campaign_contacts WHERE campaign_id = $1 AND status = 'sending'`, [campaignId])
  await svc(`
    UPDATE public.campaign_contacts SET status = 'skipped', skipped_at = now(), skip_reason = 'sem id', failure_reason = 'sem id', error = 'sem id'
    WHERE campaign_id = $1 AND status = 'pending' AND contact_id IS NULL RETURNING id`, [campaignId])
  await svc(`UPDATE public.campaigns SET status = 'Concluído', completed_at = now(), updated_at = now() WHERE id = $1`, [campaignId])
  await svc(`SELECT public.release_campaign_dispatch_lock($1, $2)`, [campaignId, worker])

  // webhooks de cada contato
  const sent = await svc(`SELECT message_id FROM public.campaign_contacts WHERE campaign_id = $1 ORDER BY id`, [campaignId])
  for (const { message_id: wamid } of sent) {
    for (const status of ['sent', 'delivered', 'read']) await simulateStatusWebhook(svc, wamid, status)
  }
  const t1 = Date.now()

  const events = await realtimeEventsSince(ex, seq0)
  const byTable = countBy(events, (e) => e.payload?.table)
  const windows = Math.floor(t1 / 2000) - Math.floor(t0 / 2000) + 1
  const bound = 1 + windows
  check(`[${label}] disparo de ${n} contatos (${batches} lotes + ${n * 3} webhooks): inbox_messages, inbox_conversations e contacts não publicam nada`,
    lock?.ok === true && !byTable.inbox_messages && !byTable.inbox_conversations && !byTable.contacts, JSON.stringify(byTable))
  check(`[${label}] disparo: realtime.messages cresce O(1) — ${events.length} evento(s) ≤ 1 (conclusão) + ${windows} janela(s) de 2s em ${t1 - t0} ms (antes do hardening: ~${n * 5})`,
    events.length <= bound && (byTable.campaigns ?? 0) === events.length, `eventos=${events.length} ${JSON.stringify(byTable)}`)
  const done = events.find((e) => e.payload?.new?.status === 'Concluído' && e.payload?.old?.status !== 'Concluído')
  check(`[${label}] disparo: a conclusão publica a transição (old.status Enviando → new.status Concluído, completed_at)`,
    done?.payload?.old?.status === 'Enviando' && done?.payload?.old?.completed_at === null && typeof done?.payload?.new?.completed_at === 'string',
    JSON.stringify(done?.payload ?? events.map((e) => e.payload)))

  const [final] = await ex.query(`
    SELECT c.sent, c.delivered, c.read, c.status,
           (SELECT count(*) FROM public.campaign_contacts cc WHERE cc.campaign_id = c.id AND cc.status = 'read')::int AS read_rows,
           (SELECT count(*) FROM public.inbox_conversations ic WHERE starts_with(ic.contact_id, 'sim_ct') AND ic.total_messages = 1)::int AS conversations,
           (SELECT count(*) FROM public.inbox_messages im WHERE starts_with(im.whatsapp_message_id, 'wamid.sim.') AND im.delivery_status = 'read')::int AS messages,
           (SELECT count(*) FROM public.whatsapp_status_events e WHERE starts_with(e.message_id, 'wamid.sim.'))::int AS status_events
    FROM public.campaigns c WHERE c.id = $1`, [campaignId])
  check(`[${label}] disparo: estado final correto (sent = delivered = read = ${n}, Concluído; ${n} conversas e ${n} mensagens 'read' no inbox; ${n * 3} eventos de status)`,
    final?.sent === n && final?.delivered === n && final?.read === n && final?.status === 'Concluído' && final?.read_rows === n
      && final?.conversations === n && final?.messages === n && final?.status_events === n * 3,
    JSON.stringify(final))
  checkNoBroadcastWarnings(ex, `${label}: disparo`)
}

// --- A. Controle: o WARNING de uma projeção quebrada é capturado -------------
async function verifyBroadcastWarningCapture(ex, label) {
  checkNoBroadcastWarnings(ex, `${label}: antes do controle`)
  await asSuperuser(ex)
  await ex.exec(`ALTER TABLE public.account_alerts RENAME COLUMN code TO code_renamed`)
  try {
    const { result: err, events } = await delta(ex, () =>
      tryAsRole(ex, 'service_role', `INSERT INTO public.account_alerts (id, type, code_renamed, message) VALUES ('wc_al1', 'system', 1, 'aviso')`))
    const warnings = takeBroadcastWarnings(ex)
    check(`[${label}] (controle) coluna renomeada na projeção: a escrita segue, nada é publicado e o WARNING de dispara_broadcast_change(account_alerts) é capturado (falharia o check)`,
      err === null && events.length === 0 && warnings.some((w) => /dispara_broadcast_change\(account_alerts\)/.test(w.message)),
      JSON.stringify({ err, eventos: events.length, warnings: warnings.map((w) => w.message) }))
  } finally {
    await ex.exec(`ALTER TABLE public.account_alerts RENAME COLUMN code_renamed TO code`)
    await writeAs(ex, 'service_role', `DELETE FROM public.account_alerts WHERE id = 'wc_al1'`)
  }
  checkNoBroadcastWarnings(ex, `${label}: depois do controle (coluna de volta)`)
}

async function verifyRealtimeResilience(ex) {
  const write = (sql) => tryAsRole(ex, 'service_role', sql)

  // 1) realtime.messages recusando INSERT: realtime.send engole (WARNING), a escrita segue
  await asSuperuser(ex)
  takeBroadcastWarnings(ex)
  await ex.exec(`ALTER TABLE realtime.messages ADD CONSTRAINT harness_block CHECK (false) NOT VALID`)
  let err = await write(`UPDATE public.campaigns SET status = 'Pausado' WHERE id = 'rt_c1'`)
  const sendWarnings = takeBroadcastWarnings(ex)
  check('escrita segue quando o INSERT em realtime.messages falha (e o WARNING WarnSendingBroadcastMessage é capturado)',
    err === null && sendWarnings.some((w) => SEND_WARNING_RE.test(w.message)), `erro: ${err} avisos: ${sendWarnings.map((w) => w.message).join(' | ')}`)
  await ex.exec(`ALTER TABLE realtime.messages DROP CONSTRAINT harness_block`)

  // 2) sem EXECUTE em realtime.send
  await ex.exec(`REVOKE EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) FROM PUBLIC, ${OWNER}`)
  err = await write(`UPDATE public.campaigns SET status = 'Enviando' WHERE id = 'rt_c1'`)
  check('escrita segue sem permissão de EXECUTE em realtime.send', err === null, `erro: ${err}`)
  await ex.exec(`GRANT EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) TO PUBLIC`)

  // 3) realtime.send inexistente (ambiente sem Broadcast from Database)
  await ex.exec(`ALTER FUNCTION realtime.send(jsonb, text, text, boolean) RENAME TO send_disabled`)
  err = await write(`UPDATE public.campaigns SET status = 'Pausado' WHERE id = 'rt_c1'`)
  check('escrita segue com realtime.send ausente', err === null, `erro: ${err}`)
  await ex.exec(`ALTER FUNCTION realtime.send_disabled(jsonb, text, text, boolean) RENAME TO send`)

  // 4) sem USAGE no schema realtime (nem herdado de anon/authenticated/service_role): o
  //    to_regprocedure da guarda ERRARIA (42501) e derrubaria a escrita — a guarda confere
  //    o USAGE antes
  await ex.exec(`REVOKE USAGE ON SCHEMA realtime FROM PUBLIC, anon, authenticated, service_role, ${OWNER}`)
  const [usage] = await ex.query(`SELECT has_schema_privilege($1, 'realtime', 'USAGE') AS has`, [OWNER])
  err = await write(`UPDATE public.campaigns SET status = 'Enviando' WHERE id = 'rt_c1'`)
  check('escrita segue sem USAGE no schema realtime (guarda não chama to_regprocedure sem USAGE)', usage?.has === false && err === null,
    `erro: ${err} (dono com USAGE: ${usage?.has})`)
  await ex.exec(`GRANT USAGE ON SCHEMA realtime TO ${OWNER}, anon, authenticated, service_role`)
  checkNoBroadcastWarnings(ex, 'resiliência (fora o caso 1, esperado)')
}

// --- F. Objetos futuros -------------------------------------------------------
async function verifyFutureObjects(ex) {
  await asOwner(ex)
  await ex.exec(`
    CREATE TABLE public.harness_probe_table (id int);
    CREATE VIEW public.harness_probe_view AS SELECT 1 AS x;
    CREATE SEQUENCE public.harness_probe_seq;
    CREATE FUNCTION public.harness_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';`)
  await asSuperuser(ex)
  try {
    const [p] = await ex.query(`
      SELECT
        bool_or(has_table_privilege(r.role, 'public.harness_probe_table', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS table_leak,
        bool_or(has_table_privilege(r.role, 'public.harness_probe_view', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS view_leak,
        bool_or(has_sequence_privilege(r.role, 'public.harness_probe_seq', 'USAGE,SELECT,UPDATE')) AS seq_leak,
        bool_or(has_function_privilege(r.role, 'public.harness_probe_fn()', 'EXECUTE')) AS fn_exec
      FROM (VALUES ('anon'), ('authenticated')) AS r(role)`)
    const [svc] = await ex.query(`
      SELECT has_table_privilege('service_role', 'public.harness_probe_table', 'SELECT') AND has_table_privilege('service_role', 'public.harness_probe_table', 'INSERT')
               AND has_table_privilege('service_role', 'public.harness_probe_table', 'UPDATE') AND has_table_privilege('service_role', 'public.harness_probe_table', 'DELETE') AS table_ok,
             has_table_privilege('service_role', 'public.harness_probe_view', 'SELECT') AS view_ok,
             has_sequence_privilege('service_role', 'public.harness_probe_seq', 'USAGE') AS seq_ok,
             has_function_privilege('service_role', 'public.harness_probe_fn()', 'EXECUTE') AS fn_ok`)
    const [explicit] = await ex.query(`
      SELECT count(*)::int AS n FROM pg_proc p, aclexplode(p.proacl) AS a
      WHERE p.oid = 'public.harness_probe_fn()'::regprocedure AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)`)
    check('objetos futuros (criados pelo dono depois do hardening): anon/authenticated sem acesso a tabela, view e sequence novas',
      !p.table_leak && !p.view_leak && !p.seq_leak, JSON.stringify(p))
    check('objetos futuros: service_role com acesso a tabela, view, sequence e função novas (o app segue funcionando)',
      svc.table_ok && svc.view_ok && svc.seq_ok && svc.fn_ok, JSON.stringify(svc))
    check('objetos futuros: função nova sem GRANT explícito a anon/authenticated (default privileges do schema revogados)', explicit.n === 0, `grants=${explicit.n}`)
    info(`(esperado, não falha) função nova em public: anon/authenticated ${p.fn_exec ? 'TÊM' : 'não têm'} EXECUTE via PUBLIC — default GLOBAL do Postgres que ALTER DEFAULT PRIVILEGES … IN SCHEMA não revoga; a defesa é o REVOKE explícito em cada migration`)
  } finally {
    await asOwner(ex)
    await ex.exec(`
      DROP FUNCTION public.harness_probe_fn();
      DROP SEQUENCE public.harness_probe_seq;
      DROP VIEW public.harness_probe_view;
      DROP TABLE public.harness_probe_table;`)
    await asSuperuser(ex)
  }
}

// --- G. pg_cron realista ------------------------------------------------------
async function verifyCronExecution(ex) {
  await asSuperuser(ex)
  const [job] = await ex.query(`SELECT jobname, username, command FROM cron.job WHERE jobname = 'dispara-cron-tick'`)
  check('pg_cron: o job guarda quem rodou a migration (cron.schedule SECURITY INVOKER, como o pg_cron)', job?.username === OWNER, JSON.stringify(job ?? {}))
  if (!job) return
  const [{ can }] = await ex.query(`SELECT has_function_privilege($1, 'public.dispara_cron_tick()', 'EXECUTE') AS can`, [job.username])
  check(`pg_cron: cron.job.username (${job.username}) tem EXECUTE em dispara_cron_tick()`, can === true)
  await ex.exec(`SELECT vault.create_secret('https://exemplo.test', 'app_base_url'); SELECT vault.create_secret('s3cr3t', 'cron_secret');`)
  // pg_cron roda o comando do job numa sessão do usuário do job
  const err = await tryAsRole(ex, job.username, job.command)
  const queued = await ex.query(`SELECT url, headers FROM net.http_request_queue ORDER BY id DESC LIMIT 1`)
  check('pg_cron: o comando do job, rodando como cron.job.username, enfileira POST /api/cron/tick com Bearer',
    err === null && queued[0]?.url === 'https://exemplo.test/api/cron/tick' && queued[0]?.headers?.Authorization === 'Bearer s3cr3t',
    err ?? JSON.stringify(queued))
}

// --- H. Drift: trigger alterada ou desabilitada à mão --------------------------
/** OID + xmin (muda a cada CREATE OR REPLACE TRIGGER, que mantém o OID) de cada trigger. */
function fingerprintOf(triggers) {
  return triggers.map((t) => `${triggerKey(t)}#${t.oid}@${t.xmin}`).join(', ')
}

async function failedVerifyOnly(ex) {
  return (await captureChecks(() => runVerifyOnly(ex))).filter((r) => !r.ok)
}

const describeFailures = (failed) => failed.map((r) => `${r.name}: ${r.detail}`).join(' | ') || '(nada apontado)'

async function reapplyHardening(ex) {
  await asOwner(ex)
  const r = await applyMigration(ex, HARDENING)
  await asSuperuser(ex)
  return r
}

async function verifyTriggerDrift(ex) {
  const target = 'campaigns.dispara_realtime_broadcast_update'
  const before = await readBroadcastTriggers(ex)
  const original = before.find((t) => triggerKey(t) === target)

  // CREATE OR REPLACE TRIGGER manual com outro WHEN (ex.: alguém "simplificando" no SQL editor)
  await asOwner(ex)
  await ex.exec(`CREATE OR REPLACE TRIGGER dispara_realtime_broadcast_update AFTER UPDATE ON public.campaigns
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.dispara_broadcast_change()`)
  await asSuperuser(ex)
  const drifted = (await readBroadcastTriggers(ex)).find((t) => triggerKey(t) === target)
  check('(premissa) CREATE OR REPLACE TRIGGER manual mantém OID e COMMENT: a marca da definição sozinha não provaria nada',
    Boolean(original) && drifted?.oid === original.oid && drifted?.marker === original.marker && drifted?.xmin !== original.xmin && drifted?.defMd5 !== original.defMd5,
    JSON.stringify({ original, drifted }))

  let failed = await failedVerifyOnly(ex)
  check('drift: verify-only aponta a trigger alterada à mão — e só ela (snapshot e versão continuam batendo)',
    failed.length === 1 && /^triggers sem alteração manual/.test(failed[0].name) && failed[0].detail.includes(target), describeFailures(failed))

  const repaired = await reapplyHardening(ex)
  let after = await readBroadcastTriggers(ex)
  const fixed = after.find((t) => triggerKey(t) === target)
  const touched = after.filter((t) => triggerKey(t) !== target && before.find((b) => triggerKey(b) === triggerKey(t))?.xmin !== t.xmin)
  check('drift: reaplicar a migration conserta — recria SÓ a trigger alterada (definição original de volta), sem WARNING',
    repaired.ok && repaired.warnings.length === 0 && fixed?.defMd5 === original.defMd5 && fixed?.xmin !== drifted.xmin && touched.length === 0,
    repaired.error ?? JSON.stringify({ warnings: repaired.warnings, fixed, recriadas_sem_motivo: touched.map(triggerKey) }))
  failed = await failedVerifyOnly(ex)
  check('drift: verify-only passa inteiro depois do conserto', failed.length === 0, describeFailures(failed))

  // Trigger desabilitada (ALTER TABLE ... DISABLE TRIGGER): pg_get_triggerdef não muda, o
  // verify-only aponta pelo tgenabled e reaplicar a reabilita
  await asOwner(ex)
  await ex.exec(`ALTER TABLE public.flows DISABLE TRIGGER dispara_realtime_broadcast`)
  await asSuperuser(ex)
  failed = await failedVerifyOnly(ex)
  check('desabilitada: verify-only aponta a trigger desabilitada — e só ela',
    failed.length === 1 && /^triggers de broadcast habilitadas/.test(failed[0].name) && failed[0].detail.includes('flows.dispara_realtime_broadcast'), describeFailures(failed))
  const reenabled = await reapplyHardening(ex)
  after = await readBroadcastTriggers(ex)
  failed = await failedVerifyOnly(ex)
  check('desabilitada: reaplicar a migration reabilita (tgenabled O) e o verify-only passa inteiro',
    reenabled.ok && reenabled.warnings.length === 0 && after.find((t) => triggerKey(t) === 'flows.dispara_realtime_broadcast')?.enabled === 'O' && failed.length === 0,
    reenabled.error ?? describeFailures(failed))
}

// --- I. Variantes de realtime.send trocadas depois das triggers criadas -------
/**
 * Para cada variante (REALTIME_SEND_VARIANTS), com as triggers já existentes:
 *  - (controle) chamada direta com o INSERT em realtime.messages falhando: as inseguras
 *    propagam o erro (derrubariam a escrita de quem chamou), a segura não;
 *  - escrita do app com o INSERT falhando: segue SEMPRE (insegura: a guarda nem chama o send);
 *  - escrita normal: a segura publica 1 evento; a insegura, nenhum (a guarda recusou);
 *  - reaplicar a migration: avisa (sem mexer em trigger) só para a insegura;
 *  - verify-only (estado do send): premissa ok só para a segura.
 */
async function verifySendVariants(ex) {
  const toggle = `UPDATE public.campaigns SET status = CASE WHEN status = 'Enviando' THEN 'Pausado' ELSE 'Enviando' END WHERE id = 'off_c1'`
  for (const variant of REALTIME_SEND_VARIANTS) {
    await asSuperuser(ex)
    await ex.exec(variant.sql)
    await ex.exec(`ALTER TABLE realtime.messages ADD CONSTRAINT harness_block CHECK (false) NOT VALID`)
    let direct
    let blockedWrite
    try {
      direct = await tryAsRole(ex, 'service_role', `SELECT realtime.send('{}'::jsonb, 'db_change', 'dispara-db', false)`)
      blockedWrite = await tryAsRole(ex, 'service_role', toggle)
    } finally {
      await ex.exec(`ALTER TABLE realtime.messages DROP CONSTRAINT harness_block`)
    }
    takeBroadcastWarnings(ex) // a variante segura avisa (Warn/ErrorSendingBroadcastMessage) com o INSERT falhando: esperado
    const { events } = await delta(ex, () => writeAs(ex, 'service_role', toggle))
    const reapplied = await reapplyHardening(ex)
    const state = await readRealtimeSendState(ex)
    const refused = reapplied.warnings.some((w) => /não trata os próprios erros/.test(w))
    const ok = variant.safe
      ? direct === null && blockedWrite === null && events.length === 1 && reapplied.ok && reapplied.warnings.length === 0 && state.handlesErrors
      : direct !== null && blockedWrite === null && events.length === 0 && reapplied.ok && refused && !state.handlesErrors
    check(`realtime.send ${variant.key}: ${variant.safe
      ? 'aceito pela guarda (publica; reaplicar não avisa; premissa ok no verify-only)'
      : 'recusado pela guarda (escrita segue com o INSERT falhando, nada publicado, reaplicar avisa, verify-only aponta)'}; (controle) a chamada direta ${variant.safe ? 'NÃO propaga' : 'propaga'} a falha do INSERT`,
    ok, JSON.stringify({ chamadaDireta: direct, escritaComInsertFalhando: blockedWrite, eventos: events.length, reaplicar: reapplied.error ?? reapplied.warnings, premissa: state.handlesErrors }))
  }
}

// ---------------------------------------------------------------------------
// --verify-only pelo protocolo de rede (testa o caminho `pg` no CI)
// ---------------------------------------------------------------------------
/**
 * Serve um PGlite pelo protocolo de rede do Postgres num socket local: o mesmo cliente `pg`
 * do modo --verify-only real fala com ele. Uma conexão de cada vez; a sessão é a mesma do
 * executor in-process (o PGlite é single-user), então não use os dois ao mesmo tempo.
 */
export async function servePgliteOverTcp(db) {
  const net = await import('node:net')
  let queue = Promise.resolve()
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    let buffer = Buffer.alloc(0)
    let started = false
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      const messages = []
      for (;;) {
        if (!started) {
          if (buffer.length < 8) break
          const length = buffer.readInt32BE(0)
          if (buffer.length < length) break
          // SSLRequest: responde 'N' (sem TLS) e o cliente manda o StartupMessage
          if (length === 8 && buffer.readInt32BE(4) === 80877103) {
            buffer = buffer.subarray(8)
            socket.write('N')
            continue
          }
          messages.push(buffer.subarray(0, length))
          buffer = buffer.subarray(length)
          started = true
        } else {
          if (buffer.length < 5) break
          const length = buffer.readInt32BE(1)
          if (buffer.length < length + 1) break
          const message = buffer.subarray(0, length + 1)
          buffer = buffer.subarray(length + 1)
          if (message[0] === 0x58) {
            socket.end() // Terminate
            return
          }
          messages.push(message)
        }
      }
      if (messages.length === 0) return
      const payload = new Uint8Array(Buffer.concat(messages))
      queue = queue
        .then(async () => {
          const response = await db.execProtocolRaw(payload)
          if (response?.length && !socket.destroyed) socket.write(Buffer.from(response))
        })
        .catch((error) => {
          socket.destroy(error)
        })
    })
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', () => resolveListen(undefined)))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    close: () => new Promise((resolveClose) => {
      for (const s of sockets) s.destroy()
      server.close(() => resolveClose())
    }),
  }
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------
async function scenarioFreshInstall(files) {
  scenario('1. Instalação nova (todas as migrations em ordem, como o installer)')
  const ex = await createSupabaseLikeDb()
  await asOwner(ex)
  const warnings = []
  for (const file of files) {
    const r = await applyMigration(ex, file)
    check(`aplica ${file}`, r.ok, r.error)
    warnings.push(...r.warnings.map((w) => `${file}: ${w}`))
    if (!r.ok) {
      await ex.close()
      return
    }
  }
  check('nenhuma migration emite WARNING (Realtime ativo)', warnings.length === 0, [...new Set(warnings)].slice(0, 3).join(' | '))
  await asSuperuser(ex)
  // \r fora: num checkout CRLF o template literal traz \r\n
  const [send] = await ex.query(`SELECT md5(replace(prosrc, E'\\r', '')) AS md5 FROM pg_proc WHERE oid = 'realtime.send(jsonb,text,text,boolean)'::regprocedure`)
  check('realtime.send simulado = o do Supabase de produção, byte a byte (md5 do prosrc)', send?.md5 === SUPABASE_SEND_PROSRC_MD5, `md5=${send?.md5}`)
  const fingerprint = await readBroadcastTriggers(ex)
  await runVerifyOnly(ex)

  scenario('3. Idempotência e drift (reaplica a migration de hardening)')
  // Com OUTRO search_path (public fora dele): pg_get_triggerdef qualificaria a função de
  // outro jeito, mas a migration calcula a marca com o search_path canônico.
  await asOwner(ex)
  await ex.exec('SET search_path = extensions')
  const again = await applyMigration(ex, HARDENING)
  check('reaplicar a migration de hardening (com outro search_path) não falha nem avisa', again.ok && again.warnings.length === 0, again.error ?? again.warnings.join(' | '))
  await asSuperuser(ex)
  const fingerprint2 = await readBroadcastTriggers(ex)
  // CREATE OR REPLACE TRIGGER MANTÉM o OID: só o xmin da linha em pg_trigger prova que nada foi recriado
  check('reaplicar não recria nenhuma trigger (mesmo OID e mesmo xmin em pg_trigger: nenhum CREATE OR REPLACE rodou)',
    fingerprintOf(fingerprint) === fingerprintOf(fingerprint2) && fingerprint.length === EXPECTED_SORTED.length,
    `antes=${fingerprintOf(fingerprint)} depois=${fingerprintOf(fingerprint2)}`)
  const idempotent = await captureChecks(() => runVerifyOnly(ex))
  check(`verify-only depois de reaplicar: ${idempotent.length} verificações passam`, idempotent.every((r) => r.ok),
    idempotent.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`).slice(0, 5).join(' | '))
  await verifyTriggerDrift(ex)

  scenario('4. Realtime e resiliência (instalação nova)')
  await verifyRealtime(ex, 'nova')
  await verifyBroadcastMatrix(ex, 'nova')
  await verifyRpcs(ex, 'nova')
  await verifyThrottleWindow(ex, 'nova')
  await verifyDispatchVolume(ex, 'nova')
  await verifyBroadcastWarningCapture(ex, 'nova')
  await verifyRealtimeResilience(ex)
  await verifyAllPayloads(ex, 'nova: todos os eventos do cenário', 0)
  await verifyFutureObjects(ex)
  await verifyCronExecution(ex)
  const xid = await nextXid(ex)
  const after = await captureChecks(() => runVerifyOnly(ex))
  check(`verify-only depois de todas as escritas: ${after.length} verificações passam e nenhum XID é consumido`,
    after.every((r) => r.ok) && (await nextXid(ex)) === xid,
    after.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`).slice(0, 5).join(' | '))
  await ex.close()
}

async function scenarioUpgrade(files) {
  scenario('2. Upgrade de produção (banco antigo + dados → migration de hardening)')
  const ex = await createSupabaseLikeDb()
  await asOwner(ex)
  for (const file of files.filter((f) => f !== HARDENING)) {
    const r = await applyMigration(ex, file)
    if (!r.ok) {
      check(`aplica ${file} (estado anterior)`, false, r.error)
      await ex.close()
      return
    }
  }

  // Estado de produção ANTES: confirma que o vazamento existia (o teste precisa enxergá-lo)
  await asSuperuser(ex)
  await ex.exec(`
    INSERT INTO public.contacts (id, phone, name, email) VALUES ('up_ct1', '5511900000001', 'Cliente Antigo', 'antigo@teste.com');
    INSERT INTO public.campaigns (id, name, status) VALUES ('up_c1', 'Campanha antiga', 'Concluído');
    INSERT INTO public.settings (key, value) VALUES ('session_tokens', '[]');
    INSERT INTO public.inbox_conversations (id, phone) VALUES ('22222222-2222-2222-2222-222222222222', '5511900000001');
    INSERT INTO public.inbox_messages (conversation_id, direction, content) VALUES ('22222222-2222-2222-2222-222222222222', 'inbound', 'oi');
    INSERT INTO public.attendant_tokens (name, token) VALUES ('Atendente', 'abcdef0123456789abcdef0123456789');
  `)
  const leakBefore = await tryAsRole(ex, 'anon', `SELECT * FROM public.contacts LIMIT 1`)
  check('antes do hardening: anon LIA contacts (vazamento reproduzido)', leakBefore === null, `resultado: ${leakBefore}`)

  // Controle negativo do --verify-only: no banco SEM hardening ele tem de apontar o problema
  let xid = await nextXid(ex)
  const before = await captureChecks(() => runVerifyOnly(ex))
  const failedBefore = before.filter((r) => !r.ok).map((r) => r.name)
  const mustFail = [/^anon sem nenhum privilégio de tabela/, /^anon: SELECT em contacts é negado/, /^anon: RPC claim_campaign_batch é negada/,
    /^anon sem EXECUTE/, /^snapshot exato das triggers/, /^dispara_broadcast_change existe/, /^tabelas de public fora da publicação/]
  const missed = mustFail.filter((re) => !failedBefore.some((n) => re.test(n)))
  check('verify-only (controle negativo): no banco SEM hardening aponta o vazamento (anon lê contacts e executa RPCs, triggers e função ausentes, publicação)',
    missed.length === 0, `não apontou: ${missed.map(String).join(', ')} — falhas: ${failedBefore.join(' | ')}`)
  check('verify-only (controle negativo): somente leitura, nenhum XID consumido', (await nextXid(ex)) === xid)

  await asOwner(ex)
  const r = await applyMigration(ex, HARDENING)
  check(`aplica ${HARDENING} sobre o banco de produção, sem WARNING`, r.ok && r.warnings.length === 0, r.error ?? r.warnings.join(' | '))
  if (!r.ok) {
    await ex.close()
    return
  }
  await asSuperuser(ex)

  const [counts] = await ex.query(`
    SELECT (SELECT count(*) FROM public.contacts)::int AS contacts, (SELECT count(*) FROM public.campaigns)::int AS campaigns,
           (SELECT count(*) FROM public.inbox_messages)::int AS messages, (SELECT count(*) FROM public.attendant_tokens)::int AS tokens`)
  check('dados preservados após a migration', counts.contacts === 1 && counts.campaigns === 1 && counts.messages === 1 && counts.tokens === 1, JSON.stringify(counts))

  xid = await nextXid(ex)
  const afterHardening = await captureChecks(() => runVerifyOnly(ex))
  check(`verify-only depois do hardening: ${afterHardening.length} verificações passam, sem consumir XID`,
    afterHardening.every((x) => x.ok) && (await nextXid(ex)) === xid,
    afterHardening.filter((x) => !x.ok).map((x) => `${x.name}: ${x.detail}`).slice(0, 5).join(' | '))
  await verifyRealtime(ex, 'upgrade')
  await verifyBroadcastMatrix(ex, 'upgrade')
  await verifyAllPayloads(ex, 'upgrade: todos os eventos do cenário', 0)
  await ex.close()
}

async function scenarioRealtimeUnavailable(files) {
  scenario('5. Realtime indisponível na instalação (realtime.send ausente ou sem tratamento de erro próprio)')

  // a) Projeto sem Broadcast from Database: o bootstrap não cria realtime.send
  let ex = await createSupabaseLikeDb({ realtimeSend: 'none' })
  let applied = await applyAll(ex, files, 'sem realtime.send')
  check('sem realtime.send: todas as migrations aplicam', applied !== null)
  if (applied) {
    const warnings = applied[HARDENING].warnings
    check('sem realtime.send: WARNING acionável capturado ("Reaplique esta migration depois que o Realtime estiver ativo")',
      warnings.some((w) => /Reaplique esta migration depois que o Realtime estiver ativo/.test(w)), warnings.join(' | ') || '(nenhum WARNING)')
    let triggers = await readBroadcastTriggers(ex)
    check('sem realtime.send: nenhuma trigger de broadcast criada', triggers.length === 0, describeDbTriggers(triggers).join(', '))
    const anonErr = await tryAsRole(ex, 'anon', `SELECT * FROM public.contacts LIMIT 1`)
    check('sem realtime.send: o resto da migration vale (anon sem SELECT em contacts)', anonErr === '42501', `resultado: ${anonErr ?? 'PASSOU (vazamento!)'}`)
    const offErr = await tryAsRole(ex, 'service_role', `INSERT INTO public.campaigns (id, name) VALUES ('off_c1', 'Campanha sem realtime')`)
    check('sem realtime.send: escrita segue normal e nada é publicado', offErr === null && (await realtimeMaxSeq(ex)) === 0, `erro: ${offErr}`)

    // a2) Realtime ativado depois: o send passa a existir (como o Supabase cria) e SÓ a hardening é reaplicada
    await ex.exec(REALTIME_SEND_SQL)
    await asOwner(ex)
    const enabled = await applyMigration(ex, HARDENING)
    await asSuperuser(ex)
    check('Realtime ativado depois: reaplicar SÓ a hardening não falha nem avisa', enabled.ok && enabled.warnings.length === 0, enabled.error ?? enabled.warnings.join(' | '))
    triggers = await readBroadcastTriggers(ex)
    const described = describeDbTriggers(triggers)
    check(`Realtime ativado depois: reaplicar cria exatamente as ${EXPECTED_SORTED.length} triggers do snapshot`, sameList(described, EXPECTED_SORTED), listDiff(described, EXPECTED_SORTED))
    const { events } = await delta(ex, () => writeAs(ex, 'service_role', `UPDATE public.campaigns SET status = 'Enviando' WHERE id = 'off_c1'`))
    check('Realtime ativado depois: escrita publica (com old.status)', events.length === 1 && events[0].payload?.old?.status === 'Rascunho', summarizeEvents(events))

    // a3) Triggers já criadas e o send trocado depois: a guarda da função (a cada evento)
    //     só chama um send que nunca propaga a falha do INSERT; o bloco das triggers usa o
    //     mesmo critério ao reaplicar; o verify-only também
    await verifySendVariants(ex)
    await ex.exec(REALTIME_SEND_SQL)
    const restored = await reapplyHardening(ex)
    check('send do Supabase de volta: reaplicar não avisa', restored.ok && restored.warnings.length === 0, restored.error ?? restored.warnings.join(' | '))
    checkNoBroadcastWarnings(ex, 'sem realtime.send')
  }
  await ex.close()

  // b) Bootstrap com um realtime.send SEM EXCEPTION WHEN OTHERS próprio: a trigger o chama
  //    fora de bloco de exceção, então uma falha no envio derrubaria a escrita — sem triggers
  ex = await createSupabaseLikeDb({ realtimeSend: 'unsafe' })
  applied = await applyAll(ex, files, 'send sem tratamento de erro')
  check('send sem tratamento de erro (bootstrap): todas as migrations aplicam', applied !== null)
  if (applied) {
    const warnings = applied[HARDENING].warnings
    const explains = (list) => list.some((w) => /não trata os próprios erros/.test(w) && /derrubaria a escrita/.test(w))
    check('send sem tratamento de erro: WARNING explica o motivo (não trata os próprios erros; derrubaria a escrita)', explains(warnings), warnings.join(' | ') || '(nenhum WARNING)')
    const triggers = await readBroadcastTriggers(ex)
    check('send sem tratamento de erro: nenhuma trigger de broadcast criada', triggers.length === 0, describeDbTriggers(triggers).join(', '))
    const writeErr = await tryAsRole(ex, 'service_role', `INSERT INTO public.campaigns (id, name) VALUES ('unsafe_c1', 'Campanha'); UPDATE public.campaigns SET status = 'Enviando' WHERE id = 'unsafe_c1'`)
    check('send sem tratamento de erro: escrita segue e nada é publicado', writeErr === null && (await realtimeMaxSeq(ex)) === 0, `erro: ${writeErr}`)
    await asOwner(ex)
    const again = await applyMigration(ex, HARDENING)
    await asSuperuser(ex)
    check('send sem tratamento de erro: reaplicar segue avisando e sem criar triggers',
      again.ok && explains(again.warnings) && (await readBroadcastTriggers(ex)).length === 0, again.error ?? again.warnings.join(' | '))
  }
  await ex.close()
}

async function scenarioVerifyOnlyOverNetwork(files) {
  scenario('6. --verify-only pelo protocolo de rede (cliente pg → PGlite num socket local)')
  const local = await createSupabaseLikeDb()
  const applied = await applyAll(local, files, 'rede')
  if (!applied) {
    await local.close()
    return
  }
  const server = await servePgliteOverTcp(local.db)
  let remote = null
  try {
    remote = await pgExecutor(server.url)
    const xid = await nextXid(local)
    const clean = await captureChecks(() => runVerifyOnly(remote))
    check(`verify-only via pg: ${clean.length} verificações, todas passam no banco com hardening`, clean.length > 25 && clean.every((r) => r.ok),
      clean.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`).slice(0, 5).join(' | '))
    check('verify-only via pg: somente leitura, nenhum XID consumido', (await nextXid(local)) === xid)

    // Controle negativo: um GRANT a anon (vazamento), uma trigger desatualizada, um job do
    // pg_cron cujo usuário não pode executar o tick e o dono sem INSERT em realtime.messages
    // (inclusive o herdado de service_role) aparecem no relatório
    await local.exec(`
      GRANT SELECT ON public.contacts TO anon;
      COMMENT ON TRIGGER dispara_realtime_broadcast ON public.flows IS 'dispara_broadcast:versao_antiga';
      UPDATE cron.job SET username = 'anon' WHERE jobname = 'dispara-cron-tick';
      REVOKE INSERT ON realtime.messages FROM ${OWNER}, service_role;`)
    const leak = await captureChecks(() => runVerifyOnly(remote))
    await local.exec(`
      REVOKE SELECT ON public.contacts FROM anon;
      UPDATE cron.job SET username = '${OWNER}' WHERE jobname = 'dispara-cron-tick';
      GRANT INSERT ON realtime.messages TO ${OWNER}, service_role;`)
    const failed = leak.filter((r) => !r.ok)
    const named = (re) => failed.some((r) => re.test(r.name))
    check('verify-only via pg (controle negativo): GRANT SELECT em contacts para anon, trigger desatualizada, job do pg_cron sem EXECUTE e dono sem INSERT em realtime.messages são apontados',
      named(/^anon sem nenhum privilégio de tabela/) && named(/^anon: SELECT em contacts é negado/) && named(/^pg_cron: o usuário do job \(anon\) tem EXECUTE/)
        && failed.some((r) => /^triggers na versão deste repositório/.test(r.name) && /flows\.dispara_realtime_broadcast/.test(r.detail))
        && failed.some((r) => /^realtime\.messages: quem insere/.test(r.name) && r.detail.includes(`GRANT INSERT ON realtime.messages TO ${OWNER}`)),
      failed.map((r) => r.name).join(' | ') || '(nada apontado)')
  } finally {
    if (remote) await remote.close().catch(() => {})
    await server.close()
    await local.close()
  }
}

async function scenarioRealtimeInsertDenied(files) {
  scenario('7. Dono sem permissão de gravar em realtime.messages (privilégio e RLS) ou sem USAGE no schema realtime')
  const ex = await createSupabaseLikeDb()
  const INSERT_CHECK = /^realtime\.messages: quem insere/
  const CALL_CHECK = /^realtime\.send: o dono de dispara_broadcast_change/
  // Uma escrita do app: erro, eventos publicados e WARNINGs do realtime.send SÓ dela
  const toggle = async () => {
    takeBroadcastWarnings(ex)
    const { result: error, events } = await delta(ex, () => tryAsRole(ex, 'service_role',
      `UPDATE public.campaigns SET status = CASE WHEN status = 'Enviando' THEN 'Pausado' ELSE 'Enviando' END WHERE id = 'ins_c1'`))
    const sendWarnings = takeBroadcastWarnings(ex).filter((w) => SEND_WARNING_RE.test(w.message))
    return { error, events: events.length, sendWarnings: sendWarnings.length }
  }
  const migrationWarning = (warnings, re) => warnings.some((w) => re.test(w))

  try {
    // a) INSERT em realtime.messages revogado ANTES da instalação (inclusive o herdado de
    //    service_role/anon/authenticated, de que o dono é membro)
    await ex.exec(`REVOKE INSERT ON realtime.messages FROM PUBLIC, anon, authenticated, service_role, ${OWNER}`)
    const applied = await applyAll(ex, files, 'sem INSERT em realtime.messages')
    check('sem INSERT em realtime.messages: todas as migrations aplicam', applied !== null)
    if (!applied) return
    const warnings = applied[HARDENING].warnings
    const triggers = describeDbTriggers(await readBroadcastTriggers(ex))
    check('sem INSERT: a migration avisa (WARNING com o GRANT que falta) e cria as triggers mesmo assim (nada derruba escrita)',
      warnings.length === 1 && migrationWarning(warnings, new RegExp(`sem INSERT em realtime\\.messages.*GRANT INSERT ON realtime\\.messages TO ${OWNER}`))
        && sameList(triggers, EXPECTED_SORTED),
      `${warnings.join(' | ') || '(nenhum WARNING)'} — triggers: ${listDiff(triggers, EXPECTED_SORTED) || 'ok'}`)

    await writeAs(ex, 'service_role', `INSERT INTO public.campaigns (id, name, status) VALUES ('ins_c1', 'Campanha', 'Rascunho')`)
    takeBroadcastWarnings(ex)
    let w = await toggle()
    check('sem INSERT: a escrita segue mas NADA é publicado (realtime.send engole o erro e só avisa) — o realtime morre em silêncio',
      w.error === null && w.events === 0 && w.sendWarnings === 1, JSON.stringify(w))
    let failed = await failedVerifyOnly(ex)
    check('sem INSERT: verify-only aponta só isso, com o GRANT acionável (não fica verde)',
      failed.length === 1 && INSERT_CHECK.test(failed[0].name) && failed[0].detail.includes(`GRANT INSERT ON realtime.messages TO ${OWNER}`), describeFailures(failed))

    await ex.exec(`GRANT INSERT ON realtime.messages TO ${OWNER}`)
    w = await toggle()
    failed = await failedVerifyOnly(ex)
    check('sem INSERT: o GRANT corrige sem reaplicar a migration (publica e o verify-only passa inteiro)',
      w.error === null && w.events === 1 && w.sendWarnings === 0 && failed.length === 0, `${JSON.stringify(w)} ${describeFailures(failed)}`)

    // b) RLS ligado em realtime.messages (como no Supabase) e o dono sem BYPASSRLS nem policy.
    //    DISCARD PLANS = conexão nova: o plano em cache do INSERT do send foi feito com
    //    BYPASSRLS, e o Postgres só o invalida se mudar o role ou o row_security, não o
    //    atributo do role.
    await ex.exec(`ALTER ROLE ${OWNER} NOBYPASSRLS; DISCARD PLANS`)
    w = await toggle()
    failed = await failedVerifyOnly(ex)
    check('RLS sem BYPASSRLS nem policy: nada é publicado e o verify-only aponta só isso, com a policy acionável',
      w.error === null && w.events === 0 && w.sendWarnings === 1 && failed.length === 1 && INSERT_CHECK.test(failed[0].name)
        && /RLS ligado/.test(failed[0].detail) && /CREATE POLICY .* FOR INSERT TO/.test(failed[0].detail),
      `${JSON.stringify(w)} ${describeFailures(failed)}`)
    const rlsReapplied = await reapplyHardening(ex)
    check('RLS sem BYPASSRLS nem policy: reaplicar a migration avisa (WARNING com a policy que falta)',
      rlsReapplied.ok && rlsReapplied.warnings.length === 1 && migrationWarning(rlsReapplied.warnings, /tem RLS ligado.*CREATE POLICY .* FOR INSERT TO/),
      rlsReapplied.error ?? (rlsReapplied.warnings.join(' | ') || '(nenhum WARNING)'))
    await ex.exec(`CREATE POLICY dispara_broadcast_insert ON realtime.messages FOR INSERT TO ${OWNER} WITH CHECK (topic = 'dispara-db')`)
    w = await toggle()
    failed = await failedVerifyOnly(ex)
    const withPolicy = await reapplyHardening(ex)
    check('RLS: a policy de INSERT para o dono corrige sem reaplicar (publica; verify-only passa inteiro; reaplicar não avisa)',
      w.error === null && w.events === 1 && w.sendWarnings === 0 && failed.length === 0 && withPolicy.ok && withPolicy.warnings.length === 0,
      `${JSON.stringify(w)} ${describeFailures(failed)} ${withPolicy.warnings.join(' | ')}`)
    await ex.exec(`DROP POLICY dispara_broadcast_insert ON realtime.messages; ALTER ROLE ${OWNER} BYPASSRLS`)

    // c) sem USAGE no schema realtime (nem herdado): a guarda não pode ERRAR — to_regprocedure
    //    lança 42501 sem USAGE — e o verify-only aponta
    await ex.exec(`REVOKE USAGE ON SCHEMA realtime FROM PUBLIC, anon, authenticated, service_role, ${OWNER}`)
    w = await toggle()
    failed = await failedVerifyOnly(ex)
    check('sem USAGE no schema realtime: a escrita segue (sem publicar) e o verify-only aponta o dono sem USAGE/EXECUTE, com o GRANT',
      w.error === null && w.events === 0 && failed.some((f) => CALL_CHECK.test(f.name) && f.detail.includes(`GRANT USAGE ON SCHEMA realtime TO ${OWNER}`)),
      `${JSON.stringify(w)} ${describeFailures(failed)}`)
    await ex.exec(`GRANT USAGE ON SCHEMA realtime TO ${OWNER}, anon, authenticated, service_role`)
    w = await toggle()
    failed = await failedVerifyOnly(ex)
    check('sem USAGE: o GRANT corrige sem reaplicar (publica e o verify-only passa inteiro)',
      w.error === null && w.events === 1 && failed.length === 0, `${JSON.stringify(w)} ${describeFailures(failed)}`)
    checkNoBroadcastWarnings(ex, 'permissões do envio (fora os casos acima, esperados)')
  } finally {
    await ex.close()
  }
}

/**
 * Janela de partições vencida: só existem partições de ~60 dias atrás. É o estado da
 * produção em 2026-10-12 (a última conexão de cliente ao Realtime foi em agosto).
 */
const LAPSE_REALTIME_PARTITIONS_SQL = `
DO $lapse$
DECLARE r record; d date;
BEGIN
  FOR r IN SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
           WHERE i.inhparent = 'realtime.messages'::regclass LOOP
    EXECUTE format('DROP TABLE realtime.%I', r.relname);
  END LOOP;
  FOR i IN -1..3 LOOP
    d := localtimestamp::date - 60 + i;
    EXECUTE format('CREATE TABLE realtime.%I PARTITION OF realtime.messages FOR VALUES FROM (%L) TO (%L)',
                   'messages_' || to_char(d, 'YYYY_MM_DD'), d::timestamp, (d + 1)::timestamp);
  END LOOP;
END
$lapse$;`

async function scenarioRealtimePartitionLapsed(files) {
  scenario('8. realtime.messages sem partição para hoje (janela vencida: o estado da produção em 2026-10-12)')
  const ex = await createSupabaseLikeDb()
  const PARTITION_INFO = /^realtime\.messages sem partição para agora/
  // Uma escrita do app: erro, eventos publicados e WARNINGs do realtime.send SÓ dela
  const toggle = async () => {
    takeBroadcastWarnings(ex)
    const { result: error, events } = await delta(ex, () => tryAsRole(ex, 'service_role',
      `UPDATE public.campaigns SET status = CASE WHEN status = 'Enviando' THEN 'Pausado' ELSE 'Enviando' END WHERE id = 'part_c1'`))
    const sendWarnings = takeBroadcastWarnings(ex).filter((w) => SEND_WARNING_RE.test(w.message)).map((w) => w.message)
    return { error, events, sendWarnings }
  }
  const verify = async () => {
    const infos = []
    const failed = (await captureChecks(() => runVerifyOnly(ex), infos)).filter((r) => !r.ok)
    return { failed, partitionInfo: infos.some((m) => PARTITION_INFO.test(m)) }
  }

  try {
    // O caminho do deploy em produção: banco sem hardening, janela vencida, aplica a hardening
    const before = await applyAll(ex, files.filter((f) => f !== HARDENING), 'janela vencida (antes do hardening)')
    if (!before) return
    await writeAs(ex, 'service_role', `INSERT INTO public.campaigns (id, name, status) VALUES ('part_c1', 'Campanha', 'Rascunho')`)
    await ex.exec(LAPSE_REALTIME_PARTITIONS_SQL)
    const applied = await applyAll(ex, [HARDENING], 'janela vencida')
    if (!applied) return
    const triggers = describeDbTriggers(await readBroadcastTriggers(ex))
    check('janela vencida: a migration de hardening aplica sem WARNING e cria as triggers (a partição não é pré-requisito)',
      applied[HARDENING].warnings.length === 0 && sameList(triggers, EXPECTED_SORTED),
      `${applied[HARDENING].warnings.join(' | ') || 'sem WARNING'} — triggers: ${listDiff(triggers, EXPECTED_SORTED) || 'ok'}`)

    const parts = await readRealtimePartitions(ex)
    check('janela vencida: readRealtimePartitions vê a tabela particionada sem partição para agora',
      parts.partitioned && !parts.coversNow && parts.count === 5 && parts.newestEnd !== null, JSON.stringify(parts))

    let w = await toggle()
    check('janela vencida: a escrita segue, nada é publicado e o send só avisa (no partition … found for row)',
      w.error === null && w.events.length === 0 && w.sendWarnings.length === 1 && /no partition of relation/.test(w.sendWarnings[0]),
      JSON.stringify({ ...w, events: w.events.length }))
    let report = await verify()
    check('janela vencida: verify-only não falha (é benigno) e informa a falta de partição',
      report.failed.length === 0 && report.partitionInfo, `${describeFailures(report.failed)} info=${report.partitionInfo}`)

    // Um cliente conecta: o servidor Realtime recria a janela (ontem … +3 dias)
    await ex.exec(REALTIME_PARTITION_WINDOW_SQL)
    w = await toggle()
    const payload = w.events[0]?.payload
    check('cliente conectou (janela recriada): volta a publicar sem reaplicar nada — payload no contrato, com o id que o send acrescenta',
      w.error === null && w.events.length === 1 && w.sendWarnings.length === 0 && validatePayloadShape(payload).length === 0
        && typeof payload?.id === 'string' && payload?.new?.id === 'part_c1',
      JSON.stringify({ ...w, events: w.events.map((e) => e.payload) }))
    report = await verify()
    check('cliente conectou: verify-only passa inteiro e não informa mais a falta de partição',
      report.failed.length === 0 && !report.partitionInfo, `${describeFailures(report.failed)} info=${report.partitionInfo}`)
    checkNoBroadcastWarnings(ex, 'janela de partições (fora o caso acima, esperado)')
  } finally {
    await ex.close()
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function describeTarget(url) {
  try {
    const u = new URL(url)
    return `${decodeURIComponent(u.username) || '?'}@${u.hostname}:${u.port || 5432}${u.pathname}`
  } catch {
    return '(DB_CHECK_URL inválida)'
  }
}

async function mainVerifyOnly() {
  const url = process.env.DB_CHECK_URL
  let ex
  if (url) {
    console.log(`--verify-only contra ${describeTarget(url)} (somente leitura: BEGIN READ ONLY … ROLLBACK)`)
    try {
      ex = await pgExecutor(url)
    } catch (error) {
      console.error(`Não foi possível conectar (${error.code ?? 'erro'}): ${error.message}`)
      return 1
    }
  } else {
    console.log('--verify-only sem DB_CHECK_URL: verificando um PGlite com todas as migrations (autoteste)')
    ex = await createMigratedDb()
  }
  try {
    const [ctx] = await ex.query(`SELECT current_user AS "user", current_database() AS db, current_setting('server_version') AS version`)
    console.log(`Conectado como ${ctx.user} no banco ${ctx.db} (Postgres ${ctx.version})`)
    scenario('Estado de segurança (somente leitura)')
    await runVerifyOnly(ex)
  } finally {
    await ex.close()
  }
  return printSummary()
}

async function mainAll() {
  const files = listMigrations()
  console.log(`Migrations encontradas: ${files.length} (${files[0]} … ${files[files.length - 1]})`)
  if (!files.includes(HARDENING)) {
    console.error(`Migration ${HARDENING} não encontrada`)
    return 1
  }
  scenario('0. Verificações estáticas (código e migration)')
  verifyRpcList()
  verifyTriggerSnapshotMatchesMigration()
  verifySendGuardMatchesMigration()
  await scenarioFreshInstall(files)
  await scenarioUpgrade(files)
  await scenarioRealtimeUnavailable(files)
  await scenarioVerifyOnlyOverNetwork(files)
  await scenarioRealtimeInsertDenied(files)
  await scenarioRealtimePartitionLapsed(files)
  return printSummary()
}

export async function main(argv = process.argv.slice(2)) {
  return argv.includes('--verify-only') ? mainVerifyOnly() : mainAll()
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false
  const self = fileURLToPath(import.meta.url)
  const invoked = resolve(process.argv[1])
  return process.platform === 'win32' ? self.toLowerCase() === invoked.toLowerCase() : self === invoked
})()

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
