-- Scope post creation and the management category filter to each role.
-- Supermarket vendors can publish market goods and cars; the super_admin mapping
-- already contains every supported category and is intentionally left unchanged.
begin;

insert into public.role_permissions (role, permission_code)
select 'supermarket_vendor'::public.app_role, p.code
from public.permissions p
where p.code in ('posts.create', 'posts.view', 'posts.update_own', 'posts.delete_own')
on conflict (role, permission_code) do nothing;

insert into public.role_post_categories (role, category)
values
  ('supermarket_vendor'::public.app_role, 'general'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'food'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'electronics'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'home_living'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'beauty'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'kids'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'online_stores'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'cars'::public.post_category)
on conflict (role, category) do nothing;

commit;
