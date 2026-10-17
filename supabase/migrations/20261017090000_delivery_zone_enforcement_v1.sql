-- Delivery-zone enforcement for user posts and store products.
-- Zones are measured in kilometers using the Haversine great-circle distance.
begin;

alter table public.posts
  add column if not exists delivery_latitude numeric(9,6),
  add column if not exists delivery_longitude numeric(9,6),
  add column if not exists delivery_radius_km numeric(6,2) not null default 15;

alter table public.stores
  add column if not exists delivery_latitude numeric(9,6),
  add column if not exists delivery_longitude numeric(9,6),
  add column if not exists delivery_radius_km numeric(6,2) not null default 15;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname='posts_delivery_zone_valid' and conrelid='public.posts'::regclass) then
    alter table public.posts add constraint posts_delivery_zone_valid check (
      delivery_radius_km between 1 and 100
      and ((delivery_latitude is null and delivery_longitude is null)
        or (delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='stores_delivery_zone_valid' and conrelid='public.stores'::regclass) then
    alter table public.stores add constraint stores_delivery_zone_valid check (
      delivery_radius_km between 1 and 100
      and ((delivery_latitude is null and delivery_longitude is null)
        or (delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180))
    );
  end if;
end;
$constraints$;

grant select (delivery_latitude, delivery_longitude, delivery_radius_km) on public.posts to authenticated;
grant insert (delivery_latitude, delivery_longitude, delivery_radius_km) on public.posts to authenticated;
grant update (delivery_latitude, delivery_longitude, delivery_radius_km) on public.posts to authenticated;
grant select (delivery_latitude, delivery_longitude, delivery_radius_km) on public.stores to authenticated;
grant insert (delivery_latitude, delivery_longitude, delivery_radius_km) on public.stores to authenticated;
grant update (delivery_latitude, delivery_longitude, delivery_radius_km) on public.stores to authenticated;

-- Location entered at order time is stored separately from profile identity data.
create table if not exists private.customer_delivery_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);
alter table private.customer_delivery_points enable row level security;
revoke all on private.customer_delivery_points from public, anon, authenticated;

create or replace function public.set_my_delivery_point(p_latitude numeric, p_longitude numeric)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude < -90 or p_latitude > 90
    or p_longitude < -180 or p_longitude > 180 then
    raise exception using errcode='22023', message='Invalid delivery GPS coordinates';
  end if;
  insert into private.customer_delivery_points(user_id, latitude, longitude, updated_at)
  values (v_user_id, round(p_latitude, 6), round(p_longitude, 6), now())
  on conflict (user_id) do update set
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    updated_at=excluded.updated_at;
  return jsonb_build_object('saved', true, 'updated_at', now());
end;
$function$;
revoke all on function public.set_my_delivery_point(numeric,numeric) from public, anon;
grant execute on function public.set_my_delivery_point(numeric,numeric) to authenticated;

create or replace function private.delivery_distance_km(
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_destination_lat numeric,
  p_destination_lng numeric
)
returns double precision
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select 6371.0088 * 2 * asin(sqrt(least(1.0::double precision, greatest(0.0::double precision,
    power(sin(radians((p_destination_lat - p_origin_lat)::double precision) / 2), 2)
    + cos(radians(p_origin_lat::double precision))
    * cos(radians(p_destination_lat::double precision))
    * power(sin(radians((p_destination_lng - p_origin_lng)::double precision) / 2), 2)
  ))));
$function$;
revoke all on function private.delivery_distance_km(numeric,numeric,numeric,numeric) from public, anon, authenticated;

create or replace function private.guard_post_delivery_zone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if new.delivery_latitude is null or new.delivery_longitude is null then
    raise exception using errcode='22023', message='پێش پۆستکردن شوێنی GPS و ناوچەی گەیاندن دیاری بکە.';
  end if;
  if new.delivery_radius_km is null or new.delivery_radius_km < 1 or new.delivery_radius_km > 100 then
    raise exception using errcode='22023', message='مەودای گەیاندن دەبێت لە ١ تا ١٠٠ کیلۆمەتر بێت.';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_post_delivery_zone() from public, anon, authenticated;
drop trigger if exists posts_require_delivery_zone on public.posts;
create trigger posts_require_delivery_zone
before insert or update of delivery_latitude, delivery_longitude, delivery_radius_km
on public.posts
for each row execute function private.guard_post_delivery_zone();

create or replace function private.enforce_store_delivery_zone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_store public.stores%rowtype;
  v_distance double precision;
begin
  if new.delivery_lat is null or new.delivery_lng is null then
    raise exception using errcode='P0001', message='DELIVERY_ZONE_UNAVAILABLE: تکایە شوێنی گەیاندنت بە GPS دیاری بکە.';
  end if;
  select * into v_store from public.stores s where s.id=new.store_id and s.status='active';
  if not found or v_store.delivery_latitude is null or v_store.delivery_longitude is null then
    raise exception using errcode='P0001', message='DELIVERY_ZONE_UNAVAILABLE: فرۆشیار هێشتا ناوچەی گەیاندنی دیاری نەکردووە.';
  end if;
  v_distance := private.delivery_distance_km(
    v_store.delivery_latitude, v_store.delivery_longitude, new.delivery_lat, new.delivery_lng
  );
  if v_distance > v_store.delivery_radius_km then
    raise exception using errcode='P0001', message='DELIVERY_ZONE_UNAVAILABLE: ئەم ناونیشانە لە دەرەوەی مەودای گەیاندنی فرۆشگایە.';
  end if;
  return new;
end;
$function$;
revoke all on function private.enforce_store_delivery_zone() from public, anon, authenticated;
drop trigger if exists orders_enforce_store_delivery_zone on public.orders;
create trigger orders_enforce_store_delivery_zone
before insert on public.orders
for each row execute function private.enforce_store_delivery_zone();

-- The post-order tables share buyer_id/post_id. Save the customer's GPS point
-- into each order as an immutable snapshot while validating the post's zone.
alter table public.food_post_orders
  add column if not exists delivery_lat numeric(9,6),
  add column if not exists delivery_lng numeric(9,6);
alter table public.apparel_post_orders
  add column if not exists delivery_lat numeric(9,6),
  add column if not exists delivery_lng numeric(9,6);
alter table public.electronics_post_orders
  add column if not exists delivery_lat numeric(9,6),
  add column if not exists delivery_lng numeric(9,6);

create or replace function private.enforce_post_delivery_zone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_buyer_id uuid;
  v_post_id uuid;
  v_customer_point private.customer_delivery_points%rowtype;
  v_post public.posts%rowtype;
  v_distance double precision;
begin
  v_buyer_id := nullif(to_jsonb(new)->>'buyer_id','')::uuid;
  v_post_id := nullif(to_jsonb(new)->>'post_id','')::uuid;
  if v_buyer_id is null or v_post_id is null then
    raise exception using errcode='P0001', message='DELIVERY_ZONE_UNAVAILABLE: ناتوانرا زانیاریی داواکاری پشتڕاست بکرێتەوە.';
  end if;
  select * into v_customer_point from private.customer_delivery_points cp where cp.user_id=v_buyer_id;
  if not found then
    raise exception using errcode='P0001', message='DELIVERY_ZONE_UNAVAILABLE: تکایە شوێنی گەیاندنت بە GPS دیاری بکە.';
  end if;
  select * into v_post from public.posts p where p.id=v_post_id and p.status='active';
  if not found or v_post.delivery_latitude is null or v_post.delivery_longitude is null then
    raise exception using errcode='P0001', message='DELIVERY_ZONE_UNAVAILABLE: بۆ ئەم پۆستە زۆنی گەیاندن دیاری نەکراوە.';
  end if;
  v_distance := private.delivery_distance_km(
    v_post.delivery_latitude, v_post.delivery_longitude,
    v_customer_point.latitude, v_customer_point.longitude
  );
  if v_distance > v_post.delivery_radius_km then
    raise exception using errcode='P0001', message='DELIVERY_ZONE_UNAVAILABLE: ئەم ناونیشانە لە دەرەوەی زۆنی گەیاندنی پۆستەکەیە.';
  end if;
  new.delivery_lat := v_customer_point.latitude;
  new.delivery_lng := v_customer_point.longitude;
  return new;
end;
$function$;
revoke all on function private.enforce_post_delivery_zone() from public, anon, authenticated;

do $triggers$
begin
  if to_regclass('public.food_post_orders') is not null then
    execute 'drop trigger if exists food_post_orders_enforce_delivery_zone on public.food_post_orders';
    execute 'create trigger food_post_orders_enforce_delivery_zone before insert on public.food_post_orders for each row execute function private.enforce_post_delivery_zone()';
  end if;
  if to_regclass('public.apparel_post_orders') is not null then
    execute 'drop trigger if exists apparel_post_orders_enforce_delivery_zone on public.apparel_post_orders';
    execute 'create trigger apparel_post_orders_enforce_delivery_zone before insert on public.apparel_post_orders for each row execute function private.enforce_post_delivery_zone()';
  end if;
  if to_regclass('public.electronics_post_orders') is not null then
    execute 'drop trigger if exists electronics_post_orders_enforce_delivery_zone on public.electronics_post_orders';
    execute 'create trigger electronics_post_orders_enforce_delivery_zone before insert on public.electronics_post_orders for each row execute function private.enforce_post_delivery_zone()';
  end if;
end;
$triggers$;

notify pgrst, 'reload schema';
commit;
