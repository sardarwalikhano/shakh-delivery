-- Configurable, city/category-based delivery fees and a fixed global SHAKH platform fee.
-- Safe upgrade: older production schema used city_name_ku/is_default and fee_percent.
-- Existing records are retained and converted into compatible city/category rules.
create table if not exists public.delivery_fee_rules (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  category_key text not null default 'all',
  delivery_fee_iqd numeric(14,2) not null default 0 check (delivery_fee_iqd >= 0),
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_fee_rules_city_category_unique unique (city, category_key),
  constraint delivery_fee_rules_city_valid check (city = '*' or char_length(btrim(city)) between 2 and 120),
  constraint delivery_fee_rules_category_valid check (char_length(btrim(category_key)) between 1 and 80)
);

-- Migrate the older table in place; do not drop its legacy columns/data.
alter table public.delivery_fee_rules add column if not exists city text;
alter table public.delivery_fee_rules add column if not exists category_key text;
alter table public.delivery_fee_rules add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='delivery_fee_rules' and column_name='city_name_ku'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='delivery_fee_rules' and column_name='is_default'
  ) then
    execute $sql$
      update public.delivery_fee_rules
      set city = case
        when is_default or city_name_ku = '__default__' then '*'
        else city_name_ku
      end
      where city is null
    $sql$;
    execute 'alter table public.delivery_fee_rules alter column city_name_ku drop not null';
    execute 'alter table public.delivery_fee_rules alter column is_default set default false';
  end if;
end
$migration$;

update public.delivery_fee_rules set city='*' where city is null or btrim(city)='';
update public.delivery_fee_rules set category_key='all' where category_key is null or btrim(category_key)='';
alter table public.delivery_fee_rules alter column city set not null;
alter table public.delivery_fee_rules alter column category_key set default 'all';
alter table public.delivery_fee_rules alter column category_key set not null;

create unique index if not exists delivery_fee_rules_city_category_unique
  on public.delivery_fee_rules(city, category_key);

-- Preserve the prior default delivery price where present; otherwise start at 0.
insert into public.delivery_fee_rules(city, category_key, delivery_fee_iqd, is_active)
values (
  '*', 'all',
  coalesce((select r.delivery_fee_iqd from public.delivery_fee_rules r where r.city='*' and r.category_key='all' limit 1), 0),
  true
)
on conflict (city, category_key) do nothing;

-- Requested starting rule: food delivery in بەردەڕەش is 1,000 IQD.
-- City-specific category rules override city-wide/category-wide fallback rules.
insert into public.delivery_fee_rules(city, category_key, delivery_fee_iqd, is_active)
values ('بەردەڕەش', 'food', 1000, true)
on conflict (city, category_key) do nothing;

