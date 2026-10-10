-- Allow the admin role to moderate/manage apparel posts and their related orders.
-- Preserve all existing role grants; add this single permission idempotently.
insert into public.role_permissions (role, permission_code)
select 'admin', 'posts.manage'
where not exists (
  select 1 from public.role_permissions
  where role::text = 'admin' and permission_code = 'posts.manage'
);
