-- Post sharing attribution, per-order rewards, referral wallet, monthly withdrawals,
-- and wallet payment support for the post-order flows.
-- All rewards are pending until the related order is delivered; all balance mutations
-- occur in trusted database functions/triggers rather than client-side writes.

begin;

alter table public.posts
  add column if not exists referral_reward_iqd numeric(14,2) not null default 0;

alter table public.posts
  drop constraint if exists posts_referral_reward_iqd_bounds;
alter table public.posts
  add constraint posts_referral_reward_iqd_bounds
  check (referral_reward_iqd >= 0 and referral_reward_iqd <= 100000000);

create table if not exists public.post_share_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  post_id uuid not null references public.posts(id) on delete cascade,
  sharer_id uuid not null references auth.users(id) on delete cascade,
  click_count bigint not null default 0 check (click_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, sharer_id)
);

create index if not exists post_share_links_sharer_created_idx
  on public.post_share_links(sharer_id, created_at desc);
create index if not exists post_share_links_post_idx
  on public.post_share_links(post_id);

create table if not exists public.post_share_attributions (
  buyer_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  share_link_id uuid not null references public.post_share_links(id) on delete cascade,
  attributed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  primary key (buyer_id, post_id)
);

create index if not exists post_share_attributions_expiry_idx
  on public.post_share_attributions(post_id, expires_at desc);

create table if not exists public.referral_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pending_iqd numeric(14,2) not null default 0 check (pending_iqd >= 0),
  available_iqd numeric(14,2) not null default 0 check (available_iqd >= 0),
  total_earned_iqd numeric(14,2) not null default 0 check (total_earned_iqd >= 0),
  total_withdrawn_iqd numeric(14,2) not null default 0 check (total_withdrawn_iqd >= 0),
  total_spent_iqd numeric(14,2) not null default 0 check (total_spent_iqd >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in (
    'reward_pending','reward_available','reward_reversed',
    'withdrawal_requested','withdrawal_refunded','platform_spend'
  )),
  amount_iqd numeric(14,2) not null check (amount_iqd <> 0),
  balance_bucket text not null check (balance_bucket in ('pending','available')),
  reference_type text not null,
  reference_id uuid not null,
  description_ku text not null,
  created_at timestamptz not null default now(),
  unique (user_id, transaction_type, reference_type, reference_id)
);

create index if not exists referral_wallet_transactions_user_created_idx
  on public.referral_wallet_transactions(user_id, created_at desc);

