-- Finalize SHAKH share attribution, seller/captain prepaid commissions, payout proof,
-- and immutable COD settlement. Additive: existing orders and histories remain intact.
begin;

-- Prevent duplicate legacy triggers from reserving/settling the same seller-funded reward.
drop trigger if exists zzz_reserve_food_share_reward on public.food_post_orders;
drop trigger if exists zzz_reserve_apparel_share_reward on public.apparel_post_orders;
drop trigger if exists zzz_reserve_electronics_share_reward on public.electronics_post_orders;
drop trigger if exists zzz_settle_food_share_reward on public.food_post_orders;
drop trigger if exists zzz_settle_apparel_share_reward on public.apparel_post_orders;
drop trigger if exists zzz_settle_electronics_share_reward on public.electronics_post_orders;
-- Cash is recorded by the actual food payment event, not by a second order-update path.
drop trigger if exists zzz_record_food_post_cod_collection on public.food_post_orders;
-- Use the shared per-captain commission rule, not a second food-only commission hold.
drop trigger if exists reserve_food_captain_commission on public.food_post_orders;

-- A fresh share action gets a distinct token with a strict 24-hour lifetime.
alter table public.post_share_links add column if not exists expires_at timestamptz;
update public.post_share_links
set expires_at = coalesce(expires_at, created_at + interval '24 hours')
where expires_at is null;
update public.post_share_links
set is_active = false
where is_active and expires_at <= now();

alter table public.post_share_links alter column expires_at set default (now() + interval '24 hours');
alter table public.post_share_links alter column expires_at set not null;
alter table public.post_share_links drop constraint if exists post_share_links_post_id_sharer_id_key;
create index if not exists post_share_links_post_sharer_expiry_idx
  on public.post_share_links(post_id, sharer_id, expires_at desc);
create index if not exists post_share_links_active_expiry_idx
  on public.post_share_links(expires_at) where is_active;

create or replace function public.create_post_share_link(p_post_id uuid)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_post public.posts%rowtype;
  v_link_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  select * into v_post from public.posts p
  where p.id=p_post_id and p.status='active'::public.post_status
  for share;
  if not found then raise exception using errcode='P0002', message='This post is not available to share'; end if;
  if v_post.author_id=v_user_id then
    raise exception using errcode='42501', message='Post owners cannot earn by sharing their own post';
  end if;
  update public.post_share_links set is_active=false
  where post_id=p_post_id and sharer_id=v_user_id and is_active=true;
  insert into public.post_share_links(post_id,sharer_id,is_active,expires_at)
  values(p_post_id,v_user_id,true,now()+interval '24 hours')
  returning id into v_link_id;
  return v_link_id;
end;
$function$;
revoke all on function public.create_post_share_link(uuid) from public, anon;
grant execute on function public.create_post_share_link(uuid) to authenticated;

