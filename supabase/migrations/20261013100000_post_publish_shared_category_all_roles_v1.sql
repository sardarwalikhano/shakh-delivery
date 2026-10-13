-- SHAKH: widen role-based post publishing without changing existing category flows.
-- Additive migration. Does not delete/alter existing posts or category mappings.
-- All currently supported business roles can publish to the shared/general marketplace.
-- Existing role-specific categories and the Cars category remain unchanged.

insert into public.role_post_categories(role, category)
select roles.role::public.app_role, 'general'::public.post_category
from (values
  ('super_admin'),
  ('admin'),
  ('customer'),
  ('captain'),
  ('restaurant_vendor'),
  ('fashion_vendor'),
  ('car_dealer'),
  ('umrah_agency'),
  ('support')
) as roles(role)
on conflict (role, category) do nothing;

-- Keep publishing permission explicit for every supported role.
insert into public.role_permissions(role, permission_code)
select roles.role::public.app_role, 'posts.create'
from (values
  ('super_admin'),
  ('admin'),
  ('customer'),
  ('captain'),
  ('restaurant_vendor'),
  ('fashion_vendor'),
  ('car_dealer'),
  ('umrah_agency'),
  ('support')
) as roles(role)
on conflict (role, permission_code) do nothing;

-- Role target RPC remains the source for the form; this grants only authenticated
-- users the ability to read their own available targets. PostgreSQL RLS is still
-- the enforcement boundary for post insertion and updates.
revoke all on function public.get_allowed_post_targets() from public, anon;
grant execute on function public.get_allowed_post_targets() to authenticated;

-- Existing post policies intentionally remain intact; this assertion makes the
-- migration fail visibly if the prerequisite objects are missing.
do $$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.role_post_categories') is null
     or to_regclass('public.role_permissions') is null
     or to_regclass('public.user_roles') is null then
    raise exception 'Post publishing prerequisite tables are missing; migration stopped safely';
  end if;
end
$$;