create table if not exists public.post_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  order_type text not null check (order_type in ('food','apparel')),
  order_id uuid not null,
  post_id uuid not null references public.posts(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  sharer_id uuid not null references auth.users(id) on delete restrict,
  share_link_id uuid not null references public.post_share_links(id) on delete restrict,
  reward_iqd numeric(14,2) not null check (reward_iqd > 0),
  status text not null default 'pending' check (status in ('pending','available','reversed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (order_type, order_id),
  check (buyer_id <> sharer_id)
);

create index if not exists post_referral_rewards_sharer_created_idx
  on public.post_referral_rewards(sharer_id, created_at desc);
create index if not exists post_referral_rewards_post_idx
  on public.post_referral_rewards(post_id, created_at desc);

create table if not exists public.referral_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  month_key date not null,
  amount_iqd numeric(14,2) not null check (amount_iqd > 0),
  payout_method text not null check (payout_method in ('zaincash','fastpay','bank_transfer','qi_card','other')),
  account_holder_name text not null,
  payout_account text not null,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','paid','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);

create index if not exists referral_withdrawal_user_created_idx
  on public.referral_withdrawal_requests(user_id, requested_at desc);
create index if not exists referral_withdrawal_admin_queue_idx
  on public.referral_withdrawal_requests(status, requested_at asc);
create unique index if not exists referral_withdrawal_one_final_or_active_per_month
  on public.referral_withdrawal_requests(user_id, month_key)
  where status in ('pending','approved','paid');

alter table public.food_post_orders
  add column if not exists share_link_id uuid references public.post_share_links(id) on delete set null,
  add column if not exists referrer_id uuid references auth.users(id) on delete set null,
  add column if not exists referral_reward_iqd numeric(14,2) not null default 0,
  add column if not exists referral_reward_status text not null default 'none'
    check (referral_reward_status in ('none','pending','available','reversed')),
  add column if not exists wallet_paid_iqd numeric(14,2) not null default 0
    check (wallet_paid_iqd >= 0);

alter table public.apparel_post_orders
  add column if not exists share_link_id uuid references public.post_share_links(id) on delete set null,
  add column if not exists referrer_id uuid references auth.users(id) on delete set null,
  add column if not exists referral_reward_iqd numeric(14,2) not null default 0,
  add column if not exists referral_reward_status text not null default 'none'
    check (referral_reward_status in ('none','pending','available','reversed')),
  add column if not exists wallet_paid_iqd numeric(14,2) not null default 0
    check (wallet_paid_iqd >= 0),
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending','collected','refunded'));

alter table public.food_post_cart_items
  add column if not exists share_link_id uuid references public.post_share_links(id) on delete set null;

alter table public.food_post_orders
  drop constraint if exists food_post_orders_wallet_paid_lte_total;
alter table public.food_post_orders
  add constraint food_post_orders_wallet_paid_lte_total
  check (wallet_paid_iqd <= total_iqd);

alter table public.apparel_post_orders
  drop constraint if exists apparel_post_orders_wallet_paid_lte_total;
alter table public.apparel_post_orders
  add constraint apparel_post_orders_wallet_paid_lte_total
  check (wallet_paid_iqd <= total_iqd);

alter table public.post_share_links enable row level security;
alter table public.post_share_attributions enable row level security;
alter table public.referral_wallets enable row level security;
alter table public.referral_wallet_transactions enable row level security;
alter table public.post_referral_rewards enable row level security;
alter table public.referral_withdrawal_requests enable row level security;

drop policy if exists post_share_links_read_participants on public.post_share_links;
create policy post_share_links_read_participants on public.post_share_links
  for select to authenticated
  using (sharer_id = (select auth.uid()) or (select private.has_permission('posts.manage')));

drop policy if exists post_share_attributions_read_participants on public.post_share_attributions;
create policy post_share_attributions_read_participants on public.post_share_attributions
  for select to authenticated
  using (buyer_id = (select auth.uid()) or exists (
    select 1 from public.post_share_links l
    where l.id = post_share_attributions.share_link_id and l.sharer_id = (select auth.uid())
  ) or (select private.has_permission('payments.manage')));

drop policy if exists referral_wallets_read_owner_or_finance on public.referral_wallets;
create policy referral_wallets_read_owner_or_finance on public.referral_wallets
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('payments.manage')));

drop policy if exists referral_wallet_transactions_read_owner_or_finance on public.referral_wallet_transactions;
create policy referral_wallet_transactions_read_owner_or_finance on public.referral_wallet_transactions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('payments.manage')));

drop policy if exists post_referral_rewards_read_participants on public.post_referral_rewards;
create policy post_referral_rewards_read_participants on public.post_referral_rewards
  for select to authenticated
  using (sharer_id = (select auth.uid()) or buyer_id = (select auth.uid()) or (select private.has_permission('payments.manage')));

drop policy if exists referral_withdrawals_read_owner_or_finance on public.referral_withdrawal_requests;
create policy referral_withdrawals_read_owner_or_finance on public.referral_withdrawal_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('payments.manage')));

revoke all on public.post_share_links, public.post_share_attributions,
  public.referral_wallets, public.referral_wallet_transactions,
  public.post_referral_rewards, public.referral_withdrawal_requests
  from anon, authenticated;
grant select on public.post_share_links, public.post_share_attributions,
  public.referral_wallets, public.referral_wallet_transactions,
  public.post_referral_rewards, public.referral_withdrawal_requests
  to authenticated;

revoke insert, update, delete on public.food_post_cart_items from authenticated;
grant select, insert, update, delete on public.food_post_cart_items to authenticated;

