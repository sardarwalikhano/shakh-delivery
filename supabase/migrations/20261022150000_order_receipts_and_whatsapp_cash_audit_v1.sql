-- Immutable sale receipts, WhatsApp recipient consent, and cumulative COD return notices.
-- Additive only. Existing order, stock, commission, and settlement logic remains authoritative.

create table if not exists public.order_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  order_type text not null check (order_type in ('store_order','food_post','apparel_post','product_post')),
  order_id uuid not null,
  order_number text not null,
  buyer_id uuid references auth.users(id) on delete set null,
  seller_id uuid references auth.users(id) on delete set null,
  captain_id uuid references auth.users(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  buyer_name text,
  buyer_phone text,
  delivery_address text,
  seller_name text,
  seller_phone text,
  item_lines jsonb not null default '[]'::jsonb,
  subtotal_iqd bigint not null default 0 check (subtotal_iqd >= 0),
  delivery_fee_iqd bigint not null default 0 check (delivery_fee_iqd >= 0),
  platform_fee_iqd bigint not null default 0 check (platform_fee_iqd >= 0),
  total_iqd bigint not null default 0 check (total_iqd >= 0),
  payment_method text,
  payment_status text not null default 'pending',
  completed_at timestamptz not null default now(),
  receipt_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(order_type, order_id)
);

create index if not exists order_receipts_seller_idx on public.order_receipts(seller_id, created_at desc);
create index if not exists order_receipts_captain_idx on public.order_receipts(captain_id, created_at desc);
create index if not exists order_receipts_buyer_idx on public.order_receipts(buyer_id, created_at desc);

alter table public.order_receipts enable row level security;
drop policy if exists order_receipts_select_participants on public.order_receipts;
create policy order_receipts_select_participants on public.order_receipts
for select to authenticated
using (
  buyer_id = (select auth.uid())
  or seller_id = (select auth.uid())
  or captain_id = (select auth.uid())
  or (select private.has_permission('orders.view_all'))
  or (select private.has_permission('wallets.manage'))
);
revoke insert, update, delete on public.order_receipts from anon, authenticated;
grant select on public.order_receipts to authenticated;

create table if not exists public.whatsapp_delivery_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text,
  enabled boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint whatsapp_delivery_preferences_phone_format
    check (phone_e164 is null or phone_e164 ~ '^[1-9][0-9]{7,14}$'),
  constraint whatsapp_delivery_preferences_consent_consistency
    check ((enabled and phone_e164 is not null and consented_at is not null) or not enabled)
);
alter table public.whatsapp_delivery_preferences enable row level security;
drop policy if exists whatsapp_delivery_preferences_select_own on public.whatsapp_delivery_preferences;
create policy whatsapp_delivery_preferences_select_own on public.whatsapp_delivery_preferences
for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.whatsapp_delivery_preferences from public, anon, authenticated;
grant select on public.whatsapp_delivery_preferences to authenticated;

create or replace function public.set_my_whatsapp_receipt_preference(
  p_phone text,
  p_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if p_enabled is null then
    raise exception using errcode='22023', message='WhatsApp consent choice is required';
  end if;
  if p_enabled and (length(v_phone) < 8 or length(v_phone) > 15 or left(v_phone,1)='0') then
    raise exception using errcode='22023', message='Enter an international phone number, e.g. +9647xxxxxxxxx';
  end if;

  insert into public.whatsapp_delivery_preferences(user_id,phone_e164,enabled,consented_at,updated_at)
  values(v_user_id, nullif(v_phone,''), p_enabled, case when p_enabled then now() else null end, now())
  on conflict(user_id) do update
    set phone_e164=excluded.phone_e164,
        enabled=excluded.enabled,
        consented_at=excluded.consented_at,
        updated_at=now();

  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(v_user_id,
    case when p_enabled then 'whatsapp.receipt_opt_in' else 'whatsapp.receipt_opt_out' end,
    'whatsapp_delivery_preference',v_user_id::text,
    jsonb_build_object('enabled',p_enabled,'phone_last4',case when p_enabled then right(v_phone,4) else null end));

  return jsonb_build_object('enabled',p_enabled,'phone_last4',case when p_enabled then right(v_phone,4) else null end);
end;
$function$;
revoke all on function public.set_my_whatsapp_receipt_preference(text,boolean) from public, anon;
grant execute on function public.set_my_whatsapp_receipt_preference(text,boolean) to authenticated;

create table if not exists public.whatsapp_message_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check (event_type in ('sale_receipt','cash_return')),
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_phone text not null,
  receipt_id uuid references public.order_receipts(id) on delete cascade,
  settlement_batch_id uuid references public.captain_cash_settlement_batches(id) on delete cascade,
  message_body text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','blocked')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((receipt_id is not null)::integer + (settlement_batch_id is not null)::integer = 1)
);
create index if not exists whatsapp_outbox_pending_idx
  on public.whatsapp_message_outbox(status,next_attempt_at,created_at)
  where status in ('pending','failed');
