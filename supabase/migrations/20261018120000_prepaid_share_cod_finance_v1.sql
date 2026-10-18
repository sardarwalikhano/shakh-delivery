-- Additive financial foundation for Shakh post orders: prepaid balances, cash settlement,
-- fee snapshots, 24-hour share links, and proof-backed share payouts.
begin;

-- A share URL uses the immutable row id as its bearer token. Old share rows are retained
-- for order history; new rows are issued only after the current token expires.
alter table public.post_share_links
  add column if not exists expires_at timestamptz;

update public.post_share_links
set expires_at = created_at + interval '24 hours'
where expires_at is null;

update public.post_share_links
set is_active = false
where is_active and expires_at <= now();

alter table public.post_share_links
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null;

alter table public.post_share_links
  drop constraint if exists post_share_links_post_id_sharer_id_key;

create unique index if not exists post_share_links_one_active_per_sharer
  on public.post_share_links(post_id, sharer_id) where is_active;

create or replace function public.create_post_share_link(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_author_id uuid;
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required to create an earning share link';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_post_id::text, 0));

  select p.author_id into v_author_id
  from public.posts p
  where p.id=p_post_id and p.status='active'::public.post_status
  for share;

  if not found then
    raise exception using errcode='P0002', message='This post is not available to share';
  end if;
  if v_author_id = v_user_id then
    raise exception using errcode='42501', message='Post owners cannot earn by sharing their own post';
  end if;

  select l.id into v_link_id
  from public.post_share_links l
  where l.post_id=p_post_id
    and l.sharer_id=v_user_id
    and l.is_active
    and l.expires_at > now()
  order by l.created_at desc
  limit 1
  for update;

  if v_link_id is not null then
    return v_link_id;
  end if;

  update public.post_share_links
  set is_active=false
  where post_id=p_post_id and sharer_id=v_user_id and is_active;

  insert into public.post_share_links(post_id, sharer_id, is_active, expires_at)
  values (p_post_id, v_user_id, true, now() + interval '24 hours')
  returning id into v_link_id;

  return v_link_id;
end;
$function$;

revoke all on function public.create_post_share_link(uuid) from public, anon;
grant execute on function public.create_post_share_link(uuid) to authenticated;

-- Fee rules are controlled by the platform, not by the seller/client.
create table if not exists public.post_finance_fee_rules (
  post_category text primary key,
  customer_platform_fee_iqd numeric(14,2) not null default 250 check (customer_platform_fee_iqd >= 0 and customer_platform_fee_iqd = trunc(customer_platform_fee_iqd)),
  seller_fee_per_item_iqd numeric(14,2) not null default 100 check (seller_fee_per_item_iqd >= 0 and seller_fee_per_item_iqd = trunc(seller_fee_per_item_iqd)),
  captain_delivery_percent numeric(5,2) not null default 20 check (captain_delivery_percent between 0 and 100),
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint post_finance_fee_rules_category_check check (
    post_category in ('food','fashion','electronics','general','supermarket','beauty','kids','online_stores','delivery')
  )
);

insert into public.post_finance_fee_rules(post_category, customer_platform_fee_iqd, seller_fee_per_item_iqd, captain_delivery_percent)
values
  ('food',250,100,20),
  ('fashion',250,100,20),
  ('electronics',250,100,20),
  ('general',250,100,20),
  ('supermarket',250,100,20),
  ('beauty',250,100,20),
  ('kids',250,100,20),
  ('online_stores',250,100,20),
  ('delivery',250,100,20)
on conflict (post_category) do nothing;

-- All wallet top-ups, charges, payouts and cash remittances have separate immutable ledgers.
create table if not exists public.prepaid_wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  balance_iqd numeric(14,2) not null default 0 check (balance_iqd >= 0),
  lifetime_credited_iqd numeric(14,2) not null default 0 check (lifetime_credited_iqd >= 0),
  lifetime_debited_iqd numeric(14,2) not null default 0 check (lifetime_debited_iqd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prepaid_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('topup_credit','seller_item_fee','share_reward_debit','captain_delivery_fee','adjustment_credit','adjustment_debit')),
  amount_iqd numeric(14,2) not null check (amount_iqd <> 0 and amount_iqd = trunc(amount_iqd)),
  balance_after_iqd numeric(14,2) not null check (balance_after_iqd >= 0),
  reference_type text,
  reference_id uuid,
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint prepaid_wallet_transactions_reference_unique unique (user_id, transaction_type, reference_type, reference_id)
);

create index if not exists prepaid_wallet_transactions_user_created_idx
  on public.prepaid_wallet_transactions(user_id, created_at desc);

create table if not exists public.prepaid_wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_iqd numeric(14,2) not null check (amount_iqd > 0 and amount_iqd = trunc(amount_iqd)),
  payment_method text not null check (payment_method in ('fastpay','fib','zain_cash','mobile_cash','bank_transfer')),
  receipt_path text not null,
  user_note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists prepaid_wallet_topup_requests_status_created_idx
  on public.prepaid_wallet_topup_requests(status, requested_at desc);

create table if not exists public.captain_cash_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  outstanding_iqd numeric(14,2) not null default 0 check (outstanding_iqd >= 0),
  lifetime_collected_iqd numeric(14,2) not null default 0 check (lifetime_collected_iqd >= 0),
  lifetime_settled_iqd numeric(14,2) not null default 0 check (lifetime_settled_iqd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.captain_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  captain_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('cash_collected','cash_settlement','adjustment')),
  amount_iqd numeric(14,2) not null check (amount_iqd <> 0 and amount_iqd = trunc(amount_iqd)),
  outstanding_after_iqd numeric(14,2) not null check (outstanding_after_iqd >= 0),
  reference_type text,
  reference_id uuid,
  proof_path text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint captain_cash_transactions_order_event_unique unique (captain_id, transaction_type, reference_type, reference_id)
);

create index if not exists captain_cash_transactions_captain_created_idx
  on public.captain_cash_transactions(captain_id, created_at desc);

create table if not exists public.post_finance_settlements (
  id uuid primary key default gen_random_uuid(),
  order_type text not null check (order_type in ('food_post','apparel_post','electronics_post')),
  order_id uuid not null,
  order_number text not null,
  post_id uuid not null references public.posts(id) on delete restrict,
  post_category text not null,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  captain_id uuid not null references auth.users(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 100),
  order_total_iqd numeric(16,2) not null check (order_total_iqd >= 0),
  delivery_fee_iqd numeric(14,2) not null check (delivery_fee_iqd >= 0),
  customer_platform_fee_iqd numeric(14,2) not null check (customer_platform_fee_iqd >= 0),
  seller_fee_per_item_iqd numeric(14,2) not null check (seller_fee_per_item_iqd >= 0),
  seller_fee_total_iqd numeric(16,2) not null check (seller_fee_total_iqd >= 0),
  captain_fee_percent numeric(5,2) not null check (captain_fee_percent between 0 and 100),
  captain_fee_iqd numeric(14,2) not null check (captain_fee_iqd >= 0),
  share_reward_iqd numeric(14,2) not null default 0 check (share_reward_iqd >= 0),
  payment_method text not null check (payment_method in ('cash_on_delivery','mobile_cash')),
  settled_at timestamptz not null default now(),
  constraint post_finance_settlements_order_unique unique (order_type, order_id)
);

create index if not exists post_finance_settlements_captain_day_idx
  on public.post_finance_settlements(captain_id, settled_at desc);

create table if not exists public.platform_fee_transactions (
  id uuid primary key default gen_random_uuid(),
  order_type text not null check (order_type in ('food_post','apparel_post','electronics_post')),
  order_id uuid not null,
  source_type text not null check (source_type in ('customer_delivery_fee','seller_item_fee','captain_delivery_fee')),
  amount_iqd numeric(14,2) not null check (amount_iqd > 0),
  created_at timestamptz not null default now(),
  constraint platform_fee_transactions_order_source_unique unique (order_type, order_id, source_type)
);

alter table public.share_withdrawal_requests
  add column if not exists payout_proof_path text;

alter table public.share_withdrawal_requests
  drop constraint if exists share_withdrawal_requests_payment_method_check;
