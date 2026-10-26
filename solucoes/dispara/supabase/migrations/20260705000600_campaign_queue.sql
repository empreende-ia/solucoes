-- Migração QStash → pg_cron (Fase F): disparo em massa sem QStash.
--
-- Antes: o dispatch enfileirava um workflow no QStash (@upstash/workflow serve()), que
-- orquestrava init/prepare/send-batch-N/complete como passos duráveis (cada passo = uma
-- invocação HTTP, driblando o timeout). O QStash também dava o "retry" quando um passo
-- morria.
--
-- Agora: campaign_contacts JÁ é a fila (status='pending'). O endpoint /api/campaign/workflow
-- vira um DRENADOR: claima lotes de pending (CAS pending->sending, FOR UPDATE SKIP LOCKED),
-- envia, e repete até esvaziar a fila ou estourar o time budget (então auto-reinvoca via
-- fetch(self)). O pg_cron é o sweeper/reaper que:
--   (a) reseta linhas 'sending' órfãs (lease vencido) de volta pra 'pending';
--   (b) re-dispara o dreno de campanhas SENDING que ainda têm pending e cujo lock expirou.
--
-- O no-double-send NÃO vinha do QStash — vem do CAS pending->sending. Aqui endurecemos com
-- FOR UPDATE SKIP LOCKED (dois drenadores concorrentes claimam lotes disjuntos) + lock POR
-- CAMPANHA (1 drenador por vez por campanha, impedindo rate-limiters duplicados pra mesma
-- campanha; campanhas distintas no mesmo WABA seguem compartilhando o AIMD global por
-- phoneNumberId, que se auto-corrige por backoff — como no modelo QStash anterior).
--
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1) campaign_contacts vira fila com lease
-- ---------------------------------------------------------------------------
alter table public.campaign_contacts
  add column if not exists attempts    integer not null default 0;
alter table public.campaign_contacts
  add column if not exists lease_until  timestamptz;
alter table public.campaign_contacts
  add column if not exists locked_by    text;

-- Índice parcial da fila: o subselect do claim varre só os 'pending' desta campanha.
create index if not exists idx_campaign_contacts_pending
  on public.campaign_contacts (campaign_id, id)
  where status = 'pending';

-- Índice do reaper: varre 'sending' órfãos por lease vencido.
create index if not exists idx_campaign_contacts_sending_lease
  on public.campaign_contacts (lease_until)
  where status = 'sending';

-- ---------------------------------------------------------------------------
-- 2) Lock POR CAMPANHA: 1 drenador por vez por campanha (evita rate-limiters duplicados)
-- ---------------------------------------------------------------------------
alter table public.campaigns
  add column if not exists dispatch_lock_until timestamptz;
alter table public.campaigns
  add column if not exists dispatch_locked_by  text;

-- ---------------------------------------------------------------------------
-- 3) RPC: claim atômico de N pending (FOR UPDATE SKIP LOCKED)
--    Substitui bulkClaimPendingForSend quando o dreno claima o lote de fora.
--    Garante forward-progress: cada linha claimada sai de 'pending'.
-- ---------------------------------------------------------------------------
create or replace function public.claim_campaign_batch(
  p_campaign_id text,
  p_limit       int,
  p_trace_id    text default null,
  p_worker      text default null,
  p_lease_seconds int default 600
)
returns setof public.campaign_contacts
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit <= 0 then
    return;
  end if;

  return query
  update public.campaign_contacts cc
  set status      = 'sending',
      sending_at  = now(),
      trace_id    = coalesce(p_trace_id, cc.trace_id),
      lease_until = now() + make_interval(secs => greatest(60, p_lease_seconds)),
      locked_by   = p_worker,
      attempts    = coalesce(cc.attempts, 0) + 1
  from (
    select id
    from public.campaign_contacts
    where campaign_id = p_campaign_id
      and status = 'pending'
      and contact_id is not null
    order by id
    limit p_limit
    for update skip locked
  ) sub
  where cc.id = sub.id
  returning cc.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) RPC: reaper de 'sending' órfão (lease vencido)
--    - message_id preenchido  -> foi enviado, só não marcou: reconcilia p/ 'sent'.
--    - attempts >= max         -> poison: marca 'failed' (não fica em loop eterno).
--    - senão                   -> volta pra 'pending' (retry).
--    Retorna quantas linhas foram tocadas.
--    CAVEAT (at-least-once): se o dreno morreu DEPOIS de enviar à Meta mas ANTES de
--    persistir message_id, o reset p/ 'pending' pode reenviar. O webhook reconcilia via
--    message_id; o lease de 10min minimiza a janela. Aceitável no v1 (o QStash também
--    tinha semântica at-least-once com retries).
-- ---------------------------------------------------------------------------
create or replace function public.reap_stuck_campaign_sending(
  p_older_minutes int default 10,
  p_max_attempts  int default 5
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmed int;
  v_failed    int;
  v_requeued  int;
begin
  -- (a) enviados-mas-não-marcados: reconcilia p/ 'sent'
  update public.campaign_contacts
  set status      = 'sent',
      sent_at     = coalesce(sent_at, now()),
      lease_until = null,
      locked_by   = null
  where status = 'sending'
    and message_id is not null
    and (lease_until is null or lease_until < now())
    and sending_at < now() - make_interval(mins => p_older_minutes);
  get diagnostics v_confirmed = row_count;

  -- (b) poison: excedeu tentativas -> 'failed'
  update public.campaign_contacts
  set status         = 'failed',
      failed_at      = now(),
      failure_reason = coalesce(failure_reason, 'Excedeu tentativas de envio (lease de disparo)'),
      error          = coalesce(error, 'Excedeu tentativas de envio (lease de disparo)'),
      lease_until    = null,
      locked_by      = null
  where status = 'sending'
    and message_id is null
    and coalesce(attempts, 0) >= p_max_attempts
    and (lease_until is null or lease_until < now())
    and sending_at < now() - make_interval(mins => p_older_minutes);
  get diagnostics v_failed = row_count;

  -- (c) órfão recuperável -> volta pra 'pending'
  update public.campaign_contacts
  set status      = 'pending',
      lease_until = null,
      locked_by   = null
  where status = 'sending'
    and message_id is null
    and coalesce(attempts, 0) < p_max_attempts
    and (lease_until is null or lease_until < now())
    and sending_at < now() - make_interval(mins => p_older_minutes);
  get diagnostics v_requeued = row_count;

  return coalesce(v_confirmed, 0) + coalesce(v_failed, 0) + coalesce(v_requeued, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC: lock de campanha (CAS). Retorna true se este worker adquiriu o lock.
--    TTL > maxDuration (300s) pra que um dreno que morreu libere o lock pro sweeper.
-- ---------------------------------------------------------------------------
create or replace function public.try_lock_campaign_dispatch(
  p_campaign_id text,
  p_worker      text,
  p_ttl_seconds int default 360
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.campaigns
  set dispatch_lock_until = now() + make_interval(secs => greatest(60, p_ttl_seconds)),
      dispatch_locked_by  = p_worker
  where id = p_campaign_id
    and (dispatch_lock_until is null or dispatch_lock_until < now());

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0) > 0;
end;
$$;

-- Libera o lock (só se ainda for deste worker; evita liberar o lock de outro dreno).
create or replace function public.release_campaign_dispatch_lock(
  p_campaign_id text,
  p_worker      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.campaigns
  set dispatch_lock_until = null,
      dispatch_locked_by  = null
  where id = p_campaign_id
    and dispatch_locked_by = p_worker;
end;
$$;
