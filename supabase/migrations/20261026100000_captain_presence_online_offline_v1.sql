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
