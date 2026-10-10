-- SHAKH apparel management and checkout v2.
-- Additive migration: preserves existing posts, apparel variants, cart, checkout and order data.

alter table public.posts
  add column if not exists target_audience text not null default 'unisex',
  add column if not exists item_condition text not null default 'new';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_target_audience_valid') then
    alter table public.posts add constraint posts_target_audience_valid
      check (target_audience in ('men','women','kids','unisex'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_item_condition_valid') then
    alter table public.posts add constraint posts_item_condition_valid
      check (item_condition in ('new','used'));
  end if;
end $$;

create table if not exists public.apparel_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('SHK-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  idempotency_key text not null,
  customer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  post_id uuid not null references public.posts(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','confirmed','preparing','shipping','delivered','cancelled')),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 5 and 500),
  customer_note text null check (customer_note is null or char_length(customer_note) <= 2000),
  currency text not null default 'IQD' check (currency = 'IQD'),
  subtotal_iqd numeric(14,2) not null check (subtotal_iqd > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apparel_orders_customer_idempotency_unique unique (customer_id, idempotency_key)
);

create table if not exists public.apparel_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.apparel_orders(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete restrict,
  variant_id uuid null references public.apparel_variants(id) on delete set null,
  product_title text not null,
  color_name text not null,
  color_hex text not null,
  size_label text not null,
  quantity integer not null check (quantity > 0),
  unit_price_iqd numeric(14,2) not null check (unit_price_iqd > 0),
  discount_percent integer not null default 0 check (discount_percent between 0 and 99),
  line_total_iqd numeric(14,2) not null check (line_total_iqd > 0),
  created_at timestamptz not null default now()
);

create index if not exists apparel_orders_customer_created_idx
  on public.apparel_orders(customer_id, created_at desc);
create index if not exists apparel_orders_seller_created_idx
  on public.apparel_orders(seller_id, created_at desc);
create index if not exists apparel_order_items_order_idx
  on public.apparel_order_items(order_id);

alter table public.apparel_orders enable row level security;
alter table public.apparel_order_items enable row level security;

drop policy if exists apparel_orders_read_parties on public.apparel_orders;
create policy apparel_orders_read_parties
on public.apparel_orders for select to authenticated
using (
  customer_id = (select auth.uid())
  or seller_id = (select auth.uid())
  or (select private.has_permission('orders.view_all'))
);

drop policy if exists apparel_order_items_read_parties on public.apparel_order_items;
create policy apparel_order_items_read_parties
on public.apparel_order_items for select to authenticated
using (
  exists (
    select 1 from public.apparel_orders ao
    where ao.id = order_id
      and (
        ao.customer_id = (select auth.uid())
        or ao.seller_id = (select auth.uid())
        or (select private.has_permission('orders.view_all'))
      )
  )
);

revoke all on public.apparel_orders from anon, authenticated;
revoke all on public.apparel_order_items from anon, authenticated;
grant select on public.apparel_orders, public.apparel_order_items to authenticated;

drop trigger if exists apparel_orders_set_updated_at on public.apparel_orders;
create trigger apparel_orders_set_updated_at
before update on public.apparel_orders
for each row execute function public.set_updated_at();

create or replace function public.create_apparel_order(
  p_idempotency_key text,
  p_post_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_customer uuid := (select auth.uid());
  v_post public.posts%rowtype;
  v_variant public.apparel_variants%rowtype;
  v_order public.apparel_orders%rowtype;
  v_unit_price numeric(14,2);
  v_line_total numeric(14,2);
begin
  if v_customer is null then raise exception 'Not authenticated'; end if;
  if not (select private.has_permission('checkout.create')) then
    raise exception 'Checkout is not permitted for this role';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 120 then
    raise exception 'A valid idempotency key is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 50 then
    raise exception 'Quantity must be between 1 and 50';
  end if;
  if p_delivery_address is null or char_length(btrim(p_delivery_address)) < 5 or char_length(btrim(p_delivery_address)) > 500 then
    raise exception 'Delivery address must be between 5 and 500 characters';
  end if;
  if p_customer_note is not null and char_length(p_customer_note) > 2000 then
    raise exception 'Customer note is too long';
  end if;

  select * into v_order from public.apparel_orders
  where customer_id = v_customer and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'subtotal_iqd', v_order.subtotal_iqd, 'replayed', true);
  end if;

  select * into v_post from public.posts
  where id = p_post_id and category = 'fashion'::public.post_category and status = 'active'::public.post_status
  for update;
  if not found then raise exception 'This apparel post is no longer available'; end if;
  if v_post.author_id = v_customer then raise exception 'You cannot purchase your own post'; end if;

  select * into v_variant from public.apparel_variants
  where id = p_variant_id and post_id = v_post.id
  for update;
  if not found then raise exception 'Choose a valid color and size combination'; end if;
  if v_variant.stock_quantity < p_quantity then
    raise exception 'Not enough stock for the selected color and size';
  end if;

  v_unit_price := round(coalesce(v_variant.price_iqd, v_post.price_iqd) * (100 - v_post.discount_percent) / 100.0, 2);
  if v_unit_price is null or v_unit_price <= 0 then raise exception 'This combination has an invalid price'; end if;
  v_line_total := v_unit_price * p_quantity;

  insert into public.apparel_orders (
    idempotency_key, customer_id, seller_id, post_id, delivery_address, customer_note, subtotal_iqd
  ) values (
    p_idempotency_key, v_customer, v_post.author_id, v_post.id,
    btrim(p_delivery_address), nullif(btrim(coalesce(p_customer_note, '')), ''), v_line_total
  ) returning * into v_order;

  insert into public.apparel_order_items (
    order_id, post_id, variant_id, product_title, color_name, color_hex,
    size_label, quantity, unit_price_iqd, discount_percent, line_total_iqd
  ) values (
    v_order.id, v_post.id, v_variant.id, v_post.title, v_variant.color_name,
    v_variant.color_hex, v_variant.size_label, p_quantity, v_unit_price,
    v_post.discount_percent, v_line_total
  );

  update public.apparel_variants
  set stock_quantity = stock_quantity - p_quantity, updated_at = now()
  where id = v_variant.id;

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number,
    'status', v_order.status, 'subtotal_iqd', v_order.subtotal_iqd, 'replayed', false);
end;
$$;

revoke all on function public.create_apparel_order(text, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.create_apparel_order(text, uuid, uuid, integer, text, text) to authenticated;

create or replace function public.update_apparel_post(
  p_post_id uuid,
  p_title text,
  p_content text,
  p_price_iqd numeric,
  p_location text,
  p_apparel_type text,
  p_brand text,
  p_material text,
  p_country_of_origin text,
  p_season text,
  p_discount_percent integer,
  p_target_audience text,
  p_item_condition text,
  p_images jsonb,
  p_variants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := (select auth.uid());
  v_post public.posts%rowtype;
  v_item jsonb;
  v_variant_id uuid;
  v_image_path text;
  v_keep_ids uuid[] := array[]::uuid[];
  v_stock_total bigint := 0;
  v_count integer := 0;
  v_existing_count integer := 0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then raise exception 'Post not found'; end if;
  if not (
    (v_post.author_id = v_user and (select private.has_permission('posts.update_own')))
    or (select private.has_permission('posts.manage'))
  ) then raise exception 'You are not allowed to edit this post'; end if;
  if v_post.category <> 'fashion'::public.post_category then raise exception 'Only apparel posts can be edited here'; end if;

  if p_title is null or char_length(btrim(p_title)) not between 3 and 180 then raise exception 'Title must be between 3 and 180 characters'; end if;
  if p_content is null or char_length(p_content) > 12000 then raise exception 'Invalid description'; end if;
  if p_price_iqd is null or p_price_iqd <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_apparel_type not in ('mens_clothing','womens_clothing','kids_clothing','mens_shoes','womens_shoes','kids_shoes','bags','sportswear','home_textiles','beauty_fashion_accessories','other_accessories') then raise exception 'Invalid apparel type'; end if;
  if p_season not in ('summer','winter','all_seasons') then raise exception 'Invalid season'; end if;
  if p_discount_percent is null or p_discount_percent < 0 or p_discount_percent > 99 then raise exception 'Invalid discount'; end if;
  if p_target_audience not in ('men','women','kids','unisex') then raise exception 'Invalid target audience'; end if;
  if p_item_condition not in ('new','used') then raise exception 'Invalid item condition'; end if;
  if coalesce(char_length(p_brand),0) > 120 or coalesce(char_length(p_material),0) > 160 or coalesce(char_length(p_country_of_origin),0) > 100 then raise exception 'Apparel text field is too long'; end if;
  if jsonb_typeof(p_images) is distinct from 'array' or jsonb_array_length(p_images) not between 1 and 8 then raise exception 'Apparel posts require between 1 and 8 images'; end if;
  if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) not between 1 and 200 then raise exception 'Add valid apparel variants'; end if;

  select coalesce(sum((item->>'stock_quantity')::integer), 0)
  into v_stock_total
  from jsonb_array_elements(p_variants) item
  where coalesce((item->>'stock_quantity')::integer,0) > 0;
  if v_stock_total < 1 then raise exception 'At least one selected combination must have stock'; end if;

  update public.posts set
    title = btrim(p_title), content = p_content, price_iqd = p_price_iqd,
    location = nullif(btrim(coalesce(p_location,'')), ''),
    apparel_type = p_apparel_type, brand = nullif(btrim(coalesce(p_brand,'')), ''),
    material = nullif(btrim(coalesce(p_material,'')), ''),
    country_of_origin = nullif(btrim(coalesce(p_country_of_origin,'')), ''),
    season = p_season, discount_percent = p_discount_percent,
    target_audience = p_target_audience, item_condition = p_item_condition,
    images = p_images, updated_at = now()
  where id = p_post_id;

  select count(*) into v_existing_count from public.apparel_variants where post_id = p_post_id;
  for v_item in select value from jsonb_array_elements(p_variants)
  loop
    if coalesce((v_item->>'color_name'), '') = '' or coalesce((v_item->>'color_hex'), '') !~ '^#[0-9A-Fa-f]{6}$'
      or coalesce((v_item->>'size_label'), '') = ''
      or coalesce((v_item->>'stock_quantity')::integer, -1) < 0
      or (nullif(v_item->>'price_iqd','') is not null and (v_item->>'price_iqd')::numeric <= 0) then
      raise exception 'Invalid apparel variant data';
    end if;

    v_variant_id := nullif(v_item->>'id','')::uuid;
    v_image_path := nullif(v_item->>'image_path','');
    if v_variant_id is null then
      insert into public.apparel_variants(post_id,color_name,color_hex,size_label,stock_quantity,price_iqd,image_path)
      values (p_post_id, btrim(v_item->>'color_name'), lower(v_item->>'color_hex'), btrim(v_item->>'size_label'),
        (v_item->>'stock_quantity')::integer, nullif(v_item->>'price_iqd','')::numeric, v_image_path)
      returning id into v_variant_id;
    else
      update public.apparel_variants set
        color_name = btrim(v_item->>'color_name'), color_hex = lower(v_item->>'color_hex'),
        size_label = btrim(v_item->>'size_label'), stock_quantity = (v_item->>'stock_quantity')::integer,
        price_iqd = nullif(v_item->>'price_iqd','')::numeric, image_path = v_image_path, updated_at = now()
      where id = v_variant_id and post_id = p_post_id;
      if not found then raise exception 'Variant does not belong to this post'; end if;
    end if;
    if v_variant_id = any(v_keep_ids) then raise exception 'Duplicate apparel variant'; end if;
    v_keep_ids := array_append(v_keep_ids, v_variant_id);
    v_count := v_count + 1;
  end loop;

  delete from public.apparel_variants
  where post_id = p_post_id and not (id = any(v_keep_ids));

  return jsonb_build_object('post_id',p_post_id,'variants_saved',v_count,'previous_variants',v_existing_count,
    'status',v_post.status,'updated_at',now());
end;
$$;

revoke all on function public.update_apparel_post(uuid,text,text,numeric,text,text,text,text,text,text,integer,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.update_apparel_post(uuid,text,text,numeric,text,text,text,text,text,text,integer,text,text,jsonb,jsonb) to authenticated;
