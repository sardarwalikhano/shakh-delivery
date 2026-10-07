create or replace function private.cart_item_set_authoritative_price()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_product_price numeric(14,2);
  v_variant_price numeric(14,2);
  v_stock integer;
  v_product_status public.product_status;
  v_variant_active boolean;
begin
  select p.base_price_iqd, p.stock_quantity, p.status into v_product_price, v_stock, v_product_status
  from public.products p where p.id = new.product_id;

  if v_product_status is null or v_product_status <> 'active' then raise exception 'Product is not available'; end if;

  if new.variant_id is not null then
    select pv.price_iqd, pv.stock_quantity, pv.is_active into v_variant_price, v_stock, v_variant_active
    from public.product_variants pv where pv.id = new.variant_id and pv.product_id = new.product_id;
    if not found or v_variant_active is not true then raise exception 'Product variant is not available'; end if;
    if new.quantity > v_stock then raise exception 'Requested quantity exceeds available stock'; end if;
    new.added_price_iqd := coalesce(v_variant_price, v_product_price);
  else
    if new.quantity > v_stock then raise exception 'Requested quantity exceeds available stock'; end if;
    new.added_price_iqd := v_product_price;
  end if;
  return new;
end;
$$;

revoke all on function private.cart_item_set_authoritative_price() from public, anon, authenticated;
drop trigger if exists cart_item_authoritative_price on public.cart_items;
create trigger cart_item_authoritative_price before insert or update of product_id, variant_id, quantity on public.cart_items for each row execute function private.cart_item_set_authoritative_price();

drop policy if exists "stores_owner_read_write" on public.stores;
create policy "stores_vendor_owner_manage" on public.stores for all to authenticated using ((select auth.uid()) = owner_id and exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency'))) with check ((select auth.uid()) = owner_id and status = 'pending' and exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency')));

drop policy if exists "products_owner_read_write" on public.products;
create policy "products_vendor_owner_manage" on public.products for all to authenticated using (exists (select 1 from public.stores s join public.user_roles ur on ur.user_id = s.owner_id where s.id = store_id and s.owner_id = (select auth.uid()) and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency'))) with check (exists (select 1 from public.stores s join public.user_roles ur on ur.user_id = s.owner_id where s.id = store_id and s.owner_id = (select auth.uid()) and ur.role in ('restaurant_vendor','fashion_vendor','car_dealer','umrah_agency')) and status = 'draft');
