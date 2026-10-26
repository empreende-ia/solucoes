-- Identity rule: an organization has one contact per non-empty email; names are never merged.
create unique index contacts_org_email_unique on public.contacts(org_id,lower(trim(email))) where email is not null and trim(email)<>'';
-- Destructive operations match the administrator-only controls in the client.
do $$ declare t text; begin
 foreach t in array array['companies','contacts','deals','activities','payments','email_templates'] loop
  execute format('drop policy tenant_write on public.%I',t);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check(org_id=(select private.current_org()) and (select private.can_write()))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using(org_id=(select private.current_org()) and (select private.can_write())) with check(org_id=(select private.current_org()) and (select private.can_write()))',t);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using(org_id=(select private.current_org()) and (select private.can_manage()))',t);
 end loop;
end $$;
create or replace function private.validate_deal_change() returns trigger language plpgsql set search_path='' as $$
 begin
 if tg_op='INSERT' or old.stage_id is distinct from new.stage_id then new.stage_entered_at=now();
 else new.stage_entered_at=old.stage_entered_at; end if;
 if new.status<>'lost' then new.lost_reason=null; end if;
 if new.status='won' then new.probability=100;
 elsif new.status='lost' then new.probability=0;
 elsif tg_op='UPDATE' and old.status<>'open' then
  select win_probability into new.probability from public.pipeline_stages where id=new.stage_id and org_id=new.org_id;
 end if;
 return new;
 end;
$$;
