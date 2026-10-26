-- Add explicit, server-verified captain availability without changing delivery/payment flows.
alter table public.profiles
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_captain_presence_idx
  on public.profiles (is_online, last_seen_at desc)
  where is_online = true;

create or replace function public.set_captain_presence(p_is_online boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_last_seen timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_user_id
      and ur.role = 'captain'::public.app_role
  ) then
    raise exception 'Captain role required' using errcode = '42501';
  end if;

  update public.profiles p
     set is_online = p_is_online,
         last_seen_at = case when p_is_online then pg_catalog.now() else p.last_seen_at end,
         updated_at = pg_catalog.now()
   where p.id = v_user_id
   returning p.last_seen_at into v_last_seen;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'is_online', p_is_online,
    'last_seen_at', v_last_seen
  );
end;
$function$;

revoke all on function public.set_captain_presence(boolean) from public, anon;
grant execute on function public.set_captain_presence(boolean) to authenticated;
