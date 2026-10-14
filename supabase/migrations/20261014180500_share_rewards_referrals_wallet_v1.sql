-- SHAKH Share & Earn v1
-- Post owners configure a fixed reward in IQD; qualified share-attributed orders
-- earn only after delivery and payment collection. Wallet changes are server-side,
-- append-only ledger entries and never trusted from the browser.

begin;

alter table public.posts
  add column if not exists share_reward_iqd numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.posts'::regclass and conname='posts_share_reward_nonnegative'
  ) then
    alter table public.posts
      add constraint posts_share_reward_nonnegative
      check (share_reward_iqd >= 0 and share_reward_iqd <= 10000000 and share_reward_iqd = trunc(share_reward_iqd));
  end if;
end $$;

create table if not exists public.post_share_links (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  sharer_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (post_id, sharer_id)
);

create index if not exists post_share_links_sharer_created_idx
  on public.post_share_links(sharer_id, created_at desc);

create table if not exists public.share_wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_iqd numeric(14,2) not null default 0 check (balance_iqd >= 0),
  lifetime_earned_iqd numeric(14,2) not null default 0 check (lifetime_earned_iqd >= 0),
  lifetime_withdrawn_iqd numeric(14,2) not null default 0 check (lifetime_withdrawn_iqd >= 0),
  lifetime_spent_iqd numeric(14,2) not null default 0 check (lifetime_spent_iqd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.share_earnings (
  id uuid primary key default gen_random_uuid(),
  sharer_id uuid not null references auth.users(id) on delete restrict,
  share_link_id uuid references public.post_share_links(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  post_title text not null,
  order_type text not null check (order_type in ('food_post','apparel_post')),
  order_id uuid not null,
  order_number text not null,
  amount_iqd numeric(14,2) not null check (amount_iqd > 0 and amount_iqd = trunc(amount_iqd)),
  created_at timestamptz not null default now(),
  earning_month date not null default (date_trunc('month', now() at time zone 'Asia/Baghdad'))::date,
  unique (order_type, order_id)
);

create index if not exists share_earnings_user_created_idx
  on public.share_earnings(sharer_id, created_at desc);
create index if not exists share_earnings_month_idx
  on public.share_earnings(sharer_id, earning_month);

create table if not exists public.share_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null check (transaction_type in (
    'earning','withdrawal_reserved','withdrawal_refund',
    'platform_spend','platform_spend_refund'
  )),
  amount_iqd numeric(14,2) not null check (amount_iqd <> 0),
  balance_after_iqd numeric(14,2) not null check (balance_after_iqd >= 0),
  reference_type text,
  reference_id uuid,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists share_wallet_transactions_user_created_idx
  on public.share_wallet_transactions(user_id, created_at desc);
create unique index if not exists share_wallet_transactions_reference_unique
  on public.share_wallet_transactions(user_id, transaction_type, reference_type, reference_id)
  where reference_id is not null;

create table if not exists public.share_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_iqd numeric(14,2) not null check (amount_iqd > 0 and amount_iqd = trunc(amount_iqd)),
  payment_method text not null check (payment_method in ('mobile_cash','zain_cash','fastpay','qi_card','bank_transfer','other')),
  recipient_name text not null,
  recipient_account text,
  recipient_phone text,
  user_note text,
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  admin_note text,
  payout_reference text,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists share_withdrawal_requests_user_created_idx
  on public.share_withdrawal_requests(user_id, requested_at desc);
create index if not exists share_withdrawal_requests_pending_idx
  on public.share_withdrawal_requests(status, requested_at asc);

alter table public.food_post_orders
  add column if not exists share_link_id uuid references public.post_share_links(id) on delete set null,
  add column if not exists share_reward_iqd numeric(14,2) not null default 0,
  add column if not exists share_credit_iqd numeric(14,2) not null default 0,
  add column if not exists share_credit_applied boolean not null default false,
  add column if not exists share_credit_refunded boolean not null default false;

alter table public.apparel_post_orders
  add column if not exists share_link_id uuid references public.post_share_links(id) on delete set null,
  add column if not exists share_reward_iqd numeric(14,2) not null default 0,
  add column if not exists share_credit_iqd numeric(14,2) not null default 0,
  add column if not exists share_credit_applied boolean not null default false,
  add column if not exists share_credit_refunded boolean not null default false;

alter table public.orders
  add column if not exists share_credit_iqd numeric(14,2) not null default 0,
  add column if not exists share_credit_refunded boolean not null default false;

alter table public.checkout_sessions
  add column if not exists share_credit_iqd numeric(14,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.food_post_orders'::regclass and conname='food_post_orders_share_amounts_nonnegative') then
    alter table public.food_post_orders add constraint food_post_orders_share_amounts_nonnegative
      check (share_reward_iqd >= 0 and share_credit_iqd >= 0 and share_reward_iqd = trunc(share_reward_iqd) and share_credit_iqd = trunc(share_credit_iqd));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.apparel_post_orders'::regclass and conname='apparel_post_orders_share_amounts_nonnegative') then
    alter table public.apparel_post_orders add constraint apparel_post_orders_share_amounts_nonnegative
      check (share_reward_iqd >= 0 and share_credit_iqd >= 0 and share_reward_iqd = trunc(share_reward_iqd) and share_credit_iqd = trunc(share_credit_iqd));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_share_credit_nonnegative') then
    alter table public.orders add constraint orders_share_credit_nonnegative check (share_credit_iqd >= 0 and share_credit_iqd = trunc(share_credit_iqd));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.checkout_sessions'::regclass and conname='checkout_sessions_share_credit_nonnegative') then
    alter table public.checkout_sessions add constraint checkout_sessions_share_credit_nonnegative check (share_credit_iqd >= 0 and share_credit_iqd = trunc(share_credit_iqd));
  end if;
end $$;

insert into public.permissions(code, description)
values
  ('share_rewards.view_own','View personal share rewards and wallet activity'),
  ('share_rewards.manage','Review and process share reward withdrawals')
on conflict (code) do update set description=excluded.description;

insert into public.role_permissions(role, permission_code)
select r.role, 'share_rewards.view_own'
from public.user_roles ur
join (select distinct role from public.user_roles) r on r.role=ur.role
on conflict (role, permission_code) do nothing;

insert into public.role_permissions(role, permission_code)
select 'super_admin'::public.app_role, 'share_rewards.view_own'
on conflict (role, permission_code) do nothing;

insert into public.role_permissions(role, permission_code)
select 'super_admin'::public.app_role, 'share_rewards.manage'
on conflict (role, permission_code) do nothing;

alter table public.post_share_links enable row level security;
alter table public.share_wallet_accounts enable row level security;
alter table public.share_earnings enable row level security;
alter table public.share_wallet_transactions enable row level security;
alter table public.share_withdrawal_requests enable row level security;

drop policy if exists post_share_links_select_own on public.post_share_links;
create policy post_share_links_select_own on public.post_share_links
  for select to authenticated
  using (sharer_id=(select auth.uid()) or (select private.has_permission('share_rewards.manage')));

drop policy if exists share_wallet_accounts_select_scoped on public.share_wallet_accounts;
create policy share_wallet_accounts_select_scoped on public.share_wallet_accounts
  for select to authenticated
  using (user_id=(select auth.uid()) or (select private.has_permission('share_rewards.manage')));

drop policy if exists share_earnings_select_scoped on public.share_earnings;
create policy share_earnings_select_scoped on public.share_earnings
  for select to authenticated
  using (sharer_id=(select auth.uid()) or (select private.has_permission('share_rewards.manage')));

drop policy if exists share_wallet_transactions_select_scoped on public.share_wallet_transactions;
create policy share_wallet_transactions_select_scoped on public.share_wallet_transactions
  for select to authenticated
  using (user_id=(select auth.uid()) or (select private.has_permission('share_rewards.manage')));

drop policy if exists share_withdrawal_requests_select_scoped on public.share_withdrawal_requests;
create policy share_withdrawal_requests_select_scoped on public.share_withdrawal_requests
  for select to authenticated
  using (user_id=(select auth.uid()) or (select private.has_permission('share_rewards.manage')));

revoke all on table public.post_share_links, public.share_wallet_accounts, public.share_earnings,
  public.share_wallet_transactions, public.share_withdrawal_requests from anon, authenticated;
grant select on table public.post_share_links, public.share_wallet_accounts, public.share_earnings,
  public.share_wallet_transactions, public.share_withdrawal_requests to authenticated;

create or replace function public.create_post_share_link(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required to create an earning share link';
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id=p_post_id and p.status='active'::public.post_status
  ) then
    raise exception using errcode='P0002', message='This post is not available to share';
  end if;

  insert into public.post_share_links(post_id, sharer_id, is_active)
  values (p_post_id, v_user_id, true)
  on conflict (post_id, sharer_id)
  do update set is_active=true
  returning id into v_link_id;

  return v_link_id;
end;
$function$;

revoke all on function public.create_post_share_link(uuid) from public, anon;
grant execute on function public.create_post_share_link(uuid) to authenticated;

create or replace function private.apply_share_credit(
  p_user_id uuid,
  p_order_type text,
  p_order_id uuid,
  p_order_total_iqd numeric,
  p_use_balance boolean
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_balance numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
  v_balance_after numeric(14,2) := 0;
begin
  if not coalesce(p_use_balance,false) or p_order_total_iqd <= 0 then
    return 0;
  end if;

  insert into public.share_wallet_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select balance_iqd into v_balance
  from public.share_wallet_accounts
  where user_id=p_user_id
  for update;

  v_credit := least(coalesce(v_balance,0), p_order_total_iqd);
  if v_credit <= 0 then
    return 0;
  end if;

  update public.share_wallet_accounts
  set balance_iqd=balance_iqd-v_credit,
      lifetime_spent_iqd=lifetime_spent_iqd+v_credit,
      updated_at=now()
  where user_id=p_user_id
  returning balance_iqd into v_balance_after;

  insert into public.share_wallet_transactions(
    user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description
  ) values (
    p_user_id,'platform_spend',-v_credit,v_balance_after,p_order_type,p_order_id,
    'Share balance applied to a platform order'
  );

  return v_credit;
end;
$function$;

revoke all on function private.apply_share_credit(uuid,text,uuid,numeric,boolean) from public, anon, authenticated;

create or replace function public.create_food_post_order_with_share(
  p_request_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text,
  p_payment_method text,
  p_share_link_id uuid default null,
  p_use_share_balance boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
  v_order public.food_post_orders%rowtype;
  v_link public.post_share_links%rowtype;
  v_post public.posts%rowtype;
  v_link_id uuid := null;
  v_reward numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('checkout.create')) then
    raise exception using errcode='42501', message='Checkout is not permitted for this role';
  end if;

  v_result := public.create_food_post_order(
    p_request_id,p_post_id,p_quantity,p_delivery_address,p_buyer_phone,p_delivery_city,p_customer_note,p_payment_method
  );

  select * into v_order from public.food_post_orders
  where id=(v_result->>'id')::uuid
  for update;
  if not found then raise exception using errcode='P0002', message='Food order was not found after checkout'; end if;

  if not v_order.share_credit_applied then
    if p_share_link_id is not null then
      select * into v_link from public.post_share_links l
      where l.id=p_share_link_id and l.post_id=v_order.post_id and l.is_active=true;
      if found and v_link.sharer_id <> v_order.buyer_id then
        select * into v_post from public.posts p
        where p.id=v_order.post_id and p.status='active'::public.post_status;
        if found and v_post.share_reward_iqd>0 then
          v_link_id := v_link.id;
          v_reward := v_post.share_reward_iqd;
        end if;
      end if;
    end if;

    v_credit := private.apply_share_credit(v_order.buyer_id,'food_post',v_order.id,v_order.total_iqd,p_use_share_balance);

    update public.food_post_orders
    set share_link_id=v_link_id,
        share_reward_iqd=v_reward,
        share_credit_iqd=v_credit,
        share_credit_applied=true,
        total_iqd=greatest(0,total_iqd-v_credit),
        updated_at=now()
    where id=v_order.id
    returning * into v_order;
  end if;

  return v_result || jsonb_build_object(
    'id',v_order.id,
    'order_number',v_order.order_number,
    'total_iqd',v_order.total_iqd,
    'share_credit_iqd',v_order.share_credit_iqd,
    'share_reward_iqd',v_order.share_reward_iqd
  );
end;
$function$;

revoke all on function public.create_food_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid,boolean) from public, anon;
grant execute on function public.create_food_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid,boolean) to authenticated;

create or replace function public.create_apparel_post_order_with_share(
  p_request_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text,
  p_payment_method text,
  p_share_link_id uuid default null,
  p_use_share_balance boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
  v_order public.apparel_post_orders%rowtype;
  v_link public.post_share_links%rowtype;
  v_post public.posts%rowtype;
  v_link_id uuid := null;
  v_reward numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('checkout.create')) then
    raise exception using errcode='42501', message='Checkout is not permitted for this role';
  end if;

  v_result := public.create_apparel_post_order(
    p_request_id,p_variant_id,p_quantity,p_delivery_address,p_buyer_phone,p_delivery_city,p_customer_note,p_payment_method
  );

  select * into v_order from public.apparel_post_orders
  where id=(v_result->>'id')::uuid
  for update;
  if not found then raise exception using errcode='P0002', message='Apparel order was not found after checkout'; end if;

  if not v_order.share_credit_applied then
    if p_share_link_id is not null then
      select * into v_link from public.post_share_links l
      where l.id=p_share_link_id and l.post_id=v_order.post_id and l.is_active=true;
      if found and v_link.sharer_id <> v_order.buyer_id then
        select * into v_post from public.posts p
        where p.id=v_order.post_id and p.status='active'::public.post_status;
        if found and v_post.share_reward_iqd>0 then
          v_link_id := v_link.id;
          v_reward := v_post.share_reward_iqd;
        end if;
      end if;
    end if;

    v_credit := private.apply_share_credit(v_order.buyer_id,'apparel_post',v_order.id,v_order.total_iqd,p_use_share_balance);

    update public.apparel_post_orders
    set share_link_id=v_link_id,
        share_reward_iqd=v_reward,
        share_credit_iqd=v_credit,
        share_credit_applied=true,
        total_iqd=greatest(0,total_iqd-v_credit),
        updated_at=now()
    where id=v_order.id
    returning * into v_order;
  end if;

  return v_result || jsonb_build_object(
    'id',v_order.id,
    'order_number',v_order.order_number,
    'total_iqd',v_order.total_iqd,
    'share_credit_iqd',v_order.share_credit_iqd,
    'share_reward_iqd',v_order.share_reward_iqd
  );
end;
$function$;

revoke all on function public.create_apparel_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid,boolean) from public, anon;
grant execute on function public.create_apparel_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid,boolean) to authenticated;

