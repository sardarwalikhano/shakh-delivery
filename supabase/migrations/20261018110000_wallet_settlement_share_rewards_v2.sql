-- Complete the wallet accounting core without dropping existing order/wallet data.
-- Existing share links are preserved, but each new share receives a fresh 24-hour token.

alter table public.post_share_links
  add column if not exists expires_at timestamptz;

update public.post_share_links
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.post_share_links
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null;

alter table public.post_share_links
  drop constraint if exists post_share_links_post_id_sharer_id_key;

create index if not exists post_share_links_active_expiry_idx
  on public.post_share_links(post_id, sharer_id, expires_at desc)
  where is_active = true;

create or replace function public.create_post_share_link(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_author_id uuid;
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required to create an earning share link';
  end if;
  select p.author_id into v_author_id
  from public.posts p
  where p.id=p_post_id and p.status='active'::public.post_status
  for share;
  if not found then raise exception using errcode='P0002', message='This post is not available to share'; end if;
  if v_author_id=v_user_id then
    raise exception using errcode='42501', message='Post owners cannot earn by sharing their own post';
  end if;
  insert into public.post_share_links(post_id,sharer_id,is_active,expires_at)
  values(p_post_id,v_user_id,true,now()+interval '24 hours')
  returning id into v_link_id;
  return v_link_id;
end;
$function$;
revoke all on function public.create_post_share_link(uuid) from public, anon;
grant execute on function public.create_post_share_link(uuid) to authenticated;

alter table public.share_earnings drop constraint if exists share_earnings_order_type_check;
alter table public.share_earnings add constraint share_earnings_order_type_check
  check (order_type in ('food_post','apparel_post','electronics_post','product_post'));

alter table public.prepaid_wallet_transactions
  drop constraint if exists prepaid_wallet_transactions_transaction_type_check;
alter table public.prepaid_wallet_transactions
  add constraint prepaid_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'topup_approved','spend','spend_refund','admin_adjustment','hold','hold_release',
    'seller_share_reward','captain_delivery_commission','cod_settlement'
  ));

create table if not exists public.seller_share_reward_holds (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete restrict,
  order_type text not null check (order_type in ('food_post','apparel_post','electronics_post','product_post')),
  order_id uuid not null,
  reward_iqd bigint not null check (reward_iqd > 0),
  status text not null default 'reserved' check (status in ('reserved','paid','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(order_type,order_id)
);
create index if not exists seller_share_reward_holds_seller_status_idx
  on public.seller_share_reward_holds(seller_id,status,created_at desc);
alter table public.seller_share_reward_holds enable row level security;
drop policy if exists seller_share_reward_holds_select_scoped on public.seller_share_reward_holds;
create policy seller_share_reward_holds_select_scoped on public.seller_share_reward_holds
  for select to authenticated using (seller_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));
revoke insert,update,delete on public.seller_share_reward_holds from anon,authenticated;

create table if not exists public.captain_delivery_commission_holds (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references auth.users(id) on delete restrict,
  order_type text not null check (order_type in ('store_delivery','food_post')),
  order_id uuid not null,
  delivery_fee_iqd bigint not null check(delivery_fee_iqd >= 0),
  commission_iqd bigint not null check(commission_iqd >= 0),
  status text not null default 'reserved' check(status in ('reserved','charged','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(order_type,order_id)
);
create index if not exists captain_commission_holds_captain_status_idx
  on public.captain_delivery_commission_holds(captain_id,status,created_at desc);

create table if not exists public.captain_delivery_earnings (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references auth.users(id) on delete restrict,
  order_type text not null check(order_type in ('store_delivery','food_post')),
  order_id uuid not null,
  delivery_fee_iqd bigint not null check(delivery_fee_iqd >= 0),
  commission_iqd bigint not null check(commission_iqd >= 0),
  net_earning_iqd bigint not null check(net_earning_iqd >= 0),
  earning_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  created_at timestamptz not null default now(),
  unique(order_type,order_id),
  check(net_earning_iqd = greatest(0,delivery_fee_iqd-commission_iqd))
);
create index if not exists captain_delivery_earnings_captain_day_idx
  on public.captain_delivery_earnings(captain_id,earning_day desc);

create table if not exists public.captain_cash_settlements (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references auth.users(id) on delete restrict,
  amount_iqd bigint not null check(amount_iqd > 0),
  received_by uuid not null references auth.users(id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists captain_cash_settlements_captain_created_idx
  on public.captain_cash_settlements(captain_id,created_at desc);

create table if not exists public.captain_cash_settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.captain_cash_settlements(id) on delete restrict,
  cash_ledger_id uuid not null references public.captain_cash_ledger(id) on delete restrict,
  amount_iqd bigint not null check(amount_iqd > 0),
  created_at timestamptz not null default now(),
  unique(settlement_id,cash_ledger_id)
);

alter table public.captain_delivery_commission_holds enable row level security;
alter table public.captain_delivery_earnings enable row level security;
alter table public.captain_cash_settlements enable row level security;
alter table public.captain_cash_settlement_allocations enable row level security;

drop policy if exists captain_commission_holds_select_scoped on public.captain_delivery_commission_holds;
create policy captain_commission_holds_select_scoped on public.captain_delivery_commission_holds
  for select to authenticated using (captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));
drop policy if exists captain_delivery_earnings_select_scoped on public.captain_delivery_earnings;
create policy captain_delivery_earnings_select_scoped on public.captain_delivery_earnings
  for select to authenticated using (captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));
drop policy if exists captain_cash_settlements_select_scoped on public.captain_cash_settlements;
create policy captain_cash_settlements_select_scoped on public.captain_cash_settlements
  for select to authenticated using (captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));
drop policy if exists captain_cash_allocations_select_scoped on public.captain_cash_settlement_allocations;
create policy captain_cash_allocations_select_scoped on public.captain_cash_settlement_allocations
  for select to authenticated using (exists (
    select 1 from public.captain_cash_settlements s where s.id=settlement_id
      and (s.captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')))
  ));
revoke insert,update,delete on public.captain_delivery_commission_holds from anon,authenticated;
revoke insert,update,delete on public.captain_delivery_earnings from anon,authenticated;
revoke insert,update,delete on public.captain_cash_settlements from anon,authenticated;
revoke insert,update,delete on public.captain_cash_settlement_allocations from anon,authenticated;

alter table public.share_withdrawal_requests
  add column if not exists payout_receipt_path text;

-- Make uploaded payout receipts readable by their owner and permitted finance staff.
drop policy if exists wallet_receipts_insert_own on storage.objects;
create policy wallet_receipts_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id='wallet-payment-receipts'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or (select private.has_permission('wallets.manage'))
    or (select private.has_permission('share_rewards.manage'))
  )
);

