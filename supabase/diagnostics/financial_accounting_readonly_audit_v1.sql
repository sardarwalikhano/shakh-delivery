-- SHAKH financial accounting read-only audit
-- Safe to run in Supabase SQL Editor. SELECT statements only; this script does not
-- update rows, invoke order RPCs, or alter schema.
--
-- Review each result before preparing any corrective migration.

-- 1) Financial triggers installed on order tables and the events they observe.
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname in (
    'food_post_orders',
    'apparel_post_orders',
    'electronics_post_orders',
    'deliveries'
  )
  and (
    t.tgname ilike '%wallet%'
    or t.tgname ilike '%commission%'
    or t.tgname ilike '%share_reward%'
    or t.tgname ilike '%cod%'
    or t.tgname ilike '%finance%'
  )
order by c.relname, t.tgname;

-- 2) Wallet-account invariants. Any returned row needs investigation.
select
  user_id,
  balance_iqd,
  held_iqd,
  lifetime_credited_iqd,
  lifetime_spent_iqd,
  (balance_iqd - held_iqd) as available_iqd,
  updated_at
from public.prepaid_wallet_accounts
where balance_iqd < 0
   or held_iqd < 0
   or held_iqd > balance_iqd
order by updated_at desc;

-- 3) Reserved/settled/released seller-fee flags versus their expected ledger keys.
-- This checks existence, not amount correctness; inspect rows before remediation.
select
  'food_post_orders'::text as order_table,
  o.id as order_id,
  o.seller_id,
  o.seller_fee_iqd as amount_iqd,
  o.seller_fee_reserved,
  o.seller_fee_settled,
  o.seller_fee_released,
  case
    when o.seller_fee_reserved and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-hold:food_post_orders:' || o.id::text
    ) then 'missing_hold_transaction'
    when o.seller_fee_settled and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-settle:food_post_orders:' || o.id::text
    ) then 'missing_settlement_transaction'
    when o.seller_fee_released and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-release:food_post_orders:' || o.id::text
    ) then 'missing_release_transaction'
    else 'review_flags_and_amounts'
  end as audit_result
from public.food_post_orders o
where (o.seller_fee_reserved and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-hold:food_post_orders:' || o.id::text
      ))
   or (o.seller_fee_settled and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-settle:food_post_orders:' || o.id::text
      ))
   or (o.seller_fee_released and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-release:food_post_orders:' || o.id::text
      ))

union all

select
  'apparel_post_orders',
  o.id,
  o.seller_id,
  o.seller_fee_iqd,
  o.seller_fee_reserved,
  o.seller_fee_settled,
  o.seller_fee_released,
  case
    when o.seller_fee_reserved and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-hold:apparel_post_orders:' || o.id::text
    ) then 'missing_hold_transaction'
    when o.seller_fee_settled and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-settle:apparel_post_orders:' || o.id::text
    ) then 'missing_settlement_transaction'
    when o.seller_fee_released and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-release:apparel_post_orders:' || o.id::text
    ) then 'missing_release_transaction'
    else 'review_flags_and_amounts'
  end
from public.apparel_post_orders o
where (o.seller_fee_reserved and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-hold:apparel_post_orders:' || o.id::text
      ))
   or (o.seller_fee_settled and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-settle:apparel_post_orders:' || o.id::text
      ))
   or (o.seller_fee_released and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-release:apparel_post_orders:' || o.id::text
      ))

union all

select
  'electronics_post_orders',
  o.id,
  o.seller_id,
  o.seller_fee_iqd,
  o.seller_fee_reserved,
  o.seller_fee_settled,
  o.seller_fee_released,
  case
    when o.seller_fee_reserved and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-hold:electronics_post_orders:' || o.id::text
    ) then 'missing_hold_transaction'
    when o.seller_fee_settled and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-settle:electronics_post_orders:' || o.id::text
    ) then 'missing_settlement_transaction'
    when o.seller_fee_released and not exists (
      select 1 from public.prepaid_wallet_transactions t
      where t.user_id = o.seller_id
        and t.idempotency_key = 'seller-fee-release:electronics_post_orders:' || o.id::text
    ) then 'missing_release_transaction'
    else 'review_flags_and_amounts'
  end
