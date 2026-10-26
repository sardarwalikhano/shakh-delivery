-- Add explicit, server-verified captain availability without changing delivery/payment flows.
alter table public.profiles
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_captain_presence_idx
  on public.profiles (is_online, last_seen_at desc)
  where is_online = true;

create or replace function public.guard_captain_presence_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if (new.is_online is distinct from old.is_online
      or new.last_seen_at is distinct from old.last_seen_at)
     and (
       pg_catalog.current_setting('shakh.captain_presence_rpc', true) is distinct from 'allowed'
       or not exists (
         select 1
         from public.user_roles ur
         where ur.user_id = auth.uid()
           and ur.role = 'captain'::public.app_role
       )
       or new.id is distinct from auth.uid()
     ) then
    raise exception 'Use the captain presence endpoint to update availability'
      using errcode = '42501';
  end if;
  return new;
end;
$guard$;

drop trigger if exists guard_captain_presence_columns on public.profiles;
create trigger guard_captain_presence_columns
before update of is_online, last_seen_at on public.profiles
for each row execute function public.guard_captain_presence_columns();

create or replace function public.set_captain_presence(p_is_online boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_last_seen timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_user_id
      and ur.role = 'captain'::public.app_role
  ) then
    raise exception 'Captain role required' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('shakh.captain_presence_rpc', 'allowed', true);

  update public.profiles p
     set is_online = p_is_online,
         last_seen_at = case when p_is_online then pg_catalog.now() else p.last_seen_at end,
         updated_at = pg_catalog.now()
   where p.id = v_user_id
   returning p.last_seen_at into v_last_seen;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'is_online', p_is_online,
    'last_seen_at', v_last_seen
  );
end;
$function$;

revoke all on function public.guard_captain_presence_columns() from public, anon, authenticated;
revoke all on function public.set_captain_presence(boolean) from public, anon;
grant execute on function public.set_captain_presence(boolean) to authenticated;


-- Reject new delivery assignments/claims for offline or stale captains at the database layer.
-- Existing delivery progress updates are unaffected because the guard only runs when captain_id changes.
create or replace function public.guard_captain_assignment_presence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if new.captain_id is not null
     and (tg_op = 'INSERT' or old.captain_id is distinct from new.captain_id) then
    if not exists (
      select 1
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id
      where ur.user_id = new.captain_id
        and ur.role = 'captain'::public.app_role
        and p.is_online = true
        and p.last_seen_at >= pg_catalog.now() - interval '2 minutes'
    ) then
      raise exception 'Captain is offline or heartbeat is stale'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$guard$;

revoke all on function public.guard_captain_assignment_presence() from public, anon, authenticated;

drop trigger if exists guard_captain_assignment_presence on public.deliveries;
create trigger guard_captain_assignment_presence
before insert or update of captain_id on public.deliveries
for each row execute function public.guard_captain_assignment_presence();

drop trigger if exists guard_captain_assignment_presence on public.food_post_orders;
create trigger guard_captain_assignment_presence
before insert or update of captain_id on public.food_post_orders
for each row execute function public.guard_captain_assignment_presence();

drop trigger if exists guard_captain_assignment_presence on public.apparel_post_orders;
create trigger guard_captain_assignment_presence
before insert or update of captain_id on public.apparel_post_orders
for each row execute function public.guard_captain_assignment_presence();

drop trigger if exists guard_captain_assignment_presence on public.electronics_post_orders;
create trigger guard_captain_assignment_presence
before insert or update of captain_id on public.electronics_post_orders
for each row execute function public.guard_captain_assignment_presence();


-- Restrictive lookup indexes selected from the live FK audit.
-- Foreign keys whose only expected use is rare ON DELETE SET NULL/RESTRICT checks
-- are deliberately not indexed here; add those only after workload evidence.
create index if not exists captain_cash_settlement_batches_captain_settled_idx
  on public.captain_cash_settlement_batches (captain_id, settled_at desc);

create index if not exists food_post_payment_events_captain_received_idx
  on public.food_post_payment_events (captain_id, received_at desc);

create index if not exists order_receipts_store_created_idx
  on public.order_receipts (store_id, created_at desc);

create index if not exists prepaid_topup_requests_user_created_idx
  on public.prepaid_topup_requests (user_id, requested_at desc);

create index if not exists role_requests_user_requested_idx
  on public.role_requests (user_id, requested_at desc);

create index if not exists share_earnings_post_created_idx
  on public.share_earnings (post_id, created_at desc);

