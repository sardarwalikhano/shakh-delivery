-- Delivery-radius settings for newly-created marketplace posts.
-- Exact seller GPS coordinates are stored in an RLS-protected table, not public posts rows.
begin;

alter table public.posts
  add column if not exists delivery_radius_km integer not null default 15,
  add column if not exists delivery_zone_required boolean not null default false;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_delivery_radius_km_range'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_delivery_radius_km_range
      check (delivery_radius_km between 1 and 100);
  end if;
end;
$constraint$;

create table if not exists public.post_delivery_zones (
  post_id uuid primary key references public.posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_delivery_zones_owner_idx
  on public.post_delivery_zones(owner_id, created_at desc);

alter table public.post_delivery_zones enable row level security;
revoke all on public.post_delivery_zones from public, anon, authenticated;
grant select, insert, update, delete on public.post_delivery_zones to authenticated;

drop policy if exists post_delivery_zones_select_owner_or_manager on public.post_delivery_zones;
create policy post_delivery_zones_select_owner_or_manager
  on public.post_delivery_zones for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.has_permission('posts.manage')));

drop policy if exists post_delivery_zones_insert_owner on public.post_delivery_zones;
create policy post_delivery_zones_insert_owner
  on public.post_delivery_zones for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = (select auth.uid())
    )
  );

drop policy if exists post_delivery_zones_update_owner on public.post_delivery_zones;
create policy post_delivery_zones_update_owner
  on public.post_delivery_zones for update to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())
  ))
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())
  ));

drop policy if exists post_delivery_zones_delete_owner on public.post_delivery_zones;
create policy post_delivery_zones_delete_owner
  on public.post_delivery_zones for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.has_permission('posts.manage')));

drop trigger if exists post_delivery_zones_set_updated_at on public.post_delivery_zones;
create trigger post_delivery_zones_set_updated_at
  before update on public.post_delivery_zones
  for each row execute function public.set_updated_at();

-- Every newly inserted post requires a delivery zone before it may be published.
-- Existing posts retain legacy behavior until they are recreated with a GPS zone.
create or replace function private.guard_post_delivery_zone_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if tg_op = 'INSERT' then
    new.delivery_zone_required := true;
  elsif old.delivery_zone_required then
    new.delivery_zone_required := true;
  end if;

  if new.delivery_radius_km is null or new.delivery_radius_km not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Delivery radius must be between 1 and 100 km';
  end if;

  if new.delivery_zone_required
    and new.status = 'active'::public.post_status
    and not exists (
      select 1 from public.post_delivery_zones z
      where z.post_id = new.id and z.owner_id = new.author_id
    ) then
    raise exception using errcode = '22023', message = 'پێش بڵاوکردنەوە شوێنی GPS و زۆنی گەیاندن دیاری بکە.';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_post_delivery_zone_publication() from public, anon, authenticated;
drop trigger if exists posts_delivery_zone_publication_guard on public.posts;
create trigger posts_delivery_zone_publication_guard
  before insert or update on public.posts
  for each row execute function private.guard_post_delivery_zone_publication();

create or replace function private.guard_order_post_delivery_zone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_required boolean;
  v_radius integer;
  v_seller_lat double precision;
  v_seller_lng double precision;
  v_buyer_lat double precision;
  v_buyer_lng double precision;
  v_distance double precision;
  v_delta_lat double precision;
  v_delta_lng double precision;
  v_a double precision;
begin
  select p.delivery_zone_required, p.delivery_radius_km, z.latitude, z.longitude
  into v_required, v_radius, v_seller_lat, v_seller_lng
  from public.posts p
  left join public.post_delivery_zones z
    on z.post_id = p.id and z.owner_id = p.author_id
  where p.id = new.post_id;

  if not found or not coalesce(v_required, false) then
    return new;
  end if;

  v_buyer_lat := nullif(current_setting('shakh.delivery_lat', true), '')::double precision;
  v_buyer_lng := nullif(current_setting('shakh.delivery_lng', true), '')::double precision;

  if v_seller_lat is null or v_seller_lng is null
    or v_buyer_lat is null or v_buyer_lng is null
    or v_buyer_lat not between -90 and 90
    or v_buyer_lng not between -180 and 180 then
    raise exception using errcode = '22023',
      message = 'بۆ ئێرە بەردەست نییە؛ شوێنی GPS ـی گەیاندن دیاری بکە.';
  end if;

  v_delta_lat := radians(v_buyer_lat - v_seller_lat);
  v_delta_lng := radians(v_buyer_lng - v_seller_lng);
  v_a := power(sin(v_delta_lat / 2), 2)
    + cos(radians(v_seller_lat)) * cos(radians(v_buyer_lat))
    * power(sin(v_delta_lng / 2), 2);
  v_distance := 6371.0 * 2.0 * asin(sqrt(least(1.0, greatest(0.0, v_a))));

  if v_distance > v_radius then
    raise exception using errcode = '22023',
      message = 'بۆ ئێرە بەردەست نییە؛ شوێنی تۆ لە دەرەوەی زۆنی گەیاندنە (' || v_radius::text || ' کم).';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_order_post_delivery_zone() from public, anon, authenticated;

drop trigger if exists food_post_orders_delivery_zone_guard on public.food_post_orders;
create trigger food_post_orders_delivery_zone_guard
  before insert on public.food_post_orders
  for each row execute function private.guard_order_post_delivery_zone();

