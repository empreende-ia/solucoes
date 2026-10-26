-- Migração QStash → pg_cron (Fase C): colunas de agendamento recorrente de workflow.
--
-- lib/builder/workflow-schedule.ts (chamado por publish/rollback) já lia/escrevia
-- estas colunas, mas elas nunca existiram no schema — a feature estava silenciosamente
-- quebrada. Criamos as colunas (sem a de QStash) para o estado do agendamento persistir.
--
-- NOTA: o trigger "Schedule" não está exposto no builder v1; a execução periódica
-- (drain que dispara o workflow no horário) fica pendente. Estas colunas preparam o
-- terreno. Idempotente.

alter table public.workflows add column if not exists schedule_cron text;
alter table public.workflows add column if not exists schedule_timezone text;
alter table public.workflows add column if not exists schedule_active boolean not null default false;
alter table public.workflows add column if not exists schedule_next_run_at timestamptz;
alter table public.workflows add column if not exists schedule_last_run_at timestamptz;
alter table public.workflows add column if not exists schedule_updated_at timestamptz;

comment on column public.workflows.schedule_active is
  'Agendamento recorrente do trigger Schedule ativo. Execução periódica pendente (Fase C, migração QStash→pg_cron).';
