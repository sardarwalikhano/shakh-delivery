create type public.checkout_status as enum ('pending','completed','cancelled');
create type public.payment_method as enum ('cash_on_delivery','mobile_cash');
create type public.payment_status as enum ('pending','paid','failed','refunded','cancelled');

alter table public.orders
  add column checkout_session_id uuid;

create sequence public.order_number_seq start 1;

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  status public.checkout_status not null default 'pending',
  payment_method public.payment_method not null,
  subtotal_iqd numeric(14,2) not null default 0,
  delivery_fee_iqd numeric(14,2) not null default 0,
  total_iqd numeric(14,2) not null default 0,
  currency text not null default 'IQD',
  delivery_address text not null,
  delivery_lat numeric(9,6),
  delivery_lng numeric(9,6),
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_totals_nonnegative check (subtotal_iqd >= 0 and delivery_fee_iqd >= 0 and total_iqd >= 0),
  constraint checkout_total_consistency check (total_iqd = subtotal_iqd + delivery_fee_iqd),
  constraint checkout_currency_iqd check (currency = 'IQD')
);

create unique index checkout_customer_idempotency_unique
  on public.checkout_sessions(customer_id, idempotency_key);

alter table public.orders
  add constraint orders_checkout_session_fk
  foreign key (checkout_session_id) references public.checkout_sessions(id) on delete restrict;

create index orders_checkout_session_idx on public.orders(checkout_session_id);
create index checkout_sessions_customer_idx on public.checkout_sessions(customer_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null unique references public.checkout_sessions(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  amount_iqd numeric(14,2) not null,
  provider text,
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amount_positive check (amount_iqd >= 0)
);

create index payments_customer_idx on public.payments(customer_id, created_at desc);
create index payments_status_idx on public.payments(status, created_at desc);
create unique index payments_provider_reference_unique
  on public.payments(provider, provider_reference)
  where provider is not null and provider_reference is not null;

create trigger checkout_sessions_set_updated_at
before update on public.checkout_sessions
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

insert into public.permissions(code, description) values
  ('checkout.create', 'Create a checkout from the current cart'),
  ('checkout.view_own', 'View own checkout sessions'),
  ('payments.view_own', 'View own payments'),
  ('payments.manage', 'Manage payment lifecycle')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role, permission_code)
select v.role, v.permission_code
from (values
  ('customer'::public.app_role,'checkout.create'),
  ('customer'::public.app_role,'checkout.view_own'),
  ('customer'::public.app_role,'payments.view_own'),
  ('super_admin'::public.app_role,'payments.manage'),
  ('admin'::public.app_role,'payments.manage')
) v(role, permission_code)
on conflict do nothing;

alter table public.checkout_sessions enable row level security;
alter table public.payments enable row level security;

create policy "checkout_sessions_select_own"
on public.checkout_sessions
for select
 to authenticated
using ((select auth.uid()) = customer_id);

create policy "payments_select_own_or_managed"
on public.payments
for select
to authenticated
using (
  (select auth.uid()) = customer_id
  or (select private.has_permission('payments.manage'))
);

revoke insert, update, delete on public.checkout_sessions from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;

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

revoke all on function private.create_checkout_internal(uuid,text,text,numeric,numeric,text,public.payment_method) from public, anon, authenticated;
