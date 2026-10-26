-- Migração QStash → pg_cron (Fase A): infraestrutura de relógio.
--
-- O disparo e os waits duráveis do Dispara deixam de depender do Upstash QStash.
-- O relógio passa a ser o pg_cron do Supabase, que via pg_net faz um POST no
-- endpoint /api/cron/tick a cada minuto. A URL pública do deploy e o segredo de
-- autenticação são lidos do Supabase Vault (o installer os grava pós-deploy), de
-- modo que nenhum segredo fica em texto plano numa tabela lida pela aplicação.
--
-- Idempotente: pode rodar inteira mais de uma vez (installer aplica o SQL de uma vez).

-- 1) Extensões (Supabase gerencia o schema de cada uma: cron / net).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Função-relógio: lê base_url + secret do Vault e chama o endpoint /api/cron/tick.
--    SECURITY DEFINER porque acessa vault.decrypted_secrets. Sai em silêncio enquanto
--    o installer ainda não gravou os secrets (deploy pode preceder a configuração).
create or replace function public.dispara_cron_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_url text;
  v_secret   text;
begin
  begin
    select decrypted_secret into v_base_url
      from vault.decrypted_secrets where name = 'app_base_url' limit 1;
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  exception when others then
    -- Vault indisponível/ainda não provisionado: não faz nada neste tick.
    return;
  end;

  if v_base_url is null or v_secret is null then
    return; -- ainda não configurado pelo installer
  end if;

  perform net.http_post(
    url     := v_base_url || '/api/cron/tick',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := jsonb_build_object('source', 'pg_cron', 'ts', now()),
    timeout_milliseconds := 5000
  );
end;
$$;

comment on function public.dispara_cron_tick() is
  'Relógio do Dispara: pg_cron chama esta função a cada minuto; ela lê app_base_url+cron_secret do Vault e faz POST em /api/cron/tick. Substitui o QStash.';

-- 3) Agendamento a cada minuto. cron.schedule faz upsert pelo nome do job (idempotente).
--    Envolvido em bloco tolerante caso o ambiente de migração não exponha o schema cron
--    na mesma transação — o installer/README reagenda se necessário.
do $$
begin
  perform cron.schedule('dispara-cron-tick', '* * * * *', 'select public.dispara_cron_tick();');
exception when others then
  raise notice 'pg_cron: agendamento de dispara-cron-tick adiado (%). Reagende com cron.schedule após habilitar a extensão.', sqlerrm;
end $$;
