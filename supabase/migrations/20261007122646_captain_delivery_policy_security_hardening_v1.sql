create index if not exists deliveries_assigned_by_idx on public.deliveries(assigned_by);
create index if not exists order_items_variant_idx on public.order_items(variant_id);

drop policy if exists "deliveries_update_dispatcher" on public.deliveries;
drop policy if exists "deliveries_update_captain" on public.deliveries;

create policy "deliveries_update_scoped"
on public.deliveries for update to authenticated
using (
  (select private.has_permission('deliveries.assign'))
  or (
    captain_id = (select auth.uid())
    and (select private.has_permission('deliveries.status_update'))
  )
)
with check (
  ((select private.has_permission('deliveries.assign')) and (
    captain_id is null
    or exists (select 1 from public.user_roles ur where ur.user_id = captain_id and ur.role = 'captain')
  ))
  or (
    captain_id = (select auth.uid())
    and (select private.has_permission('deliveries.status_update'))
  )
);

drop policy if exists "profiles_select_dispatch_staff" on public.profiles;
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped"
on public.profiles for select to authenticated
using (
  (select auth.uid()) = id
  or (select private.has_permission('deliveries.view_all'))
  or (select private.has_permission('deliveries.assign'))
);

drop policy if exists "user_roles_select_dispatch_staff" on public.user_roles;
drop policy if exists "user_roles_select_scoped" on public.user_roles;
create policy "user_roles_select_scoped"
on public.user_roles for select to authenticated
using (
  (select auth.uid()) = user_id
  or (select private.has_permission('deliveries.view_all'))
  or (select private.has_permission('deliveries.assign'))
);

create or replace function private.validate_delivery_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller_role public.app_role;
begin
  select ur.role into caller_role from public.user_roles ur where ur.user_id = (select auth.uid());

  if caller_role = 'captain'::public.app_role then
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

  if new.status <> old.status then
    if old.status = 'pending' and new.status <> 'assigned' then
      if not ((select private.has_permission('deliveries.assign')) and new.status = 'cancelled') then raise exception 'Invalid delivery transition from pending'; end if;
    elsif old.status = 'assigned' and new.status not in ('accepted','cancelled') then raise exception 'Invalid delivery transition from assigned';
    elsif old.status = 'accepted' and new.status not in ('picked_up','cancelled','failed') then raise exception 'Invalid delivery transition from accepted';
    elsif old.status = 'picked_up' and new.status <> 'on_the_way' then raise exception 'Invalid delivery transition from picked_up';
    elsif old.status = 'on_the_way' and new.status not in ('arrived','failed','cancelled') then raise exception 'Invalid delivery transition from on_the_way';
    elsif old.status = 'arrived' and new.status not in ('delivered','failed','cancelled') then raise exception 'Invalid delivery transition from arrived';
    elsif old.status in ('delivered','failed','cancelled') then raise exception 'Completed delivery cannot change status';
    end if;
  end if;

  if new.status = 'assigned' and old.status <> 'assigned' then new.assigned_at := coalesce(new.assigned_at, now());
  elsif new.status = 'accepted' and old.status <> 'accepted' then new.accepted_at := coalesce(new.accepted_at, now());
  elsif new.status = 'picked_up' and old.status <> 'picked_up' then new.picked_up_at := coalesce(new.picked_up_at, now());
  elsif new.status = 'on_the_way' and old.status <> 'on_the_way' then new.on_the_way_at := coalesce(new.on_the_way_at, now());
  elsif new.status = 'arrived' and old.status <> 'arrived' then new.arrived_at := coalesce(new.arrived_at, now());
  elsif new.status = 'delivered' and old.status <> 'delivered' then new.delivered_at := coalesce(new.delivered_at, now());
  elsif new.status = 'failed' and old.status <> 'failed' then new.failed_at := coalesce(new.failed_at, now());
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  if new.status = 'delivered' then
    update public.orders set status = 'delivered' where id = new.order_id;
  elsif new.status = 'on_the_way' then
    update public.orders set status = 'out_for_delivery' where id = new.order_id and status not in ('delivered','cancelled');
  elsif new.status in ('cancelled','failed') then
    update public.orders set status = 'cancelled' where id = new.order_id and status <> 'delivered';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_delivery_transition() from public;