create or replace function private.reserve_seller_share_reward_before_order()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_link public.post_share_links%rowtype;
  v_balance bigint;
  v_held bigint;
  v_reward bigint;
  v_type text;
begin
  v_type:=case tg_table_name
    when 'food_post_orders' then 'food_post'
    when 'apparel_post_orders' then 'apparel_post'
    else case when coalesce(new.post_category::text,'electronics')='electronics' then 'electronics_post' else 'product_post' end
  end;
  if new.share_link_id is null or coalesce(new.share_reward_iqd,0)<=0 then
    new.share_link_id:=null;
    new.share_reward_iqd:=0;
    return new;
  end if;

  select * into v_link from public.post_share_links l
  where l.id=new.share_link_id and l.post_id=new.post_id and l.is_active=true and l.expires_at>now();
  if not found or v_link.sharer_id=new.buyer_id or v_link.sharer_id=new.seller_id then
    new.share_link_id:=null;
    new.share_reward_iqd:=0;
    return new;
  end if;
  if exists(select 1 from public.posts p where p.id=new.post_id and p.author_id=v_link.sharer_id) then
    new.share_link_id:=null;
    new.share_reward_iqd:=0;
    return new;
  end if;

  -- Seller configures the reward per item; the order snapshot is per quantity.
  v_reward:=round(new.share_reward_iqd*greatest(1,new.quantity),0)::bigint;
  if v_reward<=0 then
    new.share_link_id:=null;
    new.share_reward_iqd:=0;
    return new;
  end if;

  insert into public.prepaid_wallet_accounts(user_id) values(new.seller_id) on conflict(user_id) do nothing;
  select balance_iqd,held_iqd into v_balance,v_held
  from public.prepaid_wallet_accounts where user_id=new.seller_id for update;
  if v_balance-v_held<v_reward then
    raise exception using errcode='22023',
      message='فرۆشیار باڵانسی پریپەیدی بەشی پاداشتی شێرکردنی ئەم داواکارییەی نییە؛ پێویستە جزدانەکەی پڕ بکاتەوە.';
  end if;

  update public.prepaid_wallet_accounts set held_iqd=held_iqd+v_reward,updated_at=now() where user_id=new.seller_id;
  insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku,created_by)
  values(new.seller_id,'hold',v_reward,'share_reward_order',new.id,'پارەی پاداشتی شێرکردن تا تەواوبوونی ئۆردەر گیرا',new.buyer_id);
  insert into public.seller_share_reward_holds(seller_id,order_type,order_id,reward_iqd)
  values(new.seller_id,v_type,new.id,v_reward);
  new.share_reward_iqd:=v_reward;
  return new;
