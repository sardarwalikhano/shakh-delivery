-- City-based delivery fees and one global percentage-based SHAKH platform fee.
-- Cars and Hajj/Umrah are exempt only from delivery charges, not from platform commission.

create table if not exists public.delivery_fee_rules (
  id uuid primary key default gen_random_uuid(),
  city_name_ku text not null,
  delivery_fee_iqd numeric(14,2) not null default 0 check (delivery_fee_iqd >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_fee_rules_default_name_check check (
    (is_default and city_name_ku = '__default__')
    or (not is_default and char_length(btrim(city_name_ku)) between 2 and 100)
  )
);

create unique index if not exists delivery_fee_rules_city_name_norm_uq
  on public.delivery_fee_rules (lower(btrim(city_name_ku)));

create table if not exists public.platform_fee_settings (
  id smallint primary key default 1 check (id = 1),
  fee_percent numeric(5,2) not null default 5 check (fee_percent between 0 and 100),
  updated_at timestamptz not null default now()
);

insert into public.delivery_fee_rules(city_name_ku,delivery_fee_iqd,is_active,is_default)
values ('__default__',1000,true,true)
on conflict do nothing;
insert into public.delivery_fee_rules(city_name_ku,delivery_fee_iqd,is_active,is_default)
values ('بەردەڕەش',1000,true,false)
on conflict do nothing;
insert into public.platform_fee_settings(id,fee_percent)
values (1,5)
on conflict (id) do nothing;

alter table public.orders add column if not exists platform_fee_iqd numeric(14,2) not null default 0;
alter table public.orders add column if not exists delivery_city text not null default 'هەولێر';
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

alter table public.delivery_fee_rules enable row level security;
alter table public.platform_fee_settings enable row level security;

drop policy if exists delivery_fee_rules_read_active_or_admin on public.delivery_fee_rules;
create policy delivery_fee_rules_read_active_or_admin on public.delivery_fee_rules
for select to authenticated
using (is_active or (select private.has_permission('settings.manage')));

drop policy if exists delivery_fee_rules_admin_insert on public.delivery_fee_rules;
create policy delivery_fee_rules_admin_insert on public.delivery_fee_rules
for insert to authenticated
with check ((select private.has_permission('settings.manage')));

drop policy if exists delivery_fee_rules_admin_update on public.delivery_fee_rules;
create policy delivery_fee_rules_admin_update on public.delivery_fee_rules
for update to authenticated
using ((select private.has_permission('settings.manage')))
with check (
  (select private.has_permission('settings.manage'))
  and (
    (not is_default and char_length(btrim(city_name_ku)) between 2 and 100)
    or (is_default and city_name_ku = '__default__')
  )
);

drop policy if exists platform_fee_settings_admin_select on public.platform_fee_settings;
create policy platform_fee_settings_admin_select on public.platform_fee_settings
for select to authenticated
using ((select private.has_permission('settings.manage')));

drop policy if exists platform_fee_settings_admin_update on public.platform_fee_settings;
create policy platform_fee_settings_admin_update on public.platform_fee_settings
for update to authenticated
using ((select private.has_permission('settings.manage')))
with check ((select private.has_permission('settings.manage')) and fee_percent between 0 and 100);

revoke all on public.delivery_fee_rules from public, anon;
revoke all on public.platform_fee_settings from public, anon;
grant select, insert, update on public.delivery_fee_rules to authenticated;
grant select, update on public.platform_fee_settings to authenticated;

create or replace function private.is_delivery_exempt_category(p_category_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public, private
as $function$
  select lower(replace(replace(btrim(coalesce(p_category_key, '')), '_', '-'), ' ', '-'))
    in ('car','cars','umrah','hajj','hajj-umrah','hajj-umrah-packages','hajj-packages','umrah-packages')
    or lower(btrim(coalesce(p_category_key, ''))) like '%umrah%'
    or lower(btrim(coalesce(p_category_key, ''))) like '%hajj%';
$function$;

create or replace function private.delivery_fee_for_city(p_city_name text, p_delivery_eligible boolean)
returns numeric(14,2)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_fee numeric(14,2);
begin
  if not coalesce(p_delivery_eligible,false) then return 0; end if;

  select r.delivery_fee_iqd into v_fee
  from public.delivery_fee_rules r
  where r.is_active and not r.is_default
    and lower(btrim(r.city_name_ku)) = lower(btrim(coalesce(p_city_name,'')))
  order by r.updated_at desc
  limit 1;
  if found then return v_fee; end if;

  select r.delivery_fee_iqd into v_fee
  from public.delivery_fee_rules r
  where r.is_active and r.is_default
  order by r.updated_at desc
  limit 1;
  return coalesce(v_fee,0);
end;
$function$;

create or replace function private.platform_fee_percent()
returns numeric(5,2)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select coalesce((select s.fee_percent from public.platform_fee_settings s where s.id=1),0)::numeric(5,2);
$function$;

revoke all on function private.is_delivery_exempt_category(text) from public, anon, authenticated;
revoke all on function private.delivery_fee_for_city(text,boolean) from public, anon, authenticated;
revoke all on function private.platform_fee_percent() from public, anon, authenticated;

create or replace function public.quote_order_fees(
  p_delivery_city text,
  p_category_key text,
  p_subtotal_iqd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_city text := btrim(coalesce(p_delivery_city,''));
  v_category text := lower(replace(replace(btrim(coalesce(p_category_key,'general')),'_','-'),' ','-'));
  v_subtotal numeric(14,2) := coalesce(p_subtotal_iqd,0);
  v_exempt boolean;
  v_delivery_fee numeric(14,2);
  v_platform_percent numeric(5,2);
  v_platform_fee numeric(14,2);
begin
  if (select auth.uid()) is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if char_length(v_city)<2 or char_length(v_city)>100 then
    raise exception using errcode='22023', message='A valid delivery city is required';
  end if;
  if char_length(v_category)<1 or char_length(v_category)>100 then
    raise exception using errcode='22023', message='A valid category is required';
  end if;
  if v_subtotal<0 or v_subtotal>100000000000 then
    raise exception using errcode='22023', message='A valid order subtotal is required';
  end if;
  v_exempt := private.is_delivery_exempt_category(v_category);
  v_delivery_fee := private.delivery_fee_for_city(v_city,not v_exempt);
  v_platform_percent := private.platform_fee_percent();
  v_platform_fee := round(v_subtotal*v_platform_percent/100,0);
  return jsonb_build_object(
    'delivery_city',v_city,
    'category_key',v_category,
    'delivery_fee_iqd',coalesce(v_delivery_fee,0),
    'platform_fee_percent',coalesce(v_platform_percent,0),
    'platform_fee_iqd',coalesce(v_platform_fee,0),
    'total_fees_iqd',coalesce(v_delivery_fee,0)+coalesce(v_platform_fee,0),
    'delivery_exempt',v_exempt
  );
end;
$function$;

revoke all on function public.quote_order_fees(text,text,numeric) from public,anon;
grant execute on function public.quote_order_fees(text,text,numeric) to authenticated;

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
  v_delivery_fee := private.delivery_fee_for_city(p_delivery_city, true);
  v_platform_fee := round(v_line_total * private.platform_fee_percent() / 100, 0);
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
  v_delivery_fee := private.delivery_fee_for_city(p_delivery_city, true);
  v_platform_fee := round(v_line_total * private.platform_fee_percent() / 100, 0);
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


-- Explicit-city RPCs used by the current food and apparel order forms.
create or replace function public.create_food_post_order(
  p_request_id uuid,p_post_id uuid,p_quantity integer,p_delivery_address text,
  p_buyer_phone text,p_delivery_city text,p_customer_note text,p_payment_method text
)
returns jsonb language sql security definer
set search_path = pg_catalog, public, private
as $function$
  select public.create_food_post_order_with_fees(
    p_request_id,p_post_id,p_delivery_city,p_quantity,p_delivery_address,
    p_buyer_phone,p_customer_note,p_payment_method
  );
$function$;

create or replace function public.create_apparel_post_order(
  p_request_id uuid,p_variant_id uuid,p_quantity integer,p_delivery_address text,
  p_buyer_phone text,p_delivery_city text,p_customer_note text,p_payment_method text
)
returns jsonb language sql security definer
set search_path = pg_catalog, public, private
as $function$
  select public.create_apparel_post_order_with_fees(
    p_request_id,p_variant_id,p_delivery_city,p_quantity,p_delivery_address,
    p_buyer_phone,p_customer_note,p_payment_method
  );
$function$;

-- Backward-compatible overloads use the buyer's saved city.
create or replace function public.create_food_post_order(
  p_request_id uuid,p_post_id uuid,p_quantity integer,p_delivery_address text,
  p_buyer_phone text,p_customer_note text default null,p_payment_method text default 'cash_on_delivery'
)
returns jsonb language sql security definer
set search_path = pg_catalog, public, private
as $function$
  select public.create_food_post_order_with_fees(
    p_request_id,p_post_id,
    coalesce((select p.city from public.profiles p where p.id=(select auth.uid())),'هەولێر'),
    p_quantity,p_delivery_address,p_buyer_phone,p_customer_note,p_payment_method
  );
$function$;

create or replace function public.create_apparel_post_order(
  p_request_id uuid,p_variant_id uuid,p_quantity integer,p_delivery_address text,
  p_buyer_phone text,p_customer_note text default null,p_payment_method text default 'cash_on_delivery'
)
returns jsonb language sql security definer
set search_path = pg_catalog, public, private
as $function$
  select public.create_apparel_post_order_with_fees(
    p_request_id,p_variant_id,
    coalesce((select p.city from public.profiles p where p.id=(select auth.uid())),'هەولێر'),
    p_quantity,p_delivery_address,p_buyer_phone,p_customer_note,p_payment_method
  );
$function$;

revoke all on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text,text) from public,anon;
grant execute on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text,text) to authenticated;
revoke all on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;
revoke all on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text,text) from public,anon;
grant execute on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text,text) to authenticated;
revoke all on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;

revoke all on function public.create_food_post_order_with_fees(uuid,uuid,text,integer,text,text,text,text) from public,anon,authenticated;
revoke all on function public.create_apparel_post_order_with_fees(uuid,uuid,text,integer,text,text,text,text) from public,anon,authenticated;
