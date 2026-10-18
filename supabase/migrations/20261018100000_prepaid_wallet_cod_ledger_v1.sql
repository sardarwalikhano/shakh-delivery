-- Additive wallet and COD accounting foundation for SHAKH.
-- No existing tables or transaction history are removed.
create extension if not exists pgcrypto;

create table if not exists public.prepaid_wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  balance_iqd bigint not null default 0 check (balance_iqd >= 0),
  held_iqd bigint not null default 0 check (held_iqd >= 0),
  lifetime_credited_iqd bigint not null default 0 check (lifetime_credited_iqd >= 0),
  lifetime_spent_iqd bigint not null default 0 check (lifetime_spent_iqd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prepaid_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('topup_approved','spend','spend_refund','admin_adjustment','hold','hold_release')),
  amount_iqd bigint not null check (amount_iqd > 0),
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  description_ku text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists prepaid_wallet_transactions_user_created_idx
  on public.prepaid_wallet_transactions(user_id, created_at desc);

create table if not exists public.prepaid_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_iqd bigint not null check (amount_iqd > 0),
  payment_method text not null check (payment_method in ('mobile_cash','zain_cash','fastpay','qi_card','bank_transfer','other')),
  receipt_path text not null,
  sender_reference text,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_transaction_id uuid references public.prepaid_wallet_transactions(id) on delete restrict
);
create index if not exists prepaid_topup_requests_status_created_idx
  on public.prepaid_topup_requests(status, requested_at desc);
create unique index if not exists prepaid_topup_one_pending_per_user
  on public.prepaid_topup_requests(user_id) where status = 'pending';

create table if not exists public.captain_cash_ledger (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null,
  product_subtotal_iqd bigint not null default 0 check (product_subtotal_iqd >= 0),
  delivery_fee_iqd bigint not null default 0 check (delivery_fee_iqd >= 0),
  platform_fee_iqd bigint not null default 0 check (platform_fee_iqd >= 0),
  cash_collected_iqd bigint not null check (cash_collected_iqd >= 0),
  cash_remitted_iqd bigint not null default 0 check (cash_remitted_iqd >= 0 and cash_remitted_iqd <= cash_collected_iqd),
  status text not null default 'collected' check (status in ('collected','partially_remitted','settled','disputed')),
  idempotency_key text not null unique,
  collected_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_by uuid references auth.users(id) on delete set null,
  note text
);
create index if not exists captain_cash_ledger_captain_status_idx
  on public.captain_cash_ledger(captain_id, status, collected_at desc);
create index if not exists captain_cash_ledger_order_idx on public.captain_cash_ledger(order_id);


insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('wallet-payment-receipts','wallet-payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists wallet_receipts_insert_own on storage.objects;
create policy wallet_receipts_insert_own on storage.objects for insert to authenticated
with check (bucket_id='wallet-payment-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists wallet_receipts_select_owner_or_finance on storage.objects;
create policy wallet_receipts_select_owner_or_finance on storage.objects for select to authenticated
using (bucket_id='wallet-payment-receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select private.has_permission('wallets.manage'))));

alter table public.prepaid_wallet_accounts enable row level security;
alter table public.prepaid_wallet_transactions enable row level security;
alter table public.prepaid_topup_requests enable row level security;
alter table public.captain_cash_ledger enable row level security;

drop policy if exists prepaid_wallet_accounts_select_own on public.prepaid_wallet_accounts;
create policy prepaid_wallet_accounts_select_own on public.prepaid_wallet_accounts
  for select to authenticated using (user_id = (select auth.uid()) or (select private.has_permission('wallets.manage')));
drop policy if exists prepaid_wallet_transactions_select_own on public.prepaid_wallet_transactions;
create policy prepaid_wallet_transactions_select_own on public.prepaid_wallet_transactions
  for select to authenticated using (user_id = (select auth.uid()) or (select private.has_permission('wallets.manage')));
drop policy if exists prepaid_topup_requests_select_own on public.prepaid_topup_requests;
create policy prepaid_topup_requests_select_own on public.prepaid_topup_requests
  for select to authenticated using (user_id = (select auth.uid()) or (select private.has_permission('wallets.manage')));
drop policy if exists captain_cash_ledger_select_own_or_finance on public.captain_cash_ledger;
create policy captain_cash_ledger_select_own_or_finance on public.captain_cash_ledger
  for select to authenticated using (captain_id = (select auth.uid()) or (select private.has_permission('wallets.manage')));

revoke insert, update, delete on public.prepaid_wallet_accounts from anon, authenticated;
revoke insert, update, delete on public.prepaid_wallet_transactions from anon, authenticated;
revoke insert, update, delete on public.prepaid_topup_requests from anon, authenticated;
revoke insert, update, delete on public.captain_cash_ledger from anon, authenticated;

insert into public.permissions(code, description) values
  ('wallets.view_own','View own prepaid wallet and COD collection ledger'),
  ('wallets.manage','Manage prepaid top-ups and captain cash settlement')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role, permission_code)
values
 ('super_admin'::public.app_role,'wallets.manage'),
 ('admin'::public.app_role,'wallets.manage'),
 ('captain'::public.app_role,'wallets.view_own'),
 ('restaurant_vendor'::public.app_role,'wallets.view_own'),
 ('fashion_vendor'::public.app_role,'wallets.view_own'),
 ('car_dealer'::public.app_role,'wallets.view_own'),
 ('umrah_agency'::public.app_role,'wallets.view_own')
on conflict do nothing;

create or replace function public.request_prepaid_topup(
  p_amount_iqd bigint,
  p_payment_method text,
  p_receipt_path text,
  p_sender_reference text default null,
  p_note text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount_iqd < 1 or p_amount_iqd > 100000000 then raise exception 'Invalid top-up amount'; end if;
  if p_payment_method not in ('mobile_cash','zain_cash','fastpay','qi_card','bank_transfer','other') then raise exception 'Invalid payment method'; end if;
  if p_receipt_path is null or length(trim(p_receipt_path)) < 3 then raise exception 'Payment receipt is required'; end if;
  if (storage.foldername(trim(p_receipt_path)))[1] is distinct from auth.uid()::text then raise exception 'Receipt must belong to the authenticated user'; end if;
  if length(p_receipt_path) > 1000 or length(coalesce(p_sender_reference,'')) > 200 or length(coalesce(p_note,'')) > 1000 then raise exception 'Input too long'; end if;
  if exists (select 1 from public.prepaid_topup_requests r where r.user_id=auth.uid() and r.status='pending') then
    raise exception 'You already have a pending top-up request';
  end if;
  insert into public.prepaid_wallet_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  insert into public.prepaid_topup_requests(user_id,amount_iqd,payment_method,receipt_path,sender_reference,note)
  values(auth.uid(),p_amount_iqd,p_payment_method,trim(p_receipt_path),nullif(trim(p_sender_reference),''),nullif(trim(p_note),'')) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_prepaid_topup(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_req public.prepaid_topup_requests%rowtype; v_tx uuid;
begin
  if auth.uid() is null or not private.has_permission('wallets.manage') then raise exception 'Not authorized'; end if;
  if p_action not in ('approve','reject') then raise exception 'Invalid action'; end if;
  if length(coalesce(p_admin_note,'')) > 2000 then raise exception 'Admin note too long'; end if;
  select * into v_req from public.prepaid_topup_requests where id=p_request_id for update;
  if not found then raise exception 'Top-up request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'Top-up request has already been reviewed'; end if;
  if p_action='reject' then
    update public.prepaid_topup_requests set status='rejected',admin_note=nullif(trim(p_admin_note),''),reviewed_by=auth.uid(),reviewed_at=now() where id=v_req.id;
    return jsonb_build_object('status','rejected','request_id',v_req.id);
  end if;
  insert into public.prepaid_wallet_accounts(user_id) values(v_req.user_id) on conflict(user_id) do nothing;
  update public.prepaid_wallet_accounts
    set balance_iqd=balance_iqd+v_req.amount_iqd,
        lifetime_credited_iqd=lifetime_credited_iqd+v_req.amount_iqd,updated_at=now()
    where user_id=v_req.user_id;
  insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
  values(v_req.user_id,'topup_approved',v_req.amount_iqd,'topup_request',v_req.id,'topup:'||v_req.id::text,'زیادکردنی باڵانس دوای پەسەندکردنی بەڵگە',auth.uid())
  returning id into v_tx;
  update public.prepaid_topup_requests set status='approved',admin_note=nullif(trim(p_admin_note),''),reviewed_by=auth.uid(),reviewed_at=now(),approved_transaction_id=v_tx where id=v_req.id;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(auth.uid(),'wallet.topup.approved','prepaid_topup_request',v_req.id::text,jsonb_build_object('user_id',v_req.user_id,'amount_iqd',v_req.amount_iqd));
  return jsonb_build_object('status','approved','request_id',v_req.id,'transaction_id',v_tx);
end;
$$;

revoke all on function public.request_prepaid_topup(bigint,text,text,text,text) from public, anon;
grant execute on function public.request_prepaid_topup(bigint,text,text,text,text) to authenticated;
revoke all on function public.review_prepaid_topup(uuid,text,text) from public, anon;
grant execute on function public.review_prepaid_topup(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
