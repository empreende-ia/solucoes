-- Migração QStash → pg_cron (Fase G): remove as colunas do agendamento one-shot do QStash.
--
-- Desde a Fase C o agendamento de campanhas é feito pelo pg_cron (drainScheduledCampaigns
-- varre campaigns.status='Agendado' + scheduled_date vencido). As colunas abaixo guardavam o
-- message_id/enqueued_at do job QStash e não são mais escritas nem lidas por nenhum código.
--
-- Idempotente.

drop index if exists public.idx_campaigns_qstash_schedule_message_id;

alter table public.campaigns
  drop column if exists qstash_schedule_message_id;
alter table public.campaigns
  drop column if exists qstash_schedule_enqueued_at;