-- Commission rules are editable only by financial administrators.
create table if not exists public.wallet_commission_settings (
  category text primary key,
  seller_fee_per_unit_iqd bigint not null default 100 check (seller_fee_per_unit_iqd between 0 and 10000000),
  captain_fee_percent numeric(5,2) not null default 20 check (captain_fee_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.wallet_commission_settings(category,seller_fee_per_unit_iqd,captain_fee_percent)
values
 ('food',100,20),('fashion',100,20),('electronics',100,20),('general',100,20),
 ('supermarket',100,20),('beauty',100,20),('kids',100,20),('online_stores',100,20),('delivery',100,20)
on conflict(category) do nothing;
alter table public.wallet_commission_settings enable row level security;
drop policy if exists wallet_commission_settings_select_admin on public.wallet_commission_settings;
create policy wallet_commission_settings_select_admin on public.wallet_commission_settings
for select to authenticated using ((select private.has_permission('wallets.manage')));
revoke insert,update,delete on public.wallet_commission_settings from anon,authenticated;
grant select on public.wallet_commission_settings to authenticated;

create or replace function public.update_wallet_commission_setting(
 p_category text, p_seller_fee_per_unit_iqd bigint, p_captain_fee_percent numeric
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare v_row public.wallet_commission_settings%rowtype;
begin
 if auth.uid() is null or not private.has_permission('wallets.manage') then raise exception using errcode='42501', message='Not authorized'; end if;
 if p_category not in ('food','fashion','electronics','general','supermarket','beauty','kids','online_stores','delivery') then raise exception using errcode='22023',message='Unsupported post category'; end if;
 if p_seller_fee_per_unit_iqd is null or p_seller_fee_per_unit_iqd<0 or p_seller_fee_per_unit_iqd>10000000 then raise exception using errcode='22023',message='Invalid seller fee'; end if;
 if p_captain_fee_percent is null or p_captain_fee_percent<0 or p_captain_fee_percent>100 then raise exception using errcode='22023',message='Invalid captain fee percentage'; end if;
 insert into public.wallet_commission_settings(category,seller_fee_per_unit_iqd,captain_fee_percent,updated_by)
 values(p_category,p_seller_fee_per_unit_iqd,p_captain_fee_percent,auth.uid())
 on conflict(category) do update set seller_fee_per_unit_iqd=excluded.seller_fee_per_unit_iqd,
 captain_fee_percent=excluded.captain_fee_percent,updated_at=now(),updated_by=auth.uid()
 returning * into v_row;
 insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
 values(auth.uid(),'wallet.commission.updated','wallet_commission_settings',p_category,
 jsonb_build_object('seller_fee_per_unit_iqd',v_row.seller_fee_per_unit_iqd,'captain_fee_percent',v_row.captain_fee_percent));
 return jsonb_build_object('category',v_row.category,'seller_fee_per_unit_iqd',v_row.seller_fee_per_unit_iqd,'captain_fee_percent',v_row.captain_fee_percent);
end;
$function$;
revoke all on function public.update_wallet_commission_setting(text,bigint,numeric) from public,anon;
grant execute on function public.update_wallet_commission_setting(text,bigint,numeric) to authenticated;

-- Order-level snapshots and idempotency markers.
alter table public.food_post_orders
 add column if not exists seller_fee_iqd bigint not null default 0,
 add column if not exists seller_fee_reserved boolean not null default false,
 add column if not exists seller_fee_settled boolean not null default false,
 add column if not exists seller_fee_released boolean not null default false,
 add column if not exists share_reward_reserved_iqd bigint not null default 0,
 add column if not exists share_reward_reserved boolean not null default false,
 add column if not exists share_reward_settled boolean not null default false,
 add column if not exists share_reward_released boolean not null default false,
 add column if not exists captain_fee_iqd bigint not null default 0,
 add column if not exists captain_fee_reserved boolean not null default false,
 add column if not exists captain_fee_settled boolean not null default false,
 add column if not exists captain_fee_released boolean not null default false;

alter table public.apparel_post_orders
 add column if not exists seller_fee_iqd bigint not null default 0,
 add column if not exists seller_fee_reserved boolean not null default false,
 add column if not exists seller_fee_settled boolean not null default false,
 add column if not exists seller_fee_released boolean not null default false,
 add column if not exists share_reward_reserved_iqd bigint not null default 0,
 add column if not exists share_reward_reserved boolean not null default false,
 add column if not exists share_reward_settled boolean not null default false,
 add column if not exists share_reward_released boolean not null default false;

alter table public.electronics_post_orders
 add column if not exists seller_fee_iqd bigint not null default 0,
 add column if not exists seller_fee_reserved boolean not null default false,
 add column if not exists seller_fee_settled boolean not null default false,
 add column if not exists seller_fee_released boolean not null default false,
 add column if not exists share_reward_reserved_iqd bigint not null default 0,
 add column if not exists share_reward_reserved boolean not null default false,
 add column if not exists share_reward_settled boolean not null default false,
 add column if not exists share_reward_released boolean not null default false;

create or replace function private.reserve_seller_fee_for_post_order()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
 v_category text;
 v_fee_per_unit bigint := 0;
 v_fee bigint := 0;
 v_seller_id uuid;
begin
 v_seller_id := new.seller_id;
 if tg_table_name='electronics_post_orders' then
   v_category := new.post_category::text;
 else
   select p.category::text into v_category from public.posts p where p.id=new.post_id;
 end if;
 select s.seller_fee_per_unit_iqd into v_fee_per_unit
 from public.wallet_commission_settings s where s.category=v_category;
 v_fee := greatest(0,coalesce(v_fee_per_unit,0))*greatest(1,coalesce(new.quantity,1));
 new.seller_fee_iqd := v_fee;
 new.seller_fee_reserved := v_fee>0;
 new.seller_fee_settled := false;
 new.seller_fee_released := false;
 if v_fee=0 then return new; end if;
 insert into public.prepaid_wallet_accounts(user_id) values(v_seller_id) on conflict(user_id) do nothing;
 update public.prepaid_wallet_accounts
 set held_iqd=held_iqd+v_fee,updated_at=now()
 where user_id=v_seller_id and balance_iqd-held_iqd>=v_fee;
 if not found then
   raise exception using errcode='22023', message='Seller prepaid wallet has insufficient balance; the seller must top up before this order can be placed';
 end if;
 insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
 values(v_seller_id,'hold',v_fee,tg_table_name,new.id,'seller-fee-hold:'||tg_table_name||':'||new.id::text,
 'پارەی کۆمسیۆنی فرۆشیار تا تەواوبوونی داواکاری گیرا',auth.uid())
 on conflict(user_id,idempotency_key) do nothing;
 return new;
end;
$function$;

create or replace function private.reserve_post_share_reward()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
 v_link public.post_share_links%rowtype;
 v_post public.posts%rowtype;
 v_reward bigint := 0;
 v_seller_id uuid;
 v_buyer_id uuid;
begin
 if new.share_link_id is null then
   new.share_reward_iqd := 0;
   new.share_reward_reserved_iqd := 0;
   new.share_reward_reserved := false;
   return new;
 end if;
 v_seller_id := new.seller_id;
 v_buyer_id := new.buyer_id;
 select * into v_link from public.post_share_links l
 where l.id=new.share_link_id and l.post_id=new.post_id and l.is_active=true and l.expires_at>now();
 if not found then
   new.share_link_id := null; new.share_reward_iqd := 0;
   new.share_reward_reserved_iqd := 0; new.share_reward_reserved := false;
   return new;
 end if;
 select * into v_post from public.posts p
 where p.id=new.post_id and p.status='active'::public.post_status;
 if not found or v_post.author_id<>v_seller_id or v_link.sharer_id in (v_buyer_id,v_seller_id) or v_post.author_id=v_link.sharer_id then
   new.share_link_id := null; new.share_reward_iqd := 0;
   new.share_reward_reserved_iqd := 0; new.share_reward_reserved := false;
   return new;
 end if;
 v_reward := greatest(0,round(coalesce(v_post.share_reward_iqd,0))::bigint)*greatest(1,coalesce(new.quantity,1));
 new.share_reward_iqd := v_reward;
 if v_reward=0 then new.share_reward_reserved_iqd:=0; new.share_reward_reserved:=false; return new; end if;
 insert into public.prepaid_wallet_accounts(user_id) values(v_seller_id) on conflict(user_id) do nothing;
 update public.prepaid_wallet_accounts
 set held_iqd=held_iqd+v_reward,updated_at=now()
 where user_id=v_seller_id and balance_iqd-held_iqd>=v_reward;
 if not found then
   raise exception using errcode='22023', message='Seller prepaid wallet has insufficient balance to fund this share reward';
 end if;
 new.share_reward_reserved_iqd := v_reward;
 new.share_reward_reserved := true;
 new.share_reward_settled := false;
 new.share_reward_released := false;
 insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
 values(v_seller_id,'hold',v_reward,tg_table_name,new.id,'share-reward-hold:'||tg_table_name||':'||new.id::text,
 'قازانجی Share تا تەواوبوونی داواکاری گیرا',auth.uid())
 on conflict(user_id,idempotency_key) do nothing;
 return new;
end;
$function$;

create trigger reserve_seller_fee_food_order before insert on public.food_post_orders
for each row execute function private.reserve_seller_fee_for_post_order();
create trigger reserve_seller_fee_apparel_order before insert on public.apparel_post_orders
for each row execute function private.reserve_seller_fee_for_post_order();
create trigger reserve_seller_fee_electronics_order before insert on public.electronics_post_orders
for each row execute function private.reserve_seller_fee_for_post_order();

create trigger reserve_share_reward_food_insert before insert on public.food_post_orders
for each row execute function private.reserve_post_share_reward();
create trigger reserve_share_reward_food_update before update of share_link_id,share_reward_iqd on public.food_post_orders
for each row execute function private.reserve_post_share_reward();
create trigger reserve_share_reward_apparel_insert before insert on public.apparel_post_orders
for each row execute function private.reserve_post_share_reward();
create trigger reserve_share_reward_apparel_update before update of share_link_id,share_reward_iqd on public.apparel_post_orders
for each row execute function private.reserve_post_share_reward();
create trigger reserve_share_reward_electronics_insert before insert on public.electronics_post_orders
for each row execute function private.reserve_post_share_reward();
create trigger reserve_share_reward_electronics_update before update of share_link_id,share_reward_iqd on public.electronics_post_orders
for each row execute function private.reserve_post_share_reward();

create or replace function private.apply_post_order_wallet_charges()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
 v_complete boolean := false;
 v_cancel boolean := false;
 v_user_id uuid;
 v_fee bigint;
begin
 if tg_table_name='food_post_orders' then
   v_complete := new.status='delivered' and new.payment_status='collected';
   v_cancel := new.status in ('cancelled','rejected') or new.delivery_status in ('cancelled','failed');
 elsif tg_table_name='electronics_post_orders' then
   v_complete := new.status='delivered' and new.payment_status='collected';
   v_cancel := new.status in ('cancelled','rejected');
 else
   v_complete := new.status='delivered' and new.payment_status='collected';
   v_cancel := new.status in ('cancelled','rejected');
 end if;
 v_user_id := new.seller_id;
 if v_cancel then
   if new.seller_fee_reserved and not new.seller_fee_settled and not new.seller_fee_released and new.seller_fee_iqd>0 then
     update public.prepaid_wallet_accounts set held_iqd=held_iqd-new.seller_fee_iqd,updated_at=now()
       where user_id=v_user_id and held_iqd>=new.seller_fee_iqd;
     if not found then raise exception 'Seller commission hold is inconsistent; cancellation was rolled back'; end if;
     insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
     values(v_user_id,'hold_release',new.seller_fee_iqd,tg_table_name,new.id,'seller-fee-release:'||tg_table_name||':'||new.id::text,
       'کۆمسیۆنی فرۆشیار بەهۆی هەڵوەشاندنەوەی داواکاری گەڕێندرایەوە',auth.uid())
     on conflict(user_id,idempotency_key) do nothing;
     new.seller_fee_released := true;
   end if;
   if new.share_reward_reserved and not new.share_reward_settled and not new.share_reward_released and new.share_reward_reserved_iqd>0 then
     update public.prepaid_wallet_accounts set held_iqd=held_iqd-new.share_reward_reserved_iqd,updated_at=now()
       where user_id=v_user_id and held_iqd>=new.share_reward_reserved_iqd;
     if not found then raise exception 'Seller share reward hold is inconsistent; cancellation was rolled back'; end if;
     insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
     values(v_user_id,'hold_release',new.share_reward_reserved_iqd,tg_table_name,new.id,'share-reward-release:'||tg_table_name||':'||new.id::text,
       'قازانجی Share بەهۆی هەڵوەشاندنەوەی داواکاری گەڕێندرایەوە',auth.uid())
     on conflict(user_id,idempotency_key) do nothing;
     new.share_reward_released := true;
   end if;
   if tg_table_name='food_post_orders' and new.captain_fee_reserved and not new.captain_fee_settled and not new.captain_fee_released and new.captain_fee_iqd>0 and new.captain_id is not null then
     update public.prepaid_wallet_accounts set held_iqd=held_iqd-new.captain_fee_iqd,updated_at=now()
       where user_id=new.captain_id and held_iqd>=new.captain_fee_iqd;
     if not found then raise exception 'Captain commission hold is inconsistent; cancellation was rolled back'; end if;
     insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
     values(new.captain_id,'hold_release',new.captain_fee_iqd,'food_post_order',new.id,'captain-fee-release:food_post:'||new.id::text,
       'کۆمسیۆنی کاپتن بەهۆی هەڵوەشاندنەوەی گەیاندن گەڕێندرایەوە',auth.uid())
     on conflict(user_id,idempotency_key) do nothing;
     new.captain_fee_released := true;
   end if;
 elsif v_complete then
   if new.seller_fee_reserved and not new.seller_fee_settled and not new.seller_fee_released and new.seller_fee_iqd>0 then
     update public.prepaid_wallet_accounts set balance_iqd=balance_iqd-new.seller_fee_iqd,
       held_iqd=held_iqd-new.seller_fee_iqd,
       lifetime_spent_iqd=lifetime_spent_iqd+new.seller_fee_iqd,updated_at=now()
       where user_id=v_user_id and balance_iqd>=new.seller_fee_iqd and held_iqd>=new.seller_fee_iqd;
     if not found then raise exception 'Seller commission hold is inconsistent; order completion was rolled back'; end if;
     insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
     values(v_user_id,'spend',new.seller_fee_iqd,tg_table_name,new.id,'seller-fee-settle:'||tg_table_name||':'||new.id::text,
       'کۆمسیۆنی فرۆشیار لە داواکاریی تەواوبوو کۆتایی پێهات',auth.uid())
     on conflict(user_id,idempotency_key) do nothing;
     new.seller_fee_settled := true;
   end if;
   if new.share_reward_reserved and not new.share_reward_settled and not new.share_reward_released and new.share_reward_reserved_iqd>0 then
     update public.prepaid_wallet_accounts set balance_iqd=balance_iqd-new.share_reward_reserved_iqd,
       held_iqd=held_iqd-new.share_reward_reserved_iqd,
       lifetime_spent_iqd=lifetime_spent_iqd+new.share_reward_reserved_iqd,updated_at=now()
       where user_id=v_user_id and balance_iqd>=new.share_reward_reserved_iqd and held_iqd>=new.share_reward_reserved_iqd;
     if not found then raise exception 'Seller share reward hold is inconsistent; order completion was rolled back'; end if;
     insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
     values(v_user_id,'spend',new.share_reward_reserved_iqd,tg_table_name,new.id,'share-reward-settle:'||tg_table_name||':'||new.id::text,
       'قازانجی Share بۆ کڕینی تەواوبوو خەرج کرا',auth.uid())
     on conflict(user_id,idempotency_key) do nothing;
     new.share_reward_settled := true;
   end if;
   if tg_table_name='food_post_orders' and new.captain_fee_reserved and not new.captain_fee_settled and not new.captain_fee_released and new.captain_fee_iqd>0 and new.captain_id is not null then
     update public.prepaid_wallet_accounts set balance_iqd=balance_iqd-new.captain_fee_iqd,
       held_iqd=held_iqd-new.captain_fee_iqd,
       lifetime_spent_iqd=lifetime_spent_iqd+new.captain_fee_iqd,updated_at=now()
       where user_id=new.captain_id and balance_iqd>=new.captain_fee_iqd and held_iqd>=new.captain_fee_iqd;
     if not found then raise exception 'Captain commission hold is inconsistent; order completion was rolled back'; end if;
     insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
     values(new.captain_id,'spend',new.captain_fee_iqd,'food_post_order',new.id,'captain-fee-settle:food_post:'||new.id::text,
       'کۆمسیۆنی کاپتن بۆ گەیاندنی تەواوبوو حساب کرا',auth.uid())
     on conflict(user_id,idempotency_key) do nothing;
     new.captain_fee_settled := true;
   end if;
 end if;
 return new;
end;
$function$;

create trigger apply_post_wallet_charges_food before update of status,payment_status,delivery_status on public.food_post_orders
for each row execute function private.apply_post_order_wallet_charges();
create trigger apply_post_wallet_charges_apparel before update of status,payment_status on public.apparel_post_orders
for each row execute function private.apply_post_order_wallet_charges();
create trigger apply_post_wallet_charges_electronics before update of status,payment_status on public.electronics_post_orders
for each row execute function private.apply_post_order_wallet_charges();

-- Hold the captain's percentage as soon as a food order is claimed; settle it only
-- after delivery and cash collection. Failed/cancelled assignments release the hold.
create or replace function private.reserve_food_captain_commission()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare v_percent numeric(5,2); v_fee bigint;
begin
 if old.captain_id is not null or new.captain_id is null then return new; end if;
 select captain_fee_percent into v_percent from public.wallet_commission_settings where category='food';
 v_fee := round(coalesce(new.delivery_fee_iqd,0)*coalesce(v_percent,20)/100,0)::bigint;
 new.captain_fee_iqd := v_fee;
 new.captain_fee_reserved := v_fee>0;
 new.captain_fee_settled := false;
 new.captain_fee_released := false;
 if v_fee=0 then return new; end if;
 insert into public.prepaid_wallet_accounts(user_id) values(new.captain_id) on conflict(user_id) do nothing;
 update public.prepaid_wallet_accounts set balance_iqd=balance_iqd-v_fee,held_iqd=held_iqd+v_fee,updated_at=now()
 where user_id=new.captain_id and balance_iqd>=v_fee;
 if not found then raise exception using errcode='22023',message='Captain prepaid wallet has insufficient balance; top up before accepting this delivery'; end if;
 insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku,created_by)
 values(new.captain_id,'hold',v_fee,'food_post_order',new.id,'captain-fee-hold:food_post:'||new.id::text,
 'کۆمسیۆنی کاپتن تا تەواوبوونی گەیاندن گیرا',auth.uid())
 on conflict(user_id,idempotency_key) do nothing;
 return new;
end;
$function$;
-- Food commissions are reserved by private.reserve_captain_delivery_commission_before,
-- shared with store and direct-post delivery flows. Do not install a duplicate hold trigger.

-- Private payout receipts: admin must upload proof before a withdrawal can be marked paid.
alter table public.share_withdrawal_requests add column if not exists payout_receipt_path text;
alter table public.share_withdrawal_requests drop constraint if exists share_withdrawal_requests_payment_method_check;
alter table public.share_withdrawal_requests add constraint share_withdrawal_requests_payment_method_check
check (payment_method = any(array['mobile_cash','zain_cash','fastpay','fib','qi_card','bank_transfer','other']));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('share-payout-receipts','share-payout-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists share_payout_receipts_admin_insert on storage.objects;
create policy share_payout_receipts_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='share-payout-receipts' and (storage.foldername(name))[1]='share-withdrawals' and (select private.has_permission('share_rewards.manage')));
drop policy if exists share_payout_receipts_admin_select on storage.objects;
create policy share_payout_receipts_admin_select on storage.objects for select to authenticated
using(bucket_id='share-payout-receipts' and (storage.foldername(name))[1]='share-withdrawals' and ((select private.has_permission('share_rewards.manage')) or exists (select 1 from public.share_withdrawal_requests r where r.payout_receipt_path=name and r.user_id=(select auth.uid()))));

drop function if exists public.review_share_withdrawal(uuid,text,text,text);
create or replace function public.review_share_withdrawal(
 p_request_id uuid, p_action text, p_admin_note text default null,
 p_payout_reference text default null, p_payout_receipt_path text default null
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
 v_user_id uuid := auth.uid();
 v_request public.share_withdrawal_requests%rowtype;
 v_balance_after numeric(14,2);
begin
 if v_user_id is null or not private.has_permission('share_rewards.manage') then raise exception using errcode='42501',message='Share reward management permission required'; end if;
 if p_action not in ('paid','rejected') then raise exception using errcode='22023',message='Action must be paid or rejected'; end if;
 if length(coalesce(p_admin_note,''))>1000 or length(coalesce(p_payout_reference,''))>200 or length(coalesce(p_payout_receipt_path,''))>1000 then raise exception using errcode='22023',message='Review details are too long'; end if;
 if p_action='paid' then
   if p_payout_receipt_path is null
      or (storage.foldername(p_payout_receipt_path))[1] <> 'share-withdrawals'
      or (storage.foldername(p_payout_receipt_path))[2] <> p_request_id::text then
     raise exception using errcode='22023',message='Upload this withdrawal request’s payment receipt before marking it paid';
   end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='share-payout-receipts' and o.name=p_payout_receipt_path) then
     raise exception using errcode='22023',message='The payout receipt file was not found in private storage';
   end if;
 end if;
 select * into v_request from public.share_withdrawal_requests where id=p_request_id for update;
 if not found then raise exception using errcode='P0002',message='Withdrawal request was not found'; end if;
 if v_request.status<>'pending' then raise exception using errcode='22023',message='This withdrawal request has already been processed'; end if;
 if p_action='paid' then
   update public.share_withdrawal_requests
   set status='paid',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),
       payout_reference=nullif(btrim(coalesce(p_payout_reference,'')),''),
       payout_receipt_path=p_payout_receipt_path,reviewed_by=v_user_id,reviewed_at=now()
   where id=p_request_id returning * into v_request;
   update public.share_wallet_accounts set lifetime_withdrawn_iqd=lifetime_withdrawn_iqd+v_request.amount_iqd,updated_at=now()
   where user_id=v_request.user_id;
 else
   insert into public.share_wallet_accounts(user_id) values(v_request.user_id) on conflict(user_id) do nothing;
   update public.share_wallet_accounts set balance_iqd=balance_iqd+v_request.amount_iqd,updated_at=now()
   where user_id=v_request.user_id returning balance_iqd into v_balance_after;
   update public.share_withdrawal_requests set status='rejected',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),
     reviewed_by=v_user_id,reviewed_at=now() where id=p_request_id returning * into v_request;
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
   jsonb_build_object('status',v_request.status,'amount_iqd',v_request.amount_iqd,'payout_reference',v_request.payout_reference,'payout_receipt_path',v_request.payout_receipt_path));
 insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
 values(v_user_id,case when p_action='paid' then 'share.withdrawal.paid' else 'share.withdrawal.rejected' end,'share_withdrawal_request',v_request.id::text,
 jsonb_build_object('user_id',v_request.user_id,'amount_iqd',v_request.amount_iqd,'payout_reference',v_request.payout_reference,'has_receipt',v_request.payout_receipt_path is not null));
 return jsonb_build_object('id',v_request.id,'amount_iqd',v_request.amount_iqd,'status',v_request.status,'payout_receipt_path',v_request.payout_receipt_path);
