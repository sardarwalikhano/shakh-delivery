-- Ensure rejected apparel-post orders restore inventory just like buyer/seller cancellations.
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

  if (p_status='cancelled' and v_order.status in ('pending','confirmed'))
     or (p_status='rejected' and v_order.status in ('pending','confirmed')) then
    update public.apparel_variants set stock_quantity=stock_quantity+v_order.quantity where id=v_order.variant_id;
  end if;
  update public.apparel_post_orders set status=p_status where id=p_order_id;
  return jsonb_build_object('id',p_order_id,'status',p_status);
end;
$$;
revoke all on function public.update_apparel_post_order_status(uuid,text) from public, anon;
grant execute on function public.update_apparel_post_order_status(uuid,text) to authenticated;
