create type public.order_status as enum (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled'
);

create type public.delivery_status as enum (
  'pending',
  'assigned',
  'accepted',
  'picked_up',
  'on_the_way',
  'arrived',
  'delivered',
  'failed',
  'cancelled'
);

insert into public.permissions (code, description) values
  ('orders.view_all', 'View all orders across stores'),
  ('deliveries.view_all', 'View all deliveries across the platform'),
  ('deliveries.assign', 'Assign and dispatch deliveries'),
  ('deliveries.accept', 'Accept an assigned delivery'),
  ('deliveries.status_update', 'Update the operational status of an assigned delivery')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role, permission_code)
select r.role, p.code
from (
  values
    ('super_admin'::public.app_role),
    ('admin'::public.app_role),
    ('support'::public.app_role),
    ('captain'::public.app_role),
    ('restaurant_vendor'::public.app_role),
    ('fashion_vendor'::public.app_role),
    ('car_dealer'::public.app_role),
    ('umrah_agency'::public.app_role),
    ('customer'::public.app_role)
) r(role)
cross join public.permissions p
where (r.role = 'super_admin'::public.app_role and p.code in ('orders.view_all','deliveries.view_all','deliveries.assign','deliveries.accept','deliveries.status_update'))
   or (r.role = 'admin'::public.app_role and p.code in ('orders.view_all','deliveries.view_all','deliveries.assign','deliveries.accept','deliveries.status_update'))
   or (r.role = 'support'::public.app_role and p.code in ('orders.view_all','deliveries.view_all'))
   or (r.role = 'captain'::public.app_role and p.code in ('deliveries.accept','deliveries.status_update'))
on conflict do nothing;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  status public.order_status not null default 'pending',
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
  constraint orders_amounts_nonnegative check (
    subtotal_iqd >= 0 and delivery_fee_iqd >= 0 and total_iqd >= 0
  ),
  constraint orders_total_consistency check (total_iqd = subtotal_iqd + delivery_fee_iqd),
  constraint orders_currency_iqd check (currency = 'IQD')
);

create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index orders_store_idx on public.orders(store_id, created_at desc);
create index orders_status_idx on public.orders(status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name_ku text not null,
  product_name_ar text not null,
  product_name_en text not null,
  quantity integer not null,
  unit_price_iqd numeric(14,2) not null,
  line_total_iqd numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_prices_nonnegative check (unit_price_iqd >= 0 and line_total_iqd >= 0),
  constraint order_items_total_consistency check (line_total_iqd = unit_price_iqd * quantity)
);

create index order_items_order_idx on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  captain_id uuid references auth.users(id) on delete set null,
  status public.delivery_status not null default 'pending',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  on_the_way_at timestamptz,
  arrived_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  last_lat numeric(9,6),
  last_lng numeric(9,6),
  last_location_at timestamptz,
  captain_note text,
  dispatch_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deliveries_captain_idx on public.deliveries(captain_id, created_at desc);
create index deliveries_status_idx on public.deliveries(status, created_at desc);
create index deliveries_order_idx on public.deliveries(order_id);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();

create or replace function private.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = $1
      and (
        o.customer_id = (select auth.uid())
        or exists (
          select 1 from public.stores s
          where s.id = o.store_id and s.owner_id = (select auth.uid())
        )
        or exists (
          select 1 from public.deliveries d
          where d.order_id = o.id and d.captain_id = (select auth.uid())
        )
        or (select private.has_permission('orders.view_all'))
      )
  );
$$;

create or replace function private.can_view_delivery(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    where d.id = $1
      and (
        o.customer_id = (select auth.uid())
        or exists (
          select 1 from public.stores s
          where s.id = o.store_id and s.owner_id = (select auth.uid())
        )
        or d.captain_id = (select auth.uid())
        or (select private.has_permission('deliveries.view_all'))
      )
  );
$$;

