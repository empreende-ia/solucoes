-- Keep tenant reads available to every member without evaluating a second SELECT policy.
-- Grants, including invitation insert columns and its lack of UPDATE, remain unchanged.
do $$ declare t text; begin
 foreach t in array array['automations','integration_configs','invitations','pipeline_stages','pipelines','risk_rules'] loop
  execute format('drop policy tenant_write on public.%I',t);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check(org_id=(select private.current_org()) and (select private.can_manage()))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using(org_id=(select private.current_org()) and (select private.can_manage())) with check(org_id=(select private.current_org()) and (select private.can_manage()))',t);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using(org_id=(select private.current_org()) and (select private.can_manage()))',t);
 end loop;
end $$;