from public.electronics_post_orders o
where (o.seller_fee_reserved and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-hold:electronics_post_orders:' || o.id::text
      ))
   or (o.seller_fee_settled and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-settle:electronics_post_orders:' || o.id::text
      ))
   or (o.seller_fee_released and not exists (
        select 1 from public.prepaid_wallet_transactions t
        where t.user_id = o.seller_id
          and t.idempotency_key = 'seller-fee-release:electronics_post_orders:' || o.id::text
      ))
order by order_table, order_id;

-- 4) Captain commission holds whose status or referenced wallet account looks
-- inconsistent. This is a screening query, not an automatic repair.
select
  h.id,
  h.captain_id,
  h.order_type,
  h.order_id,
  h.delivery_fee_iqd,
  h.commission_iqd,
  h.status,
  a.balance_iqd,
  a.held_iqd,
  h.created_at,
  h.settled_at
from public.captain_delivery_commission_holds h
left join public.prepaid_wallet_accounts a on a.user_id = h.captain_id
where h.commission_iqd < 0
   or (h.status = 'reserved' and a.user_id is null)
   or (h.status = 'reserved' and coalesce(a.held_iqd, 0) < h.commission_iqd)
order by h.created_at desc;

-- 5) Seller-funded Share reward holds needing review.
select
  h.id,
  h.seller_id,
  h.order_type,
  h.order_id,
  h.reward_iqd,
  h.status,
  a.balance_iqd,
  a.held_iqd,
  h.created_at,
  h.settled_at
from public.seller_share_reward_holds h
left join public.prepaid_wallet_accounts a on a.user_id = h.seller_id
where h.reward_iqd < 0
   or (h.status = 'reserved' and a.user_id is null)
order by h.created_at desc;

-- 6) Current row counts are context only; empty ledgers are not by themselves
-- proof of a defect, especially if no post-migration test orders were placed.
select 'prepaid_wallet_accounts' as table_name, count(*) as row_count from public.prepaid_wallet_accounts
union all select 'prepaid_wallet_transactions', count(*) from public.prepaid_wallet_transactions
union all select 'seller_share_reward_holds', count(*) from public.seller_share_reward_holds
union all select 'captain_delivery_commission_holds', count(*) from public.captain_delivery_commission_holds
union all select 'captain_delivery_earnings', count(*) from public.captain_delivery_earnings
union all select 'captain_cash_ledger', count(*) from public.captain_cash_ledger
union all select 'share_earnings', count(*) from public.share_earnings
union all select 'share_wallet_transactions', count(*) from public.share_wallet_transactions
order by table_name;


-- 7) Orders marked delivered while delivery_status is not delivered.
-- These rows may bypass captain-delivery finalization and COD collection hooks.
-- This is diagnostic only; it does not change historical orders.
select
  'food_post_orders'::text as order_table,
  o.id as order_id,
  o.order_number,
  o.status::text as order_status,
  o.delivery_status::text as delivery_status,
  o.payment_status::text as payment_status,
  o.payment_method,
  o.captain_id,
  o.delivery_fee_iqd,
  o.created_at
from public.food_post_orders o
where o.status::text = 'delivered'
  and o.delivery_status::text is distinct from 'delivered'
union all
select
  'apparel_post_orders', o.id, o.order_number,
  o.status::text, o.delivery_status::text, o.payment_status::text,
  o.payment_method, o.captain_id, o.delivery_fee_iqd, o.created_at
from public.apparel_post_orders o
where o.status::text = 'delivered'
  and o.delivery_status::text is distinct from 'delivered'
union all
select
  'electronics_post_orders', o.id, o.order_number,
  o.status::text, o.delivery_status::text, o.payment_status::text,
  o.payment_method, o.captain_id, o.delivery_fee_iqd, o.created_at
from public.electronics_post_orders o
where o.status::text = 'delivered'
  and o.delivery_status::text is distinct from 'delivered'
order by order_table, created_at;
