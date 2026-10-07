-- Customer phone is mandatory at signup and before checkout.
-- New pending deliveries are offered to all captains; the first captain to claim wins atomically.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
check (type in ('order_created','order_status','delivery_assigned','delivery_status','delivery_offer','payment_status','system'));

insert into public.permissions(code, description) values
  ('deliveries.claim','Claim an unassigned delivery offer')
on conflict (code) do update set description=excluded.description;

insert into public.role_permissions(role, permission_code)
values ('captain'::public.app_role,'deliveries.claim')
on conflict do nothing;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_full_name text := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name','')), '');
  v_phone text := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone','')), '');
begin
  if v_phone is null or length(regexp_replace(v_phone, '[^0-9+]', '', 'g')) < 8 then
    raise exception 'Mobile number is required';
  end if;
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email, v_full_name, v_phone)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone);
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer'::public.app_role)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create or replace function private.create_checkout_internal(
  p_customer_id uuid,
  p_idempotency_key text,
  p_delivery_address text,
  p_delivery_lat numeric,
  p_delivery_lng numeric,
  p_customer_note text,
  p_payment_method public.payment_method
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_existing public.checkout_sessions%rowtype;
  v_cart_id uuid;
  v_checkout_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_item record;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_store_id uuid;
  v_store_subtotal numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_delivery_fee numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_price numeric(14,2);
  v_order_count integer := 0;
  v_order_ids jsonb := '[]'::jsonb;
begin
  if p_customer_id is null then
    raise exception 'Not authenticated';
  end if;
  if (select p.phone from public.profiles p where p.id=p_customer_id) is null
     or length(regexp_replace((select p.phone from public.profiles p where p.id=p_customer_id), '[^0-9+]', '', 'g')) < 8 then
    raise exception 'Mobile number is required before placing an order';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(btrim(p_idempotency_key)) > 128 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_delivery_address is null or length(btrim(p_delivery_address)) < 5 then
    raise exception 'Delivery address is required';
  end if;
  if p_payment_method not in ('cash_on_delivery','mobile_cash') then
    raise exception 'Unsupported payment method';
  end if;
  select * into v_existing from public.checkout_sessions where customer_id=p_customer_id and idempotency_key=p_idempotency_key limit 1;
  if found then
    return jsonb_build_object('checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,'total_iqd',v_existing.total_iqd);
  end if;
  select c.id into v_cart_id from public.carts c where c.user_id=p_customer_id limit 1;
  if v_cart_id is null or not exists(select 1 from public.cart_items ci where ci.cart_id=v_cart_id) then raise exception 'Cart is empty'; end if;

  insert into public.checkout_sessions(customer_id,idempotency_key,payment_method,delivery_address,delivery_lat,delivery_lng,customer_note)
  values(p_customer_id,p_idempotency_key,p_payment_method,btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),''))
  returning id into v_checkout_id;

  for v_item in select ci.id,ci.product_id,ci.variant_id,ci.quantity from public.cart_items ci where ci.cart_id=v_cart_id order by ci.id for update loop
    select * into v_product from public.products p where p.id=v_item.product_id for update;
    if not found or v_product.status<>'active' then raise exception 'Product is not available'; end if;
    if not exists(select 1 from public.stores s where s.id=v_product.store_id and s.status='active') then raise exception 'Store is not available'; end if;
    if v_item.variant_id is not null then
      select * into v_variant from public.product_variants pv where pv.id=v_item.variant_id and pv.product_id=v_item.product_id for update;
      if not found or v_variant.is_active is not true then raise exception 'Product variant is not available'; end if;
      if v_item.quantity>v_variant.stock_quantity then raise exception 'Insufficient variant stock'; end if;
      v_price:=coalesce(v_variant.price_iqd,v_product.base_price_iqd);
    else
      if v_item.quantity>v_product.stock_quantity then raise exception 'Insufficient product stock'; end if;
      v_price:=v_product.base_price_iqd;
    end if;
    if v_store_id is null then
      v_store_id:=v_product.store_id; v_store_subtotal:=v_price*v_item.quantity;
    elsif v_product.store_id=v_store_id then
      v_store_subtotal:=v_store_subtotal+(v_price*v_item.quantity);
    else
      v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
      insert into public.orders(checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,total_iqd,currency,delivery_address,delivery_lat,delivery_lng,customer_note)
      values(v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,0,v_store_subtotal,'IQD',btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),''))
      returning id into v_order_id;
      insert into public.deliveries(order_id,status) values(v_order_id,'pending');
      v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number,'store_id',v_store_id));
      v_order_count:=v_order_count+1;
      v_store_id:=v_product.store_id; v_store_subtotal:=v_price*v_item.quantity;
    end if;
    v_subtotal:=v_subtotal+(v_price*v_item.quantity);
  end loop;

  if v_store_id is not null then
    v_order_number:='SHK-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
    insert into public.orders(checkout_session_id,order_number,customer_id,store_id,status,subtotal_iqd,delivery_fee_iqd,total_iqd,currency,delivery_address,delivery_lat,delivery_lng,customer_note)
    values(v_checkout_id,v_order_number,p_customer_id,v_store_id,'pending',v_store_subtotal,0,v_store_subtotal,'IQD',btrim(p_delivery_address),p_delivery_lat,p_delivery_lng,nullif(btrim(p_customer_note),''))
    returning id into v_order_id;
    insert into public.deliveries(order_id,status) values(v_order_id,'pending');
    v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number,'store_id',v_store_id));
    v_order_count:=v_order_count+1;
  end if;

  for v_item in select ci.id,ci.product_id,ci.variant_id,ci.quantity from public.cart_items ci where ci.cart_id=v_cart_id order by ci.id loop
    select p.* into v_product from public.products p where p.id=v_item.product_id for update;
    if v_item.variant_id is not null then
      select pv.* into v_variant from public.product_variants pv where pv.id=v_item.variant_id and pv.product_id=v_item.product_id for update;
      v_price:=coalesce(v_variant.price_iqd,v_product.base_price_iqd);
      update public.product_variants set stock_quantity=stock_quantity-v_item.quantity where id=v_item.variant_id;
    else
      v_price:=v_product.base_price_iqd;
      update public.products set stock_quantity=stock_quantity-v_item.quantity where id=v_item.product_id;
    end if;
    select o.id into v_order_id from public.orders o where o.checkout_session_id=v_checkout_id and o.store_id=v_product.store_id limit 1;
    insert into public.order_items(order_id,product_id,variant_id,product_name_ku,product_name_ar,product_name_en,quantity,unit_price_iqd,line_total_iqd)
    values(v_order_id,v_item.product_id,v_item.variant_id,v_product.name_ku,v_product.name_ar,v_product.name_en,v_item.quantity,v_price,v_price*v_item.quantity);
  end loop;

  v_total:=v_subtotal+v_delivery_fee;
  update public.checkout_sessions set subtotal_iqd=v_subtotal,delivery_fee_iqd=v_delivery_fee,total_iqd=v_total,status='pending' where id=v_checkout_id;
  insert into public.payments(checkout_session_id,customer_id,method,status,amount_iqd) values(v_checkout_id,p_customer_id,p_payment_method,'pending',v_total);
  delete from public.cart_items where cart_id=v_cart_id;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(p_customer_id,'checkout.created','checkout_session',v_checkout_id::text,jsonb_build_object('order_count',v_order_count,'payment_method',p_payment_method,'total_iqd',v_total));
  return jsonb_build_object('checkout_id',v_checkout_id,'status','pending','payment_method',p_payment_method,'subtotal_iqd',v_subtotal,'delivery_fee_iqd',v_delivery_fee,'total_iqd',v_total,'orders',v_order_ids);
