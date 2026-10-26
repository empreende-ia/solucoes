-- Values used for ordering, audit and identity are maintained by PostgreSQL.
create function private.protect_record_metadata() returns trigger language plpgsql set search_path='' as $$
 begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id then raise exception 'O identificador do registro não pode ser alterado.'; end if;
  if to_jsonb(new) ? 'created_at' then new.created_at=old.created_at; end if;
 else
  if to_jsonb(new) ? 'created_at' then new.created_at=now(); end if;
 end if;
 if tg_table_name='automations' then
  if tg_op='INSERT' then new.created_by=auth.uid(); else new.created_by=old.created_by; end if;
 elsif tg_table_name='invitations' then
  if tg_op='INSERT' then new.invited_by=auth.uid(); else new.invited_by=old.invited_by; end if;
 end if;
 return new;
 end;
$$;
do $$ declare t text; c record; begin
 foreach t in array array['organizations','profiles','companies','contacts','pipelines','pipeline_stages','deals','activities','payments','risk_rules','automations','integration_configs','email_templates','invitations','user_roles','onboarding_progress'] loop
  execute format('create trigger protect_record_metadata before insert or update on public.%I for each row execute function private.protect_record_metadata()',t);
 end loop;
 for c in select table_name,column_name from information_schema.columns where table_schema='public' and data_type in ('date','timestamp with time zone','timestamp without time zone') loop
  execute format('alter table public.%I add constraint %I check(isfinite(%I))',c.table_name,left(c.table_name||'_'||c.column_name,55)||'_finite',c.column_name);
 end loop;
end $$;
revoke execute on function private.protect_record_metadata() from public,anon,authenticated;
-- Acceptance is recorded only by the invitation RPC after verified identity checks.
revoke insert,update on public.invitations from authenticated;
grant insert(id,org_id,email,role,invited_by) on public.invitations to authenticated;
