-- Captain delivery workflow for apparel and eligible direct-post orders.
-- Additive only: keep prior order history and existing store/food delivery paths.

alter table public.apparel_post_orders
  add column if not exists captain_id uuid references public.profiles(id) on delete set null,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists accepted_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists on_the_way_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_collected_at timestamptz;

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conname='apparel_post_orders_delivery_status_v1_check' and conrelid='public.apparel_post_orders'::regclass) then
    alter table public.apparel_post_orders add constraint apparel_post_orders_delivery_status_v1_check
      check(delivery_status in ('pending','accepted','picked_up','on_the_way','arrived','delivered','failed','cancelled'));
  end if;
  if not exists(select 1 from pg_constraint where conname='apparel_post_orders_payment_status_v1_check' and conrelid='public.apparel_post_orders'::regclass) then
    alter table public.apparel_post_orders add constraint apparel_post_orders_payment_status_v1_check
      check(payment_status in ('pending','collected','failed','refunded'));
  end if;
end;
$constraints$;

alter table public.electronics_post_orders
  add column if not exists captain_id uuid references public.profiles(id) on delete set null,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists accepted_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists on_the_way_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists payment_collected_at timestamptz;

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conname='electronics_post_orders_delivery_status_v1_check' and conrelid='public.electronics_post_orders'::regclass) then
    alter table public.electronics_post_orders add constraint electronics_post_orders_delivery_status_v1_check
      check(delivery_status in ('pending','accepted','picked_up','on_the_way','arrived','delivered','failed','cancelled'));
  end if;
end;
$constraints$;

create index if not exists apparel_post_orders_captain_status_idx
  on public.apparel_post_orders(captain_id,delivery_status,created_at desc);
create index if not exists electronics_post_orders_captain_status_idx
  on public.electronics_post_orders(captain_id,delivery_status,created_at desc);

-- Direct-post tables become captain-readable only for open offers, participants,
-- or authorized post managers. Writes remain RPC-only.
drop policy if exists apparel_post_orders_select_participants on public.apparel_post_orders;
create policy apparel_post_orders_select_participants on public.apparel_post_orders
for select to authenticated
using (
  buyer_id=(select auth.uid())
  or seller_id=(select auth.uid())
  or (select private.has_permission('posts.manage'))
  or (
    (select private.has_permission('deliveries.claim'))
    and (
      captain_id=(select auth.uid())
      or (captain_id is null and status='confirmed' and delivery_status='pending')
    )
  )
);

drop policy if exists electronics_post_orders_select_participants on public.electronics_post_orders;
create policy electronics_post_orders_select_participants on public.electronics_post_orders
for select to authenticated
using (
  buyer_id=(select auth.uid())
  or seller_id=(select auth.uid())
  or (select private.has_permission('posts.manage'))
  or (
    (select private.has_permission('deliveries.claim'))
    and (
      captain_id=(select auth.uid())
      or (captain_id is null and status='confirmed' and delivery_status='pending')
    )
  )
);

-- Expand the commission ledger to use the existing separate order tables.
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

-- Make seller-funded Share rewards available only after the order is delivered
-- and its payment is confirmed, including apparel.
create or replace function private.award_post_share_reward()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user_id uuid;
  v_earning_id uuid;
  v_balance_after numeric(14,2);
  v_order_type text;
  v_title text;
begin
  if tg_table_name='food_post_orders' then
    if new.status<>'delivered' or new.payment_status<>'collected' then return new; end if;
    v_user_id:=new.buyer_id;
    v_order_type:='food_post';
    v_title:=new.post_title;
  elsif tg_table_name='apparel_post_orders' then
    if new.status<>'delivered' or new.payment_status<>'collected' then return new; end if;
    v_user_id:=new.buyer_id;
    v_order_type:='apparel_post';
    v_title:=new.post_title;
  else
    return new;
  end if;

  if new.share_link_id is null or coalesce(new.share_reward_iqd,0)<=0 then return new; end if;
  insert into public.share_earnings(sharer_id,share_link_id,post_id,post_title,order_type,order_id,order_number,amount_iqd)
  select l.sharer_id,l.id,new.post_id,v_title,v_order_type,new.id,new.order_number,new.share_reward_iqd
  from public.post_share_links l
  join public.posts p on p.id=l.post_id
  where l.id=new.share_link_id
    and l.post_id=new.post_id
    and l.sharer_id<>v_user_id
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
    'Reward for a completed purchase from a shared post'
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