create or replace function public.checkout_food_post_cart_with_share(
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery',
  p_share_links jsonb default '{}'::jsonb,
  p_use_share_balance boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_item record;
  v_order jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_share_link_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if jsonb_typeof(coalesce(p_share_links,'{}'::jsonb)) <> 'object' then
    raise exception using errcode='22023', message='Share attribution map is invalid';
  end if;

  for v_item in
    select ci.id,ci.post_id,ci.quantity,p.title as post_title
    from public.food_post_cart_items ci
    join public.posts p on p.id=ci.post_id
    where ci.user_id=v_user_id
    order by ci.created_at,ci.id
    for update of ci
  loop
    v_share_link_id := nullif(p_share_links->>v_item.post_id::text,'')::uuid;
    v_order := public.create_food_post_order_with_share(
      v_item.id,v_item.post_id,v_item.quantity,p_delivery_address,p_buyer_phone,
      p_delivery_city,p_customer_note,p_payment_method,v_share_link_id,p_use_share_balance
    );
    v_orders := v_orders || jsonb_build_array(v_order || jsonb_build_object('post_title',v_item.post_title));
    v_count := v_count + 1;
  end loop;

  if v_count=0 then raise exception using errcode='22023', message='Food post cart is empty'; end if;
  delete from public.food_post_cart_items where user_id=v_user_id;
  return jsonb_build_object('orders',v_orders,'count',v_count);
end;
$function$;

revoke all on function public.checkout_food_post_cart_with_share(text,text,text,text,text,jsonb,boolean) from public, anon;
grant execute on function public.checkout_food_post_cart_with_share(text,text,text,text,text,jsonb,boolean) to authenticated;

create or replace function public.create_checkout_with_share_balance(
  p_idempotency_key text,
  p_delivery_address text,
  p_delivery_lat numeric,
  p_delivery_lng numeric,
  p_customer_note text,
  p_payment_method public.payment_method,
  p_delivery_city text,
  p_use_share_balance boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
  v_session public.checkout_sessions%rowtype;
  v_order record;
  v_balance numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
  v_remaining numeric(14,2) := 0;
  v_order_credit numeric(14,2) := 0;
  v_balance_after numeric(14,2) := 0;
  v_orders_json jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('checkout.create')) then
    raise exception using errcode='42501', message='Checkout is not permitted for this role';
  end if;

  v_result := private.create_checkout_internal(
    v_user_id,p_idempotency_key,p_delivery_address,p_delivery_lat,p_delivery_lng,
    p_customer_note,p_payment_method,p_delivery_city
  );

  select * into v_session from public.checkout_sessions
  where id=(v_result->>'checkout_id')::uuid
  for update;
  if not found then raise exception using errcode='P0002', message='Checkout session was not found'; end if;

  if p_use_share_balance and v_session.share_credit_iqd=0 then
    insert into public.share_wallet_accounts(user_id)
    values (v_user_id) on conflict (user_id) do nothing;

    select balance_iqd into v_balance
    from public.share_wallet_accounts where user_id=v_user_id for update;

    v_credit := least(coalesce(v_balance,0), v_session.total_iqd);
    v_remaining := v_credit;

    if v_credit>0 then
      for v_order in
        select id,total_iqd,share_credit_iqd
        from public.orders
        where checkout_session_id=v_session.id
        order by created_at,id
        for update
      loop
        exit when v_remaining<=0;
        v_order_credit := least(v_remaining,v_order.total_iqd);
        update public.orders
        set total_iqd=greatest(0,total_iqd-v_order_credit),
            share_credit_iqd=share_credit_iqd+v_order_credit
        where id=v_order.id;
        v_remaining := v_remaining-v_order_credit;
      end loop;

      v_credit := v_credit-v_remaining;
      update public.checkout_sessions
      set total_iqd=greatest(0,total_iqd-v_credit),
          share_credit_iqd=share_credit_iqd+v_credit,
          updated_at=now()
      where id=v_session.id;

      update public.payments
      set amount_iqd=greatest(0,amount_iqd-v_credit),
          metadata=metadata || jsonb_build_object('share_credit_iqd',v_credit),
          updated_at=now()
      where checkout_session_id=v_session.id
        and status='pending';

      update public.share_wallet_accounts
      set balance_iqd=balance_iqd-v_credit,
          lifetime_spent_iqd=lifetime_spent_iqd+v_credit,
          updated_at=now()
      where user_id=v_user_id
      returning balance_iqd into v_balance_after;

      insert into public.share_wallet_transactions(
        user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description
      ) values(
        v_user_id,'platform_spend',-v_credit,v_balance_after,'checkout_session',v_session.id,
        'Share balance applied to a marketplace checkout'
      );
    end if;
  end if;

  select * into v_session from public.checkout_sessions where id=v_session.id;
  if jsonb_typeof(v_result->'orders')='array' then
    select coalesce(jsonb_agg(
      (item.value - 'total_iqd' - 'share_credit_iqd')
      || jsonb_build_object('total_iqd',o.total_iqd,'share_credit_iqd',o.share_credit_iqd)
      order by item.ordinality
    ),'[]'::jsonb)
    into v_orders_json
    from jsonb_array_elements(v_result->'orders') with ordinality as item(value,ordinality)
    join public.orders o on o.id=(item.value->>'id')::uuid;
  end if;

  return v_result || jsonb_build_object(
    'total_iqd',v_session.total_iqd,
    'share_credit_iqd',v_session.share_credit_iqd,
    'orders',case when jsonb_typeof(v_result->'orders')='array' then v_orders_json else v_result->'orders' end
  );
end;
$function$;

revoke all on function public.create_checkout_with_share_balance(text,text,numeric,numeric,text,public.payment_method,text,boolean) from public, anon;
grant execute on function public.create_checkout_with_share_balance(text,text,numeric,numeric,text,public.payment_method,text,boolean) to authenticated;

create or replace function private.award_post_share_reward()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
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
  where l.id=new.share_link_id
    and l.post_id=new.post_id
    and l.sharer_id<>v_user_id
    and l.sharer_id<>new.seller_id
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

revoke all on function private.award_post_share_reward() from public, anon, authenticated;

drop trigger if exists award_food_post_share_reward on public.food_post_orders;
create trigger award_food_post_share_reward
after update of status,payment_status on public.food_post_orders
for each row execute function private.award_post_share_reward();

drop trigger if exists award_apparel_post_share_reward on public.apparel_post_orders;
create trigger award_apparel_post_share_reward
after update of status on public.apparel_post_orders
for each row execute function private.award_post_share_reward();

create or replace function private.refund_share_credit_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid;
  v_order_type text;
  v_balance_after numeric(14,2);
  v_credit numeric(14,2);
begin
  if old.status='cancelled' or new.status<>'cancelled' or old.share_credit_refunded then return new; end if;

  if tg_table_name='orders' then
    v_user_id := old.customer_id;
    v_order_type := 'store_order';
  elsif tg_table_name='food_post_orders' then
    v_user_id := old.buyer_id;
    v_order_type := 'food_post';
  elsif tg_table_name='apparel_post_orders' then
    v_user_id := old.buyer_id;
    v_order_type := 'apparel_post';
  else
    return new;
  end if;

  v_credit := coalesce(old.share_credit_iqd,0);
  if v_credit<=0 then return new; end if;

  insert into public.share_wallet_accounts(user_id) values(v_user_id) on conflict (user_id) do nothing;
  update public.share_wallet_accounts
  set balance_iqd=balance_iqd+v_credit,
      lifetime_spent_iqd=greatest(0,lifetime_spent_iqd-v_credit),
      updated_at=now()
  where user_id=v_user_id
  returning balance_iqd into v_balance_after;

  insert into public.share_wallet_transactions(
    user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description
  ) values(
    v_user_id,'platform_spend_refund',v_credit,v_balance_after,v_order_type,old.id,
    'Share credit returned after an order was cancelled'
  );

  new.share_credit_refunded := true;
  return new;
end;
$function$;

revoke all on function private.refund_share_credit_on_cancel() from public, anon, authenticated;

drop trigger if exists refund_store_share_credit_on_cancel on public.orders;
create trigger refund_store_share_credit_on_cancel
before update of status on public.orders
for each row execute function private.refund_share_credit_on_cancel();

drop trigger if exists refund_food_share_credit_on_cancel on public.food_post_orders;
create trigger refund_food_share_credit_on_cancel
before update of status on public.food_post_orders
for each row execute function private.refund_share_credit_on_cancel();

drop trigger if exists refund_apparel_share_credit_on_cancel on public.apparel_post_orders;
create trigger refund_apparel_share_credit_on_cancel
before update of status on public.apparel_post_orders
for each row execute function private.refund_share_credit_on_cancel();

create or replace function public.request_share_withdrawal(
  p_amount_iqd numeric,
  p_payment_method text,
  p_recipient_name text,
  p_recipient_account text default null,
  p_recipient_phone text default null,
  p_user_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_balance numeric(14,2);
  v_balance_after numeric(14,2);
  v_request public.share_withdrawal_requests%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_amount_iqd is null or p_amount_iqd<=0 or p_amount_iqd<>trunc(p_amount_iqd) or p_amount_iqd>1000000000 then
    raise exception using errcode='22023', message='Withdrawal amount must be a positive whole IQD amount';
  end if;
  if p_payment_method not in ('mobile_cash','zain_cash','fastpay','qi_card','bank_transfer','other') then
    raise exception using errcode='22023', message='Unsupported withdrawal method';
  end if;
  if p_recipient_name is null or char_length(btrim(p_recipient_name))<2 or char_length(p_recipient_name)>160 then
    raise exception using errcode='22023', message='Recipient name is required';
  end if;
  if char_length(coalesce(p_recipient_account,''))>200 or char_length(coalesce(p_recipient_phone,''))>50 or char_length(coalesce(p_user_note,''))>1000 then
    raise exception using errcode='22023', message='Withdrawal details are too long';
  end if;
  if p_payment_method in ('mobile_cash','zain_cash','fastpay','qi_card') and nullif(btrim(coalesce(p_recipient_phone,p_recipient_account,'')),'') is null then
    raise exception using errcode='22023', message='Recipient phone or account number is required';
  end if;
  if p_payment_method in ('bank_transfer','other') and nullif(btrim(coalesce(p_recipient_account,'')),'') is null then
    raise exception using errcode='22023', message='Recipient account detail is required';
  end if;

  insert into public.share_wallet_accounts(user_id) values(v_user_id) on conflict (user_id) do nothing;
  select balance_iqd into v_balance from public.share_wallet_accounts where user_id=v_user_id for update;
  if v_balance<p_amount_iqd then raise exception using errcode='22023', message='Your available share balance is not enough'; end if;

  update public.share_wallet_accounts
  set balance_iqd=balance_iqd-p_amount_iqd,updated_at=now()
  where user_id=v_user_id
  returning balance_iqd into v_balance_after;

  insert into public.share_withdrawal_requests(
    user_id,amount_iqd,payment_method,recipient_name,recipient_account,recipient_phone,user_note
  ) values(
    v_user_id,p_amount_iqd,p_payment_method,btrim(p_recipient_name),
    nullif(btrim(coalesce(p_recipient_account,'')),''),nullif(btrim(coalesce(p_recipient_phone,'')),''),
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

revoke all on function public.request_share_withdrawal(numeric,text,text,text,text,text) from public, anon;
grant execute on function public.request_share_withdrawal(numeric,text,text,text,text,text) to authenticated;

create or replace function public.review_share_withdrawal(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null,
  p_payout_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.share_withdrawal_requests%rowtype;
  v_balance_after numeric(14,2);
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not (select private.has_permission('share_rewards.manage')) then
    raise exception using errcode='42501', message='Share reward management permission required';
  end if;
  if p_action not in ('paid','rejected') then raise exception using errcode='22023', message='Action must be paid or rejected'; end if;
  if char_length(coalesce(p_admin_note,''))>1000 or char_length(coalesce(p_payout_reference,''))>200 then
    raise exception using errcode='22023', message='Review details are too long';
  end if;

  select * into v_request from public.share_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002', message='Withdrawal request was not found'; end if;
  if v_request.status<>'pending' then raise exception using errcode='22023', message='This withdrawal request has already been processed'; end if;

  if p_action='paid' then
    update public.share_withdrawal_requests
    set status='paid',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),
        payout_reference=nullif(btrim(coalesce(p_payout_reference,'')),''),
        reviewed_by=v_user_id,reviewed_at=now()
    where id=p_request_id returning * into v_request;

    update public.share_wallet_accounts
    set lifetime_withdrawn_iqd=lifetime_withdrawn_iqd+v_request.amount_iqd,updated_at=now()
    where user_id=v_request.user_id;
  else
    insert into public.share_wallet_accounts(user_id) values(v_request.user_id) on conflict (user_id) do nothing;
    update public.share_wallet_accounts
    set balance_iqd=balance_iqd+v_request.amount_iqd,updated_at=now()
    where user_id=v_request.user_id returning balance_iqd into v_balance_after;

    update public.share_withdrawal_requests
    set status='rejected',admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),
        reviewed_by=v_user_id,reviewed_at=now()
    where id=p_request_id returning * into v_request;

    insert into public.share_wallet_transactions(
      user_id,transaction_type,amount_iqd,balance_after_iqd,reference_type,reference_id,description
    ) values(
      v_request.user_id,'withdrawal_refund',v_request.amount_iqd,v_balance_after,
      'withdrawal_request',v_request.id,'Funds returned because the withdrawal was rejected'
    );
  end if;

  insert into public.notifications(
    user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data
  ) values(
    v_request.user_id,'share_withdrawal_status',
    case when p_action='paid' then 'داواکاریی ڕاکێشان پارەدرا' else 'داواکاریی ڕاکێشان ڕەتکرایەوە' end,
    case when p_action='paid' then 'داواکاریی ڕاکێشان بە بڕی '||to_char(v_request.amount_iqd,'FM999,999,999,990')||' د.ع جێبەجێ کرا.' else 'بڕی داواکراو گەڕێندرایەوە بۆ باڵانسی خەڵات.' end,
    'تحديث طلب السحب','تم تحديث حالة طلب سحب المكافآت.',
    'Withdrawal request updated','Your share reward withdrawal request was updated.',
    '/dashboard/share-rewards','share_withdrawal_request',v_request.id,
    jsonb_build_object('status',v_request.status,'amount_iqd',v_request.amount_iqd,'payout_reference',v_request.payout_reference)
  );

  return jsonb_build_object('id',v_request.id,'amount_iqd',v_request.amount_iqd,'status',v_request.status);
end;
$function$;

revoke all on function public.review_share_withdrawal(uuid,text,text,text) from public, anon;
grant execute on function public.review_share_withdrawal(uuid,text,text,text) to authenticated;

create or replace function public.get_share_rewards_summary()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account public.share_wallet_accounts%rowtype;
  v_balance numeric(14,2) := 0;
  v_lifetime_earned numeric(14,2) := 0;
  v_lifetime_withdrawn numeric(14,2) := 0;
  v_lifetime_spent numeric(14,2) := 0;
  v_month_earned numeric(14,2) := 0;
  v_earnings jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_withdrawals jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;

  insert into public.share_wallet_accounts(user_id) values(v_user_id) on conflict (user_id) do nothing;
  select * into v_account from public.share_wallet_accounts where user_id=v_user_id;
  v_balance := v_account.balance_iqd;
  v_lifetime_earned := v_account.lifetime_earned_iqd;
  v_lifetime_withdrawn := v_account.lifetime_withdrawn_iqd;
  v_lifetime_spent := v_account.lifetime_spent_iqd;

  select coalesce(sum(e.amount_iqd),0) into v_month_earned
  from public.share_earnings e
  where e.sharer_id=v_user_id
    and e.earning_month=(date_trunc('month',now() at time zone 'Asia/Baghdad'))::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'post_id',q.post_id,'post_title',q.post_title,'order_type',q.order_type,
    'order_number',q.order_number,'amount_iqd',q.amount_iqd,'created_at',q.created_at
  ) order by q.created_at desc),'[]'::jsonb) into v_earnings
  from (
    select * from public.share_earnings where sharer_id=v_user_id
    order by created_at desc limit 30
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'transaction_type',q.transaction_type,'amount_iqd',q.amount_iqd,
    'balance_after_iqd',q.balance_after_iqd,'reference_type',q.reference_type,
    'reference_id',q.reference_id,'description',q.description,'created_at',q.created_at
  ) order by q.created_at desc),'[]'::jsonb) into v_transactions
  from (
    select * from public.share_wallet_transactions where user_id=v_user_id
    order by created_at desc limit 50
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'amount_iqd',q.amount_iqd,'payment_method',q.payment_method,'recipient_name',q.recipient_name,
    'recipient_account',q.recipient_account,'recipient_phone',q.recipient_phone,'status',q.status,
    'admin_note',q.admin_note,'payout_reference',q.payout_reference,
    'requested_at',q.requested_at,'reviewed_at',q.reviewed_at
  ) order by q.requested_at desc),'[]'::jsonb) into v_withdrawals
  from (
    select * from public.share_withdrawal_requests where user_id=v_user_id
    order by requested_at desc limit 20
  ) q;

  return jsonb_build_object(
    'balance_iqd',v_balance,
    'lifetime_earned_iqd',v_lifetime_earned,
    'lifetime_withdrawn_iqd',v_lifetime_withdrawn,
    'lifetime_spent_iqd',v_lifetime_spent,
    'this_month_earned_iqd',v_month_earned,
    'current_month',(date_trunc('month',now() at time zone 'Asia/Baghdad'))::date,
    'earnings',v_earnings,
    'transactions',v_transactions,
    'withdrawals',v_withdrawals
  );
end;
$function$;

revoke all on function public.get_share_rewards_summary() from public, anon;
grant execute on function public.get_share_rewards_summary() to authenticated;

commit;