alter table public.whatsapp_message_outbox enable row level security;
revoke all on public.whatsapp_message_outbox from public, anon, authenticated;
grant all on public.whatsapp_message_outbox to service_role;

create or replace function private.enqueue_sale_receipt_whatsapp(p_receipt_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_receipt public.order_receipts%rowtype;
  v_recipient record;
  v_items text;
  v_payment text;
  v_count integer := 0;
  v_body text;
begin
  select * into v_receipt from public.order_receipts where id=p_receipt_id;
  if not found then return 0; end if;

  select string_agg(
    coalesce(nullif(item->>'title',''),nullif(item->>'name',''),'بەرهەم')
    || ' × ' || coalesce(item->>'quantity','1')
    || case when nullif(item->>'variant','') is not null then ' ('||item->>'variant'||')' else '' end
    || ' — ' || to_char(coalesce(nullif(item->>'line_total_iqd','')::numeric,0),'FM999,999,999,999') || ' د.ع',
    E'\n'
  ) into v_items
  from jsonb_array_elements(v_receipt.item_lines) item;

  v_payment := case
    when v_receipt.payment_method in ('cash_on_delivery','cod') then 'کاش لە کاتی گەیاندن'
    when v_receipt.payment_method in ('mobile_cash','mobile_cash') then 'Mobile Cash'
    else coalesce(v_receipt.payment_method,'نەناسراو')
  end;

  v_body :=
    'SHAKH — وەسڵی فرۆشتن' || E'\n'
    || 'ژمارەی وەسڵ: ' || v_receipt.receipt_number || E'\n'
    || 'ژمارەی ئۆردەر: ' || v_receipt.order_number || E'\n'
    || 'کڕیار: ' || coalesce(v_receipt.buyer_name,'—') || E'\n'
    || 'مۆبایلی کڕیار: ' || coalesce(v_receipt.buyer_phone,'—') || E'\n'
    || 'بەرهەمەکان:' || E'\n' || coalesce(v_items,'—') || E'\n'
    || 'کۆی بەرهەم: ' || to_char(v_receipt.subtotal_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'کرێی گەیاندن: ' || to_char(v_receipt.delivery_fee_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'کرێی پلاتفۆرم: ' || to_char(v_receipt.platform_fee_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'کۆی گشتی: ' || to_char(v_receipt.total_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'شێوازی پارەدان: ' || v_payment || E'\n'
    || 'دۆخ: کڕیار ئۆردەرەکەی وەرگرتووە و فرۆشتن تەواو بووە.' || E'\n'
    || 'بەروار: ' || to_char(v_receipt.completed_at at time zone 'Asia/Baghdad','YYYY-MM-DD HH24:MI');

  for v_recipient in
    select pref.user_id,pref.phone_e164
    from public.whatsapp_delivery_preferences pref
    where pref.enabled and pref.phone_e164 is not null
      and (
        pref.user_id=v_receipt.seller_id
        or exists(
          select 1 from public.user_roles ur
          where ur.user_id=pref.user_id and ur.role::text='super_admin'
        )
      )
  loop
    insert into public.whatsapp_message_outbox(
      event_key,event_type,recipient_user_id,recipient_phone,receipt_id,message_body,metadata
    )
    values(
      'sale-receipt:'||v_receipt.id::text||':'||v_recipient.user_id::text,
      'sale_receipt',v_recipient.user_id,v_recipient.phone_e164,v_receipt.id,v_body,
      jsonb_build_object(
        'receipt_number',v_receipt.receipt_number,
        'order_number',v_receipt.order_number,
        'order_type',v_receipt.order_type,
        'seller_id',v_receipt.seller_id,
        'captain_id',v_receipt.captain_id,
        'total_iqd',v_receipt.total_iqd
      )
    )
    on conflict(event_key) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$function$;
revoke all on function private.enqueue_sale_receipt_whatsapp(uuid) from public, anon, authenticated;

create or replace function private.issue_direct_post_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_type text;
  v_order_number text;
  v_item_lines jsonb;
  v_receipt public.order_receipts%rowtype;
  v_buyer_name text;
  v_seller_name text;
  v_buyer_phone text;
  v_seller_phone text;
begin
  if new.delivery_status is distinct from 'delivered'
    or new.payment_status is distinct from 'collected' then
    return new;
  end if;

  v_type := case tg_table_name
    when 'food_post_orders' then 'food_post'
    when 'apparel_post_orders' then 'apparel_post'
    else 'product_post'
  end;
  v_order_number := new.order_number;

  if tg_table_name='food_post_orders' then
    v_item_lines:=jsonb_build_array(jsonb_build_object(
      'title',new.post_title,'quantity',new.quantity,'unit_price_iqd',round(new.unit_price_iqd)::bigint,
      'line_total_iqd',round(new.line_total_iqd)::bigint
    ));
  elsif tg_table_name='apparel_post_orders' then
    v_item_lines:=jsonb_build_array(jsonb_build_object(
      'title',new.post_title,'quantity',new.quantity,'unit_price_iqd',round(new.unit_price_iqd)::bigint,
      'line_total_iqd',round(new.line_total_iqd)::bigint,
      'variant',concat_ws(' / ',new.color_name,new.size_label)
    ));
  else
    v_item_lines:=jsonb_build_array(jsonb_build_object(
      'title',new.post_title,'quantity',new.quantity,'unit_price_iqd',round(new.unit_price_iqd)::bigint,
      'line_total_iqd',round(new.line_total_iqd)::bigint,
      'variant',coalesce(new.selected_color,'')
    ));
  end if;

  select full_name into v_buyer_name from public.profiles where id=new.buyer_id;
  select full_name into v_seller_name from public.profiles where id=new.seller_id;
  v_buyer_phone:=new.buyer_phone;
  select phone into v_seller_phone from public.profiles where id=new.seller_id;

  insert into public.order_receipts(
    receipt_number,order_type,order_id,order_number,buyer_id,seller_id,captain_id,
    buyer_name,buyer_phone,delivery_address,seller_name,seller_phone,item_lines,
    subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,total_iqd,payment_method,payment_status,
    completed_at,receipt_snapshot
  )
  values(
    'SH-'||to_char(now() at time zone 'Asia/Baghdad','YYYYMMDD')||'-'||upper(substr(gen_random_uuid()::text,1,8)),
    v_type,new.id,v_order_number,new.buyer_id,new.seller_id,new.captain_id,
    v_buyer_name,v_buyer_phone,new.delivery_address,v_seller_name,v_seller_phone,v_item_lines,
    round(new.line_total_iqd)::bigint,round(new.delivery_fee_iqd)::bigint,round(coalesce(new.platform_fee_iqd,0))::bigint,
    round(new.total_iqd)::bigint,new.payment_method,new.payment_status,
    coalesce(new.delivered_at,new.payment_collected_at,now()),
    jsonb_build_object(
      'delivery_city',new.delivery_city,'delivery_status',new.delivery_status,'status',new.status,
      'customer_note',new.customer_note,'created_at',new.created_at
    )
  )
  on conflict(order_type,order_id) do nothing
  returning * into v_receipt;

  if v_receipt.id is null then
    select * into v_receipt from public.order_receipts where order_type=v_type and order_id=new.id;
  end if;

  perform private.enqueue_sale_receipt_whatsapp(v_receipt.id);
  return new;
end;
$function$;
revoke all on function private.issue_direct_post_receipt() from public, anon, authenticated;

drop trigger if exists issue_food_post_receipt on public.food_post_orders;
create trigger issue_food_post_receipt
after update of status,delivery_status,payment_status on public.food_post_orders
for each row when (new.delivery_status='delivered' and new.payment_status='collected')
execute function private.issue_direct_post_receipt();

drop trigger if exists issue_apparel_post_receipt on public.apparel_post_orders;
create trigger issue_apparel_post_receipt
after update of status,delivery_status,payment_status on public.apparel_post_orders
for each row when (new.delivery_status='delivered' and new.payment_status='collected')
execute function private.issue_direct_post_receipt();

drop trigger if exists issue_product_post_receipt on public.electronics_post_orders;
create trigger issue_product_post_receipt
after update of status,delivery_status,payment_status on public.electronics_post_orders
for each row when (new.delivery_status='delivered' and new.payment_status='collected')
execute function private.issue_direct_post_receipt();

create or replace function private.issue_store_order_receipt_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_order public.orders%rowtype;
  v_store public.stores%rowtype;
  v_session public.checkout_sessions%rowtype;
  v_payment_status text;
  v_buyer_name text;
  v_buyer_phone text;
  v_captain_name text;
  v_captain_phone text;
  v_item_lines jsonb;
  v_receipt public.order_receipts%rowtype;
begin
  if new.status::text is distinct from 'delivered' then return new; end if;

  select * into v_order from public.orders where id=new.order_id;
  if not found then return new; end if;
  select * into v_store from public.stores where id=v_order.store_id;
  select * into v_session from public.checkout_sessions where id=v_order.checkout_session_id;
  select full_name,phone into v_buyer_name,v_buyer_phone from public.profiles where id=v_order.customer_id;
  select full_name,phone into v_captain_name,v_captain_phone from public.profiles where id=new.captain_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'title',i.product_name_ku,'quantity',i.quantity,'unit_price_iqd',round(i.unit_price_iqd)::bigint,
      'line_total_iqd',round(i.line_total_iqd)::bigint,
      'variant',coalesce(i.variant_name_ku_snapshot,'')
    ) order by i.created_at),
    '[]'::jsonb
  ) into v_item_lines from public.order_items i where i.order_id=v_order.id;

  select p.status::text into v_payment_status
  from public.payments p
  where p.checkout_session_id=v_order.checkout_session_id
  order by p.created_at desc limit 1;
  if v_session.payment_method::text='cash_on_delivery' then v_payment_status:='collected'; end if;

  insert into public.order_receipts(
    receipt_number,order_type,order_id,order_number,buyer_id,seller_id,captain_id,store_id,
    buyer_name,buyer_phone,delivery_address,seller_name,seller_phone,item_lines,
    subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,total_iqd,payment_method,payment_status,
    completed_at,receipt_snapshot
  )
  values(
    'SH-'||to_char(now() at time zone 'Asia/Baghdad','YYYYMMDD')||'-'||upper(substr(gen_random_uuid()::text,1,8)),
    'store_order',v_order.id,v_order.order_number,v_order.customer_id,v_store.owner_id,new.captain_id,v_order.store_id,
    v_buyer_name,v_buyer_phone,v_order.delivery_address,
    coalesce(v_store.name_ku,v_store.name_en), (select phone from public.profiles where id=v_store.owner_id),
    v_item_lines,round(v_order.subtotal_iqd)::bigint,round(v_order.delivery_fee_iqd)::bigint,
    round(coalesce(v_order.platform_fee_iqd,0))::bigint,round(v_order.total_iqd)::bigint,
    v_session.payment_method::text,coalesce(v_payment_status,'pending'),coalesce(new.delivered_at,now()),
    jsonb_build_object('store_name',v_store.name_ku,'customer_note',v_order.customer_note,
      'delivery_city',v_session.delivery_city,'captain_name',v_captain_name,'captain_phone',v_captain_phone)
  )
  on conflict(order_type,order_id) do nothing
  returning * into v_receipt;

  if v_receipt.id is null then
    select * into v_receipt from public.order_receipts where order_type='store_order' and order_id=v_order.id;
  end if;
  perform private.enqueue_sale_receipt_whatsapp(v_receipt.id);
  return new;
end;
$function$;
revoke all on function private.issue_store_order_receipt_on_delivery() from public, anon, authenticated;

drop trigger if exists zzzz_issue_store_order_receipt on public.deliveries;
create trigger zzzz_issue_store_order_receipt
after update of status on public.deliveries
for each row when (new.status::text='delivered')
execute function private.issue_store_order_receipt_on_delivery();

create or replace function private.seller_for_cash_ledger(p_order_type text,p_order_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare v_seller uuid;
begin
  if p_order_type='store_delivery' then
    select s.owner_id into v_seller from public.deliveries d join public.orders o on o.id=d.order_id join public.stores s on s.id=o.store_id where d.id=p_order_id;
  elsif p_order_type='food_post' then
    select seller_id into v_seller from public.food_post_orders where id=p_order_id;
  elsif p_order_type='apparel_post' then
    select seller_id into v_seller from public.apparel_post_orders where id=p_order_id;
  elsif p_order_type='product_post' then
    select seller_id into v_seller from public.electronics_post_orders where id=p_order_id;
  end if;
  return v_seller;
end;
$function$;
revoke all on function private.seller_for_cash_ledger(text,uuid) from public, anon, authenticated;

create or replace function private.notify_captain_cash_return_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_batch public.captain_cash_settlement_batches%rowtype;
  v_captain_name text;
  v_seller record;
  v_admin record;
  v_preference record;
  v_current_seller_return bigint;
  v_seller_total_collected bigint;
  v_seller_total_returned bigint;
  v_seller_remaining bigint;
  v_total_collected bigint;
  v_total_returned bigint;
  v_remaining bigint;
  v_admin_body text;
  v_seller_body text;
begin
  select * into v_batch from public.captain_cash_settlement_batches where id=new.batch_id;
  if not found then return new; end if;
  select full_name into v_captain_name from public.profiles where id=v_batch.captain_id;

  -- Seller-specific cumulative ledger summary: every message includes prior returns,
  -- this batch's return, cumulative remitted cash, and the remaining balance.
  for v_seller in
    select distinct private.seller_for_cash_ledger(l.order_type,l.order_id) as seller_id
    from public.captain_cash_settlement_items i
    join public.captain_cash_ledger l on l.id=i.ledger_id
    where i.batch_id=v_batch.id
      and private.seller_for_cash_ledger(l.order_type,l.order_id) is not null
  loop
    select
      coalesce(sum(l.cash_collected_iqd),0)::bigint,
      coalesce(sum(l.cash_remitted_iqd),0)::bigint,
      coalesce(sum(greatest(0,l.cash_collected_iqd-l.cash_remitted_iqd)),0)::bigint
    into v_seller_total_collected,v_seller_total_returned,v_seller_remaining
    from public.captain_cash_ledger l
    where l.captain_id=v_batch.captain_id
      and private.seller_for_cash_ledger(l.order_type,l.order_id)=v_seller.seller_id;

    select coalesce(sum(i.amount_iqd),0)::bigint into v_current_seller_return
    from public.captain_cash_settlement_items i
    join public.captain_cash_ledger l on l.id=i.ledger_id
    where i.batch_id=v_batch.id
      and private.seller_for_cash_ledger(l.order_type,l.order_id)=v_seller.seller_id;

    v_seller_body:=
      'SHAKH — تۆماری ڕادەستکردنی پارە' || E'\n'
      || 'کاپتن: '||coalesce(v_captain_name,'—')||E'\n'
      || 'وەسڵی مامەڵە: '||v_batch.id::text||E'\n'
      || 'پارەی ئەمجار: '||to_char(v_current_seller_return,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'کۆی پێشتر و ئەمجار ڕادەستکراو: '||to_char(v_seller_total_returned,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'کۆی کاشی وەرگیراو: '||to_char(v_seller_total_collected,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'پارەی ماوە بۆ ڕادەستکردن: '||to_char(v_seller_remaining,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'ئەم ڕاپۆرتە کۆی مامەڵەکانی پێشوو و ئەم گواستنەوەیە لەخۆدەگرێت.';

    for v_preference in
      select pref.user_id,pref.phone_e164
      from public.whatsapp_delivery_preferences pref
      where pref.enabled and pref.phone_e164 is not null
        and (pref.user_id=v_seller.seller_id or exists(
          select 1 from public.user_roles ur where ur.user_id=pref.user_id and ur.role::text='super_admin'
        ))
    loop
      insert into public.whatsapp_message_outbox(
        event_key,event_type,recipient_user_id,recipient_phone,settlement_batch_id,message_body,metadata
      ) values(
        'cash-return:'||v_batch.id::text||':seller:'||v_seller.seller_id::text||':user:'||v_preference.user_id::text,
        'cash_return',v_preference.user_id,v_preference.phone_e164,null,v_seller_body,
        jsonb_build_object('batch_id',v_batch.id,'captain_id',v_batch.captain_id,'seller_id',v_seller.seller_id,
          'current_return_iqd',v_current_seller_return,'cumulative_returned_iqd',v_seller_total_returned,
          'collected_iqd',v_seller_total_collected,'remaining_iqd',v_seller_remaining)
      ) on conflict(event_key) do nothing;
    end loop;
  end loop;

  select
    coalesce(sum(l.cash_collected_iqd),0)::bigint,
    coalesce(sum(l.cash_remitted_iqd),0)::bigint,
    coalesce(sum(greatest(0,l.cash_collected_iqd-l.cash_remitted_iqd)),0)::bigint
  into v_total_collected,v_total_returned,v_remaining
  from public.captain_cash_ledger l
  where l.captain_id=v_batch.captain_id;

  v_admin_body:=
    'SHAKH — کورتەی ڕادەستکردنی کاش' || E'\n'
    || 'کاپتن: '||coalesce(v_captain_name,'—')||E'\n'
    || 'ژمارەی مامەڵە: '||v_batch.id::text||E'\n'
    || 'پارەی ئەمجار: '||to_char(v_batch.amount_iqd,'FM999,999,999,999')||' د.ع'||E'\n'
    || 'کۆی گشتی پارەی وەرگیراو: '||to_char(v_total_collected,'FM999,999,999,999')||' د.ع'||E'\n'
    || 'کۆی پێشتر و ئەمجار ڕادەستکراو: '||to_char(v_total_returned,'FM999,999,999,999')||' د.ع'||E'\n'
    || 'پارەی ماوە بۆ ڕادەستکردن: '||to_char(v_remaining,'FM999,999,999,999')||' د.ع';

  for v_admin in
    select pref.user_id,pref.phone_e164
    from public.whatsapp_delivery_preferences pref
    join public.user_roles ur on ur.user_id=pref.user_id
    where pref.enabled and pref.phone_e164 is not null and ur.role::text='super_admin'
  loop
    insert into public.whatsapp_message_outbox(
      event_key,event_type,recipient_user_id,recipient_phone,settlement_batch_id,message_body,metadata
    ) values(
      'cash-return:'||v_batch.id::text||':admin:'||v_admin.user_id::text,
      'cash_return',v_admin.user_id,v_admin.phone_e164,v_batch.id,v_admin_body,
      jsonb_build_object('batch_id',v_batch.id,'captain_id',v_batch.captain_id,
        'current_return_iqd',v_batch.amount_iqd,'cumulative_returned_iqd',v_total_returned,
        'collected_iqd',v_total_collected,'remaining_iqd',v_remaining)
    ) on conflict(event_key) do nothing;
  end loop;
  return new;
end;
$function$;
revoke all on function private.notify_captain_cash_return_whatsapp() from public, anon, authenticated;

drop trigger if exists whatsapp_notify_captain_cash_return on public.captain_cash_settlement_items;
create constraint trigger whatsapp_notify_captain_cash_return
after insert on public.captain_cash_settlement_items
deferrable initially deferred
for each row execute function private.notify_captain_cash_return_whatsapp();
