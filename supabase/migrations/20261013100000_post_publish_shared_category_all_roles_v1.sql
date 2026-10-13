-- SHAKH: widen role-based post publishing without changing existing category flows.
-- Additive migration. Does not delete/alter existing posts or category mappings.
-- All currently supported roles can publish to the shared/general marketplace.
-- Existing role-specific categories and the Cars category remain unchanged.

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

revoke all on function public.get_allowed_post_targets() from public, anon;
grant execute on function public.get_allowed_post_targets() to authenticated;
