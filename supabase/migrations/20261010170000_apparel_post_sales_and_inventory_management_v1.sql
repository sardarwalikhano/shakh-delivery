-- Additive direct-sale workflow for apparel posts. Existing marketplace orders remain unchanged.
alter table public.posts
  add column if not exists item_condition text,
  add column if not exists apparel_audience text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='posts_item_condition_valid' and conrelid='public.posts'::regclass) then
    alter table public.posts add constraint posts_item_condition_valid check (item_condition is null or item_condition in ('new','used'));
  end if;
  if not exists (select 1 from pg_constraint where conname='posts_apparel_audience_valid' and conrelid='public.posts'::regclass) then
    alter table public.posts add constraint posts_apparel_audience_valid check (apparel_audience is null or apparel_audience in ('men','women','kids','all'));
  end if;
end $$;

create table if not exists public.apparel_post_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('AP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  request_id uuid not null,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  post_id uuid not null references public.posts(id) on delete restrict,
  variant_id uuid not null references public.apparel_variants(id) on delete restrict,
  post_title text not null,
  color_name text not null,
  color_hex text not null,
  size_label text not null,
  quantity integer not null check (quantity between 1 and 100),
  unit_price_iqd numeric(14,2) not null check (unit_price_iqd > 0),
  line_total_iqd numeric(16,2) not null check (line_total_iqd > 0),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 5 and 1000),
  buyer_phone text not null check (char_length(btrim(buyer_phone)) between 6 and 40),
  customer_note text null check (customer_note is null or char_length(customer_note) <= 2000),
  payment_method text not null default 'cash_on_delivery' check (payment_method in ('cash_on_delivery','mobile_cash')),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apparel_post_orders_buyer_request_unique unique (buyer_id, request_id)
);

create index if not exists apparel_post_orders_buyer_created_idx on public.apparel_post_orders(buyer_id, created_at desc);
create index if not exists apparel_post_orders_seller_created_idx on public.apparel_post_orders(seller_id, created_at desc);
create index if not exists apparel_post_orders_post_idx on public.apparel_post_orders(post_id, created_at desc);

alter table public.apparel_post_orders enable row level security;
drop policy if exists apparel_post_orders_select_participants on public.apparel_post_orders;
create policy apparel_post_orders_select_participants on public.apparel_post_orders for select to authenticated
using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select private.has_permission('posts.manage')));
revoke all on public.apparel_post_orders from anon, authenticated;
grant select on public.apparel_post_orders to authenticated;
drop trigger if exists apparel_post_orders_set_updated_at on public.apparel_post_orders;
create trigger apparel_post_orders_set_updated_at before update on public.apparel_post_orders for each row execute function public.set_updated_at();

