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

  if v_role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency') then
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

revoke all on function private.prevent_vendor_status_change() from public, anon, authenticated;

drop trigger if exists prevent_vendor_store_status_change on public.stores;
create trigger prevent_vendor_store_status_change
before update on public.stores
for each row execute function private.prevent_vendor_status_change();

drop trigger if exists prevent_vendor_product_status_change on public.products;
create trigger prevent_vendor_product_status_change
before update on public.products
for each row execute function private.prevent_vendor_status_change();

drop policy if exists "stores_vendor_owner_update" on public.stores;
create policy "stores_vendor_owner_update"
on public.stores for update
to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency')
  )
)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency')
  )
);

drop policy if exists "products_vendor_owner_update" on public.products;
create policy "products_vendor_owner_update"
on public.products for update
to authenticated
using (
  exists (
    select 1
    from public.stores s
    join public.user_roles ur on ur.user_id = s.owner_id
    where s.id = store_id
      and s.owner_id = (select auth.uid())
      and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency')
  )
)
with check (
  exists (
    select 1
    from public.stores s
    join public.user_roles ur on ur.user_id = s.owner_id
    where s.id = store_id
      and s.owner_id = (select auth.uid())
      and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency')
  )
);

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

  if v_role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency') then
    if tg_table_name = 'products' and new.store_id is distinct from old.store_id then
      raise exception 'Vendors cannot move products between stores';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_vendor_protected_fields() from public, anon, authenticated;

drop trigger if exists prevent_vendor_product_protected_fields on public.products;
create trigger prevent_vendor_product_protected_fields
before update on public.products
for each row execute function private.prevent_vendor_protected_fields();
