alter table public.companies add column phone text;
alter table public.activities add column created_by uuid default auth.uid();
alter table public.activities add constraint activities_creator_org_fkey foreign key(created_by,org_id) references public.profiles(id,org_id);
create index activities_creator_org_idx on public.activities(created_by,org_id);
create function private.record_activity_author() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by=auth.uid(); else new.created_by=old.created_by; end if;
 return new;
end $$;
create trigger record_activity_author before insert or update on public.activities for each row execute function private.record_activity_author();
revoke execute on function private.record_activity_author() from public,anon,authenticated;
