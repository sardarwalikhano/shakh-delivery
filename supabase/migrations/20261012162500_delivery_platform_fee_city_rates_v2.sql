-- City-based delivery rates and a single configurable SHAKH platform commission.
-- Per-city rate rules apply to all delivery-eligible categories. Cars and Hajj/Umrah
-- remain exempt from delivery fees; the platform percentage still applies to their
-- standard checkout orders if such products are offered through the catalogue.

create unique index if not exists delivery_fee_rules_city_name_norm_uq
  on public.delivery_fee_rules (lower(btrim(city_name_ku)));

create or replace function private.is_delivery_exempt_category(p_category_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public, private
as $function$
  select lower(replace(replace(btrim(coalesce(p_category_key, '')), '_', '-'), ' ', '-'))
    in ('car', 'cars', 'umrah', 'hajj', 'hajj-umrah', 'hajj-umrah-packages', 'hajj-packages', 'umrah-packages');
$function$;

revoke all on function private.is_delivery_exempt_category(text) from public, anon, authenticated;

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
  v_city text := btrim(coalesce(p_delivery_city, ''));
  v_category text := lower(replace(replace(btrim(coalesce(p_category_key, 'general')), '_', '-'), ' ', '-'));
  v_subtotal numeric(14,2) := coalesce(p_subtotal_iqd, 0);
  v_delivery_exempt boolean;
  v_delivery_fee numeric(14,2);
  v_platform_percent numeric(5,2);
  v_platform_fee numeric(14,2);
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if char_length(v_city) < 2 or char_length(v_city) > 100 then
    raise exception using errcode = '22023', message = 'A valid delivery city is required';
  end if;
  if char_length(v_category) < 1 or char_length(v_category) > 100 then
    raise exception using errcode = '22023', message = 'A valid category is required';
  end if;
  if v_subtotal < 0 or v_subtotal > 100000000000 then
    raise exception using errcode = '22023', message = 'A valid order subtotal is required';
  end if;

  v_delivery_exempt := private.is_delivery_exempt_category(v_category);
  v_delivery_fee := private.delivery_fee_for_city(v_city, not v_delivery_exempt);
  v_platform_percent := private.platform_fee_percent();
  v_platform_fee := round(v_subtotal * v_platform_percent / 100, 0);

  return jsonb_build_object(
    'delivery_city', v_city,
    'category_key', v_category,
    'delivery_fee_iqd', coalesce(v_delivery_fee, 0),
    'platform_fee_percent', coalesce(v_platform_percent, 0),
    'platform_fee_iqd', coalesce(v_platform_fee, 0),
    'total_fees_iqd', coalesce(v_delivery_fee, 0) + coalesce(v_platform_fee, 0),
    'delivery_exempt', v_delivery_exempt
  );
end;
$function$;

revoke all on function public.quote_order_fees(text, text, numeric) from public, anon;
grant execute on function public.quote_order_fees(text, text, numeric) to authenticated;

-- Editable starter rates. City-specific rates override the default rule.
insert into public.delivery_fee_rules(city_name_ku, delivery_fee_iqd, is_active, is_default)
values
  ('هەولێر', 3000, true, false),
  ('دهۆک', 3000, true, false),
  ('سلێمانی', 4000, true, false),
  ('کەرکووک', 3500, true, false),
  ('زاخۆ', 3000, true, false),
  ('مووسڵ', 5000, true, false),
  ('بەغدا', 10000, true, false)
on conflict do nothing;

-- Initialize a non-zero platform commission if it has not been configured yet.
-- Existing non-zero choices are preserved.
update public.platform_fee_settings
set fee_percent = 5, updated_at = now()
where id = 1 and fee_percent = 0;

CREATE OR REPLACE FUNCTION private.create_checkout_internal(p_customer_id uuid, p_idempotency_key text, p_delivery_address text, p_delivery_lat numeric, p_delivery_lng numeric, p_customer_note text, p_payment_method payment_method, p_delivery_city text)
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
  v_store_subtotal numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_delivery_fee numeric(14,2) := 0;
  v_platform_fee numeric(14,2) := 0;
  v_platform_fee_percent numeric(5,2) := 0;
  v_store_delivery_fee numeric(14,2) := 0;
  v_store_platform_fee numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_price numeric(14,2);
  v_option_total numeric(14,2);
  v_selected_options jsonb;
  v_is_restaurant boolean;
  v_menu_available boolean;
  v_available_from time;
  v_available_until time;
  v_product_category_slug text;
  v_store_delivery_eligible boolean := false;
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
  if p_delivery_city is null or char_length(btrim(p_delivery_city)) < 2 or char_length(btrim(p_delivery_city)) > 100 then raise exception 'Delivery city is required'; end if;
  if p_payment_method not in ('cash_on_delivery','mobile_cash') then raise exception 'Unsupported payment method'; end if;

  select * into v_existing from public.checkout_sessions
  where customer_id=p_customer_id and idempotency_key=p_idempotency_key limit 1;
  if found then
    return jsonb_build_object(
      'checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,
      'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,
      'platform_fee_iqd',v_existing.platform_fee_iqd,'total_iqd',v_existing.total_iqd,
      'delivery_city',v_existing.delivery_city
    );
  end if;

  select c.id into v_cart_id from public.carts c where c.user_id=p_customer_id limit 1;
  if v_cart_id is null or not exists(select 1 from public.cart_items ci where ci.cart_id=v_cart_id) then raise exception 'Cart is empty'; end if;

  v_platform_fee_percent := private.platform_fee_percent();

  insert into public.checkout_sessions(
    customer_id,idempotency_key,payment_method,delivery_address,delivery_lat,delivery_lng,customer_note,delivery_city
  )
  values(
    p_customer_id,p_idempotency_key,p_payment_method,btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,
    nullif(btrim(p_customer_note),''),btrim(p_delivery_city)
  )
  returning id into v_checkout_id;

  -- First pass: validate prices and create one delivery/order per store.
  for v_item in
    select ci.id,ci.product_id,ci.variant_id,ci.quantity,ci.selected_option_ids
    from public.cart_items ci where ci.cart_id=v_cart_id order by ci.id for update
  loop
    select * into v_product from public.products p where p.id=v_item.product_id for update;
    if not found or v_product.status<>'active' then raise exception 'Product is not available'; end if;
    if not exists(select 1 from public.stores s where s.id=v_product.store_id and s.status='active') then raise exception 'Store is not available'; end if;

    select c.slug into v_product_category_slug from public.categories c where c.id=v_product.category_id;
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
      v_store_subtotal:=v_price*v_item.quantity;
      v_store_delivery_eligible:=not private.is_delivery_exempt_category(coalesce(v_product_category_slug,'general'));
    elsif v_product.store_id=v_store_id then
      v_store_subtotal:=v_store_subtotal+(v_price*v_item.quantity);
      v_store_delivery_eligible:=v_store_delivery_eligible or not private.is_delivery_exempt_category(coalesce(v_product_category_slug,'general'));
    else
      v_store_delivery_fee:=private.delivery_fee_for_city(p_delivery_city,v_store_delivery_eligible);
      v_store_platform_fee:=round(v_store_subtotal*v_platform_fee_percent/100,0);
      v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
      insert into public.orders(
        checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,total_iqd,currency,
        delivery_address,delivery_lat,delivery_lng,customer_note,delivery_city
      ) values(
        v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,v_store_delivery_fee,
        v_store_platform_fee,v_store_subtotal+v_store_delivery_fee+v_store_platform_fee,'IQD',
        btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),''),btrim(p_delivery_city)
      ) returning id into v_order_id;
      insert into public.deliveries(order_id,status) values(v_order_id,'pending');
      v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object(
        'id',v_order_id,'order_number',v_order_number,'store_id',v_store_id,
        'delivery_fee_iqd',v_store_delivery_fee,'platform_fee_iqd',v_store_platform_fee,
        'total_iqd',v_store_subtotal+v_store_delivery_fee+v_store_platform_fee
      ));
      v_order_count:=v_order_count+1;
      v_delivery_fee:=v_delivery_fee+v_store_delivery_fee;
      v_platform_fee:=v_platform_fee+v_store_platform_fee;
      v_store_id:=v_product.store_id;
      v_store_subtotal:=v_price*v_item.quantity;
      v_store_delivery_eligible:=not private.is_delivery_exempt_category(coalesce(v_product_category_slug,'general'));
    end if;
    v_subtotal:=v_subtotal+(v_price*v_item.quantity);
  end loop;

  if v_store_id is not null then
    v_store_delivery_fee:=private.delivery_fee_for_city(p_delivery_city,v_store_delivery_eligible);
    v_store_platform_fee:=round(v_store_subtotal*v_platform_fee_percent/100,0);
    v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
    insert into public.orders(
      checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,total_iqd,currency,
      delivery_address,delivery_lat,delivery_lng,customer_note,delivery_city
    ) values(
      v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,v_store_delivery_fee,
      v_store_platform_fee,v_store_subtotal+v_store_delivery_fee+v_store_platform_fee,'IQD',
      btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),''),btrim(p_delivery_city)
    ) returning id into v_order_id;
    insert into public.deliveries(order_id,status) values(v_order_id,'pending');
    v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object(
      'id',v_order_id,'order_number',v_order_number,'store_id',v_store_id,
      'delivery_fee_iqd',v_store_delivery_fee,'platform_fee_iqd',v_store_platform_fee,
      'total_iqd',v_store_subtotal+v_store_delivery_fee+v_store_platform_fee
    ));
    v_order_count:=v_order_count+1;
    v_delivery_fee:=v_delivery_fee+v_store_delivery_fee;
    v_platform_fee:=v_platform_fee+v_store_platform_fee;
  end if;

  -- Second pass: update inventory and snapshot the exact order item data.
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
  update public.checkout_sessions
  set subtotal_iqd=v_subtotal,delivery_fee_iqd=v_delivery_fee,platform_fee_iqd=v_platform_fee,total_iqd=v_total,
      delivery_city=btrim(p_delivery_city),status='pending'
  where id=v_checkout_id;
  insert into public.payments(checkout_session_id,customer_id,method,status,amount_iqd)
  values(v_checkout_id,p_customer_id,p_payment_method,'pending',v_total);
  delete from public.cart_items where cart_id=v_cart_id;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(p_customer_id,'checkout.created','checkout_session',v_checkout_id::text,
    jsonb_build_object('order_count',v_order_count,'payment_method',p_payment_method,'delivery_city',btrim(p_delivery_city),
      'subtotal_iqd',v_subtotal,'delivery_fee_iqd',v_delivery_fee,'platform_fee_iqd',v_platform_fee,'total_iqd',v_total));
  return jsonb_build_object(
    'checkout_id',v_checkout_id,'status','pending','payment_method',p_payment_method,
    'subtotal_iqd',v_subtotal,'delivery_fee_iqd',v_delivery_fee,'platform_fee_iqd',v_platform_fee,
    'total_iqd',v_total,'delivery_city',btrim(p_delivery_city),'orders',v_order_ids
  );
exception when unique_violation then
  select * into v_existing from public.checkout_sessions where customer_id=p_customer_id and idempotency_key=p_idempotency_key limit 1;
  if found then
    return jsonb_build_object(
      'checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,
      'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,
      'platform_fee_iqd',v_existing.platform_fee_iqd,'total_iqd',v_existing.total_iqd,
      'delivery_city',v_existing.delivery_city
    );
  end if;
  raise;
end;
$function$
;