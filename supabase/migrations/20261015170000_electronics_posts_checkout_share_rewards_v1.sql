-- Electronics posts: structured specifications, purchase workflow, and Share & Earn.
-- Additive only. Existing posts, variants, orders and wallet balances remain untouched.
begin;

alter table public.posts
  add column if not exists category_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='posts_category_details_object_check'
      and conrelid='public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_category_details_object_check
      check (jsonb_typeof(category_details) = 'object');
  end if;
end $$;

grant select (category_details) on table public.posts to anon, authenticated;
grant insert (category_details) on table public.posts to authenticated;
grant update (category_details) on table public.posts to authenticated;

create table if not exists public.electronics_post_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default
    ('EL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  request_id uuid not null,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  post_id uuid not null references public.posts(id) on delete restrict,
  post_title text not null,
  brand text not null,
  product_details jsonb not null default '{}'::jsonb,
  quantity integer not null check (quantity between 1 and 100),
  unit_price_iqd numeric(14,2) not null check (unit_price_iqd > 0),
  line_total_iqd numeric(16,2) not null check (line_total_iqd > 0),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 5 and 1000),
  buyer_phone text not null check (char_length(btrim(buyer_phone)) between 6 and 40),
  customer_note text null check (customer_note is null or char_length(customer_note) <= 2000),
  payment_method text not null default 'cash_on_delivery'
    check (payment_method in ('cash_on_delivery','mobile_cash')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','collected','failed','refunded')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','rejected','delivered','cancelled')),
  delivery_city text not null check (char_length(btrim(delivery_city)) between 2 and 100),
  delivery_fee_iqd numeric(14,2) not null default 0 check (delivery_fee_iqd >= 0),
  platform_fee_iqd numeric(14,2) not null default 0 check (platform_fee_iqd >= 0),
  total_iqd numeric(16,2) not null check (total_iqd > 0),
  share_link_id uuid null references public.post_share_links(id) on delete set null,
  share_reward_iqd numeric(14,2) not null default 0 check (share_reward_iqd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint electronics_post_orders_buyer_request_unique unique (buyer_id, request_id),
  constraint electronics_post_orders_details_object_check check (jsonb_typeof(product_details) = 'object')
);

create index if not exists electronics_post_orders_buyer_created_idx
  on public.electronics_post_orders(buyer_id, created_at desc);
create index if not exists electronics_post_orders_seller_created_idx
  on public.electronics_post_orders(seller_id, created_at desc);
create index if not exists electronics_post_orders_post_created_idx
  on public.electronics_post_orders(post_id, created_at desc);

alter table public.electronics_post_orders enable row level security;
drop policy if exists electronics_post_orders_select_participants on public.electronics_post_orders;
create policy electronics_post_orders_select_participants
  on public.electronics_post_orders for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or (select private.has_permission('posts.manage'))
  );

revoke all on public.electronics_post_orders from anon, authenticated;
grant select on public.electronics_post_orders to authenticated;

drop trigger if exists electronics_post_orders_set_updated_at on public.electronics_post_orders;
create trigger electronics_post_orders_set_updated_at
  before update on public.electronics_post_orders
  for each row execute function public.set_updated_at();

-- Keep the established Share & Earn ledger, extending its supported order type.
alter table public.share_earnings drop constraint if exists share_earnings_order_type_check;
alter table public.share_earnings
  add constraint share_earnings_order_type_check
  check (order_type = any (array['food_post'::text,'apparel_post'::text,'electronics_post'::text]));