create or replace function public.create_post_share_link(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_post public.posts%rowtype;
  v_link public.post_share_links%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  select * into v_post from public.posts where id=p_post_id and status='active' for share;
  if not found then
    raise exception using errcode='P0002', message='This post is not available to share';
  end if;
  if v_post.author_id = v_user_id then
    raise exception using errcode='42501', message='You cannot earn a referral reward by sharing your own post';
  end if;

  insert into public.post_share_links(post_id, sharer_id)
  values (v_post.id, v_user_id)
  on conflict (post_id, sharer_id)
  do update set updated_at=now()
  returning * into v_link;

  return jsonb_build_object(
    'token', v_link.token,
    'post_id', v_post.id,
    'title', v_post.title,
    'reward_iqd', coalesce(v_post.referral_reward_iqd,0),
    'reward_enabled', coalesce(v_post.referral_reward_iqd,0)>0 and v_post.category in ('food'::public.post_category,'fashion'::public.post_category),
    'expires_days', 30
  );
end;
$$;

create or replace function public.register_post_share_attribution(p_share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_post_id uuid;
  v_author_id uuid;
  v_sharer_id uuid;
  v_link_id uuid;
  v_title text;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if p_share_token is null then
    raise exception using errcode='22023', message='A valid share link is required';
  end if;

  select p.id,p.author_id,l.sharer_id,l.id,p.title
    into v_post_id,v_author_id,v_sharer_id,v_link_id,v_title
  from public.post_share_links l
  join public.posts p on p.id=l.post_id
  where l.token=p_share_token and p.status='active';

  if not found then
    raise exception using errcode='P0002', message='This shared post is no longer available';
  end if;
  if v_user_id = v_sharer_id or v_user_id = v_author_id then
    return jsonb_build_object('attributed',false,'reason','self_referral');
  end if;

  insert into public.post_share_attributions(buyer_id,post_id,share_link_id,attributed_at,expires_at)
  values (v_user_id,v_post_id,v_link_id,now(),now()+interval '30 days')
  on conflict (buyer_id,post_id)
  do update set share_link_id=excluded.share_link_id,
                attributed_at=excluded.attributed_at,
                expires_at=excluded.expires_at;

  update public.post_share_links set click_count=click_count+1,updated_at=now() where id=v_link_id;
  return jsonb_build_object('attributed',true,'post_id',v_post_id,'title',v_title,'expires_at',now()+interval '30 days');
end;
$$;

create or replace function public.request_referral_withdrawal(
  p_payout_method text,
  p_account_holder_name text,
  p_payout_account text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_wallet public.referral_wallets%rowtype;
  v_request public.referral_withdrawal_requests%rowtype;
  v_month date := date_trunc('month', now() at time zone 'Asia/Baghdad')::date;
  v_amount numeric(14,2);
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_payout_method not in ('zaincash','fastpay','bank_transfer','qi_card','other') then
    raise exception using errcode='22023', message='Invalid withdrawal method';
  end if;
  if p_account_holder_name is null or char_length(btrim(p_account_holder_name))<2 or char_length(btrim(p_account_holder_name))>120 then
    raise exception using errcode='22023', message='Enter the payout account holder name';
  end if;
  if p_payout_account is null or char_length(btrim(p_payout_account))<5 or char_length(btrim(p_payout_account))>240 then
    raise exception using errcode='22023', message='Enter valid payout account details';
  end if;
  if p_note is not null and char_length(p_note)>1000 then
    raise exception using errcode='22023', message='Withdrawal note is too long';
  end if;

  insert into public.referral_wallets(user_id) values(v_user_id) on conflict(user_id) do nothing;
  select * into v_wallet from public.referral_wallets where user_id=v_user_id for update;
  if v_wallet.available_iqd<=0 then
    raise exception using errcode='22023', message='There is no available referral balance to withdraw';
  end if;

  begin
    insert into public.referral_withdrawal_requests(
      user_id,month_key,amount_iqd,payout_method,account_holder_name,payout_account,note
    ) values (
      v_user_id,v_month,v_wallet.available_iqd,p_payout_method,btrim(p_account_holder_name),
      btrim(p_payout_account),nullif(btrim(coalesce(p_note,'')),'')
    ) returning * into v_request;
  exception when unique_violation then
    raise exception using errcode='23505', message='Only one active or completed withdrawal request is allowed per calendar month';
  end;

  v_amount := v_wallet.available_iqd;
  update public.referral_wallets
    set available_iqd=0,updated_at=now()
  where user_id=v_user_id and available_iqd=v_amount;
  if not found then
    raise exception using errcode='40001', message='Wallet changed while the withdrawal was submitted; please retry';
  end if;

  insert into public.referral_wallet_transactions(
    user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
  ) values (
    v_user_id,'withdrawal_requested',-v_amount,'available','withdrawal',v_request.id,
    'داوای ڕاکێشانی هەموو باڵانسی بەردەست'
  );

  return jsonb_build_object(
    'id',v_request.id,'amount_iqd',v_amount,'status',v_request.status,'month_key',v_request.month_key
  );
end;
$$;

create or replace function public.process_referral_withdrawal(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.referral_withdrawal_requests%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('payments.manage')) then
    raise exception using errcode='42501', message='Finance permission required';
  end if;
  if p_action not in ('approve','reject','mark_paid') then
    raise exception using errcode='22023', message='Invalid withdrawal action';
  end if;
  if p_admin_note is not null and char_length(p_admin_note)>2000 then
    raise exception using errcode='22023', message='Admin note is too long';
  end if;

  select * into v_request from public.referral_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002', message='Withdrawal request not found'; end if;

  if p_action='approve' then
    if v_request.status <> 'pending' then raise exception using errcode='22023', message='Only pending requests can be approved'; end if;
    update public.referral_withdrawal_requests
      set status='approved', admin_note=nullif(btrim(coalesce(p_admin_note,'')), ''),
          reviewed_by=v_user_id, reviewed_at=now()
    where id=p_request_id returning * into v_request;
  elsif p_action='reject' then
    if v_request.status not in ('pending','approved') then raise exception using errcode='22023', message='This request can no longer be rejected'; end if;
    insert into public.referral_wallets(user_id) values(v_request.user_id) on conflict(user_id) do nothing;
    update public.referral_wallets
      set available_iqd=available_iqd+v_request.amount_iqd,updated_at=now()
    where user_id=v_request.user_id;
    insert into public.referral_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
    ) values (
      v_request.user_id,'withdrawal_refunded',v_request.amount_iqd,'available','withdrawal',v_request.id,
      'گەڕاندنەوەی باڵانس بەهۆی ڕەتکردنەوەی داوای ڕاکێشان'
    ) on conflict do nothing;
    update public.referral_withdrawal_requests
      set status='rejected', admin_note=nullif(btrim(coalesce(p_admin_note,'')), ''),
          reviewed_by=v_user_id, reviewed_at=now()
    where id=p_request_id returning * into v_request;
  else
    if v_request.status <> 'approved' then raise exception using errcode='22023', message='Approve the request before marking it paid'; end if;
    update public.referral_wallets
      set total_withdrawn_iqd=total_withdrawn_iqd+v_request.amount_iqd,updated_at=now()
    where user_id=v_request.user_id;
    update public.referral_withdrawal_requests
      set status='paid', admin_note=nullif(btrim(coalesce(p_admin_note,'')), ''),
          reviewed_by=v_user_id, reviewed_at=now(), paid_at=now()
    where id=p_request_id returning * into v_request;
  end if;

  return jsonb_build_object(
    'id',v_request.id,'status',v_request.status,'amount_iqd',v_request.amount_iqd,'user_id',v_request.user_id
  );
end;
$$;

create or replace function private.attach_post_share_to_food_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_attr public.post_share_attributions%rowtype;
  v_author_id uuid;
  v_reward numeric(14,2);
begin
  if new.payment_method='wallet' then
    insert into public.referral_wallets(user_id) values(new.buyer_id) on conflict(user_id) do nothing;
    update public.referral_wallets
      set available_iqd=available_iqd-new.total_iqd,
          total_spent_iqd=total_spent_iqd+new.total_iqd,
          updated_at=now()
    where user_id=new.buyer_id and available_iqd>=new.total_iqd;
    if not found then
      raise exception using errcode='22023', message='Insufficient referral wallet balance for this order';
    end if;
    new.wallet_paid_iqd := new.total_iqd;
    new.payment_status := 'collected';
    new.payment_collected_at := now();
    insert into public.referral_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
    ) values (
      new.buyer_id,'platform_spend',-new.total_iqd,'available','food_post_order',new.id,
      'پارەدانی داواکاری بە باڵانسی شاخ'
    );
  end if;

  select a.* into v_attr
  from public.post_share_attributions a
  join public.post_share_links l on l.id=a.share_link_id
  join public.posts p on p.id=a.post_id
  where a.buyer_id=new.buyer_id and a.post_id=new.post_id
    and a.expires_at>now() and p.status='active'
    and l.sharer_id<>new.buyer_id
    and l.sharer_id<>p.author_id
    and p.referral_reward_iqd>0
    and p.category in ('food'::public.post_category,'fashion'::public.post_category)
  order by a.attributed_at desc
  limit 1;

  if found then
    select p.author_id,p.referral_reward_iqd into v_author_id,v_reward
    from public.posts p where p.id=v_attr.post_id;
    new.share_link_id := v_attr.share_link_id;
    new.referrer_id := (select sharer_id from public.post_share_links where id=v_attr.share_link_id);
    new.referral_reward_iqd := v_reward;
    new.referral_reward_status := 'pending';
  end if;
  return new;
end;
$$;

create or replace function private.attach_post_share_to_apparel_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_attr public.post_share_attributions%rowtype;
  v_author_id uuid;
  v_reward numeric(14,2);
begin
  if new.payment_method='wallet' then
    insert into public.referral_wallets(user_id) values(new.buyer_id) on conflict(user_id) do nothing;
    update public.referral_wallets
      set available_iqd=available_iqd-new.total_iqd,
          total_spent_iqd=total_spent_iqd+new.total_iqd,
          updated_at=now()
    where user_id=new.buyer_id and available_iqd>=new.total_iqd;
    if not found then
      raise exception using errcode='22023', message='Insufficient referral wallet balance for this order';
    end if;
    new.wallet_paid_iqd := new.total_iqd;
    new.payment_status := 'collected';
    insert into public.referral_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
    ) values (
      new.buyer_id,'platform_spend',-new.total_iqd,'available','apparel_post_order',new.id,
      'پارەدانی داواکاری بە باڵانسی شاخ'
    );
  end if;

  select a.* into v_attr
  from public.post_share_attributions a
  join public.post_share_links l on l.id=a.share_link_id
  join public.posts p on p.id=a.post_id
  where a.buyer_id=new.buyer_id and a.post_id=new.post_id
    and a.expires_at>now() and p.status='active'
    and l.sharer_id<>new.buyer_id
    and l.sharer_id<>p.author_id
    and p.referral_reward_iqd>0
    and p.category in ('food'::public.post_category,'fashion'::public.post_category)
  order by a.attributed_at desc
  limit 1;

  if found then
    select p.author_id,p.referral_reward_iqd into v_author_id,v_reward
    from public.posts p where p.id=v_attr.post_id;
    new.share_link_id := v_attr.share_link_id;
    new.referrer_id := (select sharer_id from public.post_share_links where id=v_attr.share_link_id);
    new.referral_reward_iqd := v_reward;
    new.referral_reward_status := 'pending';
  end if;
  return new;