end;
$function$;
revoke all on function private.reserve_seller_share_reward_before_order() from public,anon,authenticated;

create trigger zzz_reserve_food_share_reward
before insert on public.food_post_orders
for each row execute function private.reserve_seller_share_reward_before_order();
create trigger zzz_reserve_apparel_share_reward
before insert on public.apparel_post_orders
for each row execute function private.reserve_seller_share_reward_before_order();
create trigger zzz_reserve_electronics_share_reward
before insert on public.electronics_post_orders
for each row execute function private.reserve_seller_share_reward_before_order();

create or replace function private.settle_seller_share_reward_after_order()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_type text;
  v_complete boolean:=false;
  v_cancelled boolean:=false;
  v_hold public.seller_share_reward_holds%rowtype;
  v_balance bigint;
begin
  v_type:=case tg_table_name
    when 'food_post_orders' then 'food_post'
    when 'apparel_post_orders' then 'apparel_post'
    else case when coalesce(new.post_category::text,'electronics')='electronics' then 'electronics_post' else 'product_post' end
  end;

  if tg_table_name='food_post_orders' then
    v_complete:=new.status='delivered' and new.payment_status='collected';
    v_cancelled:=new.status in ('cancelled','rejected') or new.delivery_status in ('cancelled','failed');
  elsif tg_table_name='apparel_post_orders' then
    v_complete:=new.status='delivered';
    v_cancelled:=new.status in ('cancelled','rejected');
  else
    v_complete:=new.status='delivered' and new.payment_status='collected';
    v_cancelled:=new.status in ('cancelled','rejected');
  end if;
  if not v_complete and not v_cancelled then return new; end if;

  select * into v_hold from public.seller_share_reward_holds
  where order_type=v_type and order_id=new.id for update;
  if not found or v_hold.status<>'reserved' then return new; end if;

  if v_complete then
    update public.prepaid_wallet_accounts
    set balance_iqd=balance_iqd-v_hold.reward_iqd,
        held_iqd=held_iqd-v_hold.reward_iqd,
        lifetime_spent_iqd=lifetime_spent_iqd+v_hold.reward_iqd,
        updated_at=now()
    where user_id=v_hold.seller_id and balance_iqd>=v_hold.reward_iqd and held_iqd>=v_hold.reward_iqd
    returning balance_iqd into v_balance;
    if not found then raise exception 'Seller reward reservation is inconsistent; order completion was rolled back'; end if;
    insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
    values(v_hold.seller_id,'seller_share_reward',v_hold.reward_iqd,v_hold.order_type,v_hold.order_id,'پاداشتی شێرکردن لە فرۆشیار کەمکراوە');
    update public.seller_share_reward_holds set status='paid',settled_at=now() where id=v_hold.id;
  else
    update public.prepaid_wallet_accounts set held_iqd=held_iqd-v_hold.reward_iqd,updated_at=now()
    where user_id=v_hold.seller_id and held_iqd>=v_hold.reward_iqd;
    if not found then raise exception 'Seller reward hold is inconsistent; cancellation was rolled back'; end if;
    insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
    values(v_hold.seller_id,'hold_release',v_hold.reward_iqd,v_hold.order_type,v_hold.order_id,'پاداشتی شێرکردن بەهۆی هەڵوەشاندنەوەی ئۆردەر ئازادکرا');
    update public.seller_share_reward_holds set status='released',settled_at=now() where id=v_hold.id;
  end if;
  return new;
end;
$function$;
revoke all on function private.settle_seller_share_reward_after_order() from public,anon,authenticated;

create trigger zzz_settle_food_share_reward
after update of status,payment_status,delivery_status on public.food_post_orders
for each row execute function private.settle_seller_share_reward_after_order();
create trigger zzz_settle_apparel_share_reward
after update of status on public.apparel_post_orders
for each row execute function private.settle_seller_share_reward_after_order();
create trigger zzz_settle_electronics_share_reward
after update of status,payment_status on public.electronics_post_orders
for each row execute function private.settle_seller_share_reward_after_order();

create or replace function private.reserve_captain_delivery_commission_before()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_type text;
  v_id uuid;
  v_captain uuid;
  v_old_captain uuid;
  v_fee bigint:=0;
  v_commission bigint:=0;
  v_balance bigint;
  v_held bigint;
  v_hold public.captain_delivery_commission_holds%rowtype;
  v_terminal boolean:=false;
  v_start boolean:=false;