create or replace function public.create_electronics_post_order_with_share(
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
  v_link public.post_share_links%rowtype;
  v_stock integer;
  v_price numeric(14,2);
  v_line_total numeric(16,2);
  v_delivery_fee numeric(14,2);
  v_platform_fee numeric(14,2);
  v_platform_fee_percent numeric(5,2);
  v_total numeric(16,2);
  v_share_link_id uuid := null;
  v_share_reward numeric(14,2) := 0;
  v_order_id uuid;
  v_order_number text;
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
  if p_buyer_phone is null or char_length(btrim(p_buyer_phone)) < 6 or char_length(p_buyer_phone) > 40 then
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
    'id',o.id,'order_number',o.order_number,'status',o.status,'quantity',o.quantity,
    'unit_price_iqd',o.unit_price_iqd,'line_total_iqd',o.line_total_iqd,
    'delivery_city',o.delivery_city,'delivery_fee_iqd',o.delivery_fee_iqd,
    'platform_fee_iqd',o.platform_fee_iqd,'total_iqd',o.total_iqd
  ) into v_existing
  from public.electronics_post_orders o
  where o.buyer_id=v_buyer_id and o.request_id=p_request_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_post
  from public.posts p
  where p.id=p_post_id and p.category='electronics'::public.post_category
  for update;

  if not found then
    raise exception using errcode='P0002', message='Electronics post was not found';
  end if;
  if v_post.status <> 'active'::public.post_status then
    raise exception using errcode='22023', message='This electronics post is not available for purchase';
  end if;
  if v_post.author_id = v_buyer_id then
    raise exception using errcode='42501', message='You cannot purchase your own post';
  end if;
  if coalesce(btrim(v_post.brand),'') = '' then
    raise exception using errcode='22023', message='This electronics post is missing its brand';
  end if;
  if v_post.price_iqd is null or v_post.price_iqd <= 0 then
    raise exception using errcode='22023', message='This electronics post has no valid price';
  end if;
  if coalesce(v_post.category_details->>'product_type','') = ''
    or coalesce(v_post.category_details->>'color','') = ''
    or coalesce(v_post.category_details->>'condition','') = '' then
    raise exception using errcode='22023', message='This electronics post is missing required specifications';
  end if;
  if coalesce(v_post.category_details->>'stock_quantity','') !~ '^[0-9]+$' then
    raise exception using errcode='22023', message='This electronics post has invalid stock information';
  end if;

  v_stock := (v_post.category_details->>'stock_quantity')::integer;
  if v_stock < p_quantity then
    raise exception using errcode='22023', message='Insufficient stock; refresh and choose a new quantity';
  end if;

  v_price := round(v_post.price_iqd * (100 - greatest(0,least(99,coalesce(v_post.discount_percent,0)))) / 100, 0);
  if v_price <= 0 then
    raise exception using errcode='22023', message='The current electronics price is invalid';
  end if;
  v_line_total := v_price * p_quantity;
  v_delivery_fee := private.delivery_fee_for_city(p_delivery_city, true);
  v_platform_fee_percent := private.platform_fee_percent();
  v_platform_fee := round(v_line_total * v_platform_fee_percent / 100, 0);
  v_total := v_line_total + v_delivery_fee + v_platform_fee;

  if p_share_link_id is not null then
    select * into v_link from public.post_share_links l
    where l.id=p_share_link_id and l.post_id=p_post_id and l.is_active=true;
    if found
      and v_link.sharer_id <> v_buyer_id
      and v_link.sharer_id <> v_post.author_id
      and v_post.share_reward_iqd > 0 then
      v_share_link_id := v_link.id;
      v_share_reward := v_post.share_reward_iqd;
    end if;
  end if;

  update public.posts
  set category_details = jsonb_set(
    category_details,
    '{stock_quantity}',
    to_jsonb(v_stock - p_quantity),
    true
  )
  where id=p_post_id and author_id=v_post.author_id;

  insert into public.electronics_post_orders(
    request_id,buyer_id,seller_id,post_id,post_title,brand,product_details,quantity,
    unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,
    delivery_city,delivery_fee_iqd,platform_fee_iqd,total_iqd,share_link_id,share_reward_iqd
  ) values (
    p_request_id,v_buyer_id,v_post.author_id,p_post_id,v_post.title,v_post.brand,v_post.category_details,p_quantity,
    v_price,v_line_total,btrim(p_delivery_address),btrim(p_buyer_phone),nullif(btrim(p_customer_note),''),
    coalesce(p_payment_method,'cash_on_delivery'),'pending',btrim(p_delivery_city),v_delivery_fee,v_platform_fee,
    v_total,v_share_link_id,v_share_reward
  ) returning id,order_number into v_order_id,v_order_number;

  insert into public.notifications(
    user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data
  ) values (
    v_post.author_id,'order_created','داواکاریی ئەلیکترۆنیاتی نوێ',
    'داواکارییەکی نوێ بۆ '||v_post.title||' تۆمار کرا.',
    'طلب إلكترونيات جديد','تم استلام طلب جديد لـ '||v_post.title||'.',
    'New electronics order','A new order was placed for '||v_post.title||'.',
    '/post-orders','electronics_post_order',v_order_id,
    jsonb_build_object('order_number',v_order_number,'post_id',p_post_id,'quantity',p_quantity,'total_iqd',v_total)
  );

  return jsonb_build_object(
    'id',v_order_id,'order_number',v_order_number,'status','pending','quantity',p_quantity,
    'unit_price_iqd',v_price,'line_total_iqd',v_line_total,'delivery_city',btrim(p_delivery_city),
    'delivery_fee_iqd',v_delivery_fee,'platform_fee_iqd',v_platform_fee,'total_iqd',v_total
  );
end;
$function$;

revoke all on function public.create_electronics_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.create_electronics_post_order_with_share(uuid,uuid,integer,text,text,text,text,text,uuid) to authenticated;

