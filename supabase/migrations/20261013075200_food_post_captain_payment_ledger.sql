-- Keep restaurant post orders in the existing order table while connecting them
-- to captain delivery and recording the cash handoff as an immutable event.
alter table public.apparel_post_orders
  add column if not exists delivery_city text not null default 'نەنووسراوە',
  add column if not exists delivery_fee_iqd numeric(14,2) not null default 0,
  add column if not exists platform_fee_iqd numeric(14,2) not null default 0,
  add column if not exists total_iqd numeric(14,2) not null default 0;

update public.apparel_post_orders
set total_iqd=line_total_iqd+delivery_fee_iqd+platform_fee_iqd
where total_iqd<>line_total_iqd+delivery_fee_iqd+platform_fee_iqd;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='apparel_post_orders_total_consistency'
      and conrelid='public.apparel_post_orders'::regclass
  ) then
    alter table public.apparel_post_orders
      add constraint apparel_post_orders_total_consistency
      check (total_iqd=line_total_iqd+delivery_fee_iqd+platform_fee_iqd);
  end if;
end;
$block$;

alter table public.food_post_orders
  add column captain_id uuid references public.profiles(id) on delete set null,
  add column delivery_status text not null default 'pending',
  add column accepted_at timestamptz,
  add column picked_up_at timestamptz,
  add column on_the_way_at timestamptz,
  add column arrived_at timestamptz,
  add column delivered_at timestamptz,
  add column payment_status text not null default 'pending',
  add column payment_collected_at timestamptz,
  add constraint food_post_orders_delivery_status_check
    check (delivery_status in ('pending','accepted','picked_up','on_the_way','arrived','delivered','failed','cancelled')),
  add constraint food_post_orders_payment_status_check
    check (payment_status in ('pending','collected','failed','refunded'));

create index food_post_orders_captain_delivery_idx
  on public.food_post_orders(captain_id, delivery_status, created_at desc);

do $block$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='food_post_orders'
     ) then
    alter publication supabase_realtime add table public.food_post_orders;
  end if;
end;
$block$;

drop policy if exists food_post_orders_select_participants on public.food_post_orders;
create policy food_post_orders_select_participants
on public.food_post_orders for select to authenticated
using (
  buyer_id = (select auth.uid())
  or seller_id = (select auth.uid())
  or (select private.has_permission('posts.manage'))
  or (
    (select private.has_permission('deliveries.claim'))
    and (
      captain_id = (select auth.uid())
      or (captain_id is null and status = 'confirmed' and delivery_status = 'pending')
    )
  )
);

create table public.food_post_payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.food_post_orders(id) on delete restrict,
  captain_id uuid not null references public.profiles(id) on delete restrict,
  amount_iqd numeric(14,2) not null check (amount_iqd > 0),
  payment_method text not null check (payment_method in ('cash_on_delivery','mobile_cash')),
  received_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

alter table public.food_post_payment_events enable row level security;
revoke all on table public.food_post_payment_events from public, anon, authenticated;
grant select on table public.food_post_payment_events to authenticated;
create policy food_post_payment_events_select_participants
on public.food_post_payment_events for select to authenticated
using (
  exists (
    select 1 from public.food_post_orders o
    where o.id = order_id
      and (
        o.buyer_id = (select auth.uid())
        or o.seller_id = (select auth.uid())
        or o.captain_id = (select auth.uid())
        or (select private.has_permission('payments.manage'))
      )
  )
);

create or replace function public.claim_food_post_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.food_post_orders%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('deliveries.claim')) then
    raise exception using errcode='42501', message='Captain delivery permission required';
  end if;

  update public.food_post_orders o
  set captain_id = v_user_id,
      delivery_status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where o.id = p_order_id
    and o.status = 'confirmed'
    and o.captain_id is null
    and o.delivery_status = 'pending'
  returning * into v_order;

  if not found then
    select * into v_order from public.food_post_orders where id=p_order_id and captain_id=v_user_id;
    if not found then raise exception using errcode='P0001', message='This food delivery is no longer available'; end if;
  end if;

  return jsonb_build_object('order_id',v_order.id,'captain_id',v_order.captain_id,'delivery_status',v_order.delivery_status,'total_iqd',v_order.total_iqd);
end;
$function$;
revoke all on function public.claim_food_post_delivery(uuid) from public, anon;
grant execute on function public.claim_food_post_delivery(uuid) to authenticated;