create or replace function public.update_apparel_post_and_variants(p_post_id uuid, p_post_patch jsonb, p_variant_patch jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_author_id uuid;
  v_category public.post_category;
  v_item jsonb;
  v_variant_id uuid;
  v_stock integer;
  v_price numeric(14,2);
  v_updated_count integer := 0;
  v_title text;
  v_content text;
  v_base_price numeric(14,2);
  v_discount integer;
  v_condition text;
  v_audience text;
  v_location text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not (select private.has_permission('posts.update_own') or private.has_permission('posts.manage')) then raise exception 'Post update is not permitted'; end if;
  select p.author_id, p.category into v_author_id, v_category from public.posts p where p.id = p_post_id for update;
  if not found then raise exception 'Post not found'; end if;
  if v_author_id <> v_user_id and not (select private.has_permission('posts.manage')) then raise exception 'You can only edit your own posts'; end if;
  if v_category <> 'fashion'::public.post_category then raise exception 'This inventory editor only accepts apparel posts'; end if;

  v_title := nullif(btrim(p_post_patch->>'title'), '');
  v_content := coalesce(p_post_patch->>'content', '');
  v_base_price := nullif(p_post_patch->>'price_iqd', '')::numeric;
  v_discount := coalesce(nullif(p_post_patch->>'discount_percent','')::integer, 0);
  v_condition := coalesce(p_post_patch->>'item_condition', 'new');
  v_audience := coalesce(p_post_patch->>'apparel_audience', 'all');
  v_location := nullif(btrim(p_post_patch->>'location'), '');

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 180 then raise exception 'Title must contain 3 to 180 characters'; end if;
  if v_base_price is null or v_base_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if v_discount < 0 or v_discount > 99 then raise exception 'Discount must be between 0 and 99'; end if;
  if v_condition not in ('new','used') then raise exception 'Invalid item condition'; end if;
  if v_audience not in ('men','women','kids','all') then raise exception 'Invalid apparel audience'; end if;
  if jsonb_typeof(coalesce(p_variant_patch, '[]'::jsonb)) <> 'array' then raise exception 'Variant inventory must be an array'; end if;

  update public.posts set title=v_title, content=left(v_content,12000), price_iqd=v_base_price, location=v_location,
    item_condition=v_condition, apparel_audience=v_audience, discount_percent=v_discount where id=p_post_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_variant_patch, '[]'::jsonb)) loop
    if coalesce(v_item->>'id','') = '' then raise exception 'Variant id is required'; end if;
    v_variant_id := (v_item->>'id')::uuid;
    v_stock := (v_item->>'stock_quantity')::integer;
    v_price := nullif(v_item->>'price_iqd','')::numeric;
    if v_stock is null or v_stock < 0 then raise exception 'Stock must be a whole number of zero or more'; end if;
    if v_price is not null and v_price <= 0 then raise exception 'Variant price must be greater than zero or empty'; end if;
    update public.apparel_variants set stock_quantity=v_stock, price_iqd=v_price where id=v_variant_id and post_id=p_post_id;
    if not found then raise exception 'Variant does not belong to this post'; end if;
    v_updated_count := v_updated_count + 1;
  end loop;
  return jsonb_build_object('post_id',p_post_id,'updated_variants',v_updated_count);
