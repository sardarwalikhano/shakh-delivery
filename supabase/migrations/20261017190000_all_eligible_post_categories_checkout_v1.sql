-- Extend direct post checkout to every eligible non-vehicle/non-travel/non-home category.
-- Existing electronics, apparel and food order flows remain available and unchanged.
alter table public.electronics_post_orders
  add column if not exists post_category public.post_category default 'electronics';

update public.electronics_post_orders
set post_category = 'electronics'::public.post_category
where post_category is null;

alter table public.electronics_post_orders
  alter column post_category set default 'electronics'::public.post_category;
alter table public.electronics_post_orders
  alter column post_category set not null;

create index if not exists electronics_post_orders_category_created_idx
  on public.electronics_post_orders(post_category, created_at desc);

create or replace function public.create_product_post_order(
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
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_buyer_id uuid := (select auth.uid());
  v_existing jsonb;
  v_post public.posts%rowtype;
  v_stock_text text;
  v_stock integer;
  v_tracks_stock boolean := false;
  v_price numeric(14,2);
  v_line_total numeric(16,2);
  v_delivery_fee numeric(14,2);
  v_platform_fee numeric(14,2);
  v_platform_fee_percent numeric(5,2);
  v_total numeric(16,2);
  v_order_id uuid;
  v_order_number text;
begin
  if v_buyer_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if not (select private.has_permission('checkout.create')) then
    raise exception using errcode='42501', message='Checkout is not permitted for this role';
  end if;
  if p_request_id is null or p_post_id is null then
    raise exception using errcode='22023', message='Request and post IDs are required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using errcode='22023', message='Quantity must be between 1 and 100';
  end if;
  if p_delivery_address is null or char_length(btrim(p_delivery_address)) < 5 or char_length(p_delivery_address) > 1000 then
    raise exception using errcode='22023', message='A valid delivery address is required';
  end if;
  if p_delivery_city is null or char_length(btrim(p_delivery_city)) < 2 or char_length(btrim(p_delivery_city)) > 100 then
    raise exception using errcode='22023', message='A valid delivery city is required';
  end if;
  if p_buyer_phone is null or char_length(btrim(p_buyer_phone)) < 6 or char_length(btrim(p_buyer_phone)) > 40 then
    raise exception using errcode='22023', message='A valid phone number is required';
  end if;
  if p_customer_note is not null and char_length(p_customer_note) > 2000 then
    raise exception using errcode='22023', message='Customer note is too long';
  end if;
  if coalesce(p_payment_method,'cash_on_delivery') not in ('cash_on_delivery','mobile_cash') then
    raise exception using errcode='22023', message='Invalid payment method';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_buyer_id::text || ':' || p_request_id::text, 0));

  select jsonb_build_object(
    'id',o.id,'order_number',o.order_number,'post_category',o.post_category,
    'status',o.status,'quantity',o.quantity,'unit_price_iqd',o.unit_price_iqd,
    'line_total_iqd',o.line_total_iqd,'delivery_city',o.delivery_city,
    'delivery_fee_iqd',o.delivery_fee_iqd,'platform_fee_iqd',o.platform_fee_iqd,
    'total_iqd',o.total_iqd
  ) into v_existing
  from public.electronics_post_orders o
  where o.buyer_id=v_buyer_id and o.request_id=p_request_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_post
  from public.posts p
  where p.id=p_post_id
    and p.category = any (array[
      'general'::public.post_category,
      'supermarket'::public.post_category,
      'beauty'::public.post_category,
      'kids'::public.post_category,
      'online_stores'::public.post_category,
      'delivery'::public.post_category
    ])
  for update;

  if not found then
    raise exception using errcode='P0002', message='This post category is not available for direct checkout';
  end if;
  if v_post.status <> 'active'::public.post_status then
    raise exception using errcode='22023', message='This post is not available for purchase';
  end if;
  if v_post.author_id = v_buyer_id then
    raise exception using errcode='42501', message='You cannot purchase your own post';
  end if;
  if v_post.price_iqd is null or v_post.price_iqd <= 0 then
    raise exception using errcode='22023', message='This post has no valid price';
  end if;

  v_stock_text := nullif(btrim(coalesce(v_post.category_details->>'stock_quantity','')), '');
  if v_stock_text is not null then
    if v_stock_text !~ '^[0-9]+$' then
      raise exception using errcode='22023', message='This post has invalid stock information';
    end if;
    v_stock := v_stock_text::integer;
    v_tracks_stock := true;
    if v_stock < p_quantity then
      raise exception using errcode='22023', message='Insufficient stock; refresh and choose a new quantity';
    end if;
  end if;

  v_price := round(v_post.price_iqd * (100 - greatest(0,least(99,coalesce(v_post.discount_percent,0)))) / 100, 0);
  if v_price <= 0 then
    raise exception using errcode='22023', message='The current product price is invalid';
  end if;
  v_line_total := v_price * p_quantity;
  v_delivery_fee := private.delivery_fee_for_city(btrim(p_delivery_city), true);
  v_platform_fee_percent := private.platform_fee_percent();
  v_platform_fee := round(v_line_total * v_platform_fee_percent / 100, 0);
  v_total := v_line_total + v_delivery_fee + v_platform_fee;

  if v_tracks_stock then
    update public.posts
    set category_details = jsonb_set(
      coalesce(category_details, '{}'::jsonb),
      '{stock_quantity}',
      to_jsonb(v_stock - p_quantity),
      true
    )
    where id=p_post_id and author_id=v_post.author_id;
  end if;

  insert into public.electronics_post_orders(
    order_number,request_id,buyer_id,seller_id,post_id,post_title,post_category,brand,product_details,quantity,
    unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,
    delivery_city,delivery_fee_iqd,platform_fee_iqd,total_iqd,share_link_id,share_reward_iqd
  ) values (
    upper(left(v_post.category::text,2))||'-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    p_request_id,v_buyer_id,v_post.author_id,p_post_id,v_post.title,v_post.category,
    coalesce(nullif(btrim(v_post.brand),''),v_post.category::text),coalesce(v_post.category_details,'{}'::jsonb),p_quantity,
    v_price,v_line_total,btrim(p_delivery_address),btrim(p_buyer_phone),nullif(btrim(p_customer_note),''),
    coalesce(p_payment_method,'cash_on_delivery'),'pending',btrim(p_delivery_city),v_delivery_fee,v_platform_fee,
    v_total,null,0
  ) returning id,order_number into v_order_id,v_order_number;

  insert into public.notifications(
    user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data
  ) values (
    v_post.author_id,'order_created','داواکاریی بەرهەمێکی نوێ',
    'داواکارییەکی نوێ بۆ '||v_post.title||' تۆمار کرا.',
    'طلب منتج جديد','تم استلام طلب جديد لـ '||v_post.title||'.',
    'New product order','A new order was placed for '||v_post.title||'.',
    '/post-orders','electronics_post_order',v_order_id,
    jsonb_build_object('order_number',v_order_number,'post_id',p_post_id,'post_category',v_post.category,'quantity',p_quantity,'total_iqd',v_total)
  );

  return jsonb_build_object(
    'id',v_order_id,'order_number',v_order_number,'post_category',v_post.category,
    'status','pending','quantity',p_quantity,'unit_price_iqd',v_price,'line_total_iqd',v_line_total,
    'delivery_city',btrim(p_delivery_city),'delivery_fee_iqd',v_delivery_fee,
    'platform_fee_iqd',v_platform_fee,'total_iqd',v_total
  );