create index if not exists share_earnings_share_link_created_idx
  on public.share_earnings (share_link_id, created_at desc);

create index if not exists whatsapp_outbox_recipient_created_idx
  on public.whatsapp_message_outbox (recipient_user_id, created_at desc);

create index if not exists whatsapp_outbox_receipt_idx
  on public.whatsapp_message_outbox (receipt_id);

create index if not exists whatsapp_outbox_settlement_batch_idx
  on public.whatsapp_message_outbox (settlement_batch_id);


-- A captain may record collection only for Cash on Delivery. Mobile Cash must be
-- confirmed through its payment provider/admin flow, not by a courier self-attestation.
create or replace function public.record_food_post_payment(
  p_order_id uuid,
  p_amount_iqd numeric,
  p_note text default null
)
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
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if not (select private.has_permission('deliveries.status_update')) then
    raise exception using errcode='42501', message='Captain delivery permission required';
  end if;

  select * into v_order
  from public.food_post_orders
  where id=p_order_id and captain_id=v_user_id
  for update;
  if not found then
    raise exception using errcode='42501', message='Food order is not assigned to you';
  end if;
  if v_order.delivery_status <> 'delivered' then
    raise exception using errcode='22023', message='Mark this delivery as delivered before recording payment';
  end if;
  if v_order.payment_method <> 'cash_on_delivery' then
    raise exception using errcode='22023', message='Mobile Cash must be verified through the payment confirmation flow';
  end if;
  if round(coalesce(p_amount_iqd,0),2) <> v_order.total_iqd then
    raise exception using errcode='22023', message='Received amount must match the order total';
  end if;
  if length(coalesce(p_note,'')) > 1000 then
    raise exception using errcode='22023', message='Payment note is too long';
  end if;

  select * into v_event from public.food_post_payment_events where order_id=p_order_id;
  if found then
    if v_event.captain_id <> v_user_id or v_event.amount_iqd <> p_amount_iqd then
      raise exception using errcode='23505', message='Payment for this order has already been recorded';
    end if;
    return jsonb_build_object('id',v_event.id,'order_id',v_event.order_id,'amount_iqd',v_event.amount_iqd,'received_at',v_event.received_at);
  end if;

  insert into public.food_post_payment_events(order_id,captain_id,amount_iqd,payment_method,note)
  values(p_order_id,v_user_id,v_order.total_iqd,v_order.payment_method,nullif(btrim(p_note),'' ))
  returning * into v_event;

  update public.food_post_orders
  set payment_status='collected',payment_collected_at=v_event.received_at,updated_at=now()
  where id=p_order_id;

  return jsonb_build_object('id',v_event.id,'order_id',v_event.order_id,'amount_iqd',v_event.amount_iqd,'received_at',v_event.received_at);
end;
$function$;

revoke all on function public.record_food_post_payment(uuid,numeric,text) from public, anon;
grant execute on function public.record_food_post_payment(uuid,numeric,text) to authenticated;