create table if not exists public.platform_fee_settings (
  id smallint primary key default 1 check (id = 1),
  platform_fee_iqd numeric(14,2) not null default 0 check (platform_fee_iqd >= 0),
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Backward-compatible columns for the legacy global percentage setting.
alter table public.platform_fee_settings add column if not exists platform_fee_iqd numeric(14,2) not null default 0;
alter table public.platform_fee_settings add column if not exists is_active boolean not null default true;
alter table public.platform_fee_settings add column if not exists updated_by uuid references auth.users(id) on delete set null;

insert into public.platform_fee_settings(id, platform_fee_iqd, is_active)
values (1, 0, true)
on conflict (id) do nothing;

alter table public.delivery_fee_rules enable row level security;
alter table public.platform_fee_settings enable row level security;

drop policy if exists delivery_fee_rules_read_authenticated on public.delivery_fee_rules;
create policy delivery_fee_rules_read_authenticated on public.delivery_fee_rules
for select to authenticated using (true);

drop policy if exists delivery_fee_rules_manage on public.delivery_fee_rules;
create policy delivery_fee_rules_manage on public.delivery_fee_rules
for all to authenticated
using ((select private.has_permission('settings.manage')))
with check ((select private.has_permission('settings.manage')));

drop policy if exists platform_fee_settings_read_authenticated on public.platform_fee_settings;
create policy platform_fee_settings_read_authenticated on public.platform_fee_settings
for select to authenticated using (true);

drop policy if exists platform_fee_settings_manage on public.platform_fee_settings;
create policy platform_fee_settings_manage on public.platform_fee_settings
for all to authenticated
using ((select private.has_permission('settings.manage')))
with check ((select private.has_permission('settings.manage')));

revoke all on public.delivery_fee_rules from public, anon;
revoke all on public.platform_fee_settings from public, anon;
grant select, insert, update, delete on public.delivery_fee_rules to authenticated;
grant select, insert, update on public.platform_fee_settings to authenticated;

alter table public.orders add column if not exists platform_fee_iqd numeric(14,2) not null default 0;
alter table public.orders add column if not exists delivery_city text not null default 'هەولێر';
alter table public.orders add column if not exists category_key text not null default 'general';
alter table public.checkout_sessions add column if not exists platform_fee_iqd numeric(14,2) not null default 0;
alter table public.checkout_sessions add column if not exists delivery_city text not null default 'هەولێر';

alter table public.food_post_orders add column if not exists delivery_city text not null default 'هەولێر';
alter table public.food_post_orders add column if not exists delivery_fee_iqd numeric(14,2) not null default 0;
alter table public.food_post_orders add column if not exists platform_fee_iqd numeric(14,2) not null default 0;
alter table public.food_post_orders add column if not exists total_iqd numeric(14,2) not null default 0;
update public.food_post_orders
set total_iqd = line_total_iqd + delivery_fee_iqd + platform_fee_iqd
where total_iqd = 0;

alter table public.apparel_post_orders add column if not exists delivery_city text not null default 'هەولێر';
alter table public.apparel_post_orders add column if not exists delivery_fee_iqd numeric(14,2) not null default 0;
alter table public.apparel_post_orders add column if not exists platform_fee_iqd numeric(14,2) not null default 0;
alter table public.apparel_post_orders add column if not exists total_iqd numeric(14,2) not null default 0;
update public.apparel_post_orders
set total_iqd = line_total_iqd + delivery_fee_iqd + platform_fee_iqd
where total_iqd = 0;

alter table public.orders drop constraint if exists orders_total_consistency;
alter table public.orders add constraint orders_total_consistency
check (total_iqd = subtotal_iqd + delivery_fee_iqd + platform_fee_iqd);
alter table public.orders drop constraint if exists orders_amounts_nonnegative;
alter table public.orders add constraint orders_amounts_nonnegative
check (subtotal_iqd >= 0 and delivery_fee_iqd >= 0 and platform_fee_iqd >= 0 and total_iqd >= 0);

alter table public.checkout_sessions drop constraint if exists checkout_total_consistency;
alter table public.checkout_sessions add constraint checkout_total_consistency
check (total_iqd = subtotal_iqd + delivery_fee_iqd + platform_fee_iqd);
alter table public.checkout_sessions drop constraint if exists checkout_totals_nonnegative;
alter table public.checkout_sessions add constraint checkout_totals_nonnegative
check (subtotal_iqd >= 0 and delivery_fee_iqd >= 0 and platform_fee_iqd >= 0 and total_iqd >= 0);

alter table public.food_post_orders drop constraint if exists food_post_orders_fee_total_consistency;
alter table public.food_post_orders add constraint food_post_orders_fee_total_consistency
check (delivery_fee_iqd >= 0 and platform_fee_iqd >= 0 and total_iqd = line_total_iqd + delivery_fee_iqd + platform_fee_iqd);
alter table public.apparel_post_orders drop constraint if exists apparel_post_orders_fee_total_consistency;
alter table public.apparel_post_orders add constraint apparel_post_orders_fee_total_consistency
check (delivery_fee_iqd >= 0 and platform_fee_iqd >= 0 and total_iqd = line_total_iqd + delivery_fee_iqd + platform_fee_iqd);

create or replace function private.resolve_delivery_fee(p_delivery_city text, p_category_key text)
returns numeric(14,2)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_city text := lower(btrim(coalesce(p_delivery_city, '')));
  v_category text := lower(btrim(coalesce(p_category_key, 'all')));
  v_fee numeric(14,2);
begin
  if v_category in ('cars', 'car', 'umrah', 'hajj', 'hajj-umrah', 'hajj_umrah', 'hajj-umrah-packages')
     or v_category like '%umrah%'
     or v_category like '%hajj%' then
    return 0;
  end if;

  select r.delivery_fee_iqd
    into v_fee
  from public.delivery_fee_rules r
  where r.is_active
    and (lower(btrim(r.city)) = v_city or r.city = '*')
    and (lower(btrim(r.category_key)) = v_category or lower(btrim(r.category_key)) = 'all')
  order by
    case
      when r.city <> '*' and lower(btrim(r.category_key)) = v_category then 1
      when r.city <> '*' and lower(btrim(r.category_key)) = 'all' then 2
      when r.city = '*' and lower(btrim(r.category_key)) = v_category then 3
      else 4
    end,
    r.updated_at desc
  limit 1;

  return coalesce(v_fee, 0);
end;
$function$;

create or replace function private.resolve_platform_fee()
returns numeric(14,2)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select case when s.is_active then s.platform_fee_iqd else 0 end
  from public.platform_fee_settings s
  where s.id = 1
  union all
  select 0
  where not exists (select 1 from public.platform_fee_settings where id = 1)
  limit 1;
$function$;

revoke all on function private.resolve_delivery_fee(text,text) from public, anon, authenticated;
revoke all on function private.resolve_platform_fee() from public, anon, authenticated;

create or replace function public.quote_order_fees(p_delivery_city text, p_category_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_delivery numeric(14,2);
  v_platform numeric(14,2);
  v_category text := lower(btrim(coalesce(p_category_key, 'all')));
  v_exempt boolean;
begin
  if auth.uid() is null or not (select private.has_permission('checkout.create')) then
    raise exception using errcode = '42501', message = 'Checkout is not permitted for this role';
  end if;
  if p_delivery_city is null or char_length(btrim(p_delivery_city)) < 2 or char_length(btrim(p_delivery_city)) > 120 then
    raise exception using errcode = '22023', message = 'A valid delivery city is required';
  end if;

  v_delivery := private.resolve_delivery_fee(p_delivery_city, v_category);
  v_platform := private.resolve_platform_fee();
  v_exempt := v_category in ('cars','car','umrah','hajj','hajj-umrah','hajj_umrah','hajj-umrah-packages')
    or v_category like '%umrah%' or v_category like '%hajj%';

  return jsonb_build_object(
    'delivery_city', btrim(p_delivery_city),
    'category_key', v_category,
    'delivery_fee_iqd', v_delivery,
    'platform_fee_iqd', v_platform,
    'total_fees_iqd', v_delivery + v_platform,
    'delivery_exempt', v_exempt
  );
end;
$function$;

revoke all on function public.quote_order_fees(text,text) from public, anon;
grant execute on function public.quote_order_fees(text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.create_checkout_internal_with_fees(p_customer_id uuid, p_idempotency_key text, p_delivery_address text, p_delivery_lat numeric, p_delivery_lng numeric, p_customer_note text, p_payment_method payment_method, p_delivery_city text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
  v_store_category text := 'general';
  v_store_delivery_fee numeric(14,2) := 0;
  v_store_platform_fee numeric(14,2) := 0;
  v_store_subtotal numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_delivery_fee numeric(14,2) := 0;
  v_platform_fee numeric(14,2) := 0;
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
    return jsonb_build_object('checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,'platform_fee_iqd',v_existing.platform_fee_iqd,'total_iqd',v_existing.total_iqd,'delivery_city',v_existing.delivery_city);
  end if;
  select c.id into v_cart_id from public.carts c where c.user_id=p_customer_id limit 1;
  if v_cart_id is null or not exists(select 1 from public.cart_items ci where ci.cart_id=v_cart_id) then raise exception 'Cart is empty'; end if;

  insert into public.checkout_sessions(customer_id,idempotency_key,payment_method,delivery_address,delivery_city,delivery_lat,delivery_lng,customer_note)
  values(p_customer_id,p_idempotency_key,p_payment_method,btrim(p_delivery_address),btrim(p_delivery_city),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),'' ))
  returning id into v_checkout_id;

  for v_item in
    select ci.id,ci.product_id,ci.variant_id,ci.quantity,ci.selected_option_ids,
           coalesce(cat.slug,'general') as category_key
    from public.cart_items ci
    join public.products sorted_product on sorted_product.id=ci.product_id
    left join public.categories cat on cat.id=sorted_product.category_id
    where ci.cart_id=v_cart_id
    order by sorted_product.store_id,coalesce(cat.slug,'general'),ci.id
    for update of ci
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
      v_store_id:=v_product.store_id;
      v_store_category:=coalesce(v_item.category_key,'general');
      v_store_subtotal:=v_price*v_item.quantity;
    elsif v_product.store_id=v_store_id then
      v_store_subtotal:=v_store_subtotal+(v_price*v_item.quantity);
    else
      v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
      select private.resolve_delivery_fee(p_delivery_city,v_store_category), private.resolve_platform_fee()
      into v_store_delivery_fee,v_store_platform_fee;
      v_delivery_fee:=v_delivery_fee+v_store_delivery_fee;
      v_platform_fee:=v_platform_fee+v_store_platform_fee;
      insert into public.orders(checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,total_iqd,delivery_city,category_key,currency,delivery_address,delivery_lat,delivery_lng,customer_note)
      values(v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,v_store_delivery_fee,v_store_platform_fee,v_store_subtotal+v_store_delivery_fee+v_store_platform_fee,btrim(p_delivery_city),v_store_category,'IQD',btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),'' ))
      returning id into v_order_id;
      insert into public.deliveries(order_id,status) values(v_order_id,'pending');
      v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number,'store_id',v_store_id,'subtotal_iqd',v_store_subtotal,'delivery_fee_iqd',v_store_delivery_fee,'platform_fee_iqd',v_store_platform_fee,'total_iqd',v_store_subtotal+v_store_delivery_fee+v_store_platform_fee));
      v_order_count:=v_order_count+1;
      v_store_id:=v_product.store_id;
      v_store_category:=coalesce(v_item.category_key,'general');
      v_store_subtotal:=v_price*v_item.quantity;
    end if;
    v_subtotal:=v_subtotal+(v_price*v_item.quantity);
  end loop;

  if v_store_id is not null then
    select private.resolve_delivery_fee(p_delivery_city,v_store_category), private.resolve_platform_fee()
      into v_store_delivery_fee,v_store_platform_fee;
    v_delivery_fee:=v_delivery_fee+v_store_delivery_fee;
    v_platform_fee:=v_platform_fee+v_store_platform_fee;
    v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
    select private.resolve_delivery_fee(p_delivery_city,v_store_category), private.resolve_platform_fee()
    into v_store_delivery_fee,v_store_platform_fee;
    v_delivery_fee:=v_delivery_fee+v_store_delivery_fee;
    v_platform_fee:=v_platform_fee+v_store_platform_fee;
    insert into public.orders(checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,total_iqd,delivery_city,category_key,currency,delivery_address,delivery_lat,delivery_lng,customer_note)
    values(v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,v_store_delivery_fee,v_store_platform_fee,v_store_subtotal+v_store_delivery_fee+v_store_platform_fee,btrim(p_delivery_city),v_store_category,'IQD',btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),'' ))
    returning id into v_order_id;
    insert into public.deliveries(order_id,status) values(v_order_id,'pending');
    v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number,'store_id',v_store_id,'subtotal_iqd',v_store_subtotal,'delivery_fee_iqd',v_store_delivery_fee,'platform_fee_iqd',v_store_platform_fee,'total_iqd',v_store_subtotal+v_store_delivery_fee+v_store_platform_fee));
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

  v_total:=v_subtotal+v_delivery_fee+v_platform_fee;
  update public.checkout_sessions set subtotal_iqd=v_subtotal,delivery_fee_iqd=v_delivery_fee,platform_fee_iqd=v_platform_fee,total_iqd=v_total,delivery_city=btrim(p_delivery_city),status='pending' where id=v_checkout_id;
  insert into public.payments(checkout_session_id,customer_id,method,status,amount_iqd) values(v_checkout_id,p_customer_id,p_payment_method,'pending',v_total);
  delete from public.cart_items where cart_id=v_cart_id;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(p_customer_id,'checkout.created','checkout_session',v_checkout_id::text,jsonb_build_object('order_count',v_order_count,'payment_method',p_payment_method,'total_iqd',v_total));
  return jsonb_build_object('checkout_id',v_checkout_id,'status','pending','payment_method',p_payment_method,'subtotal_iqd',v_subtotal,'delivery_fee_iqd',v_delivery_fee,'platform_fee_iqd',v_platform_fee,'total_iqd',v_total,'delivery_city',btrim(p_delivery_city),'orders',v_order_ids);