end;
$$;

create or replace function private.record_post_referral_reward_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_reward_id uuid;
begin
  if new.referrer_id is null or new.referral_reward_iqd<=0 or new.referral_reward_status<>'pending' then
    return new;
  end if;
  insert into public.referral_wallets(user_id) values(new.referrer_id) on conflict(user_id) do nothing;
  insert into public.post_referral_rewards(
    order_type,order_id,post_id,buyer_id,sharer_id,share_link_id,reward_iqd,status
  ) values (
    tg_argv[0],new.id,new.post_id,new.buyer_id,new.referrer_id,new.share_link_id,new.referral_reward_iqd,'pending'
  ) on conflict (order_type,order_id) do nothing returning id into v_reward_id;
  if v_reward_id is null then return new; end if;

  update public.referral_wallets
    set pending_iqd=pending_iqd+new.referral_reward_iqd,updated_at=now()
  where user_id=new.referrer_id;

  insert into public.referral_wallet_transactions(
    user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
  ) values (
    new.referrer_id,'reward_pending',new.referral_reward_iqd,'pending',tg_argv[0],new.id,
    'خەڵاتی شێرکردن لە چاوەڕوانی گەیاندنە'
  );
  return new;
end;
$$;

create or replace function private.settle_food_post_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_new_status text;
  v_settle boolean := false;
  v_reverse boolean := false;
