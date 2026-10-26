-- Migração QStash → pg_cron (Fase D, correção adversarial): dedupe de inbound do webhook.
--
-- Os webhooks da Meta são at-least-once: a mesma mensagem inbound pode chegar 2x (comum
-- quando o handler demora e o Meta re-entrega). Sem dedupe, cada cópia disparava o
-- workflow (execute/resume) de novo → mensagens duplicadas antes do primeiro wait.
--
-- Esta tabela é o gate: o webhook insere message_id com ON CONFLICT DO NOTHING RETURNING
-- e só dispara o fluxo se o insert foi novo. Idempotente.

create table if not exists public.processed_inbound_messages (
  message_id text primary key,
  created_at timestamptz not null default now()
);

comment on table public.processed_inbound_messages is
  'Dedupe de mensagens inbound do webhook (Meta at-least-once). Gate antes de disparar workflow. Fase D.';

-- Índice para limpeza periódica (o cron pode apagar registros antigos).
create index if not exists idx_processed_inbound_created
  on public.processed_inbound_messages (created_at);
