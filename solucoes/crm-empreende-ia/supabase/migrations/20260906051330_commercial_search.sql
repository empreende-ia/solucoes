create function public.search_crm(p_query text,p_limit integer default 20)
returns table(entity text,id uuid,title text,subtitle text,path text)
language sql stable security invoker set search_path='' as $$
 with input as (select lower(left(trim(p_query),120)) as q), results as (
 select 'contact'::text as entity,c.id,concat_ws(' ',c.first_name,c.last_name) as title,coalesce(c.email,c.phone,'Contato') as subtitle,'/contacts?contact='||c.id::text as path,c.updated_at
 from public.contacts c,input where length(input.q)>=2 and strpos(lower(concat_ws(' ',c.first_name,c.last_name,c.email,c.phone)),input.q)>0
 union all
 select 'company',c.id,c.name,coalesce(c.industry,'Empresa'),'/companies?company='||c.id::text,c.updated_at from public.companies c,input where length(input.q)>=2 and strpos(lower(concat_ws(' ',c.name,c.domain)),input.q)>0
 union all
 select 'deal',d.id,d.title,'Oportunidade','/pipeline?deal='||d.id::text,d.updated_at from public.deals d,input where length(input.q)>=2 and strpos(lower(d.title),input.q)>0
 union all
 select 'activity',a.id,a.title,case a.type when 'meeting' then 'Reunião' when 'note' then 'Nota' else 'Atividade' end,'/activities?activity='||a.id::text,a.updated_at from public.activities a,input where length(input.q)>=2 and strpos(lower(a.title),input.q)>0
 ) select entity,id,title,subtitle,path from results order by updated_at desc,id limit greatest(1,least(coalesce(p_limit,20),50));
$$;
revoke execute on function public.search_crm(text,integer) from public,anon;
grant execute on function public.search_crm(text,integer) to authenticated;
