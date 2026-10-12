-- Dedicated order requests for food posts that live in public.posts rather than catalogue products.
-- This is additive and does not alter the existing restaurant cart/checkout schema.

create table if not exists public.food_post_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'FD-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  request_id uuid not null,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  post_id uuid not null references public.posts(id) on delete restrict,
  post_title text not null,
  quantity integer not null check (quantity between 1 and 100),
  unit_price_iqd numeric(14,2) not null check (unit_price_iqd > 0),
  line_total_iqd numeric(14,2) not null check (line_total_iqd = unit_price_iqd * quantity and line_total_iqd > 0),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 5 and 1000),
  buyer_phone text not null check (char_length(btrim(buyer_phone)) between 6 and 40),
  customer_note text check (customer_note is null or char_length(customer_note) <= 2000),
  payment_method text not null default 'cash_on_delivery'
    check (payment_method in ('cash_on_delivery', 'mobile_cash')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_post_orders_buyer_request_unique unique (buyer_id, request_id)
);

create index if not exists food_post_orders_buyer_created_idx
  on public.food_post_orders (buyer_id, created_at desc);
create index if not exists food_post_orders_seller_created_idx
  on public.food_post_orders (seller_id, created_at desc);
create index if not exists food_post_orders_post_created_idx
  on public.food_post_orders (post_id, created_at desc);

alter table public.food_post_orders enable row level security;

drop policy if exists food_post_orders_select_participants on public.food_post_orders;
create policy food_post_orders_select_participants
on public.food_post_orders
for select
to authenticated
using (
  buyer_id = (select auth.uid())
  or seller_id = (select auth.uid())
  or (select private.has_permission('posts.manage'))
);

revoke all on table public.food_post_orders from public, anon, authenticated;
grant select on table public.food_post_orders to authenticated;

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
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
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
    'line_total_iqd', o.line_total_iqd
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

  insert into public.food_post_orders (
    request_id, buyer_id, seller_id, post_id, post_title, quantity,
    unit_price_iqd, line_total_iqd, delivery_address, buyer_phone,
    customer_note, payment_method, status
  ) values (
    p_request_id, v_buyer_id, v_seller_id, p_post_id, v_post_title, p_quantity,
    v_effective_price, v_line_total, btrim(p_delivery_address), btrim(p_buyer_phone),
    nullif(btrim(p_customer_note), ''), coalesce(p_payment_method, 'cash_on_delivery'), 'pending'
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
    'line_total_iqd', v_line_total
  );
end;
$$;

revoke all on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.create_food_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;

create or replace function public.update_food_post_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.food_post_orders%rowtype;
  v_is_admin boolean;
  v_recipient uuid;
  v_status_title_ku text;
  v_status_body_ku text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_status not in ('pending', 'confirmed', 'rejected', 'delivered', 'cancelled') then
    raise exception using errcode = '22023', message = 'Invalid food order status';
  end if;

  v_is_admin := (select private.has_permission('posts.manage'));
  select * into v_order
  from public.food_post_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Food order not found';
  end if;

  if v_user_id = v_order.buyer_id then
    if v_order.status <> 'pending' or p_status <> 'cancelled' then
      raise exception using errcode = '42501', message = 'Buyers may only cancel pending food orders';
    end if;
    v_recipient := v_order.seller_id;
  elsif v_user_id = v_order.seller_id or v_is_admin then
    if not (
      (v_order.status = 'pending' and p_status in ('confirmed', 'rejected', 'cancelled'))
      or (v_order.status = 'confirmed' and p_status in ('delivered', 'cancelled'))
    ) then
      raise exception using errcode = '22023', message = 'Invalid food order status transition';
    end if;
    v_recipient := v_order.buyer_id;
  else
    raise exception using errcode = '42501', message = 'You cannot manage this food order';
  end if;

  update public.food_post_orders
  set status = p_status, updated_at = now()
  where id = p_order_id;

  v_status_title_ku := case p_status
    when 'confirmed' then 'داواکاری پەسەندکرا'
    when 'rejected' then 'داواکاری ڕەتکرایەوە'
    when 'delivered' then 'داواکاری گەیەنرا'
    when 'cancelled' then 'داواکاری هەڵوەشایەوە'
    else 'دۆخی داواکاری نوێ کرایەوە'
  end;
  v_status_body_ku := 'دۆخی داواکاری ' || v_order.order_number || ' گۆڕدرا بۆ ' || p_status || '.';

  insert into public.notifications (
    user_id, type, title_ku, body_ku, title_ar, body_ar, title_en, body_en,
    route, entity_type, entity_id, data
  ) values (
    v_recipient, 'order_status', v_status_title_ku, v_status_body_ku,
    'تحديث حالة الطلب', 'تم تحديث حالة طلب الطعام.',
    'Food order status updated', 'The food order status was updated.',
    '/post-orders', 'food_post_order', p_order_id,
    jsonb_build_object('order_number', v_order.order_number, 'status', p_status)
  );

  return jsonb_build_object('id', p_order_id, 'status', p_status);
end;
$$;

revoke all on function public.update_food_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_food_post_order_status(uuid,text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'food_post_orders'
     ) then
    alter publication supabase_realtime add table public.food_post_orders;
  end if;
end;
$$;
