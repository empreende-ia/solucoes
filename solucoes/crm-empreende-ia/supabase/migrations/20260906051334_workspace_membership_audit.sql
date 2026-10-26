create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 user_id uuid, entity_type text not null, entity_id uuid not null, action text not null check(action in ('create','update','delete')),
 changed_fields text[] not null default '{}', created_at timestamptz not null default now(),
 foreign key(user_id,org_id) references public.profiles(id,org_id)
);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public,anon,authenticated;
grant select on public.audit_logs to authenticated;
create policy audit_read on public.audit_logs for select to authenticated using(org_id=(select private.current_org()) and (select private.can_manage()));
create index audit_org_time on public.audit_logs(org_id,created_at desc);
create index audit_user_org on public.audit_logs(user_id,org_id);
create function private.audit_record_change() returns trigger language plpgsql security definer set search_path='' as $$
 declare v_row jsonb; v_org uuid; fields text[];
 begin
 v_row=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 v_org=(v_row->>'org_id')::uuid;
 if tg_op='UPDATE' then
  select array_agg(key order by key) into fields from jsonb_each(to_jsonb(new)) where key not in ('updated_at') and value is distinct from to_jsonb(old)->key;
  if fields is null then return new; end if;
 else fields='{}'; end if;
 insert into public.audit_logs(org_id,user_id,entity_type,entity_id,action,changed_fields)
 values(v_org,auth.uid(),tg_table_name,(v_row->>'id')::uuid,case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,coalesce(fields,'{}'));
 if tg_op='DELETE' then return old; else return new; end if;
 end;
$$;
do $$ declare t text; begin
 foreach t in array array['contacts','companies','deals','activities','payments','pipelines','pipeline_stages','automations','integration_configs','email_templates','invitations','user_roles','risk_rules'] loop
 execute format('create trigger audit_record_change after insert or update or delete on public.%I for each row execute function private.audit_record_change()',t);
 end loop;
end $$;

create function private.set_member_role(p_user_id uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
 declare v_org uuid; v_current text; v_actor text;
 begin
 v_org=private.current_org();
 if not private.can_manage() then raise exception 'Somente administradores podem alterar permissões.'; end if;
 if p_role not in ('owner','admin','member','viewer') then raise exception 'Papel inválido.'; end if;
 perform 1 from public.organizations where id=v_org for update;
 select role into v_actor from public.user_roles where org_id=v_org and user_id=auth.uid();
 select role into v_current from public.user_roles where org_id=v_org and user_id=p_user_id for update;
 if v_current is null then raise exception 'Pessoa indisponível nesta organização.'; end if;
 if (v_current='owner' or p_role='owner') and v_actor<>'owner' then raise exception 'Somente um dono pode alterar este papel.'; end if;
 if v_current='owner' and p_role<>'owner' and (select count(*) from public.user_roles where org_id=v_org and role='owner')<=1 then raise exception 'Mantenha pelo menos um dono na organização.'; end if;
 update public.user_roles set role=p_role where org_id=v_org and user_id=p_user_id;
 end;
$$;
create function public.set_member_role(p_user_id uuid,p_role text) returns void language sql security invoker set search_path='' as $$ select private.set_member_role(p_user_id,p_role); $$;
create function private.accept_invitation(p_invitation_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare invitation public.invitations; v_email text; v_confirmed timestamptz; v_org uuid;
 begin
 if auth.uid() is null then raise exception 'Entre na sua conta para aceitar.'; end if;
 select email,email_confirmed_at into v_email,v_confirmed from auth.users where id=auth.uid();
 if v_confirmed is null then raise exception 'Confirme seu e-mail antes de aceitar o convite.'; end if;
 select org_id into v_org from public.profiles where id=auth.uid() for update;
 if v_org is not null then raise exception 'Sua conta já pertence a uma organização.'; end if;
 select * into invitation from public.invitations where id=p_invitation_id for update;
 if not found or invitation.accepted_at is not null or invitation.expires_at<=now() or lower(trim(invitation.email))<>lower(trim(v_email)) then raise exception 'Convite inválido, expirado ou destinado a outro e-mail.'; end if;
 update public.profiles set org_id=invitation.org_id where id=auth.uid();
 insert into public.user_roles(user_id,org_id,role) values(auth.uid(),invitation.org_id,invitation.role);
 update public.invitations set accepted_at=now() where id=invitation.id;
 return invitation.org_id;
 end;
$$;
create function public.accept_invitation(p_invitation_id uuid) returns uuid language sql security invoker set search_path='' as $$ select private.accept_invitation(p_invitation_id); $$;
revoke execute on function private.audit_record_change(),private.set_member_role(uuid,text),private.accept_invitation(uuid) from public,anon,authenticated;
grant execute on function private.set_member_role(uuid,text),private.accept_invitation(uuid) to authenticated;
revoke execute on function public.set_member_role(uuid,text),public.accept_invitation(uuid) from public,anon;
grant execute on function public.set_member_role(uuid,text),public.accept_invitation(uuid) to authenticated;
