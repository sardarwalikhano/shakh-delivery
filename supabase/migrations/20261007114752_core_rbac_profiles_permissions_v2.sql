-- Applied to Supabase project jjtmtxrkbewmdxdmgtrf as migration core_rbac_profiles_permissions_v2.
-- Keep this file in source control so the database schema remains reproducible.

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin','admin','customer','captain','restaurant_vendor',
  'fashion_vendor','car_dealer','umrah_agency','support'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  city text not null default 'هەولێر',
  preferred_language text not null default 'ku',
  preferred_currency text not null default 'IQD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  code text primary key,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_code)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index user_roles_role_idx on public.user_roles(role);
create index role_permissions_permission_idx on public.role_permissions(permission_code);
create index audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger user_roles_set_updated_at before update on public.user_roles for each row execute function public.set_updated_at();

create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer'::public.app_role) on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
revoke all on function private.handle_new_user() from anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = (select auth.uid())
      and rp.permission_code = $1
  );
$$;

revoke all on function private.has_permission(text) from public;
grant execute on function private.has_permission(text) to authenticated;

insert into public.permissions (code, description) values
  ('dashboard.view','View the unified dashboard'),('profile.view','View profile'),('profile.update','Update profile'),
  ('users.view','View users'),('users.manage','Manage users'),('vendors.view','View vendors'),('vendors.manage','Manage vendors'),
  ('products.view','View products'),('products.manage','Manage products'),('orders.view','View orders'),('orders.manage','Manage orders'),
  ('deliveries.view','View deliveries'),('deliveries.manage','Manage deliveries'),('payments.view','View payments'),
  ('payments.manage','Manage payments'),('reports.view','View reports'),('promotions.manage','Manage promotions'),
  ('notifications.manage','Manage notifications'),('support.manage','Manage support'),('audit.view','View audit logs'),
  ('settings.manage','Manage settings')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role, permission_code)
select r.role, p.code
from (
  values ('super_admin'::public.app_role),('admin'::public.app_role),('customer'::public.app_role),
         ('captain'::public.app_role),('restaurant_vendor'::public.app_role),('fashion_vendor'::public.app_role),
         ('car_dealer'::public.app_role),('umrah_agency'::public.app_role),('support'::public.app_role)
) r(role)
cross join public.permissions p
where r.role = 'super_admin'::public.app_role
   or (r.role = 'admin'::public.app_role and p.code in ('dashboard.view','profile.view','profile.update','users.view','users.manage','vendors.view','vendors.manage','products.view','products.manage','orders.view','orders.manage','deliveries.view','deliveries.manage','payments.view','payments.manage','reports.view','promotions.manage','notifications.manage','support.manage','audit.view','settings.manage'))
   or (r.role = 'support'::public.app_role and p.code in ('dashboard.view','profile.view','profile.update','users.view','vendors.view','orders.view','deliveries.view','support.manage','notifications.manage'))
   or (r.role = 'captain'::public.app_role and p.code in ('dashboard.view','profile.view','profile.update','deliveries.view','deliveries.manage','orders.view','notifications.manage'))
   or (r.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency') and p.code in ('dashboard.view','profile.view','profile.update','products.view','products.manage','orders.view','orders.manage','deliveries.view','payments.view','promotions.manage','notifications.manage','reports.view'))
   or (r.role = 'customer'::public.app_role and p.code in ('dashboard.view','profile.view','profile.update','products.view','orders.view','orders.manage','deliveries.view','payments.view','notifications.manage'))
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "user_roles_select_own" on public.user_roles for select to authenticated using ((select auth.uid()) = user_id);
create policy "permissions_select_authenticated" on public.permissions for select to authenticated using (true);
create policy "role_permissions_select_authenticated" on public.role_permissions for select to authenticated using (true);
create policy "audit_logs_select_authorized" on public.audit_logs for select to authenticated using ((select private.has_permission('audit.view')));

revoke insert, update, delete on public.user_roles from anon, authenticated;
revoke insert, update, delete on public.permissions from anon, authenticated;
revoke insert, update, delete on public.role_permissions from anon, authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;