end;
$$;
revoke all on function public.update_apparel_post_and_variants(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.update_apparel_post_and_variants(uuid,jsonb,jsonb) to authenticated;

create or replace function public.create_apparel_post_order(
  p_request_id uuid, p_variant_id uuid, p_quantity integer, p_delivery_address text, p_buyer_phone text,
  p_customer_note text default null, p_payment_method text default 'cash_on_delivery'
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_existing jsonb;
  v_post_id uuid;
  v_seller_id uuid;
  v_post_status public.post_status;
  v_title text;
  v_base_price numeric(14,2);
  v_variant_price numeric(14,2);
  v_discount integer;
  v_stock integer;
  v_color_name text;
  v_color_hex text;
  v_size_label text;
  v_effective_price numeric(14,2);
  v_order_id uuid;
  v_order_number text;
begin
  if v_buyer_id is null then raise exception 'Authentication required'; end if;
  if not (select private.has_permission('checkout.create')) then raise exception 'Checkout is not permitted for this role'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'Quantity must be between 1 and 100'; end if;
  if p_delivery_address is null or char_length(btrim(p_delivery_address)) < 5 or char_length(p_delivery_address) > 1000 then raise exception 'A valid delivery address is required'; end if;
  if p_buyer_phone is null or char_length(btrim(p_buyer_phone)) < 6 or char_length(p_buyer_phone) > 40 then raise exception 'A valid phone number is required'; end if;
  if p_customer_note is not null and char_length(p_customer_note) > 2000 then raise exception 'Customer note is too long'; end if;
  if coalesce(p_payment_method,'cash_on_delivery') not in ('cash_on_delivery','mobile_cash') then raise exception 'Invalid payment method'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_buyer_id::text || ':' || p_request_id::text, 0));
  select jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'quantity',o.quantity,'unit_price_iqd',o.unit_price_iqd,'line_total_iqd',o.line_total_iqd)
  into v_existing from public.apparel_post_orders o where o.buyer_id=v_buyer_id and o.request_id=p_request_id;
  if v_existing is not null then return v_existing; end if;

  select p.id,p.author_id,p.status,p.title,p.price_iqd,p.discount_percent,
    av.stock_quantity,av.price_iqd,av.color_name,av.color_hex,av.size_label
  into v_post_id,v_seller_id,v_post_status,v_title,v_base_price,v_discount,
    v_stock,v_variant_price,v_color_name,v_color_hex,v_size_label
  from public.apparel_variants av join public.posts p on p.id=av.post_id
  where av.id=p_variant_id and p.category='fashion'::public.post_category for update of av,p;

  if not found then raise exception 'The selected apparel variant was not found'; end if;
  if v_post_status <> 'active'::public.post_status then raise exception 'This post is not available for purchase'; end if;
  if v_seller_id=v_buyer_id then raise exception 'You cannot purchase your own post'; end if;
  if v_stock < p_quantity then raise exception 'Insufficient stock for the selected color and size'; end if;
  v_effective_price := round(coalesce(v_variant_price,v_base_price)*(100-coalesce(v_discount,0))/100,0);
  if v_effective_price <= 0 then raise exception 'The current price is invalid'; end if;

  update public.apparel_variants set stock_quantity=stock_quantity-p_quantity where id=p_variant_id and stock_quantity>=p_quantity returning stock_quantity into v_stock;
  if not found then raise exception 'Stock changed. Refresh and choose a new quantity'; end if;

  insert into public.apparel_post_orders(
    request_id,buyer_id,seller_id,post_id,variant_id,post_title,color_name,color_hex,size_label,quantity,
    unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status
  ) values (
    p_request_id,v_buyer_id,v_seller_id,v_post_id,p_variant_id,v_title,v_color_name,v_color_hex,v_size_label,p_quantity,
    v_effective_price,v_effective_price*p_quantity,btrim(p_delivery_address),btrim(p_buyer_phone),nullif(btrim(p_customer_note),''),coalesce(p_payment_method,'cash_on_delivery'),'pending'
  ) returning id,order_number into v_order_id,v_order_number;

  return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'status','pending','quantity',p_quantity,'unit_price_iqd',v_effective_price,'line_total_iqd',v_effective_price*p_quantity);
end;
$$;
revoke all on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.create_apparel_post_order(uuid,uuid,integer,text,text,text,text) to authenticated;

create or replace function public.update_apparel_post_order_status(p_order_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.apparel_post_orders%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_status not in ('pending','confirmed','rejected','delivered','cancelled') then raise exception 'Invalid order status'; end if;
  select * into v_order from public.apparel_post_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if v_user_id=v_order.buyer_id then
    if v_order.status <> 'pending' or p_status <> 'cancelled' then raise exception 'Buyers may only cancel pending orders'; end if;
  elsif v_user_id=v_order.seller_id and not (select private.has_permission('posts.manage')) then
    if not ((v_order.status='pending' and p_status in ('confirmed','rejected','cancelled')) or (v_order.status='confirmed' and p_status in ('delivered','cancelled'))) then
      raise exception 'Invalid seller order status transition';
    end if;
  elsif not (select private.has_permission('posts.manage')) then raise exception 'You cannot manage this order'; end if;

  if p_status in ('cancelled','rejected') and v_order.status in ('pending','confirmed') then
    update public.apparel_variants set stock_quantity=stock_quantity+v_order.quantity where id=v_order.variant_id;
  end if;
  update public.apparel_post_orders set status=p_status where id=p_order_id;
  return jsonb_build_object('id',p_order_id,'status',p_status);
end;
$$;
revoke all on function public.update_apparel_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_apparel_post_order_status(uuid,text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='apparel_post_orders') then
    execute 'alter publication supabase_realtime add table public.apparel_post_orders';
  end if;
end $$;
