-- Fresh commercial database. This migration never reads the inherited clinical project.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 2 and 160),
 domain text, logo_url text, plan text not null default 'starter', created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 org_id uuid references public.organizations(id), name text not null default '', email text not null default '', avatar_url text,
 onboarding_completed boolean not null default false, onboarding_step integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,org_id)
);
create table public.user_roles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, org_id uuid not null references public.organizations(id),
 role text not null check (role in ('owner','admin','member','viewer')), unique(user_id,org_id),
 foreign key(user_id,org_id) references public.profiles(id,org_id) on delete cascade
);
create function private.current_org() returns uuid language sql stable security definer set search_path = '' as $$
 select org_id from public.profiles where id = (select auth.uid());
$$;
create function private.can_write() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.user_roles where user_id=(select auth.uid()) and org_id=private.current_org() and role in ('owner','admin','member'));
$$;
create function private.can_manage() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.user_roles where user_id=(select auth.uid()) and org_id=private.current_org() and role in ('owner','admin'));
$$;

create table public.companies (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name))>0), domain text, industry text, size text, revenue numeric(16,2), website text, linkedin_url text,
 owner_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,org_id),
 foreign key(owner_id,org_id) references public.profiles(id,org_id)
);
create table public.contacts (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 first_name text not null check(length(trim(first_name))>0), last_name text, email text, phone text,
 company_id uuid, owner_id uuid, status text not null default 'lead' check(status in ('lead','prospect','customer','churned')),
 job_title text, source text, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,org_id),
 foreign key(company_id,org_id) references public.companies(id,org_id),
 foreign key(owner_id,org_id) references public.profiles(id,org_id)
);
create table public.pipelines (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), name text not null check(length(trim(name))>0),
 currency text not null default 'BRL' check(currency='BRL'), is_default boolean not null default false,
 created_at timestamptz not null default now(), unique(id,org_id)
);
create unique index one_default_pipeline_per_org on public.pipelines(org_id) where is_default;
create table public.pipeline_stages (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, pipeline_id uuid not null,
 name text not null check(length(trim(name))>0), "order" integer not null default 0, color text not null default '#0fa968',
 win_probability numeric(5,2) not null default 0 check(win_probability between 0 and 100),
 created_at timestamptz not null default now(), unique(id,pipeline_id,org_id), unique(id,org_id),
 foreign key(pipeline_id,org_id) references public.pipelines(id,org_id) on delete cascade
);
create table public.deals (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), pipeline_id uuid not null, stage_id uuid not null,
 title text not null check(length(trim(title))>0), value numeric(16,2) not null default 0 check(value>=0), currency text not null default 'BRL' check(currency='BRL'),
 contact_id uuid, company_id uuid, owner_id uuid, close_date date, probability numeric(5,2) check(probability between 0 and 100),
 status text not null default 'open' check(status in ('open','won','lost')), lost_reason text,
 stage_entered_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,org_id),
 constraint lost_needs_reason check(status<>'lost' or coalesce(length(trim(lost_reason)),0)>0),
 constraint won_needs_owner check(status<>'won' or owner_id is not null),
 foreign key(stage_id,pipeline_id,org_id) references public.pipeline_stages(id,pipeline_id,org_id),
 foreign key(contact_id,org_id) references public.contacts(id,org_id),
 foreign key(company_id,org_id) references public.companies(id,org_id),
 foreign key(owner_id,org_id) references public.profiles(id,org_id)
);
create table public.activities (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 type text not null default 'task' check(type in ('task','meeting','call','email','note')),
 title text not null check(length(trim(title))>0), body text, contact_id uuid, company_id uuid, deal_id uuid, user_id uuid,
 due_date timestamptz, end_date timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,org_id),
 check(end_date is null or (due_date is not null and end_date>due_date)),
 foreign key(contact_id,org_id) references public.contacts(id,org_id),
 foreign key(company_id,org_id) references public.companies(id,org_id),
 foreign key(deal_id,org_id) references public.deals(id,org_id),
 foreign key(user_id,org_id) references public.profiles(id,org_id)
);
create table public.deal_stage_history (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, deal_id uuid not null,
 from_stage_id uuid, to_stage_id uuid not null, from_status text, to_status text not null, changed_by uuid,
 created_at timestamptz not null default now(),
 foreign key(deal_id,org_id) references public.deals(id,org_id) on delete cascade,
 foreign key(from_stage_id,org_id) references public.pipeline_stages(id,org_id),
 foreign key(to_stage_id,org_id) references public.pipeline_stages(id,org_id),
 foreign key(changed_by,org_id) references public.profiles(id,org_id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 description text not null check(length(trim(description))>0), amount numeric(16,2) not null check(amount>0),
 currency text not null default 'BRL' check(currency='BRL'), status text not null default 'pending' check(status in ('pending','paid','cancelled')),
 contact_id uuid, company_id uuid, deal_id uuid, due_date date not null, paid_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status<>'paid' or paid_at is not null),
 foreign key(contact_id,org_id) references public.contacts(id,org_id),
 foreign key(company_id,org_id) references public.companies(id,org_id),
 foreign key(deal_id,org_id) references public.deals(id,org_id)
);
create table public.risk_rules (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 name text not null, type text not null check(type in ('overdue','no_owner','no_next_action','stale_deal')),
 enabled boolean not null default true, threshold_days integer not null default 7 check(threshold_days between 1 and 365),
 priority integer not null default 2 check(priority between 1 and 3), unique(org_id,type)
);
create table public.automations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name))>0), trigger_type text not null check(trigger_type in ('deal_created','deal_won','deal_moved')),
 is_active boolean not null default false, task_title text not null check(length(trim(task_title))>0),
 due_days integer not null default 1 check(due_days between 0 and 365), created_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,org_id),
 foreign key(created_by,org_id) references public.profiles(id,org_id)
);
create table public.automation_logs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, automation_id uuid not null, deal_id uuid not null, activity_id uuid,
 status text not null check(status in ('success','failed')), error_message text, created_at timestamptz not null default now(),
 foreign key(automation_id,org_id) references public.automations(id,org_id),
 foreign key(deal_id,org_id) references public.deals(id,org_id), foreign key(activity_id,org_id) references public.activities(id,org_id)
);
create table public.integration_configs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 provider text not null check(provider in ('csv','calendar')), enabled boolean not null default false,
 last_checked_at timestamptz, created_at timestamptz not null default now(), unique(org_id,provider)
);
create table public.email_templates (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name))>0), subject text not null default '', body text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), email text not null,
 role text not null default 'member' check(role in ('admin','member','viewer')), invited_by uuid,
 accepted_at timestamptz, expires_at timestamptz not null default (now()+interval '7 days'), created_at timestamptz not null default now(),
 foreign key(invited_by,org_id) references public.profiles(id,org_id)
);
create unique index invitations_pending on public.invitations(org_id,lower(email)) where accepted_at is null;
create table public.onboarding_progress (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, user_id uuid not null,
 dismissed_at timestamptz, updated_at timestamptz not null default now(), unique(user_id,org_id),
 foreign key(user_id,org_id) references public.profiles(id,org_id) on delete cascade
);

