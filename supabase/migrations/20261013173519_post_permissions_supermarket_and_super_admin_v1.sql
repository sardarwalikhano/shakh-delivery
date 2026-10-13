-- Limit cross-user post moderation to super admins and complete the
-- supermarket vendor's role-specific post targets.
insert into public.role_post_categories(role, category)
values
  ('supermarket_vendor'::public.app_role, 'online_stores'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'cars'::public.post_category)
on conflict (role, category) do nothing;

insert into public.role_permissions(role, permission_code)
values
  ('supermarket_vendor'::public.app_role, 'posts.create'),
  ('supermarket_vendor'::public.app_role, 'posts.view'),
  ('supermarket_vendor'::public.app_role, 'posts.update_own'),
  ('supermarket_vendor'::public.app_role, 'posts.delete_own')
on conflict (role, permission_code) do nothing;

delete from public.role_permissions
where role = 'admin'::public.app_role
  and permission_code = 'posts.manage';