begin
  if new.referral_reward_status <> 'pending' or new.referrer_id is null or new.referral_reward_iqd<=0 then
    return new;
  end if;
  v_settle := new.delivery_status='delivered' and new.payment_status='collected' and (old.delivery_status is distinct from new.delivery_status or old.payment_status is distinct from new.payment_status);
  v_reverse := (new.status in ('cancelled','rejected') or new.delivery_status in ('failed','cancelled'))
    and (old.status is distinct from new.status or old.delivery_status is distinct from new.delivery_status);
  if not v_settle and not v_reverse then return new; end if;

  if v_settle then
    update public.referral_wallets
      set pending_iqd=greatest(0,pending_iqd-new.referral_reward_iqd),
          available_iqd=available_iqd+new.referral_reward_iqd,
          total_earned_iqd=total_earned_iqd+new.referral_reward_iqd,
          updated_at=now()
    where user_id=new.referrer_id;
    update public.post_referral_rewards set status='available',settled_at=now()
      where order_type='food' and order_id=new.id and status='pending';
    insert into public.referral_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
    ) values (
      new.referrer_id,'reward_available',new.referral_reward_iqd,'available','food',new.id,
      'خەڵاتی شێرکردن بەردەست بوو دوای گەیاندنی داواکاری'
    ) on conflict do nothing;
    update public.food_post_orders set referral_reward_status='available' where id=new.id and referral_reward_status='pending';
  elsif v_reverse then
    update public.referral_wallets
      set pending_iqd=greatest(0,pending_iqd-new.referral_reward_iqd),updated_at=now()
    where user_id=new.referrer_id;
    update public.post_referral_rewards set status='reversed',settled_at=now()
      where order_type='food' and order_id=new.id and status='pending';
    insert into public.referral_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
    ) values (
      new.referrer_id,'reward_reversed',-new.referral_reward_iqd,'pending','food',new.id,
      'خەڵاتی شێرکردن بەهۆی هەڵوەشاندنەوەی داواکاری لابرا'
    ) on conflict do nothing;
    update public.food_post_orders set referral_reward_status='reversed' where id=new.id and referral_reward_status='pending';
  end if;
  return new;
