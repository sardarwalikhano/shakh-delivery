-- Add explicit, server-verified captain availability without changing delivery/payment flows.
alter table public.profiles
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_captain_presence_idx
  on public.profiles (is_online, last_seen_at desc)
  where is_online = true;

create or replace function public.guard_captain_presence_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if (new.is_online is distinct from old.is_online
      or new.last_seen_at is distinct from old.last_seen_at)
     and (
       pg_catalog.current_setting('shakh.captain_presence_rpc', true) is distinct from 'allowed'
       or not exists (
         select 1
         from public.user_roles ur
         where ur.user_id = auth.uid()
           and ur.role = 'captain'::public.app_role
       )
       or new.id is distinct from auth.uid()
     ) then
    raise exception 'Use the captain presence endpoint to update availability'
      using errcode = '42501';
  end if;
  return new;
end;
$guard$;

drop trigger if exists guard_captain_presence_columns on public.profiles;
create trigger guard_captain_presence_columns
before update of is_online, last_seen_at on public.profiles
for each row execute function public.guard_captain_presence_columns();

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

  perform pg_catalog.set_config('shakh.captain_presence_rpc', 'allowed', true);

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

revoke all on function public.guard_captain_presence_columns() from public, anon, authenticated;
revoke all on function public.set_captain_presence(boolean) from public, anon;
grant execute on function public.set_captain_presence(boolean) to authenticated;