begin
  if tg_table_name='deliveries' then
    v_type:='store_delivery'; v_id:=new.id; v_captain:=new.captain_id;
    v_fee:=coalesce((select round(o.delivery_fee_iqd,0)::bigint from public.orders o where o.id=new.order_id),0);
    v_terminal:=new.status::text in ('failed','cancelled');
    if tg_op='UPDATE' then v_old_captain:=old.captain_id; end if;
  else
    v_type:='food_post'; v_id:=new.id; v_captain:=new.captain_id;
    v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
    if tg_op='UPDATE' then v_old_captain:=old.captain_id; end if;
  end if;

  v_start:=(tg_op='INSERT' and v_captain is not null)
       or (tg_op='UPDATE' and v_old_captain is distinct from v_captain and v_captain is not null);

  if v_start then
    select * into v_hold from public.captain_delivery_commission_holds where order_type=v_type and order_id=v_id for update;
    if found and v_hold.status='charged' then raise exception 'A completed delivery cannot be reassigned'; end if;
    if found and v_hold.status='reserved' then
      update public.prepaid_wallet_accounts set held_iqd=held_iqd-v_hold.commission_iqd,updated_at=now()
      where user_id=v_hold.captain_id and held_iqd>=v_hold.commission_iqd;
      if not found then raise exception 'Captain commission reservation is inconsistent'; end if;
      insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
      values(v_hold.captain_id,'hold_release',v_hold.commission_iqd,v_type,v_id,'کۆمسیۆنی کاپتنی پێشوو ئازادکرا');
      update public.captain_delivery_commission_holds set status='released',settled_at=now() where id=v_hold.id;
    end if;
    v_commission:=round(v_fee*0.20,0)::bigint;
    insert into public.prepaid_wallet_accounts(user_id) values(v_captain) on conflict(user_id) do nothing;
    select balance_iqd,held_iqd into v_balance,v_held from public.prepaid_wallet_accounts where user_id=v_captain for update;
    if v_balance-v_held<v_commission then
      raise exception using errcode='22023',message='باڵانسی پریپەیدی کاپتن بۆ کۆمسیۆنی ئەم گەیاندنە بەس نییە؛ پێش وەرگرتنی ئۆردەر جزدانەکە پڕ بکەرەوە.';
    end if;
    if v_commission>0 then
      update public.prepaid_wallet_accounts set held_iqd=held_iqd+v_commission,updated_at=now() where user_id=v_captain;
      insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
      values(v_captain,'hold',v_commission,v_type,v_id,'٢٠٪ی کۆمسیۆنی گەیاندن تا تەواوبوونی ئۆردەر گیرا');
    end if;
    insert into public.captain_delivery_commission_holds(captain_id,order_type,order_id,delivery_fee_iqd,commission_iqd,status)
    values(v_captain,v_type,v_id,v_fee,v_commission,'reserved')
    on conflict(order_type,order_id) do update set captain_id=excluded.captain_id,delivery_fee_iqd=excluded.delivery_fee_iqd,commission_iqd=excluded.commission_iqd,status='reserved',created_at=now(),settled_at=null;
    return new;
  end if;

  if v_terminal or v_captain is null then
    select * into v_hold from public.captain_delivery_commission_holds where order_type=v_type and order_id=v_id for update;
    if found and v_hold.status='reserved' then
      update public.prepaid_wallet_accounts set held_iqd=held_iqd-v_hold.commission_iqd,updated_at=now()
      where user_id=v_hold.captain_id and held_iqd>=v_hold.commission_iqd;
      if not found then raise exception 'Captain commission reservation is inconsistent'; end if;
      if v_hold.commission_iqd>0 then
        insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
        values(v_hold.captain_id,'hold_release',v_hold.commission_iqd,v_type,v_id,'کۆمسیۆنی گەیاندنی هەڵوەشاوە ئازادکرا');
      end if;
      update public.captain_delivery_commission_holds set status='released',settled_at=now() where id=v_hold.id;
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.reserve_captain_delivery_commission_before() from public,anon,authenticated;

create trigger captain_commission_reserve_store_delivery
before insert or update of captain_id,status on public.deliveries
for each row execute function private.reserve_captain_delivery_commission_before();
create trigger captain_commission_reserve_food_order
before insert or update of captain_id,delivery_status,status on public.food_post_orders
for each row execute function private.reserve_captain_delivery_commission_before();

