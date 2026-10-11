-- Unlock the existing vendor product/store pages for the approved supermarket vendor role.
-- RLS remains owner-scoped; broad admin policies still check admin/super_admin role membership.
insert into public.role_permissions(role, permission_code)
select 'supermarket_vendor'::public.app_role, p.code
from public.permissions p
where p.code in ('products.manage','vendors.view','supermarket.catalog.manage')
on conflict do nothing;
