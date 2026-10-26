-- Migração QStash → pg_cron (Fase E): IA do inbox sem QStash e sem Redis.
--
-- Antes: o webhook enfileirava no QStash com delay=debounce (3s) e usava Redis para
-- (a) dedupe do processamento (ai:processed:<msg>, TTL 30min) e (b) o "reset do timer"
-- do debounce (ai:lastmsg:<conv>). O debounce de 3s é incompatível com o cron de 1min,
-- então ele passa a ser inline (o /api/ai/respond dorme debounce_ms) e o estado sai do
-- Redis para o Postgres.
--
-- Idempotente.

-- Lock idempotente do processamento de IA (substitui Redis ai:processed com TTL).
-- expires_at replica o TTL de 30min: uma limpeza periódica remove locks vencidos,
-- permitindo re-tentar se o processamento morreu no meio (antes de responder).
create table if not exists public.ai_processing_locks (
  message_id  text primary key,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_ai_processing_locks_expires
  on public.ai_processing_locks (expires_at);

-- "Reset do timer" do debounce (substitui Redis ai:lastmsg): o webhook grava a hora da
-- última inbound; o /api/ai/respond, após dormir o debounce, só processa se nenhuma
-- mensagem mais nova chegou (ai_last_inbound_at <= o firedAt do job).
alter table public.inbox_conversations
  add column if not exists ai_last_inbound_at timestamptz;

comment on table public.ai_processing_locks is
  'Dedupe idempotente do processamento de IA do inbox (substitui Redis). Fase E.';