revoke all on all tables in schema public from public,anon,authenticated;

-- Every exposed table is isolated. Write capabilities are checked again in PostgreSQL.
alter table public.organizations enable row level security;
grant select on public.organizations to authenticated;
grant update(name,domain,logo_url) on public.organizations to authenticated;
create policy org_read on public.organizations for select to authenticated using(id=(select private.current_org()));
create policy org_update on public.organizations for update to authenticated using(id=(select private.current_org()) and (select private.can_manage())) with check(id=(select private.current_org()) and (select private.can_manage()));
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update(name,avatar_url,onboarding_step,onboarding_completed) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or org_id=(select private.current_org()));
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
alter table public.user_roles enable row level security;
grant select on public.user_roles to authenticated;
create policy roles_read on public.user_roles for select to authenticated using(org_id=(select private.current_org()));

do $$ declare t text; begin
 foreach t in array array['companies','contacts','pipelines','pipeline_stages','deals','activities','payments','risk_rules','automations','integration_configs','email_templates','invitations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using(org_id=(select private.current_org()))',t);
  if t=any(array['pipelines','pipeline_stages','risk_rules','automations','integration_configs','invitations']) then
   execute format('create policy tenant_write on public.%I for all to authenticated using(org_id=(select private.current_org()) and (select private.can_manage())) with check(org_id=(select private.current_org()) and (select private.can_manage()))',t);
  else
   execute format('create policy tenant_write on public.%I for all to authenticated using(org_id=(select private.current_org()) and (select private.can_write())) with check(org_id=(select private.current_org()) and (select private.can_write()))',t);
  end if;
 end loop;
 foreach t in array array['deal_stage_history','automation_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using(org_id=(select private.current_org()))',t);
 end loop;
end $$;
alter table public.onboarding_progress enable row level security;
grant select,insert,update on public.onboarding_progress to authenticated;
create policy own_progress on public.onboarding_progress for all to authenticated using(user_id=(select auth.uid()) and org_id=(select private.current_org())) with check(user_id=(select auth.uid()) and org_id=(select private.current_org()));

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
 begin new.updated_at=now(); return new; end;
