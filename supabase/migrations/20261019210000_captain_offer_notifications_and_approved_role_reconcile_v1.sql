-- Restore captain access for already-approved captain requests and deliver offers
-- consistently for food, apparel, and electronics direct-post orders.
-- Additive and idempotent: no order, wallet, payment, or historical status is changed.
begin;

-- These users were already explicitly approved by Super Admin, but the matching
-- user_roles rows are missing. Reconcile only approved captain requests.
insert into public.user_roles(user_id, role)
select rr.user_id, rr.requested_role
from public.role_requests rr
where rr.requested_role::text = 'captain'
  and rr.status = 'approved'
  and not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = rr.user_id
      and ur.role::text = 'captain'
  )
on conflict do nothing;

create or replace function private.notify_direct_post_captains()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_category text;
  v_title text;
  v_city text;
  v_order_number text;
  v_order_id uuid;
  v_order_type text;
  v_entity_type text;
begin
  if new.status::text <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from 'confirmed' then
    return new;
  end if;

  if tg_table_name = 'food_post_orders' then
    v_category := 'خواردن';
    v_order_type := 'food_post';
    v_entity_type := 'food_post_order';
  elsif tg_table_name = 'apparel_post_orders' then
    v_category := 'جل‌وبەرگ';
    v_order_type := 'apparel_post';
    v_entity_type := 'apparel_post_order';
  elsif tg_table_name = 'electronics_post_orders' then
    v_category := 'بەرهەمی بازاڕ';
    v_order_type := 'product_post';
    v_entity_type := 'product_post_order';
  else
    return new;
  end if;

  -- Do not offer a delivery that is already assigned or no longer open.
  if new.captain_id is not null or new.delivery_status::text <> 'pending' then
    return new;
  end if;

  v_title := new.post_title;
  v_city := new.delivery_city;
  v_order_number := new.order_number;
  v_order_id := new.id;

  insert into public.notifications(
    user_id, type, title_ku, body_ku, title_ar, body_ar,
    title_en, body_en, route, entity_type, entity_id, data
  )
  select
    ur.user_id,
    'delivery_offer',
    'گەیاندنی نوێ بۆ وەرگرتن',
    'داواکاریی ' || v_category || ' «' || v_title || '» لە ' ||
      coalesce(v_city, 'شارێکی دیارینەکراو') || ' ئامادەیە بۆ وەرگرتن.',
    'عرض توصيل جديد',
    'طلب جديد بانتظار كابتن للتوصيل.',
    'New delivery offer',
    'A confirmed order is ready for captain pickup.',
    '/dashboard/deliveries',
    v_entity_type,
    v_order_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'order_type', v_order_type,
      'city', v_city,
      'post_title', v_title
    )
  from public.user_roles ur
  where ur.role::text = 'captain'
    and not exists (
      select 1
      from public.notifications existing
      where existing.user_id = ur.user_id
        and existing.type = 'delivery_offer'
        and existing.entity_type = v_entity_type
        and existing.entity_id = v_order_id
    );

  return new;
end;
$function$;

revoke all on function private.notify_direct_post_captains() from public, anon, authenticated;

-- Fire for a transition into confirmed, and also cover any order inserted already
-- confirmed. Existing pending orders remain pending and do not alert captains yet.
drop trigger if exists notify_food_post_delivery_offer on public.food_post_orders;
create trigger notify_food_post_delivery_offer
after insert or update of status on public.food_post_orders
for each row execute function private.notify_direct_post_captains();

drop trigger if exists notify_apparel_delivery_offer on public.apparel_post_orders;
create trigger notify_apparel_delivery_offer
after insert or update of status on public.apparel_post_orders
for each row execute function private.notify_direct_post_captains();

drop trigger if exists notify_product_post_delivery_offer on public.electronics_post_orders;
create trigger notify_product_post_delivery_offer
after insert or update of status on public.electronics_post_orders
for each row execute function private.notify_direct_post_captains();

-- Catch up already-confirmed, still-unassigned offers for approved captains who
-- were missing from user_roles. This only adds notifications; it does not alter
-- the existing orders or their financial state.
with open_offers as (
  select
    id as order_id,
    'food_post_order'::text as entity_type,
    'food_post'::text as order_type,
    order_number,
    post_title,
    delivery_city,
    'خواردن'::text as category
  from public.food_post_orders
  where status = 'confirmed' and delivery_status = 'pending' and captain_id is null

  union all

  select
    id,
    'apparel_post_order',
    'apparel_post',
    order_number,
    post_title,
    delivery_city,
    'جل‌وبەرگ'
  from public.apparel_post_orders
  where status = 'confirmed' and delivery_status = 'pending' and captain_id is null

  union all

  select
    id,
    'product_post_order',
    'product_post',
    order_number,
    post_title,
    delivery_city,
    'بەرهەمی بازاڕ'
  from public.electronics_post_orders
  where status = 'confirmed' and delivery_status = 'pending' and captain_id is null
)
insert into public.notifications(
  user_id, type, title_ku, body_ku, title_ar, body_ar,
  title_en, body_en, route, entity_type, entity_id, data
)
select
  ur.user_id,
  'delivery_offer',
  'گەیاندنی نوێ بۆ وەرگرتن',
  'داواکاریی ' || o.category || ' «' || o.post_title || '» لە ' ||
    coalesce(o.delivery_city, 'شارێکی دیارینەکراو') || ' ئامادەیە بۆ وەرگرتن.',
  'عرض توصيل جديد',
  'طلب جديد بانتظار كابتن للتوصيل.',
  'New delivery offer',
  'A confirmed order is ready for captain pickup.',
  '/dashboard/deliveries',
  o.entity_type,
  o.order_id,
  jsonb_build_object(
    'order_number', o.order_number,
    'order_type', o.order_type,
    'city', o.delivery_city,
    'post_title', o.post_title
  )
from open_offers o
cross join public.user_roles ur
where ur.role::text = 'captain'
  and not exists (
    select 1
    from public.notifications existing
    where existing.user_id = ur.user_id
      and existing.type = 'delivery_offer'
      and existing.entity_type = o.entity_type
      and existing.entity_id = o.order_id
  );

notify pgrst, 'reload schema';
commit;
