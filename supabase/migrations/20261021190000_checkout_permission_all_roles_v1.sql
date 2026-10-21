-- All signed-in Shakh roles may place orders for categories that support checkout.
-- Category restrictions, inventory, delivery-zone checks, ownership checks,
-- wallet/commission checks, and payment-method validation remain enforced by the
-- existing database RPCs. Vehicles, Umrah, and home/living are still not enabled
-- for direct post checkout by the existing order RPC allowlists.

insert into public.permissions (code, description)
values ('checkout.create', 'Create orders for eligible marketplace items')
on conflict (code) do update
  set description = excluded.description;

insert into public.role_permissions (role, permission_code)
select app_role_value, 'checkout.create'
from unnest(enum_range(null::public.app_role)) as roles(app_role_value)
on conflict (role, permission_code) do nothing;
