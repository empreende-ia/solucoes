alter table public.deals add constraint deal_value_finite check(value<>'NaN'::numeric);
alter table public.payments add constraint payment_amount_finite check(amount<>'NaN'::numeric);
alter table public.companies add constraint company_revenue_valid check(revenue is null or (revenue>=0 and revenue<>'NaN'::numeric));

create or replace function private.set_member_role(p_user_id uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
 declare v_org uuid; v_current text; v_actor text;
 begin
 v_org=private.current_org();
 if not private.can_manage() then raise exception 'Somente administradores podem alterar permissões.'; end if;
 if p_role not in ('owner','admin','member','viewer') then raise exception 'Papel inválido.'; end if;
 perform 1 from public.organizations where id=v_org for update;
 select role into v_actor from public.user_roles where org_id=v_org and user_id=auth.uid();
 if v_actor is null or v_actor not in ('owner','admin') then raise exception 'Sua permissão foi alterada. Atualize a página.'; end if;
 select role into v_current from public.user_roles where org_id=v_org and user_id=p_user_id for update;
 if v_current is null then raise exception 'Pessoa indisponível nesta organização.'; end if;
 if (v_current='owner' or p_role='owner') and v_actor<>'owner' then raise exception 'Somente um dono pode alterar este papel.'; end if;
 if v_current='owner' and p_role<>'owner' and (select count(*) from public.user_roles where org_id=v_org and role='owner')<=1 then raise exception 'Mantenha pelo menos um dono na organização.'; end if;
 update public.user_roles set role=p_role where org_id=v_org and user_id=p_user_id;
 end;
$$;
