-- Role-aware Post publishing
-- Super Admin: all post categories.
-- Other roles: their mapped role category plus Cars.
-- Customer: Cars only.
-- Authorization is enforced by RLS, not only by the UI.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace='public'::regnamespace and typname='post_category') then
    create type public.post_category as enum (
      'general','food','fashion','electronics','home_living',
      'beauty','kids','online_stores','cars','umrah','delivery'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace='public'::regnamespace and typname='post_status') then
    create type public.post_status as enum ('active','archived','deleted');
  end if;
end $$;

create table if not exists public.role_post_categories (
  role public.app_role not null,
  category public.post_category not null,
  created_at timestamptz not null default now(),
  primary key (role, category)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  publisher_role public.app_role not null,
  category public.post_category not null,
  title text not null check (char_length(btrim(title)) between 3 and 180),
  content text not null default '' check (char_length(content) <= 12000),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images)='array'),
  price_iqd numeric(14,2) check (price_iqd is null or price_iqd >= 0),
  location text,
  status public.post_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_active_category_created_idx
  on public.posts(category, created_at desc) where status='active';
create index if not exists posts_author_created_idx
  on public.posts(author_id, created_at desc);
create index if not exists posts_publisher_role_idx
  on public.posts(publisher_role);

alter table public.role_post_categories enable row level security;
alter table public.posts enable row level security;

insert into public.role_post_categories(role,category) values
('super_admin'::public.app_role,'general'),
('super_admin'::public.app_role,'food'),
('super_admin'::public.app_role,'fashion'),
('super_admin'::public.app_role,'electronics'),
('super_admin'::public.app_role,'home_living'),
('super_admin'::public.app_role,'beauty'),
('super_admin'::public.app_role,'kids'),
('super_admin'::public.app_role,'online_stores'),
('super_admin'::public.app_role,'cars'),
('super_admin'::public.app_role,'umrah'),
('super_admin'::public.app_role,'delivery'),
('admin'::public.app_role,'general'),
('admin'::public.app_role,'cars'),
('captain'::public.app_role,'delivery'),
('captain'::public.app_role,'cars'),
('restaurant_vendor'::public.app_role,'food'),
('restaurant_vendor'::public.app_role,'cars'),
('fashion_vendor'::public.app_role,'fashion'),
('fashion_vendor'::public.app_role,'cars'),
('car_dealer'::public.app_role,'cars'),
('umrah_agency'::public.app_role,'umrah'),
('umrah_agency'::public.app_role,'cars'),
('support'::public.app_role,'general'),
('support'::public.app_role,'cars'),
('customer'::public.app_role,'cars')
on conflict do nothing;

insert into public.permissions(code,description) values
('posts.create','Create marketplace posts'),
('posts.view','View active marketplace posts'),
('posts.update_own','Update own marketplace posts'),
('posts.delete_own','Delete own marketplace posts'),
('posts.manage','Manage all marketplace posts')
on conflict(code) do update set description=excluded.description;

