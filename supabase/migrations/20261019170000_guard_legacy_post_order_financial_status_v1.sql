-- Prevent legacy seller/admin status RPCs from fabricating delivery or COD collection.
-- Direct-post delivery is completed through update_direct_post_delivery_status and
-- payment collection through record_direct_post_payment. Keep existing RPC names
-- and transitions, but require authoritative delivery/payment states before the
-- legacy RPC can set status='delivered'. No historical rows are rewritten.
begin;

create or replace function public.update_apparel_post_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.apparel_post_orders%rowtype;
  v_is_admin boolean;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_status not in ('pending','confirmed','rejected','delivered','cancelled') then
    raise exception using errcode='22023', message='Invalid order status';
  end if;

  select * into v_order from public.apparel_post_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='Order not found'; end if;

  v_is_admin := (select private.has_permission('posts.manage'));

  if v_user_id = v_order.buyer_id then
    if v_order.status <> 'pending' or p_status <> 'cancelled' then
      raise exception using errcode='42501', message='Buyers may only cancel pending orders';
    end if;
  elsif v_user_id = v_order.seller_id or v_is_admin then
    if not (
      (v_order.status = 'pending' and p_status in ('confirmed','rejected','cancelled'))
      or (v_order.status = 'confirmed' and p_status in ('delivered','cancelled'))
    ) then
      raise exception using errcode='22023', message='Invalid apparel order status transition';
    end if;
  else
    raise exception using errcode='42501', message='You cannot manage this order';
  end if;

  if p_status='delivered'
     and (v_order.delivery_status::text is distinct from 'delivered'
          or v_order.payment_status::text is distinct from 'collected') then
    raise exception using errcode='22023',
      message='Complete captain delivery and record payment collection before finalizing this order';
  end if;

  if p_status in ('cancelled','rejected') and v_order.status in ('pending','confirmed') then
    update public.apparel_variants
    set stock_quantity=stock_quantity+v_order.quantity
    where id=v_order.variant_id;
  end if;

  update public.apparel_post_orders
  set status=p_status, updated_at=now()
  where id=p_order_id;

  return jsonb_build_object('id',p_order_id,'status',p_status);
end;
$function$;
revoke all on function public.update_apparel_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_apparel_post_order_status(uuid,text) to authenticated;


create or replace function public.update_electronics_post_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.electronics_post_orders%rowtype;
  v_stock integer;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_status not in ('confirmed','rejected','delivered','cancelled') then
    raise exception using errcode='22023', message='Invalid electronics order status';
  end if;

  select * into v_order from public.electronics_post_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='Electronics post order not found'; end if;

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

  if p_status='delivered'
     and (v_order.delivery_status::text is distinct from 'delivered'
          or v_order.payment_status::text is distinct from 'collected') then
    raise exception using errcode='22023',
      message='Complete captain delivery and record payment collection before finalizing this order';
  end if;

  if p_status in ('rejected','cancelled') and v_order.status in ('pending','confirmed') then
    select coalesce(nullif(category_details->>'stock_quantity','')::integer,0)
      into v_stock
    from public.posts where id=v_order.post_id for update;

    update public.posts
    set category_details=jsonb_set(
      coalesce(category_details,'{}'::jsonb),
      '{stock_quantity}',
      to_jsonb(coalesce(v_stock,0) + v_order.quantity),
      true
    )
    where id=v_order.post_id and category='electronics'::public.post_category;
  end if;

  -- Never infer that cash was collected merely because an order was marked delivered.
  update public.electronics_post_orders
  set status=p_status, updated_at=now()
  where id=p_order_id;

  return jsonb_build_object(
    'id',p_order_id,
    'status',p_status,
    'payment_status',v_order.payment_status
  );
end;
$function$;
revoke all on function public.update_electronics_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_electronics_post_order_status(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
