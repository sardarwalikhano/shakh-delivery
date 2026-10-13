-- The cart table has five columns, but the RPC returns only three fields.
-- Use an untyped record so RETURNING can safely describe its smaller result.
create or replace function public.add_food_post_to_cart(p_post_id uuid, p_quantity integer default 1)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item record;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using errcode = '22023', message = 'Quantity must be between 1 and 100';
  end if;

  insert into public.food_post_cart_items(user_id, post_id, quantity)
  values (v_user_id, p_post_id, p_quantity)
  on conflict (user_id, post_id) do update
  set quantity = least(100, public.food_post_cart_items.quantity + excluded.quantity)
  returning id, post_id, quantity into v_item;

  return jsonb_build_object('id', v_item.id, 'post_id', v_item.post_id, 'quantity', v_item.quantity);
end;
$function$;
revoke all on function public.add_food_post_to_cart(uuid, integer) from public, anon;
grant execute on function public.add_food_post_to_cart(uuid, integer) to authenticated;

-- Keep clients that were already open during the previous release working.
-- New clients pass delivery_city explicitly; older ones use the saved profile city.
create or replace function public.create_apparel_post_order(
  p_request_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_address text,
  p_buyer_phone text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_city text;
begin
  select nullif(btrim(profile.city), '') into v_city
  from public.profiles profile
  where profile.id = auth.uid();

  if v_city is null then
    raise exception using errcode = '22023', message = 'Delivery city is missing. Update the app and choose a delivery city.';
  end if;

  return public.create_apparel_post_order(
    p_request_id,
    p_variant_id,
    p_quantity,
    p_delivery_address,
    p_buyer_phone,
    v_city,
    p_customer_note,
    p_payment_method
  );
end;
$function$;
revoke all on function public.create_apparel_post_order(uuid, uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.create_apparel_post_order(uuid, uuid, integer, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

