-- Harden supermarket inventory writes without removing existing owner-scoped vendor access.
-- Generic management policies must not grant every products.manage vendor global inventory access.

drop policy if exists products_permission_manage on public.products;
create policy products_permission_manage on public.products
for all to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  and (select private.has_permission('products.manage'))
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  and (select private.has_permission('products.manage'))
);

drop policy if exists product_variants_permission_manage on public.product_variants;
create policy product_variants_permission_manage on public.product_variants
for all to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  and (select private.has_permission('products.manage'))
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  and (select private.has_permission('products.manage'))
);

drop policy if exists product_images_permission_manage on public.product_images;
create policy product_images_permission_manage on public.product_images
for all to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  and (select private.has_permission('products.manage'))
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  and (select private.has_permission('products.manage'))
);

-- Seller roles must not publish their own products or activate/suspend stores.
create or replace function private.prevent_vendor_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role public.app_role;
begin
  select ur.role into v_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid());

  if v_role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency','supermarket_vendor') then
    if tg_table_name = 'stores' and new.status is distinct from old.status then
      raise exception 'Vendors cannot change store status';
    end if;
    if tg_table_name = 'products' and new.status is distinct from old.status then
      raise exception 'Vendors cannot change product status';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.prevent_vendor_protected_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role public.app_role;
begin
  select ur.role into v_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid());

  if v_role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency','supermarket_vendor') then
    if tg_table_name = 'products' and new.store_id is distinct from old.store_id then
      raise exception 'Vendors cannot move products between stores';
    end if;
  end if;

  return new;
end;
$$;