end;
$function$;
revoke all on function public.review_share_withdrawal(uuid,text,text,text,text) from public,anon;
grant execute on function public.review_share_withdrawal(uuid,text,text,text,text) to authenticated;

-- COD collections for food post deliveries. Each order is recorded at most once.
alter table public.captain_cash_ledger add column if not exists order_type text not null default 'store_order';
alter table public.captain_cash_ledger drop constraint if exists captain_cash_ledger_order_type_check;
alter table public.captain_cash_ledger add constraint captain_cash_ledger_order_type_check
check(order_type in ('store_order','food_post','apparel_post','product_post'));
create unique index if not exists captain_cash_ledger_idempotency_key_key on public.captain_cash_ledger(idempotency_key);

create table if not exists public.captain_cash_settlement_batches (
 id uuid primary key,
 captain_id uuid not null references auth.users(id) on delete restrict,
 amount_iqd bigint not null check(amount_iqd>0),
 note text,
 settled_by uuid not null references auth.users(id) on delete restrict,
 settled_at timestamptz not null default now()
);
create table if not exists public.captain_cash_settlement_items (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.captain_cash_settlement_batches(id) on delete restrict,
 ledger_id uuid not null references public.captain_cash_ledger(id) on delete restrict,
 amount_iqd bigint not null check(amount_iqd>0),
 created_at timestamptz not null default now(),
 unique(batch_id,ledger_id)
);
alter table public.captain_cash_settlement_batches enable row level security;
alter table public.captain_cash_settlement_items enable row level security;
drop policy if exists captain_cash_settlement_batches_scoped_select on public.captain_cash_settlement_batches;
create policy captain_cash_settlement_batches_scoped_select on public.captain_cash_settlement_batches
for select to authenticated using(captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));
drop policy if exists captain_cash_settlement_items_scoped_select on public.captain_cash_settlement_items;
create policy captain_cash_settlement_items_scoped_select on public.captain_cash_settlement_items
for select to authenticated using(exists(select 1 from public.captain_cash_settlement_batches b where b.id=batch_id and
 (b.captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')))));
grant select on public.captain_cash_ledger,public.captain_cash_settlement_batches,public.captain_cash_settlement_items to authenticated;
revoke insert,update,delete on public.captain_cash_ledger,public.captain_cash_settlement_batches,public.captain_cash_settlement_items from anon,authenticated;

create or replace function public.settle_captain_cash(
 p_request_id uuid, p_captain_id uuid, p_amount_iqd bigint, p_note text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
 v_existing public.captain_cash_settlement_batches%rowtype;
 v_row public.captain_cash_ledger%rowtype;
 v_remaining bigint;
 v_apply bigint;
 v_outstanding bigint;
begin
 if auth.uid() is null or not private.has_permission('wallets.manage') then raise exception using errcode='42501',message='Cash settlement permission required'; end if;
 if p_request_id is null or p_captain_id is null or p_amount_iqd is null or p_amount_iqd<=0 then raise exception using errcode='22023',message='Invalid settlement request'; end if;
 if length(coalesce(p_note,''))>1000 then raise exception using errcode='22023',message='Note is too long'; end if;
 perform pg_advisory_xact_lock(hashtextextended('captain-cash-settlement:'||p_request_id::text,0));
 select * into v_existing from public.captain_cash_settlement_batches where id=p_request_id;
 if found then
   if v_existing.captain_id<>p_captain_id or v_existing.amount_iqd<>p_amount_iqd then raise exception using errcode='23505',message='Settlement idempotency key was reused with different data'; end if;
   select coalesce(sum(cash_collected_iqd-cash_remitted_iqd),0)::bigint into v_outstanding
   from public.captain_cash_ledger where captain_id=p_captain_id and status in ('collected','partially_remitted');
   return jsonb_build_object('id',v_existing.id,'captain_id',v_existing.captain_id,'amount_iqd',v_existing.amount_iqd,'outstanding_iqd',v_outstanding,'already_recorded',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_captain_id::text||':captain-cash',0));
 select coalesce(sum(cash_collected_iqd-cash_remitted_iqd),0)::bigint into v_outstanding
 from public.captain_cash_ledger where captain_id=p_captain_id and status in ('collected','partially_remitted');
 if p_amount_iqd>v_outstanding then raise exception using errcode='22023',message='Settlement exceeds the captain outstanding cash balance'; end if;
 insert into public.captain_cash_settlement_batches(id,captain_id,amount_iqd,note,settled_by)
 values(p_request_id,p_captain_id,p_amount_iqd,nullif(btrim(p_note),''),auth.uid());
 v_remaining:=p_amount_iqd;
 for v_row in
   select * from public.captain_cash_ledger
   where captain_id=p_captain_id and status in ('collected','partially_remitted')
     and cash_collected_iqd>cash_remitted_iqd
   order by collected_at,id
   for update
 loop
   exit when v_remaining<=0;
   v_apply:=least(v_remaining,v_row.cash_collected_iqd-v_row.cash_remitted_iqd);
   update public.captain_cash_ledger
   set cash_remitted_iqd=cash_remitted_iqd+v_apply,
       status=case when cash_remitted_iqd+v_apply=cash_collected_iqd then 'settled' else 'partially_remitted' end,
       settled_at=case when cash_remitted_iqd+v_apply=cash_collected_iqd then now() else null end,
       settled_by=auth.uid(),note=coalesce(nullif(btrim(p_note),''),note)
   where id=v_row.id;
   insert into public.captain_cash_settlement_items(batch_id,ledger_id,amount_iqd) values(p_request_id,v_row.id,v_apply);
   v_remaining:=v_remaining-v_apply;
 end loop;
 if v_remaining<>0 then raise exception using errcode='40001',message='Cash ledger changed during settlement; retry'; end if;
 insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
 values(auth.uid(),'captain.cash.settled','captain_cash_settlement_batch',p_request_id::text,
 jsonb_build_object('captain_id',p_captain_id,'amount_iqd',p_amount_iqd));
 return jsonb_build_object('id',p_request_id,'captain_id',p_captain_id,'amount_iqd',p_amount_iqd,'outstanding_iqd',v_outstanding-p_amount_iqd);
end;
$function$;
revoke all on function public.settle_captain_cash(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.settle_captain_cash(uuid,uuid,bigint,text) to authenticated;
-- The newer idempotent settlement RPC is the only supported settlement entry point.
revoke all on function public.settle_captain_cash(uuid,bigint,text) from public,anon,authenticated;

create or replace function private.record_food_cash_collection()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare v_order public.food_post_orders%rowtype;
begin
 select * into v_order from public.food_post_orders where id=new.order_id;
 if not found or v_order.payment_method<>'cash_on_delivery' then return new; end if;
 insert into public.captain_cash_ledger(
  captain_id,order_id,order_type,product_subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,
  cash_collected_iqd,cash_remitted_iqd,status,idempotency_key,collected_at,note
 ) values(
  new.captain_id,v_order.id,'food_post',round(v_order.line_total_iqd)::bigint,
  round(v_order.delivery_fee_iqd)::bigint,round(v_order.platform_fee_iqd)::bigint,
  round(new.amount_iqd)::bigint,0,'collected','food_post:'||v_order.id::text,new.received_at,new.note
 ) on conflict(idempotency_key) do nothing;
 return new;
end;
$function$;
create trigger record_food_cash_collection_after_insert
after insert on public.food_post_payment_events
for each row execute function private.record_food_cash_collection();


-- Generic eligible post checkout now carries a server-validated share link.
create or replace function public.create_product_post_order_with_share(
 p_request_id uuid,p_post_id uuid,p_quantity integer,p_delivery_address text,
 p_buyer_phone text,p_delivery_city text,p_customer_note text default null,
 p_payment_method text default 'cash_on_delivery',p_share_link_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
 v_user_id uuid := auth.uid();
 v_existing uuid;
 v_result jsonb;
 v_order_id uuid;
 v_order public.electronics_post_orders%rowtype;
begin
 if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
 if p_request_id is null then raise exception using errcode='22023',message='Request id is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user_id::text||':'||p_request_id::text,0));
 select id into v_existing from public.electronics_post_orders
 where buyer_id=v_user_id and request_id=p_request_id;
 if found then
   return public.create_product_post_order(p_request_id,p_post_id,p_quantity,p_delivery_address,p_buyer_phone,p_delivery_city,p_customer_note,p_payment_method);
 end if;
 v_result := public.create_product_post_order(p_request_id,p_post_id,p_quantity,p_delivery_address,p_buyer_phone,p_delivery_city,p_customer_note,p_payment_method);
 v_order_id := nullif(v_result->>'id','')::uuid;
 if v_order_id is null then raise exception using errcode='22023',message='Order ID is missing from checkout response'; end if;
 if p_share_link_id is not null then
   update public.electronics_post_orders
   set share_link_id=p_share_link_id,
       share_reward_iqd=coalesce((select p.share_reward_iqd from public.posts p where p.id=post_id),0)
   where id=v_order_id and buyer_id=v_user_id
   returning * into v_order;
   if not found then raise exception using errcode='42501',message='Order attribution was not available'; end if;
 else
   select * into v_order from public.electronics_post_orders where id=v_order_id;
 end if;
 return v_result || jsonb_build_object('id',v_order.id,'share_reward_iqd',v_order.share_reward_iqd,'total_iqd',v_order.total_iqd);
end;
$function$;
revoke all on function public.create_product_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) from public,anon;
grant execute on function public.create_product_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) to authenticated;

-- The dashboard route is available to finance admins as well as wallet owners.
insert into public.role_permissions(role,permission_code)
values
 ('super_admin'::public.app_role,'wallets.view_own'),
 ('admin'::public.app_role,'wallets.view_own')
on conflict do nothing;


notify pgrst,'reload schema';
commit;