create or replace function public.update_food_post_delivery_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.food_post_orders%rowtype;
  v_allowed boolean := false;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('deliveries.status_update')) then
    raise exception using errcode='42501', message='Captain delivery permission required';
  end if;

  select * into v_order from public.food_post_orders where id=p_order_id and captain_id=v_user_id for update;
  if not found then raise exception using errcode='42501', message='Food delivery is not assigned to you'; end if;

  v_allowed :=
    (v_order.delivery_status='accepted' and p_status in ('picked_up','failed','cancelled'))
    or (v_order.delivery_status='picked_up' and p_status in ('on_the_way','failed','cancelled'))
    or (v_order.delivery_status='on_the_way' and p_status in ('arrived','failed','cancelled'))
    or (v_order.delivery_status='arrived' and p_status in ('delivered','failed','cancelled'));
  if not v_allowed then raise exception using errcode='22023', message='Invalid food delivery status transition'; end if;

  update public.food_post_orders
  set delivery_status=p_status,
      picked_up_at=case when p_status='picked_up' then now() else picked_up_at end,
      on_the_way_at=case when p_status='on_the_way' then now() else on_the_way_at end,
      arrived_at=case when p_status='arrived' then now() else arrived_at end,
      delivered_at=case when p_status='delivered' then now() else delivered_at end,
      updated_at=now()
  where id=p_order_id
  returning * into v_order;

  if p_status='delivered' then
    update public.food_post_orders set status='delivered',updated_at=now()
    where id=p_order_id and status='confirmed';
    v_order.status := 'delivered';
  end if;

  return jsonb_build_object('order_id',v_order.id,'delivery_status',v_order.delivery_status,'total_iqd',v_order.total_iqd);
end;
$function$;
revoke all on function public.update_food_post_delivery_status(uuid,text) from public, anon;
grant execute on function public.update_food_post_delivery_status(uuid,text) to authenticated;

create or replace function public.record_food_post_payment(p_order_id uuid, p_amount_iqd numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.food_post_orders%rowtype;
  v_event public.food_post_payment_events%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('deliveries.status_update')) then
    raise exception using errcode='42501', message='Captain delivery permission required';
  end if;

  select * into v_order from public.food_post_orders where id=p_order_id and captain_id=v_user_id for update;
  if not found then raise exception using errcode='42501', message='Food order is not assigned to you'; end if;
  if v_order.delivery_status <> 'delivered' then
    raise exception using errcode='22023', message='Mark the food delivery as delivered before recording payment';
  end if;
  if round(coalesce(p_amount_iqd,0),2) <> v_order.total_iqd then
    raise exception using errcode='22023', message='Received amount must match the order total';
  end if;

  select * into v_event from public.food_post_payment_events where order_id=p_order_id;
  if found then
    if v_event.captain_id <> v_user_id or v_event.amount_iqd <> p_amount_iqd then
      raise exception using errcode='23505', message='Payment for this order has already been recorded';
    end if;
    return jsonb_build_object('id',v_event.id,'order_id',v_event.order_id,'amount_iqd',v_event.amount_iqd,'received_at',v_event.received_at);
  end if;

  insert into public.food_post_payment_events(order_id,captain_id,amount_iqd,payment_method,note)
  values(p_order_id,v_user_id,v_order.total_iqd,v_order.payment_method,nullif(btrim(p_note),''))
  returning * into v_event;

  update public.food_post_orders
  set payment_status='collected',payment_collected_at=v_event.received_at,updated_at=now()
  where id=p_order_id;

  return jsonb_build_object('id',v_event.id,'order_id',v_event.order_id,'amount_iqd',v_event.amount_iqd,'received_at',v_event.received_at);
end;
$function$;
revoke all on function public.record_food_post_payment(uuid,numeric,text) from public, anon;
grant execute on function public.record_food_post_payment(uuid,numeric,text) to authenticated;