$$;
do $$ declare t text; begin
 foreach t in array array['profiles','companies','contacts','deals','activities','payments','automations','email_templates','onboarding_progress'] loop
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 end loop;
end $$;

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.profiles(id,email,name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'name',''),160));
 return new;
 end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.create_workspace(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
 declare v_org uuid; v_pipeline uuid;
 begin
 if auth.uid() is null then raise exception 'Entre na sua conta para continuar.'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if private.current_org() is not null then raise exception 'Sua conta já pertence a uma organização.'; end if;
 insert into public.organizations(name) values(trim(p_name)) returning id into v_org;
 update public.profiles set org_id=v_org where id=auth.uid();
 insert into public.user_roles(user_id,org_id,role) values(auth.uid(),v_org,'owner');
 insert into public.pipelines(org_id,name,is_default) values(v_org,'Comercial',true) returning id into v_pipeline;
 insert into public.pipeline_stages(org_id,pipeline_id,name,"order",win_probability) values
 (v_org,v_pipeline,'Novo contato',0,10),(v_org,v_pipeline,'Qualificação',1,25),(v_org,v_pipeline,'Proposta',2,60),(v_org,v_pipeline,'Negociação',3,80);
 insert into public.risk_rules(org_id,name,type,priority) values
 (v_org,'Atividades vencidas','overdue',1),(v_org,'Sem responsável','no_owner',2),(v_org,'Sem próxima ação','no_next_action',2),(v_org,'Oportunidades paradas','stale_deal',3);
 return v_org;
 end;
$$;
create function public.create_workspace(p_name text) returns uuid language sql security invoker set search_path='' as $$ select private.create_workspace(p_name); $$;

create function private.record_deal_change() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if tg_op='INSERT' then
  insert into public.deal_stage_history(org_id,deal_id,to_stage_id,to_status,changed_by) values(new.org_id,new.id,new.stage_id,new.status,auth.uid());
 elsif old.stage_id is distinct from new.stage_id or old.status is distinct from new.status then
  insert into public.deal_stage_history(org_id,deal_id,from_stage_id,to_stage_id,from_status,to_status,changed_by) values(new.org_id,new.id,old.stage_id,new.stage_id,old.status,new.status,auth.uid());
 end if;
 return new;
 end;
$$;
create function private.validate_deal_change() returns trigger language plpgsql set search_path='' as $$
 begin
 if tg_op='INSERT' or old.stage_id is distinct from new.stage_id then new.stage_entered_at=now();
 else new.stage_entered_at=old.stage_entered_at; end if;
 if new.status<>'lost' then new.lost_reason=null; end if;
 return new;
 end;
$$;
create trigger validate_deal_change before insert or update on public.deals for each row execute function private.validate_deal_change();
create trigger record_deal_change after insert or update on public.deals for each row execute function private.record_deal_change();
create function public.move_deal(p_deal_id uuid,p_stage_id uuid,p_status text default null,p_lost_reason text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
 declare v_deal public.deals;
 begin
 if not private.can_write() then raise exception 'Você não tem permissão para alterar oportunidades.'; end if;
 update public.deals set stage_id=p_stage_id,status=coalesce(p_status,status),lost_reason=case when p_status='lost' then p_lost_reason else lost_reason end
 where id=p_deal_id returning * into v_deal;
 if not found then raise exception 'Oportunidade indisponível ou sem acesso.'; end if;
 return to_jsonb(v_deal);
 end;
$$;

create function private.run_deal_automations() returns trigger language plpgsql security definer set search_path='' as $$
 declare rule public.automations; v_trigger text; v_activity uuid;
 begin
 if tg_op='INSERT' then v_trigger='deal_created';
 elsif old.status is distinct from new.status and new.status='won' then v_trigger='deal_won';
 elsif old.stage_id is distinct from new.stage_id then v_trigger='deal_moved'; else return new; end if;
 for rule in select * from public.automations where org_id=new.org_id and is_active and trigger_type=v_trigger loop
  begin
   insert into public.activities(org_id,type,title,deal_id,contact_id,company_id,user_id,due_date)
    values(new.org_id,'task',rule.task_title,new.id,new.contact_id,new.company_id,new.owner_id,now()+make_interval(days=>rule.due_days)) returning id into v_activity;
   insert into public.automation_logs(org_id,automation_id,deal_id,activity_id,status) values(new.org_id,rule.id,new.id,v_activity,'success');
  exception when others then
   insert into public.automation_logs(org_id,automation_id,deal_id,status,error_message) values(new.org_id,rule.id,new.id,'failed','Não foi possível criar a tarefa. Revise os vínculos e o responsável.');
  end;
 end loop;
 return new;
 end;
$$;
create trigger run_deal_automations after insert or update on public.deals for each row execute function private.run_deal_automations();

-- Index tenant filters and all relationship lookups, including composite FK prefixes.
do $$ declare rec record; begin
 for rec in select conrelid::regclass as tbl,conname,array_to_string(array(select quote_ident(a.attname) from unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by ord),',') as cols
 from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace loop
  execute format('create index %I on %s(%s)',left(rec.conname,54)||'_idx',rec.tbl,rec.cols);
 end loop;
end $$;
create index contacts_org_name on public.contacts(org_id,first_name,last_name);
create index deals_org_status on public.deals(org_id,status,stage_id);
create index activities_org_pending on public.activities(org_id,due_date) where completed_at is null;
create index activities_owner_pending on public.activities(org_id,user_id,due_date) where completed_at is null;
create index history_deal_time on public.deal_stage_history(deal_id,created_at desc);
create index payments_org_due on public.payments(org_id,due_date,status);

revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.current_org(),private.can_write(),private.can_manage(),private.create_workspace(text) to authenticated;
revoke execute on function public.create_workspace(text),public.move_deal(uuid,uuid,text,text) from public,anon;
grant execute on function public.create_workspace(text),public.move_deal(uuid,uuid,text,text) to authenticated;