alter table public.share_withdrawal_requests
  add constraint share_withdrawal_requests_payment_method_check
  check (payment_method = any (array['mobile_cash','zain_cash','fastpay','fib','qi_card','bank_transfer','other']));

-- Add delivery/collection fields where post orders previously had only seller-side statuses.
alter table public.food_post_orders
  add column if not exists seller_fee_per_item_iqd numeric(14,2),
  add column if not exists captain_fee_percent numeric(5,2),
  add column if not exists finance_policy_applied boolean not null default false;

alter table public.apparel_post_orders
  add column if not exists captain_id uuid references auth.users(id) on delete set null,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists accepted_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists on_the_way_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_collected_at timestamptz,
  add column if not exists seller_fee_per_item_iqd numeric(14,2),
  add column if not exists captain_fee_percent numeric(5,2),
  add column if not exists finance_policy_applied boolean not null default false;

alter table public.electronics_post_orders
  add column if not exists captain_id uuid references auth.users(id) on delete set null,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists accepted_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists on_the_way_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists payment_collected_at timestamptz,
  add column if not exists seller_fee_per_item_iqd numeric(14,2),
  add column if not exists captain_fee_percent numeric(5,2),
  add column if not exists finance_policy_applied boolean not null default false;

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conname='apparel_post_orders_delivery_status_check') then
    alter table public.apparel_post_orders add constraint apparel_post_orders_delivery_status_check
      check (delivery_status in ('pending','accepted','picked_up','on_the_way','arrived','delivered','failed','cancelled'));
  end if;
  if not exists(select 1 from pg_constraint where conname='apparel_post_orders_payment_status_check') then
    alter table public.apparel_post_orders add constraint apparel_post_orders_payment_status_check
      check (payment_status in ('pending','collected','failed','refunded'));
  end if;
  if not exists(select 1 from pg_constraint where conname='apparel_post_orders_finance_amounts_check') then
    alter table public.apparel_post_orders add constraint apparel_post_orders_finance_amounts_check
      check (seller_fee_per_item_iqd >= 0 and captain_fee_percent between 0 and 100);
  end if;
  if not exists(select 1 from pg_constraint where conname='electronics_post_orders_delivery_status_check') then
    alter table public.electronics_post_orders add constraint electronics_post_orders_delivery_status_check
      check (delivery_status in ('pending','accepted','picked_up','on_the_way','arrived','delivered','failed','cancelled'));
  end if;
  if not exists(select 1 from pg_constraint where conname='electronics_post_orders_finance_amounts_check') then
    alter table public.electronics_post_orders add constraint electronics_post_orders_finance_amounts_check
      check (seller_fee_per_item_iqd >= 0 and captain_fee_percent between 0 and 100);
  end if;
end
$constraints$;

-- Private proof storage: customers may upload/read their own top-up proof; payout/cash
-- proofs are written by finance administrators and readable only by the recipient or finance.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('wallet-proofs','wallet-proofs',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists wallet_proofs_select_scoped on storage.objects;
create policy wallet_proofs_select_scoped on storage.objects
for select to authenticated
using (
  bucket_id='wallet-proofs'
  and (
    (storage.foldername(name))[1]='topups' and (storage.foldername(name))[2]=(select auth.uid())::text
    or (storage.foldername(name))[1]='payouts' and (storage.foldername(name))[2]=(select auth.uid())::text
    or (storage.foldername(name))[1]='cash-settlements' and (storage.foldername(name))[2]=(select auth.uid())::text
    or (select private.has_permission('wallets.manage'))
    or (select private.has_permission('share_rewards.manage'))
  )
);

drop policy if exists wallet_proofs_insert_owner_topups on storage.objects;
create policy wallet_proofs_insert_owner_topups on storage.objects
for insert to authenticated
with check (
  bucket_id='wallet-proofs'
  and (storage.foldername(name))[1]='topups'
  and (storage.foldername(name))[2]=(select auth.uid())::text
);

drop policy if exists wallet_proofs_insert_finance_proofs on storage.objects;
create policy wallet_proofs_insert_finance_proofs on storage.objects
for insert to authenticated
with check (
  bucket_id='wallet-proofs'
  and (
    ((storage.foldername(name))[1]='payouts' and (select private.has_permission('share_rewards.manage')))
    or ((storage.foldername(name))[1]='cash-settlements' and (select private.has_permission('wallets.manage')))
  )
);

-- Row-level access: accounts and request history are visible only to their owner or finance.
alter table public.prepaid_wallet_accounts enable row level security;
alter table public.prepaid_wallet_transactions enable row level security;
alter table public.prepaid_wallet_topup_requests enable row level security;
alter table public.captain_cash_accounts enable row level security;
alter table public.captain_cash_transactions enable row level security;
alter table public.post_finance_fee_rules enable row level security;
alter table public.post_finance_settlements enable row level security;
alter table public.platform_fee_transactions enable row level security;

revoke all on public.prepaid_wallet_accounts, public.prepaid_wallet_transactions, public.prepaid_wallet_topup_requests,
  public.captain_cash_accounts, public.captain_cash_transactions, public.post_finance_settlements,
  public.platform_fee_transactions from anon, authenticated;

grant select on public.prepaid_wallet_accounts, public.prepaid_wallet_transactions, public.prepaid_wallet_topup_requests,
  public.captain_cash_accounts, public.captain_cash_transactions, public.post_finance_fee_rules,
  public.post_finance_settlements, public.platform_fee_transactions to authenticated;

drop policy if exists prepaid_wallet_accounts_select_scoped on public.prepaid_wallet_accounts;
create policy prepaid_wallet_accounts_select_scoped on public.prepaid_wallet_accounts
for select to authenticated using (user_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));

drop policy if exists prepaid_wallet_transactions_select_scoped on public.prepaid_wallet_transactions;
create policy prepaid_wallet_transactions_select_scoped on public.prepaid_wallet_transactions
for select to authenticated using (user_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));

drop policy if exists prepaid_wallet_topup_requests_select_scoped on public.prepaid_wallet_topup_requests;
create policy prepaid_wallet_topup_requests_select_scoped on public.prepaid_wallet_topup_requests
for select to authenticated using (user_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));

drop policy if exists captain_cash_accounts_select_scoped on public.captain_cash_accounts;
create policy captain_cash_accounts_select_scoped on public.captain_cash_accounts
for select to authenticated using (user_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));

drop policy if exists captain_cash_transactions_select_scoped on public.captain_cash_transactions;
create policy captain_cash_transactions_select_scoped on public.captain_cash_transactions
for select to authenticated using (captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));

drop policy if exists post_finance_fee_rules_select_authenticated on public.post_finance_fee_rules;
create policy post_finance_fee_rules_select_authenticated on public.post_finance_fee_rules
for select to authenticated using (true);

drop policy if exists post_finance_settlements_select_manager on public.post_finance_settlements;
create policy post_finance_settlements_select_manager on public.post_finance_settlements
for select to authenticated using ((select private.has_permission('wallets.manage')));

drop policy if exists platform_fee_transactions_select_manager on public.platform_fee_transactions;
create policy platform_fee_transactions_select_manager on public.platform_fee_transactions
for select to authenticated using ((select private.has_permission('wallets.manage')));

-- Permissions are explicit: finance control belongs to Super Admin; vendors and captains
-- can view their own prepaid balance and submit top-up requests.
insert into public.permissions(code, description) values
  ('wallets.view_own','View own prepaid wallet and captain cash balance'),
  ('wallets.topup_request','Request a prepaid wallet top-up'),
  ('wallets.manage','Manage prepaid wallets, commissions, fee rules and cash settlements'),
  ('captain_cash.view_own','View own COD cash collection balance'),
  ('captain_cash.manage','Record captain COD remittances')
on conflict (code) do update set description=excluded.description;

