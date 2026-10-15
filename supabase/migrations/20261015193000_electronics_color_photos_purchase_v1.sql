-- Electronics color-specific product photos and customer-selected color on direct-post orders.
-- Additive and backward-compatible: existing orders keep NULL selected_color and older
-- electronics listings without a per-color photo map remain readable and purchasable.

begin;

alter table public.electronics_post_orders
  add column if not exists selected_color text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'electronics_post_orders_selected_color_check'
      and conrelid = 'public.electronics_post_orders'::regclass
  ) then
    alter table public.electronics_post_orders
      add constraint electronics_post_orders_selected_color_check
      check (
        selected_color is null
        or selected_color = any (array[
          'black','white','blue','silver','gray','gold','green','red','purple','pink','other'
        ]::text[])
      );
  end if;
end $$;

-- New listings carry both a selected-color list and a final color-to-storage-path map.
-- Legacy listings without a final map are intentionally skipped to avoid breaking their checkout.
create or replace function private.validate_electronics_color_photos()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_colors text[];
  v_color text;
  v_color_map jsonb;
  v_path text;
  v_image_count integer;
begin
  if new.category <> 'electronics'::public.post_category
    or new.status <> 'active'::public.post_status then
    return new;
  end if;

  if not (new.category_details ? 'color_image_paths') then
    -- A staged new multi-color listing has a temporary index map and must not
    -- become active until the API has converted it to uploaded Storage paths.
    if new.category_details ? 'color_image_indexes' then
      raise exception using errcode = '22023', message = 'هەر ڕەنگێک دەبێت وێنەی تایبەتی هەبێت.';
    end if;
    return new;
  end if;

  begin
    v_color_map := (new.category_details->>'color_image_paths')::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'پێوەندی وێنەکانی ڕەنگەکان دروست نییە.';
  end;

  if jsonb_typeof(v_color_map) <> 'object' then
    raise exception using errcode = '22023', message = 'پێوەندی وێنەکانی ڕەنگەکان دروست نییە.';
  end if;

  if char_length(btrim(coalesce(new.category_details->>'available_colors',''))) > 0 then
    v_colors := string_to_array(new.category_details->>'available_colors', ',');
  else
    v_colors := array[coalesce(new.category_details->>'color','')];
  end if;
  if coalesce(array_length(v_colors, 1), 0) < 1 then
    raise exception using errcode = '22023', message = 'لانیکەم یەک ڕەنگ دیاری بکە.';
  end if;

  v_image_count := case when jsonb_typeof(new.images) = 'array' then jsonb_array_length(new.images) else 0 end;
  if v_image_count < 1 then
    raise exception using errcode = '22023', message = 'بۆ هەر ڕەنگێک وێنەی بەرهەم پێویستە.';
  end if;

  foreach v_color in array v_colors loop
    v_color := btrim(v_color);
    if v_color = '' or not (v_color_map ? v_color) then
      raise exception using errcode = '22023', message = 'بۆ هەر ڕەنگێک وێنەی تایبەتی دیاری بکە.';
    end if;
    v_path := v_color_map->>v_color;
    if v_path is null or btrim(v_path) = ''
      or not exists (
        select 1
        from jsonb_array_elements(new.images) as item(value)
        where item.value->>'storage_path' = v_path
      ) then
      raise exception using errcode = '22023', message = 'وێنەی تایبەتی ڕەنگەکە لە وێنەکانی پۆستدا نییە.';
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function private.validate_electronics_color_photos() from public, anon, authenticated;

drop trigger if exists posts_validate_electronics_color_photos on public.posts;
create trigger posts_validate_electronics_color_photos
  before insert or update of category, category_details, images, status
  on public.posts
  for each row
  execute function private.validate_electronics_color_photos();

-- This wrapper calls the established checkout RPC so stock locking, fee calculation,
-- notifications, idempotency and Share & Earn remain in the existing single transaction.
create or replace function public.create_electronics_post_order_with_color_and_share(
  p_request_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_selected_color text,
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
  v_result jsonb;
  v_order_id uuid;
  v_saved_color text;
  v_allowed_colors text[];
begin
  if p_selected_color is null or char_length(btrim(p_selected_color)) = 0 then
    raise exception using errcode = '22023', message = 'تکایە ڕەنگی بەرهەم هەڵبژێرە.';
  end if;

  -- The old function has an exact nine-argument signature; this avoids duplicating
  -- its sensitive checkout and referral-reward implementation.
  v_result := public.create_electronics_post_order_with_share(
    p_request_id,
    p_post_id,
    p_quantity,
    p_delivery_address,
    p_buyer_phone,
    p_delivery_city,
    p_customer_note,
    p_payment_method,
    p_share_link_id
  );

  v_order_id := nullif(v_result->>'id','')::uuid;
  if v_order_id is null then
    raise exception using errcode = '22023', message = 'نەتوانرا ژمارەی داواکاری پشتڕاست بکرێتەوە.';
  end if;

  select case
    when char_length(btrim(coalesce(p.category_details->>'available_colors',''))) > 0
      then string_to_array(p.category_details->>'available_colors', ',')
    else array[coalesce(p.category_details->>'color','')]
  end
  into v_allowed_colors
  from public.electronics_post_orders o
  join public.posts p on p.id = o.post_id
  where o.id = v_order_id;

  if not found or not exists (
    select 1 from unnest(coalesce(v_allowed_colors, array[]::text[])) as allowed(value)
    where btrim(allowed.value) = btrim(p_selected_color)
  ) then
    raise exception using errcode = '22023', message = 'ئەم ڕەنگە بۆ ئەم بەرهەمە بەردەست نییە.';
  end if;

  update public.electronics_post_orders
  set selected_color = coalesce(selected_color, btrim(p_selected_color))
  where id = v_order_id
    and buyer_id = (select auth.uid())
  returning selected_color into v_saved_color;

  if v_saved_color is null then
    raise exception using errcode = '42501', message = 'نەتوانرا ڕەنگی داواکاری پاشەکەوت بکرێت.';
  end if;

  return v_result || jsonb_build_object('selected_color', v_saved_color);
end;
$function$;

revoke all on function public.create_electronics_post_order_with_color_and_share(uuid,uuid,integer,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.create_electronics_post_order_with_color_and_share(uuid,uuid,integer,text,text,text,text,text,text,uuid) to authenticated;

commit;
