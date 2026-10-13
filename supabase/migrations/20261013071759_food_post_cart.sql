-- Authenticated customers can keep restaurant posts in a separate cart.
-- Checkout delegates each line to the existing authoritative food-order RPC.
create table public.food_post_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

alter table public.food_post_cart_items enable row level security;
revoke all on table public.food_post_cart_items from public, anon, authenticated;
grant select, insert, update, delete on table public.food_post_cart_items to authenticated;

create policy "Customers read their food post cart"
on public.food_post_cart_items for select to authenticated
using (user_id = (select auth.uid()));

create policy "Customers add eligible food posts to their cart"
on public.food_post_cart_items for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.has_permission('checkout.create'))
  and exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.author_id <> (select auth.uid())
      and p.category = 'food'::public.post_category
      and p.status = 'active'::public.post_status
      and p.price_iqd > 0
  )
);

create policy "Customers update their food post cart"
on public.food_post_cart_items for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (select private.has_permission('checkout.create'))
  and exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.author_id <> (select auth.uid())
      and p.category = 'food'::public.post_category
      and p.status = 'active'::public.post_status
      and p.price_iqd > 0
  )
);

create policy "Customers remove their food post cart items"
on public.food_post_cart_items for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.add_food_post_to_cart(p_post_id uuid, p_quantity integer default 1)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.food_post_cart_items;
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

create or replace function public.checkout_food_post_cart(
  p_delivery_address text,
  p_buyer_phone text,
  p_delivery_city text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_order jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;

  for v_item in
    select id, post_id, quantity
    from public.food_post_cart_items
    where user_id = v_user_id
    order by created_at, id
    for update
  loop
    v_order := public.create_food_post_order(
      v_item.id,
      v_item.post_id,
      v_item.quantity,
      p_delivery_address,
      p_buyer_phone,
      p_delivery_city,
      p_customer_note,
      p_payment_method
    );
    v_orders := v_orders || jsonb_build_array(v_order);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception using errcode = '22023', message = 'Food post cart is empty';
  end if;

  delete from public.food_post_cart_items where user_id = v_user_id;
  return jsonb_build_object('orders', v_orders, 'count', v_count);
end;
$function$;

revoke all on function public.checkout_food_post_cart(text, text, text, text, text) from public, anon;
grant execute on function public.checkout_food_post_cart(text, text, text, text, text) to authenticated;