insert into public.role_permissions(role, permission_code)
select v.role::public.app_role, v.permission_code
from (values
  ('super_admin','wallets.view_own'),('super_admin','wallets.topup_request'),('super_admin','wallets.manage'),('super_admin','captain_cash.view_own'),('super_admin','captain_cash.manage'),
  ('admin','wallets.view_own'),('admin','wallets.topup_request'),('captain','wallets.view_own'),('captain','wallets.topup_request'),('captain','captain_cash.view_own'),
  ('restaurant_vendor','wallets.view_own'),('restaurant_vendor','wallets.topup_request'),
  ('fashion_vendor','wallets.view_own'),('fashion_vendor','wallets.topup_request'),
  ('supermarket_vendor','wallets.view_own'),('supermarket_vendor','wallets.topup_request'),
  ('car_dealer','wallets.view_own'),('car_dealer','wallets.topup_request'),
  ('umrah_agency','wallets.view_own'),('umrah_agency','wallets.topup_request')
) as v(role, permission_code)
join public.permissions p on p.code=v.permission_code
on conflict do nothing;

create or replace function private.change_prepaid_wallet(
  p_user_id uuid,
  p_amount_iqd numeric,
  p_transaction_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_description text
)
returns numeric
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_balance numeric(14,2);
  v_after numeric(14,2);
begin
  if p_user_id is null or p_amount_iqd is null or p_amount_iqd=0 or p_amount_iqd<>trunc(p_amount_iqd) then
    raise exception using errcode='22023', message='Invalid prepaid wallet movement';
  end if;
  insert into public.prepaid_wallet_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select balance_iqd into v_balance from public.prepaid_wallet_accounts where user_id=p_user_id for update;
  v_after := v_balance + p_amount_iqd;
  if v_after < 0 then
    raise exception using errcode='P0001', message='Insufficient prepaid wallet balance. Please top up before completing this delivery.';
  end if;
  update public.prepaid_wallet_accounts
  set balance_iqd=v_after,
      lifetime_credited_iqd=lifetime_credited_iqd + case when p_amount_iqd>0 then p_amount_iqd else 0 end,
      lifetime_debited_iqd=lifetime_debited_iqd + case when p_amount_iqd<0 then -p_amount_iqd else 0 end,
      updated_at=now()
  where user_id=p_user_id;
  insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description)
  values(p_user_id,p_transaction_type,p_amount_iqd,v_after,p_reference_type,p_reference_id,coalesce(p_description,''));
  return v_after;
end;
$function$;
revoke all on function private.change_prepaid_wallet(uuid,numeric,text,text,uuid,text) from public, anon, authenticated;

create or replace function public.request_prepaid_wallet_topup(
  p_request_id uuid,
  p_amount_iqd numeric,
  p_payment_method text,
  p_receipt_path text,
  p_user_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','storage'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.prepaid_wallet_topup_requests%rowtype;
  v_request public.prepaid_wallet_topup_requests%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if p_request_id is null or p_amount_iqd is null or p_amount_iqd<=0 or p_amount_iqd<>trunc(p_amount_iqd) or p_amount_iqd>1000000000 then
    raise exception using errcode='22023',message='Top-up amount must be a positive whole IQD amount';
  end if;
  if p_payment_method not in ('fastpay','fib','zain_cash','mobile_cash','bank_transfer') then
    raise exception using errcode='22023',message='Unsupported top-up payment method';
  end if;
  if p_user_note is not null and char_length(p_user_note)>1000 then
    raise exception using errcode='22023',message='Top-up note is too long';
  end if;
  if p_receipt_path is null or p_receipt_path not like 'topups/'||v_user_id::text||'/%' then
    raise exception using errcode='22023',message='Upload a valid payment receipt before submitting the top-up request';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='wallet-proofs' and o.name=p_receipt_path) then
    raise exception using errcode='22023',message='The uploaded payment receipt was not found';
  end if;
  select * into v_existing from public.prepaid_wallet_topup_requests where request_id=p_request_id and user_id=v_user_id;
  if found then
    return jsonb_build_object('id',v_existing.id,'amount_iqd',v_existing.amount_iqd,'status',v_existing.status,'requested_at',v_existing.requested_at);
  end if;
  insert into public.prepaid_wallet_accounts(user_id) values(v_user_id) on conflict(user_id) do nothing;
  insert into public.prepaid_wallet_topup_requests(request_id,user_id,amount_iqd,payment_method,receipt_path,user_note)
  values(p_request_id,v_user_id,p_amount_iqd,p_payment_method,p_receipt_path,nullif(btrim(coalesce(p_user_note,'')),''))
  returning * into v_request;
  return jsonb_build_object('id',v_request.id,'amount_iqd',v_request.amount_iqd,'status',v_request.status,'requested_at',v_request.requested_at);
end;
$function$;
revoke all on function public.request_prepaid_wallet_topup(uuid,numeric,text,text,text) from public, anon;
grant execute on function public.request_prepaid_wallet_topup(uuid,numeric,text,text,text) to authenticated;

create or replace function public.review_prepaid_wallet_topup(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.prepaid_wallet_topup_requests%rowtype;
  v_after numeric(14,2);
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not (select private.has_permission('wallets.manage')) then
    raise exception using errcode='42501',message='Only authorized finance administrators may review wallet top-ups';
  end if;
  if p_action not in ('approve','reject') then raise exception using errcode='22023',message='Action must be approve or reject'; end if;
  if char_length(coalesce(p_admin_note,''))>1000 then raise exception using errcode='22023',message='Admin note is too long'; end if;

  select * into v_request from public.prepaid_wallet_topup_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Top-up request was not found'; end if;
  if v_request.status<>'pending' then raise exception using errcode='22023',message='This top-up request has already been processed'; end if;

  if p_action='approve' then
    v_after := private.change_prepaid_wallet(v_request.user_id,v_request.amount_iqd,'topup_credit','prepaid_topup_request',v_request.id,'Approved prepaid wallet top-up');
    update public.prepaid_wallet_topup_requests
    set status='approved',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),reviewed_by=v_user_id,reviewed_at=now()
    where id=p_request_id returning * into v_request;
  else
    update public.prepaid_wallet_topup_requests
    set status='rejected',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),reviewed_by=v_user_id,reviewed_at=now()
    where id=p_request_id returning * into v_request;
    select balance_iqd into v_after from public.prepaid_wallet_accounts where user_id=v_request.user_id;
  end if;

  insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
  values(v_request.user_id,'prepaid_topup_status',
    case when p_action='approve' then 'جزدانی پریپەید پڕکرایەوە' else 'داوای پڕکردنەوەی جزدان ڕەتکرایەوە' end,
    case when p_action='approve' then 'بڕی '||to_char(v_request.amount_iqd,'FM999,999,999,990')||' د.ع بۆ جزدانت زیادکرا.' else 'داوای پڕکردنەوەی جزدان ڕەتکرایەوە.' end,
    'تحديث طلب تعبئة المحفظة','تم تحديث حالة طلب تعبئة المحفظة.',
    'Wallet top-up reviewed','Your prepaid wallet top-up request was reviewed.',
    '/dashboard/wallets','prepaid_topup_request',v_request.id,
    jsonb_build_object('status',v_request.status,'amount_iqd',v_request.amount_iqd));

  return jsonb_build_object('id',v_request.id,'amount_iqd',v_request.amount_iqd,'status',v_request.status,'balance_iqd',coalesce(v_after,0));
end;
$function$;
revoke all on function public.review_prepaid_wallet_topup(uuid,text,text) from public, anon;
grant execute on function public.review_prepaid_wallet_topup(uuid,text,text) to authenticated;

