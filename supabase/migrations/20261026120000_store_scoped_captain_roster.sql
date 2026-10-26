-- Store-scoped captain roster. A platform captain role does not automatically
-- grant access to every merchant's deliveries; each merchant explicitly enrolls captains.
create table if not exists public.store_captains (
  id uuid primary key default gen_random_uuid(),
  store_owner_id uuid not null references public.profiles(id) on delete cascade,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  unique (store_owner_id, captain_id),
  constraint store_captains_not_self check (store_owner_id <> captain_id)
);
create index if not exists store_captains_owner_active_idx
  on public.store_captains (store_owner_id, is_active, created_at desc);
create index if not exists store_captains_captain_idx
  on public.store_captains (captain_id, is_active);

alter table public.store_captains enable row level security;
revoke all on public.store_captains from anon, authenticated;

create or replace function public.list_store_captains()
returns table (
  captain_id uuid,
  full_name text,
  phone text,
  is_online boolean,
  last_seen_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_uid
      and ur.role in ('restaurant_vendor'::public.app_role,
                      'fashion_vendor'::public.app_role,
                      'supermarket_vendor'::public.app_role)
  ) then
    raise exception 'Merchant access required' using errcode = '42501';
  end if;

  return query
  select sc.captain_id, p.full_name, p.phone, p.is_online, p.last_seen_at, sc.is_active
  from public.store_captains sc
  join public.profiles p on p.id = sc.captain_id
  where sc.store_owner_id = v_uid
  order by sc.created_at desc;
end;
$function$;

create or replace function public.list_eligible_store_captains()
returns table (captain_id uuid, full_name text, phone text, is_online boolean, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_uid
      and ur.role in ('restaurant_vendor'::public.app_role,
                      'fashion_vendor'::public.app_role,
                      'supermarket_vendor'::public.app_role)
  ) then
    raise exception 'Merchant access required' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.phone, p.is_online, p.last_seen_at
  from public.profiles p
  where exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'captain'::public.app_role
  )
  and not exists (
    select 1 from public.store_captains sc
    where sc.store_owner_id = v_uid and sc.captain_id = p.id
  )
  order by p.full_name nulls last;
end;
$function$;

create or replace function public.add_store_captain(p_captain_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_uid
      and ur.role in ('restaurant_vendor'::public.app_role,
                      'fashion_vendor'::public.app_role,
                      'supermarket_vendor'::public.app_role)
  ) then
    raise exception 'Merchant access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_captain_id and ur.role = 'captain'::public.app_role
  ) then
    raise exception 'Selected user is not an authorized captain' using errcode = '23514';
  end if;
  insert into public.store_captains(store_owner_id, captain_id, created_by)
  values (v_uid, p_captain_id, v_uid)
  on conflict (store_owner_id, captain_id) do update set is_active = true;
end;
$function$;

create or replace function public.set_store_captain_active(p_captain_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_uid
      and ur.role in ('restaurant_vendor'::public.app_role,
                      'fashion_vendor'::public.app_role,
                      'supermarket_vendor'::public.app_role)
  ) then
    raise exception 'Merchant access required' using errcode = '42501';
  end if;
  update public.store_captains
    set is_active = p_is_active
  where store_owner_id = v_uid and captain_id = p_captain_id;
  if not found then raise exception 'Captain is not in your roster' using errcode = 'P0002'; end if;
end;
$function$;

revoke all on function public.list_store_captains() from public, anon;
revoke all on function public.list_eligible_store_captains() from public, anon;
revoke all on function public.add_store_captain(uuid) from public, anon;
revoke all on function public.set_store_captain_active(uuid, boolean) from public, anon;
grant execute on function public.list_store_captains() to authenticated;
grant execute on function public.list_eligible_store_captains() to authenticated;
grant execute on function public.add_store_captain(uuid) to authenticated;
grant execute on function public.set_store_captain_active(uuid, boolean) to authenticated;
