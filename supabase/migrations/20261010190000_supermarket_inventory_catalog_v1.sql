-- Supermarket catalog metadata, generic stock variants, and purchase-time safety.
-- Additive only: existing products and variants retain their IDs and values.
alter table public.products
  add column if not exists supermarket_type text,
  add column if not exists quantity_value numeric(12,3),
  add column if not exists quantity_unit text,
  add column if not exists package_count integer,
  add column if not exists barcode text,
  add column if not exists manufacturing_date date,
  add column if not exists expiry_date date,
  add column if not exists storage_instructions text,
  add column if not exists ingredients text,
  add column if not exists allergen_warnings text,
  add column if not exists flavor text;

alter table public.product_variants
  add column if not exists quantity_value numeric(12,3),
  add column if not exists quantity_unit text,
  add column if not exists package_count integer,
  add column if not exists flavor text,
  add column if not exists barcode text,
  add column if not exists manufacturing_date date,
  add column if not exists expiry_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_supermarket_type_valid') then
    alter table public.products add constraint products_supermarket_type_valid
      check (supermarket_type is null or supermarket_type in ('food','beverage','cleaning','daily_essentials','fresh_food','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_quantity_value_positive') then
    alter table public.products add constraint products_quantity_value_positive
      check (quantity_value is null or quantity_value > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_quantity_unit_valid') then
    alter table public.products add constraint products_quantity_unit_valid
      check (quantity_unit is null or quantity_unit in ('g','kg','ml','l','pack','piece','carton'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_package_count_positive') then
    alter table public.products add constraint products_package_count_positive
      check (package_count is null or package_count > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_date_range_valid') then
    alter table public.products add constraint products_date_range_valid
      check (manufacturing_date is null or expiry_date is null or expiry_date >= manufacturing_date);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_variants_quantity_value_positive') then
    alter table public.product_variants add constraint product_variants_quantity_value_positive
      check (quantity_value is null or quantity_value > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_variants_quantity_unit_valid') then
    alter table public.product_variants add constraint product_variants_quantity_unit_valid
      check (quantity_unit is null or quantity_unit in ('g','kg','ml','l','pack','piece','carton'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_variants_package_count_positive') then
    alter table public.product_variants add constraint product_variants_package_count_positive
      check (package_count is null or package_count > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_variants_date_range_valid') then
    alter table public.product_variants add constraint product_variants_date_range_valid
      check (manufacturing_date is null or expiry_date is null or expiry_date >= manufacturing_date);
  end if;
end
$$;

create index if not exists products_barcode_idx on public.products(barcode) where barcode is not null;
create index if not exists products_expiry_date_idx on public.products(expiry_date) where expiry_date is not null;
create index if not exists product_variants_barcode_idx on public.product_variants(barcode) where barcode is not null;
create index if not exists product_variants_expiry_date_idx on public.product_variants(expiry_date) where expiry_date is not null;

-- Top-level supermarket category plus real subcategories used by the same catalog.
insert into public.categories (name_ku, name_ar, name_en, slug, icon_key, sort_order, is_active)
values ('سوپەرمارکێت', 'السوبرماركت', 'Supermarket', 'supermarket', 'shopping-basket', 15, true)
on conflict (slug) do update set
  name_ku = excluded.name_ku,
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.categories (parent_id, name_ku, name_ar, name_en, slug, icon_key, sort_order, is_active)
select root.id, child.name_ku, child.name_ar, child.name_en, child.slug, child.icon_key, child.sort_order, true
from public.categories root
cross join (values
  ('خواردەمەنییەکان', 'الأغذية', 'Food', 'supermarket-food', 'utensils', 10),
  ('خواردنەوەکان', 'المشروبات', 'Beverages', 'supermarket-drinks', 'cup-soda', 20),
  ('پاککەرەوەکان', 'مواد التنظيف', 'Cleaning supplies', 'supermarket-cleaning', 'spray-can', 30),
  ('کاڵای ڕۆژانە', 'مستلزمات يومية', 'Daily essentials', 'supermarket-daily', 'shopping-bag', 40),
  ('خواردنی تازە', 'الأطعمة الطازجة', 'Fresh food', 'supermarket-fresh', 'carrot', 50)
) as child(name_ku, name_ar, name_en, slug, icon_key, sort_order)
where root.slug = 'supermarket'
on conflict (slug) do update set
  parent_id = excluded.parent_id,
  name_ku = excluded.name_ku,
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  is_active = true;

-- Products may be managed by their owning approved seller or a role with explicit permission.
drop policy if exists products_permission_manage on public.products;
create policy products_permission_manage on public.products
for all to authenticated
using ((select private.has_permission('products.manage')))
with check ((select private.has_permission('products.manage')));

drop policy if exists product_variants_permission_manage on public.product_variants;
create policy product_variants_permission_manage on public.product_variants
for all to authenticated
using ((select private.has_permission('products.manage')))
with check ((select private.has_permission('products.manage')));

drop policy if exists product_images_permission_manage on public.product_images;
create policy product_images_permission_manage on public.product_images
for all to authenticated
using ((select private.has_permission('products.manage')))
with check ((select private.has_permission('products.manage')));

drop policy if exists stores_permission_manage on public.stores;
create policy stores_permission_manage on public.stores
for all to authenticated
using ((select private.has_permission('vendors.manage')))
with check ((select private.has_permission('vendors.manage')));

-- Keep aggregate product stock aligned when a SKU/variant inventory row changes.
create or replace function private.sync_product_stock_from_variants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_product_id uuid;
begin
  if tg_op = 'DELETE' then
    v_product_id := old.product_id;
  else
    v_product_id := new.product_id;
  end if;

  if exists (
    select 1 from public.product_variants pv
    where pv.product_id = v_product_id and pv.is_active = true
  ) then
    update public.products p
      set stock_quantity = (
        select coalesce(sum(pv.stock_quantity), 0)::integer
        from public.product_variants pv
        where pv.product_id = v_product_id and pv.is_active = true
      )
    where p.id = v_product_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.sync_product_stock_from_variants() from public, anon, authenticated;
drop trigger if exists product_variants_sync_product_stock on public.product_variants;
create trigger product_variants_sync_product_stock
after insert or delete or update of stock_quantity, is_active on public.product_variants
for each row execute function private.sync_product_stock_from_variants();

-- Always use current database price and stock for cart writes, including variant expiry.
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
  v_product_expiry date;
  v_variant_expiry date;
begin
  select p.base_price_iqd, p.stock_quantity, p.status, p.expiry_date
    into v_product_price, v_stock, v_product_status, v_product_expiry
  from public.products p
  where p.id = new.product_id;

  if v_product_status is null or v_product_status <> 'active' then
    raise exception 'Product is not available';
  end if;

  if v_product_expiry is not null and v_product_expiry < current_date then
    raise exception 'Product is expired';
  end if;

  if new.variant_id is not null then
    select pv.price_iqd, pv.stock_quantity, pv.is_active, pv.expiry_date
      into v_variant_price, v_stock, v_variant_active, v_variant_expiry
    from public.product_variants pv
    where pv.id = new.variant_id and pv.product_id = new.product_id;

    if not found or v_variant_active is not true then
      raise exception 'Product variant is not available';
    end if;

    if v_variant_expiry is not null and v_variant_expiry < current_date then
      raise exception 'Product variant is expired';
    end if;
    if new.quantity > v_stock then
      raise exception 'Requested quantity exceeds available stock';
    end if;

    new.added_price_iqd := coalesce(v_variant_price, v_product_price);
  else
    if new.quantity > v_stock then
      raise exception 'Requested quantity exceeds available stock';
    end if;
    new.added_price_iqd := v_product_price;
  end if;

  return new;
end;
$$;

revoke all on function private.cart_item_set_authoritative_price() from public, anon, authenticated;
drop trigger if exists cart_item_authoritative_price on public.cart_items;
create trigger cart_item_authoritative_price
before insert or update of product_id, variant_id, quantity on public.cart_items
for each row execute function private.cart_item_set_authoritative_price();
