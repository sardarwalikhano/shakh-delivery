-- Allow every defined application role to request prepaid wallet top-ups.
-- Keep wallet management/review restricted to the existing authorized finance roles.
-- No balance is credited by this migration; credits still require Super Admin review.

begin;

insert into public.permissions(code, description)
values ('wallets.view_own', 'View own prepaid wallet and request prepaid top-ups')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role, permission_code)
select r, 'wallets.view_own'
from unnest(enum_range(null::public.app_role)) as roles(r)
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
