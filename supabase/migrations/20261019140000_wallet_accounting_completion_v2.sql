-- Final integration fixes for direct-post captain commissions and funded Share awards.
-- Additive: retain existing rows and ledgers; replace only trigger/function behavior.
begin;

-- A reshare creates a new token. Earlier tokens remain valid for their own 24-hour
-- window instead of being invalidated early by the next share action.
create or replace function public.create_post_share_link(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_post public.posts%rowtype;
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='Authentication required';
  end if;

  select * into v_post
  from public.posts p
  where p.id=p_post_id and p.status='active'::public.post_status
  for share;

  if not found then
    raise exception using errcode='P0002',message='This post is not available to share';
  end if;
  if v_post.author_id=v_user_id then
    raise exception using errcode='42501',message='Post owners cannot earn by sharing their own post';
  end if;

  insert into public.post_share_links(post_id,sharer_id,is_active,expires_at)
  values(p_post_id,v_user_id,true,now()+interval '24 hours')
  returning id into v_link_id;

  return v_link_id;
end;
$function$;
revoke all on function public.create_post_share_link(uuid) from public,anon;
grant execute on function public.create_post_share_link(uuid) to authenticated;


-- Reserve the agreed percentage against the actual order type for all captain
-- deliveries. Use captain-specific percentage if configured, otherwise global default.
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
  v_percent numeric(5,2):=20;
  v_commission bigint:=0;
  v_balance bigint:=0;
  v_held bigint:=0;
  v_hold public.captain_delivery_commission_holds%rowtype;
  v_terminal boolean:=false;
  v_start boolean:=false;
  v_key text;
begin
  if tg_table_name='deliveries' then
    v_type:='store_delivery';
    v_id:=new.id;
    v_captain:=new.captain_id;
    v_fee:=coalesce((select round(o.delivery_fee_iqd,0)::bigint from public.orders o where o.id=new.order_id),0);
    v_terminal:=new.status::text in ('failed','cancelled');
  elsif tg_table_name='food_post_orders' then
    v_type:='food_post';
    v_id:=new.id;
    v_captain:=new.captain_id;
    v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  elsif tg_table_name='apparel_post_orders' then
    v_type:='apparel_post';
    v_id:=new.id;
    v_captain:=new.captain_id;
    v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  else
    v_type:='product_post';
    v_id:=new.id;
    v_captain:=new.captain_id;
    v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  end if;

  if tg_op='UPDATE' then v_old_captain:=old.captain_id; end if;
  v_start:=(tg_op='INSERT' and v_captain is not null)
    or (tg_op='UPDATE' and v_old_captain is distinct from v_captain and v_captain is not null);

  if v_start and not v_terminal then
    select * into v_hold
    from public.captain_delivery_commission_holds
    where order_type=v_type and order_id=v_id
    for update;

    if found and v_hold.status='charged' then
      raise exception using errcode='22023',message='A completed delivery cannot be reassigned';
    end if;

    if found and v_hold.status='reserved' then
      update public.prepaid_wallet_accounts
      set held_iqd=held_iqd-v_hold.commission_iqd,updated_at=now()
      where user_id=v_hold.captain_id and held_iqd>=v_hold.commission_iqd;
      if not found then raise exception 'Captain commission reservation is inconsistent'; end if;

      if v_hold.commission_iqd>0 then
        v_key:='captain-fee-release:'||v_type||':'||v_id::text||':'||v_hold.captain_id::text;
        insert into public.prepaid_wallet_transactions(
          user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku
        ) values(
          v_hold.captain_id,'hold_release',v_hold.commission_iqd,v_type,v_id,v_key,
          'کۆمسیۆنی کاپتنی پێشوو ئازادکرا'
        ) on conflict(user_id,idempotency_key) do nothing;
      end if;
      update public.captain_delivery_commission_holds
      set status='released',settled_at=now()
      where id=v_hold.id;
    end if;

    v_percent:=private.captain_delivery_commission_percent(v_captain);
    v_commission:=round(v_fee*coalesce(v_percent,20)/100,0)::bigint;

    insert into public.prepaid_wallet_accounts(user_id)
    values(v_captain) on conflict(user_id) do nothing;

    select balance_iqd,held_iqd into v_balance,v_held
    from public.prepaid_wallet_accounts
    where user_id=v_captain
    for update;

    if v_balance-v_held<v_commission then
      raise exception using errcode='22023',
        message='باڵانسی پریپەیدی کاپتن بۆ کۆمسیۆنی ئەم گەیاندنە بەس نییە؛ پێش وەرگرتنی ئۆردەر جزدانەکە پڕ بکەرەوە.';
    end if;

    if v_commission>0 then
      update public.prepaid_wallet_accounts
      set held_iqd=held_iqd+v_commission,updated_at=now()
      where user_id=v_captain;

      v_key:='captain-fee-hold:'||v_type||':'||v_id::text||':'||v_captain::text;
      insert into public.prepaid_wallet_transactions(
        user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku
      ) values(
        v_captain,'hold',v_commission,v_type,v_id,v_key,
        'کۆمسیۆنی ڕێککەوتوو تا تەواوبوونی ئۆردەر گیرا'
      ) on conflict(user_id,idempotency_key) do nothing;
    end if;

    insert into public.captain_delivery_commission_holds(
      captain_id,order_type,order_id,delivery_fee_iqd,commission_iqd,status,created_at,settled_at
    ) values(v_captain,v_type,v_id,v_fee,v_commission,'reserved',now(),null)
    on conflict(order_type,order_id) do update
    set captain_id=excluded.captain_id,
        delivery_fee_iqd=excluded.delivery_fee_iqd,
        commission_iqd=excluded.commission_iqd,
        status='reserved',
        created_at=now(),
        settled_at=null;

    return new;
  end if;

  if v_terminal or v_captain is null then
    select * into v_hold
    from public.captain_delivery_commission_holds
    where order_type=v_type and order_id=v_id
    for update;

    if found and v_hold.status='reserved' then
      update public.prepaid_wallet_accounts
      set held_iqd=held_iqd-v_hold.commission_iqd,updated_at=now()
      where user_id=v_hold.captain_id and held_iqd>=v_hold.commission_iqd;
      if not found then raise exception 'Captain commission reservation is inconsistent'; end if;

      if v_hold.commission_iqd>0 then
        v_key:='captain-fee-cancel:'||v_type||':'||v_id::text;
        insert into public.prepaid_wallet_transactions(
          user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku
        ) values(
          v_hold.captain_id,'hold_release',v_hold.commission_iqd,v_type,v_id,v_key,
          'کۆمسیۆنی گەیاندنی هەڵوەشاوە ئازادکرا'
        ) on conflict(user_id,idempotency_key) do nothing;
      end if;

      update public.captain_delivery_commission_holds
      set status='released',settled_at=now()
      where id=v_hold.id;
    end if;
  end if;

  return new;
end;
$function$;
revoke all on function private.reserve_captain_delivery_commission_before() from public,anon,authenticated;

drop trigger if exists captain_commission_reserve_store_delivery on public.deliveries;
create trigger captain_commission_reserve_store_delivery
before insert or update of captain_id,status on public.deliveries
for each row execute function private.reserve_captain_delivery_commission_before();

drop trigger if exists captain_commission_reserve_food_order on public.food_post_orders;
create trigger captain_commission_reserve_food_order
before insert or update of captain_id,delivery_status,status on public.food_post_orders
for each row execute function private.reserve_captain_delivery_commission_before();

drop trigger if exists captain_commission_reserve_apparel_order on public.apparel_post_orders;
create trigger captain_commission_reserve_apparel_order
before update of captain_id,delivery_status,status on public.apparel_post_orders
for each row execute function private.reserve_captain_delivery_commission_before();

drop trigger if exists captain_commission_reserve_product_post_order on public.electronics_post_orders;
create trigger captain_commission_reserve_product_post_order
before update of captain_id,delivery_status,status on public.electronics_post_orders
for each row execute function private.reserve_captain_delivery_commission_before();


-- Finalize the hold and daily captain profit using the correct order type.
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
  v_subtotal bigint:=0;
  v_platform_fee bigint:=0;
  v_total bigint:=0;
  v_key text;
begin
  if tg_table_name='deliveries' then
    if new.status::text<>'delivered' or old.status::text='delivered' then return new; end if;
    v_type:='store_delivery';
    v_id:=new.id;
    v_captain:=new.captain_id;
    select * into v_order from public.orders where id=new.order_id;
    v_fee:=round(coalesce(v_order.delivery_fee_iqd,0))::bigint;
    v_subtotal:=round(coalesce(v_order.subtotal_iqd,0))::bigint;
    v_platform_fee:=round(coalesce(v_order.platform_fee_iqd,0))::bigint;
    v_total:=round(coalesce(v_order.total_iqd,0))::bigint;
    select cs.payment_method::text into v_payment_method
    from public.checkout_sessions cs where cs.id=v_order.checkout_session_id;
  else
    if new.delivery_status<>'delivered' or old.delivery_status='delivered' then return new; end if;
    v_id:=new.id;
    v_captain:=new.captain_id;
    v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_subtotal:=round(coalesce(new.line_total_iqd,0))::bigint;
    v_platform_fee:=round(coalesce(new.platform_fee_iqd,0))::bigint;
    v_total:=round(coalesce(new.total_iqd,0))::bigint;
    v_payment_method:=new.payment_method;
    v_type:=case tg_table_name
      when 'food_post_orders' then 'food_post'
      when 'apparel_post_orders' then 'apparel_post'
      else 'product_post'
    end;
  end if;

  if v_captain is null then return new; end if;

  select * into v_hold
  from public.captain_delivery_commission_holds
  where order_type=v_type and order_id=v_id
  for update;

  if found and v_hold.status='reserved' then
    v_commission:=v_hold.commission_iqd;

    update public.prepaid_wallet_accounts
    set balance_iqd=balance_iqd-v_commission,
        held_iqd=held_iqd-v_commission,
        lifetime_spent_iqd=lifetime_spent_iqd+v_commission,
        updated_at=now()
    where user_id=v_captain and balance_iqd>=v_commission and held_iqd>=v_commission
    returning balance_iqd into v_balance;
    if not found then raise exception 'Captain commission reservation is inconsistent; delivery completion was rolled back'; end if;

    if v_commission>0 then
      v_key:='captain-fee-settle:'||v_type||':'||v_id::text;
      insert into public.prepaid_wallet_transactions(
        user_id,transaction_type,amount_iqd,reference_type,reference_id,idempotency_key,description_ku
      ) values(
        v_captain,'captain_delivery_commission',v_commission,v_type,v_id,v_key,
        'کۆمسیۆنی ڕێککەوتووی گەیاندن لە جزدانی کاپتن کەمکراوە'
      ) on conflict(user_id,idempotency_key) do nothing;
    end if;

    update public.captain_delivery_commission_holds
    set status='charged',settled_at=now()
    where id=v_hold.id;
  else
    v_commission:=0;
  end if;

  insert into public.captain_delivery_earnings(
    captain_id,order_type,order_id,delivery_fee_iqd,commission_iqd,net_earning_iqd,earning_day
  ) values(
    v_captain,v_type,v_id,v_fee,v_commission,greatest(0,v_fee-v_commission),(now() at time zone 'Asia/Baghdad')::date
  ) on conflict(order_type,order_id) do nothing;

  if tg_table_name='deliveries' and v_payment_method='cash_on_delivery' then
    insert into public.captain_cash_ledger(
      captain_id,order_id,order_type,product_subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,
      cash_collected_iqd,cash_remitted_iqd,status,idempotency_key,collected_at,note
    ) values(
      v_captain,v_order.id,'store_order',v_subtotal,v_fee,v_platform_fee,v_total,0,'collected',
      'store_delivery:'||v_id::text,coalesce(new.delivered_at,now()),
      'COD collected when store delivery was marked delivered'
    ) on conflict(idempotency_key) do nothing;
  end if;

  return new;
end;
$function$;
revoke all on function private.finalize_captain_delivery_commission() from public,anon,authenticated;

drop trigger if exists zzz_finalize_store_delivery_finance on public.deliveries;
create trigger zzz_finalize_store_delivery_finance
after update of status on public.deliveries
for each row execute function private.finalize_captain_delivery_commission();

drop trigger if exists zzz_finalize_food_post_delivery_finance on public.food_post_orders;
create trigger zzz_finalize_food_post_delivery_finance
after update of delivery_status on public.food_post_orders
for each row execute function private.finalize_captain_delivery_commission();

drop trigger if exists zzz_finalize_apparel_delivery_finance on public.apparel_post_orders;
create trigger zzz_finalize_apparel_delivery_finance
after update of delivery_status on public.apparel_post_orders
for each row execute function private.finalize_captain_delivery_commission();

drop trigger if exists zzz_finalize_product_post_delivery_finance on public.electronics_post_orders;
create trigger zzz_finalize_product_post_delivery_finance
after update of delivery_status on public.electronics_post_orders
for each row execute function private.finalize_captain_delivery_commission();


-- The seller's order must be completed and paid, and the seller-funded reward
-- hold must have been charged, before the referrer receives wallet credit.
create or replace function private.award_post_share_reward()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_buyer_id uuid;
  v_earning_id uuid;
  v_balance_after numeric(14,2);
  v_order_type text;
  v_title text;
begin
  if new.status<>'delivered' or new.payment_status<>'collected' then return new; end if;
  if not coalesce(new.share_reward_settled,false) or new.share_link_id is null or coalesce(new.share_reward_iqd,0)<=0 then return new; end if;

  v_buyer_id:=new.buyer_id;
  v_order_type:=case tg_table_name when 'food_post_orders' then 'food_post' else 'apparel_post' end;
  v_title:=new.post_title;

  insert into public.share_earnings(
    sharer_id,share_link_id,post_id,post_title,order_type,order_id,order_number,amount_iqd
  )
  select l.sharer_id,l.id,new.post_id,v_title,v_order_type,new.id,new.order_number,round(new.share_reward_iqd)::numeric
  from public.post_share_links l
  join public.posts p on p.id=l.post_id
  where l.id=new.share_link_id
    and l.post_id=new.post_id
    and l.sharer_id<>v_buyer_id
    and l.sharer_id<>new.seller_id
    and p.author_id=new.seller_id
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
  select e.sharer_id,'earning',e.amount_iqd,v_balance_after,e.order_type,e.order_id,'قازانجی Share بۆ داواکاری تەواوبوو زیادکرا'
  from public.share_earnings e where e.id=v_earning_id;

  insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
  select e.sharer_id,'share_earning','خەڵاتی شێرکردن زیادکرا',
      'خەڵاتی '||to_char(e.amount_iqd,'FM999,999,999,990')||' د.ع بۆ کڕینی '||e.post_title||' زیادکرا.',
      'تمت إضافة مكافأة مشاركة','تمت إضافة مكافأتك لعملية شراء مكتملة.',
      'Share reward credited','Your reward for a completed purchase is now available.',
      '/dashboard/referral-wallet','share_earning',e.id,
      jsonb_build_object('amount_iqd',e.amount_iqd,'order_number',e.order_number,'post_id',e.post_id)
  from public.share_earnings e where e.id=v_earning_id;

  return new;
end;
$function$;

create or replace function private.award_electronics_post_share_reward()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_earning_id uuid;
  v_balance_after numeric(14,2);
  v_order_type text;
begin
  if new.status<>'delivered' or new.payment_status<>'collected' then return new; end if;
  if not coalesce(new.share_reward_settled,false) or new.share_link_id is null or coalesce(new.share_reward_iqd,0)<=0 then return new; end if;

  v_order_type:=case when new.post_category::text='electronics' then 'electronics_post' else 'product_post' end;

  insert into public.share_earnings(
    sharer_id,share_link_id,post_id,post_title,order_type,order_id,order_number,amount_iqd
  )
  select l.sharer_id,l.id,new.post_id,new.post_title,v_order_type,new.id,new.order_number,round(new.share_reward_iqd)::numeric
  from public.post_share_links l
  join public.posts p on p.id=l.post_id
  where l.id=new.share_link_id
    and l.post_id=new.post_id
    and l.sharer_id<>new.buyer_id
    and l.sharer_id<>new.seller_id
    and p.author_id=new.seller_id
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
  select e.sharer_id,'earning',e.amount_iqd,v_balance_after,e.order_type,e.order_id,'قازانجی Share بۆ کڕینی بەرهەم زیادکرا'
  from public.share_earnings e where e.id=v_earning_id;

  insert into public.notifications(user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data)
  select e.sharer_id,'share_earning','خەڵاتی شێرکردن زیادکرا',
      'خەڵاتی '||to_char(e.amount_iqd,'FM999,999,999,990')||' د.ع بۆ کڕینی '||e.post_title||' زیادکرا.',
      'تمت إضافة مكافأة مشاركة','تمت إضافة مكافأتك لعملية شراء مكتملة.',
      'Share reward credited','Your reward for a completed purchase is now available.',
      '/dashboard/referral-wallet','share_earning',e.id,
      jsonb_build_object('amount_iqd',e.amount_iqd,'order_number',e.order_number,'post_id',e.post_id)
  from public.share_earnings e where e.id=v_earning_id;

  return new;
end;
$function$;
revoke all on function private.award_post_share_reward() from public,anon,authenticated;
revoke all on function private.award_electronics_post_share_reward() from public,anon,authenticated;

drop trigger if exists award_food_post_share_reward on public.food_post_orders;
create trigger award_food_post_share_reward
after update of status,payment_status on public.food_post_orders
for each row execute function private.award_post_share_reward();

drop trigger if exists award_apparel_post_share_reward on public.apparel_post_orders;
create trigger award_apparel_post_share_reward
after update of status,payment_status on public.apparel_post_orders
for each row execute function private.award_post_share_reward();

drop trigger if exists electronics_post_orders_award_share_reward on public.electronics_post_orders;
create trigger electronics_post_orders_award_share_reward
after update of status,payment_status on public.electronics_post_orders
for each row execute function private.award_electronics_post_share_reward();


-- Keep COD rows labeled by their true source order type, not the store default.
create or replace function private.record_direct_post_cod_collection()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare v_type text;
begin
  if new.payment_status='collected'
     and old.payment_status is distinct from 'collected'
     and new.payment_method='cash_on_delivery'
     and new.delivery_status='delivered'
     and new.captain_id is not null then
    v_type:=case when tg_table_name='apparel_post_orders' then 'apparel_post' else 'product_post' end;
    insert into public.captain_cash_ledger(
      captain_id,order_id,order_type,product_subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,
      cash_collected_iqd,cash_remitted_iqd,status,idempotency_key,collected_at,note
    ) values(
      new.captain_id,new.id,v_type,round(new.line_total_iqd)::bigint,round(new.delivery_fee_iqd)::bigint,
      round(coalesce(new.platform_fee_iqd,0))::bigint,round(new.total_iqd)::bigint,0,'collected',
      v_type||':'||new.id::text,coalesce(new.payment_collected_at,now()),
      'COD collected for a completed direct-post delivery'
    ) on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.record_direct_post_cod_collection() from public,anon,authenticated;

drop trigger if exists zzz_record_apparel_post_cod_collection on public.apparel_post_orders;
create trigger zzz_record_apparel_post_cod_collection
after update of payment_status on public.apparel_post_orders
for each row execute function private.record_direct_post_cod_collection();

drop trigger if exists zzz_record_product_post_cod_collection on public.electronics_post_orders;
create trigger zzz_record_product_post_cod_collection
after update of payment_status on public.electronics_post_orders
for each row execute function private.record_direct_post_cod_collection();


-- Correct older order-type constraints even when deployments had already applied
-- a prior draft version; do not alter or delete existing financial history.
alter table public.captain_delivery_commission_holds
  drop constraint if exists captain_delivery_commission_holds_order_type_check;
alter table public.captain_delivery_commission_holds
  add constraint captain_delivery_commission_holds_order_type_check
  check(order_type in ('store_delivery','food_post','apparel_post','product_post'));

alter table public.captain_delivery_earnings
  drop constraint if exists captain_delivery_earnings_order_type_check;
alter table public.captain_delivery_earnings
  add constraint captain_delivery_earnings_order_type_check
  check(order_type in ('store_delivery','food_post','apparel_post','product_post'));


-- FIB is a supported payout route as well as FastPay; reserve wallet funds once.
create or replace function public.request_share_withdrawal(
  p_amount_iqd numeric,
  p_payment_method text,
  p_recipient_name text,
  p_recipient_account text default null,
  p_recipient_phone text default null,
  p_user_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric(14,2);
  v_balance_after numeric(14,2);
  v_request public.share_withdrawal_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='Authentication required';
  end if;
  if p_amount_iqd is null or p_amount_iqd<=0 or p_amount_iqd<>trunc(p_amount_iqd) or p_amount_iqd>1000000000 then
    raise exception using errcode='22023',message='Withdrawal amount must be a positive whole IQD amount';
  end if;
  if p_payment_method not in ('mobile_cash','zain_cash','fastpay','fib','qi_card','bank_transfer','other') then
    raise exception using errcode='22023',message='Unsupported withdrawal method';
  end if;
  if p_recipient_name is null or char_length(btrim(p_recipient_name))<2 or char_length(p_recipient_name)>160 then
    raise exception using errcode='22023',message='Recipient name is required';
  end if;
  if char_length(coalesce(p_recipient_account,''))>200 or char_length(coalesce(p_recipient_phone,''))>50 or char_length(coalesce(p_user_note,''))>1000 then
    raise exception using errcode='22023',message='Withdrawal details are too long';
  end if;
  if p_payment_method in ('mobile_cash','zain_cash','fastpay','fib','qi_card')
     and nullif(btrim(coalesce(p_recipient_phone,p_recipient_account,'')),'') is null then
    raise exception using errcode='22023',message='Recipient phone or account number is required';
  end if;
  if p_payment_method in ('bank_transfer','other')
     and nullif(btrim(coalesce(p_recipient_account,'')),'') is null then
    raise exception using errcode='22023',message='Recipient account detail is required';
  end if;

  insert into public.share_wallet_accounts(user_id)
  values(v_user_id) on conflict(user_id) do nothing;

  select balance_iqd into v_balance
  from public.share_wallet_accounts
  where user_id=v_user_id
  for update;

  if v_balance<p_amount_iqd then
    raise exception using errcode='22023',message='Your available share balance is not enough';
  end if;

  update public.share_wallet_accounts
  set balance_iqd=balance_iqd-p_amount_iqd,updated_at=now()
  where user_id=v_user_id
  returning balance_iqd into v_balance_after;

  insert into public.share_withdrawal_requests(
    user_id,amount_iqd,payment_method,recipient_name,recipient_account,recipient_phone,user_note
  ) values(
    v_user_id,p_amount_iqd,p_payment_method,btrim(p_recipient_name),
    nullif(btrim(coalesce(p_recipient_account,'')),''),
    nullif(btrim(coalesce(p_recipient_phone,'')),''),
    nullif(btrim(coalesce(p_user_note,'')),'')
  ) returning * into v_request;

  insert into public.share_wallet_transactions(
    user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description
  ) values(
    v_user_id,'withdrawal_reserved',-p_amount_iqd,v_balance_after,'withdrawal_request',v_request.id,
    'Balance reserved for a withdrawal request'
  );

  return jsonb_build_object(
    'id',v_request.id,'amount_iqd',v_request.amount_iqd,'payment_method',v_request.payment_method,
    'status',v_request.status,'requested_at',v_request.requested_at,'balance_iqd',v_balance_after
  );
end;
$function$;
revoke all on function public.request_share_withdrawal(numeric,text,text,text,text,text) from public,anon;
grant execute on function public.request_share_withdrawal(numeric,text,text,text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