drop trigger if exists apparel_post_orders_delivery_zone_guard on public.apparel_post_orders;
create trigger apparel_post_orders_delivery_zone_guard
  before insert on public.apparel_post_orders
  for each row execute function private.guard_order_post_delivery_zone();

drop trigger if exists electronics_post_orders_delivery_zone_guard on public.electronics_post_orders;
create trigger electronics_post_orders_delivery_zone_guard
  before insert on public.electronics_post_orders
  for each row execute function private.guard_order_post_delivery_zone();

-- These wrappers preserve the established inventory, pricing, and Share & Earn RPCs.
-- Coordinates are transaction-local and are never persisted with a customer order.
create or replace function public.checkout_food_post_cart_with_delivery_zone(
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text,
  p_payment_method text,
  p_share_links jsonb,
  p_use_share_balance boolean,
  p_delivery_lat double precision,
  p_delivery_lng double precision
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
begin
  if p_delivery_lat is null or p_delivery_lng is null
    or p_delivery_lat not between -90 and 90
    or p_delivery_lng not between -180 and 180 then
    raise exception using errcode = '22023', message = 'بۆ ئێرە بەردەست نییە؛ سەرەتا شوێنی GPS دیاری بکە.';
  end if;
  perform set_config('shakh.delivery_lat', p_delivery_lat::text, true);
  perform set_config('shakh.delivery_lng', p_delivery_lng::text, true);

  return public.checkout_food_post_cart_with_share(
    p_delivery_address => p_delivery_address,
    p_buyer_phone => p_buyer_phone,
    p_delivery_city => p_delivery_city,
    p_customer_note => p_customer_note,
    p_payment_method => p_payment_method,
    p_share_links => coalesce(p_share_links, '{}'::jsonb),
    p_use_share_balance => coalesce(p_use_share_balance, false)
  );
end;
$function$;

revoke all on function public.checkout_food_post_cart_with_delivery_zone(text, text, text, text, text, jsonb, boolean, double precision, double precision) from public, anon;
grant execute on function public.checkout_food_post_cart_with_delivery_zone(text, text, text, text, text, jsonb, boolean, double precision, double precision) to authenticated;

create or replace function public.create_apparel_post_order_with_delivery_zone(
  p_request_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text,
  p_payment_method text,
  p_share_link_id uuid,
  p_use_share_balance boolean,
  p_delivery_lat double precision,
  p_delivery_lng double precision
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
begin
  if p_delivery_lat is null or p_delivery_lng is null
    or p_delivery_lat not between -90 and 90
    or p_delivery_lng not between -180 and 180 then
    raise exception using errcode = '22023', message = 'بۆ ئێرە بەردەست نییە؛ سەرەتا شوێنی GPS دیاری بکە.';
  end if;
  perform set_config('shakh.delivery_lat', p_delivery_lat::text, true);
  perform set_config('shakh.delivery_lng', p_delivery_lng::text, true);

  return public.create_apparel_post_order_with_share(
    p_request_id => p_request_id,
    p_variant_id => p_variant_id,
    p_quantity => p_quantity,
    p_delivery_address => p_delivery_address,
    p_buyer_phone => p_buyer_phone,
    p_delivery_city => p_delivery_city,
    p_customer_note => p_customer_note,
    p_payment_method => p_payment_method,
    p_share_link_id => p_share_link_id,
    p_use_share_balance => coalesce(p_use_share_balance, false)
  );
end;
$function$;

revoke all on function public.create_apparel_post_order_with_delivery_zone(uuid, uuid, integer, text, text, text, text, text, uuid, boolean, double precision, double precision) from public, anon;
grant execute on function public.create_apparel_post_order_with_delivery_zone(uuid, uuid, integer, text, text, text, text, text, uuid, boolean, double precision, double precision) to authenticated;

create or replace function public.create_electronics_post_order_with_delivery_zone(
  p_request_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_selected_color text,
  p_customer_note text,
  p_payment_method text,
  p_share_link_id uuid,
  p_delivery_lat double precision,
  p_delivery_lng double precision
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
begin
  if p_delivery_lat is null or p_delivery_lng is null
    or p_delivery_lat not between -90 and 90
    or p_delivery_lng not between -180 and 180 then
    raise exception using errcode = '22023', message = 'بۆ ئێرە بەردەست نییە؛ سەرەتا شوێنی GPS دیاری بکە.';
  end if;
  perform set_config('shakh.delivery_lat', p_delivery_lat::text, true);
  perform set_config('shakh.delivery_lng', p_delivery_lng::text, true);

  return public.create_electronics_post_order_with_color_and_share(
    p_request_id => p_request_id,
    p_post_id => p_post_id,
    p_quantity => p_quantity,
    p_delivery_address => p_delivery_address,
    p_buyer_phone => p_buyer_phone,
    p_delivery_city => p_delivery_city,
    p_selected_color => p_selected_color,
    p_customer_note => p_customer_note,
    p_payment_method => p_payment_method,
    p_share_link_id => p_share_link_id
  );
end;
$function$;

revoke all on function public.create_electronics_post_order_with_delivery_zone(uuid, uuid, integer, text, text, text, text, text, text, uuid, double precision, double precision) from public, anon;
grant execute on function public.create_electronics_post_order_with_delivery_zone(uuid, uuid, integer, text, text, text, text, text, text, uuid, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
commit;
