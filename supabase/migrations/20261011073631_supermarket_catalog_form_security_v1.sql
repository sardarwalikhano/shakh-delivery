-- Add category-specific supermarket metadata and owner-only RLS for the approved role.
alter table public.products add column if not exists cleaning_type text;

comment on column public.products.cleaning_type is
  'Category-specific product type for supermarket cleaning supplies; null for unrelated product categories.';

insert into public.permissions(code, description)
values ('supermarket.catalog.manage', 'Create and maintain supermarket products owned by the approved supermarket vendor')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role, permission_code)
values ('supermarket_vendor'::public.app_role, 'supermarket.catalog.manage')
on conflict do nothing;

-- The supermarket role can manage only its own stores. Existing admin policies stay in place.
drop policy if exists stores_supermarket_vendor_owner_select on public.stores;
create policy stores_supermarket_vendor_owner_select on public.stores
for select to authenticated
using (
  owner_id = (select auth.uid())
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

drop policy if exists stores_supermarket_vendor_owner_insert on public.stores;
create policy stores_supermarket_vendor_owner_insert on public.stores
for insert to authenticated
with check (
  owner_id = (select auth.uid()) and status = 'pending'::public.store_status
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

drop policy if exists stores_supermarket_vendor_owner_update on public.stores;
create policy stores_supermarket_vendor_owner_update on public.stores
for update to authenticated
using (
  owner_id = (select auth.uid())
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
)
with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

drop policy if exists stores_supermarket_vendor_owner_delete on public.stores;
create policy stores_supermarket_vendor_owner_delete on public.stores
for delete to authenticated
using (
  owner_id = (select auth.uid()) and status = 'pending'::public.store_status
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

drop policy if exists products_supermarket_vendor_owner_select on public.products;
create policy products_supermarket_vendor_owner_select on public.products
for select to authenticated
using (
  exists (select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

drop policy if exists products_supermarket_vendor_owner_insert on public.products;
create policy products_supermarket_vendor_owner_insert on public.products
for insert to authenticated
with check (
  status = 'draft'::public.product_status
  and exists (select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

drop policy if exists products_supermarket_vendor_owner_update on public.products;
create policy products_supermarket_vendor_owner_update on public.products
for update to authenticated
using (
  exists (select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
)
with check (
  exists (select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

drop policy if exists products_supermarket_vendor_owner_delete on public.products;
create policy products_supermarket_vendor_owner_delete on public.products
for delete to authenticated
using (
  status = 'draft'::public.product_status
  and exists (select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'supermarket_vendor'::public.app_role)
);

-- Subscribe clients to catalog changes so listing and inventory views refresh immediately.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['products','product_variants','product_images','stores','categories'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;
