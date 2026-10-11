-- Add restaurant menu metadata and paid/required option groups while preserving
-- the existing product, cart, checkout, order, notification and delivery tables.
create table public.restaurant_menu_details (
  product_id uuid primary key references public.products(id) on delete cascade,
  menu_category text not null default 'main_course'
    check (menu_category in ('main_course','appetizer','dessert','beverage','salad','kids','combo','other')),
  ingredients text,
  allergen_warnings text,
  dietary_tags text[] not null default '{}',
  spice_level smallint not null default 0 check (spice_level between 0 and 3),
  prep_time_minutes integer not null default 15 check (prep_time_minutes between 0 and 1440),
  is_available boolean not null default true,
  available_from time,
  available_until time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_availability_window_pair check ((available_from is null) = (available_until is null)),
  constraint restaurant_menu_dietary_tags_valid check (
    dietary_tags <@ array['vegetarian','vegan','contains_meat','spicy','gluten_free','dairy_free','halal']::text[]
  )
);

create table public.restaurant_menu_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name_ku text not null,
  name_ar text not null default '',
  name_en text not null default '',
  is_required boolean not null default false,
  min_select integer not null default 0 check (min_select between 0 and 20),
  max_select integer not null default 1 check (max_select between 1 and 20),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_option_group_name_nonempty check (btrim(name_ku) <> ''),
  constraint restaurant_menu_option_group_range_valid check (min_select <= max_select),
  constraint restaurant_menu_required_group_min check (not is_required or min_select >= 1)
);
create index restaurant_menu_option_groups_product_idx on public.restaurant_menu_option_groups(product_id, sort_order);

create table public.restaurant_menu_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.restaurant_menu_option_groups(id) on delete cascade,
  name_ku text not null,
  name_ar text not null default '',
  name_en text not null default '',
  price_iqd numeric(14,2) not null default 0 check (price_iqd >= 0),
  is_available boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_option_name_nonempty check (btrim(name_ku) <> '')
);
create index restaurant_menu_options_group_idx on public.restaurant_menu_options(group_id, sort_order);

-- Existing cart and order line contracts remain intact; selections are an additive
-- column and historical selections are snapshotted on order_items.
alter table public.cart_items
  add column selected_option_ids uuid[] not null default '{}'::uuid[];
alter table public.order_items
  add column selected_options jsonb not null default '[]'::jsonb;
alter table public.order_items
  add constraint order_items_selected_options_array check (jsonb_typeof(selected_options) = 'array');

-- Let two lines for one meal differ when their option selections differ.
-- Existing lines default to the empty selection and remain unique under the new indexes.
drop index if exists public.cart_items_cart_product_unique;
drop index if exists public.cart_items_cart_product_variant_unique;
create unique index cart_items_cart_product_options_unique
  on public.cart_items(cart_id, product_id, selected_option_ids)
  where variant_id is null;
create unique index cart_items_cart_product_variant_options_unique
  on public.cart_items(cart_id, product_id, variant_id, selected_option_ids)
  where variant_id is not null;

alter table public.restaurant_menu_details enable row level security;
alter table public.restaurant_menu_option_groups enable row level security;
alter table public.restaurant_menu_options enable row level security;

grant select on public.restaurant_menu_details, public.restaurant_menu_option_groups, public.restaurant_menu_options to anon, authenticated;
grant insert, update, delete on public.restaurant_menu_details, public.restaurant_menu_option_groups, public.restaurant_menu_options to authenticated;
grant update (selected_option_ids) on public.cart_items to authenticated;

create policy restaurant_menu_details_public_or_owner_select
on public.restaurant_menu_details for select to anon, authenticated
using (
  exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=restaurant_menu_details.product_id and p.status='active' and s.status='active'
  )
  or exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=restaurant_menu_details.product_id and s.owner_id=(select auth.uid())
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
);

create policy restaurant_menu_details_manage
on public.restaurant_menu_details for all to authenticated
using (
  exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    join public.user_roles ur on ur.user_id=(select auth.uid())
    where p.id=restaurant_menu_details.product_id and s.owner_id=(select auth.uid())
      and ur.role='restaurant_vendor'::public.app_role
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
)
with check (
  exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    join public.user_roles ur on ur.user_id=(select auth.uid())
    where p.id=restaurant_menu_details.product_id and s.owner_id=(select auth.uid())
      and ur.role='restaurant_vendor'::public.app_role
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
);