-- Use the database clock and dispatcher permission for the online-captain list.
create or replace function public.get_available_captains()
returns table (
  id uuid,
  full_name text,
  phone text,
  avatar_url text,
  is_online boolean,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if not (
    private.has_permission('deliveries.assign')
    or private.has_permission('deliveries.view_all')
  ) then
    raise exception using errcode='42501', message='Delivery dispatch permission required';
  end if;

  return query
  select p.id, p.full_name, p.phone, p.avatar_url, p.is_online, p.last_seen_at
  from public.profiles p
  join public.user_roles ur on ur.user_id=p.id and ur.role='captain'::public.app_role
  where p.is_online=true
    and p.last_seen_at >= pg_catalog.now() - interval '2 minutes'
  order by lower(coalesce(p.full_name,p.phone,p.id::text));
end;
$function$;

revoke all on function public.get_available_captains() from public, anon;
grant execute on function public.get_available_captains() to authenticated;


-- Complete coverage for the remaining live-schema foreign keys reported as
-- lacking a left-prefix B-tree index. These target small tables (all under ~130 KB
-- at audit time) and help joins plus parent-row delete/update constraint checks.
create index if not exists apparel_post_orders_share_link_idx
  on public.apparel_post_orders (share_link_id);

create index if not exists apparel_post_orders_variant_idx
  on public.apparel_post_orders (variant_id);

create index if not exists captain_cash_ledger_settled_by_idx
  on public.captain_cash_ledger (settled_by);

create index if not exists captain_cash_allocations_ledger_idx
  on public.captain_cash_settlement_allocations (cash_ledger_id);

create index if not exists captain_cash_batches_settled_by_idx
  on public.captain_cash_settlement_batches (settled_by);

create index if not exists captain_cash_items_ledger_idx
  on public.captain_cash_settlement_items (ledger_id);

create index if not exists captain_cash_settlements_received_by_idx
  on public.captain_cash_settlements (received_by);

create index if not exists captain_commission_rules_captain_idx
  on public.captain_commission_rules (captain_id);

create index if not exists captain_commission_rules_updated_by_idx
  on public.captain_commission_rules (updated_by);

create index if not exists electronics_post_orders_share_link_idx
  on public.electronics_post_orders (share_link_id);

create index if not exists food_post_cart_items_post_idx
  on public.food_post_cart_items (post_id);

create index if not exists food_post_orders_share_link_idx
  on public.food_post_orders (share_link_id);

create index if not exists topup_requests_approved_transaction_idx
  on public.prepaid_topup_requests (approved_transaction_id);

create index if not exists topup_requests_reviewed_by_idx
  on public.prepaid_topup_requests (reviewed_by);

create index if not exists prepaid_wallet_transactions_created_by_idx
  on public.prepaid_wallet_transactions (created_by);

create index if not exists role_requests_reviewed_by_idx
  on public.role_requests (reviewed_by);

create index if not exists share_withdrawals_reviewed_by_idx
  on public.share_withdrawal_requests (reviewed_by);

create index if not exists wallet_commission_settings_updated_by_idx
  on public.wallet_commission_settings (updated_by);


-- A seller marking an electronics/product order delivered is not payment evidence.
-- Keep payment_status unchanged here; COD collection is recorded by the assigned
-- captain only after delivery and exact-amount validation, and Mobile Cash must
-- use a trusted payment confirmation path.
create or replace function public.update_electronics_post_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.electronics_post_orders%rowtype;
  v_stock integer;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if p_status not in ('confirmed','rejected','delivered','cancelled') then
    raise exception using errcode='22023', message='Invalid electronics order status';
  end if;

  select * into v_order
  from public.electronics_post_orders
  where id=p_order_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='Electronics order not found';
  end if;

  if v_user_id=v_order.buyer_id then
    if v_order.status <> 'pending' or p_status <> 'cancelled' then
      raise exception using errcode='42501', message='Buyers may only cancel pending electronics orders';
    end if;
  elsif v_user_id=v_order.seller_id or (select private.has_permission('posts.manage')) then
    if not (
      (v_order.status='pending' and p_status in ('confirmed','rejected','cancelled'))
      or (v_order.status='confirmed' and p_status in ('delivered','cancelled'))
    ) then
      raise exception using errcode='22023', message='Invalid electronics order status transition';
    end if;
  else
    raise exception using errcode='42501', message='You cannot manage this electronics order';
  end if;

  if p_status in ('rejected','cancelled') and v_order.status in ('pending','confirmed') then
    select coalesce(nullif(category_details->>'stock_quantity','')::integer,0)
      into v_stock
    from public.posts
    where id=v_order.post_id
    for update;
    update public.posts
    set category_details=jsonb_set(
      category_details,
      '{stock_quantity}',
      to_jsonb(coalesce(v_stock,0)+v_order.quantity),
      true
    )
    where id=v_order.post_id and category='electronics'::public.post_category;
  end if;

  update public.electronics_post_orders
  set status=p_status
  where id=p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'id',p_order_id,
    'status',v_order.status,
    'payment_status',v_order.payment_status
  );
end;
$function$;

revoke all on function public.update_electronics_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_electronics_post_order_status(uuid,text) to authenticated;


-- The application uses update_product_post_order_status for electronics and
-- other eligible direct-post orders. Seller status completion is not proof of
-- payment collection; preserve payment_status until a verified COD/mobile-cash
-- confirmation path records it.
create or replace function public.update_product_post_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.electronics_post_orders%rowtype;
  v_current_stock integer;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if p_status not in ('confirmed','rejected','delivered','cancelled') then
    raise exception using errcode='22023', message='Invalid product post order status';
  end if;

  select * into v_order
  from public.electronics_post_orders
  where id=p_order_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='Product post order not found';
  end if;

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
  set status=p_status
  where id=p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'id',p_order_id,
    'status',v_order.status,
    'payment_status',v_order.payment_status
  );
end;
$function$;

revoke all on function public.update_product_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_product_post_order_status(uuid,text) to authenticated;