create or replace function private.finalize_captain_delivery_commission()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_type text;
  v_id uuid;
  v_captain uuid;
  v_fee bigint:=0;
  v_commission bigint:=0;
  v_balance bigint;
  v_hold public.captain_delivery_commission_holds%rowtype;
  v_order public.orders%rowtype;
  v_payment_method text;
begin
  if tg_table_name='deliveries' then
    if new.status::text<>'delivered' or old.status::text='delivered' then return new; end if;
    v_type:='store_delivery'; v_id:=new.id; v_captain:=new.captain_id;
    select * into v_order from public.orders where id=new.order_id;
    v_fee:=round(coalesce(v_order.delivery_fee_iqd,0))::bigint;
    select cs.payment_method::text into v_payment_method from public.checkout_sessions cs where cs.id=v_order.checkout_session_id;
  else
    if new.delivery_status<>'delivered' or old.delivery_status='delivered' then return new; end if;
    v_type:='food_post'; v_id:=new.id; v_captain:=new.captain_id;
    v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
  end if;
  if v_captain is null then return new; end if;

  select * into v_hold from public.captain_delivery_commission_holds where order_type=v_type and order_id=v_id for update;
  if found and v_hold.status='reserved' then
    v_commission:=v_hold.commission_iqd;
    update public.prepaid_wallet_accounts
    set balance_iqd=balance_iqd-v_commission,held_iqd=held_iqd-v_commission,
        lifetime_spent_iqd=lifetime_spent_iqd+v_commission,updated_at=now()
    where user_id=v_captain and balance_iqd>=v_commission and held_iqd>=v_commission
    returning balance_iqd into v_balance;
    if not found then raise exception 'Captain commission reservation is inconsistent; delivery completion was rolled back'; end if;
    if v_commission>0 then
      insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
      values(v_captain,'captain_delivery_commission',v_commission,v_type,v_id,'کۆمسیۆنی ٢٠٪ی گەیاندن لە جزدانی کاپتن کەمکراوە');
    end if;
    update public.captain_delivery_commission_holds set status='charged',settled_at=now() where id=v_hold.id;
  else
    v_commission:=0;
  end if;

  insert into public.captain_delivery_earnings(captain_id,order_type,order_id,delivery_fee_iqd,commission_iqd,net_earning_iqd,earning_day)
  values(v_captain,v_type,v_id,v_fee,v_commission,greatest(0,v_fee-v_commission),(now() at time zone 'Asia/Baghdad')::date)
  on conflict(order_type,order_id) do nothing;

  if tg_table_name='deliveries' and v_payment_method='cash_on_delivery' then
    insert into public.captain_cash_ledger(captain_id,order_id,product_subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,cash_collected_iqd,idempotency_key,note)
    values(v_captain,v_order.id,round(v_order.subtotal_iqd)::bigint,round(v_order.delivery_fee_iqd)::bigint,round(coalesce(v_order.platform_fee_iqd,0))::bigint,
      round(v_order.total_iqd)::bigint,'store_delivery:'||new.id::text,'COD collected when delivery marked delivered')
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.finalize_captain_delivery_commission() from public,anon,authenticated;

create trigger zzz_finalize_store_delivery_finance
after update of status on public.deliveries
for each row execute function private.finalize_captain_delivery_commission();
create trigger zzz_finalize_food_post_delivery_finance
after update of delivery_status on public.food_post_orders
for each row execute function private.finalize_captain_delivery_commission();

create or replace function private.record_food_post_cod_collection()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  if new.payment_status='collected' and old.payment_status is distinct from 'collected'
     and new.payment_method='cash_on_delivery' and new.delivery_status='delivered' and new.captain_id is not null then
    insert into public.captain_cash_ledger(captain_id,order_id,product_subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,cash_collected_iqd,idempotency_key,note)
    values(new.captain_id,new.id,round(new.line_total_iqd)::bigint,round(new.delivery_fee_iqd)::bigint,
      round(coalesce(new.platform_fee_iqd,0))::bigint,round(new.total_iqd)::bigint,
      'food_post:'||new.id::text,'COD collected for completed food-post delivery')
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.record_food_post_cod_collection() from public,anon,authenticated;
create trigger zzz_record_food_post_cod_collection
after update of payment_status on public.food_post_orders
for each row execute function private.record_food_post_cod_collection();