exception when unique_violation then
  select * into v_existing from public.checkout_sessions where customer_id=p_customer_id and idempotency_key=p_idempotency_key limit 1;
  if found then
    return jsonb_build_object('checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,'platform_fee_iqd',v_existing.platform_fee_iqd,'total_iqd',v_existing.total_iqd,'delivery_city',v_existing.delivery_city);
  end if;
  raise;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_food_post_order_with_fees(p_request_id uuid, p_post_id uuid, p_delivery_city text, p_quantity integer, p_delivery_address text, p_buyer_phone text, p_customer_note text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash_on_delivery'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_buyer_id uuid := auth.uid();
  v_existing jsonb;
  v_seller_id uuid;
  v_post_status public.post_status;
  v_post_title text;
  v_base_price numeric(14,2);
  v_discount integer;
  v_effective_price numeric(14,2);
  v_order_id uuid;
  v_order_number text;
  v_line_total numeric(14,2);
  v_delivery_fee numeric(14,2) := 0;
  v_platform_fee numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
begin
  if v_buyer_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not (select private.has_permission('checkout.create')) then
    raise exception using errcode = '42501', message = 'Checkout is not permitted for this role';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request id is required';
  end if;
  if p_post_id is null then
    raise exception using errcode = '22023', message = 'Food post is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using errcode = '22023', message = 'Quantity must be between 1 and 100';
  end if;
  if p_delivery_address is null or char_length(btrim(p_delivery_address)) < 5 or char_length(p_delivery_address) > 1000 then
    raise exception using errcode = '22023', message = 'A valid delivery address is required';
  end if;
  if p_delivery_city is null or char_length(btrim(p_delivery_city)) < 2 or char_length(btrim(p_delivery_city)) > 120 then
    raise exception using errcode = '22023', message = 'A valid delivery city is required';
  end if;
  if p_buyer_phone is null or char_length(btrim(p_buyer_phone)) < 6 or char_length(p_buyer_phone) > 40 then
    raise exception using errcode = '22023', message = 'A valid phone number is required';
  end if;
  if p_customer_note is not null and char_length(p_customer_note) > 2000 then
    raise exception using errcode = '22023', message = 'Customer note is too long';
  end if;
  if coalesce(p_payment_method, 'cash_on_delivery') not in ('cash_on_delivery', 'mobile_cash') then
    raise exception using errcode = '22023', message = 'Invalid payment method';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_buyer_id::text || ':' || p_request_id::text, 0));

  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'quantity', o.quantity,
    'unit_price_iqd', o.unit_price_iqd,
    'line_total_iqd', o.line_total_iqd,
    'delivery_city', o.delivery_city,
    'delivery_fee_iqd', o.delivery_fee_iqd,
    'platform_fee_iqd', o.platform_fee_iqd,
    'total_iqd', o.total_iqd
  )
  into v_existing
  from public.food_post_orders o
  where o.buyer_id = v_buyer_id and o.request_id = p_request_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select p.author_id, p.status, p.title, p.price_iqd, p.discount_percent
  into v_seller_id, v_post_status, v_post_title, v_base_price, v_discount
  from public.posts p
  where p.id = p_post_id
    and p.category = 'food'::public.post_category
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Food post was not found';
  end if;
  if v_post_status <> 'active'::public.post_status then
    raise exception using errcode = '22023', message = 'This food post is not available for ordering';
  end if;
  if v_seller_id = v_buyer_id then
    raise exception using errcode = '42501', message = 'You cannot order your own food post';
  end if;
  if v_base_price is null or v_base_price <= 0 then
    raise exception using errcode = '22023', message = 'This food post has no valid order price';
  end if;

  v_effective_price := round(v_base_price * (100 - greatest(0, least(99, coalesce(v_discount, 0)))) / 100, 0);
  if v_effective_price <= 0 then
    raise exception using errcode = '22023', message = 'The current food price is invalid';
  end if;
  v_line_total := v_effective_price * p_quantity;
  v_delivery_fee := private.resolve_delivery_fee(p_delivery_city, 'food');
  v_platform_fee := private.resolve_platform_fee();
  v_total := v_line_total + v_delivery_fee + v_platform_fee;

  insert into public.food_post_orders (
    request_id, buyer_id, seller_id, post_id, post_title, quantity,
    unit_price_iqd, line_total_iqd, delivery_city, delivery_fee_iqd, platform_fee_iqd, total_iqd,
    delivery_address, buyer_phone, customer_note, payment_method, status
  ) values (
    p_request_id, v_buyer_id, v_seller_id, p_post_id, v_post_title, p_quantity,
    v_effective_price, v_line_total, btrim(p_delivery_city), v_delivery_fee, v_platform_fee, v_total,
    btrim(p_delivery_address), btrim(p_buyer_phone), nullif(btrim(p_customer_note), ''),
    coalesce(p_payment_method, 'cash_on_delivery'), 'pending'
  )
  returning id, order_number into v_order_id, v_order_number;

  insert into public.notifications (
    user_id, type, title_ku, body_ku, title_ar, body_ar, title_en, body_en,
    route, entity_type, entity_id, data
  ) values (
    v_seller_id, 'order_created',
    'داواکاریی خواردنی نوێ', 'داواکارییەکی نوێ بۆ ' || v_post_title || ' تۆمار کرا.',
    'طلب طعام جديد', 'تم استلام طلب جديد لـ ' || v_post_title || '.',
    'New food order', 'A new order was placed for ' || v_post_title || '.',
    '/post-orders', 'food_post_order', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'post_id', p_post_id, 'quantity', p_quantity)
  );

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'quantity', p_quantity,
    'unit_price_iqd', v_effective_price,
    'line_total_iqd', v_line_total,
    'delivery_city', btrim(p_delivery_city),
    'delivery_fee_iqd', v_delivery_fee,
    'platform_fee_iqd', v_platform_fee,
    'total_iqd', v_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_apparel_post_order_with_fees(p_request_id uuid, p_variant_id uuid, p_delivery_city text, p_quantity integer, p_delivery_address text, p_buyer_phone text, p_customer_note text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash_on_delivery'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_buyer_id uuid := auth.uid();
  v_existing jsonb;
  v_post_id uuid;
  v_seller_id uuid;
  v_post_status public.post_status;
  v_title text;
  v_base_price numeric(14,2);
  v_variant_price numeric(14,2);
  v_discount integer;
  v_stock integer;
  v_color_name text;
  v_color_hex text;
  v_size_label text;
  v_effective_price numeric(14,2);
  v_order_id uuid;
  v_order_number text;
  v_line_total numeric(14,2);
  v_delivery_fee numeric(14,2) := 0;
  v_platform_fee numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
begin
  if v_buyer_id is null then raise exception 'Authentication required'; end if;
  if not (select private.has_permission('checkout.create')) then raise exception 'Checkout is not permitted for this role'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'Quantity must be between 1 and 100'; end if;
  if p_delivery_address is null or char_length(btrim(p_delivery_address)) < 5 or char_length(btrim(p_delivery_address)) > 120 then raise exception 'A valid delivery city is required'; end if;
  if p_buyer_phone is null or char_length(btrim(p_buyer_phone)) < 6 or char_length(p_buyer_phone) > 40 then raise exception 'A valid phone number is required'; end if;
  if p_customer_note is not null and char_length(p_customer_note) > 2000 then raise exception 'Customer note is too long'; end if;
  if coalesce(p_payment_method, 'cash_on_delivery') not in ('cash_on_delivery','mobile_cash') then raise exception 'Invalid payment method'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_buyer_id::text || ':' || p_request_id::text, 0));
  select jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'quantity',o.quantity,'unit_price_iqd',o.unit_price_iqd,'line_total_iqd',o.line_total_iqd,'delivery_city',o.delivery_city,'delivery_fee_iqd',o.delivery_fee_iqd,'platform_fee_iqd',o.platform_fee_iqd,'total_iqd',o.total_iqd)
    into v_existing
  from public.apparel_post_orders o
  where o.buyer_id = v_buyer_id and o.request_id = p_request_id;
  if v_existing is not null then return v_existing; end if;

  select p.id, p.author_id, p.status, p.title, p.price_iqd, p.discount_percent,
         av.stock_quantity, av.price_iqd, av.color_name, av.color_hex, av.size_label
    into v_post_id, v_seller_id, v_post_status, v_title, v_base_price, v_discount,
         v_stock, v_variant_price, v_color_name, v_color_hex, v_size_label
  from public.apparel_variants av
  join public.posts p on p.id = av.post_id
  where av.id = p_variant_id and p.category = 'fashion'::public.post_category
  for update of av, p;

  if not found then raise exception 'The selected apparel variant was not found'; end if;
  if v_post_status <> 'active'::public.post_status then raise exception 'This post is not available for purchase'; end if;
  if v_seller_id = v_buyer_id then raise exception 'You cannot purchase your own post'; end if;
  if v_stock < p_quantity then raise exception 'Insufficient stock for the selected color and size'; end if;

  v_effective_price := round(coalesce(v_variant_price, v_base_price) * (100 - coalesce(v_discount,0)) / 100, 0);
  if v_effective_price <= 0 then raise exception 'The current price is invalid'; end if;
  v_line_total := v_effective_price * p_quantity;
  v_delivery_fee := private.resolve_delivery_fee(p_delivery_city, 'fashion');
  v_platform_fee := private.resolve_platform_fee();
  v_total := v_line_total + v_delivery_fee + v_platform_fee;

  update public.apparel_variants
  set stock_quantity = stock_quantity - p_quantity
  where id = p_variant_id and stock_quantity >= p_quantity
  returning stock_quantity into v_stock;
  if not found then raise exception 'Stock changed. Refresh and choose a new quantity'; end if;

  insert into public.apparel_post_orders (
    request_id, buyer_id, seller_id, post_id, variant_id, post_title,
    color_name, color_hex, size_label, quantity, unit_price_iqd, line_total_iqd,
    delivery_address, buyer_phone, customer_note, payment_method, status,
    delivery_city, delivery_fee_iqd, platform_fee_iqd, total_iqd
  ) values (
    p_request_id, v_buyer_id, v_seller_id, v_post_id, p_variant_id, v_title,
    v_color_name, v_color_hex, v_size_label, p_quantity, v_effective_price, v_line_total,
    btrim(p_delivery_address), btrim(p_buyer_phone), nullif(btrim(p_customer_note), ''),
    coalesce(p_payment_method,'cash_on_delivery'), 'pending',
    btrim(p_delivery_city), v_delivery_fee, v_platform_fee, v_total
  ) returning id, order_number into v_order_id, v_order_number;

  return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'status','pending','quantity',p_quantity,'unit_price_iqd',v_effective_price,'line_total_iqd',v_line_total,'delivery_city',btrim(p_delivery_city),'delivery_fee_iqd',v_delivery_fee,'platform_fee_iqd',v_platform_fee,'total_iqd',v_total);