create or replace function public.checkout_food_post_cart(
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_order jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;

  for v_item in
    select ci.id, ci.post_id, ci.quantity, p.title as post_title
    from public.food_post_cart_items ci
    join public.posts p on p.id=ci.post_id
    where ci.user_id=v_user_id
    order by ci.created_at, ci.id
    for update of ci
  loop
    v_order := public.create_food_post_order(
      v_item.id,v_item.post_id,v_item.quantity,p_delivery_address,p_buyer_phone,
      p_delivery_city,p_customer_note,p_payment_method
    );
    v_orders := v_orders || jsonb_build_array(v_order || jsonb_build_object('post_title',v_item.post_title));
    v_count := v_count + 1;
  end loop;

  if v_count=0 then raise exception using errcode='22023', message='Food post cart is empty'; end if;
  delete from public.food_post_cart_items where user_id=v_user_id;
  return jsonb_build_object('orders',v_orders,'count',v_count);
end;
$function$;
revoke all on function public.checkout_food_post_cart(text,text,text,text,text) from public, anon;
grant execute on function public.checkout_food_post_cart(text,text,text,text,text) to authenticated;

-- The production RPC requires a delivery city and snapshots all server-priced fees.
-- Keep this signature in the repository and return the same receipt for the client.
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
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
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
  v_line_total numeric(14,2);
  v_delivery_fee numeric(14,2);
  v_platform_fee numeric(14,2);
  v_platform_fee_percent numeric(5,2);
  v_total numeric(14,2);
  v_order_id uuid;
  v_order_number text;
begin
  if v_buyer_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not (select private.has_permission('checkout.create')) then raise exception using errcode='42501',message='Checkout is not permitted for this role'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='Request id is required'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>100 then raise exception using errcode='22023',message='Quantity must be between 1 and 100'; end if;
  if p_delivery_address is null or char_length(btrim(p_delivery_address))<5 or char_length(p_delivery_address)>1000 then raise exception using errcode='22023',message='A valid delivery address is required'; end if;
  if p_delivery_city is null or char_length(btrim(p_delivery_city))<2 or char_length(btrim(p_delivery_city))>100 then raise exception using errcode='22023',message='A valid delivery city is required'; end if;
  if p_buyer_phone is null or char_length(btrim(p_buyer_phone))<6 or char_length(p_buyer_phone)>40 then raise exception using errcode='22023',message='A valid phone number is required'; end if;
  if p_customer_note is not null and char_length(p_customer_note)>2000 then raise exception using errcode='22023',message='Customer note is too long'; end if;
  if coalesce(p_payment_method,'cash_on_delivery') not in ('cash_on_delivery','mobile_cash') then raise exception using errcode='22023',message='Invalid payment method'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_buyer_id::text||':'||p_request_id::text,0));
  select jsonb_build_object(
    'id',o.id,'order_number',o.order_number,'status',o.status,'quantity',o.quantity,
    'unit_price_iqd',o.unit_price_iqd,'line_total_iqd',o.line_total_iqd,
    'delivery_city',o.delivery_city,'delivery_fee_iqd',o.delivery_fee_iqd,
    'platform_fee_iqd',o.platform_fee_iqd,'total_iqd',o.total_iqd
  ) into v_existing from public.apparel_post_orders o where o.buyer_id=v_buyer_id and o.request_id=p_request_id;
  if v_existing is not null then return v_existing; end if;

  select p.id,p.author_id,p.status,p.title,p.price_iqd,p.discount_percent,
         av.stock_quantity,av.price_iqd,av.color_name,av.color_hex,av.size_label
  into v_post_id,v_seller_id,v_post_status,v_title,v_base_price,v_discount,
       v_stock,v_variant_price,v_color_name,v_color_hex,v_size_label
  from public.apparel_variants av join public.posts p on p.id=av.post_id
  where av.id=p_variant_id and p.category='fashion'::public.post_category
  for update of av,p;

  if not found then raise exception using errcode='P0002',message='The selected apparel variant was not found'; end if;
  if v_post_status<>'active'::public.post_status then raise exception using errcode='22023',message='This post is not available for purchase'; end if;
  if v_seller_id=v_buyer_id then raise exception using errcode='42501',message='You cannot purchase your own post'; end if;
  if v_stock<p_quantity then raise exception using errcode='22023',message='Insufficient stock for the selected color and size'; end if;

  v_effective_price:=round(coalesce(v_variant_price,v_base_price)*(100-coalesce(v_discount,0))/100,0);
  if v_effective_price<=0 then raise exception using errcode='22023',message='The current price is invalid'; end if;
  v_line_total:=v_effective_price*p_quantity;
  v_delivery_fee:=private.delivery_fee_for_city(p_delivery_city,true);
  v_platform_fee_percent:=private.platform_fee_percent();
  v_platform_fee:=round(v_line_total*v_platform_fee_percent/100,0);
  v_total:=v_line_total+v_delivery_fee+v_platform_fee;

  update public.apparel_variants set stock_quantity=stock_quantity-p_quantity
  where id=p_variant_id and stock_quantity>=p_quantity returning stock_quantity into v_stock;
  if not found then raise exception using errcode='22023',message='Stock changed. Refresh and choose a new quantity'; end if;

  insert into public.apparel_post_orders(
    request_id,buyer_id,seller_id,post_id,variant_id,post_title,color_name,color_hex,size_label,
    quantity,unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,
    delivery_city,delivery_fee_iqd,platform_fee_iqd,total_iqd
  ) values(
    p_request_id,v_buyer_id,v_seller_id,v_post_id,p_variant_id,v_title,v_color_name,v_color_hex,v_size_label,
    p_quantity,v_effective_price,v_line_total,btrim(p_delivery_address),btrim(p_buyer_phone),nullif(btrim(p_customer_note),''),
    coalesce(p_payment_method,'cash_on_delivery'),'pending',btrim(p_delivery_city),v_delivery_fee,v_platform_fee,v_total
  ) returning id,order_number into v_order_id,v_order_number;

  return jsonb_build_object(
    'id',v_order_id,'order_number',v_order_number,'status','pending','quantity',p_quantity,
    'unit_price_iqd',v_effective_price,'line_total_iqd',v_line_total,'delivery_city',btrim(p_delivery_city),
    'delivery_fee_iqd',v_delivery_fee,'platform_fee_iqd',v_platform_fee,'total_iqd',v_total
  );
end;
$function$;
revoke all on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text,text) from public, anon;
grant execute on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';