create or replace function public.get_captain_cash_balances()
returns table(captain_id uuid,outstanding_iqd bigint,collected_iqd bigint,remitted_iqd bigint,last_collected_at timestamptz)
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not private.has_permission('wallets.manage') then
    return query
    select l.captain_id,
      coalesce(sum(l.cash_collected_iqd-l.cash_remitted_iqd),0)::bigint,
      coalesce(sum(l.cash_collected_iqd),0)::bigint,
      coalesce(sum(l.cash_remitted_iqd),0)::bigint,
      max(l.collected_at)
    from public.captain_cash_ledger l
    where l.captain_id=auth.uid()
    group by l.captain_id;
  else
    return query
    select l.captain_id,
      coalesce(sum(l.cash_collected_iqd-l.cash_remitted_iqd),0)::bigint,
      coalesce(sum(l.cash_collected_iqd),0)::bigint,
      coalesce(sum(l.cash_remitted_iqd),0)::bigint,
      max(l.collected_at)
    from public.captain_cash_ledger l
    group by l.captain_id;
  end if;
end;
$function$;
revoke all on function public.get_captain_cash_balances() from public,anon;
grant execute on function public.get_captain_cash_balances() to authenticated;

create or replace function public.settle_captain_cash(
  p_captain_id uuid,
  p_amount_iqd bigint,
  p_note text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_settlement_id uuid;
  v_remaining bigint;
  v_due bigint;
  v_apply bigint;
  v_row public.captain_cash_ledger%rowtype;
  v_outstanding bigint;
begin
  if auth.uid() is null or not private.has_permission('wallets.manage') then
    raise exception using errcode='42501',message='Only the Super Admin may settle captain COD cash';
  end if;
  if p_captain_id is null or p_amount_iqd is null or p_amount_iqd<=0 or p_amount_iqd>10000000000 then
    raise exception using errcode='22023',message='Settlement amount is invalid';
  end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Settlement note is too long'; end if;
  select coalesce(sum(cash_collected_iqd-cash_remitted_iqd),0)::bigint into v_outstanding
  from public.captain_cash_ledger where captain_id=p_captain_id;
  if p_amount_iqd>v_outstanding then
    raise exception using errcode='22023',message='Settlement is greater than the captain outstanding cash balance';
  end if;
  insert into public.captain_cash_settlements(captain_id,amount_iqd,received_by,note)
  values(p_captain_id,p_amount_iqd,auth.uid(),nullif(btrim(p_note),'')) returning id into v_settlement_id;
  v_remaining:=p_amount_iqd;
  for v_row in
    select * from public.captain_cash_ledger
    where captain_id=p_captain_id and cash_collected_iqd>cash_remitted_iqd
    order by collected_at,id for update
  loop
    exit when v_remaining<=0;
    v_due:=v_row.cash_collected_iqd-v_row.cash_remitted_iqd;
    v_apply:=least(v_due,v_remaining);
    update public.captain_cash_ledger
    set cash_remitted_iqd=cash_remitted_iqd+v_apply,
        status=case when cash_remitted_iqd+v_apply>=cash_collected_iqd then 'settled'
                    else 'partially_remitted' end,
        settled_at=case when cash_remitted_iqd+v_apply>=cash_collected_iqd then now() else null end,
        settled_by=auth.uid()
    where id=v_row.id;
    insert into public.captain_cash_settlement_allocations(settlement_id,cash_ledger_id,amount_iqd)
    values(v_settlement_id,v_row.id,v_apply);
    v_remaining:=v_remaining-v_apply;
  end loop;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(auth.uid(),'captain_cash.settled','captain_cash_settlement',v_settlement_id::text,
    jsonb_build_object('captain_id',p_captain_id,'amount_iqd',p_amount_iqd));
  select coalesce(sum(cash_collected_iqd-cash_remitted_iqd),0)::bigint into v_outstanding
  from public.captain_cash_ledger where captain_id=p_captain_id;
  return jsonb_build_object('settlement_id',v_settlement_id,'captain_id',p_captain_id,'settled_iqd',p_amount_iqd,'outstanding_iqd',v_outstanding);
end;
$function$;
revoke all on function public.settle_captain_cash(uuid,bigint,text) from public,anon;
grant execute on function public.settle_captain_cash(uuid,bigint,text) to authenticated;

-- Payout proof is mandatory for marking Share & Earn withdrawals as paid.
create or replace function public.review_share_withdrawal(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null,
  p_payout_reference text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
begin
  if p_action='paid' then
    raise exception using errcode='22023',message='Upload the payment receipt and use review_share_withdrawal_with_receipt';
  end if;
  if p_action<>'rejected' then raise exception using errcode='22023',message='Action must be paid or rejected'; end if;
  return public.review_share_withdrawal_legacy_reject(p_request_id,p_admin_note);
end;
$function$;

create or replace function public.review_share_withdrawal_legacy_reject(
  p_request_id uuid,
  p_admin_note text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_request public.share_withdrawal_requests%rowtype;
  v_balance bigint;
begin
  if v_user_id is null or not private.has_permission('share_rewards.manage') then raise exception using errcode='42501',message='Super Admin permission required'; end if;
  select * into v_request from public.share_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if v_request.status<>'pending' then raise exception 'This withdrawal request has already been processed'; end if;
  update public.share_wallet_accounts set balance_iqd=balance_iqd+v_request.amount_iqd,updated_at=now()
  where user_id=v_request.user_id returning balance_iqd into v_balance;
  update public.share_withdrawal_requests set status='rejected',admin_note=nullif(btrim(p_admin_note),''),reviewed_by=v_user_id,reviewed_at=now()
  where id=v_request.id returning * into v_request;
  insert into public.share_wallet_transactions(user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description)
  values(v_request.user_id,'withdrawal_refund',v_request.amount_iqd,v_balance,'withdrawal_request',v_request.id,'Funds returned because the withdrawal was rejected');
  insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
  values(v_request.user_id,'share_withdrawal_status','داواکاریی ڕاکێشان ڕەتکرایەوە','بڕی داواکراو گەڕێندرایەوە بۆ باڵانسی خەڵات.',
    'تحديث طلب السحب','تم رفض طلب السحب.','Withdrawal request rejected','Your withdrawal request was rejected.',
    '/dashboard/referral-wallet','share_withdrawal_request',v_request.id,jsonb_build_object('status','rejected','amount_iqd',v_request.amount_iqd));
  return jsonb_build_object('id',v_request.id,'amount_iqd',v_request.amount_iqd,'status','rejected');
end;
$function$;

create or replace function public.review_share_withdrawal_with_receipt(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null,
  p_payout_reference text default null,
  p_receipt_path text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_request public.share_withdrawal_requests%rowtype;
  v_balance bigint;
begin
  if v_user_id is null or not private.has_permission('share_rewards.manage') then raise exception using errcode='42501',message='Super Admin permission required'; end if;
  if p_action not in ('paid','rejected') then raise exception 'Action must be paid or rejected'; end if;
  if length(coalesce(p_admin_note,''))>1000 or length(coalesce(p_payout_reference,''))>200 then raise exception 'Review details are too long'; end if;
  select * into v_request from public.share_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if v_request.status<>'pending' then raise exception 'This withdrawal request has already been processed'; end if;

  if p_action='paid' then
    if p_receipt_path is null or length(trim(p_receipt_path))<3
       or (storage.foldername(trim(p_receipt_path)))[1] is distinct from v_request.user_id::text then
      raise exception 'A payout receipt stored in the recipient folder is required';
    end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='wallet-payment-receipts' and o.name=trim(p_receipt_path)) then
      raise exception 'Payout receipt file was not found in private storage';
    end if;
    update public.share_withdrawal_requests
      set status='paid',admin_note=nullif(btrim(p_admin_note),''),payout_reference=nullif(btrim(p_payout_reference),''),
          payout_receipt_path=trim(p_receipt_path),reviewed_by=v_user_id,reviewed_at=now()
      where id=v_request.id returning * into v_request;
    update public.share_wallet_accounts set lifetime_withdrawn_iqd=lifetime_withdrawn_iqd+v_request.amount_iqd,updated_at=now()
    where user_id=v_request.user_id returning balance_iqd into v_balance;
    insert into public.share_wallet_transactions(user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description)
      values(v_request.user_id,'withdrawal_paid',-v_request.amount_iqd,coalesce(v_balance,0),'withdrawal_request',v_request.id,'Share reward withdrawal paid; receipt attached');
  else
    return public.review_share_withdrawal_legacy_reject(p_request_id,p_admin_note);
  end if;

  insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
  values(v_request.user_id,'share_withdrawal_status','داواکاریی ڕاکێشان پارەدرا',
    'داواکاریی ڕاکێشان بە بڕی '||to_char(v_request.amount_iqd,'FM999,999,999,990')||' د.ع جێبەجێ کرا. وەسڵ لە جزدانەکەت بەردەستە.',
    'تم دفع السحب','تم دفع طلب السحب وإرفاق الإيصال.','Withdrawal paid','Your withdrawal was paid; the receipt is available.',
    '/dashboard/referral-wallet','share_withdrawal_request',v_request.id,
    jsonb_build_object('status','paid','amount_iqd',v_request.amount_iqd,'receipt_path',v_request.payout_receipt_path));
  return jsonb_build_object('id',v_request.id,'amount_iqd',v_request.amount_iqd,'status','paid','receipt_path',v_request.payout_receipt_path);
end;
$function$;
revoke all on function public.review_share_withdrawal_with_receipt(uuid,text,text,text,text) from public,anon;
grant execute on function public.review_share_withdrawal_with_receipt(uuid,text,text,text,text) to authenticated;
revoke all on function public.review_share_withdrawal_legacy_reject(uuid,text) from public,anon,authenticated;
grant execute on function public.review_share_withdrawal_legacy_reject(uuid,text) to authenticated;

create or replace function public.create_product_post_order_with_share(
  p_request_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery',
  p_share_link_id uuid default null
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
  v_link public.post_share_links%rowtype;
  v_share_link_id uuid := null;
  v_share_reward numeric(14,2) := 0;
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

  if p_share_link_id is not null then
    select * into v_link from public.post_share_links l
    where l.id=p_share_link_id and l.post_id=p_post_id and l.is_active=true and l.expires_at>now();
    if found and v_link.sharer_id<>v_buyer_id and v_link.sharer_id<>v_post.author_id and coalesce(v_post.share_reward_iqd,0)>0 then
      v_share_link_id:=v_link.id;
      v_share_reward:=v_post.share_reward_iqd;
    end if;
  end if;

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
    v_total,v_share_link_id,v_share_reward
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

revoke all on function public.create_product_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) from public,anon;
grant execute on function public.create_product_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) to authenticated;


-- Generic direct-post orders share the same order table as electronics, but
-- record their true order type so history and idempotency remain accurate.
create or replace function private.award_electronics_post_share_reward()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_earning_id uuid;
  v_balance_after numeric(14,2);
  v_order_type text;
  v_title text;
begin
  if new.status<>'delivered' or new.payment_status<>'collected' then return new; end if;
  if new.share_link_id is null or coalesce(new.share_reward_iqd,0)<=0 then return new; end if;

  v_order_type:=case when new.post_category::text='electronics' then 'electronics_post' else 'product_post' end;
  v_title:=new.post_title;
  insert into public.share_earnings(sharer_id,share_link_id,post_id,post_title,order_type,order_id,order_number,amount_iqd)
  select l.sharer_id,l.id,new.post_id,v_title,v_order_type,new.id,new.order_number,new.share_reward_iqd
  from public.post_share_links l
  join public.posts p on p.id=l.post_id
  where l.id=new.share_link_id and l.post_id=new.post_id
    and l.sharer_id<>new.buyer_id and l.sharer_id<>new.seller_id
    and p.author_id<>l.sharer_id
  on conflict(order_type,order_id) do nothing
  returning id into v_earning_id;
  if v_earning_id is null then return new; end if;

  insert into public.share_wallet_accounts(user_id)
  select sharer_id from public.share_earnings where id=v_earning_id
  on conflict(user_id) do nothing;
  update public.share_wallet_accounts a
  set balance_iqd=a.balance_iqd+(select e.amount_iqd from public.share_earnings e where e.id=v_earning_id),
      lifetime_earned_iqd=a.lifetime_earned_iqd+(select e.amount_iqd from public.share_earnings e where e.id=v_earning_id),
      updated_at=now()
  where a.user_id=(select e.sharer_id from public.share_earnings e where e.id=v_earning_id)
  returning balance_iqd into v_balance_after;

  insert into public.share_wallet_transactions(user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description)
  select e.sharer_id,'earning',e.amount_iqd,v_balance_after,e.order_type,e.order_id,
    case when e.order_type='electronics_post' then 'Reward for a completed electronics purchase'
         else 'Reward for a completed eligible product post purchase' end
  from public.share_earnings e where e.id=v_earning_id;

  insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
  select e.sharer_id,'share_earning','خەڵاتی شێرکردن زیادکرا',
    'خەڵاتی '||to_char(e.amount_iqd,'FM999,999,999,990')||' د.ع بۆ کڕینی '||e.post_title||' زیادکرا.',
    'تمت إضافة مكافأة مشاركة','تمت إضافة مكافأتك لعملية شراء مكتملة.',
    'Share reward credited','Your reward for a completed product purchase is now available.',
    '/dashboard/referral-wallet','share_earning',e.id,
    jsonb_build_object('amount_iqd',e.amount_iqd,'order_number',e.order_number,'post_id',e.post_id)
  from public.share_earnings e where e.id=v_earning_id;
  return new;
end;
$function$;
revoke all on function private.award_electronics_post_share_reward() from public,anon,authenticated;


notify pgrst, 'reload schema';