create or replace function public.update_electronics_post_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.electronics_post_orders%rowtype;
  v_stock integer;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_status not in ('confirmed','rejected','delivered','cancelled') then
    raise exception using errcode='22023', message='Invalid electronics order status';
  end if;

  select * into v_order from public.electronics_post_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='Electronics order not found'; end if;

  if v_user_id=v_order.buyer_id then
    if v_order.status <> 'pending' or p_status <> 'cancelled' then
      raise exception using errcode='42501', message='Buyers may only cancel pending electronics orders';
    end if;
  elsif v_user_id=v_order.seller_id or (select private.has_permission('posts.manage')) then
    if not (
      (v_order.status='pending' and p_status in ('confirmed','rejected','cancelled'))
      or (v_order.status='confirmed' and p_status in ('delivered','cancelled'))
    ) then
      raise exception using errcode='22023', message='Invalid electronics order status transition';
    end if;
  else
    raise exception using errcode='42501', message='You cannot manage this electronics order';
  end if;

  if p_status in ('rejected','cancelled') and v_order.status in ('pending','confirmed') then
    select coalesce(nullif(category_details->>'stock_quantity','')::integer,0)
      into v_stock from public.posts where id=v_order.post_id for update;
    update public.posts
    set category_details=jsonb_set(
      category_details,
      '{stock_quantity}',
      to_jsonb(coalesce(v_stock,0) + v_order.quantity),
      true
    )
    where id=v_order.post_id and category='electronics'::public.post_category;
  end if;

  update public.electronics_post_orders
  set status=p_status,
      payment_status=case when p_status='delivered' then 'collected' else payment_status end
  where id=p_order_id;

  return jsonb_build_object('id',p_order_id,'status',p_status,
    'payment_status',case when p_status='delivered' then 'collected' else v_order.payment_status end);
end;
$function$;

revoke all on function public.update_electronics_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_electronics_post_order_status(uuid,text) to authenticated;

create or replace function private.award_electronics_post_share_reward()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_earning_id uuid;
  v_balance_after numeric(14,2);
begin
  if new.status <> 'delivered' or new.payment_status <> 'collected' then return new; end if;
  if new.share_link_id is null or coalesce(new.share_reward_iqd,0)<=0 then return new; end if;

  insert into public.share_earnings(
    sharer_id,share_link_id,post_id,post_title,order_type,order_id,order_number,amount_iqd
  )
  select l.sharer_id,l.id,new.post_id,new.post_title,'electronics_post',new.id,new.order_number,new.share_reward_iqd
  from public.post_share_links l
  join public.posts p on p.id=l.post_id
  where l.id=new.share_link_id
    and l.post_id=new.post_id
    and l.sharer_id<>new.buyer_id
    and l.sharer_id<>new.seller_id
    and p.author_id<>l.sharer_id
  on conflict (order_type,order_id) do nothing
  returning id into v_earning_id;

  if v_earning_id is null then return new; end if;

  insert into public.share_wallet_accounts(user_id)
  select sharer_id from public.share_earnings where id=v_earning_id
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
  select e.sharer_id,'earning',e.amount_iqd,v_balance_after,'electronics_post',e.order_id,
    'Reward for a completed purchase from a shared electronics post'
  from public.share_earnings e
  where e.id=v_earning_id;

  insert into public.notifications(
    user_id,type,title_ku,body_ku,title_ar,body_ar,title_en,body_en,route,entity_type,entity_id,data
  )
  select e.sharer_id,'share_earning','خەڵاتی شێرکردن زیادکرا',
    'خەڵاتی '||to_char(e.amount_iqd,'FM999,999,999,990')||' د.ع بۆ کڕینی '||e.post_title||' زیادکرا.',
    'تمت إضافة مكافأة مشاركة','تمت إضافة مكافأتك لعملية شراء إلكترونيات مكتملة.',
    'Electronics share reward credited','Your reward for a completed electronics purchase is now available.',
    '/dashboard/referral-wallet','share_earning',e.id,
    jsonb_build_object('amount_iqd',e.amount_iqd,'order_number',e.order_number,'post_id',e.post_id)
  from public.share_earnings e where e.id=v_earning_id;

  return new;
end;
$function$;

revoke all on function private.award_electronics_post_share_reward() from public, anon, authenticated;

drop trigger if exists electronics_post_orders_award_share_reward on public.electronics_post_orders;
create trigger electronics_post_orders_award_share_reward
  after update of status, payment_status on public.electronics_post_orders
  for each row
  when (new.status='delivered' and new.payment_status='collected')
  execute function private.award_electronics_post_share_reward();

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='electronics_post_orders'
    ) then
    execute 'alter publication supabase_realtime add table public.electronics_post_orders';
  end if;
end $$;

commit;