insert into public.role_permissions(role,permission_code)
select v.role,v.permission_code
from (values
  ('super_admin'::public.app_role,'posts.create'),('super_admin'::public.app_role,'posts.view'),
  ('super_admin'::public.app_role,'posts.update_own'),('super_admin'::public.app_role,'posts.delete_own'),('super_admin'::public.app_role,'posts.manage'),
  ('admin'::public.app_role,'posts.create'),('admin'::public.app_role,'posts.view'),('admin'::public.app_role,'posts.update_own'),('admin'::public.app_role,'posts.delete_own'),
  ('captain'::public.app_role,'posts.create'),('captain'::public.app_role,'posts.view'),('captain'::public.app_role,'posts.update_own'),('captain'::public.app_role,'posts.delete_own'),
  ('restaurant_vendor'::public.app_role,'posts.create'),('restaurant_vendor'::public.app_role,'posts.view'),('restaurant_vendor'::public.app_role,'posts.update_own'),('restaurant_vendor'::public.app_role,'posts.delete_own'),
  ('fashion_vendor'::public.app_role,'posts.create'),('fashion_vendor'::public.app_role,'posts.view'),('fashion_vendor'::public.app_role,'posts.update_own'),('fashion_vendor'::public.app_role,'posts.delete_own'),
  ('car_dealer'::public.app_role,'posts.create'),('car_dealer'::public.app_role,'posts.view'),('car_dealer'::public.app_role,'posts.update_own'),('car_dealer'::public.app_role,'posts.delete_own'),
  ('umrah_agency'::public.app_role,'posts.create'),('umrah_agency'::public.app_role,'posts.view'),('umrah_agency'::public.app_role,'posts.update_own'),('umrah_agency'::public.app_role,'posts.delete_own'),
  ('support'::public.app_role,'posts.create'),('support'::public.app_role,'posts.view'),('support'::public.app_role,'posts.update_own'),('support'::public.app_role,'posts.delete_own'),
  ('customer'::public.app_role,'posts.create'),('customer'::public.app_role,'posts.view'),('customer'::public.app_role,'posts.update_own'),('customer'::public.app_role,'posts.delete_own')
) v(role,permission_code)
on conflict do nothing;

drop policy if exists role_post_categories_select on public.role_post_categories;
create policy role_post_categories_select on public.role_post_categories
for select to authenticated using (true);

drop policy if exists role_post_categories_manage on public.role_post_categories;
create policy role_post_categories_manage on public.role_post_categories
for all to authenticated
using ((select private.has_permission('posts.manage')))
with check ((select private.has_permission('posts.manage')));

drop policy if exists posts_select_active on public.posts;
create policy posts_select_active on public.posts
for select to authenticated
using (status='active' or author_id=(select auth.uid()) or (select private.has_permission('posts.manage')));

drop policy if exists posts_insert_scoped on public.posts;
create policy posts_insert_scoped on public.posts
for insert to authenticated
with check (
  author_id=(select auth.uid())
  and exists (
    select 1
    from public.user_roles ur
    join public.role_post_categories rpc on rpc.role=ur.role
    join public.role_permissions rp on rp.role=ur.role and rp.permission_code='posts.create'
    where ur.user_id=(select auth.uid())
      and rpc.category=posts.category
      and ur.role=posts.publisher_role
  )
);

drop policy if exists posts_update_scoped on public.posts;
create policy posts_update_scoped on public.posts
for update to authenticated
using (
  (author_id=(select auth.uid()) and (select private.has_permission('posts.update_own')))
  or (select private.has_permission('posts.manage'))
)
with check (
  (
    (author_id=(select auth.uid()) and (select private.has_permission('posts.update_own')))
    or (select private.has_permission('posts.manage'))
  )
  and (
    (author_id=(select auth.uid()) and exists (
      select 1
      from public.user_roles ur
      join public.role_post_categories rpc on rpc.role=ur.role
      where ur.user_id=(select auth.uid())
        and rpc.category=posts.category
        and ur.role=posts.publisher_role
    ))
    or (select private.has_permission('posts.manage'))
  )
);

drop policy if exists posts_delete_scoped on public.posts;
create policy posts_delete_scoped on public.posts
for delete to authenticated
using (
  (author_id=(select auth.uid()) and (select private.has_permission('posts.delete_own')))
  or (select private.has_permission('posts.manage'))
);

create or replace function public.get_allowed_post_targets()
returns table(publisher_role public.app_role, category public.post_category)
language sql stable security invoker
set search_path=pg_catalog,public
as $$
  select rpc.role,rpc.category
  from public.role_post_categories rpc
  join public.user_roles ur on ur.role=rpc.role
  join public.role_permissions rp on rp.role=ur.role and rp.permission_code='posts.create'
  where ur.user_id=(select auth.uid())
  order by rpc.role,rpc.category;
$$;

revoke all on function public.get_allowed_post_targets() from public,anon;
grant execute on function public.get_allowed_post_targets() to authenticated;