create or replace function public.update_post_finance_fee_rule(
  p_post_category text,
  p_customer_platform_fee_iqd numeric,
  p_seller_fee_per_item_iqd numeric,
  p_captain_delivery_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_user_id uuid := (select auth.uid()); v_rule public.post_finance_fee_rules%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not (select private.has_permission('wallets.manage')) then raise exception using errcode='42501',message='Only Super Admin may change post finance fee rules'; end if;
  if p_customer_platform_fee_iqd is null or p_customer_platform_fee_iqd<0 or p_customer_platform_fee_iqd<>trunc(p_customer_platform_fee_iqd)
    or p_seller_fee_per_item_iqd is null or p_seller_fee_per_item_iqd<0 or p_seller_fee_per_item_iqd<>trunc(p_seller_fee_per_item_iqd)
    or p_captain_delivery_percent is null or p_captain_delivery_percent<0 or p_captain_delivery_percent>100 then
    raise exception using errcode='22023',message='Invalid platform fee, per-item fee, or captain percentage';
  end if;
  update public.post_finance_fee_rules
  set customer_platform_fee_iqd=p_customer_platform_fee_iqd,
      seller_fee_per_item_iqd=p_seller_fee_per_item_iqd,
      captain_delivery_percent=p_captain_delivery_percent,
      updated_by=v_user_id,updated_at=now()
  where post_category=p_post_category
  returning * into v_rule;
  if not found then raise exception using errcode='P0002',message='Post category fee rule was not found'; end if;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(v_user_id,'wallet.fee_rule.updated','post_finance_fee_rule',v_rule.post_category,
    jsonb_build_object('customer_platform_fee_iqd',v_rule.customer_platform_fee_iqd,'seller_fee_per_item_iqd',v_rule.seller_fee_per_item_iqd,'captain_delivery_percent',v_rule.captain_delivery_percent));
  return jsonb_build_object('post_category',v_rule.post_category,'customer_platform_fee_iqd',v_rule.customer_platform_fee_iqd,
    'seller_fee_per_item_iqd',v_rule.seller_fee_per_item_iqd,'captain_delivery_percent',v_rule.captain_delivery_percent,'updated_at',v_rule.updated_at);
end;
$function$;
revoke all on function public.update_post_finance_fee_rule(text,numeric,numeric,numeric) from public, anon;
grant execute on function public.update_post_finance_fee_rule(text,numeric,numeric,numeric) to authenticated;

create or replace function public.settle_captain_cash(
  p_request_id uuid,
  p_captain_id uuid,
  p_amount_iqd numeric,
  p_proof_path text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','storage'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.captain_cash_transactions%rowtype;
  v_outstanding numeric(14,2);
  v_after numeric(14,2);
  v_tx public.captain_cash_transactions%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not (select private.has_permission('wallets.manage')) then raise exception using errcode='42501',message='Only finance administrators may settle captain cash'; end if;
  if p_request_id is null or p_captain_id is null or p_amount_iqd is null or p_amount_iqd<=0 or p_amount_iqd<>trunc(p_amount_iqd) then
    raise exception using errcode='22023',message='Settlement amount and captain are required';
  end if;
  if char_length(coalesce(p_note,''))>1000 then raise exception using errcode='22023',message='Settlement note is too long'; end if;
  if p_proof_path is null or p_proof_path not like 'cash-settlements/'||p_captain_id::text||'/'||p_request_id::text||'/%' then
    raise exception using errcode='22023',message='A valid cash-settlement receipt is required';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='wallet-proofs' and name=p_proof_path) then
    raise exception using errcode='22023',message='The uploaded settlement receipt was not found';
  end if;

  select * into v_existing from public.captain_cash_transactions where request_id=p_request_id;
  if found then
    if v_existing.captain_id<>p_captain_id or -v_existing.amount_iqd<>p_amount_iqd then
      raise exception using errcode='23505',message='This settlement request id was already used for a different amount';
    end if;
    return jsonb_build_object('id',v_existing.id,'captain_id',v_existing.captain_id,'amount_iqd',-v_existing.amount_iqd,'outstanding_iqd',v_existing.outstanding_after_iqd);
  end if;

  insert into public.captain_cash_accounts(user_id) values(p_captain_id) on conflict(user_id) do nothing;
  select outstanding_iqd into v_outstanding from public.captain_cash_accounts where user_id=p_captain_id for update;
  if p_amount_iqd>v_outstanding then raise exception using errcode='22023',message='Settlement exceeds the captain outstanding cash balance'; end if;
  v_after := v_outstanding-p_amount_iqd;
  update public.captain_cash_accounts
  set outstanding_iqd=v_after,lifetime_settled_iqd=lifetime_settled_iqd+p_amount_iqd,updated_at=now()
  where user_id=p_captain_id;

  insert into public.captain_cash_transactions(request_id,captain_id,transaction_type,amount_iqd,outstanding_after_iqd,reference_type,reference_id,proof_path,note,created_by)
  values(p_request_id,p_captain_id,'cash_settlement',-p_amount_iqd,v_after,'cash_settlement',p_request_id,p_proof_path,nullif(btrim(coalesce(p_note,'')),''),v_user_id)
  returning * into v_tx;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(v_user_id,'captain.cash.settled','captain_cash_account',p_captain_id::text,
    jsonb_build_object('request_id',p_request_id,'amount_iqd',p_amount_iqd,'outstanding_after_iqd',v_after,'proof_path',p_proof_path));
  return jsonb_build_object('id',v_tx.id,'captain_id',p_captain_id,'amount_iqd',p_amount_iqd,'outstanding_iqd',v_after);
end;
$function$;
revoke all on function public.settle_captain_cash(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.settle_captain_cash(uuid,uuid,numeric,text,text) to authenticated;

create or replace function public.review_share_withdrawal_with_proof(
  p_request_id uuid,
  p_action text,
  p_admin_note text,
  p_payout_reference text,
  p_payout_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','storage'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.share_withdrawal_requests%rowtype;
  v_balance_after numeric(14,2);
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not exists(select 1 from public.user_roles where user_id=v_user_id and role='super_admin'::public.app_role) then
    raise exception using errcode='42501',message='Only Super Admin may approve share payouts';
  end if;
  if p_action not in ('paid','rejected') then raise exception using errcode='22023',message='Action must be paid or rejected'; end if;
  if char_length(coalesce(p_admin_note,''))>1000 or char_length(coalesce(p_payout_reference,''))>200 then
    raise exception using errcode='22023',message='Review details are too long';
  end if;

  select * into v_request from public.share_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Withdrawal request was not found'; end if;
  if v_request.status<>'pending' then raise exception using errcode='22023',message='This withdrawal request has already been processed'; end if;

  if p_action='paid' then
    if p_payout_proof_path is null or p_payout_proof_path not like 'payouts/'||v_request.user_id::text||'/'||v_request.id::text||'/%' then
      raise exception using errcode='22023',message='Upload a payout receipt before marking this request as paid';
    end if;
    if not exists(select 1 from storage.objects where bucket_id='wallet-proofs' and name=p_payout_proof_path) then
      raise exception using errcode='22023',message='The payout receipt was not found in secure storage';
    end if;
    update public.share_withdrawal_requests
    set status='paid',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),
        payout_reference=nullif(btrim(coalesce(p_payout_reference,'')),''),
        payout_proof_path=p_payout_proof_path,reviewed_by=v_user_id,reviewed_at=now()
    where id=p_request_id returning * into v_request;
    update public.share_wallet_accounts
    set lifetime_withdrawn_iqd=lifetime_withdrawn_iqd+v_request.amount_iqd,updated_at=now()
    where user_id=v_request.user_id;
  else
    insert into public.share_wallet_accounts(user_id) values(v_request.user_id) on conflict(user_id) do nothing;
    update public.share_wallet_accounts
    set balance_iqd=balance_iqd+v_request.amount_iqd,updated_at=now()
    where user_id=v_request.user_id returning balance_iqd into v_balance_after;
    update public.share_withdrawal_requests
    set status='rejected',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),
        reviewed_by=v_user_id,reviewed_at=now()
    where id=p_request_id returning * into v_request;
    insert into public.share_wallet_transactions(user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description)
    values(v_request.user_id,'withdrawal_refund',v_request.amount_iqd,v_balance_after,'withdrawal_request',v_request.id,
      'Funds returned because the withdrawal was rejected');
  end if;

  insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
  values(v_request.user_id,'share_withdrawal_status',
    case when p_action='paid' then 'داواکاریی ڕاکێشان پارەدرا' else 'داواکاریی ڕاکێشان ڕەتکرایەوە' end,
    case when p_action='paid' then 'داواکاریی ڕاکێشان بە بڕی '||to_char(v_request.amount_iqd,'FM999,999,999,990')||' د.ع جێبەجێ کرا.' else 'بڕی داواکراو گەڕێندرایەوە بۆ باڵانسی خەڵات.' end,
    'تحديث طلب السحب','تم تحديث حالة طلب سحب المكافآت.',
    'Withdrawal request updated','Your share reward withdrawal request was updated.',
    '/dashboard/referral-wallet','share_withdrawal_request',v_request.id,
    jsonb_build_object('status',v_request.status,'amount_iqd',v_request.amount_iqd,'payout_reference',v_request.payout_reference,'payout_proof_path',v_request.payout_proof_path));

  return jsonb_build_object('id',v_request.id,'amount_iqd',v_request.amount_iqd,'status',v_request.status,'payout_proof_path',v_request.payout_proof_path);
end;
$function$;
revoke all on function public.review_share_withdrawal_with_proof(uuid,text,text,text,text) from public, anon;
grant execute on function public.review_share_withdrawal_with_proof(uuid,text,text,text,text) to authenticated;

-- Prevent the legacy no-proof RPC from bypassing the receipt requirement.
create or replace function public.review_share_withdrawal(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null,
  p_payout_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if p_action='paid' then
    raise exception using errcode='22023',message='A payout receipt is required. Use the proof-backed review flow.';
  end if;
  return public.review_share_withdrawal_with_proof(p_request_id,p_action,p_admin_note,p_payout_reference,null);
end;
$function$;
revoke all on function public.review_share_withdrawal(uuid,text,text,text) from public, anon;
grant execute on function public.review_share_withdrawal(uuid,text,text,text) to authenticated;

-- The insert trigger snapshots fees and rejects expired share attribution. This makes
-- repeated RPC calls unable to edit the reward or fee from the browser.
create or replace function private.snapshot_post_order_fees()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_category text;
  v_customer_fee numeric(14,2) := 250;
  v_seller_fee numeric(14,2) := 100;
  v_captain_percent numeric(5,2) := 20;
  v_reward numeric(14,2) := 0;
  v_sharer uuid;
begin
  if tg_table_name='food_post_orders' then
    v_category := 'food';
  elsif tg_table_name='apparel_post_orders' then
    v_category := 'fashion';
  else
    v_category := new.post_category::text;
  end if;

  select customer_platform_fee_iqd,seller_fee_per_item_iqd,captain_delivery_percent
  into v_customer_fee,v_seller_fee,v_captain_percent
  from public.post_finance_fee_rules
  where post_category=v_category and is_active;
  v_customer_fee := coalesce(v_customer_fee,250);
  v_seller_fee := coalesce(v_seller_fee,100);
  v_captain_percent := coalesce(v_captain_percent,20);

  new.platform_fee_iqd := v_customer_fee;
  new.seller_fee_per_item_iqd := v_seller_fee;
  new.captain_fee_percent := v_captain_percent;
  new.total_iqd := new.line_total_iqd + new.delivery_fee_iqd + new.platform_fee_iqd;
  new.finance_policy_applied := true;

  if new.share_link_id is not null then
    select l.sharer_id,p.share_reward_iqd into v_sharer,v_reward
    from public.post_share_links l
    join public.posts p on p.id=l.post_id
    where l.id=new.share_link_id
      and l.post_id=new.post_id
      and l.is_active
      and l.expires_at>now()
      and l.sharer_id<>new.buyer_id
      and l.sharer_id<>new.seller_id
      and p.author_id<>l.sharer_id;
    if not found or coalesce(v_reward,0)<=0 then
      new.share_link_id := null;
      new.share_reward_iqd := 0;
    else
      new.share_reward_iqd := v_reward;
    end if;
  else
    new.share_reward_iqd := 0;
  end if;

  return new;
end;
$function$;
revoke all on function private.snapshot_post_order_fees() from public, anon, authenticated;

drop trigger if exists a_snapshot_post_order_fees on public.food_post_orders;
create trigger a_snapshot_post_order_fees before insert on public.food_post_orders
for each row execute function private.snapshot_post_order_fees();
drop trigger if exists a_snapshot_post_order_fees on public.apparel_post_orders;
create trigger a_snapshot_post_order_fees before insert on public.apparel_post_orders
for each row execute function private.snapshot_post_order_fees();
drop trigger if exists a_snapshot_post_order_fees on public.electronics_post_orders;
create trigger a_snapshot_post_order_fees before insert on public.electronics_post_orders
for each row execute function private.snapshot_post_order_fees();

create or replace function private.guard_post_order_delivery()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if new.status='delivered' and old.status is distinct from 'delivered' then
    if new.captain_id is null or new.delivery_status<>'delivered' then
      raise exception using errcode='42501',message='A captain must complete the delivery workflow before an order can be marked delivered';
    end if;
  end if;
  if new.payment_status='collected' and old.payment_status is distinct from 'collected' then
    if new.status<>'delivered' or new.delivery_status<>'delivered' or new.captain_id is null then
      raise exception using errcode='22023',message='Payment can be recorded only after an assigned captain completes delivery';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_post_order_delivery() from public, anon, authenticated;

drop trigger if exists a_guard_post_order_delivery on public.food_post_orders;
create trigger a_guard_post_order_delivery before update of status,delivery_status,payment_status on public.food_post_orders
for each row execute function private.guard_post_order_delivery();
drop trigger if exists a_guard_post_order_delivery on public.apparel_post_orders;
create trigger a_guard_post_order_delivery before update of status,delivery_status,payment_status on public.apparel_post_orders
for each row execute function private.guard_post_order_delivery();
drop trigger if exists a_guard_post_order_delivery on public.electronics_post_orders;
create trigger a_guard_post_order_delivery before update of status,delivery_status,payment_status on public.electronics_post_orders
for each row execute function private.guard_post_order_delivery();

create or replace function private.finalize_post_order_finance()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_order_type text;
  v_category text;
  v_settlement_id uuid;
  v_seller_fee_total numeric(16,2);
  v_captain_fee numeric(14,2);
  v_reward numeric(14,2) := 0;
  v_sharer uuid;
  v_earning_id uuid;
  v_share_balance_after numeric(14,2);
  v_cash_after numeric(14,2);
begin
  if not coalesce(new.finance_policy_applied,false) then return new; end if;
  if new.status<>'delivered' or new.payment_status<>'collected' then return new; end if;
  if old.status='delivered' and old.payment_status='collected' then return new; end if;

  if new.captain_id is null then
    raise exception using errcode='22023',message='Delivery cannot settle without an assigned captain';
  end if;

  if tg_table_name='food_post_orders' then
    v_order_type := 'food_post';
    v_category := 'food';
  elsif tg_table_name='apparel_post_orders' then
    v_order_type := 'apparel_post';
    v_category := 'fashion';
  else
    v_order_type := 'electronics_post';
    v_category := new.post_category::text;
  end if;

  v_seller_fee_total := coalesce(new.seller_fee_per_item_iqd,0) * new.quantity;
  v_captain_fee := round(new.delivery_fee_iqd * coalesce(new.captain_fee_percent,0) / 100,0);

  if new.share_link_id is not null and coalesce(new.share_reward_iqd,0)>0 then
    select l.sharer_id,new.share_reward_iqd into v_sharer,v_reward
    from public.post_share_links l
    join public.posts p on p.id=l.post_id
    where l.id=new.share_link_id and l.post_id=new.post_id
      and l.sharer_id<>new.buyer_id
      and l.sharer_id<>new.seller_id
      and p.author_id<>l.sharer_id;
    if not found then v_reward:=0; v_sharer:=null; end if;
  end if;

  insert into public.post_finance_settlements(
    order_type,order_id,order_number,post_id,post_category,buyer_id,seller_id,captain_id,quantity,
    order_total_iqd,delivery_fee_iqd,customer_platform_fee_iqd,seller_fee_per_item_iqd,seller_fee_total_iqd,
    captain_fee_percent,captain_fee_iqd,share_reward_iqd,payment_method
  ) values (
    v_order_type,new.id,new.order_number,new.post_id,v_category,new.buyer_id,new.seller_id,new.captain_id,new.quantity,
    new.total_iqd,new.delivery_fee_iqd,new.platform_fee_iqd,coalesce(new.seller_fee_per_item_iqd,0),v_seller_fee_total,
    coalesce(new.captain_fee_percent,0),v_captain_fee,v_reward,new.payment_method
  ) on conflict(order_type,order_id) do nothing returning id into v_settlement_id;

  if v_settlement_id is null then return new; end if;

  if v_seller_fee_total>0 then
    perform private.change_prepaid_wallet(new.seller_id,-v_seller_fee_total,'seller_item_fee',v_order_type,new.id,
      'Platform fee for '||new.quantity::text||' sold item(s), order '||new.order_number);
    insert into public.platform_fee_transactions(order_type,order_id,source_type,amount_iqd)
    values(v_order_type,new.id,'seller_item_fee',v_seller_fee_total);
  end if;

  if new.platform_fee_iqd>0 then
    insert into public.platform_fee_transactions(order_type,order_id,source_type,amount_iqd)
    values(v_order_type,new.id,'customer_delivery_fee',new.platform_fee_iqd);
  end if;

  if v_captain_fee>0 then
    perform private.change_prepaid_wallet(new.captain_id,-v_captain_fee,'captain_delivery_fee',v_order_type,new.id,
      'Captain platform commission for delivery '||new.order_number);
    insert into public.platform_fee_transactions(order_type,order_id,source_type,amount_iqd)
    values(v_order_type,new.id,'captain_delivery_fee',v_captain_fee);
  end if;

  if v_sharer is not null and v_reward>0 then
    insert into public.share_earnings(
      sharer_id,share_link_id,post_id,post_title,order_type,order_id,order_number,amount_iqd
    ) values(v_sharer,new.share_link_id,new.post_id,new.post_title,v_order_type,new.id,new.order_number,v_reward)
    on conflict(order_type,order_id) do nothing
    returning id into v_earning_id;

    if v_earning_id is not null then
      perform private.change_prepaid_wallet(new.seller_id,-v_reward,'share_reward_debit',v_order_type,new.id,
        'Share reward funded by the seller for completed order '||new.order_number);

      insert into public.share_wallet_accounts(user_id) values(v_sharer) on conflict(user_id) do nothing;
      update public.share_wallet_accounts
      set balance_iqd=balance_iqd+v_reward,lifetime_earned_iqd=lifetime_earned_iqd+v_reward,updated_at=now()
      where user_id=v_sharer returning balance_iqd into v_share_balance_after;

      insert into public.share_wallet_transactions(user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description)
      values(v_sharer,'earning',v_reward,v_share_balance_after,v_order_type,new.id,
        'Seller-funded Share reward for completed order '||new.order_number);

      insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
      values(v_sharer,'share_earning','خەڵاتی شێرکردن زیادکرا',
        'خەڵاتی '||to_char(v_reward,'FM999,999,999,990')||' د.ع بۆ کڕینی '||new.post_title||' زیادکرا.',
        'تمت إضافة مكافأة مشاركة','تمت إضافة مكافأتك لعملية شراء مكتملة.',
        'Share reward credited','Your reward for a completed purchase is now available.',
        '/dashboard/referral-wallet','share_earning',v_earning_id,
        jsonb_build_object('amount_iqd',v_reward,'order_number',new.order_number,'post_id',new.post_id));
    end if;
  end if;

  if new.payment_method='cash_on_delivery' then
    insert into public.captain_cash_accounts(user_id) values(new.captain_id) on conflict(user_id) do nothing;
    update public.captain_cash_accounts
    set outstanding_iqd=outstanding_iqd+new.total_iqd,
        lifetime_collected_iqd=lifetime_collected_iqd+new.total_iqd,
        updated_at=now()
    where user_id=new.captain_id returning outstanding_iqd into v_cash_after;
    insert into public.captain_cash_transactions(request_id,captain_id,transaction_type,amount_iqd,outstanding_after_iqd,reference_type,reference_id,note)
    values(gen_random_uuid(),new.captain_id,'cash_collected',new.total_iqd,v_cash_after,v_order_type,new.id,
      'Cash collected from buyer for order '||new.order_number)
    on conflict(captain_id,transaction_type,reference_type,reference_id) do nothing;
  end if;

  return new;
end;
$function$;
revoke all on function private.finalize_post_order_finance() from public, anon, authenticated;

drop trigger if exists award_food_post_share_reward on public.food_post_orders;
drop trigger if exists award_apparel_post_share_reward on public.apparel_post_orders;
drop trigger if exists electronics_post_orders_award_share_reward on public.electronics_post_orders;

drop trigger if exists z_finalize_post_order_finance on public.food_post_orders;
create trigger z_finalize_post_order_finance before update of status,payment_status on public.food_post_orders
for each row execute function private.finalize_post_order_finance();
drop trigger if exists z_finalize_post_order_finance on public.apparel_post_orders;
create trigger z_finalize_post_order_finance before update of status,payment_status on public.apparel_post_orders
for each row execute function private.finalize_post_order_finance();
drop trigger if exists z_finalize_post_order_finance on public.electronics_post_orders;
create trigger z_finalize_post_order_finance before update of status,payment_status on public.electronics_post_orders
for each row execute function private.finalize_post_order_finance();

-- Captain delivery workflow for fashion and generic/electronics post orders.
drop policy if exists apparel_post_orders_select_participants on public.apparel_post_orders;
create policy apparel_post_orders_select_participants on public.apparel_post_orders
for select to authenticated
using (
  buyer_id=(select auth.uid()) or seller_id=(select auth.uid())
  or (select private.has_permission('posts.manage'))
  or ((select private.has_permission('deliveries.claim')) and (captain_id=(select auth.uid()) or (captain_id is null and status='confirmed' and delivery_status='pending')))
);

drop policy if exists electronics_post_orders_select_participants on public.electronics_post_orders;
create policy electronics_post_orders_select_participants on public.electronics_post_orders
for select to authenticated
using (
  buyer_id=(select auth.uid()) or seller_id=(select auth.uid())
  or (select private.has_permission('posts.manage'))
  or ((select private.has_permission('deliveries.claim')) and (captain_id=(select auth.uid()) or (captain_id is null and status='confirmed' and delivery_status='pending')))
);

create table if not exists public.post_order_payment_events (
  id uuid primary key default gen_random_uuid(),
  order_type text not null check (order_type in ('apparel_post','electronics_post')),
  order_id uuid not null,
  captain_id uuid not null references auth.users(id) on delete restrict,
  amount_iqd numeric(14,2) not null check (amount_iqd>0),
  payment_method text not null check (payment_method in ('cash_on_delivery','mobile_cash')),
  received_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  constraint post_order_payment_events_order_unique unique(order_type,order_id)
);
alter table public.post_order_payment_events enable row level security;
revoke all on public.post_order_payment_events from anon,authenticated;
grant select on public.post_order_payment_events to authenticated;
drop policy if exists post_order_payment_events_select_participants on public.post_order_payment_events;
create policy post_order_payment_events_select_participants on public.post_order_payment_events
for select to authenticated
using (
  captain_id=(select auth.uid())
  or (select private.has_permission('payments.manage'))
  or (order_type='apparel_post' and exists(select 1 from public.apparel_post_orders o where o.id=order_id and (o.buyer_id=(select auth.uid()) or o.seller_id=(select auth.uid()))))
  or (order_type='electronics_post' and exists(select 1 from public.electronics_post_orders o where o.id=order_id and (o.buyer_id=(select auth.uid()) or o.seller_id=(select auth.uid()))))
);

create or replace function public.claim_post_order_delivery(p_order_type text,p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_captain uuid;
  v_order_number text;
  v_status text;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not (select private.has_permission('deliveries.claim')) then raise exception using errcode='42501',message='Captain delivery permission required'; end if;
  if p_order_type not in ('apparel_post','electronics_post') then raise exception using errcode='22023',message='Unsupported post order type'; end if;

  if p_order_type='apparel_post' then
    update public.apparel_post_orders set captain_id=v_user_id,delivery_status='accepted',accepted_at=now(),updated_at=now()
    where id=p_order_id and status='confirmed' and captain_id is null and delivery_status='pending'
    returning captain_id,order_number,delivery_status into v_captain,v_order_number,v_status;
    if not found then
      select captain_id,order_number,delivery_status into v_captain,v_order_number,v_status from public.apparel_post_orders where id=p_order_id;
    end if;
  else
    update public.electronics_post_orders set captain_id=v_user_id,delivery_status='accepted',accepted_at=now(),updated_at=now()
    where id=p_order_id and status='confirmed' and captain_id is null and delivery_status='pending'
    returning captain_id,order_number,delivery_status into v_captain,v_order_number,v_status;
    if not found then
      select captain_id,order_number,delivery_status into v_captain,v_order_number,v_status from public.electronics_post_orders where id=p_order_id;
    end if;
  end if;

  if v_order_number is null then raise exception using errcode='P0002',message='Post delivery order was not found'; end if;
  if v_captain<>v_user_id then raise exception using errcode='P0001',message='This post delivery has already been claimed by another captain'; end if;
  return jsonb_build_object('order_id',p_order_id,'order_type',p_order_type,'order_number',v_order_number,'captain_id',v_captain,'delivery_status',v_status);
end;
$function$;
revoke all on function public.claim_post_order_delivery(text,uuid) from public, anon;
grant execute on function public.claim_post_order_delivery(text,uuid) to authenticated;

create or replace function public.update_post_order_delivery_status(p_order_type text,p_order_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_current text;
  v_order public.apparel_post_orders%rowtype;
  v_product public.electronics_post_orders%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not (select private.has_permission('deliveries.status_update')) then raise exception using errcode='42501',message='Captain delivery permission required'; end if;
  if p_status not in ('picked_up','on_the_way','arrived','delivered','failed','cancelled') then raise exception using errcode='22023',message='Invalid post delivery status'; end if;

  if p_order_type='apparel_post' then
    select * into v_order from public.apparel_post_orders where id=p_order_id and captain_id=v_user_id for update;
    if not found then raise exception using errcode='42501',message='Apparel delivery is not assigned to you'; end if;
    v_current:=v_order.delivery_status;
  elsif p_order_type='electronics_post' then
    select * into v_product from public.electronics_post_orders where id=p_order_id and captain_id=v_user_id for update;
    if not found then raise exception using errcode='42501',message='Product delivery is not assigned to you'; end if;
    v_current:=v_product.delivery_status;
  else
    raise exception using errcode='22023',message='Unsupported post order type';
  end if;

  if not ((v_current='accepted' and p_status in ('picked_up','failed','cancelled'))
    or (v_current='picked_up' and p_status in ('on_the_way','failed','cancelled'))
    or (v_current='on_the_way' and p_status in ('arrived','failed','cancelled'))
    or (v_current='arrived' and p_status in ('delivered','failed','cancelled'))) then
    raise exception using errcode='22023',message='Invalid delivery status transition';
  end if;

  if p_order_type='apparel_post' then
    update public.apparel_post_orders
    set delivery_status=p_status,
        picked_up_at=case when p_status='picked_up' then now() else picked_up_at end,
        on_the_way_at=case when p_status='on_the_way' then now() else on_the_way_at end,
        arrived_at=case when p_status='arrived' then now() else arrived_at end,
        delivered_at=case when p_status='delivered' then now() else delivered_at end,
        status=case when p_status='delivered' then 'delivered' else status end,
        updated_at=now()
    where id=p_order_id;
  else
    update public.electronics_post_orders
    set delivery_status=p_status,
        picked_up_at=case when p_status='picked_up' then now() else picked_up_at end,
        on_the_way_at=case when p_status='on_the_way' then now() else on_the_way_at end,
        arrived_at=case when p_status='arrived' then now() else arrived_at end,
        delivered_at=case when p_status='delivered' then now() else delivered_at end,
        status=case when p_status='delivered' then 'delivered' else status end,
        updated_at=now()
    where id=p_order_id;
  end if;
  return jsonb_build_object('order_id',p_order_id,'order_type',p_order_type,'delivery_status',p_status);
end;
$function$;
revoke all on function public.update_post_order_delivery_status(text,uuid,text) from public, anon;
grant execute on function public.update_post_order_delivery_status(text,uuid,text) to authenticated;

create or replace function public.record_post_order_payment(p_order_type text,p_order_id uuid,p_amount_iqd numeric,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_order_type text := p_order_type;
  v_captain_id uuid;
  v_total numeric(16,2);
  v_method text;
  v_status text;
  v_event public.post_order_payment_events%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not (select private.has_permission('deliveries.status_update')) then raise exception using errcode='42501',message='Captain delivery permission required'; end if;
  if p_amount_iqd is null or p_amount_iqd<=0 or char_length(coalesce(p_note,''))>1000 then
    raise exception using errcode='22023',message='Invalid collected amount or note';
  end if;

  if p_order_type='apparel_post' then
    select captain_id,total_iqd,payment_method,status into v_captain_id,v_total,v_method,v_status
    from public.apparel_post_orders where id=p_order_id and captain_id=v_user_id and delivery_status='delivered' for update;
  elsif p_order_type='electronics_post' then
    select captain_id,total_iqd,payment_method,status into v_captain_id,v_total,v_method,v_status
    from public.electronics_post_orders where id=p_order_id and captain_id=v_user_id and delivery_status='delivered' for update;
  else
    raise exception using errcode='22023',message='Unsupported post order type';
  end if;

  if v_captain_id is null then raise exception using errcode='42501',message='Delivered post order is not assigned to you'; end if;
  if round(coalesce(p_amount_iqd,0),2)<>v_total then raise exception using errcode='22023',message='Received amount must match the order total'; end if;

  select * into v_event from public.post_order_payment_events where order_type=p_order_type and order_id=p_order_id;
  if found then
    if v_event.captain_id<>v_user_id or v_event.amount_iqd<>p_amount_iqd then raise exception using errcode='23505',message='Payment for this order has already been recorded'; end if;
    return jsonb_build_object('id',v_event.id,'order_id',v_event.order_id,'amount_iqd',v_event.amount_iqd,'received_at',v_event.received_at);
  end if;

  insert into public.post_order_payment_events(order_type,order_id,captain_id,amount_iqd,payment_method,note)
  values(p_order_type,p_order_id,v_user_id,v_total,v_method,nullif(btrim(coalesce(p_note,'')),''))
  returning * into v_event;

  if p_order_type='apparel_post' then
    update public.apparel_post_orders set payment_status='collected',payment_collected_at=v_event.received_at,updated_at=now() where id=p_order_id;
  else
    update public.electronics_post_orders set payment_status='collected',payment_collected_at=v_event.received_at,updated_at=now() where id=p_order_id;
  end if;
  return jsonb_build_object('id',v_event.id,'order_id',v_event.order_id,'amount_iqd',v_event.amount_iqd,'received_at',v_event.received_at);
end;
$function$;
revoke all on function public.record_post_order_payment(text,uuid,numeric,text) from public, anon;
grant execute on function public.record_post_order_payment(text,uuid,numeric,text) to authenticated;

-- The dashboard gets a consistent summary without giving clients direct write access to balances.
create or replace function public.get_wallet_finance_summary()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_prepaid public.prepaid_wallet_accounts%rowtype;
  v_cash public.captain_cash_accounts%rowtype;
  v_today_start timestamptz := date_trunc('day',now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad';
  v_today jsonb;
  v_transactions jsonb;
  v_topups jsonb;
  v_cash_transactions jsonb;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into v_prepaid from public.prepaid_wallet_accounts where user_id=v_user_id;
  select * into v_cash from public.captain_cash_accounts where user_id=v_user_id;

  select jsonb_build_object(
    'orders_count',count(*),
    'gross_delivery_fee_iqd',coalesce(sum(delivery_fee_iqd),0),
    'captain_fee_iqd',coalesce(sum(captain_fee_iqd),0),
    'net_captain_earning_iqd',coalesce(sum(delivery_fee_iqd-captain_fee_iqd),0)
  ) into v_today from public.post_finance_settlements
  where captain_id=v_user_id and settled_at>=v_today_start;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into v_transactions
  from (select id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description,created_at
        from public.prepaid_wallet_transactions where user_id=v_user_id order by created_at desc limit 30) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.requested_at desc),'[]'::jsonb) into v_topups
  from (select id,amount_iqd,payment_method,receipt_path,user_note,status,admin_note,requested_at,reviewed_at
        from public.prepaid_wallet_topup_requests where user_id=v_user_id order by requested_at desc limit 30) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into v_cash_transactions
  from (select id,transaction_type,amount_iqd,outstanding_after_iqd,reference_type,reference_id,proof_path,note,created_at
        from public.captain_cash_transactions where captain_id=v_user_id order by created_at desc limit 30) q;

  return jsonb_build_object(
    'prepaid_wallet',jsonb_build_object('balance_iqd',coalesce(v_prepaid.balance_iqd,0),'lifetime_credited_iqd',coalesce(v_prepaid.lifetime_credited_iqd,0),'lifetime_debited_iqd',coalesce(v_prepaid.lifetime_debited_iqd,0)),
    'captain_cash',jsonb_build_object('outstanding_iqd',coalesce(v_cash.outstanding_iqd,0),'lifetime_collected_iqd',coalesce(v_cash.lifetime_collected_iqd,0),'lifetime_settled_iqd',coalesce(v_cash.lifetime_settled_iqd,0)),
    'today',coalesce(v_today,'{}'::jsonb),
    'transactions',v_transactions,'topups',v_topups,'cash_transactions',v_cash_transactions
  );
end;
$function$;
revoke all on function public.get_wallet_finance_summary() from public, anon;
grant execute on function public.get_wallet_finance_summary() to authenticated;



-- Add share attribution to general/supermarket/beauty/kids/online-store post orders
-- without changing the existing RPC signature used by older clients.
create or replace function public.create_product_post_order_with_share(
  p_request_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text,
  p_payment_method text,
  p_share_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.electronics_post_orders%rowtype;
  v_order public.electronics_post_orders%rowtype;
  v_result jsonb;
  v_reward numeric(14,2);
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='Request id is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.electronics_post_orders
  where buyer_id=v_user_id and request_id=p_request_id;
  if found then
    return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'post_category',v_existing.post_category,
      'status',v_existing.status,'quantity',v_existing.quantity,'unit_price_iqd',v_existing.unit_price_iqd,
      'line_total_iqd',v_existing.line_total_iqd,'delivery_city',v_existing.delivery_city,
      'delivery_fee_iqd',v_existing.delivery_fee_iqd,'platform_fee_iqd',v_existing.platform_fee_iqd,'total_iqd',v_existing.total_iqd,
      'share_reward_iqd',v_existing.share_reward_iqd);
  end if;

  v_result := public.create_product_post_order(
    p_request_id,p_post_id,p_quantity,p_delivery_address,p_buyer_phone,p_delivery_city,p_customer_note,p_payment_method
  );
  select * into v_order from public.electronics_post_orders where id=(v_result->>'id')::uuid for update;
  if not found then raise exception using errcode='P0002',message='Created product order could not be reloaded'; end if;

  if p_share_link_id is not null then
    select p.share_reward_iqd into v_reward
    from public.post_share_links l join public.posts p on p.id=l.post_id
    where l.id=p_share_link_id and l.post_id=v_order.post_id and l.is_active and l.expires_at>now()
      and l.sharer_id<>v_order.buyer_id and l.sharer_id<>v_order.seller_id and p.author_id<>l.sharer_id;
    if found and coalesce(v_reward,0)>0 then
      update public.electronics_post_orders
      set share_link_id=p_share_link_id,share_reward_iqd=v_reward,updated_at=now()
      where id=v_order.id and share_link_id is null
      returning * into v_order;
      if not found then select * into v_order from public.electronics_post_orders where id=v_order.id; end if;
    end if;
  end if;

  return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'post_category',v_order.post_category,
    'status',v_order.status,'quantity',v_order.quantity,'unit_price_iqd',v_order.unit_price_iqd,
    'line_total_iqd',v_order.line_total_iqd,'delivery_city',v_order.delivery_city,
    'delivery_fee_iqd',v_order.delivery_fee_iqd,'platform_fee_iqd',v_order.platform_fee_iqd,
    'total_iqd',v_order.total_iqd,'share_reward_iqd',v_order.share_reward_iqd);
end;
$function$;
revoke all on function public.create_product_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.create_product_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) to authenticated;


-- The old direct seller/admin transition may no longer bypass captain delivery/payment.
create or replace function public.update_apparel_post_order_status(p_order_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.apparel_post_orders%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if p_status not in ('confirmed','rejected','cancelled') then
    raise exception using errcode='22023',message='Seller-side status may only confirm, reject, or cancel. Captains complete delivery.';
  end if;
  select * into v_order from public.apparel_post_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='Apparel order not found'; end if;
  if v_user_id=v_order.buyer_id then
    if v_order.status<>'pending' or p_status<>'cancelled' then raise exception using errcode='42501',message='Buyers may only cancel pending orders'; end if;
  elsif v_user_id=v_order.seller_id or (select private.has_permission('posts.manage')) then
    if not ((v_order.status='pending' and p_status in ('confirmed','rejected','cancelled')) or (v_order.status='confirmed' and p_status='cancelled')) then
      raise exception using errcode='22023',message='Invalid apparel order status transition';
    end if;
  else
    raise exception using errcode='42501',message='You cannot manage this apparel order';
  end if;
  if p_status in ('rejected','cancelled') and v_order.status in ('pending','confirmed') then
    update public.apparel_variants set stock_quantity=stock_quantity+v_order.quantity,updated_at=now() where id=v_order.variant_id;
  end if;
  update public.apparel_post_orders set status=p_status,updated_at=now() where id=p_order_id;
  return jsonb_build_object('id',p_order_id,'status',p_status);
end;
$function$;
revoke all on function public.update_apparel_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_apparel_post_order_status(uuid,text) to authenticated;

create or replace function public.update_product_post_order_status(p_order_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.electronics_post_orders%rowtype;
  v_current_stock integer;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if p_status not in ('confirmed','rejected','cancelled') then
    raise exception using errcode='22023',message='Seller-side status may only confirm, reject, or cancel. Captains complete delivery.';
  end if;
  select * into v_order from public.electronics_post_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='Product post order not found'; end if;
  if v_order.post_category not in ('electronics'::public.post_category,'general'::public.post_category,'supermarket'::public.post_category,'beauty'::public.post_category,'kids'::public.post_category,'online_stores'::public.post_category,'delivery'::public.post_category) then
    raise exception using errcode='42501',message='This order category cannot use this workflow';
  end if;
  if v_user_id=v_order.buyer_id then
    if v_order.status<>'pending' or p_status<>'cancelled' then raise exception using errcode='42501',message='Buyers may only cancel pending product orders'; end if;
  elsif v_user_id=v_order.seller_id or (select private.has_permission('posts.manage')) then
    if not ((v_order.status='pending' and p_status in ('confirmed','rejected','cancelled')) or (v_order.status='confirmed' and p_status='cancelled')) then
      raise exception using errcode='22023',message='Invalid product order status transition';
    end if;
  else
    raise exception using errcode='42501',message='You cannot manage this product order';
  end if;
  if p_status in ('rejected','cancelled') and v_order.status in ('pending','confirmed')
    and v_order.product_details ? 'stock_quantity'
    and coalesce(v_order.product_details->>'stock_quantity','') ~ '^[0-9]+$' then
    select case when coalesce(nullif(btrim(p.category_details->>'stock_quantity'),''),'') ~ '^[0-9]+$'
      then (p.category_details->>'stock_quantity')::integer else 0 end
    into v_current_stock from public.posts p where p.id=v_order.post_id for update;
    if found then
      update public.posts set category_details=jsonb_set(coalesce(category_details,'{}'::jsonb),'{stock_quantity}',to_jsonb(coalesce(v_current_stock,0)+v_order.quantity),true)
      where id=v_order.post_id and category=v_order.post_category;
    end if;
  end if;
  update public.electronics_post_orders set status=p_status,updated_at=now() where id=p_order_id;
  return jsonb_build_object('id',p_order_id,'status',p_status);
end;
$function$;
revoke all on function public.update_product_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_product_post_order_status(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