create or replace function private.validate_delivery_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller_role public.app_role;
begin
  select ur.role into caller_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid());

  if new.status <> old.status then
    if old.status = 'pending' and new.status <> 'assigned' then
      if not ((select private.has_permission('deliveries.assign')) and new.status = 'cancelled') then
        raise exception 'Invalid delivery transition from pending';
      end if;
    elsif old.status = 'assigned' and new.status not in ('accepted','cancelled') then
      raise exception 'Invalid delivery transition from assigned';
    elsif old.status = 'accepted' and new.status not in ('picked_up','cancelled','failed') then
      raise exception 'Invalid delivery transition from accepted';
    elsif old.status = 'picked_up' and new.status <> 'on_the_way' then
      raise exception 'Invalid delivery transition from picked_up';
    elsif old.status = 'on_the_way' and new.status not in ('arrived','failed','cancelled') then
      raise exception 'Invalid delivery transition from on_the_way';
    elsif old.status = 'arrived' and new.status not in ('delivered','failed','cancelled') then
      raise exception 'Invalid delivery transition from arrived';
    elsif old.status in ('delivered','failed','cancelled') then
      raise exception 'Completed delivery cannot change status';
    end if;
  end if;

  if caller_role = 'captain' and new.captain_id is distinct from old.captain_id then
    raise exception 'Captains cannot change delivery assignment';
  end if;

  if new.status = 'assigned' and old.status <> 'assigned' then
    new.assigned_at := coalesce(new.assigned_at, now());
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    new.accepted_at := coalesce(new.accepted_at, now());
  elsif new.status = 'picked_up' and old.status <> 'picked_up' then
    new.picked_up_at := coalesce(new.picked_up_at, now());
  elsif new.status = 'on_the_way' and old.status <> 'on_the_way' then
    new.on_the_way_at := coalesce(new.on_the_way_at, now());
  elsif new.status = 'arrived' and old.status <> 'arrived' then
    new.arrived_at := coalesce(new.arrived_at, now());
  elsif new.status = 'delivered' and old.status <> 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  elsif new.status = 'failed' and old.status <> 'failed' then
    new.failed_at := coalesce(new.failed_at, now());
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  if new.status = 'delivered' then
    update public.orders set status = 'delivered' where id = new.order_id;
  elsif new.status = 'on_the_way' then
    update public.orders set status = 'out_for_delivery' where id = new.order_id and status not in ('delivered','cancelled');
  elsif new.status = 'cancelled' or new.status = 'failed' then
    update public.orders set status = 'cancelled' where id = new.order_id and status not in ('delivered');
  end if;

  return new;
end;
$$;

revoke all on function private.can_view_order(uuid) from public;
revoke all on function private.can_view_delivery(uuid) from public;
revoke all on function private.validate_delivery_transition() from public;
grant execute on function private.can_view_order(uuid) to authenticated;
grant execute on function private.can_view_delivery(uuid) to authenticated;

drop trigger if exists validate_delivery_transition on public.deliveries;
create trigger validate_delivery_transition
before update on public.deliveries
for each row execute function private.validate_delivery_transition();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;

create policy "orders_select_scoped"
on public.orders for select
to authenticated
using ((select private.can_view_order(id)));

create policy "order_items_select_scoped"
on public.order_items for select
to authenticated
using ((select private.can_view_order(order_id)));

create policy "deliveries_select_scoped"
on public.deliveries for select
to authenticated
using ((select private.can_view_delivery(id)));

create policy "deliveries_insert_dispatcher"
on public.deliveries for insert
to authenticated
with check (
  (select private.has_permission('deliveries.assign'))
  and assigned_by = (select auth.uid())
  and (
    captain_id is null
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = captain_id and ur.role = 'captain'
    )
  )
);

create policy "deliveries_update_dispatcher"
on public.deliveries for update
to authenticated
using ((select private.has_permission('deliveries.assign')))
with check (
  (select private.has_permission('deliveries.assign'))
  and (
    captain_id is null
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = captain_id and ur.role = 'captain'
    )
  )
);

create policy "deliveries_update_captain"
on public.deliveries for update
to authenticated
using (
  captain_id = (select auth.uid())
  and (select private.has_permission('deliveries.status_update'))
)
with check (
  captain_id = (select auth.uid())
  and (select private.has_permission('deliveries.status_update'))
);

create policy "profiles_select_dispatch_staff"
on public.profiles for select
to authenticated
using (
  (select private.has_permission('deliveries.view_all'))
  or (select private.has_permission('deliveries.assign'))
  or (select auth.uid()) = id
);

create policy "user_roles_select_dispatch_staff"
on public.user_roles for select
to authenticated
using (
  (select private.has_permission('deliveries.view_all'))
  or (select private.has_permission('deliveries.assign'))
  or (select auth.uid()) = user_id
);

revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
revoke delete on public.deliveries from anon, authenticated;