end;
$$;

create or replace function private.settle_apparel_post_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_settle boolean := false;
  v_reverse boolean := false;
begin
  if new.referral_reward_status <> 'pending' or new.referrer_id is null or new.referral_reward_iqd<=0 then
    return new;
  end if;
  v_settle := new.status='delivered' and old.status is distinct from new.status;
  v_reverse := new.status in ('cancelled','rejected') and old.status is distinct from new.status;
  if not v_settle and not v_reverse then return new; end if;

  if v_settle then
    update public.referral_wallets
      set pending_iqd=greatest(0,pending_iqd-new.referral_reward_iqd),
          available_iqd=available_iqd+new.referral_reward_iqd,
          total_earned_iqd=total_earned_iqd+new.referral_reward_iqd,
          updated_at=now()
    where user_id=new.referrer_id;
    update public.post_referral_rewards set status='available',settled_at=now()
      where order_type='apparel' and order_id=new.id and status='pending';
    insert into public.referral_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
    ) values (
      new.referrer_id,'reward_available',new.referral_reward_iqd,'available','apparel',new.id,
      'خەڵاتی شێرکردن بەردەست بوو دوای گەیاندنی داواکاری'
    ) on conflict do nothing;
    update public.apparel_post_orders set referral_reward_status='available' where id=new.id and referral_reward_status='pending';
  elsif v_reverse then
    update public.referral_wallets
      set pending_iqd=greatest(0,pending_iqd-new.referral_reward_iqd),updated_at=now()
    where user_id=new.referrer_id;
    update public.post_referral_rewards set status='reversed',settled_at=now()
      where order_type='apparel' and order_id=new.id and status='pending';
    insert into public.referral_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_bucket,reference_type,reference_id,description_ku
    ) values (
      new.referrer_id,'reward_reversed',-new.referral_reward_iqd,'pending','apparel',new.id,
      'خەڵاتی شێرکردن بەهۆی هەڵوەشاندنەوەی داواکاری لابرا'
    ) on conflict do nothing;
    update public.apparel_post_orders set referral_reward_status='reversed' where id=new.id and referral_reward_status='pending';
  end if;
  return new;