create policy restaurant_menu_option_groups_public_or_owner_select
on public.restaurant_menu_option_groups for select to anon, authenticated
using (
  is_active and exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=restaurant_menu_option_groups.product_id and p.status='active' and s.status='active'
  )
  or exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=restaurant_menu_option_groups.product_id and s.owner_id=(select auth.uid())
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
);
create policy restaurant_menu_option_groups_manage
on public.restaurant_menu_option_groups for all to authenticated
using (
  exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    join public.user_roles ur on ur.user_id=(select auth.uid())
    where p.id=restaurant_menu_option_groups.product_id and s.owner_id=(select auth.uid())
      and ur.role='restaurant_vendor'::public.app_role
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
)
with check (
  exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    join public.user_roles ur on ur.user_id=(select auth.uid())
    where p.id=restaurant_menu_option_groups.product_id and s.owner_id=(select auth.uid())
      and ur.role='restaurant_vendor'::public.app_role
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
);

create policy restaurant_menu_options_public_or_owner_select
on public.restaurant_menu_options for select to anon, authenticated
using (
  (is_active and is_available and exists (
    select 1 from public.restaurant_menu_option_groups g
    join public.products p on p.id=g.product_id join public.stores s on s.id=p.store_id
    where g.id=restaurant_menu_options.group_id and g.is_active and p.status='active' and s.status='active'
  ))
  or exists (
    select 1 from public.restaurant_menu_option_groups g
    join public.products p on p.id=g.product_id join public.stores s on s.id=p.store_id
    where g.id=restaurant_menu_options.group_id and s.owner_id=(select auth.uid())
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
);
create policy restaurant_menu_options_manage
on public.restaurant_menu_options for all to authenticated
using (
  exists (
    select 1 from public.restaurant_menu_option_groups g
    join public.products p on p.id=g.product_id join public.stores s on s.id=p.store_id
    join public.user_roles ur on ur.user_id=(select auth.uid())
    where g.id=restaurant_menu_options.group_id and s.owner_id=(select auth.uid())
      and ur.role='restaurant_vendor'::public.app_role
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
)
with check (
  exists (
    select 1 from public.restaurant_menu_option_groups g
    join public.products p on p.id=g.product_id join public.stores s on s.id=p.store_id
    join public.user_roles ur on ur.user_id=(select auth.uid())
    where g.id=restaurant_menu_options.group_id and s.owner_id=(select auth.uid())
      and ur.role='restaurant_vendor'::public.app_role
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role in ('admin'::public.app_role,'super_admin'::public.app_role)
      and (select private.has_permission('products.manage'))
  )
);

create trigger restaurant_menu_details_set_updated_at before update on public.restaurant_menu_details
for each row execute function public.set_updated_at();
create trigger restaurant_menu_option_groups_set_updated_at before update on public.restaurant_menu_option_groups
for each row execute function public.set_updated_at();
create trigger restaurant_menu_options_set_updated_at before update on public.restaurant_menu_options
for each row execute function public.set_updated_at();

-- This validator is shared by cart writes and checkout. It never accepts client-supplied
-- option prices; all prices come from current menu option rows.
create or replace function private.restaurant_option_total(p_product_id uuid, p_option_ids uuid[])
returns numeric(14,2)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_group record;
  v_count integer;
  v_option_total numeric(14,2) := 0;
  v_selected_count integer;
begin
  p_option_ids := coalesce(p_option_ids, '{}'::uuid[]);
  if cardinality(p_option_ids) > 40 then raise exception 'Too many restaurant menu options selected'; end if;
  if cardinality(p_option_ids) <> (select count(distinct x) from unnest(p_option_ids) x) then
    raise exception 'Duplicate restaurant menu options are not allowed';
  end if;

  if not exists (select 1 from public.restaurant_menu_details d where d.product_id=p_product_id) then
    if cardinality(p_option_ids) > 0 then raise exception 'Options are only valid for restaurant menu items'; end if;
    return 0;
  end if;

  select count(*) into v_count
  from public.restaurant_menu_options o
  join public.restaurant_menu_option_groups g on g.id=o.group_id
  where o.id = any(p_option_ids) and o.is_active and o.is_available and g.is_active and g.product_id=p_product_id;
  if v_count <> cardinality(p_option_ids) then raise exception 'One or more selected restaurant options are no longer available'; end if;

  for v_group in
    select g.id,g.min_select,g.max_select,g.name_ku
    from public.restaurant_menu_option_groups g
    where g.product_id=p_product_id and g.is_active
  loop
    select count(*) into v_selected_count
    from public.restaurant_menu_options o
    where o.group_id=v_group.id and o.id=any(p_option_ids) and o.is_active and o.is_available;
    if v_selected_count < v_group.min_select then
      raise exception 'Please choose the required options for group: %',v_group.name_ku;
    end if;
    if v_selected_count > v_group.max_select then
      raise exception 'Too many options selected for group: %',v_group.name_ku;
    end if;
  end loop;

  select coalesce(sum(o.price_iqd),0)::numeric(14,2) into v_option_total
  from public.restaurant_menu_options o where o.id=any(p_option_ids) and o.is_active and o.is_available;
  return v_option_total;
end;
$$;
revoke all on function private.restaurant_option_total(uuid,uuid[]) from public, anon, authenticated;

create or replace function private.cart_item_set_authoritative_price()
returns trigger
language plpgsql
security definer
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
  v_restaurant boolean;
  v_menu_available boolean;
  v_available_from time;
  v_available_until time;
  v_local_time time := (now() at time zone 'Asia/Baghdad')::time;
  v_option_total numeric(14,2) := 0;
begin
  select p.base_price_iqd,p.stock_quantity,p.status,p.expiry_date
    into v_product_price,v_stock,v_product_status,v_product_expiry
  from public.products p where p.id=new.product_id;
  if v_product_status is null or v_product_status <> 'active' then raise exception 'Product is not available'; end if;
  if v_product_expiry is not null and v_product_expiry < current_date then raise exception 'Product is expired'; end if;
  v_restaurant := exists(select 1 from public.restaurant_menu_details d where d.product_id=new.product_id);

  if v_restaurant then
    select d.is_available,d.available_from,d.available_until
      into v_menu_available,v_available_from,v_available_until
    from public.restaurant_menu_details d where d.product_id=new.product_id;
    if not v_menu_available then raise exception 'Restaurant menu item is unavailable'; end if;
    if v_available_from is not null and v_available_until is not null then
      if v_available_from <= v_available_until and (v_local_time < v_available_from or v_local_time >= v_available_until) then
        raise exception 'Restaurant menu item is outside its availability hours';
      elsif v_available_from > v_available_until and (v_local_time < v_available_from and v_local_time >= v_available_until) then
        raise exception 'Restaurant menu item is outside its availability hours';
      end if;
    end if;
    v_option_total := private.restaurant_option_total(new.product_id,new.selected_option_ids);
    if new.variant_id is not null then
      select pv.price_iqd,pv.is_active into v_variant_price,v_variant_active
      from public.product_variants pv where pv.id=new.variant_id and pv.product_id=new.product_id;
      if not found or not v_variant_active then raise exception 'Restaurant meal size is not available'; end if;
      new.added_price_iqd := coalesce(v_variant_price,v_product_price) + v_option_total;
    else
      new.added_price_iqd := v_product_price + v_option_total;
    end if;
    return new;
  end if;

  if cardinality(coalesce(new.selected_option_ids,'{}'::uuid[])) > 0 then
    raise exception 'This product does not support restaurant options';
  end if;
  if new.variant_id is not null then
    select pv.price_iqd,pv.stock_quantity,pv.is_active,pv.expiry_date
      into v_variant_price,v_stock,v_variant_active,v_variant_expiry
    from public.product_variants pv where pv.id=new.variant_id and pv.product_id=new.product_id;
    if not found or v_variant_active is not true then raise exception 'Product variant is not available'; end if;
    if v_variant_expiry is not null and v_variant_expiry < current_date then raise exception 'Product variant is expired'; end if;
    if new.quantity > v_stock then raise exception 'Requested quantity exceeds available stock'; end if;
    new.added_price_iqd:=coalesce(v_variant_price,v_product_price);
  else
    if new.quantity > v_stock then raise exception 'Requested quantity exceeds available stock'; end if;
    new.added_price_iqd:=v_product_price;
  end if;
  return new;
end;
$$;

drop trigger if exists cart_item_authoritative_price on public.cart_items;
create trigger cart_item_authoritative_price
before insert or update of product_id,variant_id,quantity,selected_option_ids
on public.cart_items for each row execute function private.cart_item_set_authoritative_price();

-- Extend the established checkout function rather than routing restaurant orders
-- through a parallel order/delivery system.
create or replace function private.create_checkout_internal(
  p_customer_id uuid,
  p_idempotency_key text,
  p_delivery_address text,
  p_delivery_lat numeric,
  p_delivery_lng numeric,
  p_customer_note text,
  p_payment_method public.payment_method
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_existing public.checkout_sessions%rowtype;
  v_cart_id uuid;
  v_checkout_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_item record;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_store_id uuid;
  v_store_subtotal numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_delivery_fee numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_price numeric(14,2);
  v_option_total numeric(14,2);
  v_selected_options jsonb;
  v_is_restaurant boolean;
  v_menu_available boolean;
  v_available_from time;
  v_available_until time;
  v_local_time time := (now() at time zone 'Asia/Baghdad')::time;
  v_order_count integer := 0;
  v_order_ids jsonb := '[]'::jsonb;
begin
  if p_customer_id is null then raise exception 'Not authenticated'; end if;
  if (select p.phone from public.profiles p where p.id=p_customer_id) is null
     or length(regexp_replace((select p.phone from public.profiles p where p.id=p_customer_id), '[^0-9+]', '', 'g')) < 8 then
    raise exception 'Mobile number is required before placing an order';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(btrim(p_idempotency_key)) > 128 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_delivery_address is null or length(btrim(p_delivery_address)) < 5 then raise exception 'Delivery address is required'; end if;
  if p_payment_method not in ('cash_on_delivery','mobile_cash') then raise exception 'Unsupported payment method'; end if;

  select * into v_existing from public.checkout_sessions
  where customer_id=p_customer_id and idempotency_key=p_idempotency_key limit 1;
  if found then
    return jsonb_build_object('checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,'total_iqd',v_existing.total_iqd);
  end if;
  select c.id into v_cart_id from public.carts c where c.user_id=p_customer_id limit 1;
  if v_cart_id is null or not exists(select 1 from public.cart_items ci where ci.cart_id=v_cart_id) then raise exception 'Cart is empty'; end if;

  insert into public.checkout_sessions(customer_id,idempotency_key,payment_method,delivery_address,delivery_lat,delivery_lng,customer_note)
  values(p_customer_id,p_idempotency_key,p_payment_method,btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),'' ))
  returning id into v_checkout_id;

  for v_item in
    select ci.id,ci.product_id,ci.variant_id,ci.quantity,ci.selected_option_ids
    from public.cart_items ci where ci.cart_id=v_cart_id order by ci.id for update
  loop
    select * into v_product from public.products p where p.id=v_item.product_id for update;
    if not found or v_product.status<>'active' then raise exception 'Product is not available'; end if;
    if not exists(select 1 from public.stores s where s.id=v_product.store_id and s.status='active') then raise exception 'Store is not available'; end if;

    v_is_restaurant := exists(select 1 from public.restaurant_menu_details d where d.product_id=v_product.id);
    if v_is_restaurant then
      select d.is_available,d.available_from,d.available_until into v_menu_available,v_available_from,v_available_until
      from public.restaurant_menu_details d where d.product_id=v_product.id;
      if not v_menu_available then raise exception 'Restaurant menu item is unavailable'; end if;
      if v_available_from is not null and v_available_until is not null then
        if v_available_from <= v_available_until and (v_local_time < v_available_from or v_local_time >= v_available_until) then
          raise exception 'Restaurant menu item is outside its availability hours';
        elsif v_available_from > v_available_until and (v_local_time < v_available_from and v_local_time >= v_available_until) then
          raise exception 'Restaurant menu item is outside its availability hours';
        end if;
      end if;
    end if;

    if v_item.variant_id is not null then
      select * into v_variant from public.product_variants pv where pv.id=v_item.variant_id and pv.product_id=v_item.product_id for update;
      if not found or v_variant.is_active is not true then raise exception 'Product variant is not available'; end if;
      if not v_is_restaurant and v_item.quantity>v_variant.stock_quantity then raise exception 'Insufficient variant stock'; end if;
      v_price:=coalesce(v_variant.price_iqd,v_product.base_price_iqd);
    else
      if not v_is_restaurant and v_item.quantity>v_product.stock_quantity then raise exception 'Insufficient product stock'; end if;
      v_price:=v_product.base_price_iqd;
    end if;

    if v_is_restaurant then
      v_option_total := private.restaurant_option_total(v_product.id,v_item.selected_option_ids);
      v_price := v_price + v_option_total;
    elsif cardinality(coalesce(v_item.selected_option_ids,'{}'::uuid[])) > 0 then
      raise exception 'This product does not support restaurant options';
    end if;

    if v_store_id is null then
      v_store_id:=v_product.store_id; v_store_subtotal:=v_price*v_item.quantity;
    elsif v_product.store_id=v_store_id then
      v_store_subtotal:=v_store_subtotal+(v_price*v_item.quantity);
    else
      v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
      insert into public.orders(checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,total_iqd,currency,delivery_address,delivery_lat,delivery_lng,customer_note)
      values(v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,0,v_store_subtotal,'IQD',btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),'' ))
      returning id into v_order_id;
      insert into public.deliveries(order_id,status) values(v_order_id,'pending');
      v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number,'store_id',v_store_id));
      v_order_count:=v_order_count+1;
      v_store_id:=v_product.store_id; v_store_subtotal:=v_price*v_item.quantity;
    end if;
    v_subtotal:=v_subtotal+(v_price*v_item.quantity);
  end loop;

  if v_store_id is not null then
    v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
    insert into public.orders(checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,total_iqd,currency,delivery_address,delivery_lat,delivery_lng,customer_note)
    values(v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,0,v_store_subtotal,'IQD',btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),'' ))
    returning id into v_order_id;
    insert into public.deliveries(order_id,status) values(v_order_id,'pending');
    v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number,'store_id',v_store_id));
    v_order_count:=v_order_count+1;
  end if;

  for v_item in
    select ci.id,ci.product_id,ci.variant_id,ci.quantity,ci.selected_option_ids
    from public.cart_items ci where ci.cart_id=v_cart_id order by ci.id
  loop
    select p.* into v_product from public.products p where p.id=v_item.product_id for update;
    v_is_restaurant := exists(select 1 from public.restaurant_menu_details d where d.product_id=v_product.id);

    if v_item.variant_id is not null then
      select pv.* into v_variant from public.product_variants pv where pv.id=v_item.variant_id and pv.product_id=v_item.product_id for update;
      v_price:=coalesce(v_variant.price_iqd,v_product.base_price_iqd);
      if not v_is_restaurant then update public.product_variants set stock_quantity=stock_quantity-v_item.quantity where id=v_item.variant_id; end if;
    else
      v_price:=v_product.base_price_iqd;
      if not v_is_restaurant then update public.products set stock_quantity=stock_quantity-v_item.quantity where id=v_item.product_id; end if;
    end if;

    v_selected_options := '[]'::jsonb;
    if v_is_restaurant then
      v_option_total := private.restaurant_option_total(v_product.id,v_item.selected_option_ids);
      v_price := v_price + v_option_total;
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',o.id,'group_id',g.id,'group_name_ku',g.name_ku,
        'option_name_ku',o.name_ku,'price_iqd',o.price_iqd
      ) order by g.sort_order,g.id,o.sort_order,o.id),'[]'::jsonb)
      into v_selected_options
      from public.restaurant_menu_options o
      join public.restaurant_menu_option_groups g on g.id=o.group_id
      where o.id=any(coalesce(v_item.selected_option_ids,'{}'::uuid[]))
        and o.is_active and o.is_available and g.is_active and g.product_id=v_product.id;
    end if;

    select o.id into v_order_id from public.orders o where o.checkout_session_id=v_checkout_id and o.store_id=v_product.store_id limit 1;
    insert into public.order_items(order_id,product_id,variant_id,product_name_ku,product_name_ar,product_name_en,quantity,unit_price_iqd,line_total_iqd,selected_options)
    values(v_order_id,v_item.product_id,v_item.variant_id,v_product.name_ku,v_product.name_ar,v_product.name_en,v_item.quantity,v_price,v_price*v_item.quantity,v_selected_options);
  end loop;

  v_total:=v_subtotal+v_delivery_fee;
  update public.checkout_sessions set subtotal_iqd=v_subtotal,delivery_fee_iqd=v_delivery_fee,total_iqd=v_total,status='pending' where id=v_checkout_id;
  insert into public.payments(checkout_session_id,customer_id,method,status,amount_iqd) values(v_checkout_id,p_customer_id,p_payment_method,'pending',v_total);
  delete from public.cart_items where cart_id=v_cart_id;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(p_customer_id,'checkout.created','checkout_session',v_checkout_id::text,jsonb_build_object('order_count',v_order_count,'payment_method',p_payment_method,'total_iqd',v_total));
  return jsonb_build_object('checkout_id',v_checkout_id,'status','pending','payment_method',p_payment_method,'subtotal_iqd',v_subtotal,'delivery_fee_iqd',v_delivery_fee,'total_iqd',v_total,'orders',v_order_ids);
exception when unique_violation then
  select * into v_existing from public.checkout_sessions where customer_id=p_customer_id and idempotency_key=p_idempotency_key limit 1;
  if found then
    return jsonb_build_object('checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,'total_iqd',v_existing.total_iqd);
  end if;
  raise;
end;
$$;

revoke all on function private.create_checkout_internal(uuid,text,text,numeric,numeric,text,public.payment_method) from public, anon, authenticated;