exception when unique_violation then
  select * into v_existing from public.checkout_sessions where customer_id=p_customer_id and idempotency_key=p_idempotency_key limit 1;
  if found then return jsonb_build_object('checkout_id',v_existing.id,'status',v_existing.status,'payment_method',v_existing.payment_method,'subtotal_iqd',v_existing.subtotal_iqd,'delivery_fee_iqd',v_existing.delivery_fee_iqd,'total_iqd',v_existing.total_iqd); end if;
  raise;
end;
$$;


create or replace function private.can_view_delivery(p_delivery_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1 from public.deliveries d
    join public.orders o on o.id=d.order_id
    where d.id=$1
      and (
        o.customer_id=(select auth.uid())
        or exists(select 1 from public.stores s where s.id=o.store_id and s.owner_id=(select auth.uid()))
        or d.captain_id=(select auth.uid())
        or (d.captain_id is null and d.status='pending'
            and exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='captain'))
        or (select private.has_permission('deliveries.view_all'))
      )
  );
$$;
revoke all on function private.can_view_delivery(uuid) from public, anon, authenticated;
grant execute on function private.can_view_delivery(uuid) to authenticated;

create or replace function private.validate_delivery_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare caller_role public.app_role;
begin
  select ur.role into caller_role from public.user_roles ur where ur.user_id=(select auth.uid());

  if caller_role='captain'::public.app_role then
    if not (
      old.status='pending' and old.captain_id is null
      and new.status='assigned'
      and new.captain_id=(select auth.uid())
      and new.assigned_by is null
    ) then
      if new.order_id is distinct from old.order_id
        or new.captain_id is distinct from old.captain_id
        or new.assigned_by is distinct from old.assigned_by
        or new.assigned_at is distinct from old.assigned_at
        or new.accepted_at is distinct from old.accepted_at
        or new.picked_up_at is distinct from old.picked_up_at
        or new.on_the_way_at is distinct from old.on_the_way_at
        or new.arrived_at is distinct from old.arrived_at
        or new.delivered_at is distinct from old.delivered_at
        or new.failed_at is distinct from old.failed_at
        or new.cancelled_at is distinct from old.cancelled_at
        or new.dispatch_note is distinct from old.dispatch_note then
        raise exception 'Captains can update only delivery status, location and captain note';
      end if;
    end if;
  end if;

  if new.status <> old.status then
    if old.status='pending' and new.status<>'assigned' then
      if not ((select private.has_permission('deliveries.assign')) and new.status='cancelled')
         and not (caller_role='captain' and new.status='assigned' and old.captain_id is null and new.captain_id=(select auth.uid())) then
        raise exception 'Invalid delivery transition from pending';
      end if;
    elsif old.status='assigned' and new.status not in ('accepted','cancelled') then raise exception 'Invalid delivery transition from assigned';
    elsif old.status='accepted' and new.status not in ('picked_up','cancelled','failed') then raise exception 'Invalid delivery transition from accepted';
    elsif old.status='picked_up' and new.status<>'on_the_way' then raise exception 'Invalid delivery transition from picked_up';
    elsif old.status='on_the_way' and new.status not in ('arrived','failed','cancelled') then raise exception 'Invalid delivery transition from on_the_way';
    elsif old.status='arrived' and new.status not in ('delivered','failed','cancelled') then raise exception 'Invalid delivery transition from arrived';
    elsif old.status in ('delivered','failed','cancelled') then raise exception 'Completed delivery cannot change status';
    end if;
  end if;

  if new.status='assigned' and old.status<>'assigned' then new.assigned_at:=coalesce(new.assigned_at,now());
  elsif new.status='accepted' and old.status<>'accepted' then new.accepted_at:=coalesce(new.accepted_at,now());
  elsif new.status='picked_up' and old.status<>'picked_up' then new.picked_up_at:=coalesce(new.picked_up_at,now());
  elsif new.status='on_the_way' and old.status<>'on_the_way' then new.on_the_way_at:=coalesce(new.on_the_way_at,now());
  elsif new.status='arrived' and old.status<>'arrived' then new.arrived_at:=coalesce(new.arrived_at,now());
  elsif new.status='delivered' and old.status<>'delivered' then new.delivered_at:=coalesce(new.delivered_at,now());
  elsif new.status='failed' and old.status<>'failed' then new.failed_at:=coalesce(new.failed_at,now());
  elsif new.status='cancelled' and old.status<>'cancelled' then new.cancelled_at:=coalesce(new.cancelled_at,now());
  end if;

  if new.status='delivered' then
    update public.orders set status='delivered' where id=new.order_id;
  elsif new.status='on_the_way' then
    update public.orders set status='out_for_delivery' where id=new.order_id and status not in ('delivered','cancelled');
  elsif new.status in ('cancelled','failed') then
    update public.orders set status='cancelled' where id=new.order_id and status<>'delivered';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_delivery_transition() from public, anon, authenticated;

