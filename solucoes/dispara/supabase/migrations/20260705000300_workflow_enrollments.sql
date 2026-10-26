-- Migração QStash → pg_cron (Fase D): motor de waits duráveis dos fluxos.
--
-- Hoje o nó Delay do builder é um setTimeout in-process dentro de um único step do
-- executor — que morre no maxDuration (~5min). Consequência: "esperar horas/dias"
-- NUNCA completa (aborta em silêncio). Esta tabela dá durabilidade real: ao encontrar
-- um Delay, o executor persiste o ponto de continuação (current_node_id + variables +
-- resolved_nodes) com resume_at, e o relógio (pg_cron → /api/cron/tick) drena os
-- enrollments vencidos, retomando a execução SÓ do current_node_id em diante.
--
-- resolved_nodes é a defesa anti-double-send: os nós já executados antes do wait são
-- re-hidratados no Set resolvedNodes do executor, que os pula ao retomar.
--
-- Idempotente (fresh install; sem dados a preservar).

create table if not exists public.workflow_enrollments (
  id             uuid primary key default gen_random_uuid(),
  workflow_id    text not null,
  version_id     text not null,
  phone          text not null,
  contact_id     text,
  status         text not null default 'active',      -- active | waiting | completed | failed | cancelled
  wait_kind      text,                                 -- delay | ask_question
  current_node_id text,                                -- de onde retomar
  resume_at      timestamptz,                          -- quando o Delay fica drenável
  resume_node_id text,                                 -- ask_question: nó que consome a resposta
  variable_key   text,                                 -- ask_question: chave onde grava a resposta
  variables      jsonb not null default '{}',          -- estado das variáveis (sobrevive ao wait)
  resolved_nodes jsonb not null default '[]',          -- nós já executados (anti double-send)
  outputs        jsonb not null default '{}',          -- snapshot de saídas dos nós resolvidos (re-hidrata {{@node}}/{{@__trigger}})
  resume_node_ids jsonb not null default '[]',         -- TODAS as raízes de retomada do Delay (resume multi-head)
  split_path     text,                                 -- caminho de split "grudado" (fase futura)
  run_id         text,                                 -- workflow_runs.id associado
  attempts       int not null default 0,
  locked_at      timestamptz,                          -- lease do drenador (cron)
  locked_by      text,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Drain: o cron seleciona waiting com resume_at vencido.
create index if not exists idx_workflow_enrollments_drain
  on public.workflow_enrollments (resume_at)
  where status = 'waiting';

-- Um único enrollment ativo/esperando por (workflow, telefone) — evita duplicar/retomar
-- o mesmo contato duas vezes no mesmo fluxo.
create unique index if not exists ux_workflow_enrollments_active
  on public.workflow_enrollments (workflow_id, phone)
  where status in ('active', 'waiting');

comment on table public.workflow_enrollments is
  'Contato inscrito num fluxo, com estado durável para waits (Delay/ask-question). Drenado pelo pg_cron. Fase D da migração QStash→pg_cron.';