end;
$function$;

revoke all on function public.create_product_post_order(uuid,uuid,integer,text,text,text,text,text) from public, anon;
grant execute on function public.create_product_post_order(uuid,uuid,integer,text,text,text,text,text) to authenticated;

create or replace function public.update_product_post_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.electronics_post_orders%rowtype;
  v_current_stock integer;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_status not in ('confirmed','rejected','delivered','cancelled') then
    raise exception using errcode='22023', message='Invalid product post order status';
  end if;

  select * into v_order from public.electronics_post_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='Product post order not found'; end if;

  if v_order.post_category not in (
    'electronics'::public.post_category,
    'general'::public.post_category,
    'supermarket'::public.post_category,
    'beauty'::public.post_category,
    'kids'::public.post_category,
    'online_stores'::public.post_category,
    'delivery'::public.post_category
  ) then
    raise exception using errcode='42501', message='This order category cannot use this workflow';
  end if;

  if v_user_id=v_order.buyer_id then
    if v_order.status <> 'pending' or p_status <> 'cancelled' then
      raise exception using errcode='42501', message='Buyers may only cancel pending product orders';
    end if;
  elsif v_user_id=v_order.seller_id or (select private.has_permission('posts.manage')) then
    if not (
      (v_order.status='pending' and p_status in ('confirmed','rejected','cancelled'))
      or (v_order.status='confirmed' and p_status in ('delivered','cancelled'))
    ) then
      raise exception using errcode='22023', message='Invalid product post order status transition';
    end if;
  else
    raise exception using errcode='42501', message='You cannot manage this product post order';
  end if;

  if p_status in ('rejected','cancelled') and v_order.status in ('pending','confirmed')
    and v_order.product_details ? 'stock_quantity'
    and coalesce(v_order.product_details->>'stock_quantity','') ~ '^[0-9]+$' then
    select case
      when coalesce(nullif(btrim(p.category_details->>'stock_quantity'),''),'') ~ '^[0-9]+$'
        then (p.category_details->>'stock_quantity')::integer
      else 0
    end
    into v_current_stock
    from public.posts p
    where p.id=v_order.post_id
    for update;

    if found then
      update public.posts
      set category_details = jsonb_set(
        coalesce(category_details, '{}'::jsonb),
        '{stock_quantity}',
        to_jsonb(coalesce(v_current_stock,0) + v_order.quantity),
        true
      )
      where id=v_order.post_id and category=v_order.post_category;
    end if;
  end if;

  update public.electronics_post_orders
  set status=p_status,
      payment_status=case when p_status='delivered' then 'collected' else payment_status end
  where id=p_order_id;

  return jsonb_build_object(
    'id',p_order_id,'status',p_status,
    'payment_status',case when p_status='delivered' then 'collected' else v_order.payment_status end
  );
end;
$function$;

revoke all on function public.update_product_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_product_post_order_status(uuid,text) to authenticated;