drop policy if exists "deliveries_update_scoped" on public.deliveries;
create policy "deliveries_update_scoped"
on public.deliveries for update to authenticated
using (
  (select private.has_permission('deliveries.assign'))
  or (captain_id=(select auth.uid()) and (select private.has_permission('deliveries.status_update')))
  or (captain_id is null and status='pending' and (select private.has_permission('deliveries.claim')))
)
with check (
  ((select private.has_permission('deliveries.assign')) and (
    captain_id is null
    or exists(select 1 from public.user_roles ur where ur.user_id=captain_id and ur.role='captain')
  ))
  or (captain_id=(select auth.uid()) and (select private.has_permission('deliveries.status_update')))
  or (captain_id=(select auth.uid()) and status='assigned' and (select private.has_permission('deliveries.claim')))
);

create or replace function public.claim_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare v_delivery public.deliveries%rowtype;
begin
  if not (select private.has_permission('deliveries.claim')) then
    raise exception 'Delivery claim is not permitted';
  end if;
  update public.deliveries
  set captain_id=(select auth.uid()), status='assigned', assigned_by=null, assigned_at=now()
  where id=p_delivery_id and status='pending' and captain_id is null
  returning * into v_delivery;
  if not found then raise exception 'Delivery is no longer available'; end if;
  return jsonb_build_object('id',v_delivery.id,'order_id',v_delivery.order_id,'captain_id',v_delivery.captain_id,'status',v_delivery.status);