drop trigger if exists award_apparel_post_share_reward on public.apparel_post_orders;
create trigger award_apparel_post_share_reward
after update of status,payment_status on public.apparel_post_orders
for each row execute function private.award_post_share_reward();

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
    v_complete:=new.status='delivered' and new.payment_status='collected';
    v_cancelled:=new.status in ('cancelled','rejected') or new.delivery_status in ('cancelled','failed');
  else
    v_complete:=new.status='delivered' and new.payment_status='collected';
    v_cancelled:=new.status in ('cancelled','rejected') or new.delivery_status in ('cancelled','failed');
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
    where user_id=v_hold.seller_id and balance_iqd>=v_hold.reward_iqd and held_iqd>=v_hold.reward_iqd;
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

drop trigger if exists zzz_settle_apparel_share_reward on public.apparel_post_orders;
create trigger zzz_settle_apparel_share_reward
after update of status,payment_status,delivery_status on public.apparel_post_orders
for each row execute function private.settle_seller_share_reward_after_order();

create or replace function public.claim_direct_post_delivery(p_order_type text,p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_app public.apparel_post_orders%rowtype;
  v_product public.electronics_post_orders%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not private.has_permission('deliveries.claim') then raise exception using errcode='42501',message='Captain delivery permission required'; end if;

  if p_order_type='apparel_post' then
    update public.apparel_post_orders
    set captain_id=v_user_id,delivery_status='accepted',accepted_at=now(),updated_at=now()
    where id=p_order_id and status='confirmed' and captain_id is null and delivery_status='pending'
    returning * into v_app;
    if not found then
      select * into v_app from public.apparel_post_orders where id=p_order_id and captain_id=v_user_id;
      if not found then raise exception using errcode='P0001',message='This delivery is no longer available'; end if;
    end if;
    return jsonb_build_object('id',v_app.id,'order_number',v_app.order_number,'order_type',p_order_type,'captain_id',v_app.captain_id,'delivery_status',v_app.delivery_status,'total_iqd',v_app.total_iqd,'payment_method',v_app.payment_method);
  elsif p_order_type='product_post' then
    update public.electronics_post_orders
    set captain_id=v_user_id,delivery_status='accepted',accepted_at=now(),updated_at=now()
    where id=p_order_id and status='confirmed' and captain_id is null and delivery_status='pending'
    returning * into v_product;
    if not found then
      select * into v_product from public.electronics_post_orders where id=p_order_id and captain_id=v_user_id;
      if not found then raise exception using errcode='P0001',message='This delivery is no longer available'; end if;
    end if;
    return jsonb_build_object('id',v_product.id,'order_number',v_product.order_number,'order_type',p_order_type,'captain_id',v_product.captain_id,'delivery_status',v_product.delivery_status,'total_iqd',v_product.total_iqd,'payment_method',v_product.payment_method);
  else
    raise exception using errcode='22023',message='Unsupported direct post order type';
  end if;
end;
$function$;
revoke all on function public.claim_direct_post_delivery(text,uuid) from public,anon;
grant execute on function public.claim_direct_post_delivery(text,uuid) to authenticated;

create or replace function public.update_direct_post_delivery_status(p_order_type text,p_order_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_app public.apparel_post_orders%rowtype;
  v_product public.electronics_post_orders%rowtype;
  v_allowed boolean;
  v_stock integer;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not private.has_permission('deliveries.status_update') then raise exception using errcode='42501',message='Captain delivery permission required'; end if;
  if p_status not in ('picked_up','on_the_way','arrived','delivered','failed','cancelled') then
    raise exception using errcode='22023',message='Invalid direct delivery status';
  end if;

  if p_order_type='apparel_post' then
    select * into v_app from public.apparel_post_orders where id=p_order_id and captain_id=v_user_id for update;
    if not found then raise exception using errcode='42501',message='This delivery is not assigned to you'; end if;
    v_allowed:=(v_app.delivery_status='accepted' and p_status in ('picked_up','failed','cancelled'))
      or (v_app.delivery_status='picked_up' and p_status in ('on_the_way','failed','cancelled'))
      or (v_app.delivery_status='on_the_way' and p_status in ('arrived','failed','cancelled'))
      or (v_app.delivery_status='arrived' and p_status in ('delivered','failed','cancelled'));
    if not v_allowed then raise exception using errcode='22023',message='Invalid delivery status transition'; end if;

    if p_status in ('failed','cancelled') and v_app.status='confirmed' then
      update public.apparel_variants set stock_quantity=stock_quantity+v_app.quantity where id=v_app.variant_id;
    end if;

    update public.apparel_post_orders
    set delivery_status=p_status,
        picked_up_at=case when p_status='picked_up' then now() else picked_up_at end,
        on_the_way_at=case when p_status='on_the_way' then now() else on_the_way_at end,
        arrived_at=case when p_status='arrived' then now() else arrived_at end,
        delivered_at=case when p_status='delivered' then now() else delivered_at end,
        status=case when p_status='delivered' then 'delivered' when p_status in ('failed','cancelled') then 'cancelled' else status end,
        updated_at=now()
    where id=p_order_id returning * into v_app;
    return jsonb_build_object('id',v_app.id,'order_number',v_app.order_number,'delivery_status',v_app.delivery_status,'status',v_app.status,'total_iqd',v_app.total_iqd);
  elsif p_order_type='product_post' then
    select * into v_product from public.electronics_post_orders where id=p_order_id and captain_id=v_user_id for update;
    if not found then raise exception using errcode='42501',message='This delivery is not assigned to you'; end if;
    v_allowed:=(v_product.delivery_status='accepted' and p_status in ('picked_up','failed','cancelled'))
      or (v_product.delivery_status='picked_up' and p_status in ('on_the_way','failed','cancelled'))
      or (v_product.delivery_status='on_the_way' and p_status in ('arrived','failed','cancelled'))
      or (v_product.delivery_status='arrived' and p_status in ('delivered','failed','cancelled'));
    if not v_allowed then raise exception using errcode='22023',message='Invalid delivery status transition'; end if;

    if p_status in ('failed','cancelled') and v_product.status='confirmed'
       and v_product.product_details ? 'stock_quantity'
       and coalesce(v_product.product_details->>'stock_quantity','') ~ '^[0-9]+$' then
      select case when coalesce(nullif(btrim(category_details->>'stock_quantity'),''),'') ~ '^[0-9]+$'
        then (category_details->>'stock_quantity')::integer else 0 end
      into v_stock from public.posts where id=v_product.post_id for update;
      if found then
        update public.posts set category_details=jsonb_set(coalesce(category_details,'{}'::jsonb),'{stock_quantity}',
          to_jsonb(coalesce(v_stock,0)+v_product.quantity),true) where id=v_product.post_id;
      end if;
    end if;

    update public.electronics_post_orders
    set delivery_status=p_status,
        picked_up_at=case when p_status='picked_up' then now() else picked_up_at end,
        on_the_way_at=case when p_status='on_the_way' then now() else on_the_way_at end,
        arrived_at=case when p_status='arrived' then now() else arrived_at end,
        delivered_at=case when p_status='delivered' then now() else delivered_at end,
        status=case when p_status='delivered' then 'delivered' when p_status in ('failed','cancelled') then 'cancelled' else status end,
        updated_at=now()
    where id=p_order_id returning * into v_product;
    return jsonb_build_object('id',v_product.id,'order_number',v_product.order_number,'delivery_status',v_product.delivery_status,'status',v_product.status,'total_iqd',v_product.total_iqd);
  else
    raise exception using errcode='22023',message='Unsupported direct post order type';
  end if;
end;
$function$;
revoke all on function public.update_direct_post_delivery_status(text,uuid,text) from public,anon;
grant execute on function public.update_direct_post_delivery_status(text,uuid,text) to authenticated;

create or replace function public.record_direct_post_payment(p_order_type text,p_order_id uuid,p_amount_iqd numeric,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_app public.apparel_post_orders%rowtype;
  v_product public.electronics_post_orders%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not private.has_permission('deliveries.status_update') then raise exception using errcode='42501',message='Captain delivery permission required'; end if;
  if char_length(coalesce(p_note,''))>1000 then raise exception using errcode='22023',message='Payment note is too long'; end if;

  if p_order_type='apparel_post' then
    select * into v_app from public.apparel_post_orders where id=p_order_id and captain_id=v_user_id for update;
    if not found then raise exception using errcode='42501',message='This order is not assigned to you'; end if;
    if v_app.delivery_status<>'delivered' then raise exception using errcode='22023',message='Mark this delivery as delivered before recording COD'; end if;
    if v_app.payment_method<>'cash_on_delivery' then raise exception using errcode='22023',message='This order is not payable to the captain as cash on delivery'; end if;
    if round(coalesce(p_amount_iqd,0),2)<>v_app.total_iqd then raise exception using errcode='22023',message='Received amount must match the order total'; end if;
    if v_app.payment_status='collected' then return jsonb_build_object('id',v_app.id,'payment_status',v_app.payment_status,'amount_iqd',v_app.total_iqd,'payment_collected_at',v_app.payment_collected_at); end if;
    update public.apparel_post_orders set payment_status='collected',payment_collected_at=now(),updated_at=now()
    where id=p_order_id returning * into v_app;
    return jsonb_build_object('id',v_app.id,'payment_status',v_app.payment_status,'amount_iqd',v_app.total_iqd,'payment_collected_at',v_app.payment_collected_at);
  elsif p_order_type='product_post' then
    select * into v_product from public.electronics_post_orders where id=p_order_id and captain_id=v_user_id for update;
    if not found then raise exception using errcode='42501',message='This order is not assigned to you'; end if;
    if v_product.delivery_status<>'delivered' then raise exception using errcode='22023',message='Mark this delivery as delivered before recording COD'; end if;
    if v_product.payment_method<>'cash_on_delivery' then raise exception using errcode='22023',message='This order is not payable to the captain as cash on delivery'; end if;
    if round(coalesce(p_amount_iqd,0),2)<>v_product.total_iqd then raise exception using errcode='22023',message='Received amount must match the order total'; end if;
    if v_product.payment_status='collected' then return jsonb_build_object('id',v_product.id,'payment_status',v_product.payment_status,'amount_iqd',v_product.total_iqd,'payment_collected_at',v_product.payment_collected_at); end if;
    update public.electronics_post_orders set payment_status='collected',payment_collected_at=now(),updated_at=now()
    where id=p_order_id returning * into v_product;
    return jsonb_build_object('id',v_product.id,'payment_status',v_product.payment_status,'amount_iqd',v_product.total_iqd,'payment_collected_at',v_product.payment_collected_at);
  else
    raise exception using errcode='22023',message='Unsupported direct post order type';
  end if;
end;
$function$;
revoke all on function public.record_direct_post_payment(text,uuid,numeric,text) from public,anon;
grant execute on function public.record_direct_post_payment(text,uuid,numeric,text) to authenticated;

-- Reuse the same commission hold ledger for all direct-post captain assignments.
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
  elsif tg_table_name='food_post_orders' then
    v_type:='food_post'; v_id:=new.id; v_captain:=new.captain_id; v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  elsif tg_table_name='apparel_post_orders' then
    v_type:='apparel_post'; v_id:=new.id; v_captain:=new.captain_id; v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  else
    v_type:='product_post'; v_id:=new.id; v_captain:=new.captain_id; v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  end if;

  if tg_op='UPDATE' then v_old_captain:=old.captain_id; end if;
  v_start:=(tg_op='INSERT' and v_captain is not null)
       or (tg_op='UPDATE' and v_old_captain is distinct from v_captain and v_captain is not null);

  if v_start then
    select * into v_hold from public.captain_delivery_commission_holds where order_type=v_type and order_id=v_id for update;
    if found and v_hold.status='charged' then raise exception 'A completed delivery cannot be reassigned'; end if;
    if found and v_hold.status='reserved' then
      update public.prepaid_wallet_accounts set held_iqd=held_iqd-v_hold.commission_iqd,updated_at=now()
      where user_id=v_hold.captain_id and held_iqd>=v_hold.commission_iqd;
      if not found then raise exception 'Captain commission reservation is inconsistent'; end if;
      if v_hold.commission_iqd>0 then
        insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
        values(v_hold.captain_id,'hold_release',v_hold.commission_iqd,v_type,v_id,'کۆمسیۆنی کاپتنی پێشوو ئازادکرا');
      end if;
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

drop trigger if exists captain_commission_reserve_apparel_order on public.apparel_post_orders;
create trigger captain_commission_reserve_apparel_order
before update of captain_id,delivery_status,status on public.apparel_post_orders
for each row execute function private.reserve_captain_delivery_commission_before();
drop trigger if exists captain_commission_reserve_product_post_order on public.electronics_post_orders;
create trigger captain_commission_reserve_product_post_order
before update of captain_id,delivery_status,status on public.electronics_post_orders
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
  v_subtotal bigint:=0;
  v_platform_fee bigint:=0;
  v_total bigint:=0;
  v_cash_id uuid;
begin
  if tg_table_name='deliveries' then
    if new.status::text<>'delivered' or old.status::text='delivered' then return new; end if;
    v_type:='store_delivery'; v_id:=new.id; v_captain:=new.captain_id;
    select * into v_order from public.orders where id=new.order_id;
    v_fee:=round(coalesce(v_order.delivery_fee_iqd,0))::bigint;
    v_subtotal:=round(coalesce(v_order.subtotal_iqd,0))::bigint;
    v_platform_fee:=round(coalesce(v_order.platform_fee_iqd,0))::bigint;
    v_total:=round(coalesce(v_order.total_iqd,0))::bigint;
    select cs.payment_method::text into v_payment_method from public.checkout_sessions cs where cs.id=v_order.checkout_session_id;
  else
    if new.delivery_status<>'delivered' or old.delivery_status='delivered' then return new; end if;
    v_captain:=new.captain_id;
    v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_subtotal:=round(coalesce(new.line_total_iqd,0))::bigint;
    v_platform_fee:=round(coalesce(new.platform_fee_iqd,0))::bigint;
    v_total:=round(coalesce(new.total_iqd,0))::bigint;
    if tg_table_name='food_post_orders' then v_type:='food_post'; else
      v_type:=case when tg_table_name='apparel_post_orders' then 'apparel_post' else 'product_post' end;
    end if;
    v_payment_method:=new.payment_method;
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
    values(v_captain,case when tg_table_name='deliveries' then v_order.id else v_id end,v_subtotal,v_fee,v_platform_fee,v_total,
      v_type||':'||v_id::text,'COD collected when direct-post delivery was marked delivered')
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.finalize_captain_delivery_commission() from public,anon,authenticated;

drop trigger if exists zzz_finalize_apparel_delivery_finance on public.apparel_post_orders;
create trigger zzz_finalize_apparel_delivery_finance
after update of delivery_status on public.apparel_post_orders
for each row execute function private.finalize_captain_delivery_commission();
drop trigger if exists zzz_finalize_product_post_delivery_finance on public.electronics_post_orders;
create trigger zzz_finalize_product_post_delivery_finance
after update of delivery_status on public.electronics_post_orders
for each row execute function private.finalize_captain_delivery_commission();

create or replace function private.record_direct_post_cod_collection()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_type text;
begin
  if new.payment_status='collected' and old.payment_status is distinct from 'collected'
     and new.payment_method='cash_on_delivery' and new.delivery_status='delivered' and new.captain_id is not null then
    v_type:=case when tg_table_name='apparel_post_orders' then 'apparel_post' else 'product_post' end;
    insert into public.captain_cash_ledger(captain_id,order_id,product_subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,cash_collected_iqd,idempotency_key,note)
    values(new.captain_id,new.id,round(new.line_total_iqd)::bigint,round(new.delivery_fee_iqd)::bigint,
      round(coalesce(new.platform_fee_iqd,0))::bigint,round(new.total_iqd)::bigint,
      v_type||':'||new.id::text,'COD collected for a completed direct-post delivery')
    on conflict(idempotency_key) do nothing;
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


-- Sellers cannot mark direct-post orders delivered themselves; only the assigned
-- captain's delivery RPC may finalize the delivery status.
create or replace function private.guard_direct_post_delivery_completion()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  if new.status='delivered' and old.status is distinct from 'delivered' then
    if new.delivery_status<>'delivered' or new.captain_id is null or new.captain_id is distinct from auth.uid() then
      raise exception using errcode='42501',message='Only the assigned captain can complete this direct-post delivery';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_direct_post_delivery_completion() from public,anon,authenticated;
drop trigger if exists guard_apparel_direct_delivery_completion on public.apparel_post_orders;
create trigger guard_apparel_direct_delivery_completion
before update of status on public.apparel_post_orders
for each row execute function private.guard_direct_post_delivery_completion();
drop trigger if exists guard_product_direct_delivery_completion on public.electronics_post_orders;
create trigger guard_product_direct_delivery_completion
before update of status on public.electronics_post_orders
for each row execute function private.guard_direct_post_delivery_completion();

notify pgrst,'reload schema';
