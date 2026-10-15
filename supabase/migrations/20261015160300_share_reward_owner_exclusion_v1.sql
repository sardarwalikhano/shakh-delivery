-- Only the third-party sharer may earn. Post owners cannot create reward links
-- for their own posts, and historical owner-created links cannot credit earnings.
begin;

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

  insert into public.post_share_links(post_id, sharer_id, is_active)
  values (p_post_id, v_user_id, true)
  on conflict (post_id, sharer_id)
  do update set is_active=true
  returning id into v_link_id;

  return v_link_id;
end;
$function$;

create or replace function private.award_post_share_reward()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid;
  v_earning_id uuid;
  v_balance_after numeric(14,2);
  v_order_type text;
  v_title text;
begin
  if tg_table_name='food_post_orders' then
    if new.status <> 'delivered' or new.payment_status <> 'collected' then return new; end if;
    v_user_id := new.buyer_id;
    v_order_type := 'food_post';
    v_title := new.post_title;
  elsif tg_table_name='apparel_post_orders' then
    if new.status <> 'delivered' then return new; end if;
    v_user_id := new.buyer_id;
    v_order_type := 'apparel_post';
    v_title := new.post_title;
  else
    return new;
  end if;

  if new.share_link_id is null or coalesce(new.share_reward_iqd,0)<=0 then return new; end if;

  insert into public.share_earnings(
    sharer_id,share_link_id,post_id,post_title,order_type,order_id,order_number,amount_iqd
  )
  select l.sharer_id,l.id,new.post_id,v_title,v_order_type,new.id,new.order_number,new.share_reward_iqd
  from public.post_share_links l
  join public.posts p on p.id=l.post_id
  where l.id=new.share_link_id
    and l.post_id=new.post_id
    and l.sharer_id<>v_user_id
    and p.author_id<>l.sharer_id
  on conflict (order_type,order_id) do nothing
  returning id into v_earning_id;

  if v_earning_id is null then return new; end if;

  insert into public.share_wallet_accounts(user_id)
  values ((select sharer_id from public.share_earnings where id=v_earning_id))
  on conflict (user_id) do nothing;

  update public.share_wallet_accounts a
  set balance_iqd=a.balance_iqd+(select e.amount_iqd from public.share_earnings e where e.id=v_earning_id),
      lifetime_earned_iqd=a.lifetime_earned_iqd+(select e.amount_iqd from public.share_earnings e where e.id=v_earning_id),
      updated_at=now()
  where a.user_id=(select e.sharer_id from public.share_earnings e where e.id=v_earning_id)
  returning balance_iqd into v_balance_after;

  insert into public.share_wallet_transactions(
    user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description
  )
  select e.sharer_id,'earning',e.amount_iqd,v_balance_after,e.order_type,e.order_id,
         'Reward for a completed purchase from a shared post'
  from public.share_earnings e
  where e.id=v_earning_id;

  insert into public.notifications(
    user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data
  )
  select e.sharer_id,'share_earning','خەڵاتی شێرکردن زیادکرا',
         'خەڵاتی '||to_char(e.amount_iqd,'FM999,999,999,990')||' د.ع بۆ کڕینی '||e.post_title||' زیادکرا.',
         'تمت إضافة مكافأة مشاركة','تمت إضافة مكافأتك لعملية شراء مكتملة.',
         'Share reward credited','Your reward for a completed purchase is now available.',
         '/dashboard/share-rewards','share_earning',e.id,
         jsonb_build_object('amount_iqd',e.amount_iqd,'order_number',e.order_number,'post_id',e.post_id)
  from public.share_earnings e where e.id=v_earning_id;

  return new;
end;
$function$;

commit;