end;
$$;
revoke all on function public.claim_delivery(uuid) from public, anon;
grant execute on function public.claim_delivery(uuid) to authenticated;

create or replace function private.notify_delivery_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_customer_id uuid;
  v_order_number text;
  v_status_text text;
  v_captain_id uuid;
begin
  select o.customer_id,o.order_number into v_customer_id,v_order_number
  from public.orders o where o.id=new.order_id;

  if tg_op='INSERT' then
    if new.captain_id is not null then
      perform private.create_notification(new.captain_id,'delivery_assigned',
        'گەیاندنێکی نوێ بۆ تۆ دیاریکرا','کاپتن، داواکاری '||coalesce(v_order_number,'')||' بۆ تۆ دیاریکرا.',
        'تم تعيين توصيل جديد لك','تم تعيين الطلب '||coalesce(v_order_number,'')||' لك.',
        'New delivery assigned','Order '||coalesce(v_order_number,'')||' was assigned to you.',
        '/dashboard/deliveries','delivery',new.id,
        jsonb_build_object('delivery_id',new.id,'order_id',new.order_id,'order_number',v_order_number,'status',new.status));
    else
      for v_captain_id in select ur.user_id from public.user_roles ur where ur.role='captain'::public.app_role loop
        perform private.create_notification(v_captain_id,'delivery_offer',
          'داواکارییەکی نوێ بەردەستە','کاپتن، داواکاری '||coalesce(v_order_number,'')||' ئێستا بەردەستە بۆ وەرگرتن.',
          'طلب توصيل جديد متاح','الطلب '||coalesce(v_order_number,'')||' متاح الآن للاستلام.',
          'New delivery available','Order '||coalesce(v_order_number,'')||' is available to claim.',
          '/dashboard/deliveries','delivery',new.id,
          jsonb_build_object('delivery_id',new.id,'order_id',new.order_id,'order_number',v_order_number,'status',new.status));
      end loop;
    end if;
  elsif tg_op='UPDATE' then
    if new.captain_id is distinct from old.captain_id and new.captain_id is not null then
      perform private.create_notification(new.captain_id,'delivery_assigned',
        'گەیاندنێکی نوێ بۆ تۆ دیاریکرا','کاپتن، داواکاری '||coalesce(v_order_number,'')||' بۆ تۆ دیاریکرا.',
        'تم تعيين توصيل جديد لك','تم تعيين الطلب '||coalesce(v_order_number,'')||' لك.',
        'New delivery assigned','Order '||coalesce(v_order_number,'')||' was assigned to you.',
        '/dashboard/deliveries','delivery',new.id,
        jsonb_build_object('delivery_id',new.id,'order_id',new.order_id,'order_number',v_order_number,'status',new.status));
    end if;

    if new.status is distinct from old.status then
      v_status_text:=new.status::text;
      if v_customer_id is not null then
        perform private.create_notification(v_customer_id,'delivery_status',
          'دۆخی گەیاندن گۆڕدرا','دۆخی گەیاندنی داواکاری '||coalesce(v_order_number,'')||': '||v_status_text,
          'تم تحديث حالة التوصيل','حالة توصيل الطلب '||coalesce(v_order_number,'')||': '||v_status_text,
          'Delivery status updated','Delivery for order '||coalesce(v_order_number,'')||' is now: '||v_status_text,
          '/orders/'||new.order_id::text,'delivery',new.id,
          jsonb_build_object('delivery_id',new.id,'order_id',new.order_id,'order_number',v_order_number,'status',new.status));
      end if;
      if new.captain_id is not null then
        perform private.create_notification(new.captain_id,'delivery_status',
          'دۆخی گەیاندن گۆڕدرا','دۆخی گەیاندنی داواکاری '||coalesce(v_order_number,'')||': '||v_status_text,
          'تم تحديث حالة التوصيل','حالة توصيل الطلب '||coalesce(v_order_number,'')||': '||v_status_text,
          'Delivery status updated','Delivery for order '||coalesce(v_order_number,'')||' is now: '||v_status_text,
          '/dashboard/deliveries','delivery',new.id,
          jsonb_build_object('delivery_id',new.id,'order_id',new.order_id,'order_number',v_order_number,'status',new.status));
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_delivery_changes() from public, anon, authenticated;

drop policy if exists "deliveries_select_scoped" on public.deliveries;
create policy "deliveries_select_scoped"
on public.deliveries for select to authenticated
using ((select private.can_view_delivery(id)));

-- The remote database already contains these definitions from migrations
-- 20261007180348 and 20261007180454; this file is the authoritative source
-- for the final state and is safe for a fresh migration replay.