end;
$function$
;


create or replace function private.create_checkout_internal(
  p_customer_id uuid, p_idempotency_key text, p_delivery_address text,
  p_delivery_lat numeric, p_delivery_lng numeric, p_customer_note text, p_payment_method public.payment_method
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select private.create_checkout_internal_with_fees(
    p_customer_id, p_idempotency_key, p_delivery_address, p_delivery_lat, p_delivery_lng,
    p_customer_note, p_payment_method,
    coalesce((select p.city from public.profiles p where p.id = p_customer_id), 'هەولێر')
  );
$function$;

revoke all on function private.create_checkout_internal_with_fees(uuid,text,text,numeric,numeric,text,public.payment_method,text) from public, anon, authenticated;
revoke all on function private.create_checkout_internal(uuid,text,text,numeric,numeric,text,public.payment_method) from public, anon;
grant execute on function private.create_checkout_internal(uuid,text,text,numeric,numeric,text,public.payment_method) to authenticated;

create or replace function public.create_checkout_with_fees(
  p_idempotency_key text,
  p_delivery_address text,
  p_delivery_city text,
  p_delivery_lat numeric,
  p_delivery_lng numeric,
  p_customer_note text,
  p_payment_method public.payment_method
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if not (select private.has_permission('checkout.create')) then
    raise exception using errcode = '42501', message = 'Checkout is not permitted for this role';
  end if;
  if p_delivery_city is null or char_length(btrim(p_delivery_city)) < 2 or char_length(btrim(p_delivery_city)) > 120 then
    raise exception using errcode = '22023', message = 'A valid delivery city is required';
  end if;
  return private.create_checkout_internal_with_fees(
    (select auth.uid()), p_idempotency_key, p_delivery_address, p_delivery_lat, p_delivery_lng,
    p_customer_note, p_payment_method, btrim(p_delivery_city)
  );
end;
$function$;

revoke all on function public.create_checkout_with_fees(text,text,text,numeric,numeric,text,public.payment_method) from public, anon;
grant execute on function public.create_checkout_with_fees(text,text,text,numeric,numeric,text,public.payment_method) to authenticated;

create or replace function public.create_food_post_order(
  p_request_id uuid, p_post_id uuid, p_quantity integer, p_delivery_address text, p_buyer_phone text,
  p_customer_note text default null, p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select public.create_food_post_order_with_fees(
    p_request_id, p_post_id,
    coalesce((select p.city from public.profiles p where p.id = (select auth.uid())), 'هەولێر'),
    p_quantity, p_delivery_address, p_buyer_phone, p_customer_note, p_payment_method
  );
$function$;

create or replace function public.create_apparel_post_order(
  p_request_id uuid, p_variant_id uuid, p_quantity integer, p_delivery_address text, p_buyer_phone text,
  p_customer_note text default null, p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select public.create_apparel_post_order_with_fees(
    p_request_id, p_variant_id,
    coalesce((select p.city from public.profiles p where p.id = (select auth.uid())), 'هەولێر'),
    p_quantity, p_delivery_address, p_buyer_phone, p_customer_note, p_payment_method
  );
$function$;

revoke all on function public.create_food_post_order_with_fees(uuid,uuid,text,integer,text,text,text,text) from public, anon;
grant execute on function public.create_food_post_order_with_fees(uuid,uuid,text,integer,text,text,text,text) to authenticated;
revoke all on function public.create_apparel_post_order_with_fees(uuid,uuid,text,integer,text,text,text,text) from public, anon;
grant execute on function public.create_apparel_post_order_with_fees(uuid,uuid,text,integer,text,text,text,text) to authenticated;
revoke all on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;
revoke all on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;


-- Keep legacy RPC signatures routed through the same fee engine. This prevents an
-- older client or already-open tab from bypassing city/category fees.

create or replace function private.create_checkout_internal(
  p_customer_id uuid,
  p_idempotency_key text,
  p_delivery_address text,
  p_delivery_lat numeric,
  p_delivery_lng numeric,
  p_customer_note text,
  p_payment_method public.payment_method,
  p_delivery_city text
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select private.create_checkout_internal_with_fees(
    p_customer_id, p_idempotency_key, p_delivery_address, p_delivery_lat,
    p_delivery_lng, p_customer_note, p_payment_method,
    coalesce(nullif(btrim(p_delivery_city), ''), (select p.city from public.profiles p where p.id=p_customer_id), 'هەولێر')
  );
$function$;

revoke all on function private.create_checkout_internal(uuid,text,text,numeric,numeric,text,public.payment_method,text) from public, anon, authenticated;

create or replace function public.create_checkout(
  p_idempotency_key text,
  p_delivery_address text,
  p_delivery_lat numeric default null,
  p_delivery_lng numeric default null,
  p_customer_note text default null,
  p_payment_method public.payment_method default 'cash_on_delivery',
  p_delivery_city text default null
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if not (select private.has_permission('checkout.create')) then
    raise exception using errcode='42501', message='Checkout is not permitted for this role';
  end if;
  return private.create_checkout_internal_with_fees(
    (select auth.uid()), p_idempotency_key, p_delivery_address, p_delivery_lat,
    p_delivery_lng, p_customer_note, p_payment_method,
    coalesce(nullif(btrim(p_delivery_city), ''), (select p.city from public.profiles p where p.id=(select auth.uid())), 'هەولێر')
  );
end;
$function$;

revoke all on function public.create_checkout(text,text,numeric,numeric,text,public.payment_method,text) from public, anon;
grant execute on function public.create_checkout(text,text,numeric,numeric,text,public.payment_method,text) to authenticated;

-- Explicit-city signatures used by the current food and apparel order forms.
-- City is required here so the rate cannot silently fall back to the seller profile.
create or replace function public.create_food_post_order(
  p_request_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select public.create_food_post_order_with_fees(
    p_request_id, p_post_id, p_delivery_city, p_quantity,
    p_delivery_address, p_buyer_phone, p_customer_note, p_payment_method
  );
$function$;

create or replace function public.create_apparel_post_order(
  p_request_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select public.create_apparel_post_order_with_fees(
    p_request_id, p_variant_id, p_delivery_city, p_quantity,
    p_delivery_address, p_buyer_phone, p_customer_note, p_payment_method
  );
$function$;

revoke all on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text,text) from public, anon;
grant execute on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text,text) to authenticated;
revoke all on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text,text) from public, anon;
grant execute on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text,text) to authenticated;


-- Also replace the original legacy signatures that predate explicit delivery-city
-- input. This keeps existing app tabs functional while still calculating fees
-- from the buyer's saved city instead of bypassing the central fee engine.

create or replace function public.create_food_post_order(
  p_request_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select public.create_food_post_order_with_fees(
    p_request_id, p_post_id,
    coalesce((select p.city from public.profiles p where p.id = (select auth.uid())), 'هەولێر'),
    p_quantity, p_delivery_address, p_buyer_phone, p_customer_note, p_payment_method
  );
$function$;

create or replace function public.create_apparel_post_order(
  p_request_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select public.create_apparel_post_order_with_fees(
    p_request_id, p_variant_id,
    coalesce((select p.city from public.profiles p where p.id = (select auth.uid())), 'هەولێر'),
    p_quantity, p_delivery_address, p_buyer_phone, p_customer_note, p_payment_method
  );
$function$;

revoke all on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;
revoke all on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;