end;
$$;

drop trigger if exists food_post_order_apply_referral on public.food_post_orders;
create trigger food_post_order_apply_referral
  before insert on public.food_post_orders
  for each row execute function private.attach_post_share_to_food_order();

drop trigger if exists apparel_post_order_apply_referral on public.apparel_post_orders;
create trigger apparel_post_order_apply_referral
  before insert on public.apparel_post_orders
  for each row execute function private.attach_post_share_to_apparel_order();

drop trigger if exists food_post_order_record_referral_reward on public.food_post_orders;
create trigger food_post_order_record_referral_reward
  after insert on public.food_post_orders
  for each row execute function private.record_post_referral_reward_after_insert('food');

drop trigger if exists apparel_post_order_record_referral_reward on public.apparel_post_orders;
create trigger apparel_post_order_record_referral_reward
  after insert on public.apparel_post_orders
  for each row execute function private.record_post_referral_reward_after_insert('apparel');

drop trigger if exists food_post_order_settle_referral_reward on public.food_post_orders;
create trigger food_post_order_settle_referral_reward
  after update of status,delivery_status,payment_status,referral_reward_status on public.food_post_orders
  for each row execute function private.settle_food_post_referral_reward();

drop trigger if exists apparel_post_order_settle_referral_reward on public.apparel_post_orders;
create trigger apparel_post_order_settle_referral_reward
  after update of status,referral_reward_status on public.apparel_post_orders
  for each row execute function private.settle_apparel_post_referral_reward();

revoke all on function public.create_post_share_link(uuid) from public,anon;
grant execute on function public.create_post_share_link(uuid) to authenticated;
revoke all on function public.register_post_share_attribution(uuid) from public,anon;
grant execute on function public.register_post_share_attribution(uuid) to authenticated;
revoke all on function public.request_referral_withdrawal(text,text,text,text) from public,anon;
grant execute on function public.request_referral_withdrawal(text,text,text,text) to authenticated;
revoke all on function public.process_referral_withdrawal(uuid,text,text) from public,anon;
grant execute on function public.process_referral_withdrawal(uuid,text,text) to authenticated;

revoke all on function private.attach_post_share_to_food_order() from public,anon,authenticated;
revoke all on function private.attach_post_share_to_apparel_order() from public,anon,authenticated;
revoke all on function private.record_post_referral_reward_after_insert() from public,anon,authenticated;
revoke all on function private.settle_food_post_referral_reward() from public,anon,authenticated;
revoke all on function private.settle_apparel_post_referral_reward() from public,anon,authenticated;

commit;
